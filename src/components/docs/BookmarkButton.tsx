import { cn } from "@/lib/utils";
import { Icons } from "@/lib/ui/icons";
import { COMMAND_KEY, isCommand, isTyping, useHotkey } from "@/lib/hotkeys";
import { Hint } from "@/components/ui/Hint";
import { ACTION, ACTION_ICON, QUIET } from "@/lib/ui/button";
import { toggleBookmark, useLibrary, type LibraryEntry } from "@/lib/store/library";

/**
 * Keeps the page, or lets it go. ⌘D does the same.
 *
 * The mark is filled in brand orange when the page is kept, because that is
 * how the panel draws a kept page too — the reader learns one mark, not two.
 */
export function BookmarkButton({ entry }: { entry: Omit<LibraryEntry, "at"> }) {
  const { bookmarks } = useLibrary();
  const kept = bookmarks.some((one) => one.path === entry.path);

  useHotkey((event) => {
    if (event.key !== "d" || !isCommand(event) || event.shiftKey) return;
    if (isTyping(event.target)) return;
    event.preventDefault();
    toggleBookmark(entry);
  });

  return (
    <Hint label={kept ? "Remove the bookmark" : "Bookmark"} keys={`${COMMAND_KEY}+D`}>
    <button
      type="button"
      aria-pressed={kept}
      aria-label={kept ? "Remove the bookmark" : "Keep this page"}
      onClick={(() => toggleBookmark(entry))}
      className={cn(
        ACTION,
        QUIET,
        "w-8 px-0",
        // The background only: the same button serves the next page, and a
        // faded colour drew a kept page as not kept for a moment.
        "transition-[background-color]",
        kept && "text-brand hover:text-brand",
      )}
    >
      <Icons.bookmark
        className={ACTION_ICON}
        fill={kept ? "currentColor" : "none"}
        aria-hidden="true"
      />
    </button>
    </Hint>
  );
}
