"use client";

import { useState, useEffect, useRef, startTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DocTooltip, registerSlug } from "./Tooltip";
import { showToast } from "@/components/ui/toast-notification";
import { LATEST_NEWS_INDEX_SLUGS } from "@/lib/houdini";
import { cn } from "@/lib/utils";

export const DOC_LINK_CLASS_NAME = "underline underline-offset-2";

// Shared across all DocLink instances so a link-dense page (1000+ links) uses
// one observer instead of one per link. Registers a link's slug for tooltip
// background-generation only once it's actually scrolled into view, instead
// of on mount — mounting alone used to queue speculative /api/generate calls
// (the most expensive endpoint in the app) for every link on the page.
let linkObserver: IntersectionObserver | null = null;
const observedSlugs = new WeakMap<Element, { slug: string; href: string }>();
// Single app router instance, stashed by whichever DocLink mounts first, so the
// shared module-level observer can call .prefetch() without needing one router
// reference per link.
let routerRef: ReturnType<typeof useRouter> | null = null;

function getLinkObserver() {
  if (linkObserver) return linkObserver;
  linkObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const info = observedSlugs.get(entry.target);
        if (info) {
          registerSlug(info.slug);
          if (!prefetchedHrefs.has(info.href)) {
            prefetchedHrefs.add(info.href);
            queuePrefetch(() => routerRef?.prefetch(info.href));
          }
        }
        linkObserver!.unobserve(entry.target);
        observedSlugs.delete(entry.target);
      }
    },
    { rootMargin: "200px" },
  );
  return linkObserver;
}

// Now on Workers Paid (30s CPU vs. the free tier's 10ms), the isolate-cascade
// risk that caused the earlier revert (see plans/handoff-bottleneck-loop.md) is
// far less likely — but still capped at 4 concurrent to keep it well-behaved.
const MAX_CONCURRENT_PREFETCH = 4;
const PREFETCH_SLOT_MS = 250;
let activePrefetches = 0;
const prefetchQueue: (() => void)[] = [];
const prefetchedHrefs = new Set<string>();

function drainPrefetchQueue() {
  while (activePrefetches < MAX_CONCURRENT_PREFETCH && prefetchQueue.length > 0) {
    prefetchQueue.shift()!();
  }
}

function queuePrefetch(run: () => void) {
  const run2 = () => {
    activePrefetches++;
    // try/finally: a sync throw from run() must still release the slot, or
    // enough throws permanently deadlock the queue (activePrefetches never drains).
    try {
      run();
    } finally {
      setTimeout(() => {
        activePrefetches--;
        drainPrefetchQueue();
      }, PREFETCH_SLOT_MS);
    }
  };
  if (activePrefetches < MAX_CONCURRENT_PREFETCH) run2();
  else prefetchQueue.push(run2);
}

export default function DocLink({
  href,
  children,
  className,
  underline = true,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { underline?: boolean }) {
  const slug = href?.startsWith("/docs/") ? href.slice(6).split("#")[0] : null;
  const anchor = href?.includes("#") ? href.slice(href.indexOf("#") + 1) : null;
  const [visible, setVisible] = useState(false);
  const preventNextClick = useRef(false);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const router = useRouter();
  const isInternal = !!slug;

  useEffect(() => {
    routerRef = router;
  }, [router]);

  useEffect(() => {
    if (!slug || !linkRef.current) return;
    const el = linkRef.current;
    // Card grids put dozens-to-hundreds of links in the viewport at once (e.g.
    // /docs/houdini/nodes/sop has ~1000). Registering the viewport observer for
    // all of them floods the prefetch queue right after load, so the fetch for
    // a card the user actually clicks queues behind a pile of ones they don't.
    // Hover/focus prefetch (show(), below) still covers the one being clicked.
    if (el.closest(".shelf-grid")) return;
    const observer = getLinkObserver();
    observedSlugs.set(el, { slug, href: href! });
    observer.observe(el);
    return () => {
      observer.unobserve(el);
      observedSlugs.delete(el);
    };
  }, [slug]);

  function show(immediate: boolean) {
    if (!isInternal) return;
    setVisible(true);
    if (prefetchedHrefs.has(href!)) return;
    prefetchedHrefs.add(href!);
    // Mouse hover is high-intent and one-at-a-time, so it jumps the queue.
    // Focus (keyboard tabbing) can fire rapidly across many links in a row —
    // route it through the same queue as viewport prefetch to avoid a burst.
    if (immediate) router.prefetch(href!);
    else queuePrefetch(() => router.prefetch(href!));
  }

  function hide() {
    setVisible(false);
  }

  return (
    <span className="relative inline-block">
      {/* prefetch={false}: Link's own built-in viewport prefetch bursts dozens of RSC requests
          at once on a link-dense page, which cascades isolate teardowns on this CPU-capped
          Worker. Prefetch is manual instead, gated on hover/focus (show()) — real intent only. */}
      <Link
        ref={linkRef}
        href={href!}
        className={cn(underline && DOC_LINK_CLASS_NAME, className)}
        {...props}
        prefetch={false}
        onMouseDown={(e) => {
          // Navigate on mousedown (saves the ~100ms between mousedown and click).
          // Only plain left click — let browser handle Ctrl/Meta/Shift (new tab etc.)
          if (!isInternal || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
          const resolvedSlug = LATEST_NEWS_INDEX_SLUGS.includes(slug!) ? "houdini" : slug;
          if (window.location.pathname === `/docs/${resolvedSlug}`) {
            const target = anchor ? document.getElementById(anchor) : null;
            if (target) {
              target.scrollIntoView({ behavior: "smooth" });
            } else {
              showToast("Already on this page");
            }
            preventNextClick.current = true;
            return;
          }
          startTransition(() => router.push(href!));
        }}
        onClick={(e) => {
          if (preventNextClick.current) {
            e.preventDefault();
            preventNextClick.current = false;
          }
        }}
        onMouseEnter={() => show(true)}
        onMouseLeave={hide}
        onFocus={() => show(false)}
        onBlur={hide}
      >
        {children}
      </Link>
      {visible && isInternal && <DocTooltip slug={slug!} />}
    </span>
  );
}
