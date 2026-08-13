import { SITE_URL as ROOT } from "@/lib/site";
import { NextRequest } from "next/server";
import { getConfig } from "@/lib/r2/config";
import { stageLogger } from "@/lib/perf-log";
import { rankResults } from "@/lib/search/ranking";
import { DOCS_KEY, type DocsTable } from "@/lib/search/bm25";

// The doc table is the only thing this route parses per isolate; postings are
// fetched per query and cached inside lib/search/bm25. Previously the route
// built a full Fuse index over ~10.5k entries on the first fuzzy query, which
// is where 350-600ms of every cold search went.
let cache: { table: DocsTable; expiry: number } | null = null;
const TABLE_TTL = 5 * 60 * 1000;

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

  const config = getConfig();
  if (!config) {
    return Response.json(
      { error: "Search index unavailable" },
      { status: 503, headers: CORS_HEADERS }
    );
  }

  const mark = stageLogger("search", q);
  mark("start");

  if (!cache || Date.now() >= cache.expiry) {
    mark("fetch-docs:start");
    const res = await fetch(`${config.publicUrl}/${DOCS_KEY}`);
    mark("fetch-docs:done");
    if (!res.ok) {
      return Response.json(
        { error: "Search index unavailable" },
        { status: 503, headers: CORS_HEADERS }
      );
    }
    mark("parse-docs:start");
    const table: DocsTable = await res.json();
    mark("parse-docs:done");
    cache = { table, expiry: Date.now() + TABLE_TTL };
  } else {
    mark("cache-hit");
  }

  mark("rank:start");
  const ranked = await rankResults(cache.table, q, limit, category);
  mark("rank:done");

  const results = ranked.map((r) => ({
    ...r,
    docs_url: `${ROOT}/docs/${r.path}`,
    raw_url: `${ROOT}/docs/${r.path}.md`,
  }));

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
