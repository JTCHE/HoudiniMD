"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { FileQuestion } from "lucide-react";
import DocLink from "./DocLink";

interface Suggestion {
  path: string;
  title: string;
  score: number | null;
}

// Anything below this was BM25 text-similarity, not "this is almost certainly
// the page you meant" — showing it invites the same fuzzy-guess mistake the
// spec explicitly rules out for redirects.
const HIGH_CONFIDENCE = 0.95;

// Rendered by app/docs/[...slug]/not-found.tsx, inside the normal docs layout
// (header/breadcrumbs/footer stay). Isolated here so that route file stays a
// one-line re-export and the fuzzy-suggestion fetch logic lives in one place.
export default function NotFoundPage() {
  const pathname = usePathname();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  useEffect(() => {
    const q = pathname
      .replace(/^\/docs\//, "")
      .replace(/[/-]/g, " ")
      .trim();
    if (!q) return;
    fetch(`/api/search?q=${encodeURIComponent(q)}&limit=5`)
      .then((res) => res.json())
      .then((data) => setSuggestions((data.results ?? []).filter((r: Suggestion) => r.path !== pathname.replace(/^\/docs\//, "") && (r.score ?? 0) >= HIGH_CONFIDENCE)))
      .catch(() => {});
  }, [pathname]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-page-x py-10">
      {/* Negative margin cancels the box's own padding, so its border bleeds
          past the page gutter while the text inside stays on the same left
          edge as everything else on the page (same trick as .callout). */}
      <div className="-mx-6 flex flex-col items-start gap-6 rounded-xl border border-dashed px-6 py-12">
        <div className="flex size-12 items-center justify-center rounded-xl bg-muted">
          <FileQuestion className="size-6 text-muted-foreground" />
        </div>

        <div className="space-y-1">
          <p className="font-mono text-xs text-muted-foreground">{pathname}</p>
          <h1 className="text-lg font-semibold">This page doesn&apos;t exist on SideFX&apos;s docs</h1>
          {/* <p className="text-sm text-muted-foreground">Try another search, or check the match below.</p> */}
        </div>

        {suggestions.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Did you mean:</p>
            <ul className="space-y-1">
              {suggestions.map((s) => (
                <li key={s.path}>
                  <DocLink
                    href={`/docs/${s.path}`}
                    className="text-sm font-medium"
                  >
                    {s.title}
                  </DocLink>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* <div className="w-full max-w-sm">
          <HomeSearchField />
        </div> */}

        <DocLink
          href="/"
          className="text-xs text-muted-foreground"
        >
          Go home
        </DocLink>
      </div>
    </main>
  );
}
