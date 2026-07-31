"use client";

import { useState } from "react";

/**
 * A single result row (icon + title + category) shared by the docs search
 * overlay and the homepage search field, so both render results identically.
 */
/**
 * One icon set, drawn on the Solar Linear grid: 24 viewBox, 1.5 stroke, round
 * caps, `currentColor`. Sharing the grid is what makes them look related — a
 * heavier stroke or a different viewBox reads as a different family even at the
 * same pixel size.
 */
function SolarIcon({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/**
 * Stand-in for pages with no icon of their own — VEX functions, HScript
 * commands and guide pages, a large part of the corpus. Without it those rows
 * lose the icon column and their titles sit out of line with the node results
 * around them.
 *
 * Drawn to match the Solar set rather than copied from it: the collection's own
 * document glyph could not be fetched, so this follows the same grid, stroke
 * and corner radius as the hashtag and paragraph icons beside it.
 */
function DocumentIcon() {
  return (
    <SolarIcon className="size-5 text-muted-foreground/55">
      <path d="M14 3.5H9c-2.357 0-3.536 0-4.268.732C4 4.964 4 6.143 4 8.5v7c0 2.357 0 3.536.732 4.268.732.732 1.911.732 4.268.732h6c2.357 0 3.536 0 4.268-.732.732-.732.732-1.911.732-4.268V9L14 3.5Z" />
      <path d="M14 3.5V7c0 .943 0 1.414.293 1.707C14.586 9 15.057 9 16 9h4" />
      <path d="M8.5 14h7M8.5 17.5h4" />
    </SolarIcon>
  );
}

/** Marks a named section. Solar "Hashtag". */
function HashIcon() {
  return (
    <SolarIcon className="size-[1.05rem]">
      <path d="M10 3L5 21M19 3L14 21M22 9H4M20 16H2" />
    </SolarIcon>
  );
}

/** Marks prose from the page. Solar "List 1", read here as a paragraph. */
function ParagraphIcon() {
  return (
    <SolarIcon className="size-[1.05rem]">
      <path d="M20 7H4M15 12H4M9 17H4" />
    </SolarIcon>
  );
}

export function SearchResultRow({
  title,
  category,
  icon,
  active,
  sub,
  subKind,
  excerpt,
  onClick,
  onMouseMove,
}: {
  title: string;
  category: string;
  icon?: string;
  active: boolean;
  /** Render as a hit nested under the page row above it. */
  sub?: boolean;
  /** What kind of nested hit: a named section, or prose from the page. */
  subKind?: "heading" | "text";
  /** Matching prose, shown under the sub-row title. */
  excerpt?: string;
  onClick: () => void;
  onMouseMove: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  if (sub) {
    return (
      <button
        type="button"
        className={`w-full text-left pr-4 flex items-stretch gap-2.5 transition-colors ${
          active ? "bg-muted" : "hover:bg-muted/50"
        }`}
        onClick={onClick}
        onMouseMove={onMouseMove}
      >
        {/*
          One unbroken rule down the left of the whole group, so a run of hits
          reads as belonging to the page above it. Every nested row draws its
          full height, so consecutive rows join into a single line.
        */}
        <span aria-hidden="true" className="ml-[1.6rem] w-px shrink-0 bg-muted-foreground/25" />

        <span className="flex min-w-0 flex-1 items-start gap-2 py-1.5">
          <span aria-hidden="true" className="mt-px shrink-0 text-muted-foreground/50">
            {subKind === "text" ? <ParagraphIcon /> : <HashIcon />}
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-xs text-muted-foreground">{title}</span>
            {excerpt && (
              <span className="line-clamp-2 text-[0.7rem] leading-snug text-muted-foreground/60">
                {excerpt}
              </span>
            )}
          </span>
        </span>
      </button>
    );
  }

  // A broken icon URL falls back to the placeholder rather than pulsing a
  // skeleton forever, so the icon column stays the same width on every row.
  const hasImage = Boolean(icon) && !errored;

  return (
    <button
      type="button"
      className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${
        active ? "bg-muted" : "hover:bg-muted/50"
      }`}
      onClick={onClick}
      onMouseMove={onMouseMove}
    >
      <span className="relative size-5 shrink-0">
        {hasImage ? (
          <>
            {!loaded && <span className="absolute inset-0 rounded-sm bg-muted-foreground/20 animate-pulse" aria-hidden="true" />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={icon}
              alt=""
              aria-hidden="true"
              className={`size-5 shrink-0 select-none transition-opacity ${loaded ? "opacity-100" : "opacity-0"}`}
              onLoad={() => setLoaded(true)}
              onError={() => setErrored(true)}
            />
          </>
        ) : (
          <DocumentIcon />
        )}
      </span>
      <span className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm font-medium truncate">{title}</span>
        <span className="text-xs text-muted-foreground truncate">{category}</span>
      </span>
    </button>
  );
}
