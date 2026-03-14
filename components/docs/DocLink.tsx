"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

function slugToTitle(href: string): string {
  const slug = href.replace(/^\/docs\//, "");
  const parts = slug.split("/").filter(Boolean);
  const segment =
    parts[parts.length - 1] === "index"
      ? (parts[parts.length - 2] ?? parts[0] ?? slug)
      : (parts[parts.length - 1] ?? slug);
  const words = segment
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[-_\s]+/)
    .filter(Boolean);
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

// Module-level set — don't re-trigger generation for same slug in this session
const generatedSlugs = new Set<string>();

export default function DocLink({
  href,
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const [fetchedTitle, setFetchedTitle] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const isInternal = !!href?.startsWith("/docs/");

  function show() {
    if (!isInternal) return;
    setVisible(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const slug = href!.replace(/^\/docs\//, "");

      // Try meta (works for any cached content, even pre-invalidation)
      const metaRes = await fetch(`/api/meta?slug=${encodeURIComponent(slug)}`);
      if (metaRes.ok) {
        const data = await metaRes.json();
        if (data.title) setFetchedTitle(data.title);
        setSummary(data.summary ?? "");
        return;
      }

      // Not in cache — trigger background generation (once per slug per session)
      if (generatedSlugs.has(slug)) return;
      generatedSlugs.add(slug);
      const sse = new EventSource(`/api/generate?slug=${encodeURIComponent(slug)}`);
      sse.onmessage = (e) => {
        const event = JSON.parse(e.data);
        if (event.stage === "complete") {
          sse.close();
          // Re-fetch meta now that content is generated
          fetch(`/api/meta?slug=${encodeURIComponent(slug)}`)
            .then((r) => r.json())
            .then((d) => {
              if (d.title) setFetchedTitle(d.title);
              setSummary(d.summary ?? "");
            })
            .catch(() => {});
        } else if (event.stage === "error") {
          sse.close();
        }
      };
      sse.onerror = () => sse.close();
    }, 75);
  }

  function hide() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setVisible(false);
  }

  const displayTitle = fetchedTitle ?? slugToTitle(href ?? "");

  return (
    <span className="relative inline-block">
      {/* prefetch={true} tells Next.js to fetch the full RSC payload (not just the loading
          skeleton) when this link enters the viewport. Cached under staleTimes.static (5 min),
          so clicking after it's been visible for even ~30ms is instant with no skeleton. */}
      <Link
        href={href!}
        {...props}
        prefetch={isInternal ? true : undefined}
        onMouseDown={(e) => {
          // Navigate on mousedown (saves the ~100ms between mousedown and click).
          // Only plain left click — let browser handle Ctrl/Meta/Shift (new tab etc.)
          if (!isInternal || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
          router.push(href!);
        }}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </Link>
      {visible && isInternal && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-50 w-max max-w-[16rem] bg-background border border-border shadow-lg p-2 text-xs pointer-events-none whitespace-normal">
          <span className="block font-semibold text-foreground">{displayTitle}</span>
          {summary && (
            <span className="block text-muted-foreground mt-0.5 line-clamp-2">{summary}</span>
          )}
        </span>
      )}
    </span>
  );
}
