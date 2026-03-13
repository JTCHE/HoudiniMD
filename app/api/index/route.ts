import { NextRequest } from "next/server";
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
  const category = searchParams.get("category")?.trim();
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);

  const raw = await fetchFromR2("content/index.json");
  if (!raw) {
    return Response.json(
      { error: "Index unavailable" },
      { status: 503, headers: CORS_HEADERS }
    );
  }

  let entries: SearchIndexEntry[] = JSON.parse(raw);

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
    { headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=60" } }
  );
}
