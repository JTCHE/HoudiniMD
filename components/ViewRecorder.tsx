"use client";

import { useEffect } from "react";
import { logView } from "@/lib/view-log";

/**
 * Reports this page as read. A page opened out of Next's router cache reaches
 * no server, so the worker cannot see it — see lib/view-log.ts.
 *
 * Every tracked page needs one, not only the doc pages. view-log remembers the
 * page it reported last so the next view can say where the reader came from,
 * and a tracked page that never reports leaves that memory on a page the reader
 * has already left: the landing page went unrecorded, and the doc opened from
 * it was then filed under a link nobody clicked.
 *
 * Renders nothing.
 */
export function ViewRecorder({ path }: { path: string }) {
  useEffect(() => {
    logView(path);
  }, [path]);

  return null;
}
