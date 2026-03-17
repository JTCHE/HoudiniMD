import { NextRequest } from "next/server";
import Fuse from "fuse.js";
import { fetchIndexJson } from "@/lib/r2/read";
import type { SearchIndexEntry } from "@/lib/r2/search-index";

type IndexedEntry = SearchIndexEntry & { slug: string };
let fuseCache: { fuse: Fuse<IndexedEntry>; indexed: IndexedEntry[]; indexExpiry: number } | null = null;

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

  const raw = await fetchIndexJson();
  if (!raw) {
    return Response.json(
      { error: "Search index unavailable" },
      { status: 503, headers: CORS_HEADERS }
    );
  }

  // Rebuild Fuse only when index cache refreshes
  if (!fuseCache || Date.now() >= fuseCache.indexExpiry) {
    const entries: SearchIndexEntry[] = JSON.parse(raw);
    const indexed = entries.map((e) => ({ ...e, slug: e.path.split("/").pop() ?? e.path }));
    const fuse = new Fuse(indexed, {
      keys: [
        { name: "slug", weight: 0.45 },
        { name: "title", weight: 0.35 },
        { name: "summary", weight: 0.1 },
        { name: "path", weight: 0.1 },
      ],
      threshold: 0.5,
      includeScore: true,
      ignoreLocation: true,
    });
    fuseCache = { fuse, indexed, indexExpiry: Date.now() + 5 * 60 * 1000 };
  }

  let { indexed } = fuseCache;
  const { fuse } = fuseCache;

  if (category) {
    indexed = indexed.filter(
      (e) => e.category.toLowerCase() === category.toLowerCase()
    );
  }

  const qLower = q.toLowerCase().replace(/\s+/g, "");

  // 1. Prefix matches — "copytop" instantly finds "copytopoints"
  const prefixHits = new Map<string, IndexedEntry>();
  for (const e of indexed) {
    if (e.slug.startsWith(qLower) || e.title.toLowerCase().replace(/\s+/g, "").startsWith(qLower)) {
      prefixHits.set(e.path, e);
      if (prefixHits.size >= limit) break;
    }
  }

  // 2. Fuse fuzzy fallback

  const fuseHits = fuse.search(q, { limit });

  // Sort prefix hits: title starts with query > slug-only match (both normalized)
  const sortedPrefix = [...prefixHits.values()].sort((a, b) => {
    const aTitle = +!a.title.toLowerCase().replace(/\s+/g, "").startsWith(qLower);
    const bTitle = +!b.title.toLowerCase().replace(/\s+/g, "").startsWith(qLower);
    return aTitle - bTitle;
  });

  // Merge: prefix matches first (score 1.0), then fuzzy (deduped)
  // Examples are deprioritized to the back within each group (stable sort)
  const seen = new Set(prefixHits.keys());
  const merged = [
    ...sortedPrefix.map((item) => ({ item, score: 0 })),
    ...fuseHits.filter((r) => !seen.has(r.item.path)),
  ]
    .sort((a, b) => +a.item.path.includes("/examples/") - +b.item.path.includes("/examples/"))
    .slice(0, limit);

  // Deduplicate anchor fragments: if "foo#bar" and "foo" both appear, keep only "foo"
  const seenBase = new Set<string>();
  const deduped = merged.filter(({ item }) => {
    const base = item.path.split("#")[0];
    if (seenBase.has(base)) return false;
    seenBase.add(base);
    return true;
  });

  const results = deduped
    .map(({ item, score }) => ({
      path: item.path,
      title: item.title,
      summary: item.summary,
      category: item.category,
      version: item.version,
      score: score !== undefined ? Math.round((1 - score) * 100) / 100 : null,
      docs_url: `/docs/${item.path}`,
      raw_url: `${ROOT}/docs/${item.path}.md`,
    }));

  return Response.json(
    { query: q, total: results.length, results },
    { headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } }
  );
}
