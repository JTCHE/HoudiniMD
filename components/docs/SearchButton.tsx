"use client";

interface SearchButtonProps {
  onOpenSearch: () => void;
}

export function SearchButton({ onOpenSearch }: SearchButtonProps) {
  return (
    <button
      onClick={onOpenSearch}
      className="rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      aria-label="Search docs"
      title="Search (Ctrl+K)"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    </button>
  );
}

export function SearchHint() {
  return (
    <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
      <kbd className="px-2 py-1 bg-muted rounded border border-border">⌘K</kbd>
    </div>
  );
}
