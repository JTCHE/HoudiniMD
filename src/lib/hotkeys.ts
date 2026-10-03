import { useEffect, useRef } from "react";

/** True where a key belongs to the field the reader is typing in. */
export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

/** True on macOS, where the keys and the window frame follow Apple's rules. */
export const IS_MAC = navigator.platform.toLowerCase().includes("mac");

/** How to write that key: `Ctrl` on Windows and Linux, `⌘` on macOS. */
export const COMMAND_KEY = IS_MAC ? "⌘" : "Ctrl";

/** How to write Alt: `⌥` on macOS. */
export const ALT_KEY = IS_MAC ? "⌥" : "Alt";

/** Back and forward. Windows' webview goes back on Alt+← by itself; macOS's
    has no key for it, so the app takes Safari's. */
export const BACK_KEYS = IS_MAC ? "⌘+[" : "Alt+←";
export const FORWARD_KEYS = IS_MAC ? "⌘+]" : "Alt+→";

/** -1 for back, 1 for forward, 0 for any other key. macOS only: elsewhere the
    webview does it. `code`, so a keyboard that types `[` with Alt still works. */
export function historyStep(event: KeyboardEvent): number {
  if (!IS_MAC || !event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return 0;
  if (event.code === "BracketLeft") return -1;
  if (event.code === "BracketRight") return 1;
  return 0;
}

/** Ctrl on Windows and Linux, Command on macOS. One of the two, never both. */
export function isCommand(event: KeyboardEvent): boolean {
  return (event.ctrlKey || event.metaKey) && !event.altKey;
}

/**
 * A window-level key handler for the life of the component.
 *
 * The handler is read from a ref, so a shortcut can close over state it needs
 * without the listener being taken off and put back on every render.
 */
export function useHotkey(run: (event: KeyboardEvent) => void) {
  const latest = useRef(run);
  latest.current = run;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => latest.current(event);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
