import { unstable_noStore } from "next/cache";
import type { Metadata } from "next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeHighlight from "rehype-highlight";
import rehypeSlug from "rehype-slug";
import DocLink from "@/components/docs/DocLink";
import { MarkdownActions } from "@/components/docs/MarkdownActions";
import { CodeBlock } from "@/components/docs/CodeBlock";
import { remarkCallouts } from "@/lib/markdown/remark-callouts";
import { fetchFromR2, fetchIndexJson } from "@/lib/r2/read";
import GeneratingPage from "@/components/docs/GeneratingPage";
import type { SearchIndexEntry } from "@/lib/r2/search-index";

const URL = process.env.URL ?? "https://houdinimd.jchd.me";

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

function parseFrontmatter(md: string): { content: string; data: Record<string, string> } {
  if (!md.startsWith("---")) return { content: md, data: {} };
  const end = md.indexOf("\n---\n", 3);
  if (end === -1) return { content: md, data: {} };
  const data: Record<string, string> = {};
  for (const line of md.slice(3, end).trim().split("\n")) {
    const i = line.indexOf(":");
    if (i > -1) data[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { content: md.slice(end + 5), data };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }): Promise<Metadata> {
  const { slug } = await params;
  const slugPath = slug.join("/");
  const fallbackTitle = slug[slug.length - 1].replace(/-/g, " ");

  let title = fallbackTitle;
  let description: string | undefined;

  try {
    const raw = await fetchIndexJson();
    if (raw) {
      const entries: SearchIndexEntry[] = JSON.parse(raw);
      const entry = entries.find((e) => e.path === slugPath);
      if (entry) {
        title = entry.title;
        description = entry.summary || undefined;
      }
    }
  } catch {
    // fall through to fallback
  }

  const pageTitle = `${title} — HoudiniMD`;
  const canonical = `${URL}/docs/${slugPath}`;

  return {
    title: pageTitle,
    description,
    alternates: {
      canonical,
      types: { "text/markdown": `${URL}/docs/${slugPath}.md` },
    },
    openGraph: {
      title: pageTitle,
      description,
      url: canonical,
      siteName: "HoudiniMD",
      type: "article",
      images: [`${URL}/api/og?path=${encodeURIComponent(slugPath)}`],
    },
    twitter: {
      card: "summary_large_image",
      title: pageTitle,
      description,
      images: [`${URL}/api/og?path=${encodeURIComponent(slugPath)}`],
    },
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

  const { content: rawContent, data: frontmatter } = parseFrontmatter(rawMarkdown);
  const pageIcon = frontmatter.icon;
  const since = frontmatter.since;
  // Escape pseudo-tags before rehypeRaw processes the markdown.
  // Real HTML tag names only contain [a-zA-Z0-9-]. We escape two invalid patterns:
  //   1. Uppercase-starting: <A>, <A-B>, <Key>
  //   2. Underscore-containing (with or without markdown backslash-escape before _):
  //      <unmodified_key>, <unmodified\_key>  — both throw React "Invalid tag"
  //
  // Code (fenced blocks + inline spans) is stashed first so its contents are left
  // untouched: inside code, `foo<UDIM>.exr` is literal text that markdown renders
  // verbatim, and escaping it would surface "&lt;UDIM&gt;" to the reader.
  const codeStash: string[] = [];
  // Sentinel uses a NUL escape — NUL never occurs in markdown source, so the
  // restore step cannot collide with real prose (e.g. "version 20 index").
  const stashCode = (m: string) => `\u0000${codeStash.push(m) - 1}\u0000`;
  const content = rawContent
    .replace(/```[\s\S]*?```/g, stashCode)
    .replace(/(`{1,2})[\s\S]*?\1/g, stashCode)
    .replace(/<([A-Z][^>]*?)>/g, "&lt;$1&gt;")
    .replace(/<(\/?[a-z][a-z0-9-]*(?:\\?_[a-z0-9_\\-]*)+)>/g, "&lt;$1&gt;")
    .replace(/\u0000(\d+)\u0000/g, (_, n) => codeStash[Number(n)]);

  // Extract title and summary for JSON-LD.
  // Title is pulled from the RAW (pre-escape) markdown and entity-decoded, so a
  // generic node like "Add<T>" renders as text instead of literal "Add&lt;T&gt;".
  const rawH1Match = rawContent.match(/^#\s+(.+)$/m);
  const mdTitle = (rawH1Match?.[1]?.trim() ?? slug[slug.length - 1].replace(/-/g, " "))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  const h1Match = content.match(/^#\s+(.+)$/m);

  // The H1 is rendered in the page header row (alongside the Copy button) so
  // it can share a row with action controls. Strip it from the markdown body
  // to avoid a duplicate render.
  let bodyContent = h1Match ? content.replace(/^#\s+.+\r?\n+/m, "") : content;

  // SideFX page summary is emitted as a leading blockquote (converter.ts). Lift
  // it into the header — above the separator, beneath the title — instead of
  // rendering it as the first piece of body content. A `[!…]` admonition (e.g. a
  // deprecation warning) is not a summary, so it stays in the body.
  let summary: string | undefined;
  const summaryMatch = bodyContent.match(/^\s*>[ \t]+(?!\[!)([^\n]+)\n+/);
  if (summaryMatch) {
    // The summary renders as a plain-text node (not through ReactMarkdown), so
    // decode the entities the escape step introduced — otherwise a token like
    // <UDIM> would surface as literal "&lt;UDIM&gt;".
    summary = summaryMatch[1]
      .trim()
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    bodyContent = bodyContent.slice(summaryMatch[0].length);
  }
  const mdSummary = summary ?? bodyContent.match(/^(?!#|>)[^\n]{20,}/m)?.[0]?.trim();
  const canonical = `${URL}/docs/${slugPath}`;

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: mdTitle,
    ...(mdSummary ? { description: mdSummary } : {}),
    url: canonical,
    author: { "@type": "Organization", name: "SideFX" },
    publisher: { "@type": "Organization", name: "HoudiniMD" },
    about: { "@type": "SoftwareApplication", name: "Houdini" },
    image: `${URL}/api/og?path=${encodeURIComponent(slugPath)}`,
    mainEntityOfPage: canonical,
  };

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <header className="not-prose flex flex-wrap items-start justify-between gap-x-8 gap-y-3 border-b border-border pb-3 mb-6">
        <div className="flex items-start gap-3 min-w-0">
          {pageIcon && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pageIcon}
              alt=""
              className="size-8 shrink-0 mt-0.5 select-none"
              aria-hidden="true"
            />
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 min-w-0">
            <h1 className="text-2xl font-bold tracking-tight leading-tight m-0 wrap-break-word">{mdTitle}</h1>
            {since && (
              <span className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                Since {since}
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0 pt-0.5">
          <MarkdownActions slug={slugPath} />
        </div>
        {summary && <p className="w-full basis-full m-0 text-sm italic text-muted-foreground">{summary}</p>}
      </header>
      <article className="prose prose-neutral dark:prose-invert max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkCallouts]}
          rehypePlugins={[rehypeRaw, rehypeSlug, [rehypeHighlight, { aliases: { c: ["vex", "hscript"], python: ["python"] } }]]}
          components={{
            h1: ({ children }) => (
              <h1 className="not-prose text-2xl font-bold tracking-tight border-b border-border pb-3 mb-6 mt-0">{children}</h1>
            ),
            blockquote: ({ children, className, ...props }) => {
              // Callouts are tagged by the remark-callouts plugin.
              const calloutType = (props as Record<string, string>)["data-callout"];
              if (calloutType) {
                const label = calloutType.charAt(0).toUpperCase() + calloutType.slice(1);
                return (
                  <blockquote
                    className={`not-prose ${className ?? ""}`}
                    data-callout={calloutType}
                  >
                    <p className="callout-title">{label}</p>
                    {children}
                  </blockquote>
                );
              }
              return (
                <blockquote className="not-prose border-l-2 border-foreground/30 pl-4 my-4 text-muted-foreground text-sm italic">
                  {children}
                </blockquote>
              );
            },
            table: ({ children }) => (
              <div className="not-prose overflow-x-auto my-6 rounded-lg border border-border">
                <table className="w-full border-collapse text-sm [&_tr:last-child_td]:border-b-0">{children}</table>
              </div>
            ),
            thead: ({ children }) => <thead>{children}</thead>,
            th: ({ children }) => (
              <th className="border-b border-r border-border last:border-r-0 px-3 py-2 text-left font-semibold bg-muted text-foreground">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="border-b border-r border-border last:border-r-0 px-3 py-2 align-top text-foreground">{children}</td>
            ),
            pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            code: ({ className, children, node: _node, ...props }) => {
              const isBlock = !!className?.startsWith("language-") || (typeof children === "string" && children.includes("\n"));
              if (isBlock) {
                // CSS in globals.css handles all block code styling
                return (
                  <code
                    className={className ?? ""}
                    {...props}
                  >
                    {children}
                  </code>
                );
              }
              return (
                <code
                  className="bg-muted px-1.5 py-0.5 text-sm font-mono border border-border/50 rounded-sm text-pink-600 dark:text-pink-400 [overflow-wrap:anywhere] whitespace-normal"
                  {...props}
                >
                  {children}
                </code>
              );
            },
            img: ({ src, alt }) => {
              if (!src || typeof src !== "string") return null;
              if (src.includes("/icons/")) {
                return (
                  <img
                    src={src}
                    alt={alt ?? ""}
                    className="doc-icon"
                  />
                );
              }
              return (
                <img
                  src={src}
                  alt={alt ?? ""}
                  className="max-w-full h-auto my-4 block"
                />
              );
            },
            a: ({ href, children, ...props }) =>
              href ? (
                <DocLink
                  href={href}
                  {...props}
                >
                  {children}
                </DocLink>
              ) : (
                <span {...(props as React.HTMLAttributes<HTMLSpanElement>)}>{children}</span>
              ),
          }}
        >
          {bodyContent}
        </ReactMarkdown>
      </article>
    </main>
  );
}
