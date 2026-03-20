import { NextRequest } from "next/server";
import { fetchIndexJson } from "@/lib/r2/read";
import type { SearchIndexEntry } from "@/lib/r2/search-index";
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

async function probeSlug(slug: string): Promise<boolean> {
  try {
    const res = await fetch(`${SIDEFX_BASE}/${slug}.html`, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const input = request.nextUrl.searchParams.get("name")?.trim().toLowerCase() ?? "";
  if (!input) {
    return Response.json({ error: "Missing required parameter: name" }, { status: 400 });
  }

  // Build name variants: hyphenated ("pyro-solver") and no-spaces ("pyrosolver")
  const nameHyphen = input.replace(/\s+/g, "-");
  const nameCompact = input.replace(/\s+/g, "");
  const names = nameHyphen === nameCompact ? [nameHyphen] : [nameHyphen, nameCompact];

  // 1. Try the search index first (fast, no external requests)
  const indexRaw = await fetchIndexJson();
  if (indexRaw) {
    const entries: SearchIndexEntry[] = JSON.parse(indexRaw);
    const fuse = new Fuse(entries, {
      keys: [{ name: "title", weight: 0.6 }, { name: "path", weight: 0.4 }],
      threshold: 0.3,
      ignoreLocation: true,
    });

    for (const n of names) {
      // 1a. Try exact title match first (case-insensitive, spaces removed)
      const nNorm = n.replace(/\s+/g, "");
      const exactMatch = entries.find((e) =>
        e.title.toLowerCase().replace(/\s+/g, "") === nNorm
      );
      if (exactMatch && !exactMatch.path.includes("/examples/")) {
        return Response.json(
          { slug: exactMatch.path, source: "index-exact" },
          { headers: { "Cache-Control": "private, max-age=3600" } },
        );
      }

      // 1b. Try prefix match on title/path (faster than fuzzy, more precise)
      const prefixMatch = entries.find((e) => {
        const titleNorm = e.title.toLowerCase().replace(/\s+/g, "");
        const pathLast = e.path.split("/").pop()?.toLowerCase() ?? "";
        return (titleNorm.startsWith(nNorm) || pathLast.startsWith(n)) &&
               !e.path.includes("/examples/");
      });
      if (prefixMatch) {
        return Response.json(
          { slug: prefixMatch.path, source: "index-prefix" },
          { headers: { "Cache-Control": "private, max-age=3600" } },
        );
      }

      // 1c. Fall back to fuzzy search with scoring filter
      const results = fuse.search(n, { limit: 10 });
      if (results.length > 0) {
        // Prefer exact/prefix matches or high-score fuzzy hits, skip examples
        const best =
          results.find((r) => r.score! < 0.2 && !r.item.path.includes("/examples/")) ??
          results.find((r) => !r.item.path.includes("/examples/")) ??
          results[0];
        return Response.json(
          { slug: best.item.path, source: "index-fuzzy" },
          { headers: { "Cache-Control": "private, max-age=3600" } },
        );
      }
    }
  }

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

  return Response.json(
    { error: `No documentation found for "${input}". Try a different spelling or paste a SideFX URL directly.` },
    { status: 404 }
  );
}
