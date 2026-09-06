// One door to the back end, whichever side of it the page is on.
//
// In the desktop window the page runs inside Tauri, and a command is an
// `invoke`. Inside Houdini's help pane the same page is served over HTTP by
// `server.rs`, where Tauri does not exist and a command is a GET on `/api`.
// Everything else in the front end imports `invoke` from here and never has to
// know which one it got.

import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { listen as tauriListen, type EventCallback, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow, type Window } from "@tauri-apps/api/window";

/// Tauri sets this on the window it makes. Houdini pane has no such thing, so
/// this is what tells the two apart everywhere in the front end.
export const inTauri = "__TAURI_INTERNALS__" in window;

type Args = Record<string, unknown>;

export function invoke<T>(command: string, args?: Args): Promise<T> {
  return inTauri ? tauriInvoke<T>(command, args) : http<T>(command, args);
}

/// The same command, asked for over HTTP. Arrays go as one comma separated
/// value, which is what `parse` in `server.rs` reads back.
async function http<T>(command: string, args?: Args): Promise<T> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(args ?? {})) {
    if (value === undefined || value === null) continue;
    query.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  const url = `/api/${command}${query.size ? `?${query}` : ""}`;
  const answer = await fetch(url);
  if (!answer.ok) throw new Error(await answer.text());
  return (await answer.json()) as T;
}

/// Events the Rust side pushes, such as the index pass reporting its progress.
/// Only the desktop shell has them. Over HTTP nothing is pushed, so this never
/// fires and the caller falls back to what it asked for on mount.
export function listen<T>(event: string, run: EventCallback<T>): Promise<UnlistenFn> {
  return inTauri ? tauriListen<T>(event, run) : Promise.resolve(() => {});
}

/// The window this page sits in, where there is one. Reading it outside Tauri
/// throws, so the caption buttons ask for it through here and draw themselves
/// either way: in Houdini's pane and in the design harness they are decoration.
export function appWindow(): Window | null {
  return inTauri ? getCurrentWindow() : null;
}
