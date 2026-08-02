#!/usr/bin/env bun
/**
 * Live traffic TUI for houdinimd.com.
 *
 * Reads the `houdinimd_views` Analytics Engine dataset that worker.ts writes
 * and draws a dense full-screen dashboard on the alternate screen buffer (no
 * scrollback pollution): a braille line chart of activity across the top, a
 * live feed on the left, traffic rollups and top pages on the right.
 * Every feed row is also appended to a local SQLite file (.analytics.db,
 * gitignored) so long-run trends outlive the 90-day Analytics Engine window.
 * Your own visits are dropped by comparing the hash of this machine's public
 * IP against blob3.
 *
 * Two independent ticks, per the free tier's 10k reads/day cap:
 *   - slow tick (--interval, default 15s): the rollup queries (3 queries).
 *   - fast tick (--feed-interval, default 5s): one cheap "what's new since
 *     the last row I saw" query for the live feed.
 * Running this 24/7 would exceed the cap; a multi-hour work session won't.
 *
 * Needs in .env.local:
 *   R2_ACCOUNT_ID      (already there — same Cloudflare account id)
 *   CF_ANALYTICS_TOKEN  API token with Account | Account Analytics | Read
 *
 * Usage:
 *   bun scripts/analytics.ts                    # full-screen TUI, q to quit
 *   bun scripts/analytics.ts --interval 60      # slower rollups
 *   bun scripts/analytics.ts --feed-interval 10 # slower live feed
 *   bun scripts/analytics.ts --window 120       # look back 2h instead of 30min
 *   bun scripts/analytics.ts --once             # print one frame and exit (no alt screen)
 *   bun scripts/analytics.ts --width 132 --height 40  # force a size (for tui-shot.ts)
 *   bun scripts/analytics.ts --keep-mine        # do not filter out this machine
 */

import { Database } from "bun:sqlite";
import { parseArgs, getNumber, rgb } from "./lib/cli";
import { visitorHash } from "../lib/visitor-hash";

const DATASET = "houdinimd_views";
const LIVE_MINUTES = 5; // "on the site now" — a page read plus a little slack
const KINDS = ["human", "agent", "crawler"] as const;
type Kind = (typeof KINDS)[number];
const KIND_ROWS_FILTER = `blob2 IN ('human','agent','crawler')`; // excludes blob2='search' rows
const GAP = " ";
const CHART_H = 6; // rows of braille in the activity chart
const DB_PATH = ".analytics.db";

const args = parseArgs(process.argv.slice(2));
const intervalSec = getNumber(args, "interval", 15);
const feedIntervalSec = getNumber(args, "feed-interval", 5);
const windowMin = getNumber(args, "window", 30);
const forcedWidth = args.values.has("width") ? getNumber(args, "width", 120) : null;
const forcedHeight = args.values.has("height") ? getNumber(args, "height", 34) : null;
const once = args.flags.has("once");

/**
 * Dim-blue palette. Nothing is ever black or white: the darkest ink is a
 * saturated navy (borders), the lightest a desaturated ice blue (content).
 * Headings sit at the muted end of the accent ramp so content reads first.
 */
const p = {
  ink: rgb(198, 211, 232), // primary content
  ink2: rgb(126, 145, 176), // secondary content
  label: rgb(74, 91, 120), // captions, units
  line: rgb(37, 48, 70), // borders
  accent: rgb(76, 143, 219), // main 500 — headings
  human: rgb(9, 121, 105),
  agent: rgb(226, 152, 74),
  crawler: rgb(93, 107, 132),
  err: rgb(217, 100, 122),
};

const accountId = process.env.R2_ACCOUNT_ID;
const token = process.env.CF_ANALYTICS_TOKEN;
if (!accountId || !token) {
  console.error("Missing R2_ACCOUNT_ID or CF_ANALYTICS_TOKEN in .env.local.");
  console.error("Create the token at dash.cloudflare.com → My Profile → API Tokens,");
  console.error("with permission: Account | Account Analytics | Read.");
  process.exit(1);
}

