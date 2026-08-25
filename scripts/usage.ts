#!/usr/bin/env bun
/**
 * Daily bleed check, and a forecast of what the billing cycle closes at.
 *
 * The billing dashboard lags a day, which is a day too late to catch a crawler
 * wave. The GraphQL analytics API is current to the minute and reaches back
 * past the start of the cycle, so this reads both:
 *
 *   window — the last N hours, to see whether anything is bleeding right now.
 *   cycle  — everything since the anniversary day, plus the remaining days at
 *            the rate the window measured.
 *
 *   bun run usage        # last 24h
 *   bun run usage 6      # last 6h
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const ACCOUNT = process.env.R2_ACCOUNT_ID;
const TOKEN = process.env.CF_ANALYTICS_TOKEN;
const ZONE_NAME = "houdinimd.com";
const HOURS = Number(process.argv[2] ?? 24);
/** Day of the month the Cloudflare billing cycle rolls over. */
const CYCLE_DAY = 11;

if (!ACCOUNT || !TOKEN) {
  console.error("Set R2_ACCOUNT_ID and CF_ANALYTICS_TOKEN in .env.local");
  process.exit(2);
}

/**
 * Every meter below bills per million, and Cloudflare rounds the billable
 * amount up to a whole unit before it applies the rate: one operation past the
 * allowance costs a full million. That makes each meter a cliff, not a slope —
 * 59k GB-s past the Durable Object allowance costs the whole $12.50.
 * https://developers.cloudflare.com/r2/pricing/
 */
const UNIT = 1_000_000;

/** Class A is every R2 operation that mutates or lists. Everything else is B. */
const CLASS_A = new Set([
  "ListBuckets", "PutObject", "CopyObject", "CompleteMultipartUpload",
  "CreateMultipartUpload", "ListMultipartUploads", "UploadPart", "UploadPartCopy",
  "ListObjects", "PutBucket", "ListParts", "DeleteObjects", "DeleteObject",
  "PutBucketEncryption", "PutBucketCors", "PutBucketLifecycleConfiguration",
  "LifecycleStorageTierTransition",
]);

/** Name, monthly allowance, and dollars per million, per Cloudflare pricing. */
const PLAN = [
  { key: "workerRequests", name: "Workers requests", included: 10_000_000, rate: 0.3 },
  { key: "workerCpuMs", name: "Workers CPU-ms", included: 30_000_000, rate: 0.02 },
  { key: "d1RowsRead", name: "D1 rows read", included: 25_000_000_000, rate: 0.001 },
  { key: "d1RowsWritten", name: "D1 rows written", included: 50_000_000, rate: 1 },
  { key: "r2ClassA", name: "R2 class A ops", included: 1_000_000, rate: 4.5 },
  { key: "r2ClassB", name: "R2 class B ops", included: 10_000_000, rate: 0.36 },
  { key: "doRequests", name: "DO requests", included: 1_000_000, rate: 0.15 },
  { key: "doGbSeconds", name: "DO GB-s", included: 400_000, rate: 12.5 },
] as const;

type MeterKey = (typeof PLAN)[number]["key"];
type Usage = Record<MeterKey, number>;

/** Every dataset row we read has this shape: named metrics plus dimensions. */
type Row = {
  sum?: Record<string, number>;
  max?: Record<string, number>;
  count?: number;
  dimensions: Record<string, string>;
};
type Datasets = Record<string, Row[]>;

async function gql(query: string, variables: Record<string, unknown>) {
  const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await res.json()) as {
    errors?: unknown;
    data?: { viewer: { accounts?: Datasets[]; zones?: Datasets[] } };
  };
  if (body.errors) {
    console.error("  ! query failed:", JSON.stringify(body.errors).slice(0, 200));
    return null;
  }
  return body.data ?? null;
}

const FILTER = "filter:{datetime_geq:$since, datetime_leq:$until}";
const QUERY = `query($acct:String!,$since:Time!,$until:Time!){viewer{accounts(filter:{accountTag:$acct}){
  workersInvocationsAdaptive(limit:10000, ${FILTER}){
    sum{requests errors cpuTimeUs} dimensions{datetimeHour}}
  d1AnalyticsAdaptiveGroups(limit:10000, ${FILTER}){
    sum{rowsRead rowsWritten} dimensions{datetimeHour}}
  r2OperationsAdaptiveGroups(limit:10000, ${FILTER}){
    sum{requests} dimensions{datetimeHour bucketName actionType}}
  r2StorageAdaptiveGroups(limit:500, ${FILTER}){
    max{objectCount payloadSize} dimensions{datetime bucketName}}
  durableObjectsInvocationsAdaptiveGroups(limit:10000, ${FILTER}){
    sum{requests} dimensions{datetimeHour}}
  durableObjectsPeriodicGroups(limit:10000, ${FILTER}){
    sum{activeTime} dimensions{datetimeHour}}
}}}`;

