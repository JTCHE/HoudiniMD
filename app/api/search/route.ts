import { NextRequest } from "next/server";
import Fuse from "fuse.js";
import { fetchFromR2 } from "@/lib/r2/read";
import type { SearchIndexEntry } from "@/lib/r2/search-index";

const ROOT = process.env.ROOT_URL ?? "https://vexllm.jchd.me";

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

  const raw = await fetchFromR2("content/index.json");
  if (!raw) {
    return Response.json(
      { error: "Search index unavailable" },
      { status: 503, headers: CORS_HEADERS }
    );
  }

  let entries: SearchIndexEntry[] = JSON.parse(raw);

  if (category) {
    entries = entries.filter(
      (e) => e.category.toLowerCase() === category.toLowerCase()
    );
  }

  const fuse = new Fuse(entries, {
    keys: [
      { name: "title", weight: 0.5 },
      { name: "summary", weight: 0.3 },
      { name: "path", weight: 0.2 },
    ],
    threshold: 0.4,
    includeScore: true,
  });

  const results = fuse
    .search(q, { limit })
    .map(({ item, score }) => ({
      path: item.path,
      title: item.title,
      summary: item.summary,
      category: item.category,
      version: item.version,
      score: score !== undefined ? Math.round((1 - score) * 100) / 100 : null,
      docs_url: `${ROOT}/docs/${item.path}`,
      raw_url: `${ROOT}/docs/${item.path}.md`,
    }));

  return Response.json(
    { query: q, total: results.length, results },
    { headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=60" } }
  );
}
