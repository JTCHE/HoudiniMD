import { unstable_noStore } from "next/cache";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeHighlight from "rehype-highlight";
import DocLink from "@/components/docs/DocLink";
import { fetchFromR2 } from "@/lib/r2/read";
import GeneratingPage from "@/components/docs/GeneratingPage";
import type { SearchIndexEntry } from "@/lib/r2/search-index";

export const revalidate = 2592000;
export const maxDuration = 60;

// Pre-render all known routes at build time (static → full RSC prefetch, no skeleton).
// dynamicParams=true (default) allows new/unknown slugs to be server-rendered on demand.
export async function generateStaticParams() {
  try {
    const raw = await fetchFromR2("content/index.json", true);
    if (!raw) return [];
    const entries: SearchIndexEntry[] = JSON.parse(raw);
    return entries.map((e) => ({ slug: e.path.split("/") }));
  } catch {
    return [];
  }
}

function parseFrontmatter(md: string): { content: string } {
  if (!md.startsWith("---")) return { content: md };
  const end = md.indexOf("\n---\n", 3);
  if (end === -1) return { content: md };
  return { content: md.slice(end + 5) };
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

  // Fast R2 check — returns null if content is missing or stale (before CACHE_INVALIDATE_BEFORE).
  // If not ready, return a client component immediately so the browser gets instant feedback
  // and can show the skeleton + SSE progress log while generation happens client-side.
  const rawMarkdown = await fetchFromR2(`content/${slugPath}.md`);
  if (!rawMarkdown) {
    // Prevent ISR/CDN from caching the generating state
    unstable_noStore();
    return <GeneratingPage slug={slugPath} />;
  }

  const { content } = parseFrontmatter(rawMarkdown);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <article className="prose prose-neutral dark:prose-invert max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw, [rehypeHighlight, { aliases: { c: ["vex", "hscript"], python: ["python"] } }]]}
          components={{
            h1: ({ children }) => (
              <h1 className="not-prose text-2xl font-bold tracking-tight border-b border-border pb-3 mb-6 mt-0">{children}</h1>
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
              <th className="border border-border px-3 py-2 text-left font-semibold bg-muted text-foreground">{children}</th>
            ),
            td: ({ children }) => <td className="border border-border px-3 py-2 align-top text-foreground">{children}</td>,
            pre: ({ children }) => <pre className="not-prose my-4 overflow-x-auto border border-border/50">{children}</pre>,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            code: ({ className, children, node: _node, ...props }) => {
              const isBlock = !!className?.startsWith("language-") ||
                (typeof children === "string" && children.includes("\n"));
              if (isBlock) {
                // CSS in globals.css handles all block code styling
                return <code className={className ?? ""} {...props}>{children}</code>;
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
  );
}
