import { unstable_noStore } from "next/cache";
import { notFound } from "next/navigation";
import Script from "next/script";
import type { Metadata } from "next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import { PageHeader } from "@/components/docs/PageHeader";
import { PrintPagination } from "@/components/docs/PrintPagination";
import { TableOfContents } from "@/components/docs/TableOfContents";
import { VisitRecorder } from "@/components/docs/VisitRecorder";
import { ViewRecorder } from "@/components/ViewRecorder";
import { markdownComponents } from "@/components/docs/markdown";
import { CodeBlock } from "@/components/docs/CodeBlock";
import { createImageComponent } from "@/components/docs/markdown/MarkdownImage";
import { createVideoComponent } from "@/components/docs/markdown/MarkdownVideo";
import { probeImages } from "@/lib/images/probe";
import { probeVideos } from "@/lib/videos/probe";
import { extractHeadings } from "@/lib/markdown/headings";
import { decodeEntities } from "@/lib/markdown/entities";
import { parseFrontmatter } from "@/lib/markdown/frontmatter";
import { legacyWarningMarkdown } from "@/lib/markdown/legacy-warning";
import { formatPageTitle } from "@/lib/markdown/page-title";
import { remarkCallouts } from "@/lib/markdown/remark-callouts";
import { remarkVex } from "@/lib/markdown/remark-vex";
import { addSeeAlsoIcons, detectLanguage, normalizeIconLinks } from "@/lib/markdown/utils";
import { rehypeCards } from "@/lib/markdown/rehype-cards";
import { fetchFromR2, fetchIndexEntries } from "@/lib/r2/read";
import { slugExistsOnSideFX } from "@/lib/generator";
import GeneratingPage from "@/components/docs/GeneratingPage";
import type { SearchIndexEntry } from "@/lib/r2/search-index";
import { SITE_URL } from "@/lib/site";
import { localIconUrl, localizeIconUrls } from "@/lib/icons";

export const revalidate = 2592000;
export const maxDuration = 60;

