"use client";

interface SearchButtonProps {
  onOpenSearch: () => void;
}

export function SearchButton({ onOpenSearch }: SearchButtonProps) {
  return (
    <button
      onClick={onOpenSearch}
      className="flex items-center gap-2 rounded px-2 py-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      aria-label="Search docs (⌘K)"
      title="Search (⌘K)"
    >
      <svg
        className="w-4 h-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
      <kbd className="hidden sm:inline-flex kbd-button">⌘K</kbd>
    </button>
  );
}
