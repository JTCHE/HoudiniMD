import { NextRequest } from "next/server";
import Fuse from "fuse.js";
import { fetchIndexJson } from "@/lib/r2/read";
import type { SearchIndexEntry } from "@/lib/r2/search-index";
import {
  toIndexed,
  rankResults,
  FUSE_OPTIONS,
  type IndexedEntry,
} from "@/lib/search/ranking";

// Module-level caches survive across requests on a WARM isolate. The Fuse index
// is the expensive thing to construct (tokenizing ~10.5k entries), so we build
// it at most once per isolate AND only when a query actually needs the fuzzy
// fallback — exact/prefix queries (the common case) never build it. This is
// what keeps the route under the 10ms CPU limit on most requests. The
// user-facing overlay now searches client-side, so this endpoint is primarily
// for external API callers.
let cache: { indexed: IndexedEntry[]; fuse: Fuse<IndexedEntry> | null; expiry: number } | null = null;

const ROOT = process.env.URL ?? "https://houdinimd.jchd.me";

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
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);

  if (!q) {
    return Response.json(
      { error: "Missing required parameter: q" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const raw = await fetchIndexJson();
  if (!raw) {
    return Response.json(
      { error: "Search index unavailable" },
      { status: 503, headers: CORS_HEADERS }
    );
  }

  if (!cache || Date.now() >= cache.expiry) {
    const entries: SearchIndexEntry[] = JSON.parse(raw);
    cache = { indexed: toIndexed(entries), fuse: null, expiry: Date.now() + 5 * 60 * 1000 };
  }
  const { indexed } = cache;
  const makeFuse = () => {
    if (!cache!.fuse) cache!.fuse = new Fuse(indexed, FUSE_OPTIONS);
    return cache!.fuse;
  };

  const ranked = rankResults(indexed, q, limit, makeFuse, category);
  const results = ranked.map((r) => ({
    ...r,
    docs_url: `/docs/${r.path}`,
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
