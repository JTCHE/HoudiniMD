import { fetchIndexEntries } from "@/lib/r2/read";

export async function GET() {
  const entries = await fetchIndexEntries();
  if (!entries) return Response.json({}, { status: 503 });

  const map: Record<string, { title: string; summary: string }> = {};
  for (const e of entries) {
    if (e.path && e.title) map[e.path] = { title: e.title, summary: e.summary ?? "" };
  }

  return Response.json(map, {
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
  });
}