const sum = (rows: Row[] | undefined, field: string) =>
  (rows ?? []).reduce((n, r) => n + (r.sum?.[field] ?? 0), 0);

async function collect(since: Date, until: Date) {
  const data = await gql(QUERY, { acct: ACCOUNT, since: since.toISOString(), until: until.toISOString() });
  if (!data) return null;
  const sets = data.viewer.accounts![0];
  const r2Ops = sets.r2OperationsAdaptiveGroups ?? [];
  let classA = 0, classB = 0;
  for (const row of r2Ops) {
    if (CLASS_A.has(row.dimensions.actionType)) classA += row.sum!.requests;
    else classB += row.sum!.requests;
  }
  const workers = sets.workersInvocationsAdaptive ?? [];
  const usage: Usage = {
    workerRequests: sum(workers, "requests"),
    workerCpuMs: sum(workers, "cpuTimeUs") / 1000,
    d1RowsRead: sum(sets.d1AnalyticsAdaptiveGroups, "rowsRead"),
    d1RowsWritten: sum(sets.d1AnalyticsAdaptiveGroups, "rowsWritten"),
    r2ClassA: classA,
    r2ClassB: classB,
    doRequests: sum(sets.durableObjectsInvocationsAdaptiveGroups, "requests"),
    // Duration bills as GB-s, and a Durable Object holds 128 MB.
    doGbSeconds: (sum(sets.durableObjectsPeriodicGroups, "activeTime") / 1e6) * 0.125,
  };
  return { usage, sets };
}

function spark(rows: Row[], value: (row: Row) => number) {
  const by = new Map<string, number>();
  for (const row of rows) {
    const hour = row.dimensions.datetimeHour;
    by.set(hour, (by.get(hour) ?? 0) + value(row));
  }
  const series = [...by].sort().map(([, v]) => v);
  const bars = "▁▂▃▄▅▆▇█";
  const peak = Math.max(1, ...series);
  return series.map((v) => bars[Math.min(7, Math.floor((v / peak) * 7))]).join("");
}

const now = new Date();
const windowStart = new Date(now.getTime() - HOURS * 3_600_000);

// Cycle runs CYCLE_DAY to CYCLE_DAY. Before the anniversary we are still in
// the cycle that opened last month.
const cycleStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (now.getUTCDate() < CYCLE_DAY ? 1 : 0), CYCLE_DAY));
const cycleEnd = new Date(Date.UTC(cycleStart.getUTCFullYear(), cycleStart.getUTCMonth() + 1, CYCLE_DAY));
const daysLeft = Math.max(0, (cycleEnd.getTime() - now.getTime()) / 86_400_000);

const win = await collect(windowStart, now);
const cycle = await collect(cycleStart, now);
if (!win || !cycle) process.exit(2);

// ----------------------------------------------------------------- Window
console.log(`window  ${windowStart.toISOString().slice(0, 16)} -> ${now.toISOString().slice(0, 16)} UTC (${HOURS}h)`);
console.log(`   workers        ${Math.round(win.usage.workerRequests).toLocaleString()} req, ` +
  `${sum(win.sets.workersInvocationsAdaptive, "errors").toLocaleString()} errors, ` +
  `~${Math.round(win.usage.workerCpuMs).toLocaleString()} cpu-ms`);
console.log(`   d1             ${win.usage.d1RowsRead.toLocaleString()} rows read, ${win.usage.d1RowsWritten.toLocaleString()} written`);
console.log(`   durable object ${win.usage.doRequests.toLocaleString()} req, ${Math.round(win.usage.doGbSeconds).toLocaleString()} GB-s`);

const byAction = new Map<string, number>();
for (const row of win.sets.r2OperationsAdaptiveGroups ?? []) {
  const key = `${row.dimensions.bucketName}/${row.dimensions.actionType}`;
  byAction.set(key, (byAction.get(key) ?? 0) + row.sum!.requests);
}
console.log("   r2 operations");
for (const [key, n] of [...byAction].sort((x, y) => y[1] - x[1]).slice(0, 6))
  console.log(`      ${key.padEnd(34)} ${n.toLocaleString()}`);
