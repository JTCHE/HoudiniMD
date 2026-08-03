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
 *   bun scripts/analytics.ts --filter human     # start filtered (see the h/a/c keys)
 *
 * Keys: q quit · h/a/c filter to humans/agents/crawlers (again to clear) ·
 *       j/k or ↑/↓ scroll the live feed · g back to live.
 */

import { Database } from "bun:sqlite";
import { parseArgs, getNumber, rgb } from "./lib/cli";
import { visitorHash } from "../lib/visitor-hash";
import { NO_EVIDENCE, visitorKind } from "../lib/wants-markdown";

const DATASET = "houdinimd_views";
const LIVE_MINUTES = 5; // "on the site now" — a page read plus a little slack
const KINDS = ["human", "agent", "crawler"] as const;
type Kind = (typeof KINDS)[number];

/**
 * Humans are anonymous, which makes a returning visitor invisible in the feed.
 * Give each visitor hash a stable name so the same person reads as the same
 * person. Set false to go back to plain city names.
 */
const NAME_HUMANS = true;
const KIND_ROWS_FILTER = `blob2 IN ('human','agent','crawler')`; // excludes blob2='search' rows
/**
 * How much of the feed is kept in memory to scroll back through. The whole
 * archive, in practice: the point of keeping it is that the history does not
 * stop where this session started.
 */
const FEED_CAP = 20_000;
const GAP = " ";
const CHART_H = 6; // rows of braille in the activity chart
const DB_PATH = ".analytics.db";
// Matches Analytics Engine's own retention, and the promise on /privacy.
const RETENTION_DAYS = 90;

const args = parseArgs(process.argv.slice(2));
const intervalSec = getNumber(args, "interval", 15);
const feedIntervalSec = getNumber(args, "feed-interval", 5);
// The chart, the "Last …" traffic row and the Top Pages query all read this.
// ← and → walk it along WINDOW_LADDER; --window sets where it starts.
let windowMin = getNumber(args, "window", 30);
const forcedWidth = args.values.has("width") ? getNumber(args, "width", 120) : null;
const forcedHeight = args.values.has("height") ? getNumber(args, "height", 34) : null;
const once = args.flags.has("once");
// The h/a/c keys can't be pressed in --once mode, and tui-shot.ts draws one
// frame — this is the same filter, for a screenshot or a piped frame.
const startFilter = KINDS.find((k) => k === args.values.get("filter")) ?? null;

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
// Must be byte-identical to the Worker secret, or "my own visits" resolves to a
// hash the dataset has never seen and the operator filter silently does nothing.
const visitorSalt = process.env.VISITOR_SALT;
if (!visitorSalt) {
  console.error("Missing VISITOR_SALT in .env.local.");
  console.error("It must match the Worker secret: wrangler secret put VISITOR_SALT");
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
    return ip ? visitorHash(ip, visitorSalt) : null;
  } catch {
    return null;
  }
}

// ---------- local archive ----------

/**
 * One row of the live feed. Page views and searches share it: the worker
 * writes both into one dataset, and the feed is the whole story of a visit —
 * what someone asked for as well as what they opened.
 *
 * `kind` is "search" for the second sort, which is why the reused blob columns
 * are named for what a page view puts in them. A search row reads `q`, `dest`
 * and `results` instead of `path`, `evidence` and `status`.
 */
interface FeedRow {
  timestamp: string;
  path: string;
  kind: string;
  country: string;
  bot: string;
  city: string;
  visitor: string;
  evidence?: string;
  status?: string;
  referrer?: string;
  /** 1 when the raw .md twin was read rather than the page. */
  markdown?: string;
  /** Search rows only — the query, where it landed, and how it was submitted. */
  q?: string;
  dest?: string;
  source?: string;
  results?: string;
}
/** A feed row is a search when the worker marked it one. */
const isSearch = (r: FeedRow) => r.kind === "search";

/**
 * What referrerHost() in worker.ts writes when the visitor followed a link
 * inside the site. It is not a referring site, so the Referrers panel skips it;
 * the feed uses it to tell reading on from arriving.
 */
const SELF_REFERRER = "self";
const isInSite = (r: FeedRow) => !isSearch(r) && r.referrer === SELF_REFERRER;

/**
 * The kind a search row counts as. Nothing measures headers on a search, so it
 * is judged by where it was submitted from: the public API is machinery, every
 * other path is a person at a keyboard.
 */
const searchKind = (r: FeedRow): Kind => (r.source === "api" ? "agent" : "human");

/**
 * A page address reduced to its slug, so two spellings of the same page compare
 * equal: a pasted `https://www.sidefx.com/docs/houdini/nodes/sop/box.html`, a
 * `/docs/houdini/nodes/sop/box`, and a bare `houdini/nodes/sop/box` are one page.
 */
