import { fetchFromR2 } from "@/lib/r2";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  if (!slug) return Response.json({ error: "No slug" }, { status: 400 });

  const content = await fetchFromR2(`content/${slug}.md`, true);
  if (!content) return Response.json({ error: "Not found" }, { status: 404 });

  const titleMatch = content.match(/^#\s+(.+)$/m);
  const summaryMatch = content.match(/^>\s+(.+)$/m);

  return Response.json(
    {
      title: titleMatch?.[1]?.trim() ?? "",
      summary: summaryMatch?.[1]?.trim() ?? "",
    },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } },
  );
}
