"use client";

import { useState, useEffect, useMemo, useRef, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isValidDocUrl, extractSlugFromUrl } from "@/lib/url";
import { cn } from "@/lib/utils";
import { useDebouncedSearch } from "@/lib/search/useDebouncedSearch";
import { logSearch } from "@/lib/search/log";
import { SearchResultList, toRows } from "@/components/search/SearchResultList";
import ProgressLogEntry from "@/components/root/progress-log-entry/ProgressLogEntry";
import { HOUDINI_DOCS_ROOT } from "@/lib/houdini";

// Must match ProgressStage from lib/generator.ts
type ProgressStage = "checking-cache" | "verifying" | "scraping" | "converting" | "saving" | "indexing" | "complete" | "error";

export interface ProgressEvent {
  stage: ProgressStage;
  message: string;
  detail?: string;
}

const PLACEHOLDER_EXAMPLES = [
  "Copy to points",
  "Box",
  "Pyro solver",
  "Read point attribute",
  "MPM vs other solvers",
  "vex/functions/abs",
  `${HOUDINI_DOCS_ROOT}/nodes/sop/scatter.html`,
  "Karma Texture Maps",
];

function useCyclingPlaceholder(examples: string[], intervalMs = 2800) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % examples.length);
        setVisible(true);
      }, 300);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [examples.length, intervalMs]);

  return { placeholder: examples[index], visible };
}

