import { fetchFromR2 } from "@/lib/r2/read";
import type { SearchIndexEntry } from "@/lib/r2/search-index";

export async function GET() {
  const raw = await fetchFromR2("content/index.json", true);
  if (!raw) return Response.json({}, { status: 503 });

  const entries: SearchIndexEntry[] = JSON.parse(raw);
  const map: Record<string, { title: string; summary: string }> = {};
  for (const e of entries) {
    if (e.path && e.title) map[e.path] = { title: e.title, summary: e.summary ?? "" };
  }

  return Response.json(map, {
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
  });
}
