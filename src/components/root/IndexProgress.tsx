import { useEffect, useState } from "react";
import { invoke, listen } from "../../lib/backend";
import { forgetTitles } from "@/lib/search";

interface Status {
  build: string;
  pages: number;
  total: number;
  done: boolean;
}

/**
 * What the background pass has read so far.
 *
 * It says nothing once the pass is done, because a finished index is not news.
 * Reading a page never waits on it: Rust parses the opened page on demand.
 * See spec: Local — SQLite FTS5 Index.
 */
export function IndexProgress() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    // The pass can finish before this mounts, so the state is read as well as
    // listened for.
    invoke<Status>("index_status").then(setStatus).catch(() => {});
    const stop = listen<Status>("index", (event) => {
      setStatus(event.payload);
      // The list the search field holds was taken before these pages existed.
      if (event.payload.done) forgetTitles();
    });
    return () => {
      stop.then((off) => off());
    };
  }, []);

  if (!status || status.done) return null;

  return (
    <p className="text-meta text-muted-foreground" role="status">
      Reading the docs — {status.pages.toLocaleString()}
      {status.total > 0 && ` of ${status.total.toLocaleString()}`} pages
    </p>
  );
}
