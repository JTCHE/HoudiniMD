"use client";

import { Check, ChevronDown, Copy, LucideArrowUpRightFromSquare } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { showToast } from "@/components/ui/toast-notification";

interface MarkdownActionsProps {
  slug: string;
  /** Page name, used to give the AI prompt a subject. */
  title: string;
}

function ClaudeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`${className}`}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" />
    </svg>
  );
}

function ChatGPTIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`${className}`}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
    </svg>
  );
}

export function MarkdownActions({ slug, title }: MarkdownActionsProps) {
  const mdHref = `/docs/${slug}.md`;
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pressed, setPressed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const copyButtonRef = useRef<HTMLButtonElement>(null);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pressedTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [menuLeft, setMenuLeft] = useState<number | null>(null);

  function celebrateCopy() {
    setPressed(true);
    clearTimeout(pressedTimeoutRef.current);
    pressedTimeoutRef.current = setTimeout(() => setPressed(false), 150);

    setCopied(true);
    clearTimeout(copiedTimeoutRef.current);
    copiedTimeoutRef.current = setTimeout(() => setCopied(false), 1800);
  }

  useEffect(() => {
    return () => {
      clearTimeout(copiedTimeoutRef.current);
      clearTimeout(pressedTimeoutRef.current);
    };
  }, []);

  const copyMarkdown = useCallback(async () => {
    try {
      const res = await fetch(mdHref);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      showToast("Couldn't copy markdown", "error");
      return false;
    }
  }, [mdHref]);

  const handleCopyClick = useCallback(async () => {
    if (await copyMarkdown()) celebrateCopy();
  }, [copyMarkdown]);

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

      // If the copy button is on screen, animate it as feedback — same as a
      // click. If it's scrolled past the fold, there's nothing to animate,
      // so fall back to a toast.
      const rect = copyButtonRef.current?.getBoundingClientRect();
      const buttonVisible = !!rect && rect.bottom > 0 && rect.top < window.innerHeight;

      void copyMarkdown().then((success) => {
        if (!success) return;
        if (buttonVisible) celebrateCopy();
        else showToast("Markdown copied to clipboard");
      });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [copyMarkdown]);

  // The menu is right-aligned to the button by default, but that overflows
  // off-screen when the button sits close to the left edge on mobile. Clamp
  // it inside the viewport, nudging it right of the button if needed.
  useLayoutEffect(() => {
    if (!open) {
      setMenuLeft(null);
      return;
    }
    const menu = menuRef.current;
    const container = containerRef.current;
    if (!menu || !container) return;
    const margin = 8;
    const containerRect = container.getBoundingClientRect();
    const naturalLeft = containerRect.right - menu.offsetWidth;
    const clampedLeft = Math.min(naturalLeft, window.innerWidth - menu.offsetWidth - margin);
    setMenuLeft(Math.max(clampedLeft, margin) - containerRect.left);
  }, [open]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function buildPrompt() {
    const pageUrl = `${window.location.origin}${mdHref}`;
    // Friendly and structured, so the target reads as a normal user request
    // rather than an instruction buried in fetched content — and short enough
    // that the user can freely extend it with their actual question.
    return `Please read the Houdini docs page for "${title}" at ${pageUrl}.\n\nConcisely tell me about it using Simplified Technical English (ASD-STE100).`;
  }

  function askAbout(assistantUrl: (prompt: string) => string) {
    window.open(assistantUrl(buildPrompt()), "_blank", "noopener,noreferrer");
    setOpen(false);
  }

  const menuItems = [
    {
      key: "markdown",
      icon: <LucideArrowUpRightFromSquare className="size-3.5 shrink-0 text-muted-foreground" />,
      label: "View as Markdown",
      onSelect: () => {
        window.open(mdHref, "_blank", "noopener,noreferrer");
        setOpen(false);
      },
    },
    {
      key: "claude",
      icon: <ClaudeIcon className="size-3.5 shrink-0 text-muted-foreground" />,
      label: "Ask Claude",
      onSelect: () => askAbout((prompt) => `https://claude.ai/new?q=${encodeURIComponent(prompt)}`),
    },
    {
      key: "chatgpt",
      icon: <ChatGPTIcon className="size-3.5 shrink-0 text-muted-foreground" />,
      label: "Ask ChatGPT",
      onSelect: () => askAbout((prompt) => `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`),
    },
  ];

  return (
    <div
      ref={containerRef}
      className="relative print:hidden inline-flex"
    >
      <div className={`inline-flex transition-[scale] duration-150 ease-out ${pressed ? "scale-[0.96]" : "scale-100"}`}>
        <button
          ref={copyButtonRef}
          type="button"
          onClick={handleCopyClick}
          title="Copy as Markdown (⌘C / Ctrl+C)"
          className="inline-flex items-center gap-1.5 h-8 pl-3 pr-2.5 text-xs font-medium text-foreground bg-background border border-border rounded-l-lg shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40 cursor-pointer"
        >
          <span className="relative size-3.5 shrink-0">
            <Copy
              className={`absolute inset-0 size-3.5 text-muted-foreground transition-[opacity,filter,scale] duration-200 ease-[cubic-bezier(0.2,0,0,1)] ${
                copied ? "opacity-0 scale-[0.25] blur-sm" : "opacity-100 scale-100 blur-none"
              }`}
            />
            <Check
              className={`absolute inset-0 size-3.5 text-foreground transition-[opacity,filter,scale] duration-200 ease-[cubic-bezier(0.2,0,0,1)] ${
                copied ? "opacity-100 scale-100 blur-none" : "opacity-0 scale-[0.25] blur-sm"
              }`}
            />
          </span>
          Copy as Markdown
        </button>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          title="More ways to read this page"
          className="inline-flex items-center justify-center h-8 w-6 text-foreground bg-background border border-l-0 border-border rounded-r-lg shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40 cursor-pointer"
        >
          <ChevronDown className={`size-3.5 text-muted-foreground ${open ? "rotate-180" : "rotate-0"}`} />
        </button>
      </div>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          style={menuLeft !== null ? { left: menuLeft } : { right: 0, visibility: "hidden" }}
          className="absolute top-[calc(100%+4px)] z-50 w-56 origin-top-right rounded-lg border border-border bg-popover text-popover-foreground shadow-lg p-xs animate-[dropdown-in_120ms_cubic-bezier(0.2,0,0,1)]"
        >
          {menuItems.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              onClick={item.onSelect}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-xs font-medium text-left transition-colors hover:bg-accent hover:text-accent-foreground outline-none focus-visible:bg-accent cursor-pointer rounded-sm"
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
