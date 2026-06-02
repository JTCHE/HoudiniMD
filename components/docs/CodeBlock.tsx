"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Renders a fenced code block with a snappy "Copy" button in the top-right
 * corner. Only block-level code (rendered as <pre>) gets the button — small
 * inline snippets use the <code> renderer instead.
 */
export function CodeBlock({ children }: { children: React.ReactNode }) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = useCallback(async () => {
    const text = preRef.current?.innerText ?? "";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — silently ignore */
    }
  }, []);

  return (
    <div className="not-prose group relative my-4">
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy code"
        className="absolute right-2 top-2 z-10 select-none rounded-md border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-medium text-white/70 opacity-0 backdrop-blur-sm transition-all duration-150 hover:bg-white/20 hover:text-white focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 active:scale-95 group-hover:opacity-100"
      >
        {copied ? "Copied" : "Copy"}
      </button>
      <pre ref={preRef} className="rounded-lg overflow-x-auto border border-border/50">
        {children}
      </pre>
    </div>
  );
}
