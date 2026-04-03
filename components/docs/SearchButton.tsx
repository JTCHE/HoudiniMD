"use client";

import { useState, useEffect } from "react";

interface SearchButtonProps {
  onOpenSearch: () => void;
}

export function SearchButton({ onOpenSearch }: SearchButtonProps) {
  // null = not yet determined (SSR), true = pointer:fine (desktop), false = pointer:coarse (mobile)
  const [isPointerFine, setIsPointerFine] = useState<boolean | null>(null);

  useEffect(() => {
    setIsPointerFine(window.matchMedia("(pointer: fine)").matches);
  }, []);

  // On mobile (confirmed coarse), don't render kbd at all.
  // On SSR and desktop: always render kbd (invisible until confirmed) so height is stable.
  const showKbd = isPointerFine !== false;
  const kbdVisible = isPointerFine === true;

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
      {showKbd && (
        <kbd className={`kbd-button${kbdVisible ? "" : " invisible"}`} aria-hidden={!kbdVisible}>
          ⌘K
        </kbd>
      )}
    </button>
  );
}
