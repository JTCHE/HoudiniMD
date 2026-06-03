import { NextRequest } from "next/server";
import { fetchIndexJson } from "@/lib/r2/read";
import type { SearchIndexEntry } from "@/lib/r2/search-index";

const ROOT = process.env.URL ?? "https://houdinimd.jchd.me";

// Cache the parsed index per warm isolate so only the first request pays the
// ~2.9MB JSON.parse (the cold-start cost that can brush the 10ms CPU limit).
let entriesCache: { entries: SearchIndexEntry[]; expiry: number } | null = null;

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
  const category = searchParams.get("category")?.trim();
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);

  const raw = await fetchIndexJson();
  if (!raw) {
    return Response.json(
      { error: "Index unavailable" },
      { status: 503, headers: CORS_HEADERS }
    );
  }

  if (!entriesCache || Date.now() >= entriesCache.expiry) {
    entriesCache = { entries: JSON.parse(raw), expiry: Date.now() + 5 * 60 * 1000 };
  }
  let entries: SearchIndexEntry[] = entriesCache.entries;

  if (category) {
    entries = entries.filter(
      (e) => e.category.toLowerCase() === category.toLowerCase()
    );
  }

  const categories = [...new Set(entries.map((e) => e.category))].sort();
  const total = entries.length;
  const offset = (page - 1) * limit;
  const paginated = entries.slice(offset, offset + limit).map((e) => ({
    ...e,
    docs_url: `${ROOT}/docs/${e.path}`,
    raw_url: `${ROOT}/docs/${e.path}.md`,
  }));

  return Response.json(
    {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      categories,
      entries: paginated,
    },
    { headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=60, s-maxage=86400, stale-while-revalidate=604800" } }
  );
}
