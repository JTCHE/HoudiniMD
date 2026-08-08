"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import DocLink from "@/components/docs/DocLink";
import DocStatusBox from "@/components/docs/DocStatusBox";

// Next.js error boundary for the /docs/[...slug] route. Catches anything an
// uncaught server or client exception throws during render (e.g. a scraper
// failure while generating a page) and shows the same dashed-box shell as
// not-found.tsx instead of the framework's bare "Internal Server Error".
export default function DocsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const pathname = usePathname();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <DocStatusBox
      icon={TriangleAlert}
      path={pathname}
      title="This page failed to generate"
    >
      <p className="text-sm text-muted-foreground">
        Something went wrong turning this into markdown. Try again, or head back home.
      </p>

      <div className="flex gap-4">
        <button
          type="button"
          onClick={() => reset()}
          className="text-xs font-medium underline underline-offset-2"
        >
          Try again
        </button>
        <DocLink
          href="/"
          className="text-xs text-muted-foreground"
        >
          Go home
        </DocLink>
      </div>
    </DocStatusBox>
  );
}
