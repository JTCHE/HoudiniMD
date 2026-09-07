/**
 * The panel down the left of the window: the build, the pages kept, the whole
 * documentation, and the trail.
 *
 * It is the same panel on the landing page and on a doc page. Only the marked
 * row changes.
 *
 * Its width is the reader's, dragged from the right edge and kept on the
 * machine. The bounds are the panel's own: narrower than 232px and a node
 * name is all ellipsis; wider than 460px and the reading column pays for a
 * list nobody widened on purpose.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "../../lib/backend";
import { cn } from "@/lib/utils";
import { titles, forgetTitles, type Hit } from "@/lib/search";
import { buildTree, type TreeBranch } from "@/lib/landing/tree";
import { useBuild } from "@/lib/install";
import { useLibrary } from "@/lib/store/library";
import { VersionSelector } from "./sidebar/VersionSelector";
import { BookmarkStrip } from "./sidebar/BookmarkStrip";
import { PageTree } from "./sidebar/PageTree";
import { SidebarFooter } from "./sidebar/SidebarFooter";
import { SidebarRow } from "./sidebar/SidebarRow";
import { FadeList } from "@/components/ui/FadeList";

/** The tree is derived from every title, which is fast but not free — so it is
    built once and every panel that mounts afterwards reads the same tree.
    On a fresh index the background pass writes Nodes last (it is by far the
    biggest zip), so the first build can land before Nodes exists. Rebuild
    once the pass finishes so the tree does not stay stuck on that first,
    partial read for the rest of the session. */
function useTree(): TreeBranch[] {
  const [tree, setTree] = useState<TreeBranch[]>(cached ?? []);

  useEffect(() => {
    let live = true;
    const load = () => {
      void titles().then((all: Hit[]) => {
        cached = buildTree(all);
        if (live) setTree(cached);
      });
    };
    if (!cached) load();
    const stop = listen<{ done: boolean }>("index", (event) => {
      if (!event.payload.done) return;
      forgetTitles();
      cached = null;
      load();
    });
    return () => {
      live = false;
      void stop.then((off) => off());
    };
  }, []);

  return tree;
}

let cached: TreeBranch[] | null = null;

const WIDTH_KEY = "houdinimd.sidebar-width";
const MIN_WIDTH = 232;
const MAX_WIDTH = 460;

function storedWidth(): number {
  try {
    const raw = Number(window.localStorage.getItem(WIDTH_KEY));
    if (Number.isFinite(raw) && raw >= MIN_WIDTH && raw <= MAX_WIDTH) return raw;
  } catch {
    /* no store, no memory */
  }
  return 289;
}

export function Sidebar({ currentPath, className }: { currentPath?: string; className?: string }) {
  const { version, pageCount } = useBuild();
  const tree = useTree();
  const { recents, bookmarks } = useLibrary();
  const [recentsOpen, setRecentsOpen] = useState(false);
  const [width, setWidth] = useState(storedWidth);
  const dragging = useRef(false);
  // The pointer listeners are mounted once, so they read the width from a ref
  // rather than closing over the first one.
  const widthRef = useRef(width);
  widthRef.current = width;

  // The drag is on the window, not on the handle: a pointer that leaves the
  // 5px handle mid-drag must keep dragging, and must stop on release wherever
  // it happens to be.
  const startDrag = useCallback((event: React.PointerEvent) => {
    event.preventDefault();
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!dragging.current) return;
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(event.clientX))));
    };
    const stop = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      try {
        window.localStorage.setItem(WIDTH_KEY, String(Math.round(widthRef.current)));
      } catch {
        /* the width is this session's, then */
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
  }, []);

  return (
    <aside
      style={{ width }}
      className={cn(
        "relative flex shrink-0 flex-col gap-lg overflow-hidden",
        "border-r border-hairline bg-neutral-100 p-ms",
        className,
      )}
    >
      <VersionSelector
        version={version}
        pageCount={pageCount}
      />

      <BookmarkStrip entries={bookmarks} />

      {/* The tree takes what is left between the strip above and the footer
          below, and scrolls inside that — the footer never leaves the bottom
          of the window. */}
      <PageTree
        groups={tree}
        currentPath={currentPath}
        bookmarked={new Set(bookmarks.map((entry) => entry.path))}
        className="min-h-0 flex-1"
      />

      <div className="mt-auto flex flex-col">
        {recentsOpen && (
          // Reversed: the button that opens this list sits at the BOTTOM of
          // the panel, so the newest page belongs next to it — oldest at the
          // top, scrolling up, the way the button's own place in the panel
          // reads.
          <FadeList className="mb-2xs max-h-[240px]" deps={[recents.length]} reverse>
            {recents.length === 0 ? (
              <p className="px-sm py-xs text-caption text-neutral-400">Nothing read yet.</p>
            ) : (
              [...recents].reverse().map((entry) => (
                <SidebarRow
                  key={entry.path}
                  label={entry.title}
                  icon={entry.icon ?? null}
                  to={`/${entry.path}`}
                  selected={entry.path === currentPath}
                  kept={bookmarks.some((kept) => kept.path === entry.path)}
                />
              ))
            )}
          </FadeList>
        )}
        <SidebarFooter
          recentCount={recents.length}
          recentsOpen={recentsOpen}
          onToggleRecents={() => setRecentsOpen((open) => !open)}
        />
      </div>

      {/* The edge itself is the handle. It is wider than the hairline it sits
          on so the pointer can find it, and it draws nothing until then. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the panel"
        onPointerDown={startDrag}
        onDoubleClick={() => setWidth(289)}
        className={cn(
          "absolute inset-y-0 -right-[2px] w-[5px] cursor-col-resize",
          "transition-colors duration-(--duration-fast) motion-reduce:transition-none",
          "pointer-hover:bg-brand/30",
        )}
      />
    </aside>
  );
}