// Pre-render every known route at build time. A static route gets a full RSC
// prefetch, so a navigation paints the page itself, never the loading skeleton.
// Removing this made /docs/[...slug] dynamic: the build stopped emitting the
// ~11.4k page cache entries, cache-sync pruned them from R2 as orphans, and
// every first visit paid a cold render behind the skeleton.
// dynamicParams=true (default) keeps new/unknown slugs server-rendered on demand.
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
  let nodeType: string | undefined;
  let icon: string | undefined;
  let description: string | undefined;

  // Derive metadata from the page's own markdown (already fetched by the page
  // component below — Next.js dedupes identical fetch() calls in one request)
  // instead of parsing the ~3MB search index, which was expensive enough to
  // brush the Workers 10ms CPU limit on every request, including MISSes.
  let rawMarkdown: string | null = null;
  try {
    rawMarkdown = await fetchFromR2("content/" + slugPath + ".md");
  } catch {
    unstable_noStore();
  }
  if (rawMarkdown) {
    const { content, data } = parseFrontmatter(rawMarkdown);
    const h1Match = content.match(/^#[ \t]+(\S[^\n]*)$/m);
    // Prefer the frontmatter's own name/type split — the H1 is only their
    // concatenation (`${title} ${nodeType}`), so reading it back keeps the
    // metadata title correct without re-parsing text that already came apart
    // cleanly at generation time. Fall back to the raw H1 for pages with no
    // frontmatter (should not happen for generated docs, but degrade safely).
    if (data.title) {
      title = data.title;
      nodeType = data.nodeType;
      icon = data.icon ? localIconUrl(data.icon) : undefined;
    } else if (h1Match) {
      title = h1Match[1].trim();
    }
    const bodyAfterH1 = h1Match ? content.replace(/^#[ \t]+\S[^\n]*\r?\n+/m, "") : content;
    const summaryMatch = bodyAfterH1.match(/^\s*>[ \t]+(?!\[!)([^\n]+)\n+/);
    if (summaryMatch) description = summaryMatch[1].trim();
  }

  const pageTitle = `${formatPageTitle(title, nodeType)} | HoudiniMD`;
  const canonical = `${SITE_URL}/docs/${slugPath}`;
  // The OG image keeps name and type as separate params — it renders its own
  // bold-name/thin-type hierarchy (see lib/og/og-image.tsx), not the
  // Title Cased/dash-joined <title> string.
  const ogParams = new URLSearchParams({ path: slugPath, title });
  if (nodeType) ogParams.set("type", nodeType);
  if (description) ogParams.set("summary", description);
  if (icon) ogParams.set("icon", icon);
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
  // Uncomment to feel the DocsSkeleton loading state at a normal connection speed.
  // await new Promise((r) => setTimeout(r, 1000));

  // Fast R2 check — returns null if content is missing or stale (before CACHE_INVALIDATE_BEFORE).
  // If not ready, return a client component immediately so the browser gets instant feedback
  // and can show the skeleton + SSE progress log while generation happens client-side.
  // A read failure (R2 hiccup, not a real cache miss) degrades the same way — retryable via
  // GeneratingPage's SSE call, instead of crashing the whole request.
  let rawMarkdown: string | null;
  try {
    rawMarkdown = await fetchFromR2(`content/${slugPath}.md`);
  } catch {
    unstable_noStore();
    return <GeneratingPage slug={slugPath} />;
  }
  if (!rawMarkdown) {
    // Distinguish "not generated yet" (200, show progress) from "SideFX has no
    // such page" (real 404) — without this, every dead link served a 200 page
    // that only failed client-side once the generation SSE stream ran.
    let existsOnSideFX: boolean;
    try {
      existsOnSideFX = await slugExistsOnSideFX(slugPath);
    } catch {
      unstable_noStore();
      return <GeneratingPage slug={slugPath} />;
    }
    if (!existsOnSideFX) {
      notFound();
    }
    // Prevent ISR/CDN from caching the generating state
    unstable_noStore();
    return <GeneratingPage slug={slugPath} />;
  }

  const { content: rawContent, data: frontmatter } = parseFrontmatter(rawMarkdown);
  const pageIcon = frontmatter.icon ? localIconUrl(frontmatter.icon) : undefined;
  const pageBanner = frontmatter.banner;
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

  // The header displays the page name and its type as two visually distinct
  // pieces (name as scraped, type Title Cased) — frontmatter already carries
  // them split. Pages without frontmatter (should not happen for generated
  // docs) degrade to the full H1 text as the name, with no type.
  const headerName = frontmatter.title ? decodeEntities(frontmatter.title) : mdTitle;
  const headerNodeType = frontmatter.title ? frontmatter.nodeType : undefined;

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
  bodyContent = legacyWarningMarkdown(slugPath) + bodyContent;
  if (/^## See Also\s*$/m.test(bodyContent)) {
    const entries = await fetchIndexEntries().catch(() => null);
    const iconByPath = new Map(entries?.flatMap(({ path, icon }) => icon ? [[path, icon] as const] : []) ?? []);
    bodyContent = addSeeAlsoIcons(bodyContent, iconByPath);
  }
  bodyContent = normalizeIconLinks(localizeIconUrls(bodyContent));
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

  // Image and SVG dimensions come from their first bytes, so every image box
  // exists at its final aspect ratio before the file finishes loading.
  const bodyImageUrls = Array.from(bodyContent.matchAll(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g)).map((m) => m[1]);
  const extraImageUrls = [pageIcon, pageBanner].filter((url): url is string => Boolean(url));
  const imageMeta = await probeImages([...extraImageUrls, ...bodyImageUrls]);
  const imageComponent = createImageComponent(imageMeta);

  // Video dimensions probed the same way, from the WebM header's leading
  // bytes, so the player's box locks in at the right aspect ratio up front.
  const videoUrls = Array.from(bodyContent.matchAll(/<video\b[^>]*\ssrc="([^"]+)"/g)).map((m) => m[1]);
  const videoMeta = await probeVideos(videoUrls);
  const videoComponent = createVideoComponent(videoMeta);

  return (
    <main className="mx-auto w-full min-w-0 max-w-page px-page-x py-10">
      {pageIcon && <link rel="preload" as="image" type="image/svg+xml" href={pageIcon} fetchPriority="high" />}
      <PrintPagination />
      {/* Reports the read: to analytics, which cannot see a navigation served
          from the router cache, and to the landing page's "recently visited"
          row. Both render nothing. */}
      <ViewRecorder path={`/docs/${slugPath}`} />
      <VisitRecorder chip={{ path: slugPath, title: headerName, icon: pageIcon ?? "" }} />
      <Script
        id="article-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      {/* The H1 title lives inside <article>, alongside the markdown body, so
          the page has one content landmark holding both the heading and the
          body flow content. Reader-mode heuristics (e.g. Safari Reader) key
          on this: a title outside the article, with the body as the only
          content inside it, reads as "no content" to them. */}
      <article className="prose prose-neutral dark:prose-invert max-w-none">
        <PageHeader
          slug={slugPath}
          name={headerName}
          nodeType={headerNodeType}
          icon={pageIcon}
          iconDimensions={pageIcon ? imageMeta.get(pageIcon) : undefined}
          since={since}
          summary={summary}
          banner={pageBanner}
          bannerDimensions={pageBanner ? imageMeta.get(pageBanner) : undefined}
        />
        <TableOfContents headings={extractHeadings(bodyContent)} />
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkCallouts, [remarkVex, { enabled: isVexPage }]]}
          rehypePlugins={[rehypeRaw, rehypeSlug, rehypeCards]}
          components={{
            ...markdownComponents,
            pre: ({ children }) => <CodeBlock language={detectLanguage(slugPath)}>{children}</CodeBlock>,
            img: imageComponent,
            video: videoComponent,
          }}
        >
          {bodyContent}
        </ReactMarkdown>
      </article>
    </main>
  );
}
