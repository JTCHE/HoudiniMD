"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { FileQuestion } from "lucide-react";
import DocLink from "./DocLink";
import DocStatusBox from "./DocStatusBox";

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
    <DocStatusBox
      icon={FileQuestion}
      path={pathname}
      title="This page doesn't exist on SideFX's docs"
    >
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

      <DocLink
        href="/"
        className="text-xs text-muted-foreground"
      >
        Go home
      </DocLink>
    </DocStatusBox>
  );
}