function slugOf(s: string): string {
  let v = s.trim().toLowerCase();
  v = v.replace(/^https?:\/\/[^/]+/, "");
  v = v.replace(/^\/?docs\//, "");
  v = v.replace(/\.html(\.md)?$|\.md$/, "");
  return v.replace(/^\/+|\/+$/g, "");
}

/**
 * A "search" whose query IS the page it opened. Both search fields accept a
 * pasted SideFX URL or a bare slug as well as a question, and record whatever
 * was typed — so someone going straight to a page they already knew came out of
 * the dataset labelled "Search", reading `"houdini/nodes/sop/box" → box`. That
 * is a navigation. The query says nothing the destination does not.
 */
const isDirect = (r: FeedRow): boolean => {
  const dest = r.dest ?? "";
  return dest !== "" && slugOf(r.q ?? "") === slugOf(dest);
};

/**
 * A local mirror of the dataset, so the feed and the panels can look further
 * back than the window Analytics Engine was asked for. The primary key makes
 * re-inserting an overlapping page of feed rows a no-op.
 *
 * It holds the same 90 days Analytics Engine holds, and no more. An archive
 * that "keeps everything" is a second, longer-lived copy of the visit history —
 * exactly the thing the privacy page promises does not exist.
 */
const db = new Database(DB_PATH, { create: true });
db.run("PRAGMA journal_mode = WAL");
db.run(`CREATE TABLE IF NOT EXISTS views (
  ts TEXT NOT NULL, visitor TEXT NOT NULL, path TEXT NOT NULL,
  kind TEXT NOT NULL, country TEXT, city TEXT, bot TEXT,
  PRIMARY KEY (ts, visitor, path)) WITHOUT ROWID`);
/**
 * Columns added after the table existed. Every one defaults to the empty
 * string, which each read path treats as "never measured" rather than
 * "measured and empty" — an archive predating a column must not read as a
 * fleet of header-less visitors, or of 404s.
 */
function addColumn(table: string, name: string, decl: string) {
  const columns = db.query(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((c) => c.name === name)) db.run(`ALTER TABLE ${table} ADD COLUMN ${name} ${decl}`);
}
addColumn("views", "evidence", "TEXT NOT NULL DEFAULT ''");
addColumn("views", "status", "TEXT NOT NULL DEFAULT ''");
addColumn("views", "referrer", "TEXT NOT NULL DEFAULT ''");
addColumn("views", "markdown", "TEXT NOT NULL DEFAULT ''");
const insertRow = db.prepare("INSERT OR IGNORE INTO views VALUES (?,?,?,?,?,?,?,?,?,?,?)");
const insertRows = db.transaction((rows: FeedRow[]) => {
  for (const r of rows)
    insertRow.run(
      r.timestamp,
      r.visitor ?? "",
      r.path,
      r.kind,
      r.country ?? "",
      r.city ?? "",
      r.bot ?? "",
      r.evidence ?? "",
      r.status ?? "",
      r.referrer ?? "",
      r.markdown ?? "",
    );
});
const countRows = db.prepare("SELECT COUNT(*) AS n FROM views");

/**
 * The kind a row would get today. Analytics Engine rows are immutable and keep
 * 90 days of whatever visitorKind() believed at write time — SemrushBot spent
 * that window filed as an "agent" — so every read path re-derives the kind
 * instead of trusting the stored one:
 *
 *   - a named bot is re-classified from its name (blob5);
 *   - a "human" that carried none of the browser-only headers (blob7 = "-") is
 *     a copied user-agent, and is counted as an agent.
 *
 * An empty `evidence` is a row archived before the worker measured headers at
 * all; it keeps its stored kind, because there is nothing to judge it on.
 */
const fixKind = (kind: string, bot: string | null | undefined, evidence?: string | null): Kind => {
  if (bot) return visitorKind(bot);
  if (kind === "human" && evidence === NO_EVIDENCE) return "agent";
  return asKind(kind);
};

/** Same correction, applied once to the rows already archived locally. */
function backfillKinds() {
  const rows = db.query("SELECT DISTINCT bot, kind, evidence FROM views").all() as {
    bot: string;
    kind: string;
    evidence: string;
  }[];
  const update = db.prepare("UPDATE views SET kind = ? WHERE bot = ? AND evidence = ? AND kind != ?");
  let fixed = 0;
  for (const r of rows) {
    const want = fixKind(r.kind, r.bot, r.evidence);
    if (want !== r.kind) fixed += update.run(want, r.bot, r.evidence, want).changes;
  }
  return fixed;
}

db.run(`CREATE TABLE IF NOT EXISTS searches (
  ts TEXT NOT NULL, visitor TEXT NOT NULL, q TEXT NOT NULL,
  country TEXT, category TEXT, results INTEGER,
  PRIMARY KEY (ts, visitor, q)) WITHOUT ROWID`);
addColumn("searches", "source", "TEXT NOT NULL DEFAULT ''");
addColumn("searches", "dest", "TEXT NOT NULL DEFAULT ''");
// Stored, not re-derived in SQL: isDirect() is the one definition, and writing
// it down here keeps the panels from carrying a second copy of it in ClickHouse
// string functions that would drift the first time a URL form changes.
addColumn("searches", "direct", "INTEGER NOT NULL DEFAULT 0");

/**
 * Drop anything past retention, at every start. `ts` is stored as Analytics
 * Engine returns it ("YYYY-MM-DD HH:MM:SS", UTC), which sorts the same way
 * SQLite's own datetime() string does, so a plain string compare is the cut.
 */
function prune(target: Database = db): number {
  const cutoff = `datetime('now', '-${RETENTION_DAYS} days')`;
  return (
    target.run(`DELETE FROM views WHERE ts < ${cutoff}`).changes +
    target.run(`DELETE FROM searches WHERE ts < ${cutoff}`).changes
  );
}
// VACUUM only when something went, so the usual start pays nothing. Without it
// the deleted rows stay legible in the file's free pages, which is not deletion.
if (prune() > 0) db.run("VACUUM");
const insertSearch = db.prepare("INSERT OR IGNORE INTO searches VALUES (?,?,?,?,?,?,?,?,?)");
const insertSearches = db.transaction((rows: FeedRow[]) => {
  for (const r of rows)
    insertSearch.run(
      r.timestamp,
      r.visitor ?? "",
      r.q ?? "",
      r.country ?? "",
      r.city ?? "", // a search row puts the category where a view puts the city
      num(r.results),
      r.source ?? "",
      r.dest ?? "",
      isDirect(r) ? 1 : 0,
    );
});

/** The same mark, applied once to the rows archived before the column existed. */
function backfillDirect(): number {
  const rows = db.query("SELECT DISTINCT q, dest FROM searches WHERE dest != '' AND direct = 0").all() as {
    q: string;
    dest: string;
  }[];
  const update = db.prepare("UPDATE searches SET direct = 1 WHERE q = ? AND dest = ?");
  let marked = 0;
  for (const r of rows) if (isDirect(r as FeedRow)) marked += update.run(r.q, r.dest).changes;
  return marked;
}
/** The queries asked most often, whether they worked or not. */
const topSearchRows = db.prepare(
  `SELECT q, COUNT(*) AS n, SUM(CASE WHEN dest = '' AND results = 0 THEN 1 ELSE 0 END) AS misses
   FROM searches WHERE ts > ? AND direct = 0 GROUP BY q ORDER BY n DESC, MAX(ts) DESC LIMIT 30`,
);
/**
 * Every query that ever found nothing, heaviest first — the content gaps.
 * A row with a landing page is not a gap even when the ranker returned no
 * count for it, so `dest` decides here, not `results`.
 */
const deadRows = db.prepare(
  "SELECT q, COUNT(*) AS n FROM searches WHERE results = 0 AND dest = '' GROUP BY q ORDER BY n DESC, MAX(ts) DESC LIMIT 30",
);
// A pasted address between two searches is not a refinement of either.
const chainRows = db.prepare("SELECT visitor, ts, q FROM searches WHERE ts > ? AND direct = 0 ORDER BY visitor, ts");

/**
 * The feed before this run started. Analytics Engine only answers for the
 * window asked of it, so without this the history stops where the session
 * began — everything older is in the archive and was simply never read back.
 */
const archivedViews = db.prepare(
  `SELECT ts AS timestamp, visitor, path, kind, country, city, bot, evidence, status, referrer, markdown
   FROM views ORDER BY ts DESC LIMIT ?`,
);
const archivedSearches = db.prepare(
  `SELECT ts AS timestamp, visitor, q, country, category AS city, results, source, dest
   FROM searches ORDER BY ts DESC LIMIT ?`,
);
/** The last place a visitor was seen — a search row carries no city of its own. */
const placeRow = db.prepare("SELECT city, country FROM views WHERE visitor = ? AND city != '' ORDER BY ts DESC LIMIT 1");
const placeCache = new Map<string, string>();
function placeOf(visitor: string, country: string): string {
  if (!visitor) return country;
  const hit = placeCache.get(visitor);
  if (hit !== undefined) return hit;
  const row = placeRow.get(visitor) as { city: string; country: string } | null;
  const place = [row?.city, row?.country || country].filter(Boolean).join(", ");
  placeCache.set(visitor, place);
  return place;
}

function readArchive(limit: number): FeedRow[] {
  const views = archivedViews.all(limit) as FeedRow[];
  const searches = (archivedSearches.all(limit) as FeedRow[]).map((r) => ({ ...r, kind: "search", path: "" }));
  return [...views, ...searches];
}
/** Referring hosts, busiest first. Same-site and direct hits are stored empty. */
const referrerRows = db.prepare(
  `SELECT referrer AS host, COUNT(*) AS n FROM views WHERE referrer NOT IN ('', '${SELF_REFERRER}') AND ts > ?
   GROUP BY referrer ORDER BY n DESC, MAX(ts) DESC LIMIT 10`,
);

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
const sinceRows = db.prepare("SELECT ts, kind FROM views WHERE ts > ?");
const utc = (ms: number) => new Date(ms).toISOString().replace("T", " ").slice(0, 19);

/** `buckets` samples per kind covering the last `windowMin`, oldest first. */
function chartSeries(buckets: number): Record<Kind, number[]> {
  const now = Date.now();
  const span = windowMin * 60_000;
  const out = Object.fromEntries(KINDS.map((k) => [k, new Array(buckets).fill(0)])) as Record<Kind, number[]>;
  for (const r of sinceRows.all(utc(now - span)) as { ts: string; kind: string }[]) {
    const i = buckets - 1 - Math.floor(((now - Date.parse(r.ts + "Z")) / span) * buckets);
    if (i >= 0 && i < buckets) out[asKind(r.kind)][i]++;
  }
  return out;
}

// ---------- text helpers (all padding must be ANSI-aware) ----------

const num = (v: unknown) => Number(v ?? 0);

// Colour (CSI SGR) and hyperlink (OSC 8) sequences both occupy zero columns.
function stripAnsi(s: string): string {
  return s.replace(/\x1b\]8;;[^\x1b\x07]*(?:\x1b\\|\x07)|\x1b\[[0-9;]*m/g, "");
}
const vlen = (s: string) => stripAnsi(s).length;

/**
 * OSC 8 hyperlink: ⌘-click (ctrl-click on Linux) opens `url` in the default
 * browser. Terminals that don't support it ignore the escape and print `label`,
 * so there is nothing to feature-detect.
 */
const link = (url: string, label: string) => `\x1b]8;;${url}\x1b\\${label}\x1b]8;;\x1b\\`;

const SITE = "https://houdinimd.com";

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

/** The other way round: names and places carry their meaning at the front. */
const truncEnd = (label: string, width: number) => (label.length > width ? label.slice(0, width - 1) + "…" : label);

/** Every doc path opens with the same 14 chars; they are not information. */
const shortPath = (path: string) => (path.startsWith("/docs/houdini/") ? path.slice(14) : path);

// Short, unambiguous when truncated, and none of them is a Houdini node name.
const NAMES =
  "Ada Bo Cleo Dex Echo Fern Gus Hana Ivo Juno Kit Lex Mira Nix Otto Pia Quin Rho Sage Tao Uma Vera Wren Xan Yuki Zev Alba Brin Coda Dove Elm Flint Gale Hollis Iris Jet Koa Lark Moss Nell Onyx Pike Reed Sky Thorn Vale Wisp Yarrow".split(
    " ",
  );

/**
 * A stable name per visitor hash (which the worker derives from IP + UA), so a
 * returning reader is recognisable in the feed without storing anything about
 * them. Collisions are fine and expected — this labels a session, it does not
 * identify a person.
 */
function visitorName(visitor: string): string {
  let h = 0;
  for (let i = 0; i < visitor.length; i++) h = (h * 31 + visitor.charCodeAt(i)) >>> 0;
  return NAMES[h % NAMES.length];
}

const KIND_COLOUR: Record<Kind, (s: string) => string> = { human: p.human, agent: p.agent, crawler: p.crawler };
/** Each kind also gets its own fill density, so the stacked bars read in mono. */
const KIND_FILL: Record<Kind, string> = { human: "█", agent: "▓", crawler: "▒" };
const Title = (k: Kind) => k[0].toUpperCase() + k.slice(1);

interface KindRow {
  kind: string;
  views: string;
  visitors: string;
}
/** A rollup as the API returns it: one row per visitor, before folding. */
interface VisitorRow {
  visitor: string;
  kind: string;
  views: string;
}
interface PathRow {
  path: string;
  kind: string;
  views: string;
  bot?: string;
  evidence?: string;
}

const by = (rows: KindRow[], kind: Kind) => rows.find((r) => r.kind === kind);
const asKind = (k: string): Kind => (KINDS.includes(k as Kind) ? (k as Kind) : "agent");

// ---------- panels: each returns lines sized to `inner` visible chars ----------

/**
 * `visitors·views` — who came, then how much they read. One number when the
 * two are equal, because "3·3" says nothing "3" doesn't.
 */
const cell = (visitors: number, views: number) =>
  views === 0 && visitors === 0 ? "–" : visitors === views ? String(views) : `${visitors}·${views}`;

/**
 * One window per row, one column per kind — the split is read, never inferred.
 * The trailing bar is the same split as a shape, for the glance that doesn't
 * stop to read digits.
 */
function trafficPanel(windows: { label: string; rows: KindRow[] }[], inner: number): string[] {
  const labelW = Math.max(...windows.map((w) => w.label.length), 8);
  const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);
  // Columns are sized to their content, never to a guess: a clipped row loses
  // its colour along with its overflow, and these numbers grow all day. What is
  // given up when it will not fit is given up in order of what it costs the
  // reader: first the "all" column, which is the three others added up, and
  // only then the visitor counts — "19" where "9·19" was meant is not a
  // narrower answer, it is a different one.
  const build = (compact: boolean, withTotal: boolean) => {
    const rows = windows.map((w) => {
      const views = KINDS.map((k) => num(by(w.rows, k)?.views));
      const visitors = KINDS.map((k) => num(by(w.rows, k)?.visitors));
      const one = (v: number, n: number) => (compact ? (n === 0 ? "–" : String(n)) : cell(v, n));
      return {
        label: w.label,
        views,
        cells: KINDS.map((_, i) => one(visitors[i], views[i])),
        total: withTotal ? one(sum(visitors), sum(views)) : "",
      };
    });
    const colW = Math.max(...KINDS.map((k) => Title(k).length + 1), ...rows.flatMap((d) => d.cells.map((c) => c.length + 1)));
    const totalW = withTotal ? Math.max(4, ...rows.map((d) => d.total.length + 2)) : 0;
    return { rows, colW, totalW, width: labelW + KINDS.length * colW + totalW };
  };
  const fits = (b: { width: number }) => b.width <= inner;
  const built = [build(false, true), build(false, false), build(true, true)];
  const chosen = built.find(fits) ?? built[built.length - 1];
  const compact = chosen === built[2];
  const { rows: data, colW, totalW, width } = chosen;
  // Whatever is left goes to the bar; below ~8 columns a three-part bar is a
  // smudge rather than a shape, so it gets nothing.
  const spare = inner - width - 1;
  const barW = spare >= 8 ? spare : 0;

  const head =
    p.label("".padEnd(labelW)) +
    KINDS.map((k) => KIND_COLOUR[k](Title(k).padStart(colW))).join("") +
    (totalW ? p.label("all".padStart(totalW)) : "");
  const rows = data.map((d) => {
    const total = d.views.reduce((a, b) => a + b, 0);
    // The bar is normalised to its own row: a share of traffic, not a volume —
    // 5m always losing to 30m tells you nothing.
    const widths = d.views.map((v) => (total > 0 ? Math.round((v / total) * barW) : 0));
    if (total > 0) {
      // Rounding drift lands on the dominant kind, so the bar always fills.
      const top = widths.indexOf(Math.max(...widths));
      widths[top] += barW - widths.reduce((a, b) => a + b, 0);
    }
    const bar = KINDS.map((k, i) => KIND_COLOUR[k](KIND_FILL[k].repeat(Math.max(0, widths[i])))).join("");
    return (
      p.label(d.label.padEnd(labelW)) +
      KINDS.map((k, i) => KIND_COLOUR[k](d.cells[i].padStart(colW))).join("") +
      (totalW ? p.ink(d.total.padStart(totalW)) : "") +
      " " +
      bar
    );
  });
  const units = compact ? "views" : "visitors·views";
  return [head, ...rows, p.label(units.padStart(labelW + KINDS.length * colW))];
}

