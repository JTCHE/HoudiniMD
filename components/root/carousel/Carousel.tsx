"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { ChipCollection, DocChip } from "@/lib/landing/types";
import { clearVisits, readVisits } from "@/lib/landing/recent-visits";
import { ChipLink } from "./ChipLink";

/**
 * The row of pages under the search field.
 *
 * It has two faces. A new reader gets the curated collection, drifting left for
 * ever, which says "there is a lot here" without asking for a click. A reader
 * who has read pages before gets those instead, still and scrollable, because
 * a list they built themselves is a destination rather than an advert.
 *
 * Which face shows depends on local storage, which the server cannot see. The
 * layout effect below resolves that choice and the random curated start before
 * React reveals the row. The server copy reserves the same height but stays
 * hidden, so it cannot flash the deterministic order while hydration waits.
 */

/** Drift speed of the looping run, in pixels per second. */
const CRUISE_PIXELS_PER_SECOND = 26;
/** Amount of the first chip tucked under the left fade on the first frame. */
const INITIAL_CLIP_PIXELS = 64;
/**
 * Time constants of the two eases. Speed is the slower of the two, so the row
 * settles under the pointer instead of stopping dead; the reveal is quicker,
 * because a reader who has just pressed Tab is waiting for it.
 */
const SPEED_EASE_MS = 280;
const REVEAL_EASE_MS = 160;
/**
 * Longest frame the loop trusts. A backgrounded tab resumes with one enormous
 * gap, which would otherwise teleport the row.
 */
const MAX_FRAME_MS = 64;

/**
 * Exponential approach, expressed per elapsed millisecond rather than per
 * frame, so a 120 Hz display eases at the same rate as a 60 Hz one.
 */
function easeFactor(deltaMs: number, timeConstantMs: number): number {
  return 1 - Math.exp(-deltaMs / timeConstantMs);
}

interface EdgeOverflow {
  left: boolean;
  right: boolean;
}

const NO_OVERFLOW: EdgeOverflow = { left: false, right: false };

