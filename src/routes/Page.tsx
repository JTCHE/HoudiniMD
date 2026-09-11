import { useEffect, useMemo, useRef, useState } from "react";
import { LucideArrowUpRight } from "lucide-react";
import { useLocation } from "react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import { cn } from "@/lib/utils";
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
import { forgetPages, known, read, type PageError, type PageView } from "@/lib/pages";
import { onBuildChanged } from "@/lib/install";
import { isCommand, isTyping, useHotkey } from "@/lib/hotkeys";
import { invoke, inTauri } from "@/lib/backend";
import { flashText } from "@/lib/ui/flash-text";
import { FADE_OUT, FADE_UNDER } from "@/lib/ui/overflow";

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

  // Switching the Houdini build makes every page held in memory wrong, so the
  // open one is read again out of the new build.
  //
  // A page that the new build does not have leaves the reader where they are.
  // The alternative is a 404 in place of a page they were reading, which loses
  // their place to say something a line of text says better. The breadcrumb
  // still names the build the text came from, so the window does not lie.
  useEffect(() => {
    return onBuildChanged(() => {
      forgetPages();
      read(path)
        .then((view) => {
          setPage(view);
          setError(null);
        })
        .catch((reason: PageError) => {
          if (reason.missing) {
            showToast("This page does not exist in the selected Houdini build", "error");
            return;
          }
          setPage(null);
          setError(reason);
        });
    });
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

  // A search excerpt the reader picked: the page opens at those words and
  // marks them. Once per navigation, so the same excerpt picked twice marks
  // twice. Runs after the section scroll above and wins over it.
  const flashed = useRef<string | null>(null);
  useEffect(() => {
    const find = (location.state as { find?: string } | null)?.find;
    if (!find || page?.path !== path || flashed.current === location.key) return;
    flashed.current = location.key;
    const frame = requestAnimationFrame(() => {
      const shell = scroller.current;
      const article = shell?.querySelector("article");
      const main = article?.parentElement;
      if (!shell || !article || !main) return;
      const section = location.hash ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
      flashText(article, main, shell, find, section);
    });
    return () => cancelAnimationFrame(frame);
  }, [location.key, location.state, location.hash, page, path]);

  // The overlay owns ⌘K itself.
  const search = useRef<SearchOverlayRef>(null);
  const scroller = useRef<HTMLDivElement>(null);

  // The arrow and page keys scroll the page, wherever the focus is. The
  // browser scrolls the box that holds the focus, and after a click in the
  // side panel that box is the panel. Inside the page the browser does it.
  useHotkey((event) => {
    const shell = scroller.current;
    const target = event.target as HTMLElement;
    if (!shell || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    if (isTyping(target) || shell.contains(target) || target.closest("[role=menu], [role=listbox], [role=dialog]")) return;
    const page = shell.clientHeight * 0.9;
    const by: Record<string, number> = {
      ArrowDown: 40,
      ArrowUp: -40,
      PageDown: page,
      PageUp: -page,
      End: shell.scrollHeight,
      Home: -shell.scrollHeight,
    };
    // A space on a focused button pushes the button.
    if (event.key === " " && target === document.body) by[" "] = event.shiftKey ? -page : page;
    if (!(event.key in by)) return;
    event.preventDefault();
    // A press during a smooth scroll adds to where that scroll goes, not to
    // where it is now. Otherwise quick presses move the page one step.
    const max = shell.scrollHeight - shell.clientHeight;
    const from = aim.current ?? shell.scrollTop;
    aim.current = Math.min(max, Math.max(0, from + by[event.key]));
    shell.scrollTo({ top: aim.current, behavior: "smooth" });
  });
  const aim = useRef<number | null>(null);

  // Ctrl Alt C or Ctrl L copies where an agent can read this page as a file:
  // the Markdown the local server answers at `<page>.md`. Houdini's help pane
  // is already on that server; the desktop window asks for its port.
  useHotkey((event) => {
    const key = event.key.toLowerCase();
    const wanted = (event.ctrlKey && event.altKey && key === "c") || (isCommand(event) && !event.shiftKey && key === "l");
    if (!wanted || isTyping(event.target)) return;
    event.preventDefault();
    void (inTauri ? invoke<number>("server_port").catch(() => 0) : Promise.resolve(Number(window.location.port)))
      .then((port) => {
        if (!port) throw new Error("The local server is not running");
        return navigator.clipboard.writeText(`http://localhost:${port}/${path}.md`);
      })
      .then(() => showToast("Copied the page path"))
      .catch((reason: Error) => showToast(reason.message || "Could not copy the page path", "error"));
  });
  useEffect(() => {
    const shell = scroller.current;
    if (!shell) return;
    const done = () => (aim.current = null);
    shell.addEventListener("scrollend", done);
    return () => shell.removeEventListener("scrollend", done);
  }, []);

  // Read once and shared: the gutter reserved for the sticky list (below) and
  // the list itself (TableOfContents) have to agree on whether there is one —
  // TableOfContents draws nothing under two headings, and a gutter held open
  // for a list that never draws is a page pushed left off centre for no list
  // at all.
  const headings = useMemo(() => (page ? extractHeadings(page.markdown) : []), [page]);
  const hasToc = headings.length >= 2;
  const name = useMemo(() => (page ? nameOf(page, path) : ""), [page, path]);

  // react-markdown keeps nothing between renders, so each render of this view
  // parsed the whole page again — on a navigation that included the old page,
  // drawn once more under the new path while the new one is read. The element
  // is built once per page, from the page's own path: React skips an element
  // it has already drawn.
  const body = useMemo(
    () =>
      page && (
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkCallouts, [remarkVex, { enabled: /(^|\/)vex\//.test(`/${page.path}`) }]]}
          rehypePlugins={[rehypeRaw, rehypeSlug, rehypeCards]}
          components={{
            ...markdownComponents,
            pre: ({ children }) => <CodeBlock language={detectLanguage(page.path)}>{children}</CodeBlock>,
          }}
        >
          {page.markdown}
        </ReactMarkdown>
      ),
    [page],
  );

  return (
    <div
      ref={scroller}
      // The bar's width is held on a short page too, so the column does not
      // step sideways between a page that scrolls and one that does not.
      // The text falls off above the status bar the way the sidebar's lists
      // do, not against a hard edge. The page ends on the bottom padding of
      // `main`, which is deeper than the fade, so the last line always reads.
      className={cn(
        // --page-bar-h is the height of the bar that stays at the top: the
        // list of contents, the pill and a heading's jump offset clear it.
        "docs-shell @container flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-gutter:stable] [--page-bar-h:3.5rem]",
        FADE_OUT,
      )}
    >
      <SearchOverlay ref={search} />
      {/* Room for the contents list in the right gutter, taken from the box
          the column centres itself in rather than from the column. The whole
          page moves left by half of it — breadcrumbs and article together —
          so the column stays centred on what is left, and the list is not
          paid for by the text's own width. */}
      <div className={cn("flex min-h-0 flex-1 flex-col", hasToc && "@min-[920px]:pr-[232px]")}>
        {/* The column: the bar, then the page. It is the box the list of
            contents hangs off, from the top of the bar, so "On this page"
            sits on the same line as the breadcrumbs. */}
        <div className="relative mx-auto flex w-full max-w-page flex-1 flex-col">
        {/* The same page on sidefx.com, for a reader who wants the original. It
          sits on the breadcrumb line because that line is already the answer
          to "where am I", and the source is the last part of that answer.
          The bar stays at the top while the page scrolls under it. */}
        <div
          className={cn(
            "@container sticky top-0 z-20 flex min-h-(--page-bar-h) shrink-0 items-center justify-between gap-md bg-background px-page-x print:static",
            FADE_UNDER,
          )}
        >
          {page && (
            <Breadcrumbs
              path={page.path}
              version={page.version}
              title={name}
            />
          )}
          <a
            href={sideFxUrl(path)}
            target="_blank"
            rel="noopener noreferrer"
            className="group ml-auto flex shrink-0 items-center text-meta text-muted-foreground transition-colors hover:text-foreground print:hidden"
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
            <main className="w-full min-w-0 px-page-x pt-7 pb-10">
              {error && <p className="text-sm text-muted-foreground">{error.message}</p>}
              {page && (
                <article className="prose prose-neutral dark:prose-invert max-w-none">
                  <PageHeader
                    entry={{ path, title: name, icon: page.icon }}
                    name={name}
                    nodeType={page.nodeType}
                    icon={page.icon}
                    since={page.since}
                    summary={page.summary}
                    markdown={page.markdown}
                  />
                  {/* Keyed on the page: a pill left floating by the last page
                      stood over the top of the next one until the observer
                      caught up, then faded out. A new page starts it hidden. */}
                  <TableOfContents key={page.path} headings={headings} />
                  {body}
                </article>
              )}
            </main>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
