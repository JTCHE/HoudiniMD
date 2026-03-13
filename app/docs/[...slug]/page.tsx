import { notFound } from "next/navigation";
import { generateMarkdownForSlug, PageNotFoundError } from "@/lib/generator";
import { toSideFXUrl } from "@/lib/url";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import SearchOverlay from "@/components/docs/SearchOverlay";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parseFrontmatter(md: string): { data: Record<string, string>; content: string } {
  if (!md.startsWith("---")) return { data: {}, content: md };
  const end = md.indexOf("\n---\n", 3);
  if (end === -1) return { data: {}, content: md };
  const data: Record<string, string> = {};
  for (const line of md.slice(3, end).trim().split("\n")) {
    const i = line.indexOf(":");
    if (i > -1) data[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { data, content: md.slice(end + 5) };
}

function extractTitle(content: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1] : "";
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const slugPath = slug.join("/");
  return {
    title: slug[slug.length - 1].replace(/-/g, " ") + " — VexLLM",
    alternates: { types: { "text/markdown": `/${slugPath}.md` } },
  };
}

export default async function DocsPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const slugPath = slug.join("/");

  let markdown: string;
  try {
    const result = await generateMarkdownForSlug(slugPath, false, () => {});
    markdown = result.markdown;
  } catch (error) {
    if (error instanceof PageNotFoundError) notFound();
    throw error;
  }

  const { data, content } = parseFrontmatter(markdown);
  const title = extractTitle(content);
  const breadcrumbs = [data.breadcrumbs, title].filter(Boolean).join(" > ");
  const sourceUrl = data.source ?? toSideFXUrl(slugPath);
  const rawUrl = `/${slugPath}.md`;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SearchOverlay />
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto grid max-w-4xl grid-cols-[auto_1fr_auto] items-center gap-4 px-6 py-3 text-xs text-muted-foreground">
          <a href="/" className="font-semibold text-foreground hover:opacity-70 transition-opacity shrink-0">
            VexLLM
          </a>
          <span className="truncate text-center hidden sm:block">{breadcrumbs}</span>
          <div className="flex items-center gap-4 shrink-0">
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
              SideFX ↗
            </a>
            <a href={rawUrl} className="hover:text-foreground transition-colors font-mono">
              raw
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        <article className="prose prose-neutral dark:prose-invert max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </article>
      </main>
    </div>
  );
}
