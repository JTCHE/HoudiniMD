"use client";

import { useState, useEffect, useRef, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isValidDocUrl, extractSlugFromUrl } from "@/lib/url";
import { cn } from "@/lib/utils";
import ProgressLogEntry from "@/components/root/progress-log-entry/ProgressLogEntry";

// Must match ProgressStage from lib/generator.ts
type ProgressStage = "checking-cache" | "verifying" | "scraping" | "converting" | "saving" | "indexing" | "complete" | "error";

export interface ProgressEvent {
  stage: ProgressStage;
  message: string;
  detail?: string;
}

const PLACEHOLDER_EXAMPLES = [
  "fuse",
  "noise",
  "rbdconstraintsfromrules",
  "https://www.sidefx.com/docs/houdini/vex/functions/fit.html",
  "vex/functions/abs",
  "copytopoints",
  "https://www.sidefx.com/docs/houdini/nodes/sop/scatter.html",
  "attribwrangle",
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

export default function Home() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [progressLog, setProgressLog] = useState<ProgressEvent[]>([]);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { placeholder, visible } = useCyclingPlaceholder(PLACEHOLDER_EXAMPLES);

  function handleInputChange(value: string) {
    setUrl(value);
    if (error) setError("");
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
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

    resetState();
    setIsProcessing(true);

    try {
      // Path 1: recognised URL or shorthand (sidefx.com, vexllm.jchd.me, /nodes/sop/…)
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

  // Focus input on mount
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Cleanup abort controller
  useEffect(() => () => { abortControllerRef.current?.abort(); }, []);

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

  const buttonText = isProcessing && progress ? progress.message : isProcessing ? "Starting…" : "Go";

  return (
    <main className="h-screen overflow-hidden flex flex-col justify-center px-8 max-w-2xl">
      <h1 className="text-3xl font-bold tracking-tight leading-6">VexLLM</h1>
      <p className="text-muted-foreground mt-2 mb-5">
        Type a node name, VEX function, or paste a SideFX URL — get clean markdown.
      </p>

      {error && (
        <p id="url-error" className="text-xs text-destructive mb-2">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Input
            ref={inputRef}
            type="text"
            value={url}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder=""
            className="flex-1 font-mono text-sm w-full"
            disabled={isProcessing}
            aria-invalid={!!error}
            aria-describedby={error ? "url-error" : undefined}
          />
          {!url && (
            <span
              className={cn(
                "pointer-events-none absolute inset-y-0 left-3 right-3 flex items-center font-mono text-sm text-muted-foreground/50 transition-opacity duration-300 overflow-hidden",
                visible ? "opacity-100" : "opacity-0"
              )}
            >
              <span className="truncate">{placeholder}</span>
            </span>
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
    </main>
  );
}
