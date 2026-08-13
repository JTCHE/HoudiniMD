import { fetchFromR2 } from "@/lib/r2";
import { fetchSourceAlias } from "@/lib/source-aliases";
import { parseFrontmatter } from "@/lib/markdown/frontmatter";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  if (!slug) return Response.json({ error: "No slug" }, { status: 400 });

  // Link hrefs keep the source `.../index` form (see convertToHoudiniMDUrl), but
  // content is stored under the canonical slug. `/api/raw` resolves that alias;
  // this route must too, or every section-index tooltip misses forever.
  const alias = await fetchSourceAlias(slug);
  const content = await fetchFromR2(`content/${alias?.canonical ?? slug}.md`, true);
  if (!content) return Response.json({ error: "Not found" }, { status: 404 });

  // The H1 carries title + nodeType together ("Geometry Light LOP node"), which
  // is what the tooltip heading shows — the frontmatter `title` key alone is
  // just the bare title, so this still reads the H1 rather than the frontmatter.
  const titleMatch = content.match(/^#[ \t]+(\S[^\n]*)$/m);
  const { data } = parseFrontmatter(content);

  return Response.json(
    {
      title: titleMatch?.[1]?.trim() ?? "",
      summary: data.description ?? "",
    },
    { headers: { "Cache-Control": "private, max-age=86400" } },
  );
}
