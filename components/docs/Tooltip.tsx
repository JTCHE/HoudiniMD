"use client";

import { useState, useEffect, useLayoutEffect, useRef } from "react";

interface MetaEntry {
  title: string;
  summary: string;
}

// Module-level caches shared across all DocTooltip instances in this session
const metaCache = new Map<string, MetaEntry>();
const fetchingMeta = new Set<string>();
const generatedSlugs = new Set<string>();

// Background generation queue — max 2 concurrent SSE connections
const generateQueue: string[] = [];
let activeGenerations = 0;
const MAX_CONCURRENT = 2;

function drainQueue() {
  while (activeGenerations < MAX_CONCURRENT && generateQueue.length > 0) {
    const slug = generateQueue.shift()!;
    if (metaCache.has(slug) || generatedSlugs.has(slug)) continue;
    generatedSlugs.add(slug);
    activeGenerations++;

    const sse = new EventSource(`/api/generate?slug=${encodeURIComponent(slug)}`);
    const done = () => { sse.close(); activeGenerations--; drainQueue(); };
    sse.onmessage = (e) => {
      const event = JSON.parse(e.data);
      if (event.stage === "complete") {
        fetch(`/api/meta?slug=${encodeURIComponent(slug)}`)
          .then((r) => r.json())
          .then((d) => { if (d.title) metaCache.set(slug, { title: d.title, summary: d.summary ?? "" }); })
          .catch(() => {})
          .finally(done);
      } else if (event.stage === "error") {
        done();
      }
    };
    sse.onerror = done;
  }
}

function scheduleGeneration(slug: string) {
  if (metaCache.has(slug) || generatedSlugs.has(slug) || generateQueue.includes(slug)) return;
  generateQueue.push(slug);
  drainQueue();
}

// Slugs registered by DocLink instances — processed once prefill is loaded
const registeredSlugs = new Set<string>();
let prefillLoaded = false;

export function registerSlug(slug: string) {
  registeredSlugs.add(slug);
  if (prefillLoaded && !metaCache.has(slug)) scheduleGeneration(slug);
}

// Eagerly load all pre-rendered meta on module init so tooltips are instant
fetch("/api/meta-all")
  .then((r) => r.json())
  .then((map: Record<string, { title: string; summary: string }>) => {
    for (const [path, entry] of Object.entries(map)) {
      if (!metaCache.has(path)) metaCache.set(path, entry);
    }
    prefillLoaded = true;
    // Schedule background generation for any registered slug not in the prefill
    for (const slug of registeredSlugs) {
      if (!metaCache.has(slug)) scheduleGeneration(slug);
    }
  })
  .catch(() => {});

export function DocTooltip({ slug }: { slug: string }) {
  const [meta, setMeta] = useState<MetaEntry | null>(() => metaCache.get(slug) ?? null);
  const [error, setError] = useState(false);
  const mountedRef = useRef(true);
  const sseRef = useRef<EventSource | null>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [clampX, setClampX] = useState(0);

  useLayoutEffect(() => {
    const el = tooltipRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    let offset = 0;
    if (rect.left < margin) offset = margin - rect.left;
    else if (rect.right > window.innerWidth - margin) offset = window.innerWidth - margin - rect.right;
    setClampX(offset);
  }, [meta]);

  useEffect(() => {
    mountedRef.current = true;

    const debounce = setTimeout(async () => {
      if (metaCache.has(slug)) {
        setMeta(metaCache.get(slug)!);
        return;
      }
      if (fetchingMeta.has(slug)) return;

      fetchingMeta.add(slug);
      try {
        const res = await fetch(`/api/meta?slug=${encodeURIComponent(slug)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.title) {
            const entry: MetaEntry = { title: data.title, summary: data.summary ?? "" };
            metaCache.set(slug, entry);
            if (mountedRef.current) setMeta(entry);
            return;
          }
        }
      } finally {
        fetchingMeta.delete(slug);
      }

      // Not in R2 — trigger background generation once per slug per session
      if (generatedSlugs.has(slug)) return;
      generatedSlugs.add(slug);

      const sse = new EventSource(`/api/generate?slug=${encodeURIComponent(slug)}`);
      sseRef.current = sse;
      sse.onmessage = (e) => {
        const event = JSON.parse(e.data);
        if (event.stage === "complete") {
          sse.close();
          sseRef.current = null;
          fetch(`/api/meta?slug=${encodeURIComponent(slug)}`)
            .then((r) => r.json())
            .then((d) => {
              if (d.title) {
                const entry: MetaEntry = { title: d.title, summary: d.summary ?? "" };
                metaCache.set(slug, entry);
                if (mountedRef.current) setMeta(entry);
              }
            })
            .catch(() => {});
        } else if (event.stage === "error") {
          sse.close();
          sseRef.current = null;
          if (mountedRef.current) setError(true);
        }
      };
      sse.onerror = () => {
        sse.close();
        sseRef.current = null;
        if (mountedRef.current) setError(true);
      };
    }, 75);

    return () => {
      mountedRef.current = false;
      clearTimeout(debounce);
      sseRef.current?.close();
      sseRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return null;

  return (
    <span ref={tooltipRef} style={{ transform: `translateX(calc(-50% + ${clampX}px))` }} className="[@media(hover:none)]:hidden absolute bottom-full left-1/2 mb-1 z-50 w-max max-w-[16rem] bg-background border border-border shadow-lg p-2 text-xs pointer-events-none whitespace-normal">
      {meta ? (
        <>
          <span className="block font-semibold text-foreground">{meta.title}</span>
          {meta.summary && (
            <span className="block text-muted-foreground mt-0.5 line-clamp-2">{meta.summary}</span>
          )}
        </>
      ) : (
        <>
          <span className="sk block h-3 w-28 rounded-sm bg-muted" />
          <span className="sk block h-2.5 w-40 rounded-sm bg-muted mt-1.5" />
        </>
      )}
    </span>
  );
}
