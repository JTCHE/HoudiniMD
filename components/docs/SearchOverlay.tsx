"use client";

import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { showToast } from "@/components/ui/toast-notification";

interface SearchResult {
  path: string;
  title: string;
  summary: string;
  category: string;
  docs_url: string;
}

export interface SearchOverlayRef {
  openSearch: () => void;
}

const SIDEFX_URL_RE = /sidefx\.com\/docs\/(.+?)(?:\.html)?(?:#.*)?$/;

const RECENT_SEARCHES_KEY = "houdinimd:recent-searches";
const MAX_RECENT = 5;

function normaliseResult(r: SearchResult): SearchResult {
  return r.category === "Direct link" ? { ...r, category: "Houdini Docs" } : r;
}

function getRecentSearches(): SearchResult[] {
  try {
    const raw: SearchResult[] = JSON.parse(
      sessionStorage.getItem(RECENT_SEARCHES_KEY) ?? "[]",
    );
    // Normalise stale "Direct link" entries saved before this fix
    return raw.map(normaliseResult);
  } catch {
    return [];
  }
}

function saveRecentSearch(result: SearchResult) {
  const toSave = normaliseResult(result);
  const existing = getRecentSearches().filter((r) => r.path !== toSave.path);
  const updated = [toSave, ...existing].slice(0, MAX_RECENT);
  sessionStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
}

const SearchOverlay = forwardRef<SearchOverlayRef, {}>(function SearchOverlay(_, ref) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [recentSearches, setRecentSearches] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // Refs to cancel in-flight search when Enter is pressed
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  // Always-current query value — avoids stale closure in navigate()
  const queryRef = useRef("");
  queryRef.current = query;
  const router = useRouter();

  useImperativeHandle(ref, () => ({
    openSearch: () => {
      flushSync(() => setOpen(true));
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

  // Focus input when opened, load recent searches (filter current page)
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelected(0);
      const currentSlug = window.location.pathname.replace(/^\/docs\//, "");
      setRecentSearches(
        getRecentSearches().filter((r) => r.path !== currentSlug),
      );
      inputRef.current?.focus();
    }
  }, [open]);

  // Scroll selected item into view when navigating by keyboard
  useEffect(() => {
    const item = listRef.current?.children[selected] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  // Live search as user types (debounced 150ms)
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
    searchAbortRef.current = controller;

    const timer = setTimeout(() => {
      searchTimerRef.current = null;
      fetch(`/api/search?q=${encodeURIComponent(q)}&limit=6`, { signal: controller.signal })
        .then((r) => r.json())
        .then((d) => {
          const res: SearchResult[] = d.results ?? [];
          setResults(res);
          setSelected(0);
          res.slice(0, 3).forEach((r) => router.prefetch(`/docs/${r.path}`));
        })
        .catch(() => {});
    }, 150);

    searchTimerRef.current = timer;
    return () => {
      clearTimeout(timer);
      searchTimerRef.current = null;
      controller.abort();
    };
  }, [query, router]);

  const isQueryEmpty = !query.trim();
  const isDirect = !isQueryEmpty && results.length === 1 && results[0].category === "Direct link";
  const displayResults = isQueryEmpty ? recentSearches : results;
  const showSearchForItem = !isDirect && !isQueryEmpty;

  const streamAndNavigate = useCallback(
    (slug: string) => {
      const hashIdx = slug.indexOf("#");
      const basePath = hashIdx >= 0 ? slug.slice(0, hashIdx) : slug;
      const anchor = hashIdx >= 0 ? slug.slice(hashIdx + 1) : "";

      if (window.location.pathname === `/docs/${basePath}`) {
        if (anchor) {
          document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth" });
        }
        showToast("Already on this page");
        setOpen(false);
        return;
      }

      flushSync(() => setOpen(false));
      router.push(`/docs/${basePath}${anchor ? `#${anchor}` : ""}`);
    },
    [router],
  );

  const navigate = useCallback(
    async (result?: SearchResult) => {
      if (result) {
        const slug = result.docs_url.replace(/^\/docs\//, "").split("#")[0];
        if (window.location.pathname !== `/docs/${slug}`) {
          saveRecentSearch(result);
        }
        streamAndNavigate(result.docs_url.replace(/^\/docs\//, ""));
        return;
      }
      // Use ref to avoid stale closure on query
      const q = queryRef.current.trim();
      if (!q) return;
      const res = await fetch(`/api/resolve?name=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        if (window.location.pathname !== `/docs/${data.slug}`) {
          const slugParts = (data.slug as string).split("/");
          const title =
            data.title ??
            slugParts[slugParts.length - 1]?.replace(/-/g, " ") ??
            data.slug;
          saveRecentSearch({
            path: data.slug,
            title,
            summary: "",
            category: "Houdini Docs",
            docs_url: `/docs/${data.slug}`,
          });
        }
        streamAndNavigate(data.slug);
      } else {
        showToast(`Nothing found for "${q}"`, "error");
      }
    },
    [streamAndNavigate],
  );

  function cancelSearch() {
    if (searchTimerRef.current !== null) {
      clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
    searchAbortRef.current?.abort();
    setResults([]);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const total = isQueryEmpty
      ? recentSearches.length
      : displayResults.length + (showSearchForItem ? 1 : 0);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => (s + 1) % total);
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => (s - 1 + total) % total);
    }
    if (e.key === "Enter") {
      if (selected < displayResults.length) {
        navigate(displayResults[selected]);
      } else if (!isQueryEmpty) {
        // Cancel the debounced search so results don't flash in after we navigate
        cancelSearch();
        navigate();
      }
    }
  }

  const showList = displayResults.length > 0 || showSearchForItem;

  return (
    <>
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

            {showList && (
              <ul ref={listRef} className="max-h-80 overflow-y-auto">
                {isQueryEmpty && recentSearches.length > 0 && (
                  <li className="px-4 pt-2 pb-1 text-xs text-muted-foreground/60 select-none">
                    Recent
                  </li>
                )}
                {displayResults.map((r, i) => (
                  <li key={r.path}>
                    <button
                      className={`w-full text-left px-4 py-2.5 flex flex-col gap-0.5 transition-colors ${
                        i === selected ? "bg-muted" : "hover:bg-muted/50"
                      }`}
                      onClick={() => navigate(r)}
                      onMouseMove={() => setSelected(i)}
                    >
                      <span className="text-sm font-medium truncate">{r.title}</span>
                      <span className="text-xs text-muted-foreground truncate">{r.category}</span>
                    </button>
                  </li>
                ))}
                {showSearchForItem && query.trim() && (
                  <li>
                    <button
                      className={`w-full text-left px-4 py-2.5 flex items-center gap-2 transition-colors text-muted-foreground ${
                        selected === displayResults.length ? "bg-muted" : "hover:bg-muted/50"
                      }`}
                      onClick={() => { cancelSearch(); navigate(); }}
                      onMouseMove={() => setSelected(displayResults.length)}
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
