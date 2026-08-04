import { NextRequest } from "next/server";
import { fetchIndexJson, fetchFromR2 } from "@/lib/r2/read";
import { LITE_INDEX_PATH, toLiteIndex, type LiteIndexEntry } from "@/lib/r2/search-index";
import { stageLogger } from "@/lib/perf-log";
import Fuse from "fuse.js";

// Ordered by how commonly nodes are looked up
const CANDIDATE_PATTERNS = [
  (name: string) => `houdini/nodes/sop/${name}`,
  (name: string) => `houdini/nodes/dop/${name}`,
  (name: string) => `houdini/nodes/vop/${name}`,
  (name: string) => `houdini/nodes/lop/${name}`,
  (name: string) => `houdini/nodes/cop2/${name}`,
  (name: string) => `houdini/nodes/out/${name}`,
  (name: string) => `houdini/nodes/chop/${name}`,
  (name: string) => `houdini/nodes/top/${name}`,
  (name: string) => `houdini/vex/functions/${name}`,
  (name: string) => `houdini/expressions/${name}`,
];

const SIDEFX_BASE = "https://www.sidefx.com/docs";

// Warm-isolate caches. This route only ever needs `path`+`title`, so it reads
// the slim, pre-normalized `content/index-lite.json` (~34% the size of the
// full index) instead of the full index — parsing the full 2.49MB index alone
// was enough to blow the 10ms CPU limit on a cold isolate (confirmed via
// wrangler tail: exact-match lookups for common words like "box" failed
// ~50% of the time with Error 1102, before any Fuse work even ran). Falls
// back to deriving the lite shape from the full index if the lite artifact is
// missing (e.g. a deploy landing before the next regen has written it).
let entriesCache: { entries: LiteIndexEntry[]; expiry: number } | null = null;
let fuseCache: Fuse<LiteIndexEntry> | null = null;

async function loadLiteEntries(mark: (stage: string) => void): Promise<LiteIndexEntry[] | null> {
  mark("fetch-lite:start");
  const liteRaw = await fetchFromR2(LITE_INDEX_PATH, true);
  mark("fetch-lite:done");
  if (liteRaw) {
    mark("parse-lite:start");
    const parsed = JSON.parse(liteRaw);
    mark("parse-lite:done");
    return parsed;
  }
  mark("fetch-full-fallback:start");
  const fullRaw = await fetchIndexJson();
  mark("fetch-full-fallback:done");
  if (!fullRaw) return null;
  mark("parse-full-fallback:start");
  const parsed = JSON.parse(fullRaw);
  mark("parse-full-fallback:done");
  mark("to-lite:start");
  const lite = toLiteIndex(parsed);
  mark("to-lite:done");
  return lite;
}