function topPathsPanel(rows: PathRow[], inner: number, maxRows: number): string[] {
  // The home page is always the top page — it says nothing. Drop it.
  // Empty, not a placeholder: the caller drops the whole panel and gives the
  // rows to the search widgets instead.
  // A single view is noise while anything busier exists. When nothing is busier
  // it is the whole story, and hiding it is how a kind filter used to leave the
  // panel blank on a site that plainly had traffic.
  const ranked = rows.filter((r) => r.path !== "/");
  const busy = ranked.filter((r) => num(r.views) > 1);
  const shown = (busy.length > 0 ? busy : ranked).slice(0, maxRows);
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
      p.ink(link(SITE + r.path, padVis(truncate(shortPath(r.path), labelW), labelW))) +
      " " +
      p.line("▄".repeat(fill) + "▁".repeat(barW - fill))
    );
  });
}

/** The kind a feed row counts as, page view or search alike. */
const rowKind = (r: FeedRow): Kind => (isSearch(r) ? searchKind(r) : fixKind(r.kind, r.bot, r.evidence));

/**
 * `17:04:36  Human   │ Cleo | Paris, FR   nodes/sop/box` — when, what sort of
 * visitor, who, and what they did. Every event is a row: a page read, a raw
 * .md read, a 404, and a search with the page it opened.
 */
function feedPanel(rows: FeedRow[], inner: number, maxRows: number, offset = 0): string[] {
  if (rows.length === 0) return [p.label("waiting for traffic…")];
  const kindW = 7;
  const visible = rows.slice(offset, offset + maxRows);
  // Bots get their own name, humans get a name and a place. "Sapporo, JP" —
  // the city alone repeats across countries, and the country alone is all
  // there is when Cloudflare gave us no city. A search row carries no city,
  // so the place comes from the last page view by the same visitor.
  const whoOf = (r: FeedRow) => {
    const k = rowKind(r);
    const where = isSearch(r) ? placeOf(r.visitor, r.country) : [r.city, r.country].filter(Boolean).join(", ");
    const thin = k === "human" && !isSearch(r) && !!r.evidence && !r.evidence.includes("d");
    return k === "human"
      ? (thin ? "? " : "") +
          [NAME_HUMANS && r.visitor ? visitorName(r.visitor) : "", where || "unknown"].filter(Boolean).join(" | ")
      : r.bot || where || "unnamed";
  };
  // Sized to this page's actual content, and allowed to grow past the old flat
  // 20 whenever the path column can still keep PATH_MIN — "Fitzgerald | San
  // Francisco, US" was cut on a terminal with columns to spare, which is the one
  // thing this column exists to show. 20 stays the floor, so a narrow terminal
  // is no worse off than before.
  const PATH_MIN = 24;
  // Four trailing columns are kept for the status of anything that was not a
  // clean 200, so a long path cannot push it past the border.
  const fixed = 9 + kindW + 3 + 4;
  const want = Math.max(...visible.map((r) => whoOf(r).length));
  const whoW = Math.max(4, Math.min(want, Math.max(20, inner - fixed - PATH_MIN)));
  const pathW = Math.max(8, inner - fixed - whoW);
  return visible.map((r) => {
    const k = rowKind(r);
    const who = whoOf(r);
    const stamp =
      p.label(new Date(r.timestamp + (r.timestamp.endsWith("Z") ? "" : "Z")).toLocaleTimeString("en-GB")) +
      " " +
      (isSearch(r)
        ? (isDirect(r) ? p.ink2 : p.accent)((isDirect(r) ? "Direct" : "Search").padEnd(kindW))
        : KIND_COLOUR[k](Title(k).padEnd(kindW))) +
      p.line("│ ") +
      KIND_COLOUR[k](padVis(truncEnd(who, whoW), whoW)) +
      " ";

    if (isSearch(r)) return stamp + searchEvent(r, pathW + 4);

    // A 404 read as an ordinary view until the worker recorded the status:
    // a dead inbound link and a real read looked identical. Rows archived
    // before that carry no status and get no mark. The .md suffix is likewise
    // stripped from blob1 and restored here, so a raw-markdown read is visible
    // without splitting the page's rollups in two.
    const status = num(r.status);
    const path = shortPath(r.path) + (num(r.markdown) === 1 ? ".md" : "");
    // "↳" is a link followed from another page on the site: reading on, rather
    // than arriving. Without it a click through the docs and a typed address are
    // the same row, which is the whole of "I cannot tell navigating from
    // searching". Rows archived before the worker recorded it carry no mark.
    const arrow = isInSite(r) ? p.line("↳") : " ";
    return (
      stamp + arrow + p.ink(link(SITE + r.path, truncate(path, pathW - 1))) + (status >= 400 ? p.err(` ${status}`) : "")
    );
  });
}

