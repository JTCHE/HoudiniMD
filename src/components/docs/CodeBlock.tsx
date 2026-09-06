import { useCallback, useLayoutEffect, useRef, useState } from "react";
import hljs from "highlight.js/lib/core";
import c from "highlight.js/lib/languages/c";
import python from "highlight.js/lib/languages/python";
import type { CodeLanguage } from "@/lib/markdown/types";

const withFunctionCalls = (languageFactory: typeof c) => (highlightJs: Parameters<typeof c>[0]) => {
  const language = languageFactory(highlightJs);
  language.contains.unshift({
    className: "title function_",
    begin: /\b[A-Za-z_]\w*(?=\s*\()/,
    relevance: 0,
  });
  return language;
};

hljs.registerLanguage("c", withFunctionCalls(c));
hljs.registerLanguage("python", withFunctionCalls(python));
hljs.registerAliases(["vex", "hscript"], { languageName: "c" });

interface CodePanelProps {
  children: React.ReactNode;
  language?: CodeLanguage;
}

/** Shared panel behavior for fenced examples and VEX signature cards. */
export function CodePanel({ children, language }: CodePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => {
    const code = panelRef.current?.querySelector("code");
    if (!code || (code as HTMLElement).dataset.highlighted) return;
    if (language) code.className = `language-${language}`;
    hljs.highlightElement(code as HTMLElement);
  }, [language]);

  const handleCopy = useCallback(async () => {
    const panel = panelRef.current;
    if (!panel) return;
    const signatureRows = panel.querySelectorAll<HTMLElement>(".vex-sig-row");
    const targets = signatureRows.length ? signatureRows : panel.querySelectorAll<HTMLElement>("code");
    const text = Array.from(targets, (target) => target.innerText).join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      // The browser does not provide clipboard access.
    }
  }, []);

  return (
    <div
      ref={panelRef}
      className="group relative"
    >
      <button
        type="button"
        onClick={(handleCopy)}
        aria-label="Copy code"
        className="absolute cursor-pointer right-2 top-2 select-none rounded-md border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-medium text-white/70 backdrop-blur-sm transition-all duration-150 hover:bg-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 active:scale-95"
      >
        {copied ? "Copied" : "Copy"}
      </button>
      {children}
    </div>
  );
}

export function CodeBlock({ children, language }: CodePanelProps) {
  return (
    // Negative margin cancels the panel's own inset (1rem padding + the
    // .code-panel 1px border) so the glyphs land on the shared text axis —
    // same 1rem step the VEX signature panel already uses, see globals.css.
    <div className="not-prose my-4 -mx-[calc(1rem_+_1px)]">
      <CodePanel language={language}>
        <pre className="code-panel">{children}</pre>
      </CodePanel>
    </div>
  );
}
