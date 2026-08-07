"use client";

import { useEffect } from "react";
import { recordVisit } from "@/lib/landing/recent-visits";
import { logView } from "@/lib/view-log";
import type { DocChip } from "@/lib/landing/types";

/**
 * Reports how long this page was read, so the landing page can offer it back,
 * and reports the view itself to analytics — a page opened from the router
 * cache never reaches the server, so nothing else can (see lib/view-log.ts).
 *
 * A phone reader usually leaves by switching app or locking the screen, not by
 * navigating, and neither of those unmounts anything — so the clock is also
 * read on `visibilitychange` and `pagehide`. `recordVisit` de-duplicates by
 * path, so reporting more than once for one page is harmless, and an early
 * report (at the first hide) never blocks a later, longer one.
 *
 * The chip is taken apart into its fields, so a re-render of the docs page
 * that rebuilds the object cannot restart the clock.
 *
 * Renders nothing.
 */
export function VisitRecorder({ chip }: { chip: DocChip }) {
  const { path, title, icon } = chip;

  useEffect(() => {
    const openedAt = Date.now();
    // A chip carries the index path; the address bar carries `/docs/` in front.
    logView(`/docs/${path}`);

    function report() {
      recordVisit({ path, title, icon }, Date.now() - openedAt);
    }

    function reportWhenHidden() {
      if (document.visibilityState === "hidden") report();
    }

    document.addEventListener("visibilitychange", reportWhenHidden);
    window.addEventListener("pagehide", report);

    return () => {
      document.removeEventListener("visibilitychange", reportWhenHidden);
      window.removeEventListener("pagehide", report);
      report();
    };
  }, [path, title, icon]);

  return null;
}
