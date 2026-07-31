"use client";

import { useState } from "react";

/**
 * A single result row (icon + title + category) shared by the docs search
 * overlay and the homepage search field, so both render results identically.
 */
export function SearchResultRow({
  title,
  category,
  icon,
  active,
  sub,
  onClick,
  onMouseMove,
}: {
  title: string;
  category: string;
  icon?: string;
  active: boolean;
  /** Render as a heading hit nested under the page row above it. */
  sub?: boolean;
  onClick: () => void;
  onMouseMove: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  if (sub) {
    return (
      <button
        type="button"
        className={`w-full text-left pl-9 pr-4 py-1.5 flex items-center gap-2 transition-colors ${
          active ? "bg-muted" : "hover:bg-muted/50"
        }`}
        onClick={onClick}
        onMouseMove={onMouseMove}
      >
        {/* Elbow connector, so a heading reads as belonging to the page above. */}
        <span aria-hidden="true" className="shrink-0 text-muted-foreground/40 font-mono text-xs leading-none">
          ↳
        </span>
        <span className="text-xs text-muted-foreground truncate">{title}</span>
      </button>
    );
  }

  // Treat a broken icon URL as "no icon" so the row falls back to left-aligned
  // text instead of pulsing a skeleton forever.
  const showIconSlot = Boolean(icon) && !errored;

  return (
    <button
      type="button"
      className={`w-full text-left px-4 py-2.5 flex items-center transition-colors ${showIconSlot ? "gap-3" : ""} ${
        active ? "bg-muted" : "hover:bg-muted/50"
      }`}
      onClick={onClick}
      onMouseMove={onMouseMove}
    >
      {showIconSlot && (
        <span className="relative size-5 shrink-0">
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
        </span>
      )}
      <span className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm font-medium truncate">{title}</span>
        <span className="text-xs text-muted-foreground truncate">{category}</span>
      </span>
    </button>
  );
}
