/**
 * What the reader has read, and what they kept.
 *
 * Both lists hold the same thing — a page, by the little the UI needs to draw
 * a row for it — so they are one module and one shape. Recents are written by
 * the reading view on every page it opens; bookmarks are written only when the
 * reader asks.
 *
 * The store is local to the machine and lives in `localStorage`. That is the
 * whole of it for now: the app has no account and no sync, and a list of the
 * last few dozen pages is not worth a table. When it moves behind Rust, only
 * `read` and `write` below change — every caller goes through the functions
 * under them.
 */
import { useSyncExternalStore } from "react";

export interface LibraryEntry {
  /** Help path, as the router and `page` read it: `nodes/sop/attribwrangle`. */
  path: string;
  title: string;
  /** Icon path inside `icons.zip`, e.g. `SOP/attribwrangle.svg`. */
  icon?: string;
  /** Epoch milliseconds — when it was last read, or when it was kept. */
  at: number;
}

/** Past this, the oldest recent falls off. A reader walks a handful of pages;
    a list longer than the panel can ever show is a list nobody reads. */
const RECENTS_KEEP = 50;

const KEYS = {
  recents: "houdinimd.recents",
  bookmarks: "houdinimd.bookmarks",
} as const;

type ListName = keyof typeof KEYS;

function read(list: ListName): LibraryEntry[] {
  try {
    const raw = window.localStorage.getItem(KEYS[list]);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    // A hand-edited or half-written value must not take the panel down with
    // it: anything that is not a list of entries reads as an empty list.
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is LibraryEntry =>
      !!entry && typeof entry.path === "string" && typeof entry.title === "string",
    );
  } catch {
    return [];
  }
}

/* One subscriber set for both lists. A write to either is a change to the
   library, and the two panels that render it are always on screen together. */
const listeners = new Set<() => void>();

function write(list: ListName, entries: LibraryEntry[]) {
  try {
    window.localStorage.setItem(KEYS[list], JSON.stringify(entries));
  } catch {
    // A full or blocked store loses the history, not the session.
  }
  for (const notify of listeners) notify();
}

/** Newest first, the order both panels draw. */
function newestFirst(entries: LibraryEntry[]): LibraryEntry[] {
  return [...entries].sort((a, b) => b.at - a.at);
}

export function recents(): LibraryEntry[] {
  return newestFirst(read("recents")).slice(0, RECENTS_KEEP);
}

export function bookmarks(): LibraryEntry[] {
  return newestFirst(read("bookmarks"));
}

/** Records a page the reader opened. Re-reading a page moves it to the top
    rather than adding a second row for it.

    A page with no name is not recorded at all: a row the reader cannot read
    is worse than a trail one page short. */
export function recordVisit(entry: Omit<LibraryEntry, "at">) {
  if (!entry.title.trim()) return;
  const without = read("recents").filter((existing) => existing.path !== entry.path);
  write("recents", [{ ...entry, at: Date.now() }, ...without].slice(0, RECENTS_KEEP));
}

/** Drops one page from the trail. The trail is the reader's, so they get to
    take a page out of it. */
export function forget(path: string) {
  write("recents", read("recents").filter((entry) => entry.path !== path));
}

export function isBookmarked(path: string): boolean {
  return read("bookmarks").some((entry) => entry.path === path);
}

/** Keeps a page, or lets it go. Returns what the page is after the call. */
export function toggleBookmark(entry: Omit<LibraryEntry, "at">): boolean {
  const kept = read("bookmarks");
  const without = kept.filter((existing) => existing.path !== entry.path);
  if (without.length !== kept.length) {
    write("bookmarks", without);
    return false;
  }
  write("bookmarks", [{ ...entry, at: Date.now() }, ...without]);
  return true;
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  // Another window of the same app writes the same store; `storage` is the
  // only word this one gets about it.
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEYS.recents || event.key === KEYS.bookmarks) notify();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(notify);
    window.removeEventListener("storage", onStorage);
  };
}

/* `useSyncExternalStore` compares snapshots by identity, and both readers
   above build a fresh array every call — which would re-render forever. The
   snapshot is therefore cached and only rebuilt when a write says so. */
let snapshot = { recents: [] as LibraryEntry[], bookmarks: [] as LibraryEntry[] };
let stale = true;
listeners.add(() => {
  stale = true;
});

function currentSnapshot() {
  if (stale) {
    snapshot = { recents: recents(), bookmarks: bookmarks() };
    stale = false;
  }
  return snapshot;
}

/** The library, live. Re-renders the caller when either list changes. */
export function useLibrary() {
  return useSyncExternalStore(subscribe, currentSnapshot, () => snapshot);
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * How long ago, in the width a row has for it: `12m`, `2h`, `yest.`, `12 Mar`.
 *
 * Deliberately not `Intl.RelativeTimeFormat` — that writes "12 minutes ago",
 * which is three times the width the column holds.
 */
export function shortAgo(at: number, now = Date.now()): string {
  const elapsed = Math.max(0, now - at);
  if (elapsed < MINUTE) return "now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h`;
  if (elapsed < 2 * DAY) return "yest.";
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)}d`;
  return new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
