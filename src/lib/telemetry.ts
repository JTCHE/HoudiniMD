// Says a part of the app was used, for the anonymous telemetry.
//
// The name is a fixed word written here in the code, never a page, a title or
// anything the reader typed. The Rust side decides whether it goes anywhere:
// it sends nothing unless the reader said yes, and it sends each name once per
// launch. In Houdini's help pane there is no such command, so the call fails
// and nothing happens. See src-tauri/src/telemetry.rs.

import { invoke } from "@/lib/backend";

export function used(name: string) {
  void invoke("report_use", { kind: "feature", name }).catch(() => {});
}

/** The first launch ended. `answers` is what the reader chose. */
export function setupDone(answers: string) {
  void invoke("report_use", { kind: "setup", name: answers }).catch(() => {});
}
