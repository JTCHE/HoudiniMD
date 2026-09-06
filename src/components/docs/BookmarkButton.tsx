import { cn } from "@/lib/utils";
import { Icons } from "@/lib/ui/icons";
import { COMMAND_KEY, isCommand, isTyping, useHotkey } from "@/lib/hotkeys";
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
    <button
      type="button"
      aria-pressed={kept}
      aria-label={kept ? "Remove the bookmark" : "Keep this page"}
      title={`${kept ? "Remove the bookmark" : "Keep this page"} (${COMMAND_KEY} D)`}
      onClick={(() => toggleBookmark(entry))}
      className={cn(
        "grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg border border-input",
        "bg-muted/50 shadow-xs transition-colors hover:bg-muted",
        "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        kept ? "text-brand" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icons.bookmark
        className="size-3.5"
        fill={kept ? "currentColor" : "none"}
        aria-hidden="true"
      />
    </button>
  );
}
