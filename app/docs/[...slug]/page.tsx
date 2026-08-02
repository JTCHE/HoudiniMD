import { unstable_noStore } from "next/cache";
import type { Metadata } from "next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import { MarkdownActions } from "@/components/docs/MarkdownActions";
import { PrintPagination } from "@/components/docs/PrintPagination";
import { TableOfContents } from "@/components/docs/TableOfContents";
import { markdownComponents } from "@/components/docs/markdown";
import { extractHeadings } from "@/lib/markdown/headings";
import { decodeEntities } from "@/lib/markdown/entities";
import { parseFrontmatter } from "@/lib/markdown/frontmatter";
import { remarkCallouts } from "@/lib/markdown/remark-callouts";
import { remarkVex } from "@/lib/markdown/remark-vex";
import { fetchFromR2 } from "@/lib/r2/read";
import GeneratingPage from "@/components/docs/GeneratingPage";
import type { SearchIndexEntry } from "@/lib/r2/search-index";
import { SITE_URL } from "@/lib/site";

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

export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }): Promise<Metadata> {
  const { slug } = await params;
  const slugPath = slug.join("/");
  const fallbackTitle = slug[slug.length - 1].replace(/-/g, " ");

  let title = fallbackTitle;
  let description: string | undefined;

  // Derive metadata from the page's own markdown (already fetched by the page
  // component below — Next.js dedupes identical fetch() calls in one request)
  // instead of parsing the ~3MB search index, which was expensive enough to
  // brush the Workers 10ms CPU limit on every request, including MISSes.
  const rawMarkdown = await fetchFromR2(`content/${slugPath}.md`);
  if (rawMarkdown) {
    const { content } = parseFrontmatter(rawMarkdown);
    const h1Match = content.match(/^#[ \t]+(\S[^\n]*)$/m);
    if (h1Match) title = h1Match[1].trim();
    const bodyAfterH1 = h1Match ? content.replace(/^#[ \t]+\S[^\n]*\r?\n+/m, "") : content;
    const summaryMatch = bodyAfterH1.match(/^\s*>[ \t]+(?!\[!)([^\n]+)\n+/);
    if (summaryMatch) description = summaryMatch[1].trim();
  }

  const pageTitle = `${title} — HoudiniMD`;
  const canonical = `${SITE_URL}/docs/${slugPath}`;
  const ogParams = new URLSearchParams({ path: slugPath, title });
  if (description) ogParams.set("summary", description);
  const ogImage = `${SITE_URL}/api/og?${ogParams.toString()}`;

  return {
    title: pageTitle,
    description,
    alternates: {
      canonical,
      types: { "text/markdown": `${SITE_URL}/docs/${slugPath}.md` },
    },
    openGraph: {
      title: pageTitle,
      description,
      url: canonical,
      siteName: "HoudiniMD",
      type: "article",
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title: pageTitle,
      description,
      images: [ogImage],
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
  // The VEX signature transform is scoped by slug rather than by sniffing the
  // markdown, so the other ~9,600 pages take the untouched path no matter what
  // their content looks like. The whole vex/ tree is in scope, not just
  // vex/functions/: the `_suite` pages (e.g. vex/attrib_suite) document
  // functions in exactly the same shape. Of the 37 non-function vex pages only
  // those 2 contain a signature at all; the other 35 pass through unchanged.
  const isVexPage = /(^|\/)vex\//.test(`/${slugPath}`);
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
  const rawH1Match = rawContent.match(/^#[ \t]+(\S[^\n]*)$/m);
  const mdTitle = decodeEntities(rawH1Match?.[1]?.trim() ?? slug[slug.length - 1].replace(/-/g, " "));
  const h1Match = content.match(/^#[ \t]+(\S[^\n]*)$/m);

  // The H1 is rendered in the page header row (alongside the Copy button) so
  // it can share a row with action controls. Strip it from the markdown body
  // to avoid a duplicate render.
  let bodyContent = h1Match ? content.replace(/^#[ \t]+\S[^\n]*\r?\n+/m, "") : content;

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
    summary = decodeEntities(summaryMatch[1].trim());
    bodyContent = bodyContent.slice(summaryMatch[0].length);
  }
  const mdSummary = summary ?? bodyContent.match(/^(?!#|>)[^\n]{20,}/m)?.[0]?.trim();
  const canonical = `${SITE_URL}/docs/${slugPath}`;

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: mdTitle,
    ...(mdSummary ? { description: mdSummary } : {}),
    url: canonical,
    author: { "@type": "Organization", name: "SideFX" },
    publisher: { "@type": "Organization", name: "HoudiniMD" },
    about: { "@type": "SoftwareApplication", name: "Houdini" },
    image: `${SITE_URL}/api/og?${new URLSearchParams({ path: slugPath, title: mdTitle, ...(mdSummary ? { summary: mdSummary } : {}) }).toString()}`,
    mainEntityOfPage: canonical,
  };

  return (
    <main className="mx-auto max-w-4xl px-page-x py-10">
      <PrintPagination />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      {/* The H1 title lives inside <article>, alongside the markdown body, so
          the page has one content landmark holding both the heading and the
          body flow content. Reader-mode heuristics (e.g. Safari Reader) key
          on this: a title outside the article, with the body as the only
          content inside it, reads as "no content" to them. */}
      <article className="prose prose-neutral dark:prose-invert max-w-none">
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
        <TableOfContents headings={extractHeadings(bodyContent)} />
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkCallouts, [remarkVex, { enabled: isVexPage }]]}
          rehypePlugins={[rehypeRaw, rehypeSlug]}
          components={markdownComponents}
        >
          {bodyContent}
        </ReactMarkdown>
      </article>
    </main>
  );
}
