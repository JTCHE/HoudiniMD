import { useEffect, useRef, useState } from "react";
import { LucideArrowUpRight } from "lucide-react";
import { useLocation } from "react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import { Breadcrumbs } from "@/components/docs/Breadcrumbs";
import SearchOverlay, { type SearchOverlayRef } from "@/components/docs/SearchOverlay";
import { PageHeader } from "@/components/docs/PageHeader";
import { TableOfContents } from "@/components/docs/TableOfContents";
import { CodeBlock } from "@/components/docs/CodeBlock";
import { markdownComponents } from "@/components/docs/markdown";
import NotFoundPage from "@/components/docs/NotFoundPage";
import { extractHeadings } from "@/lib/markdown/headings";
import { remarkCallouts } from "@/lib/markdown/remark-callouts";
import { remarkVex } from "@/lib/markdown/remark-vex";
import { rehypeCards } from "@/lib/markdown/rehype-cards";
import { detectLanguage } from "@/lib/markdown/utils";
import { showToast } from "@/components/ui/toast-notification";
import { recordVisit } from "@/lib/store/library";
import { sideFxUrl } from "@/lib/sidefx";
import { known, read, type PageError, type PageView } from "@/lib/pages";

/**
 * What to call a page whose help file gives no title.
 *
 * A handful of pages in every build carry no `= Title =` line. The reading
 * view still has to name the page — in the heading, in the breadcrumb, and in
 * the trail — so it takes the first heading in the body, and failing that the
 * last part of the path, which is what the reader typed to get here.
 */
function nameOf(view: PageView, path: string): string {
  if (view.name.trim()) return view.name;
  const heading = /^#{1,3}\s+(.+)$/m.exec(view.markdown)?.[1]?.trim();
  if (heading) return heading;
  const last = path.split("/").pop() ?? path;
  return last.charAt(0).toUpperCase() + last.slice(1);
}


/** The reading view. Rust reads and parses the page; this draws it with the
    same component map the site uses. */
export default function Page() {
  const location = useLocation();
  const path = location.pathname.replace(/^\/+/, "");
  const [page, setPage] = useState<PageView | null>(null);
  const [error, setError] = useState<PageError | null>(null);

  // The page on screen is NOT cleared while the next one is read. Clearing it
  // put a blank frame in the middle of every navigation — measured at 27ms,
  // and up to 75ms — which reads as a flash rather than as a page opening.
  // The old text standing for one more frame is the lesser of the two.
  useEffect(() => {
    const held = known(path);
    if (held) {
      setPage(held);
      setError(null);
      return;
    }
    let live = true;
    read(path)
      .then((view) => {
        if (!live) return;
        setPage(view);
        setError(null);
      })
      .catch((reason: PageError) => {
        if (!live) return;
        setPage(null);
        setError(reason);
      });
    return () => {
      live = false;
    };
  }, [path]);

  // A page kept on screen keeps its scroll offset with it, so a new page that
  // names no section has to be put back at the top by hand. The window itself
  // never scrolls under the shell — this column does.
  useEffect(() => {
    if (page?.path === path && !location.hash) scroller.current?.scrollTo(0, 0);
  }, [page, path, location.hash]);

  // What fills the Recents list. It is written when the page is on screen, so
  // a path that fails to read never enters the list.
  useEffect(() => {
    if (page?.path !== path) return;
    recordVisit({ path, title: nameOf(page, path), icon: page.icon });
  }, [page, path]);

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

  // The overlay owns ⌘K itself.
  const search = useRef<SearchOverlayRef>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const isVexPage = /(^|\/)vex\//.test(`/${path}`);

  return (
    <div ref={scroller} className="docs-shell @container flex min-h-0 flex-1 flex-col overflow-y-auto">
      <SearchOverlay ref={search} />
      {/* Room for the contents list in the right gutter, taken from the box
          the column centres itself in rather than from the column. The whole
          page moves left by half of it — breadcrumbs and article together —
          so the column stays centred on what is left, and the list is not
          paid for by the text's own width. */}
      <div className="flex min-h-0 flex-1 flex-col @min-[1150px]:pr-[232px]">
      {/* The same page on sidefx.com, for a reader who wants the original. It
          sits on the breadcrumb line because that line is already the answer
          to "where am I", and the source is the last part of that answer. */}
      <div className="@container mx-auto flex w-full max-w-page items-start justify-between gap-md px-page-x pt-5">
        {page && <Breadcrumbs path={page.path} version={page.version} title={nameOf(page, path)} />}
        <a
          href={sideFxUrl(path)}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex shrink-0 items-center text-meta text-muted-foreground transition-colors hover:text-foreground print:hidden"
        >
          SideFX
          <LucideArrowUpRight
            strokeWidth="1.75"
            className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
          />
        </a>
      </div>
      <div className="flex-1 flex min-w-0 flex-col">
        {error?.missing ? (
          <NotFoundPage path={path} />
        ) : (
          <main className="relative mx-auto w-full min-w-0 max-w-page px-page-x py-10">
            {error && <p className="text-sm text-muted-foreground">{error.message}</p>}
            {page && (
              <article className="prose prose-neutral dark:prose-invert max-w-none">
                <PageHeader
                  entry={{ path, title: nameOf(page, path), icon: page.icon }}
                  name={nameOf(page, path)}
                  nodeType={page.nodeType}
                  icon={page.icon}
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
      </div>
    </div>
  );
}