/**
 * `"pyro solver" → nodes/dop/pyrosolver`, or the whole row red when it failed.
 * A query is truncated at its end, like a name: what someone typed first is
 * what says most about what they wanted.
 */
function searchEvent(r: FeedRow, width: number): string {
  const dest = r.dest ?? "";
  const quoted = (w: number) => `"${truncEnd(r.q ?? "", Math.max(3, w - 2))}"`;
  // Someone who typed the address gets the address, once. The "Direct" tag in
  // the kind column already says how they arrived, so repeating the slug either
  // side of an arrow only cost the row the width to show it.
  if (isDirect(r)) return p.ink2(link(`${SITE}/docs/${dest}`, truncate(shortPath(`/docs/${dest}`), width)));
  if (dest) {
    const q = quoted(Math.floor(width * 0.5));
    return (
      p.ink(q) +
      p.line(" → ") +
      p.ink2(link(`${SITE}/docs/${dest}`, truncate(shortPath(`/docs/${dest}`), Math.max(6, width - vlen(q) - 3))))
    );
  }
  // An API caller reads the JSON and goes wherever it likes, so it has no
  // landing page and its result count is the only outcome there is.
  if (!r.source || r.source === "api") {
    const n = num(r.results);
    return (n === 0 ? p.err : p.ink)(quoted(width - 5)) + (n === 0 ? p.err(" →0") : p.ink2(` →${n}`));
  }
  return p.err(quoted(width - 16) + " ✗ nothing found");
}

const hhmmss = (ts: string) => new Date(ts + (ts.endsWith("Z") ? "" : "Z")).toLocaleTimeString("en-GB");

// The three search panels return nothing at all when they have nothing to
// show, and stack() drops the whole box: an empty widget is a widget that
// costs rows and answers no question.

/**
 * `12 pyro solver   3✗` — the queries asked most often, with how many of them
 * found nothing. Recent searches are not a panel any more: they are events in
 * the feed, next to the pages they led to.
 */
function topSearchPanel(inner: number, maxRows: number): string[] {
  const rows = topSearchRows.all(utc(Date.now() - 24 * 3600_000)) as { q: string; n: number; misses: number }[];
  if (rows.length === 0) return [];
  return rows.slice(0, maxRows).map((r) => {
    const miss = r.misses > 0 ? p.err(`${r.misses}✗`.padStart(4)) : "";
    return (
      p.ink2(String(r.n).padStart(4)) +
      " " +
      p.ink(padVis(truncate(r.q, inner - 5 - vlen(miss)), inner - 5 - vlen(miss))) +
      miss
    );
  });
}

/**
 * Feed rows counted per kind, for the "Current view" row: what is on screen
 * right now, however it was filtered and scrolled. A search is an event, not a
 * page view, so it adds no view — but whoever searched is on screen, so it
 * still counts as a visitor. A row of "no humans" beside a visible human
 * search was the older, narrower reading.
 */
function countRowsByKind(rows: FeedRow[]): KindRow[] {
  const acc = new Map<Kind, { views: number; visitors: Set<string> }>();
  for (const r of rows) {
    const k = rowKind(r);
    const cur = acc.get(k) ?? { views: 0, visitors: new Set<string>() };
    if (!isSearch(r)) cur.views++;
    if (r.visitor) cur.visitors.add(r.visitor);
    acc.set(k, cur);
  }
  return [...acc].map(([kind, v]) => ({ kind, views: String(v.views), visitors: String(v.visitors.size) }));
}

/** Where readers came from, host only — direct and same-site hits are not rows. */
function referrerPanel(inner: number, maxRows: number): string[] {
  const rows = referrerRows.all(utc(Date.now() - 24 * 3600_000)) as { host: string; n: number }[];
  if (rows.length === 0) return [];
  return rows
    .slice(0, maxRows)
    .map((r) => p.ink2(String(r.n).padStart(4)) + " " + p.ink(truncate(r.host, inner - 5)));
}

/** Queries that found nothing, by volume — each row is a content gap. */
function deadQueryPanel(inner: number, maxRows: number): string[] {
  const rows = deadRows.all() as { q: string; n: number }[];
  if (rows.length === 0) return [];
  return rows.slice(0, maxRows).map((r) => p.err(String(r.n).padStart(4)) + " " + p.ink(truncate(r.q, inner - 5)));
}

/**
 * `vellum → vellum grain → grain constraint` — the tail is what they meant.
 *
 * Two lines per chain, the tail on its own. On one line the panel is only ever
 * as wide as the right column (~48 columns, and stretching the terminal does
 * not widen it), so the whole chain competed for that width and the query the
 * reader ended on — the answer the panel exists to give — was the part that
 * fell off the edge.
 */
function refinementPanel(chains: { ts: string; queries: string[] }[], inner: number, maxRows: number): string[] {
  if (chains.length === 0 || maxRows < 2) return [];
  return chains.slice(0, Math.floor(maxRows / 2)).flatMap((ch) => [
    p.ink(truncEnd(ch.queries[ch.queries.length - 1], inner)),
    p.label("  ↑ ") + p.ink2(truncEnd(ch.queries.slice(0, -1).join(" → "), inner - 4)),
  ]);
}

// ---------- braille line chart ----------

// A braille cell is 2 columns × 4 rows of dots; these are the bits per (row, col).
const DOT = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
];

/** Resample a coarse series up to `pw` pixel columns, right-aligned. */
function resample(src: number[], pw: number): number[] {
  if (src.length >= pw || src.length < 2) return src;
  return Array.from({ length: pw }, (_, i) => {
    const t = (i / (pw - 1)) * (src.length - 1);
    const lo = Math.floor(t);
    const hi = Math.min(src.length - 1, lo + 1);
    return src[lo] + (src[hi] - src[lo]) * (t - lo);
  });
}

/**
 * One rolling line per kind, newest at the right edge, each in its kind's
 * colour — the same split the Traffic table counts, as a shape over time.
 * Lines are solid; the area beneath each is dithered on a checkerboard, which
 * reads as a tone at terminal resolution without competing with the line.
 *
 * A braille cell carries eight dots but only one colour, so where two kinds
 * share a cell the dots merge and the busier kind (human, then agent) picks
 * the colour. Overlap is rare enough at this resolution to be worth the trade.
 */
