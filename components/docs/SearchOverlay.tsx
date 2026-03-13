"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

interface SearchResult {
  path: string;
  title: string;
  summary: string;
  category: string;
  docs_url: string;
}

export default function SearchOverlay() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Open on Ctrl+K / Cmd+K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
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
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Live search as user types
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(query)}&limit=6`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => { setResults(d.results ?? []); setSelected(0); })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [query]);

  const navigate = useCallback(async (result?: SearchResult) => {
    setOpen(false);
    if (result) {
      router.push(result.docs_url);
      return;
    }
    // No result selected — try resolve for unindexed pages
    if (!query.trim()) return;
    const res = await fetch(`/api/resolve?name=${encodeURIComponent(query)}`);
    if (res.ok) {
      const data = await res.json();
      router.push(`/docs/${data.slug}`);
    }
  }, [query, router]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, results.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
    if (e.key === "Enter")     { navigate(results[selected]); }
  }

  if (!open) return null;

  return (
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
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search docs…"
          className="w-full px-4 py-3 text-sm bg-transparent outline-none border-b font-mono"
        />

        {results.length > 0 && (
          <ul className="max-h-72 overflow-y-auto">
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
          </ul>
        )}

        {query && !loading && results.length === 0 && (
          <p className="px-4 py-3 text-sm text-muted-foreground">
            No results — press Enter to try resolving "{query}"
          </p>
        )}

        <div className="px-4 py-2 border-t text-xs text-muted-foreground flex gap-3">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
