import { fetchFromR2 } from "@/lib/r2";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  if (!slug) return Response.json({ error: "No slug" }, { status: 400 });

  const content = await fetchFromR2(`content/${slug}.md`, true);
  if (!content) return Response.json({ error: "Not found" }, { status: 404 });

  const titleMatch = content.match(/^#[ \t]+(\S[^\n]*)$/m);

  // The summary blockquote, if present, is the line right after the title
  // (see converter.ts). Do not scan the rest of the body: it may contain its
  // own `> [!TIP]`-style callouts, and matching the first one anywhere in the
  // document picks up the raw admonition marker instead of a real summary.
  const afterTitle = titleMatch ? content.slice(titleMatch.index! + titleMatch[0].length) : "";
  const nextLine = afterTitle.split("\n").find((line) => line.trim() !== "") ?? "";
  const summaryLine = nextLine.match(/^>[ \t]+(\S[^\n]*)$/)?.[1]?.trim() ?? "";
  const summary = /^\[!\w+\]$/.test(summaryLine) ? "" : summaryLine;

  return Response.json(
    {
      title: titleMatch?.[1]?.trim() ?? "",
      summary,
    },
    { headers: { "Cache-Control": "private, max-age=86400" } },
  );
}