const newest = new Map<string, Row>();
for (const g of win.sets.r2StorageAdaptiveGroups ?? []) newest.set(g.dimensions.bucketName, g);
for (const [bucket, g] of newest)
  console.log(`      ${bucket.padEnd(34)} ${g.max!.objectCount.toLocaleString()} objects, ${(g.max!.payloadSize / 1e9).toFixed(2)} GB`);

console.log(`   zone requests  ${spark(win.sets.workersInvocationsAdaptive ?? [], (r) => r.sum!.requests)}`);
console.log(`   r2 puts        ${spark((win.sets.r2OperationsAdaptiveGroups ?? []).filter((r) => r.dimensions.actionType === "PutObject"), (r) => r.sum!.requests)}`);
console.log(`   d1 rows read   ${spark(win.sets.d1AnalyticsAdaptiveGroups ?? [], (r) => r.sum!.rowsRead)}`);

// ------------------------------------------------------------------ Zone
const zoneList = (await (await fetch(`https://api.cloudflare.com/client/v4/zones?name=${ZONE_NAME}`, {
  headers: { Authorization: `Bearer ${TOKEN}` },
})).json()) as { result?: { id: string }[] };
const zone = zoneList.result?.[0]?.id;
if (zone) {
  const http = await gql(
    `query($zone:String!,$since:Time!,$until:Time!){viewer{zones(filter:{zoneTag:$zone}){
      httpRequestsAdaptiveGroups(limit:10000, ${FILTER}){count dimensions{edgeResponseStatus}}}}}`,
    { zone, since: windowStart.toISOString(), until: now.toISOString() },
  );
  if (http) {
    const rows = http.viewer.zones![0].httpRequestsAdaptiveGroups;
    const byStatus = new Map<string, number>();
    let total = 0;
    for (const row of rows) {
      total += row.count!;
      const status = row.dimensions.edgeResponseStatus;
      byStatus.set(status, (byStatus.get(status) ?? 0) + row.count!);
    }
    console.log(`   edge           ${total.toLocaleString()} requests   ` +
      [...byStatus].sort((x, y) => y[1] - x[1]).slice(0, 8).map(([s, n]) => `${s}=${n.toLocaleString()}`).join("  "));
    const failed = ["500", "503", "504"].reduce((n, s) => n + (byStatus.get(s) ?? 0), 0);
    if (failed / Math.max(1, total) > 0.02)
      console.log(`   ! ${failed.toLocaleString()} 5xx, ${((100 * failed) / total).toFixed(1)}% of requests`);
  }
}

// ----------------------------------------------------------------- Cycle
const perDay = (used: number) => (used / HOURS) * 24;
console.log(`\ncycle   ${cycleStart.toISOString().slice(0, 10)} -> ${cycleEnd.toISOString().slice(0, 10)}, ${daysLeft.toFixed(1)} days left`);
console.log(`\n${"meter".padEnd(18)}${"so far".padStart(16)}${"at close".padStart(16)}${"billable".padStart(16)}${"units".padStart(7)}${"cost".padStart(9)}${"headroom".padStart(15)}`);

let bill = 0;
for (const meter of PLAN) {
  const soFar = cycle.usage[meter.key];
  const close = soFar + perDay(win.usage[meter.key]) * daysLeft;
  const billable = Math.max(0, close - meter.included);
  const units = Math.ceil(billable / UNIT);
  const cost = units * meter.rate;
  bill += cost;
  // Distance to the next charge: the allowance still unused, or the room left
  // inside the unit already paid for.
  const headroom = billable === 0 ? meter.included - close : units * UNIT - billable;
  console.log(
    meter.name.padEnd(18) +
    Math.round(soFar).toLocaleString().padStart(16) +
    Math.round(close).toLocaleString().padStart(16) +
    Math.round(billable).toLocaleString().padStart(16) +
    String(units).padStart(7) +
    `$${cost.toFixed(2)}`.padStart(9) +
    Math.round(headroom).toLocaleString().padStart(15),
  );
}
console.log(`${"cycle close".padEnd(18)}${("$" + bill.toFixed(2)).padStart(79)}`);
process.exit(bill > 1 ? 1 : 0);
