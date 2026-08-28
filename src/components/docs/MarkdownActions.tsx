import { Check, Copy } from "lucide-react";
import { useRef, useState } from "react";

/** Copies the page as Markdown. The app already holds the Markdown, so the
    button never asks anything of the network. */
export function MarkdownActions({ markdown }: { markdown: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(markdown);
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1600);
      }}
      className="flex items-center gap-2 rounded-lg border border-input bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground shadow-xs transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 cursor-pointer"
    >
      {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
      {copied ? "Copied" : "Copy as Markdown"}
    </button>
  );
}
