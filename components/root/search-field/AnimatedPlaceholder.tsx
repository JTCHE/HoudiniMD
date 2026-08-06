"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { PLACEHOLDER_EXAMPLES } from "./placeholders";

/** How long one example stays at rest before the next one takes its place. */
const REST_MS = 3200;
/** The crossfade. Matches `--duration-slow`, which drives the opacity here. */
const FADE_MS = 420;

/**
 * The rotating hint that stands in for a real `placeholder` attribute.
 *
 * One line fades out, the next fades in — nothing moves, nothing is split into
 * words. It is a plain opacity transition, so it behaves the same in every
 * browser and costs one composited layer.
 *
 * It is decoration: `aria-hidden` and non-interactive, so the input keeps one
 * stable accessible name instead of a name that changes every few seconds.
 * Render it only while the field is empty.
 */
export function AnimatedPlaceholder({ className }: { className?: string }) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const rest = setTimeout(() => setVisible(false), REST_MS);
    return () => clearTimeout(rest);
  }, [index]);

  useEffect(() => {
    if (visible) return;
    const fade = setTimeout(() => {
      setIndex((current) => (current + 1) % PLACEHOLDER_EXAMPLES.length);
      setVisible(true);
    }, FADE_MS);
    return () => clearTimeout(fade);
  }, [visible]);

  const example = PLACEHOLDER_EXAMPLES[index];

  return (
    // The box is its own container, so the wide/narrow switch reads the width
    // of the field rather than the width of the window. Drop the field into a
    // sidebar and the hint shortens with it.
    <div
      aria-hidden="true"
      className={cn("@container pointer-events-none absolute inset-0 flex items-center", className)}
    >
      {/* Exactly one line tall and clipped, so a long example can never be seen
          outside the field. */}
      <span
        className={cn(
          "block w-full truncate text-label text-sm text-muted-foreground",
          "transition-opacity duration-(--duration-slow) ease-out-quint",
          "motion-reduce:transition-none",
          visible ? "opacity-100" : "opacity-0",
        )}
      >
        {/* Both texts render and CSS picks one, so the swap costs no media
            query in JavaScript and no layout jump. */}
        <span className="hidden @sm:inline">{example.wide}</span>
        <span className="@sm:hidden">{example.narrow ?? example.wide}</span>
      </span>
    </div>
  );
}
