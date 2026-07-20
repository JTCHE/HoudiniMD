"use client";

import { useState, useEffect, useRef, startTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DocTooltip, registerSlug } from "./Tooltip";
import { showToast } from "@/components/ui/toast-notification";
import { LATEST_NEWS_INDEX_SLUGS } from "@/lib/houdini";

// Shared across all DocLink instances so a link-dense page (1000+ links) uses
// one observer instead of one per link. Registers a link's slug for tooltip
// background-generation only once it's actually scrolled into view, instead
// of on mount — mounting alone used to queue speculative /api/generate calls
// (the most expensive endpoint in the app) for every link on the page.
let linkObserver: IntersectionObserver | null = null;
const observedSlugs = new WeakMap<Element, string>();

function getLinkObserver() {
  if (linkObserver) return linkObserver;
  linkObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const slug = observedSlugs.get(entry.target);
        if (slug) registerSlug(slug);
        linkObserver!.unobserve(entry.target);
        observedSlugs.delete(entry.target);
      }
    },
    { rootMargin: "200px" },
  );
  return linkObserver;
}

// ponytail: viewport-triggered auto-prefetch was tried and reverted — even
// throttled to 4 concurrent, live rapid-navigation testing on the 10ms-CPU-capped
// Workers Free plan still cascaded (isolate teardown killing unrelated in-flight
// requests, see plans/handoff-bottleneck-loop.md). Prefetch now only fires on
// hover/focus (real intent, one link at a time), which is proven cascade-free.
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
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const slug = href?.startsWith("/docs/") ? href.slice(6).split("#")[0] : null;
  const anchor = href?.includes("#") ? href.slice(href.indexOf("#") + 1) : null;
  const [visible, setVisible] = useState(false);
  const preventNextClick = useRef(false);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const router = useRouter();
  const isInternal = !!slug;

  useEffect(() => {
    if (!slug || !linkRef.current) return;
    const el = linkRef.current;
    const observer = getLinkObserver();
    observedSlugs.set(el, slug);
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
        {...props}
        prefetch={false}
        onMouseDown={(e) => {
          // Navigate on mousedown (saves the ~100ms between mousedown and click).
          // Only plain left click — let browser handle Ctrl/Meta/Shift (new tab etc.)
          if (!isInternal || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
          const resolvedSlug = LATEST_NEWS_INDEX_SLUGS.includes(slug!) ? "houdini" : slug;
          if (window.location.pathname === `/docs/${resolvedSlug}`) {
            if (anchor) document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth" });
            showToast("Already on this page");
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