function chartPanel(series: Record<Kind, number[]>, inner: number, rows: number, only: Kind | null): string[] {
  const pw = inner * 2;
  const ph = rows * 4;
  const drawn = only ? [only] : [...KINDS];
  // One bucket per pixel column is 0/1 noise at this traffic; sample coarsely
  // and interpolate back up so the silhouette reads as a line.
  const points = Object.fromEntries(drawn.map((k) => [k, resample(series[k].slice(-pw), pw)])) as Record<Kind, number[]>;
  const max = Math.max(1, ...drawn.flatMap((k) => points[k]));

  const layers = Object.fromEntries(drawn.map((k) => [k, new Array(inner * rows).fill(0)])) as Record<Kind, number[]>;
  for (const k of drawn) {
    const cells = layers[k];
    const set = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= pw || y >= ph) return;
      cells[(y >> 2) * inner + (x >> 1)] |= DOT[y & 3][x & 1];
    };
    const pts = points[k];
    const offset = pw - pts.length; // right-align: history grows leftward
    let prevY: number | null = null;
    pts.forEach((n, i) => {
      const x = offset + i;
      const y = Math.round((1 - n / max) * (ph - 1));
      // Connect to the previous sample so steps read as a line, not a scatter.
      if (prevY !== null) for (let yy = Math.min(prevY, y); yy <= Math.max(prevY, y); yy++) set(x, yy);
      else set(x, y);
      // Fill under the line only when it is the only line: three overlapping
      // dithered areas are a smudge, and the fill is what hides the others.
      if (drawn.length === 1) for (let yy = y + 2; yy < ph; yy++) if ((x + yy) % 2 === 0) set(x, yy);
      prevY = y;
    });
  }

  const out: string[] = [];
  for (let r = 0; r < rows; r++) {
    let line = "";
    let run = "";
    let runKind: Kind | null = null;
    const flush = () => {
      if (run) line += runKind ? KIND_COLOUR[runKind](run) : run;
      run = "";
    };
    for (let x = 0; x < inner; x++) {
      const i = r * inner + x;
      const owner = drawn.find((k) => layers[k][i] !== 0) ?? null;
      const bits = drawn.reduce((b, k) => b | layers[k][i], 0);
      if (owner !== runKind) {
        flush();
        runKind = owner;
      }
      run += bits === 0 ? " " : String.fromCharCode(0x2800 + bits);
    }
    flush();
    out.push(line);
  }
  const empty = drawn.every((k) => points[k].every((n) => n === 0));
  const bucketSec = Math.max(1, Math.round((windowMin * 120) / pw));
  const bucket = bucketSec >= 3600 ? `${Math.round(bucketSec / 3600)}h` : bucketSec >= 60 ? `${Math.round(bucketSec / 60)}m` : `${bucketSec}s`;
  const caption = `last ${windowLabel(windowMin)} · peak ${empty ? 0 : Math.round(max)}/bucket · ${bucket} buckets`;
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
  day: KindRow[];
  paths: PathRow[];
  feed: FeedRow[];
  lastFeedTs: string | null;
  /** Every row Analytics Engine still holds — its whole 90-day retention. */
  lifetime: KindRow[];
  stored: number;
  lastError: string | null;
  /** h/a/c: show only this kind in the feed, pages and chart. null = all. */
  filter: Kind | null;
  /** Rows of the feed scrolled past. 0 keeps it pinned to live. */
  feedOffset: number;
}

/**
 * The right column below Traffic. A panel with nothing to say does not take
 * up a box: whatever is left splits the height evenly, so an empty dataset
 * gives its rows to the widgets that do have data.
 */
function stack(state: State, width: number, height: number): string[] {
  const inner = width - 4;
  const chains = refinementChains(24);
  const panels: { title: string; lines: (rows: number) => string[] }[] = []; // titles are pre-coloured
  const add = (title: string, lines: (rows: number) => string[]) => {
    if (lines(1).length > 0) panels.push({ title, lines });
  };
  add(p.accent("Top Pages"), (n) => topPathsPanel(filterPaths(state), inner, n));
  add(p.accent("Top Searches") + p.line(" ") + p.label("24h"), (n) => topSearchPanel(inner, n));
  add(p.accent("Dead Queries"), (n) => deadQueryPanel(inner, n));
  add(p.accent("Referrers") + p.line(" ") + p.label("24h"), (n) => referrerPanel(inner, n));
  add(p.accent("Refined Searches") + p.line(" ") + p.label("24h"), (n) => refinementPanel(chains, inner, n));
  if (panels.length === 0) return [];

  const each = Math.floor(height / panels.length);
  return panels.flatMap((panel, i) => {
    const h = i === 0 ? height - each * (panels.length - 1) : each; // remainder to the top panel
    return box(panel.title, panel.lines(h - 2), width, h);
  });
}

// Filters apply to what the row IS, not what was recorded — see fixKind.
const filterFeed = (state: State) =>
  state.filter ? state.feed.filter((r) => rowKind(r) === state.filter) : state.feed;
const filterPaths = (state: State) => (state.filter ? state.paths.filter((r) => asKind(r.kind) === state.filter) : state.paths);

