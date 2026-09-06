import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { invoke } from "../../lib/backend";

interface MetaEntry {
  title: string;
  summary: string;
  /** The page's own icon inside `icons.zip`, or null where it has none. */
  icon: string | null;
}

// Module-level caches shared across all DocTooltip instances in this session.
// `null` marks a page the backend could not name, so a second hover does not
// ask again.
const metaCache = new Map<string, MetaEntry | null>();

// Slugs waiting for the next call. The site asked per link; here one Rust call
// answers a batch, so a viewport full of links is one round trip and not one
// per link.
// `urgent` is what a reader is pointing at right now; it is drained first, so a
// hover never waits behind the viewport warming that queued before it.
const urgent = new Set<string>();
const pending = new Set<string>();
const waiting = new Map<string, Set<(entry: MetaEntry | null) => void>>();
let scheduled: ReturnType<typeof setTimeout> | null = null;

const BATCH_MS = 30;
// A shelf page puts a thousand links in view at once. The whole viewport in one
// call would hold the database lock while the reader is still reading, so the
// queue is drained a slice at a time.
const BATCH_MAX = 128;

function flush() {
  scheduled = null;
  const paths = [...urgent, ...pending].slice(0, BATCH_MAX);
  for (const path of paths) {
    urgent.delete(path);
    pending.delete(path);
  }
  if (urgent.size + pending.size > 0) scheduled = setTimeout(flush, BATCH_MS);
  if (paths.length === 0) return;

  invoke<{ path: string; title: string; summary?: string | null; icon?: string | null }[]>("meta", {
    paths,
  })
    .then((rows) => {
      for (const row of rows) {
        metaCache.set(row.path, {
          title: row.title,
          summary: row.summary ?? "",
          icon: row.icon ?? null,
        });
      }
    })
    .catch(() => {})
    .finally(() => {
      // Anything the answer did not name has no meta in this build. It must
      // still be resolved: the skeleton has no terminal state, so a silent
      // return leaves it loading forever.
      for (const path of paths) {
        if (!metaCache.has(path)) metaCache.set(path, null);
        const entry = metaCache.get(path) ?? null;
        for (const resolve of waiting.get(path) ?? []) resolve(entry);
        waiting.delete(path);
      }
    });
}

/** `eager` is a reader pointing at the link right now. Everything else — a
    link merely on screen, waiting to draw its icon — goes behind that, or a
    shelf page of a thousand links puts a thousand slugs in front of the one
    hover that matters. */
function request(
  slug: string,
  onSettled?: (entry: MetaEntry | null) => void,
  eager = true,
) {
  if (metaCache.has(slug)) {
    onSettled?.(metaCache.get(slug) ?? null);
    return;
  }
  if (onSettled) {
    let set = waiting.get(slug);
    if (!set) waiting.set(slug, (set = new Set()));
    set.add(onSettled);
  }
  if (eager && onSettled) urgent.add(slug);
  else pending.add(slug);
  scheduled ??= setTimeout(flush, BATCH_MS);
}

/** Warms the cache for a link that has scrolled into view, so its tooltip is
 *  already written by the time the reader points at it. */
export function registerSlug(slug: string) {
  request(slug);
}

/** What a page is called and what it looks like, once the batch has answered.
    Null until then, so a link shows what the help wrote and swaps to the page's
    own name when the answer arrives. */
export function usePageMark(slug: string | null): MetaEntry | null {
  const [mark, setMark] = useState<MetaEntry | null>(() => (slug ? (metaCache.get(slug) ?? null) : null));
  useEffect(() => {
    if (!slug) return;
    let live = true;
    request(
      slug,
      (entry) => {
        if (live) setMark(entry);
      },
      false,
    );
    return () => {
      live = false;
    };
  }, [slug]);
  return mark;
}

export function DocTooltip({
  slug,
  anchorRef,
  hoverPosRef,
}: {
  slug: string;
  anchor?: string | null;
  anchorRef: React.RefObject<HTMLElement | null>;
  hoverPosRef?: React.RefObject<{ x: number; y: number } | null>;
}) {
  const [meta, setMeta] = useState<MetaEntry | null>(() => metaCache.get(slug) ?? null);
  const [error, setError] = useState(metaCache.get(slug) === null);
  const mountedRef = useRef(true);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [clampX, setClampX] = useState(0);
  // Fixed-position coordinates anchored off the link, computed each mount so
  // the tooltip escapes any ancestor's `overflow: clip` (e.g. the carousel).
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const anchorEl = anchorRef.current;
    if (!anchorEl) return;
    // Card-grid links use a "stretched link" ::after overlay (globals.css) so the
    // whole card is clickable — the <a> itself is only the title text. Anchoring
    // to the <a>'s own rect centers the tooltip on that title, well off-center
    // from the visually-clickable card, so anchor to the card instead.
    const card = anchorEl.closest<HTMLElement>(".shelf-grid li");
    if (card) {
      const rect = card.getBoundingClientRect();
      setPosition({ top: rect.top - 4, left: rect.left + rect.width / 2 });
      return;
    }
    // getBoundingClientRect() on a wrapped link returns the union of every
    // line's box — its horizontal center can float over blank space between
    // lines, nowhere near the line the cursor is actually on. getClientRects()
    // gives one rect per visual line, so pick the one the pointer entered on.
    const rects = anchorEl.getClientRects();
    const hoverPos = hoverPosRef?.current;
    let rect = rects[0] ?? anchorEl.getBoundingClientRect();
    if (hoverPos) {
      for (const r of rects) {
        if (hoverPos.y >= r.top && hoverPos.y <= r.bottom) {
          rect = r;
          break;
        }
      }
    }
    setPosition({ top: rect.top - 4, left: rect.left + rect.width / 2 });
  }, [anchorRef, hoverPosRef]);

  useLayoutEffect(() => {
    const el = tooltipRef.current;
    if (!el || !position) return;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    let offset = 0;
    if (rect.left < margin) offset = margin - rect.left;
    else if (rect.right > window.innerWidth - margin) offset = window.innerWidth - margin - rect.right;
    setClampX(offset);
  }, [meta, position]);

  useEffect(() => {
    mountedRef.current = true;

    // The same 75ms the site waited: a cursor crossing a line of links must not
    // ask about every one of them on the way past.
    const debounce = setTimeout(() => {
      request(slug, (entry) => {
        if (!mountedRef.current) return;
        if (entry) setMeta(entry);
        else setError(true);
      });
    }, 75);

    return () => {
      mountedRef.current = false;
      clearTimeout(debounce);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error || !position) return null;

  const summary = meta?.summary;

  return createPortal(
    <span
      ref={tooltipRef}
      style={{ top: position.top, left: position.left, transform: `translate(calc(-50% + ${clampX}px), -100%)` }}
      className="[@media(hover:none)]:hidden rounded-lg fixed z-50 w-max max-w-[16rem] bg-background border border-border shadow-lg p-2 text-xs pointer-events-none whitespace-normal"
    >
      {meta ? (
        <>
          <span className="block font-semibold text-foreground">{meta.title}</span>
          {summary && <span className="block text-muted-foreground mt-0.5 line-clamp-2">{summary}</span>}
        </>
      ) : (
        <>
          <span className="sk block h-3 w-28 rounded-lg bg-muted" />
          <span className="sk block h-2.5 w-40 rounded-lg bg-muted mt-1.5" />
        </>
      )}
    </span>,
    document.body,
  );
}
