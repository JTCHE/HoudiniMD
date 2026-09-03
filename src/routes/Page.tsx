import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLocation } from "react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import { Breadcrumbs } from "@/components/docs/Breadcrumbs";
import { DocsHeader } from "@/components/docs/DocsHeader";
import SearchOverlay, { type SearchOverlayRef } from "@/components/docs/SearchOverlay";
import { PageHeader } from "@/components/docs/PageHeader";
import { TableOfContents } from "@/components/docs/TableOfContents";
import { CodeBlock } from "@/components/docs/CodeBlock";
import { markdownComponents } from "@/components/docs/markdown";
import { Footer } from "@/components/Footer";
import NotFoundPage from "@/components/docs/NotFoundPage";
import { extractHeadings } from "@/lib/markdown/headings";
import { remarkCallouts } from "@/lib/markdown/remark-callouts";
import { remarkVex } from "@/lib/markdown/remark-vex";
import { rehypeCards } from "@/lib/markdown/rehype-cards";
import { detectLanguage } from "@/lib/markdown/utils";
import { sideFxUrl } from "@/lib/sidefx";
import { iconUrl } from "@/lib/assets";
import { showToast } from "@/components/ui/toast-notification";

interface PageError {
  missing: boolean;
  message: string;
}

interface PageView {
  path: string;
  name: string;
  nodeType?: string;
  icon?: string;
  since?: string;
  summary?: string;
  markdown: string;
  version: string;
}

/** The reading view. Rust reads and parses the page; this draws it with the
    same component map the site uses. */
export default function Page() {
  const location = useLocation();
  const path = location.pathname.replace(/^\/+/, "");
  const [page, setPage] = useState<PageView | null>(null);
  const [error, setError] = useState<PageError | null>(null);

  useEffect(() => {
    setPage(null);
    setError(null);
    invoke<PageView>("page", { path })
      .then(setPage)
      .catch(setError);
  }, [path]);

  // A search hit names a section, so the reader arrives at `#parameters` and
  // has to land on it. The anchor is waited for rather than read at once: the
  // heading does not exist until the markdown above has rendered.
  useEffect(() => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (!id || !page) return;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(id);
      // A doc page can name a section that this page does not have. Saying so
      // beats a click that looks like it did nothing.
      if (target) target.scrollIntoView({ block: "start" });
      else showToast(`This page has no section named "${id}"`, "error");
    });
    return () => cancelAnimationFrame(frame);
  }, [location.hash, page]);

  // The overlay owns ⌘K itself; the header button opens the same overlay.
  const search = useRef<SearchOverlayRef>(null);

  const isVexPage = /(^|\/)vex\//.test(`/${path}`);

  return (
    <div className="docs-shell min-h-screen flex flex-col bg-background text-foreground">
      <DocsHeader sourceUrl={sideFxUrl(path)} onOpenSearch={() => search.current?.openSearch()} />
      <SearchOverlay ref={search} />
      <div className="@container mx-auto w-full max-w-page px-page-x pt-5">
        {page && <Breadcrumbs path={page.path} version={page.version} title={page.name} />}
      </div>
      <div className="flex-1 flex min-w-0 flex-col">
        {error?.missing ? (
          <NotFoundPage path={path} />
        ) : (
          <main className="mx-auto w-full min-w-0 max-w-page px-page-x py-10">
            {error && <p className="text-sm text-muted-foreground">{error.message}</p>}
            {page && (
              <article className="prose prose-neutral dark:prose-invert max-w-none">
                <PageHeader
                  name={page.name}
                  nodeType={page.nodeType}
                  icon={page.icon ? iconUrl(page.icon) : undefined}
                  since={page.since}
                  summary={page.summary}
                  markdown={page.markdown}
                />
                <TableOfContents headings={extractHeadings(page.markdown)} />
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkCallouts, [remarkVex, { enabled: isVexPage }]]}
                  rehypePlugins={[rehypeRaw, rehypeSlug, rehypeCards]}
                  components={{
                    ...markdownComponents,
                    pre: ({ children }) => <CodeBlock language={detectLanguage(path)}>{children}</CodeBlock>,
                  }}
                >
                  {page.markdown}
                </ReactMarkdown>
              </article>
            )}
          </main>
        )}
      </div>
      <Footer />
    </div>
  );
}
