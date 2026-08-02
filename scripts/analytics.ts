#!/usr/bin/env bun
/**
 * Live traffic dashboard for houdinimd.com.
 *
 * Reads the `houdinimd_views` Analytics Engine dataset that worker.ts writes
 * (see recordPageView there) and refreshes a terminal table: who is on the site
 * right now, humans vs agents vs crawlers over the last half hour, and the
 * pages they are reading. Your own visits are dropped by comparing the hash of
 * this machine's public IP against blob3.
 *
 * Needs in .env.local:
 *   R2_ACCOUNT_ID      (already there — same Cloudflare account id)
 *   CF_ANALYTICS_TOKEN  API token with Account | Account Analytics | Read
 *
 * Usage:
 *   bun scripts/analytics.ts                 # refresh every 30s
 *   bun scripts/analytics.ts --interval 60   # slower (free tier: 10k reads/day)
 *   bun scripts/analytics.ts --window 120    # look back 2h instead of 30min
 *   bun scripts/analytics.ts --once          # print once and exit
 *   bun scripts/analytics.ts --keep-mine     # do not filter out this machine
 */

import { parseArgs, getNumber, c } from "./lib/cli";
import { visitorHash } from "../lib/visitor-hash";

const DATASET = "houdinimd_views";
const LIVE_MINUTES = 5; // "on the site now" — a page read plus a little slack
const KINDS = ["human", "agent", "crawler"] as const;
type Kind = (typeof KINDS)[number];

const args = parseArgs(process.argv.slice(2));
const intervalSec = getNumber(args, "interval", 30);
const windowMin = getNumber(args, "window", 30);

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
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 300)}`);
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

const num = (v: unknown) => Number(v ?? 0);

function bar(value: number, max: number, width = 24): string {
  if (max <= 0) return "";
  return "█".repeat(Math.max(1, Math.round((value / max) * width)));
}

const KIND_COLOUR: Record<Kind, (s: string) => string> = {
  human: c.green,
  agent: c.cyan,
  crawler: c.dim,
};

interface KindRow { kind: string; views: string; visitors: string }
interface PathRow { path: string; kind: string; views: string }

async function render(exclude: string | null) {
  const notMine = exclude ? ` AND blob3 != '${exclude}'` : "";
  const since = (mins: number) => `timestamp > NOW() - INTERVAL '${mins}' MINUTE`;
  const rollup = (mins: number) => `
    SELECT blob2 AS kind, SUM(_sample_interval) AS views, COUNT(DISTINCT index1) AS visitors
    FROM ${DATASET} WHERE ${since(mins)}${notMine} GROUP BY kind`;

  const [live, recent, paths] = await Promise.all([
    query<KindRow>(rollup(LIVE_MINUTES)),
    query<KindRow>(rollup(windowMin)),
    query<PathRow>(`
      SELECT blob1 AS path, blob2 AS kind, SUM(_sample_interval) AS views
      FROM ${DATASET} WHERE ${since(windowMin)}${notMine}
      GROUP BY path, kind ORDER BY views DESC LIMIT 15`),
  ]);

  const by = (rows: KindRow[], kind: Kind) => rows.find((r) => r.kind === kind);
  const out: string[] = [];
  const stamp = new Date().toLocaleTimeString();
  out.push(c.bold(`houdinimd.com`) + c.dim(`  ·  ${stamp}  ·  refresh ${intervalSec}s`) + (exclude ? "" : c.yellow("  · your own visits included")));
  out.push("");

  out.push(c.bold(`ON THE SITE NOW`) + c.dim(` (last ${LIVE_MINUTES} min)`));
  for (const kind of KINDS) {
    const r = by(live, kind);
    out.push(`  ${KIND_COLOUR[kind](kind.padEnd(8))} ${String(num(r?.visitors)).padStart(4)} ${c.dim("visitors")}  ${String(num(r?.views)).padStart(5)} ${c.dim("views")}`);
  }
  out.push("");

  out.push(c.bold(`LAST ${windowMin} MIN`));
  const maxViews = Math.max(1, ...recent.map((r) => num(r.views)));
  for (const kind of KINDS) {
    const r = by(recent, kind);
    out.push(
      `  ${KIND_COLOUR[kind](kind.padEnd(8))} ${String(num(r?.views)).padStart(5)} ${c.dim("views")} ` +
        `${String(num(r?.visitors)).padStart(4)} ${c.dim("visitors")}  ${KIND_COLOUR[kind](bar(num(r?.views), maxViews))}`,
    );
  }
  out.push("");

  out.push(c.bold(`TOP PAGES`) + c.dim(` (last ${windowMin} min)`));
  if (paths.length === 0) out.push(c.dim("  no traffic"));
  const maxPath = Math.max(1, ...paths.map((r) => num(r.views)));
  for (const r of paths) {
    const kind = (KINDS.includes(r.kind as Kind) ? r.kind : "agent") as Kind;
    const label = r.path.length > 52 ? "…" + r.path.slice(-51) : r.path;
    out.push(`  ${String(num(r.views)).padStart(5)} ${KIND_COLOUR[kind](kind.padEnd(8))} ${label.padEnd(52)} ${c.dim(bar(num(r.views), maxPath, 12))}`);
  }

  if (!args.flags.has("once")) process.stdout.write("\x1b[2J\x1b[H");
  console.log(out.join("\n"));
}

const exclude = args.flags.has("keep-mine") ? null : await ownIpHash();
if (!exclude && !args.flags.has("keep-mine")) {
  console.error(c.yellow("Could not read this machine's public IP — showing unfiltered traffic."));
}

for (;;) {
  try {
    await render(exclude);
  } catch (err) {
    console.error(c.red(`query failed: ${(err as Error).message}`));
  }
  if (args.flags.has("once")) break;
  await new Promise((r) => setTimeout(r, intervalSec * 1000));
}
