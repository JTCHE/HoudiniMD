import { getCloudflareContext } from "@opennextjs/cloudflare";
import { isAuthorized, isValidVisitor, unhideVisitor } from "@/telemetry/hidden";
import type { TelemetryEnv } from "@/telemetry/types";

export const dynamic = "force-dynamic";

async function loadEnv(): Promise<TelemetryEnv> {
  const { env: cfEnv } = await getCloudflareContext({ async: true });
  return cfEnv as unknown as TelemetryEnv;
}

/** `DELETE /api/hidden/:visitor` — the remote half of `X` and `Z` (undo). */
export async function DELETE(request: Request, { params }: { params: Promise<{ visitor: string }> }) {
  const env = await loadEnv();
  if (!isAuthorized(request, env)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "D1 unavailable" }, { status: 503 });

  const { visitor } = await params;
  if (!isValidVisitor(visitor)) return Response.json({ error: "Invalid visitor" }, { status: 400 });

  await unhideVisitor(env, visitor);
  return Response.json({ ok: true });
}
