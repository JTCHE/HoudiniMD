"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ProgressEvent } from "@/lib/generator";
import { extractSlugFromUrl, isValidDocUrl } from "@/lib/url";
import { toRows, type Row } from "@/components/search/SearchResultList";
import { logSearch } from "./log";
import { ResolveError, resolveName, streamMirror } from "./mirror-page";
import { useDebouncedSearch } from "./useDebouncedSearch";
import type { RankedResult } from "./ranking";


/**
 * Everything a search field does, minus how it looks.
 *
 * A field takes three kinds of input — a bare name, a doc path, or a full
 * SideFX or HoudiniMD URL. A name the in-browser index already knows navigates
 * straight to the page; anything else is resolved and then mirrored, with the
 * mirror job's progress streamed back. None of that is specific to the landing
 * page, so none of it lives in the landing page's component.
 */
export interface SearchFieldState {
  query: string;
  setQuery: (value: string) => void;
  error: string;
  isProcessing: boolean;
  progress: ProgressEvent | null;
  progressLog: ProgressEvent[];
  results: RankedResult[];
  rows: Row[];
  selected: number;
  setSelected: (index: number) => void;
  dropdownOpen: boolean;
  closeDropdown: () => void;
  /** Submit whatever is typed, or the highlighted row if the list is open. */
  submit: () => void;
  /** Go straight to an already-indexed page — `path` or `path#anchor`. */
  openResult: (slug: string) => void;
  /** Fill the field from the clipboard and search it, in one tap. */
  pasteAndSearch: () => void;
  /** Arrow keys and Escape for the predictive list. */
  handleKeyDown: (event: React.KeyboardEvent) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

/**
 * @param source Where a click is reported from, for search-quality analytics.
 */
export function useSearchField(source: "overlay" | "home"): SearchFieldState {
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [progressLog, setProgressLog] = useState<ProgressEvent[]>([]);
  const [selected, setSelected] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const trimmedQuery = query.trim();
  const isUrlLike = isValidDocUrl(trimmedQuery);
  // A URL is a destination, not a query: predicting against it wastes the index
  // and offers rows the reader did not ask for.
  const results = useDebouncedSearch(isProcessing || isUrlLike ? "" : query);
  // The list expands each page into its matching sections, so keyboard
  // navigation counts rows, not results.
  const rows = useMemo(() => toRows(results), [results]);

  useEffect(() => {
    setSelected(0);
    setDropdownOpen(!isProcessing && !isUrlLike && results.length > 0);
  }, [results, isProcessing, isUrlLike]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const record = useCallback((event: ProgressEvent) => {
    setProgress(event);
    setProgressLog((previous) => [...previous, event]);
  }, []);

  const openResult = useCallback(
    (slug: string) => {
      setDropdownOpen(false);
      const path = slug.split("#")[0];
      // No server sees a dropdown pick, so it is reported from here; the
      // resolve and mirror paths below are recorded by the worker instead.
      logSearch(query, path, source, results.findIndex((result) => result.path === path) + 1);
      router.push(`/docs/${slug}`);
    },
    [query, results, router, source],
  );

  const processInput = useCallback(
    async (input: string) => {
      const trimmed = input.trim();
      if (!trimmed) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setDropdownOpen(false);
      setProgress(null);
      setProgressLog([]);
      setError("");
      setIsProcessing(true);

      const onEvent = (event: ProgressEvent) => {
        record(event);
        if (event.stage === "complete" && event.detail) {
          router.push(event.detail);
          setIsProcessing(false);
        } else if (event.stage === "error") {
          setError(event.detail || event.message);
          setIsProcessing(false);
        }
      };

      try {
        // Path 1: a URL or shorthand already names the page.
        if (isValidDocUrl(trimmed)) {
          const slug = extractSlugFromUrl(trimmed);
          if (!slug) {
            setError("Could not extract path from URL");
            setIsProcessing(false);
            return;
          }
          await streamMirror(slug, onEvent, controller.signal);
          return;
        }

        // Path 2: a bare name — ask the server which page it means first.
        record({ stage: "checking-cache", message: "Searching…", detail: `Looking for "${trimmed}"` });
        const slug = await resolveName(trimmed, controller.signal);
        await streamMirror(slug, onEvent, controller.signal);
      } catch (caught) {
        if (caught instanceof Error && caught.name === "AbortError") return;
        if (caught instanceof ResolveError) {
          setError(caught.message);
          setIsProcessing(false);
          return;
        }
        console.error("Generation failed:", caught);
        setError("Failed to process. Please try again.");
        setIsProcessing(false);
      }
    },
    [record, router],
  );

  const submit = useCallback(() => {
    const row = dropdownOpen ? rows[selected] : undefined;
    if (row) {
      openResult(row.heading ? `${row.result.path}#${row.heading.slug}` : row.result.path);
      return;
    }
    void processInput(query);
  }, [dropdownOpen, openResult, processInput, query, rows, selected]);

  const pasteAndSearch = useCallback(() => {
    // Safari requires the clipboard request to be the first action from the
    // tap. Focusing first can consume that user activation.
    const clipboard = navigator.clipboard;
    if (!clipboard) {
      void fetch("/api/debug/paste", { method: "POST", body: "clipboard-unavailable" });
      inputRef.current?.focus();
      return;
    }

    const reading = clipboard.read();
    void fetch("/api/debug/paste", { method: "POST", body: "clipboard-read" });
    void reading
      .then(async ([clipboardItem]) => {
        if (!clipboardItem) {
          void fetch("/api/debug/paste", { method: "POST", body: "clipboard-empty" });
          return;
        }
        const type = clipboardItem.types.find((itemType) => itemType === "text/plain" || itemType === "text/uri-list");
        if (!type) {
          void fetch("/api/debug/paste", { method: "POST", body: "clipboard-type-missing" });
          return;
        }
        const text = await (await clipboardItem.getType(type)).text();
        if (!text.trim()) {
          void fetch("/api/debug/paste", { method: "POST", body: "clipboard-text-empty" });
          return;
        }
        void fetch("/api/debug/paste", { method: "POST", body: "clipboard-text" });
        setQuery(text);
        void processInput(text);
      })
      // Refused, or no Clipboard API: expose the native paste control.
      .catch((error) => {
        void fetch("/api/debug/paste", { method: "POST", body: `clipboard-error:${error.name}` });
        inputRef.current?.focus();
      });  }, [processInput]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!dropdownOpen || rows.length === 0) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelected((current) => (current + 1) % rows.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelected((current) => (current - 1 + rows.length) % rows.length);
      } else if (event.key === "Escape") {
        setDropdownOpen(false);
      }
    },
    [dropdownOpen, rows.length],
  );

  // ⌘V anywhere outside a field fills this one and searches it.
  useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      if (document.activeElement?.tagName === "INPUT") return;
      const text = event.clipboardData?.getData("text");
      if (!text) return;
      event.preventDefault();
      setQuery(text);
      void processInput(text);
    }
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [processInput]);

  const setQueryAndClearError = useCallback((value: string) => {
    setQuery(value);
    setError("");
  }, []);

  return {
    query,
    setQuery: setQueryAndClearError,
    error,
    isProcessing,
    progress,
    progressLog,
    results,
    rows,
    selected,
    setSelected,
    dropdownOpen,
    closeDropdown: useCallback(() => setDropdownOpen(false), []),
    submit,
    openResult,
    pasteAndSearch,
    handleKeyDown,
    inputRef,
  };
}
