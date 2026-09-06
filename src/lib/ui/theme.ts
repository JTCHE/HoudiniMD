/**
 * Light or dark, and who decides.
 *
 * The reader's choice wins and is kept on the machine. Until they make one,
 * the system decides and keeps deciding — a reader who switches Windows to
 * dark at sunset gets a dark window without touching the app.
 *
 * The root attribute is the whole of the theme: `globals.css` states the dark
 * ramp under `:root[data-theme="dark"]`, so a switch is one attribute write
 * and no re-render.
 */
import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

const KEY = "houdinimd.theme";

function stored(): Theme | null {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function system(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function current(): Theme {
  return stored() ?? system();
}

function paint(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

const listeners = new Set<() => void>();

/** Sets the theme before the first paint, and follows the system while the
    reader has not chosen. Called once, from `main.tsx`. */
export function startTheme() {
  paint(current());
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (stored()) return;
    paint(system());
    for (const notify of listeners) notify();
  });
}

/** The other theme, from now on. */
export function toggleTheme() {
  const next: Theme = current() === "dark" ? "light" : "dark";
  try {
    window.localStorage.setItem(KEY, next);
  } catch {
    // A blocked store loses the choice at the end of the session, not the
    // switch itself.
  }
  paint(next);
  for (const notify of listeners) notify();
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

/** The theme on screen, live. */
export function useTheme(): Theme {
  return useSyncExternalStore(
    subscribe,
    () => (document.documentElement.dataset.theme as Theme) ?? "light",
    () => "light" as Theme,
  );
}
