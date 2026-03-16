"use client";

import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import ProgressLogEntry from "@/components/root/progress-log-entry/ProgressLogEntry";
import type { ProgressEvent } from "@/lib/generator";

interface SearchResult {
  path: string;
  title: string;
  summary: string;
  category: string;
  docs_url: string;
}

interface Toast {
  message: string;
  type: "error" | "info";
}

export interface SearchOverlayRef {
  openSearch: () => void;
}

const SIDEFX_URL_RE = /sidefx\.com\/docs\/(.+?)(?:\.html)?(?:#.*)?$/;

const SearchOverlay = forwardRef<SearchOverlayRef, {}>(function SearchOverlay(_, ref) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [progressLog, setProgressLog] = useState<ProgressEvent[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const sseRef = useRef<EventSource | null>(null);
  const router = useRouter();

  useImperativeHandle(ref, () => ({
    openSearch: () => {
      flushSync(() => setOpen(true));
      // Focus immediately while still in the click handler
      inputRef.current?.focus();
    },
  }));

  // Open on Ctrl+K / Cmd+K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelected(0);
      // Focus immediately (no setTimeout) so it's in the same event loop
      inputRef.current?.focus();
    }
  }, [open]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Live search as user types
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }

    // Detect SideFX URL paste — direct navigation result
    const sideFXMatch = q.match(SIDEFX_URL_RE);
    if (sideFXMatch) {
      const slug = sideFXMatch[1].replace(/\.html$/, "");
      const title = slug.split("/").pop()?.replace(/-/g, " ") ?? slug;
      setResults([
        {
          path: slug,
          title,
          summary: "Navigate directly to this page",
          category: "Direct link",
          docs_url: `/docs/${slug}`,
        },
      ]);
      setSelected(0);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}&limit=6`, { signal: controller.signal })
        .then((r) => r.json())
        .then((d) => {
          const res: SearchResult[] = d.results ?? [];
          setResults(res);
          setSelected(0);
          res.slice(0, 3).forEach((r) => router.prefetch(`/docs/${r.path}`));
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 150);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, router]);

  const isDirect = results.length === 1 && results[0].category === "Direct link";

  const streamAndNavigate = useCallback(
    async (slug: string) => {
      // Already on this page?
      if (window.location.pathname === `/docs/${slug}`) {
        setToast({ message: "Already on this page", type: "info" });
        setOpen(false);
        return;
      }

      // Check meta cache first — navigate immediately if already cached
      try {
        const metaRes = await fetch(`/api/meta?slug=${encodeURIComponent(slug)}`);
        if (metaRes.ok) {
          flushSync(() => setOpen(false));
          router.push(`/docs/${slug}`);
          return;
        }
      } catch {
        // fall through to SSE generation
      }

      // Not cached — stream generation as non-blocking bottom-right card
      setOpen(false);
      sseRef.current?.close();
      setProgressLog([{ stage: "checking-cache", message: "Resolving…", detail: slug }]);

      const sse = new EventSource(`/api/generate?slug=${encodeURIComponent(slug)}`);
      sseRef.current = sse;
      sse.onmessage = (e) => {
        const event = JSON.parse(e.data) as ProgressEvent;
        setProgressLog((prev) => [...prev, event]);
        if (event.stage === "complete") {
          sse.close();
          router.push(`/docs/${slug}`);
          setTimeout(() => setProgressLog([]), 600);
        } else if (event.stage === "error") {
          sse.close();
          setProgressLog([]);
          setToast({ message: event.detail ?? event.message, type: "error" });
        }
      };
      sse.onerror = () => {
        sse.close();
        setProgressLog([]);
        router.push(`/docs/${slug}`);
      };
    },
    [router],
  );

  const navigate = useCallback(
    async (result?: SearchResult) => {
      if (result) {
        streamAndNavigate(result.docs_url.replace(/^\/docs\//, ""));
        return;
      }
      if (!query.trim()) return;
      const res = await fetch(`/api/resolve?name=${encodeURIComponent(query.trim())}`);
      if (res.ok) {
        const data = await res.json();
        streamAndNavigate(data.slug);
      } else {
        setToast({ message: `Nothing found for "${query.trim()}"`, type: "error" });
      }
    },
    [query, streamAndNavigate],
  );

  function onKeyDown(e: React.KeyboardEvent) {
    const total = results.length + (isDirect ? 0 : 1);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, total - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    }
    if (e.key === "Enter") {
      if (selected < results.length) navigate(results[selected]);
      else navigate();
    }
  }

  return (
    <>
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 inset-x-0 z-[60] flex justify-center pointer-events-none">
          <div
            className={`text-sm px-4 py-2 shadow-lg pointer-events-auto ${
              toast.type === "info" ? "bg-muted text-foreground border border-border" : "bg-foreground text-background"
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}

      {/* Generation progress — non-blocking bottom-right card */}
      {progressLog.length > 0 && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[55] pointer-events-none w-96 bg-background border shadow-2xl p-3 space-y-1.5">
          {progressLog.map((event, i) => (
            <ProgressLogEntry
              key={i}
              event={event}
              isLatest={i === progressLog.length - 1}
            />
          ))}
        </div>
      )}

      {/* Search overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg mx-4 bg-background border rounded-lg shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              type="search"
              inputMode="search"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck="false"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search docs or paste a SideFX URL…"
              className="w-full px-4 py-3 text-sm bg-transparent outline-none border-b font-mono"
            />

            {(results.length > 0 || (query.trim() && !isDirect)) && (
              <ul className="max-h-80 overflow-y-auto">
                {results.map((r, i) => (
                  <li key={r.path}>
                    <button
                      className={`w-full text-left px-4 py-2.5 flex flex-col gap-0.5 transition-colors ${
                        i === selected ? "bg-muted" : "hover:bg-muted/50"
                      }`}
                      onClick={() => navigate(r)}
                      onMouseEnter={() => setSelected(i)}
                    >
                      <span className="text-sm font-medium truncate">{r.title}</span>
                      <span className="text-xs text-muted-foreground truncate">{r.category}</span>
                    </button>
                  </li>
                ))}
                {!isDirect && query.trim() && (
                  <li>
                    <button
                      className={`w-full text-left px-4 py-2.5 flex items-center gap-2 transition-colors text-muted-foreground ${
                        selected === results.length ? "bg-muted" : "hover:bg-muted/50"
                      }`}
                      onClick={() => navigate()}
                      onMouseEnter={() => setSelected(results.length)}
                    >
                      <span className="text-xs shrink-0">Search for</span>
                      <span className="text-sm font-mono truncate">&ldquo;{query.trim()}&rdquo;</span>
                    </button>
                  </li>
                )}
              </ul>
            )}

            <div className="px-4 py-2 border-t text-xs text-muted-foreground flex gap-3 [&_span]:space-x-1 space-x-2">
              <span>
                <span>↑↓</span>
                <span>navigate</span>
              </span>
              <span>
                <span>↵</span>
                <span>open</span>
              </span>
              <span>
                <span>esc</span>
                <span>close</span>
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

export default SearchOverlay;
