import { NextRequest } from "next/server";
import { stageLogger } from "@/lib/perf-log";
import { searchDocs, SearchUnavailableError } from "@/lib/search/server";

// The ranking, the R2 table and its per-isolate cache all live in
// lib/search/server.ts, so a route inside the Worker can call the search
// without paying for a second invocation. This is the HTTP face of it.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = searchParams.get("q")?.trim();
  const category = searchParams.get("category")?.trim();
  const requestedLimit = parseInt(searchParams.get("limit") ?? "20", 10);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 100)) : 20;

  if (!q) {
    return Response.json(
      { error: "Missing required parameter: q" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const mark = stageLogger("search", q);
  mark("start");

  let results;
  try {
    results = await searchDocs(q, limit, category, mark);
  } catch (err) {
    if (err instanceof SearchUnavailableError) {
      return Response.json(
        { error: "Search index unavailable" },
        { status: 503, headers: CORS_HEADERS }
      );
    }
    throw err;
  }

  return Response.json(
    { query: q, total: results.length, results },
    {
      headers: {
        ...CORS_HEADERS,
        // Edge-cache identical queries so repeats never reach the Worker.
        "Cache-Control": "public, max-age=60, s-maxage=86400, stale-while-revalidate=604800",
      },
    }
  );
}
