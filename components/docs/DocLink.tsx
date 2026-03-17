"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface MetaEntry {
  title: string;
  summary: string;
}

// Module-level caches shared across all DocLink instances in this session
const metaCache = new Map<string, MetaEntry>();
const fetchingMeta = new Set<string>();
const generatedSlugs = new Set<string>();

export default function DocLink({
  href,
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const slug = href?.startsWith("/docs/") ? href.slice(6) : null;

  const [meta, setMeta] = useState<MetaEntry | null>(() =>
    slug ? (metaCache.get(slug) ?? null) : null
  );
  const [visible, setVisible] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sseRef = useRef<EventSource | null>(null);
  const mountedRef = useRef(true);
  const router = useRouter();
  const isInternal = !!slug;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
    };
  }, []);

  async function fetchMeta(s: string) {
    if (metaCache.has(s)) { setMeta(metaCache.get(s)!); return; }
    if (fetchingMeta.has(s)) return;

    fetchingMeta.add(s);
    try {
      const res = await fetch(`/api/meta?slug=${encodeURIComponent(s)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.title) {
          const entry: MetaEntry = { title: data.title, summary: data.summary ?? "" };
          metaCache.set(s, entry);
          if (mountedRef.current) setMeta(entry);
          return;
        }
      }
    } finally {
      fetchingMeta.delete(s);
    }

    // Not cached — trigger background generation once per slug per session
    if (generatedSlugs.has(s)) return;
    generatedSlugs.add(s);
    const sse = new EventSource(`/api/generate?slug=${encodeURIComponent(s)}`);
    sseRef.current = sse;
    sse.onmessage = (e) => {
      const event = JSON.parse(e.data);
      if (event.stage === "complete") {
        sse.close();
        sseRef.current = null;
        fetch(`/api/meta?slug=${encodeURIComponent(s)}`)
          .then((r) => r.json())
          .then((d) => {
            if (d.title) {
              const entry: MetaEntry = { title: d.title, summary: d.summary ?? "" };
              metaCache.set(s, entry);
              if (mountedRef.current) setMeta(entry);
            }
          })
          .catch(() => {});
      } else if (event.stage === "error") {
        sse.close();
        sseRef.current = null;
      }
    };
    sse.onerror = () => { sse.close(); sseRef.current = null; };
  }

  function show() {
    if (!isInternal) return;
    setVisible(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchMeta(slug!), 75);
  }

  function hide() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setVisible(false);
  }

  return (
    <span className="relative inline-block">
      {/* prefetch={true} tells Next.js to fetch the full RSC payload (not just the loading
          skeleton) when this link enters the viewport. Cached under staleTimes.static (5 min),
          so clicking after it's been visible for even ~30ms is instant with no skeleton. */}
      <Link
        href={href!}
        {...props}
        prefetch={isInternal ? true : undefined}
        onMouseDown={(e) => {
          // Navigate on mousedown (saves the ~100ms between mousedown and click).
          // Only plain left click — let browser handle Ctrl/Meta/Shift (new tab etc.)
          if (!isInternal || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
          router.prefetch(href!);
          router.push(href!);
        }}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </Link>
      {visible && isInternal && (
        <span className="[@media(hover:none)]:hidden absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-50 w-max max-w-[16rem] bg-background border border-border shadow-lg p-2 text-xs pointer-events-none whitespace-normal">
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
      )}
    </span>
  );
}
