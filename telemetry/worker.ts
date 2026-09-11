/**
 * The receiving end of the desktop app's anonymous telemetry.
 *
 * The app posts one small JSON event (`src-tauri/src/telemetry.rs`); this
 * checks its shape and writes one Analytics Engine data point. No database, no
 * IP, no header kept. Separate from the site worker on purpose: the site's D1
 * pipeline is for page views, and this is not that. See spec: Opt-in
 * Anonymous Telemetry.
 *
 *   bunx wrangler dev          # local, from this folder
 *   bunx wrangler deploy       # needs telemetry.houdinimd.com on the account
 *
 * Read it with the Analytics Engine SQL API:
 *   SELECT blob1 AS kind, blob3 AS build, count() FROM houdinimd_app GROUP BY kind, build
 * Mean reciprocal rank, which says whether the search is getting better:
 *   SELECT avg(if(double6 < 0, 0, 1 / (double6 + 1))) FROM houdinimd_app WHERE blob1 = 'search'
 * `index1` is the install id. `visitorName()` in houdinimd-analytics turns it
 * into a readable name.
 */

interface Env {
  EVENTS: { writeDataPoint(point: { indexes: string[]; blobs: string[]; doubles: number[] }): void };
  LIMITER: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

const KINDS = new Set(["launch", "index", "pages", "crash", "error", "setup", "feature", "search"]);

const str = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST" || new URL(request.url).pathname !== "/v1/event") {
      return new Response(null, { status: 404 });
    }
    const text = await request.text();
    if (text.length > 8192) return new Response(null, { status: 413 });

    let event: Record<string, unknown>;
    try {
      event = JSON.parse(text);
    } catch {
      return new Response(null, { status: 400 });
    }
    const id = event.id;
    if (!KINDS.has(event.kind as string) || typeof id !== "string" || !/^[0-9a-f]{32}$/.test(id)) {
      return new Response(null, { status: 400 });
    }
    // A loop in one app must not become a bill.
    if (!(await env.LIMITER.limit({ key: id })).success) return new Response(null, { status: 429 });

    // Blob and double order is the schema; append, never reorder.
    env.EVENTS.writeDataPoint({
      indexes: [id],
      blobs: [event.kind as string, str(event.app, 32), str(event.build, 32), str(event.os, 64), str(event.message, 4000)],
      doubles: [num(event.seconds), num(event.pages), num(event.count), num(event.median_ms), num(event.p95_ms), num(event.rank)],
    });
    return new Response(null, { status: 204 });
  },
};
