"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import hljs from "highlight.js/lib/core";
import c from "highlight.js/lib/languages/c";
import python from "highlight.js/lib/languages/python";

// Syntax highlighting runs on the CLIENT (not server-side via rehype-highlight)
// so the cached/prerendered HTML stays small and the Worker render stays cheap
// enough to fit the 10ms free-tier CPU limit. Only the languages we actually
// emit are registered, keeping the client bundle minimal. vex/hscript reuse the
// C grammar — matching the previous rehype-highlight aliases.
hljs.registerLanguage("c", c);
hljs.registerLanguage("python", python);
hljs.registerAliases(["vex", "hscript"], { languageName: "c" });

/**
 * Renders a fenced code block with a snappy "Copy" button in the top-right
 * corner. Only block-level code (rendered as <pre>) gets the button — small
 * inline snippets use the <code> renderer instead.
 */
export function CodeBlock({ children }: { children: React.ReactNode }) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Highlight in useLayoutEffect (synchronous, before the browser paints the
  // hydrated tree) so there's no visible flash from plain → coloured code once
  // React takes over on the client.
  useLayoutEffect(() => {
    const code = preRef.current?.querySelector("code");
    if (code && !(code as HTMLElement).dataset.highlighted) {
      hljs.highlightElement(code as HTMLElement);
    }
  }, []);

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
