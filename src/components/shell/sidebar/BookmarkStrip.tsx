/**
 * The pages the reader kept, as a row of marks.
 *
 * Icon only, no name: a bookmark is a page the reader chose, so they already
 * know it by its mark, and six marks in the width of one row is the point of
 * putting them here rather than in a list. The name is one hover away.
 *
 * The strip holds its height with nothing in it. A panel that grows a row the
 * first time a reader keeps a page moves everything under it, and the row
 * below is the tree — the part of the panel the reader is looking at.
 */
import { Link } from "react-router";
import { warm } from "@/lib/pages";
import { COMMAND_KEY } from "@/lib/hotkeys";
import { cn } from "@/lib/utils";
import { Icons } from "@/lib/ui/icons";
import DocIconClient from "@/components/docs/markdown/DocIconClient";
import type { LibraryEntry } from "@/lib/store/library";

/** How many fit on the row at the panel's width. */
const SHOWN = 6;

export function BookmarkStrip({ entries, className }: { entries: LibraryEntry[]; className?: string }) {
  const shown = entries.slice(0, SHOWN);

  return (
    <section className={cn("flex flex-col gap-[6px]", className)}>
      <Link
        to="/?tab=bookmarks"
        className={cn(
          "flex cursor-interactive items-center gap-2xs self-start rounded-md px-sm py-2xs text-[11.5px] text-neutral-500",
          "transition-colors duration-(--duration-fast) motion-reduce:transition-none",
          "pointer-hover:text-neutral-800",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        )}
      >
        Bookmarks
        <Icons.collapsed className="size-[11px] translate-y-[0.5px]" />
      </Link>

      <div className="flex min-h-chip flex-wrap items-center gap-[6px]">
        {shown.length === 0 ? (
          // The same height as a row of tiles: the strip must not grow the
          // first time a page is kept, or the whole tree below it steps down.
          <p className="flex h-chip w-full items-center rounded-lg border border-dashed border-hairline px-sm text-caption text-neutral-500">
            Press {COMMAND_KEY} D on a page to keep it.
          </p>
        ) : (
          shown.map((entry) => (
            <Link
              key={entry.path}
              to={`/${entry.path}`}
              onPointerEnter={() => warm(entry.path)}
              title={entry.title}
              aria-label={entry.title}
              className={cn(
                // Square. A tile carries an icon and nothing else, so its
                // width is its height and a row of them steps evenly.
                "grid size-chip shrink-0 cursor-interactive place-items-center rounded-lg",
                "border border-hairline bg-raised shadow-chip",
                "transition-colors duration-(--duration-fast) motion-reduce:transition-none",
                "pointer-hover:bg-neutral-100 active:bg-neutral-200",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              )}
            >
              {entry.icon ? (
                <DocIconClient
                  src={entry.icon}
                  alt=""
                  className="size-[17px]"
                  // The install ships a few pages whose icon file is not in
                  // it. A blank tile reads as a fault.
                  fallback={<Icons.page className="size-[17px] text-neutral-400" />}
                />
              ) : (
                <Icons.page className="size-[17px] text-neutral-400" />
              )}
            </Link>
          ))
        )}
      </div>
    </section>
  );
}
