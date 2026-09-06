import { useEffect, useRef } from "react";

/** True where a key belongs to the field the reader is typing in. */
export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

/** How to write that key: `Ctrl` on Windows and Linux, `⌘` on macOS. */
export const COMMAND_KEY = navigator.platform.toLowerCase().includes("mac") ? "⌘" : "Ctrl";

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
