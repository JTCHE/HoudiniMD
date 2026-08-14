import { getCloudflareContext } from "@opennextjs/cloudflare";
import { hideVisitor, isAuthorized, isValidVisitor, listHidden } from "@/telemetry/hidden";
import type { TelemetryEnv } from "@/telemetry/types";

// The Worker's write path into the `hidden` table (see migrations/0004_client.sql
// and telemetry/hidden.ts). houdinimd-analytics' D1 token is Read-scoped, so this
// route is the only way it can hide a visitor for every machine, not just its own.
//
// Not in robots.txt, not linked from the site, and every method below rejects
// a request that carries no valid ANALYTICS_ADMIN_TOKEN before it touches D1.
export const dynamic = "force-dynamic";

async function loadEnv(): Promise<TelemetryEnv> {
  const { env: cfEnv } = await getCloudflareContext({ async: true });
  return cfEnv as unknown as TelemetryEnv;
}

/** `GET /api/hidden` — the whole table. Called on TUI start-up (Part 5.4) and on refresh. */
export async function GET(request: Request) {
  const env = await loadEnv();
  if (!isAuthorized(request, env)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "D1 unavailable" }, { status: 503 });
  return Response.json({ hidden: await listHidden(env) });
}

/**
 * `POST /api/hidden` `{ visitor }` — INSERT OR IGNORE, so registering the same
 * machine twice (every dashboard hides every dashboard, including itself) is
 * expected, not an error, and so is `x` hiding an already-hidden visitor.
 */
export async function POST(request: Request) {
  const env = await loadEnv();
  if (!isAuthorized(request, env)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "D1 unavailable" }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { visitor?: unknown } | null;
  const visitor = typeof body?.visitor === "string" ? body.visitor : "";
  if (!isValidVisitor(visitor)) return Response.json({ error: "Invalid visitor" }, { status: 400 });

  await hideVisitor(env, visitor);
  return Response.json({ ok: true });
}
