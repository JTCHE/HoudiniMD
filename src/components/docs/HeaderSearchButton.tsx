import { Search } from "lucide-react";

interface HeaderSearchButtonProps {
  onOpenSearch: () => void;
}

/** Header search trigger, styled as a shadcn input-group: a search icon, a
 *  placeholder label, and a trailing ⌘K key — but it's a button, not a real
 *  input, since a click just opens the SearchOverlay. */
export function HeaderSearchButton({ onOpenSearch }: HeaderSearchButtonProps) {
  return (
    <button
      type="button"
      onClick={onOpenSearch}
      aria-label="Search docs (⌘K)"
      title="Search (⌘K)"
      className="flex w-full max-w-[20rem] sm:max-w-[24rem] md:max-w-[28rem] items-center gap-2 rounded-lg border border-input bg-muted/50 px-3 py-1.5 text-muted-foreground shadow-xs transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 cursor-pointer"
    >
      <Search className="size-4 shrink-0" aria-hidden="true" />
      <span className="flex-1 min-w-0 truncate text-left text-sm">Search docs…</span>
      <kbd className="kbd-button search-kbd-hint shrink-0" aria-hidden="true">
        ⌘K
      </kbd>
    </button>
  );
}
