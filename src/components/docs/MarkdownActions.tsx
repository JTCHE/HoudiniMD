import { Check, Copy } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { showToast } from "@/components/ui/toast-notification";
import { isCommand, isTyping, useHotkey } from "@/lib/hotkeys";

/** Copies the page as Markdown. The app already holds the Markdown, so the
    button never asks anything of the network. ⌘C does the same. */
export function MarkdownActions({ markdown }: { markdown: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const button = useRef<HTMLButtonElement>(null);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      return true;
    } catch {
      showToast("Couldn't copy markdown", "error");
      return false;
    }
  }, [markdown]);

  const celebrate = useCallback(() => {
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  }, []);

  // Global Ctrl/Cmd+C — copies the whole page markdown UNLESS the reader is
  // copying a real text selection or typing in a field. Native copy of a
  // selection wins; only an "empty" Ctrl+C copies the page.
  useHotkey((event) => {
    if (event.key !== "c" || !isCommand(event) || event.shiftKey) return;
    if (window.getSelection()?.toString().trim()) return;
    if (isTyping(event.target)) return;
    event.preventDefault();

    // If the copy button is on screen, animate it as feedback — the same as a
    // click. Scrolled past the fold there is nothing to animate, so say it in
    // a toast instead.
    const rect = button.current?.getBoundingClientRect();
    const onScreen = !!rect && rect.bottom > 0 && rect.top < window.innerHeight;

    void copy().then((done) => {
      if (!done) return;
      if (onScreen) celebrate();
      else showToast("Markdown copied to clipboard");
    });
  });

  return (
    <button
      ref={button}
      type="button"
      onClick={(() => {
        void copy().then((done) => done && celebrate());
      })}
      className="flex items-center gap-2 rounded-lg border border-input bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground shadow-xs transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 cursor-pointer"
    >
      {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
      {copied ? "Copied" : "Copy as Markdown"}
    </button>
  );
}
