import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { generateMarkdownForSlug, PageNotFoundError } from "@/lib/generator";
import { toSideFXUrl } from "@/lib/url";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeHighlight from "rehype-highlight";
import SearchOverlay from "@/components/docs/SearchOverlay";
import DocLink from "@/components/docs/DocLink";

export const revalidate = 86400;
export const maxDuration = 60;

const getCachedMarkdown = unstable_cache(
  (slugPath: string) => generateMarkdownForSlug(slugPath, false, () => {}),
  ["docs-markdown"],
  { revalidate: 86400 },
);

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
    const result = await getCachedMarkdown(slugPath);
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
          <a
            href="/"
            className="font-semibold text-foreground hover:opacity-70 transition-opacity shrink-0"
          >
            VexLLM
          </a>
          <span className="truncate text-center hidden sm:block">{breadcrumbs}</span>
          <div className="flex items-center gap-4 shrink-0">
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              SideFX ↗
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        <article className="prose prose-neutral dark:prose-invert max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw, [rehypeHighlight, { aliases: { c: ["vex", "hscript"], python: ["python"] } }]]}
            components={{
              h1: ({ children }) => (
                <h1 className="not-prose text-2xl font-bold tracking-tight border-b border-border pb-3 mb-6 mt-0">
                  {children}
                </h1>
              ),
              blockquote: ({ children }) => (
                <blockquote className="not-prose border-l-2 border-foreground/30 pl-4 my-4 text-muted-foreground text-sm italic">
                  {children}
                </blockquote>
              ),
              table: ({ children }) => (
                <div className="not-prose overflow-x-auto my-6">
                  <table className="w-full border-collapse text-sm">{children}</table>
                </div>
              ),
              thead: ({ children }) => <thead>{children}</thead>,
              th: ({ children }) => (
                <th className="border border-border px-3 py-2 text-left font-semibold bg-muted text-foreground">
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td className="border border-border px-3 py-2 align-top text-foreground">
                  {children}
                </td>
              ),
              pre: ({ children }) => (
                <pre className="not-prose my-4 overflow-x-auto border border-border/50">{children}</pre>
              ),
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              code: ({ className, children, node: _node, ...props }) => {
                const isBlock = !!className?.startsWith("language-");
                if (isBlock) {
                  return (
                    <code className={`${className} block p-4 text-sm font-mono leading-relaxed`} {...props}>
                      {children}
                    </code>
                  );
                }
                return (
                  <code className="bg-muted px-1.5 py-0.5 text-sm font-mono border border-border/50" {...props}>
                    {children}
                  </code>
                );
              },
              img: ({ src, alt }) => {
                if (!src || typeof src !== "string") return null;
                if (src.includes("/icons/")) {
                  return <img src={src} alt={alt ?? ""} className="doc-icon" />;
                }
                return <img src={src} alt={alt ?? ""} className="max-w-full h-auto my-4 block" />;
              },
              a: ({ href, children, ...props }) => (
                <DocLink href={href} {...props}>{children}</DocLink>
              ),
            }}
          >
            {content}
          </ReactMarkdown>
        </article>
      </main>
    </div>
  );
}
