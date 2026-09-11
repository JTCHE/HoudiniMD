// Says a part of the app was used, for the anonymous telemetry.
//
// The name is a fixed word written here in the code, never a page, a title or
// anything the reader typed. The Rust side decides whether it goes anywhere:
// it sends nothing unless the reader said yes, and it sends each name once per
// launch. In Houdini's help pane there is no such command, so the call fails
// and nothing happens. See src-tauri/src/telemetry.rs.

import { useCallback, useRef } from "react";

import { invoke } from "@/lib/backend";

export function used(name: string) {
  void invoke("report_use", { kind: "feature", name }).catch(() => {});
}

/** The first launch ended. `answers` is what the reader chose. */
export function setupDone(answers: string) {
  void invoke("report_use", { kind: "setup", name: answers }).catch(() => {});
}

/**
 * Reports one search when it ends, from either place a reader searches from.
 *
 * `tell(rank)` says the reader opened the row at that position; `tell(-1)`
 * says they opened nothing, which is the case that says the search fell
 * short. Once per query, so walking the list with the arrow keys does not
 * report a search on every press.
 *
 * The words are not part of it and never reach the log. See
 * `src-tauri/src/telemetry.rs`.
 */
export function useSearchReport(query: string, hits: number) {
  const told = useRef("");
  // Read through a ref, so `tell` stays the same function across renders and
  // an effect that holds it does not re-run on every keystroke.
  const now = useRef({ query, hits });
  now.current = { query, hits };
  const pending = useRef<ReturnType<typeof setTimeout>>(undefined);
  return useCallback((rank: number) => {
    const asked = now.current.query.trim();
    if (!asked || told.current === asked) return;
    const send = () => {
      told.current = asked;
      void invoke("report_search", { hits: now.current.hits, rank }).catch(() => {});
    };
    clearTimeout(pending.current);
    // Opening a row closes the list, and the close can come first. So "opened
    // nothing" waits a moment, and a real rank in that moment wins.
    if (rank < 0) pending.current = setTimeout(send, 400);
    else send();
  }, []);
}