function frame(state: State, exclude: string | null): string[] {
  const W = termWidth();
  const H = termHeight();

  // Every clock, interval and counter lives on this one line.
  const header =
    " " +
    p.accent("houdinimd.com") +
    p.line("  ·  ") +
    p.ink(new Date().toLocaleTimeString("en-GB")) +
    // The window is already named in the chart caption; this line is tight.
    p.label(`  rollups ${intervalSec}s · feed ${feedIntervalSec}s · ${state.stored.toLocaleString("en-GB")} archived`) +
    (exclude ? "" : p.label(" · own visits kept")) +
    p.label("  ·  ") +
    p.ink2("hac") +
    p.label(" filter ") +
    p.ink2("jk") +
    p.label(" scroll ") +
    p.ink2("←→") +
    p.label(" window ") +
    p.ink2("q") +
    p.label(" quit") +
    (state.filter ? p.line(" · ") + KIND_COLOUR[state.filter](`${state.filter}s only`) : "") +
    (state.lastError ? p.err(`  · ${state.lastError.replace(/\s+/g, " ")}`) : "");

  const chartH = CHART_H + 3; // braille rows + caption + borders
  const trafficH = 8; // column header + four windows + unit caption + borders
  const mainH = Math.max(8, H - 1 - chartH);
  const wide = W >= 96;
  const feed = filterFeed(state);
  // The feed panel's own height, so "Current view" counts exactly the rows on
  // screen — filtered and scrolled the same way the chart is filtered.
  const feedRows = (wide ? mainH : Math.max(5, mainH - trafficH - 8)) - 2;
  const windows = [
    { label: "Current view", rows: countRowsByKind(feed.slice(state.feedOffset, state.feedOffset + feedRows)) },
    { label: `Last ${windowLabel(windowMin)}`, rows: state.recent },
    { label: "Last 24h", rows: state.day },
    { label: "Lifetime", rows: state.lifetime },
  ];
  const feedTitle =
    p.accent("Live Feed") + (state.feedOffset > 0 ? p.line("  ") + p.label(`+${state.feedOffset} back · g live`) : "");

  const lines: string[] = [header];
  lines.push(
    ...box(
      p.accent("Activity"),
      chartPanel(chartSeries(Math.max(8, Math.floor((W - 4) / 2))), W - 4, CHART_H, state.filter),
      W,
      chartH,
    ),
  );

  if (wide) {
    const rightW = Math.min(52, Math.max(38, Math.floor(W * 0.36)));
    const leftW = W - rightW - GAP.length;
    lines.push(
      ...hstack(
        box(feedTitle, feedPanel(feed, leftW - 4, mainH - 2, state.feedOffset), leftW, mainH),
        [
          ...box(p.accent("Traffic"), trafficPanel(windows, rightW - 4), rightW, trafficH),
          ...stack(state, rightW, mainH - trafficH),
        ],
        leftW,
      ),
    );
  } else {
    lines.push(...box(p.accent("Traffic"), trafficPanel(windows, W - 4), W, trafficH));
    const feedH = Math.max(5, mainH - trafficH - 8);
    lines.push(...box(feedTitle, feedPanel(feed, W - 4, feedH - 2, state.feedOffset), W, feedH));
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

/** crawler beats agent beats human: what a visitor looked like at its least human. */
const KIND_RANK: Record<Kind, number> = { human: 0, agent: 1, crawler: 2 };

/**
 * Every rollup groups by visitor as well as kind, then folds the groups in JS
 * through fixKind — the stored kind of a 90-day-old row cannot be trusted (see
 * fixKind), and the bot name that corrects it is right there in blob5.
 *
 * Grouping by the visitor is what makes the visitor counts true. Counting
 * distinct visitors per (kind, bot, evidence) group and adding the groups up
 * counted one reader once per set of headers they happened to send: a day of
 * ordinary browsing turned ~40 people into "200 visitors". A visitor is one
 * visitor here, filed under the least human kind it ever looked like.
 */
function foldKinds(rows: (VisitorRow & { bot?: string; evidence?: string })[]): KindRow[] {
  const seen = new Map<string, { kind: Kind; views: number }>();
  for (const r of rows) {
    const k = fixKind(r.kind, r.bot, r.evidence);
    const cur = seen.get(r.visitor);
    if (!cur) seen.set(r.visitor, { kind: k, views: num(r.views) });
    else {
      cur.views += num(r.views);
      if (KIND_RANK[k] > KIND_RANK[cur.kind]) cur.kind = k;
    }
  }
  const acc = new Map<Kind, { views: number; visitors: number }>();
  for (const v of seen.values()) {
    const cur = acc.get(v.kind) ?? { views: 0, visitors: 0 };
    acc.set(v.kind, { views: cur.views + v.views, visitors: cur.visitors + 1 });
  }
  return [...acc].map(([kind, v]) => ({ kind, views: String(v.views), visitors: String(v.visitors) }));
}

const DAY_MINUTES = 24 * 60;
// Analytics Engine keeps 90 days and nothing older exists anywhere, so this is
// the lifetime of the dataset. It was read from the local archive before, which
// counted stored rows instead of SUM(_sample_interval) and only knew the
// windows this machine had polled — a "lifetime" smaller than its own 24h row.
const LIFETIME_MINUTES = 90 * DAY_MINUTES;

/**
 * The rungs ← and → step through. Each step is the next rung strictly past the
 * current window, so a custom --window is not snapped away — it simply broadens
 * or narrows to the nearest rung on either side of wherever it sits.
 */
const WINDOW_LADDER = [30, 45, 60, 120, 240, 480, 1440, 2880, 4320, 10080, 43200, LIFETIME_MINUTES];
const broaden = (mins: number) => WINDOW_LADDER.find((v) => v > mins) ?? mins;
const narrow = (mins: number) => WINDOW_LADDER.filter((v) => v < mins).pop() ?? mins;

/** "45m", "8h", "72h", "7d", "lifetime" — hours up to three days, then days. */
function windowLabel(mins: number): string {
  if (mins >= LIFETIME_MINUTES) return "lifetime";
  if (mins >= 7 * DAY_MINUTES) return `${Math.round(mins / DAY_MINUTES)}d`;
  if (mins % 60 === 0) return `${mins / 60}h`;
  return `${mins}m`;
}

async function fetchRollups(exclude: string | null, withDay: boolean) {
  const notMine = exclude ? ` AND blob3 != '${exclude}'` : "";
  const since = (mins: number) => `timestamp > NOW() - INTERVAL '${mins}' MINUTE`;
  type RollupRow = VisitorRow & { bot: string; evidence: string };
  const rollup = (mins: number) => `
    SELECT index1 AS visitor, blob2 AS kind, blob5 AS bot, blob7 AS evidence,
           SUM(_sample_interval) AS views
    FROM ${DATASET} WHERE ${since(mins)} AND ${KIND_ROWS_FILTER}${notMine} GROUP BY visitor, kind, bot, evidence`;

  const [live, recent, day, lifetime, paths] = await Promise.all([
    query<RollupRow>(rollup(LIVE_MINUTES)),
    query<RollupRow>(rollup(windowMin)),
    // The 24h and lifetime rows move slowly and every query counts against the
    // daily read cap, so the caller refreshes them on a multiple of the slow tick.
    withDay ? query<RollupRow>(rollup(DAY_MINUTES)) : Promise.resolve(null),
    withDay ? query<RollupRow>(rollup(LIFETIME_MINUTES)) : Promise.resolve(null),
    query<PathRow>(`
      SELECT blob1 AS path, blob2 AS kind, blob5 AS bot, blob7 AS evidence, SUM(_sample_interval) AS views
      FROM ${DATASET} WHERE ${since(windowMin)} AND ${KIND_ROWS_FILTER}${notMine}
      GROUP BY path, kind, bot, evidence ORDER BY views DESC LIMIT 20`),
  ]);
  return {
    live: foldKinds(live),
    recent: foldKinds(recent),
    ...(day ? { day: foldKinds(day) } : {}),
    ...(lifetime ? { lifetime: foldKinds(lifetime) } : {}),
    paths: foldPaths(paths),
  };
}

/**
 * One row per (page, kind). The query has to group by bot and evidence as well,
 * because fixKind needs them — so a page read by four people carrying four
 * different sets of browser headers came back as four rows of one view each.
 * Nothing folded them again, so "Top Pages" saw a site where no page was ever
 * read twice, and filtering to humans emptied the panel outright: a crawler
 * sends one fixed header set and aggregates on its own, a person does not.
 */
function foldPaths(rows: PathRow[]): PathRow[] {
  const acc = new Map<string, PathRow>();
  for (const r of rows) {
    const kind = fixKind(r.kind, r.bot, r.evidence);
    const key = `${r.path} ${kind}`;
    const cur = acc.get(key);
    if (cur) cur.views = String(num(cur.views) + num(r.views));
    else acc.set(key, { path: r.path, kind, views: String(num(r.views)) });
  }
  return [...acc.values()].sort((a, b) => num(b.views) - num(a.views));
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

/**
 * Page views and searches in one stream. Both sorts live in the same dataset
 * and the same columns: blob1 is a path or a query, blob7 is header evidence
 * or a landing page, double1 is a status or a result count. blob2 says which,
 * and the rows below are read accordingly — one query, one timeline.
 */
function feedQuery(exclude: string | null, since: string, limit: number): Promise<FeedRow[]> {
  const notMine = exclude ? ` AND blob3 != '${exclude}'` : "";
  return query<FeedRow>(`
    SELECT timestamp AS timestamp, blob1 AS path, blob2 AS kind, blob4 AS country,
           blob5 AS bot, blob6 AS city, blob7 AS evidence, blob8 AS referrer,
           double1 AS status, double2 AS markdown, index1 AS visitor
    FROM ${DATASET} WHERE ${since}${notMine}
    ORDER BY timestamp DESC LIMIT ${limit}`).then((rows) =>
    rows.map((r) =>
      r.kind === "search"
        ? { ...r, q: r.path, path: "", dest: r.evidence, source: r.bot, results: r.status, evidence: "", bot: "" }
        : r,
    ),
  );
}

const fetchFeedIncrement = (exclude: string | null, lastTs: string | null) =>
  feedQuery(exclude, lastTs ? `timestamp > ${tsLiteral(lastTs)}` : `timestamp > NOW() - INTERVAL '${LIVE_MINUTES}' MINUTE`, 30);

/** One query at startup so the chart has a full window, not just this session. */
const fetchWindow = (exclude: string | null) => feedQuery(exclude, `timestamp > NOW() - INTERVAL '${windowMin}' MINUTE`, 2000);

/**
 * Newest first, one row per event, duplicates dropped. The archive and the API
 * overlap by design — the same row can arrive from both — and the primary keys
 * of the two tables are what makes an event the same event.
 */
function mergeFeed(...sources: FeedRow[][]): FeedRow[] {
  const byKey = new Map<string, FeedRow>();
  for (const rows of sources) {
    for (const r of rows) {
      const key = `${r.timestamp}|${r.visitor}|${isSearch(r) ? r.q : r.path}`;
      if (!byKey.has(key)) byKey.set(key, r);
    }
  }
  return [...byKey.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, FEED_CAP);
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
  console.assert(vlen(link("https://x.test/a", "abc")) === 3, "link: hyperlink costs no columns");
  console.assert(
    tsLiteral("2026-08-02T16:45:03.123Z") === "toDateTime('2026-08-02 16:45:03')",
    "tsLiteral: DateTime-safe literal",
  );

  console.assert(fixKind("agent", "SemrushBot") === "crawler", "fixKind: a stored kind loses to the bot name");
  console.assert(fixKind("human", "meta-externalagent") === "agent", "fixKind: a browser-shaped bot is not a reader");
  console.assert(fixKind("human", "", "dmlc") === "human", "fixKind: a corroborated human stays human");
  console.assert(fixKind("human", "", NO_EVIDENCE) === "agent", "fixKind: a human with no browser headers is a copied UA");
  console.assert(fixKind("human", "", "") === "human", "fixKind: a row from before we measured keeps its kind");
  const folded = foldKinds([
    { visitor: "s1", kind: "agent", bot: "SemrushBot", views: "10" },
    { visitor: "a1", kind: "agent", bot: "ClaudeBot", views: "5" },
    { visitor: "h1", kind: "human", bot: "", evidence: "dmlc", views: "3" },
    { visitor: "b1", kind: "human", bot: "", evidence: NO_EVIDENCE, views: "7" },
  ]);
  console.assert(num(by(folded, "crawler")?.views) === 10, "foldKinds: Semrush counted as a crawler");
  console.assert(num(by(folded, "agent")?.views) === 12, "foldKinds: bare-header humans join the agents");
  console.assert(num(by(folded, "human")?.views) === 3, "foldKinds: only corroborated humans are counted human");
  // The bug this replaced: one reader whose headers varied across a day was
  // counted once per variation, so 40 people read as 200 visitors.
  const oneReader = foldKinds([
    { visitor: "h1", kind: "human", bot: "", evidence: "dmlc", views: "4" },
    { visitor: "h1", kind: "human", bot: "", evidence: "dml", views: "2" },
  ]);
  console.assert(num(by(oneReader, "human")?.visitors) === 1, "foldKinds: one visitor is one visitor");
  console.assert(num(by(oneReader, "human")?.views) === 6, "foldKinds: their views still add up");
  const alsoCrawled = foldKinds([
    { visitor: "x", kind: "human", bot: "", evidence: "dmlc", views: "1" },
    { visitor: "x", kind: "agent", bot: "SemrushBot", views: "1" },
  ]);
  console.assert(by(alsoCrawled, "human") === undefined, "foldKinds: a visitor is filed at its least human");
  console.assert(visitorName("abc") === visitorName("abc"), "visitorName: stable per visitor");
  console.assert(cell(3, 3) === "3" && cell(2, 9) === "2·9" && cell(0, 0) === "–", "cell: one number when they agree");

  const boxed = box(p.accent("T"), ["x"], 20, 4);
  console.assert(boxed.length === 4 && boxed.every((l) => vlen(l) === 20), "box: fixed height, even width");
  console.assert(stripAnsi(boxed[0]).endsWith("┐") && stripAnsi(boxed[1]).endsWith("│"), "box: right border intact");

  const paths: PathRow[] = [
    { path: "/", kind: "human", views: "99" },
    { path: "/docs/a", kind: "human", views: "4" },
  ];
  console.assert(!stripAnsi(topPathsPanel(paths, 40, 5).join("")).includes(" / "), "topPaths: home page excluded");

  const traffic = stripAnsi(trafficPanel([{ label: "Now 5m", rows }], 44).join("\n"));
  console.assert(/Human.+Agent.+Crawler/.test(traffic), "traffic: one column per kind");
  console.assert(
    traffic.includes("2·3") && traffic.includes("1·9") && traffic.includes("3·12"),
    "traffic: visitors first, then views",
  );
  console.assert(traffic.trimEnd().endsWith("visitors·views"), "traffic: units named once, in the caption");
  console.assert(
    trafficPanel([{ label: "Last 24h", rows: [{ kind: "human", views: "999999", visitors: "888888" }] }], 44).every(
      (l) => vlen(l) <= 44,
    ),
    "traffic: columns grow with the numbers instead of clipping",
  );
  const tight = stripAnsi(trafficPanel([{ label: "Now 5m", rows }], 37).join("\n"));
  console.assert(tight.includes("2·3") && !tight.includes("all"), "traffic: the sum column goes before the visitors do");

  const series = { human: [0, 3, 1, 4], agent: [1, 0, 2, 0], crawler: [0, 0, 0, 0] };
  const chart = chartPanel(series, 20, 3, null);
  console.assert(chart.length === 4 && chart.slice(0, 3).every((l) => vlen(l) === 20), "chart: braille rows plus caption");
  console.assert(/[⠀-⣿]/.test(stripAnsi(chart.join(""))), "chart: draws braille");
  console.assert(chart.join("").includes("\x1b[38;2;9;121;105m"), "chart: humans drawn in the human colour");
  console.assert(
    !chartPanel(series, 20, 3, "agent").join("").includes("\x1b[38;2;9;121;105m"),
    "chart: a filter drops the other kinds",
  );

  const RED = "\x1b[38;2;217;100;122m"; // p.err, as the terminal receives it
  const feedRow = (over: Partial<FeedRow> = {}): FeedRow => ({
    timestamp: "2026-08-02T16:45:03Z",
    path: "/docs/a",
    kind: "human",
    country: "FR",
    bot: "",
    city: "Paris",
    visitor: "v",
    ...over,
  });
  const feed = stripAnsi(feedPanel([feedRow()], 60, 5)[0]);
  console.assert(feed.includes("Human") && feed.includes("Paris, FR"), "feed: human shows the city and its country");
  console.assert(
    stripAnsi(feedPanel([feedRow({ city: "" })], 60, 5)[0]).includes("FR"),
    "feed: falls back to the country when Cloudflare gave us no city",
  );
  console.assert(
    stripAnsi(feedPanel([feedRow({ status: "404" })], 60, 5)[0]).includes("404") &&
      !stripAnsi(feedPanel([feedRow({ status: "200" })], 60, 5)[0]).includes("200"),
    "feed: only a failed request is marked with its status",
  );
  console.assert(feed.includes(visitorName("v")), "feed: human named from the visitor hash");
  const bot = stripAnsi(feedPanel([feedRow({ kind: "agent", bot: "ClaudeBot", city: "", country: "US" })], 60, 5)[0]);
  console.assert(bot.includes("Agent") && bot.includes("ClaudeBot"), "feed: agent shows its bot name");
  const semrush = stripAnsi(feedPanel([feedRow({ kind: "agent", bot: "SemrushBot" })], 60, 5)[0]);
  console.assert(semrush.includes("Crawler"), "feed: a stored kind is corrected on read");
  const scrolled = feedPanel([feedRow(), feedRow({ path: "/docs/b" })], 60, 5, 1);
  console.assert(scrolled.length === 1 && stripAnsi(scrolled[0]).includes("/docs/b"), "feed: offset scrolls past the head");
  console.assert(
    feedPanel([feedRow()], 60, 5)[0].includes("\x1b]8;;https://houdinimd.com/docs/a"),
    "feed: path links to the live page",
  );

  const chains = [{ ts: "2026-08-02 16:45:03", queries: ["vellum", "vellum grain"] }];
  console.assert(
    stripAnsi(refinementPanel(chains, 40, 4).join("\n")) === "vellum grain\n  ↑ vellum",
    "refine: newest query on top, the queries it came from beneath",
  );
  const searchRow = (over: Partial<FeedRow> = {}): FeedRow =>
    feedRow({ kind: "search", path: "", q: "pyro", results: "0", ...over });
  const apiSearch = stripAnsi(feedPanel([searchRow()], 70, 3)[0]);
  console.assert(apiSearch.includes("Search") && apiSearch.includes('"pyro"'), "feed: a search is an event like any other");
  console.assert(apiSearch.includes("→0"), "feed: an API search keeps its result count");
  console.assert(
    stripAnsi(feedPanel([searchRow({ source: "overlay", dest: "houdini/nodes/dop/pyrosolver", results: "6" })], 78, 3)[0])
      .includes("→ nodes/dop/pyrosolver"),
    "feed: a submitted search shows the page it opened",
  );
  const missed = feedPanel([searchRow({ source: "resolve", dest: "" })], 70, 3)[0];
  console.assert(stripAnsi(missed).includes("✗"), "feed: a search that landed nowhere is a failure");
  console.assert(missed.includes(RED), "feed: a failed search is drawn in the error colour");
  console.assert(rowKind(searchRow({ source: "api" })) === "agent", "feed: an API search counts as an agent");
  console.assert(rowKind(searchRow({ source: "overlay" })) === "human", "feed: a submitted search counts as a human");
  console.assert(
    stripAnsi(feedPanel([feedRow({ markdown: "1" })], 60, 5)[0]).includes("/docs/a.md"),
    "feed: a raw markdown read is marked .md",
  );
  const counted = countRowsByKind([feedRow(), feedRow({ path: "/docs/b" }), searchRow(), feedRow({ visitor: "w" })]);
  console.assert(num(by(counted, "human")?.views) === 3, "current view: every page view on screen is counted");
  console.assert(num(by(counted, "human")?.visitors) === 2, "current view: a visitor is counted once");
  const searchOnly = countRowsByKind([searchRow({ source: "overlay" })]);
  console.assert(num(by(searchOnly, "human")?.visitors) === 1, "current view: a visible searcher is a visible human");
  console.assert(num(by(searchOnly, "human")?.views) === 0, "current view: a search is not a page view");
  console.assert(refinementPanel([], 40, 3).length === 0, "panels: empty means no box");
  const chain = refinementPanel([{ ts: "t", queries: ["vellum", "vellum grain", "grain constraint solver setup"] }], 24, 4);
  console.assert(stripAnsi(chain[0]) === "grain constraint solver…", "refined: the query they ended on gets its own line");
  console.assert(chain.length === 2 && stripAnsi(chain[1]).startsWith("  ↑ "), "refined: the earlier queries sit under it");

  // Direct hits. A pasted address recorded as a search must read as an arrival,
  // not as a question, in every spelling the two search fields accept.
  const direct = (q: string, dest: string) => isDirect(searchRow({ q, dest }));
  console.assert(direct("houdini/nodes/sop/box", "houdini/nodes/sop/box"), "direct: a slug typed verbatim");
  console.assert(direct("https://www.sidefx.com/docs/houdini/nodes/sop/box.html", "houdini/nodes/sop/box"), "direct: a pasted SideFX URL");
  console.assert(direct("/docs/houdini/nodes/sop/box", "houdini/nodes/sop/box"), "direct: a pasted local path");
  console.assert(!direct("read a point", "houdini/vex/functions/point"), "direct: a real question is not a direct hit");
  console.assert(!direct("box", ""), "direct: a search that landed nowhere is not a direct hit");
  const directRow = stripAnsi(feedPanel([searchRow({ source: "home", q: "houdini/nodes/sop/box", dest: "houdini/nodes/sop/box" })], 78, 3)[0]);
  console.assert(directRow.includes("Direct") && !directRow.includes("→"), "feed: a direct hit shows the page once, not both sides of an arrow");

  // Reading on vs arriving.
  const followed = stripAnsi(feedPanel([feedRow({ referrer: SELF_REFERRER })], 60, 3)[0]);
  const arrived = stripAnsi(feedPanel([feedRow({ referrer: "" })], 60, 3)[0]);
  console.assert(followed.includes("↳/docs/a"), "feed: a link followed inside the site is marked");
  console.assert(!arrived.includes("↳"), "feed: an arrival carries no mark");
  console.assert(vlen(followed) === vlen(arrived), "feed: the mark costs the path column nothing");

  // Top Pages. The rollup groups by header evidence as well as kind, so folding
  // is what makes a page read by several people one row instead of several.
  const foldedPaths = foldPaths([
    { path: "/docs/a", kind: "human", views: "1", bot: "", evidence: "dl" },
    { path: "/docs/a", kind: "human", views: "1", bot: "", evidence: "d" },
    { path: "/docs/b", kind: "human", views: "5", bot: "", evidence: "d" },
  ]);
  console.assert(foldedPaths.length === 2, "top pages: one row per page and kind");
  console.assert(num(foldedPaths.find((r) => r.path === "/docs/a")?.views) === 2, "top pages: header sets are summed, not split");
  console.assert(
    topPathsPanel([{ path: "/docs/a", kind: "human", views: "1" }], 40, 5).length === 1,
    "top pages: a lone one-view page still shows when nothing is busier",
  );

  // The window ladder walks past whatever it is given, in both directions.
  console.assert(broaden(30) === 45 && broaden(1440) === 2880, "window: ← climbs one rung");
  console.assert(narrow(60) === 45 && narrow(30) === 30, "window: → falls one rung and stops at the floor");
  console.assert(broaden(37) === 45 && narrow(37) === 30, "window: a custom --window is not snapped away");
  console.assert(broaden(LIFETIME_MINUTES) === LIFETIME_MINUTES, "window: lifetime is the ceiling");
  console.assert(
    [30, 60, 1440, 4320, 10080, LIFETIME_MINUTES].map(windowLabel).join(" ") === "30m 1h 24h 72h 7d lifetime",
    "window: every rung has the label the spec asks for",
  );

  // Retention. The risk is the comparison, not the DELETE: `ts` is a string in
  // Analytics Engine's format, so this proves it sorts against SQLite's own
  // datetime() the way the cut assumes.
  const mem = new Database(":memory:");
  mem.run("CREATE TABLE views (ts TEXT)");
  mem.run("CREATE TABLE searches (ts TEXT)");
  const stamp = (days: number) => utc(Date.now() - days * 86_400_000);
  mem.run(`INSERT INTO views VALUES ('${stamp(RETENTION_DAYS + 1)}'), ('${stamp(1)}')`);
  mem.run(`INSERT INTO searches VALUES ('${stamp(RETENTION_DAYS + 1)}'), ('${stamp(1)}')`);
  console.assert(prune(mem) === 2, "retention: one row per table drops at the cutoff");
  console.assert(num((mem.query("SELECT COUNT(*) AS n FROM views").get() as { n: number })?.n) === 1, "retention: a row inside the window stays");
  console.assert(prune(mem) === 0, "retention: a second pass finds nothing left to drop");

  const base: State = {
    live: rows,
    recent: rows,
    day: rows,
    paths,
    feed: [],
    lastFeedTs: null,
    lifetime: rows,
    stored: 7,
    lastError: "boom",
    filter: null,
    feedOffset: 0,
  };
  for (const filter of [null, "human"] as const) {
    const f = frame({ ...base, filter }, "x");
    console.assert(
      f.every((l) => vlen(l) === termWidth()),
      `frame(${filter}): every line exactly terminal width`,
    );
    console.assert(f.length <= termHeight(), `frame(${filter}): fits terminal height`);
  }
  console.log("self-test ok");
}

if (args.flags.has("test")) {
  selfTest();
  process.exit(0);
}

// ---------- main ----------

const exclude = args.flags.has("keep-mine") ? null : await ownIpHash();

backfillKinds();
backfillDirect();

const state: State = {
  live: [],
  recent: [],
  day: [],
  paths: [],
  // The feed starts as the whole archive, so scrolling back reaches every
  // event ever recorded and not just the window this session has seen.
  feed: mergeFeed(readArchive(FEED_CAP)),
  lastFeedTs: null,
  lifetime: [], // filled by the first rollup tick
  stored: num(countRows.get()?.n),
  lastError: null,
  filter: startFilter,
  feedOffset: 0,
};

// One 24h rollup per this many slow ticks — 2 minutes at the default interval.
const DAY_EVERY = Math.max(1, Math.round(120 / intervalSec));
let rollupTicks = 0;

async function tickRollups() {
  try {
    const withDay = rollupTicks++ % DAY_EVERY === 0;
    Object.assign(state, await fetchRollups(exclude, withDay));
    state.lastError = null;
  } catch (err) {
    state.lastError = (err as Error).message;
  }
}

async function tickFeed(full = false) {
  try {
    const fresh = full ? await fetchWindow(exclude) : await fetchFeedIncrement(exclude, state.lastFeedTs);
    if (fresh.length > 0) {
      insertRows(fresh.filter((r) => !isSearch(r)));
      insertSearches(fresh.filter(isSearch));
      state.stored = num(countRows.get()?.n);
      const before = state.feed.length;
      state.feed = mergeFeed(fresh, state.feed);
      state.lastFeedTs = fresh[0].timestamp;
      // Rows arrive at the head, so a reader scrolled back must be pushed down
      // by as many rows as were genuinely new, or the feed slides under them
      // while they read.
      if (state.feedOffset > 0) state.feedOffset += Math.max(0, state.feed.length - before);
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

const FILTER_KEY: Record<string, Kind> = { h: "human", a: "agent", c: "crawler" };

if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("data", (key: Buffer) => {
    const k = key.toString();
    if (k === "q" || k === "\x03") process.exit(0); // q or Ctrl+C
    const wanted = FILTER_KEY[k];
    if (wanted) {
      state.filter = state.filter === wanted ? null : wanted; // same key again clears
      state.feedOffset = 0;
    } else if (k === "j" || k === "\x1b[B") {
      // Never scroll past the last row it is possible to show.
      state.feedOffset = Math.min(state.feedOffset + 1, Math.max(0, filterFeed(state).length - 1));
    } else if (k === "k" || k === "\x1b[A") {
      state.feedOffset = Math.max(0, state.feedOffset - 1);
    } else if (k === "g") {
      state.feedOffset = 0;
    } else if (k === "\x1b[D" || k === "\x1b[C") {
      // ← broadens, → narrows. The chart redraws at once from the local
      // archive; the rollups and the feed need Analytics Engine again, so they
      // are refetched in the background and draw themselves when they land.
      const next = k === "\x1b[D" ? broaden(windowMin) : narrow(windowMin);
      if (next === windowMin) return;
      windowMin = next;
      state.feedOffset = 0;
      draw(state, exclude);
      void Promise.all([tickRollups(), tickFeed(true)]).then(() => draw(state, exclude));
      return;
    } else {
      return;
    }
    draw(state, exclude);
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