export function Carousel({ collection, className }: { collection: ChipCollection | null; className?: string }) {
  // `null` until the first layout effect has run. It doubles as the mounted flag, so
  // nothing reads local storage or the motion preference during render.
  const [visits, setVisits] = useState<DocChip[] | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [overflow, setOverflow] = useState<EdgeOverflow>(NO_OVERFLOW);
  const [startIndex, setStartIndex] = useState(0);

  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const leftFadeRef = useRef<HTMLSpanElement>(null);
  const firstRunRef = useRef<HTMLDivElement>(null);
  const secondRunRef = useRef<HTMLDivElement>(null);

  /** Distance between the two copies of the run — the offset wraps at this. */
  const pitchRef = useRef(0);
  const offsetRef = useRef(0);
  const speedRef = useRef(0);
  const initialOffsetSetRef = useRef(false);
  const hoveredRef = useRef(false);
  const focusedRef = useRef(false);
  /** Offset that brings the focused chip inside the viewport, or `null`. */
  const dragPointerRef = useRef<number | null>(null);
  const dragStartXRef = useRef(0);
  const dragStartOffsetRef = useRef(0);
  const draggedRef = useRef(false);
  const revealRef = useRef<number | null>(null);

  const showsVisits = visits !== null && visits.length > 0;
  const collectionLength = collection?.chips.length ?? 0;
  const chips = useMemo(() => {
    const source = showsVisits ? visits : (collection?.chips ?? []);
    if (showsVisits || startIndex === 0) return source;
    return [...source.slice(startIndex), ...source.slice(0, startIndex)];
  }, [showsVisits, visits, collection, startIndex]);
  const label = showsVisits ? "Recently visited" : (collection?.label ?? "");
  const autoScrolls = visits !== null && !showsVisits && !reducedMotion && chips.length > 0;
  // A second copy only earns its place once the first one runs off the edge.
  const loops = autoScrolls && overflow.right;

  // Resolve all client-only choices before paint. This keeps hydration markup
  // deterministic without exposing the server's index-zero order for a frame.
  useLayoutEffect(() => {
    const storedVisits = readVisits();
    setVisits(storedVisits);
    if (storedVisits.length === 0 && collectionLength) {
      setStartIndex(Math.floor(Math.random() * collectionLength));
    }

    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [collectionLength]);

  // Start between chips rather than on the page axis. The clipped leading chip
  // makes the row's horizontal movement clear before it has drifted a pixel.
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!autoScrolls || !track || initialOffsetSetRef.current) return;

    initialOffsetSetRef.current = true;
    offsetRef.current = INITIAL_CLIP_PIXELS;
    track.style.transform = `translate3d(${-INITIAL_CLIP_PIXELS}px, 0, 0)`;
    if (leftFadeRef.current) leftFadeRef.current.style.opacity = "1";
  }, [autoScrolls]);

  // Measure what is really clipped. An edge gradient that lies is worse than no
  // gradient, so nothing here is inferred from the mode alone.
  useEffect(() => {
    const viewport = viewportRef.current;
    const firstRun = firstRunRef.current;
    if (!viewport || !firstRun) return;

    const measure = () => {
      const secondRun = secondRunRef.current;
      pitchRef.current = secondRun ? secondRun.offsetLeft - firstRun.offsetLeft : 0;

      let edges: EdgeOverflow;
      if (autoScrolls) {
        // The run repeats for ever, so once one copy is wider than the viewport
        // there is always content behind the right edge. The LEFT edge is a
        // different claim: at rest the run starts flush, and a gradient there
        // would veil the first chip for no reason. The drift loop below fades
        // it in as soon as the row has actually moved.
        edges = { left: false, right: firstRun.offsetWidth > viewport.clientWidth };
      } else {
        const maxScroll = viewport.scrollWidth - viewport.clientWidth;
        edges = { left: viewport.scrollLeft > 1, right: viewport.scrollLeft < maxScroll - 1 };
      }

      setOverflow((current) => (current.left === edges.left && current.right === edges.right ? current : edges));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(firstRun);
    viewport.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      viewport.removeEventListener("scroll", measure);
    };
  }, [autoScrolls, loops, chips]);

  // One loop drives the drift. It eases the speed toward a target rather than
  // toggling an animation, so the row slows into a stop under the pointer and
  // rolls back up when the pointer leaves.
  useEffect(() => {
    const track = trackRef.current;
    if (!autoScrolls || !track) return;

    let previous = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const deltaMs = Math.min(now - previous, MAX_FRAME_MS);
      previous = now;

      const pitch = pitchRef.current;
      if (pitch > 0) {
        const targetSpeed = hoveredRef.current || focusedRef.current ? 0 : CRUISE_PIXELS_PER_SECOND;
        speedRef.current += (targetSpeed - speedRef.current) * easeFactor(deltaMs, SPEED_EASE_MS);
        offsetRef.current += (speedRef.current * deltaMs) / 1000;

        const reveal = revealRef.current;
        if (reveal !== null) {
          // Positions repeat every `pitch`, so take the short way round.
          let distance = reveal - offsetRef.current;
          distance -= Math.round(distance / pitch) * pitch;
          offsetRef.current += distance * easeFactor(deltaMs, REVEAL_EASE_MS);
        }

        offsetRef.current = ((offsetRef.current % pitch) + pitch) % pitch;
      }

      track.style.transform = `translate3d(${-offsetRef.current}px, 0, 0)`;
      // Written straight to the element rather than through state: this is a
      // per-frame value, and a re-render per frame would cost more than the
      // whole drift.
      if (leftFadeRef.current) {
        leftFadeRef.current.style.opacity = String(Math.min(offsetRef.current / 24, 1));
      }
      frame = requestAnimationFrame(step);
    });

    const leftFade = leftFadeRef.current;
    return () => {
      cancelAnimationFrame(frame);
      offsetRef.current = 0;
      speedRef.current = 0;
      initialOffsetSetRef.current = false;
      revealRef.current = null;
      track.style.transform = "";
      if (leftFade) leftFade.style.opacity = "";
    };
  }, [autoScrolls]);

  /**
   * Keep the chip the reader tabbed to inside the viewport. The viewport clips
   * rather than scrolls, so the browser cannot reveal it — the offset must.
   */
  function revealFocusedChip(target: EventTarget) {
    const viewport = viewportRef.current;
    const chip = (target as HTMLElement).closest("a");
    if (!viewport || !chip || pitchRef.current <= 0) return;

    const chipBox = chip.getBoundingClientRect();
    const viewportBox = viewport.getBoundingClientRect();
    const inset = getComputedStyle(viewport);
    const leftLimit = viewportBox.left + parseFloat(inset.paddingLeft);
    const rightLimit = viewportBox.right - parseFloat(inset.paddingRight);

    let correction = 0;
    if (chipBox.left < leftLimit) correction = chipBox.left - leftLimit;
    else if (chipBox.right > rightLimit) correction = chipBox.right - rightLimit;

    revealRef.current = correction === 0 ? null : offsetRef.current + correction;
  }

  function moveLoop(distance: number) {
    const pitch = pitchRef.current;
    if (pitch > 0) offsetRef.current = (((offsetRef.current + distance) % pitch) + pitch) % pitch;
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;
    const distance = (event.deltaX || event.deltaY);
    if (!viewport || distance === 0) return;

    if (autoScrolls) {
      event.preventDefault();
      moveLoop(distance);
      return;
    }

    const nextScroll = Math.max(0, Math.min(viewport.scrollLeft + distance, viewport.scrollWidth - viewport.clientWidth));
    if (nextScroll !== viewport.scrollLeft) {
      event.preventDefault();
      viewport.scrollLeft = nextScroll;
    }
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!autoScrolls || event.button !== 0) return;
    dragPointerRef.current = event.pointerId;
    dragStartXRef.current = event.clientX;
    dragStartOffsetRef.current = offsetRef.current;
    draggedRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (dragPointerRef.current !== event.pointerId) return;
    const distance = dragStartXRef.current - event.clientX;
    if (Math.abs(distance) > 4) draggedRef.current = true;
    moveLoop(dragStartOffsetRef.current + distance - offsetRef.current);
  }

  function endPointerDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (dragPointerRef.current !== event.pointerId) return;
    dragPointerRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    requestAnimationFrame(() => (draggedRef.current = false));
  }

  function handleClear() {
    clearVisits();
    setVisits([]);
  }

  if (!chips.length) return null;

  const chipRun = chips.map((chip) => (
    <ChipLink
      key={chip.path}
      chip={chip}
    />
  ));

  return (
    <section className={cn("flex flex-col gap-xs md:gap-ms", className)}>
      <div className="flex items-center justify-between gap-sm">
        <h2 className="text-label font-semibold text-foreground">{label}</h2>
        {showsVisits && (
          <button
            type="button"
            onClick={handleClear}
            className="cursor-pointer rounded-md text-meta font-medium text-muted-foreground transition-colors duration-(--duration-fast) pointer-hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            Clear
          </button>
        )}
      </div>

      {/* The row overhangs the page gutter by exactly its own padding, so the
          first chip starts on the text axis and only the surface runs past it. */}
      <div className="relative -mx-lg">
        <div
          ref={viewportRef}
          onPointerEnter={() => (hoveredRef.current = true)}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endPointerDrag}
          onPointerCancel={endPointerDrag}
          onClickCapture={(event) => {
            if (draggedRef.current) event.preventDefault();
          }}
          onPointerLeave={() => (hoveredRef.current = false)}
          onFocus={(event) => {
            focusedRef.current = true;
            revealFocusedChip(event.target);
          }}
          onBlur={() => {
            focusedRef.current = false;
            revealRef.current = null;
          }}
          className={cn(
            "px-ms",
            visits === null && "invisible",
            // The edge gradients are the overflow affordance. A native bar
            // under the chips would say the same thing and change the row
            // height between the two modes.
            autoScrolls ? "touch-pan-y overflow-clip" : "overflow-x-auto [scrollbar-width:none]",
          )}
        >
          <div
            ref={trackRef}
            className={cn("flex w-max gap-sm", autoScrolls && "will-change-transform")}
          >
            <div
              ref={firstRunRef}
              className="flex gap-sm"
            >
              {chipRun}
            </div>
            {loops && (
              <div
                ref={secondRunRef}
                aria-hidden="true"
                className="flex gap-sm"
              >
                {chipRun}
              </div>
            )}
          </div>
        </div>

        <span
          ref={leftFadeRef}
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 w-xl bg-linear-to-r from-background to-transparent transition-opacity motion-reduce:transition-none",
            overflow.left ? "opacity-100" : "opacity-0",
          )}
        />
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-y-0 right-0 w-xl bg-linear-to-l from-background to-transparent transition-opacity motion-reduce:transition-none",
            overflow.right ? "opacity-100" : "opacity-0",
          )}
        />
      </div>
    </section>
  );
}