async function query<T>(sql: string): Promise<T[]> {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: sql,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 200)}`);
  return (JSON.parse(text).data ?? []) as T[];
}

/** This machine's public IP, hashed exactly as worker.ts hashes it. */
async function ownIpHash(): Promise<string | null> {
  try {
    const trace = await fetch("https://cloudflare.com/cdn-cgi/trace").then((r) => r.text());
    const ip = trace.match(/^ip=(.+)$/m)?.[1];
    return ip ? visitorHash(ip) : null;
  } catch {
    return null;
  }
}

// ---------- local archive ----------

interface FeedRow { timestamp: string; path: string; kind: string; country: string; bot: string; city: string; visitor: string }
interface SearchRow { timestamp: string; q: string; country: string; category: string; results: string; visitor: string }

/**
 * Analytics Engine keeps 90 days; this keeps everything. The primary key
 * makes re-inserting an overlapping page of feed rows a no-op.
 */
const db = new Database(DB_PATH, { create: true });
db.run("PRAGMA journal_mode = WAL");
db.run(`CREATE TABLE IF NOT EXISTS views (
  ts TEXT NOT NULL, visitor TEXT NOT NULL, path TEXT NOT NULL,
  kind TEXT NOT NULL, country TEXT, city TEXT, bot TEXT,
  PRIMARY KEY (ts, visitor, path)) WITHOUT ROWID`);
const insertRow = db.prepare("INSERT OR IGNORE INTO views VALUES (?,?,?,?,?,?,?)");
const insertRows = db.transaction((rows: FeedRow[]) => {
  for (const r of rows) insertRow.run(r.timestamp, r.visitor ?? "", r.path, r.kind, r.country ?? "", r.city ?? "", r.bot ?? "");
});
const countRows = db.prepare("SELECT COUNT(*) AS n FROM views");

db.run(`CREATE TABLE IF NOT EXISTS searches (
  ts TEXT NOT NULL, visitor TEXT NOT NULL, q TEXT NOT NULL,
  country TEXT, category TEXT, results INTEGER,
  PRIMARY KEY (ts, visitor, q)) WITHOUT ROWID`);
const insertSearch = db.prepare("INSERT OR IGNORE INTO searches VALUES (?,?,?,?,?,?)");
const insertSearches = db.transaction((rows: SearchRow[]) => {
  for (const r of rows) insertSearch.run(r.timestamp, r.visitor ?? "", r.q, r.country ?? "", r.category ?? "", num(r.results));
});
/** Every query that ever found nothing, heaviest first — the content gaps. */
const deadRows = db.prepare(
  "SELECT q, COUNT(*) AS n FROM searches WHERE results = 0 GROUP BY q ORDER BY n DESC, MAX(ts) DESC LIMIT 30",
);
const chainRows = db.prepare("SELECT visitor, ts, q FROM searches WHERE ts > ? ORDER BY visitor, ts");

const CHAIN_GAP_MS = 60_000;

/**
 * One visitor's consecutive searches, ≤60s apart. A chain means the first
 * query failed them even when it returned results — the strongest quality
 * signal in the dataset. Newest chain first.
 */
function refinementChains(hours: number): { ts: string; queries: string[] }[] {
  const out: { ts: string; queries: string[] }[] = [];
  let run: { visitor: string; ts: string; q: string }[] = [];
  const flush = () => {
    if (run.length > 1) out.push({ ts: run[run.length - 1].ts, queries: run.map((r) => r.q) });
    run = [];
  };
  for (const r of chainRows.all(utc(Date.now() - hours * 3600_000)) as { visitor: string; ts: string; q: string }[]) {
    const prev = run[run.length - 1];
    if (prev && (prev.visitor !== r.visitor || Date.parse(r.ts + "Z") - Date.parse(prev.ts + "Z") > CHAIN_GAP_MS)) flush();
    run.push(r);
  }
  flush();
  return out.sort((a, b) => b.ts.localeCompare(a.ts));
}
// `ts` is stored as UTC "YYYY-MM-DD HH:MM:SS", so a plain string compare is a
// chronological one — no strftime, no TEXT-vs-INTEGER affinity surprises.
const sinceRows = db.prepare("SELECT ts FROM views WHERE ts > ?");
const utc = (ms: number) => new Date(ms).toISOString().replace("T", " ").slice(0, 19);

/** `buckets` samples covering the last `windowMin`, oldest first. */
function chartSeries(buckets: number): number[] {
  const now = Date.now();
  const span = windowMin * 60_000;
  const out = new Array(buckets).fill(0);
  for (const r of sinceRows.all(utc(now - span)) as { ts: string }[]) {
    const i = buckets - 1 - Math.floor(((now - Date.parse(r.ts + "Z")) / span) * buckets);
    if (i >= 0 && i < buckets) out[i]++;
  }
  return out;
}

// ---------- text helpers (all padding must be ANSI-aware) ----------

const num = (v: unknown) => Number(v ?? 0);

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}
const vlen = (s: string) => stripAnsi(s).length;

/** Pad a coloured string to `width` visible chars (clips plain if too long). */
function padVis(s: string, width: number): string {
  const len = vlen(s);
  if (len > width) return stripAnsi(s).slice(0, width);
  return s + " ".repeat(width - len);
}

/** Truncate a plain (no-ANSI) label, keeping the tail — URLs read right-to-left. */
function truncate(label: string, width: number): string {
  return label.length > width ? "…" + label.slice(-(width - 1)) : label;
}

/** Every doc path opens with the same 14 chars; they are not information. */
const shortPath = (path: string) => (path.startsWith("/docs/houdini/") ? path.slice(14) : path);

const KIND_COLOUR: Record<Kind, (s: string) => string> = { human: p.human, agent: p.agent, crawler: p.crawler };
/** Each kind also gets its own fill density, so the stacked bars read in mono. */
const KIND_FILL: Record<Kind, string> = { human: "█", agent: "█", crawler: "█" };
const Title = (k: Kind) => k[0].toUpperCase() + k.slice(1);

interface KindRow { kind: string; views: string; visitors: string }
interface PathRow { path: string; kind: string; views: string }

const by = (rows: KindRow[], kind: Kind) => rows.find((r) => r.kind === kind);
const asKind = (k: string): Kind => (KINDS.includes(k as Kind) ? (k as Kind) : "agent");

// ---------- panels: each returns lines sized to `inner` visible chars ----------

/**
 * One window per row: visitors, views, and a stacked bar split by kind.
 * Three rollup panels collapsed into three columns of one dense table.
 */
function trafficPanel(windows: { label: string; rows: KindRow[] }[], inner: number): string[] {
  const total = (rows: KindRow[]) => KINDS.reduce((n, k) => n + num(by(rows, k)?.views), 0);
  const labelW = Math.max(...windows.map((w) => w.label.length));
  // Units live in the header row, not on every number — that width goes to the
  // bars instead. Overrun the `inner` budget and padVis clips the row, which
  // strips its colour along with the overflow.
  const barW = Math.max(4, inner - labelW - 14);
  const rows = [p.label(" ".repeat(labelW) + "visits".padStart(6) + "views".padStart(6))];
  rows.push(...windows.map((w) => {
    const visitors = KINDS.reduce((n, k) => n + num(by(w.rows, k)?.visitors), 0);
    const views = total(w.rows);
    // Each row is normalised to its own total: the bar is a share of traffic,
    // not a volume — 5m always losing to 30m tells you nothing.
    const cells = KINDS.map((k) => (views > 0 ? Math.round((num(by(w.rows, k)?.views) / views) * barW) : 0));
    if (views > 0) {
      // Rounding drift lands on the dominant kind, so the bar always fills.
      const top = cells.indexOf(Math.max(...cells));
      cells[top] += barW - cells.reduce((a, b) => a + b, 0);
    }
    const bar = KINDS.map((k, i) => KIND_COLOUR[k](KIND_FILL[k].repeat(Math.max(0, cells[i])))).join("");
    return p.label(w.label.padEnd(labelW)) + p.ink(String(visitors).padStart(6) + String(views).padStart(6)) + "  " + bar;
  }));
  return rows;
}

function topPathsPanel(rows: PathRow[], inner: number, maxRows: number): string[] {
  // The home page is always the top page — it says nothing. Drop it.
  // Empty, not a placeholder: the caller drops the whole panel and gives the
  // rows to the search widgets instead.
  const shown = rows.filter((r) => r.path !== "/" && num(r.views) > 1).slice(0, maxRows);
  if (shown.length === 0) return [];
  const max = Math.max(1, ...shown.map((r) => num(r.views)));
  const barW = Math.max(3, Math.floor(inner * 0.16));
  const labelW = Math.max(8, inner - 6 - barW - 1);
  return shown.map((r) => {
    const k = asKind(r.kind);
    const fill = Math.max(1, Math.round((num(r.views) / max) * barW));
    return (
      KIND_COLOUR[k](String(num(r.views)).padStart(4)) +
      " " +
      p.ink(padVis(truncate(shortPath(r.path), labelW), labelW)) +
      " " +
      p.line("▄".repeat(fill) + "▁".repeat(barW - fill))
    );
  });
}

/** `17:04:36  Human    │ Paris, FR       /docs/…` — kind, then who, then where. */
function feedPanel(rows: FeedRow[], inner: number, maxRows: number): string[] {
  if (rows.length === 0) return [p.label("waiting for traffic…")];
  const kindW = 7;
  const whoW = 11; // country code, or a bot name — paths need the rest
  const pathW = Math.max(8, inner - 9 - kindW - whoW - 3);
  return rows.slice(0, maxRows).map((r) => {
    const k = asKind(r.kind);
    // Humans get a place, bots get their name; both fall back to the country.
    const who =
      k === "human"
        ? [r.city, r.country].filter(Boolean).join(", ") || "unknown"
        : r.bot || r.country || "unnamed";
    return (
      p.label(new Date(r.timestamp + (r.timestamp.endsWith("Z") ? "" : "Z")).toLocaleTimeString("en-GB")) +
      " " +
      KIND_COLOUR[k](Title(k).padEnd(kindW)) +
      p.line("│ ") +
      KIND_COLOUR[k](padVis(truncate(who, whoW), whoW)) +
      " " +
      p.ink(truncate(shortPath(r.path), pathW))
    );
  });
}

const hhmmss = (ts: string) => new Date(ts + (ts.endsWith("Z") ? "" : "Z")).toLocaleTimeString("en-GB");

/** `17:32:47  vellum grain              →0` — misses in the error colour. */
function recentSearchPanel(rows: SearchRow[], inner: number, maxRows: number): string[] {
  if (rows.length === 0) return [p.label("no searches yet")];
  const qW = Math.max(6, inner - 9 - 5);
  return rows.slice(0, maxRows).map((r) => {
    const n = num(r.results);
    return (
      p.label(hhmmss(r.timestamp)) +
      " " +
      p.ink(padVis(truncate(r.q, qW), qW)) +
      (n === 0 ? p.err("   →0") : p.ink2(`→${n}`.padStart(5)))
    );
  });
}

/** Queries that found nothing, by volume — each row is a content gap. */
function deadQueryPanel(inner: number, maxRows: number): string[] {
  const rows = deadRows.all() as { q: string; n: number }[];
  if (rows.length === 0) return [p.label("every query found something")];
  return rows.slice(0, maxRows).map((r) => p.err(String(r.n).padStart(4)) + " " + p.ink(truncate(r.q, inner - 5)));
}

/** `vellum → vellum grain → grain constraint` — the tail is what they meant. */
function refinementPanel(chains: { ts: string; queries: string[] }[], inner: number, maxRows: number): string[] {
  if (chains.length === 0) return [p.label("no refined searches")];
  return chains.slice(0, maxRows).map((ch) => {
    const tail = ch.queries[ch.queries.length - 1];
    const head = ch.queries.slice(0, -1).join(" → ");
    const room = inner - vlen(tail) - 3;
    return (room > 4 ? p.ink2(truncate(head, room)) + p.line(" → ") : "") + p.ink(truncate(tail, inner));
  });
}

// ---------- braille line chart ----------

// A braille cell is 2 columns × 4 rows of dots; these are the bits per (row, col).
const DOT = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
];

/**
 * Rolling views-per-feed-tick line, newest at the right edge. The line itself
 * is solid; the area beneath it is dithered on a checkerboard, which reads as
 * a tone at terminal resolution without competing with the line.
 */
function chartPanel(pulse: number[], inner: number, rows: number): string[] {
  const pw = inner * 2;
  const ph = rows * 4;
  // One bucket per pixel column is 0/1 noise at this traffic; sample coarsely
  // and interpolate back up so the silhouette reads as a line.
  const src = pulse.slice(-pw);
  const points =
    src.length >= pw || src.length < 2
      ? src
      : Array.from({ length: pw }, (_, i) => {
          const t = (i / (pw - 1)) * (src.length - 1);
          const lo = Math.floor(t);
          const hi = Math.min(src.length - 1, lo + 1);
          return src[lo] + (src[hi] - src[lo]) * (t - lo);
        });
  const max = Math.max(1, ...points);
  const cells: number[] = new Array(inner * rows).fill(0);
  const set = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= pw || y >= ph) return;
    cells[(y >> 2) * inner + (x >> 1)] |= DOT[y & 3][x & 1];
  };

  const offset = pw - points.length; // right-align: history grows leftward
  const yOf = (n: number) => Math.round((1 - n / max) * (ph - 1));
  let prevY: number | null = null;
  points.forEach((n, i) => {
    const x = offset + i;
    const y = yOf(n);
    // Connect to the previous sample so steps read as a line, not a scatter.
    if (prevY !== null) for (let yy = Math.min(prevY, y); yy <= Math.max(prevY, y); yy++) set(x, yy);
    else set(x, y);
    for (let yy = y + 2; yy < ph; yy++) if ((x + yy) % 2 === 0) set(x, yy); // dithered area
    prevY = y;
  });

  const out: string[] = [];
  for (let r = 0; r < rows; r++) {
    let line = "";
    for (let x = 0; x < inner; x++) {
      const bits = cells[r * inner + x];
      line += bits === 0 ? " " : String.fromCharCode(0x2800 + bits);
    }
    // The top third of the chart is the peak; fade the ink downward so the
    // silhouette is what the eye lands on.
    out.push((r < rows / 2 ? p.accent : p.human)(line));
  }
  const empty = points.every((n) => n === 0);
  const caption = `last ${windowMin}m · peak ${empty ? 0 : Math.round(max)}/bucket · ${Math.max(1, Math.round((windowMin * 120) / pw))}s buckets`;
  out.push(p.label(caption) + p.line(" " + "·".repeat(Math.max(0, inner - caption.length - 1))));
  return out;
}

// ---------- layout ----------

/** Box a panel with hairline borders; pad/clip body to exactly `height` lines. */
function box(title: string, lines: string[], width: number, height: number): string[] {
  const inner = width - 4; // "│ " + " │"
  const head = p.line("┌─ ") + title + " ";
  const top = head + p.line("─".repeat(Math.max(0, width - vlen(head) - 1)) + "┐");
  const bottom = p.line("└" + "─".repeat(width - 2) + "┘");
  const body: string[] = [];
  for (let i = 0; i < height - 2; i++) body.push(p.line("│ ") + padVis(lines[i] ?? "", inner) + p.line(" │"));
  return [top, ...body, bottom];
}

/** Join two line-columns side by side; both must already be padded/boxed. */
function hstack(left: string[], right: string[], leftWidth: number): string[] {
  const height = Math.max(left.length, right.length);
  const out: string[] = [];
  for (let i = 0; i < height; i++) out.push(padVis(left[i] ?? "", leftWidth) + GAP + (right[i] ?? ""));
  return out;
}

// One spare column: a glyph in the terminal's last cell triggers pending-wrap
// and the right border goes missing.
const termWidth = () => (forcedWidth ?? process.stdout.columns ?? 120) - 1;
const termHeight = () => forcedHeight ?? process.stdout.rows ?? 34;

// ---------- state, fetch, draw ----------

interface State {
  live: KindRow[];
  recent: KindRow[];
  paths: PathRow[];
  feed: FeedRow[];
  lastFeedTs: string | null;
  searches: SearchRow[];
  lastSearchTs: string | null;
  stored: number;
  lastError: string | null;
}

const legend = KINDS.map((k) => KIND_COLOUR[k](Title(k))).join(p.line(" ∙ "));

/**
 * The right column below Traffic. Top Pages only earns its place once a page
 * has repeat traffic; until then the search widgets take the whole column.
 * Whatever panels are showing split the height evenly.
 */
function stack(state: State, width: number, height: number): string[] {
  const inner = width - 4;
  const chains = refinementChains(24);
  const panels: { title: string; lines: (rows: number) => string[] }[] = []; // titles are pre-coloured
  if (topPathsPanel(state.paths, inner, 1).length > 0) {
    panels.push({ title: p.accent("Top Pages"), lines: (n) => topPathsPanel(state.paths, inner, n) });
  }
  panels.push({ title: p.accent("Recent Searches"), lines: (n) => recentSearchPanel(state.searches, inner, n) });
  panels.push({ title: p.accent("Dead Queries"), lines: (n) => deadQueryPanel(inner, n) });
  panels.push({ title: p.accent("Refined Searches") + p.line(" ") + p.label("24h"), lines: (n) => refinementPanel(chains, inner, n) });

  const each = Math.floor(height / panels.length);
  return panels.flatMap((panel, i) => {
    const h = i === 0 ? height - each * (panels.length - 1) : each; // remainder to the top panel
    return box(panel.title, panel.lines(h - 2), width, h);
  });
}

function frame(state: State, exclude: string | null): string[] {
  const W = termWidth();
  const H = termHeight();

  // Every clock, interval and counter lives on this one line.
  const header =
    " " +
    p.accent("houdinimd.com") +
    p.line("  ·  ") +
    p.ink(new Date().toLocaleTimeString("en-GB")) +
    p.label(`  window ${windowMin}m · rollups ${intervalSec}s · feed ${feedIntervalSec}s · ${state.stored.toLocaleString("en-GB")} archived`) +
    (exclude ? "" : p.label(" · own visits included")) +
    p.label("  ·  ") +
    p.ink2("q") +
    p.label(" quit") +
    (state.lastError ? p.err(`  · ${state.lastError.replace(/\s+/g, " ")}`) : "");

  const chartH = CHART_H + 3; // braille rows + caption + borders
  const trafficH = 5; // header + two windows + borders
  const mainH = Math.max(8, H - 1 - chartH);
  const wide = W >= 96;
  const windows = [
    { label: `Now ${LIVE_MINUTES}m`, rows: state.live },
    { label: `Last ${windowMin}m`, rows: state.recent },
  ];

  const lines: string[] = [header];
  lines.push(...box(p.accent("Activity"), chartPanel(chartSeries(Math.max(8, Math.floor((W - 4) / 2))), W - 4, CHART_H), W, chartH));

  if (wide) {
    const rightW = Math.min(52, Math.max(38, Math.floor(W * 0.36)));
    const leftW = W - rightW - GAP.length;
    lines.push(
      ...hstack(
        box(p.accent("Live Feed"), feedPanel(state.feed, leftW - 4, mainH - 2), leftW, mainH),
        [
          ...box(p.accent("Traffic") + p.line("  ") + legend, trafficPanel(windows, rightW - 4), rightW, trafficH),
          ...stack(state, rightW, mainH - trafficH),
        ],
        leftW,
      ),
    );
  } else {
    lines.push(...box(p.accent("Traffic") + p.line("  ") + legend, trafficPanel(windows, W - 4), W, trafficH));
    const feedH = Math.max(5, mainH - trafficH - 8);
    lines.push(...box(p.accent("Live Feed"), feedPanel(state.feed, W - 4, feedH - 2), W, feedH));
    lines.push(...stack(state, W, Math.max(8, H - lines.length - 1)));
  }

  return lines.slice(0, H).map((l) => padVis(l, W));
}

function draw(state: State, exclude: string | null) {
  const lines = frame(state, exclude);
  if (once) {
    console.log(lines.join("\n"));
  } else {
    // Home the cursor and overwrite in place — no full clears, no flicker.
    process.stdout.write("\x1b[H" + lines.join("\x1b[K\n") + "\x1b[K\x1b[J");
  }
}

// ---------- queries ----------

async function fetchRollups(exclude: string | null) {
  const notMine = exclude ? ` AND blob3 != '${exclude}'` : "";
  const since = (mins: number) => `timestamp > NOW() - INTERVAL '${mins}' MINUTE`;
  const rollup = (mins: number) => `
    SELECT blob2 AS kind, SUM(_sample_interval) AS views, COUNT(DISTINCT index1) AS visitors
    FROM ${DATASET} WHERE ${since(mins)} AND ${KIND_ROWS_FILTER}${notMine} GROUP BY kind`;

  const [live, recent, paths] = await Promise.all([
    query<KindRow>(rollup(LIVE_MINUTES)),
    query<KindRow>(rollup(windowMin)),
    query<PathRow>(`
      SELECT blob1 AS path, blob2 AS kind, SUM(_sample_interval) AS views
      FROM ${DATASET} WHERE ${since(windowMin)} AND ${KIND_ROWS_FILTER}${notMine}
      GROUP BY path, kind ORDER BY views DESC LIMIT 20`),
  ]);
  return { live, recent, paths };
}

/**
 * Rows newer than the last one we've seen — cheap enough to poll fast.
 * The stored timestamp string must go back through toDateTime(): comparing
 * the DateTime column against a bare string literal is a type error in the
 * Analytics Engine SQL dialect.
 */
function tsLiteral(ts: string): string {
  return `toDateTime('${ts.replace("T", " ").replace(/\.\d+/, "").replace("Z", "").slice(0, 19)}')`;
}

function feedQuery(exclude: string | null, since: string, limit: number): Promise<FeedRow[]> {
  const notMine = exclude ? ` AND blob3 != '${exclude}'` : "";
  return query<FeedRow>(`
    SELECT timestamp AS timestamp, blob1 AS path, blob2 AS kind, blob4 AS country,
           blob5 AS bot, blob6 AS city, index1 AS visitor
    FROM ${DATASET} WHERE ${since} AND ${KIND_ROWS_FILTER}${notMine}
    ORDER BY timestamp DESC LIMIT ${limit}`);
}

const fetchFeedIncrement = (exclude: string | null, lastTs: string | null) =>
  feedQuery(exclude, lastTs ? `timestamp > ${tsLiteral(lastTs)}` : `timestamp > NOW() - INTERVAL '${LIVE_MINUTES}' MINUTE`, 30);

/** One query at startup so the chart has a full window, not just this session. */
const fetchWindow = (exclude: string | null) =>
  feedQuery(exclude, `timestamp > NOW() - INTERVAL '${windowMin}' MINUTE`, 2000);

/** Search rows ride the slow tick — they are rare, and the cap is per day. */
function fetchSearches(exclude: string | null, lastTs: string | null): Promise<SearchRow[]> {
  const notMine = exclude ? ` AND blob3 != '${exclude}'` : "";
  const since = lastTs ? `timestamp > ${tsLiteral(lastTs)}` : `timestamp > NOW() - INTERVAL '${windowMin}' MINUTE`;
  return query<SearchRow>(`
    SELECT timestamp AS timestamp, blob1 AS q, blob4 AS country, blob6 AS category,
           double1 AS results, index1 AS visitor
    FROM ${DATASET} WHERE ${since} AND blob2 = 'search'${notMine}
    ORDER BY timestamp DESC LIMIT 200`);
}

// ---------- self-test ----------

function selfTest() {
  const rows: KindRow[] = [
    { kind: "human", views: "3", visitors: "2" },
    { kind: "agent", views: "9", visitors: "1" },
  ];
  console.assert(stripAnsi("\x1b[38;2;1;2;3mx\x1b[0m") === "x", "stripAnsi: strips truecolour SGR");
  console.assert(vlen(p.human("abc")) === 3, "vlen: ignores colour");
  console.assert(padVis(p.human("ab"), 4).endsWith("  "), "padVis: pads to visible width");
  console.assert(tsLiteral("2026-08-02T16:45:03.123Z") === "toDateTime('2026-08-02 16:45:03')", "tsLiteral: DateTime-safe literal");

  const boxed = box(p.accent("T"), ["x"], 20, 4);
  console.assert(boxed.length === 4 && boxed.every((l) => vlen(l) === 20), "box: fixed height, even width");
  console.assert(stripAnsi(boxed[0]).endsWith("┐") && stripAnsi(boxed[1]).endsWith("│"), "box: right border intact");

  const paths: PathRow[] = [
    { path: "/", kind: "human", views: "99" },
    { path: "/docs/a", kind: "human", views: "4" },
  ];
  console.assert(!stripAnsi(topPathsPanel(paths, 40, 5).join("")).includes(" / "), "topPaths: home page excluded");

  const chart = chartPanel([0, 3, 1, 4], 20, 3);
  console.assert(chart.length === 4 && chart.slice(0, 3).every((l) => vlen(l) === 20), "chart: braille rows plus caption");
  console.assert(/[⠀-⣿]/.test(stripAnsi(chart.join(""))), "chart: draws braille");

  const feed = stripAnsi(
    feedPanel([{ timestamp: "2026-08-02T16:45:03Z", path: "/docs/a", kind: "human", country: "FR", bot: "", city: "Paris", visitor: "v" }], 60, 5)[0],
  );
  console.assert(feed.includes("Human") && feed.includes("Paris, FR"), "feed: human shows Title-cased kind and city");
  const bot = stripAnsi(
    feedPanel([{ timestamp: "2026-08-02T16:45:03Z", path: "/docs/a", kind: "agent", country: "US", bot: "ClaudeBot", city: "", visitor: "v" }], 60, 5)[0],
  );
  console.assert(bot.includes("Agent") && bot.includes("ClaudeBot"), "feed: agent shows its bot name");

  const chains = [{ ts: "2026-08-02 16:45:03", queries: ["vellum", "vellum grain"] }];
  console.assert(stripAnsi(refinementPanel(chains, 40, 3)[0]).includes("vellum → vellum grain"), "refine: chain rendered oldest to newest");
  const search: SearchRow[] = [{ timestamp: "2026-08-02T16:45:03Z", q: "pyro", country: "FR", category: "", results: "0", visitor: "v" }];
  console.assert(stripAnsi(recentSearchPanel(search, 40, 3)[0]).includes("→0"), "search: miss marked");

  const f = frame({ live: rows, recent: rows, paths, feed: [], lastFeedTs: null, searches: [], lastSearchTs: null, stored: 7, lastError: "boom" }, "x");
  console.assert(f.every((l) => vlen(l) === termWidth()), "frame: every line exactly terminal width");
  console.assert(f.length <= termHeight(), "frame: fits terminal height");
  console.log("self-test ok");
}

if (args.flags.has("test")) {
  selfTest();
  process.exit(0);
}

// ---------- main ----------

const exclude = args.flags.has("keep-mine") ? null : await ownIpHash();

const state: State = {
  live: [],
  recent: [],
  paths: [],
  feed: [],
  lastFeedTs: null,
  searches: [],
  lastSearchTs: null,
  stored: num(countRows.get()?.n),
  lastError: null,
};

async function tickRollups() {
  try {
    const [rollups, searches] = await Promise.all([fetchRollups(exclude), fetchSearches(exclude, state.lastSearchTs)]);
    Object.assign(state, rollups);
    if (searches.length > 0) {
      insertSearches(searches);
      state.searches = [...searches, ...state.searches].slice(0, 200);
      state.lastSearchTs = searches[0].timestamp;
    }
    state.lastError = null;
  } catch (err) {
    state.lastError = (err as Error).message;
  }
}

async function tickFeed(full = false) {
  try {
    const fresh = full ? await fetchWindow(exclude) : await fetchFeedIncrement(exclude, state.lastFeedTs);
    if (fresh.length > 0) {
      insertRows(fresh);
      state.stored = num(countRows.get()?.n);
      state.feed = [...fresh, ...state.feed].slice(0, 100);
      state.lastFeedTs = fresh[0].timestamp;
    }
    state.lastError = null;
  } catch (err) {
    state.lastError = (err as Error).message;
  }
}

if (once) {
  await Promise.all([tickRollups(), tickFeed(true)]);
  draw(state, exclude);
  process.exit(0);
}

// Real TUI: alternate screen buffer, hidden cursor, raw keys, restore on exit.
function cleanup() {
  process.stdout.write("\x1b[?25h\x1b[?1049l");
}
process.stdout.write("\x1b[?1049h\x1b[?25l\x1b[2J\x1b[H");
process.on("exit", cleanup);
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("data", (key: Buffer) => {
    const k = key.toString();
    if (k === "q" || k === "\x03") process.exit(0); // q or Ctrl+C
  });
}

await Promise.all([tickRollups(), tickFeed(true)]);
draw(state, exclude);
if (!forcedWidth) process.stdout.on("resize", () => draw(state, exclude));

const loop = (which: () => Promise<unknown>, sec: number) =>
  (async () => {
    for (;;) {
      await new Promise((r) => setTimeout(r, sec * 1000));
      await which();
      draw(state, exclude);
    }
  })();
await Promise.all([loop(tickRollups, intervalSec), loop(tickFeed, feedIntervalSec)]);
