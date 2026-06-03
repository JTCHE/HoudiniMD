import { getConfig } from "@/lib/r2/config";

/**
 * Serves the raw search index for the CLIENT-side search overlay, same-origin
 * (avoids cross-origin CORS to the R2 public domain).
 *
 * It streams the R2 object body straight through — no `.text()` decode and no
 * string re-encode. Decoding+re-encoding the ~2.9MB index in JS was enough to
 * blow a cold isolate's 10ms CPU budget; piping the byte stream is near-free.
 * Combined with the long edge cache, the Worker is rarely even invoked.
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const CACHE_CONTROL =
  "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  const config = getConfig();
  if (!config) {
    return Response.json(
      { error: "Search index unavailable" },
      { status: 503, headers: CORS_HEADERS },
    );
  }

  // Proxy the R2 public object, piping its body stream through unchanged.
  const upstream = await fetch(`${config.publicUrl}/content/index.json`);
  if (!upstream.ok || !upstream.body) {
    return Response.json(
      { error: "Search index unavailable" },
      { status: 503, headers: CORS_HEADERS },
    );
  }

  return new Response(upstream.body, {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": CACHE_CONTROL,
    },
  });
}
