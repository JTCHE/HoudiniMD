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

export default function Home() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [progressLog, setProgressLog] = useState<ProgressEvent[]>([]);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  function handleInputChange(value: string) {
    setUrl(value);
    if (error) {
      setError("");
    }
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

  async function processUrl(input: string) {
    if (!isValidDocUrl(input)) {
      setError("Please enter a valid SideFX or VexLLM documentation URL");
      return;
    }

    const slug = extractSlugFromUrl(input);
    if (!slug) {
      setError("Could not extract path from URL");
      return;
    }

    resetState();
    setIsProcessing(true);

    // Abort any existing request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(`/api/generate?slug=${encodeURIComponent(slug)}`, {
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let receivedTerminalEvent = false;

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE events
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
                // Small delay to show completion message
                setTimeout(() => {
                  router.push(event.detail!);
                }, 300);
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

      // If stream ended without a terminal event, the connection was lost (timeout, reset, etc.)
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
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      console.error("Generation failed:", err);
      setError("Failed to process URL. Please try again.");
      setIsProcessing(false);
    }
  }

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Cleanup abort controller
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Global paste handler
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      if (document.activeElement?.tagName !== "INPUT") {
        const text = e.clipboardData?.getData("text");
        if (text) {
          e.preventDefault();
          setUrl(text);
          if (isValidDocUrl(text)) {
            processUrl(text);
          } else {
            setError("Please enter a valid SideFX or VexLLM documentation URL");
          }
        }
      }
    }

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, []);

  const buttonText = isProcessing && progress ? progress.message : isProcessing ? "Starting..." : "Convert";

  return (
    <main className="h-screen flex flex-col justify-center px-8 max-w-2xl">
      <h1 className="text-3xl font-bold tracking-tight leading-6">VexLLM</h1>
      <p className="text-muted-foreground mt-2 mb-5">
        Paste a SideFX Houdini documentation URL to convert it to LLM-friendly markdown
      </p>

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
        <Input
          ref={inputRef}
          type="text"
          value={url}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder="https://sidefx.com/docs/houdini/vex/functions/noise.html"
          className="flex-1 font-mono text-sm"
          disabled={isProcessing}
          aria-invalid={!!error}
          aria-describedby={error ? "url-error" : undefined}
        />
        <Button
          type="submit"
          disabled={isProcessing || !url.trim()}
          className={cn("min-w-30 transition-all", isProcessing ? "cursor-wait" : "cursor-pointer")}
        >
          {buttonText}
        </Button>
      </form>

      {/* Progress Log */}
      {isProcessing && progressLog.length > 0 && (
        <div className="mt-4 p-3 bg-muted/50 rounded-md border text-sm font-mono overflow-none">
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
