"use client";

import { Copy } from "lucide-react";
import { useCallback, useEffect } from "react";
import { showToast } from "@/components/ui/toast-notification";

interface MarkdownActionsProps {
  slug: string;
}

export function MarkdownActions({ slug }: MarkdownActionsProps) {
  const mdHref = `/docs/${slug}.md`;

  const handleCopy = useCallback(async () => {
    try {
      const res = await fetch(mdHref);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      showToast("Markdown copied to clipboard");
    } catch {
      showToast("Couldn't copy markdown", "error");
    }
  }, [mdHref]);

  // Global Ctrl/Cmd+C — copies the whole page markdown UNLESS the user is
  // copying a real text selection or typing in an input. Native copy of a
  // selection wins; only "empty" Ctrl+C triggers the page-level copy.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "c" || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;

      const sel = window.getSelection();
      if (sel && sel.toString().trim().length > 0) return;

      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;

      e.preventDefault();
      void handleCopy();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleCopy]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Copy as Markdown (⌘C / Ctrl+C)"
      className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium text-foreground bg-background border border-border rounded-md shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40 cursor-pointer"
    >
      <Copy className="size-3.5 text-muted-foreground" />
      Copy as Markdown
    </button>
  );
}