export function HomeSearchField() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [progressLog, setProgressLog] = useState<ProgressEvent[]>([]);
  const [selected, setSelected] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { placeholder, visible } = useCyclingPlaceholder(PLACEHOLDER_EXAMPLES);

  // Same client-side search index/ranking as the docs search overlay.
  const trimmedUrl = url.trim();
  const isUrlLike = isValidDocUrl(trimmedUrl);
  const results = useDebouncedSearch(isProcessing || isUrlLike ? "" : url);
  // The list expands each page into its matching sections, so keyboard
  // navigation counts rows, not results.
  const rows = useMemo(() => toRows(results), [results]);

  useEffect(() => {
    setSelected(0);
    setDropdownOpen(!isProcessing && !isUrlLike && results.length > 0);
  }, [results, isProcessing, isUrlLike]);

  function handleInputChange(value: string) {
    setUrl(value);
    if (error) setError("");
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const row = dropdownOpen ? rows[selected] : undefined;
    if (row) {
      selectResult(row.heading ? `${row.result.path}#${row.heading.slug}` : row.result.path);
      return;
    }
    processUrl(url);
  }

  function resetState() {
    setProgress(null);
    setProgressLog([]);
    setError("");
  }

  async function streamGenerate(slug: string) {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    const response = await fetch(`/api/generate?slug=${encodeURIComponent(slug)}`, {
      signal: abortControllerRef.current.signal,
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";
    let receivedTerminalEvent = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const event: ProgressEvent = JSON.parse(line.slice(6));
            setProgress(event);
            setProgressLog((prev) => [...prev, event]);

            if (event.stage === "complete" && event.detail) {
              receivedTerminalEvent = true;
              router.push(event.detail!);
              setIsProcessing(false);
            } else if (event.stage === "error") {
              receivedTerminalEvent = true;
              setError(event.detail || event.message);
              setIsProcessing(false);
            }
          } catch {
            console.error("Failed to parse SSE event:", line);
          }
        }
      }
    }

    if (!receivedTerminalEvent) {
      const timeoutEvent: ProgressEvent = {
        stage: "error",
        message: "Connection lost",
        detail: "The server timed out or the connection was interrupted. Please try again.",
      };
      setProgress(timeoutEvent);
      setProgressLog((prev) => [...prev, timeoutEvent]);
      setError(timeoutEvent.detail!);
      setIsProcessing(false);
    }
  }

  async function processUrl(input: string) {
    const trimmed = input.trim();
    if (!trimmed) return;

    setDropdownOpen(false);
    resetState();
    setIsProcessing(true);

    try {
      // Path 1: recognised URL or shorthand (sidefx.com, houdinimd.com, /nodes/sop/…)
      if (isValidDocUrl(trimmed)) {
        const slug = extractSlugFromUrl(trimmed);
        if (!slug) {
          setError("Could not extract path from URL");
          setIsProcessing(false);
          return;
        }
        await streamGenerate(slug);
        return;
      }

      // Path 2: bare name — resolve via index search then SideFX path probing
      setProgress({ stage: "checking-cache", message: "Searching…", detail: `Looking for "${trimmed}"` });
      setProgressLog([{ stage: "checking-cache", message: "Searching…", detail: `Looking for "${trimmed}"` }]);

      const res = await fetch(`/api/resolve?name=${encodeURIComponent(trimmed)}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? `No documentation found for "${trimmed}".`);
        setIsProcessing(false);
        return;
      }

      await streamGenerate(data.slug);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      console.error("Generation failed:", err);
      setError("Failed to process. Please try again.");
      setIsProcessing(false);
    }
  }

  // A dropdown pick is an already-indexed page — navigate straight there
  // instead of round-tripping through /api/resolve, same as the search overlay.
  // No server sees this search, so it is beaconed; the /api/resolve and
  // /api/generate paths above are recorded by the worker instead.
  function selectResult(slug: string) {
    setDropdownOpen(false);
    logSearch(url, slug.split("#")[0], "home", results.findIndex((result) => result.path === slug.split("#")[0]) + 1);
    router.push(`/docs/${slug}`);
  }

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Cleanup abort controller
  useEffect(
    () => () => {
      abortControllerRef.current?.abort();
    },
    [],
  );

  // Global paste handler
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      if (document.activeElement?.tagName !== "INPUT") {
        const text = e.clipboardData?.getData("text");
        if (text) {
          e.preventDefault();
          setUrl(text);
          processUrl(text);
        }
      }
    }
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (!dropdownOpen || rows.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => (s + 1) % rows.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => (s - 1 + rows.length) % rows.length);
    } else if (e.key === "Escape") {
      setDropdownOpen(false);
    }
  }

  const buttonText = isProcessing && progress ? progress.message : isProcessing ? "Starting…" : "Go";

  return (
    <div ref={containerRef}>
      {error && (
        <p
          id="url-error"
          className="text-xs text-destructive mb-2"
        >
          {error}
        </p>
      )}
      <form
        onSubmit={handleSubmit}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Input
            ref={inputRef}
            type="text"
            value={url}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder=""
            className="flex-1 font-mono text-sm w-full"
            disabled={isProcessing}
            aria-invalid={!!error}
            aria-describedby={error ? "url-error" : undefined}
            autoComplete="off"
          />
          {!url && (
            <span
              className={cn(
                "pointer-events-none absolute inset-y-0 left-3 right-3 flex items-center font-mono text-sm text-muted-foreground/50 transition-opacity duration-300 overflow-hidden",
                visible ? "opacity-100" : "opacity-0",
              )}
            >
              <span className="truncate">{placeholder}</span>
            </span>
          )}

          {dropdownOpen && (
            <SearchResultList
              results={results}
              query={url}
              selected={selected}
              onSelect={setSelected}
              onActivate={(result, anchor) => selectResult(anchor ? `${result.path}#${anchor}` : result.path)}
              className="absolute z-10 top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-2xl overflow-y-auto max-h-80 pb-2"
            />
          )}
        </div>
        <Button
          type="submit"
          disabled={isProcessing || !url.trim()}
          className={cn("min-w-20 transition-all", isProcessing ? "cursor-wait" : "cursor-pointer")}
        >
          {buttonText}
        </Button>
      </form>
      {isProcessing && progressLog.length > 0 && (
        <div className="mt-4 p-3 bg-muted/50 rounded-md border text-sm font-mono overflow-hidden">
          <div className="space-y-1">
            {progressLog.map((event, i) => (
              <ProgressLogEntry
                key={i}
                event={event}
                isLatest={i === progressLog.length - 1}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