async function probeSlug(slug: string): Promise<boolean> {
  try {
    const res = await fetch(`${SIDEFX_BASE}/${slug}.html`, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

async function searchFallback(request: NextRequest, input: string): Promise<string | undefined> {
  try {
    const response = await fetch(new URL(`/api/search?q=${encodeURIComponent(input)}&limit=1`, request.url));
    const body = await response.json() as { results?: Array<{ path?: string }> };
    return response.ok ? body.results?.[0]?.path : undefined;
  } catch {
    return undefined;
  }
}

export async function GET(request: NextRequest) {
  const input = request.nextUrl.searchParams.get("name")?.trim().toLowerCase() ?? "";
  if (!input) {
    return Response.json({ error: "Missing required parameter: name" }, { status: 400 });
  }
  const mark = stageLogger("resolve", input);
  mark("start");

  // Build name variants: hyphenated ("pyro-solver") and no-spaces ("pyrosolver")
  const nameHyphen = input.replace(/\s+/g, "-");
  const nameCompact = input.replace(/\s+/g, "");
  const names = nameHyphen === nameCompact ? [nameHyphen] : [nameHyphen, nameCompact];

  // 1. Try the search index first (fast, no external requests)
  if (!entriesCache || Date.now() >= entriesCache.expiry) {
    const entries = await loadLiteEntries(mark);
    if (entries) {
      entriesCache = { entries, expiry: Date.now() + 5 * 60 * 1000 };
      fuseCache = null; // index changed — drop the stale Fuse
    }
  } else {
    mark("cache-hit");
  }
  if (entriesCache) {
    const { entries } = entriesCache;
    const inputPath = input.replace(/^\/?docs\//, "").replace(/\.html$/, "").replace(/^\/+|\/+$/g, "");
    const directMatch = entries.find((e) => e.path.toLowerCase() === inputPath);
    if (directMatch) {
      mark("hit:index-path");
      return Response.json(
        { slug: directMatch.path, source: "index-path" },
        { headers: { "Cache-Control": "private, max-age=3600" } },
      );
    }
    // Built lazily, only when the fuzzy fallback is actually reached.
    const getFuse = () =>
      (fuseCache ??= new Fuse(entries, {
        keys: [{ name: "title", weight: 0.6 }, { name: "path", weight: 0.4 }],
        threshold: 0.3,
        ignoreLocation: true,
      }));

    for (const n of names) {
      // 1a. Try exact title or path slug match first (case-insensitive, spaces removed)
      mark("exact-scan:start");
      const nNorm = n.replace(/\s+/g, "");
      const exactMatches = entries.filter((e) => {
        return (e.t === nNorm || e.s === n) && !e.path.includes("/examples/");
      });
      mark("exact-scan:done");
      const exactMatch = exactMatches[0];
      if (exactMatch) {
        // Duplicate titles need the shared ranker's category weights; the lite
        // index intentionally omits categories to keep cold resolves under CPU limits.
        if (exactMatches.length > 1) {
          mark("search-ambiguous:start");
          const slug = await searchFallback(request, input);
          if (slug) {
            mark("hit:search-ambiguous");
            return Response.json(
              { slug, source: "search-ambiguous" },
              { headers: { "Cache-Control": "private, max-age=3600" } },
            );
          }
        }
        mark("hit:index-exact");
        return Response.json(
          { slug: exactMatch.path, source: "index-exact" },
          { headers: { "Cache-Control": "private, max-age=3600" } },
        );
      }

      // 1b. Try prefix match on title/path (faster than fuzzy, more precise)
      mark("prefix-scan:start");
      const prefixMatch = entries.find((e) => {
        return (e.t.startsWith(nNorm) || e.s.startsWith(n)) &&
               !e.path.includes("/examples/");
      });
      mark("prefix-scan:done");
      if (prefixMatch) {
        mark("hit:index-prefix");
        return Response.json(
          { slug: prefixMatch.path, source: "index-prefix" },
          { headers: { "Cache-Control": "private, max-age=3600" } },
        );
      }

      // 1c. Fall back to fuzzy search — only return high-confidence results
      mark("fuse-build:start");
      const fuse = getFuse();
      mark("fuse-build:done");
      mark("fuse-search:start");
      const results = fuse.search(n, { limit: 10 });
      mark("fuse-search:done");
      if (results.length > 0) {
        // Prioritize exact slug match within fuzzy results (handles uncrawled titles)
        const exactSlug = results.find((r) => {
          const pathLast = r.item.path.split("/").pop()?.toLowerCase() ?? "";
          return pathLast === n && !r.item.path.includes("/examples/");
        });
        if (exactSlug) {
          return Response.json(
            { slug: exactSlug.item.path, source: "index-fuzzy-exact" },
            { headers: { "Cache-Control": "private, max-age=3600" } },
          );
        }
        // Only return a fuzzy result if the score is genuinely good — no loose fallback
        // (loose fallback caused "fuse" → "diffuse" since "fuse" is a substring of "diffuse")
        const best = results.find((r) => r.score! < 0.15 && !r.item.path.includes("/examples/"));
        if (best) {
          return Response.json(
            { slug: best.item.path, source: "index-fuzzy" },
            { headers: { "Cache-Control": "private, max-age=3600" } },
          );
        }
        // No confident fuzzy match → fall through to probe stage
      }
    }
  }

  mark("probe:start");
  // 2. Probe common Houdini path patterns against SideFX in parallel batches
  const batches = [
    CANDIDATE_PATTERNS.slice(0, 4),
    CANDIDATE_PATTERNS.slice(4),
  ];

  for (const n of names) {
    for (const batch of batches) {
      const candidates = batch.map((fn) => fn(n));
      const results = await Promise.all(candidates.map((slug) => probeSlug(slug).then((ok) => ({ slug, ok }))));
      const match = results.find((r) => r.ok);
      if (match) {
        return Response.json(
          { slug: match.slug, source: "probe" },
          { headers: { "Cache-Control": "private, max-age=3600" } },
        );
      }
    }
  }

  // Reuse the full search ranker as the final fallback. It handles path intent
  // (for example, `houdini/nodes/sop/RBDcluster`) and ranks duplicate titles.
  mark("search-fallback:start");
  const slug = await searchFallback(request, input);
  if (slug) {
    mark("hit:search-fallback");
    return Response.json(
      { slug, source: "search-fallback" },
      { headers: { "Cache-Control": "private, max-age=3600" } },
    );
  }

  return Response.json(
    { error: `No documentation found for "${input}". Try a different spelling or paste a SideFX URL directly.` },
    { status: 404 }
  );
}
