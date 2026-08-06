/**
 * Pages this browser actually read, newest first.
 *
 * The landing page shows a returning reader where they were, instead of a
 * curated row they have already seen. Only a page someone stayed on counts: a
 * click that bounces in one second says nothing about what they were doing, so
 * it is dropped rather than pushed to the top of the row.
 *
 * Local only, like `lib/search/clicks.ts`. Nothing here reaches a server, and
 * every read and write is wrapped — private mode and a full quota must never
 * take the page down with them.
 */
import { clearClicks } from "@/lib/search/clicks";
import type { DocChip } from "./types";

const KEY = "houdinimd:recent-visits";
/** Where `components/docs/SearchOverlay.tsx` keeps the last few searches. */
const RECENT_SEARCHES_KEY = "houdinimd:recent-searches";

/** One row of chips is about this many. Older visits fall off the end. */
const MAX_VISITS = 12;
/**
 * Below this, the page was passed through rather than read. Five seconds is
 * long enough to rule out a mis-click and short enough to catch someone who
 * only needed one parameter name.
 */
const MIN_DWELL_MS = 5000;

/**
 * A chip must carry all three fields to render. Storage is the one place a
 * half-written or hand-edited row can enter, so it is checked on the way out.
 */
function isDocChip(value: unknown): value is DocChip {
  const chip = value as DocChip | null;
  return (
    !!chip && typeof chip.path === "string" && typeof chip.title === "string" && typeof chip.icon === "string"
  );
}

function load(): DocChip[] {
  try {
    const rows: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(rows) ? rows.filter(isDocChip) : [];
  } catch {
    // Private mode, quota, or a hand-edited value. The row is decoration; it
    // never becomes the only way to reach a page.
    return [];
  }
}

function save(visits: DocChip[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(visits));
  } catch {
    /* quota or private mode — forget the visit, keep the page */
  }
}

/**
 * Remember `chip` if the reader stayed on it long enough to have read
 * something. Safe to call more than once for the same page: the path is
 * de-duplicated, so a repeat call only moves the page back to the front.
 */
export function recordVisit(chip: DocChip, dwellMs: number): void {
  if (dwellMs < MIN_DWELL_MS || !isDocChip(chip) || !chip.path || !chip.icon) return;

  const visits = load().filter((visit) => visit.path !== chip.path);
  visits.unshift({ path: chip.path, title: chip.title, icon: chip.icon });
  visits.length = Math.min(visits.length, MAX_VISITS);
  save(visits);
}

/** The remembered pages, newest first. Client-only — call it after mount. */
export function readVisits(): DocChip[] {
  return load();
}

/**
 * Forget the reader's history.
 *
 * The landing page offers visits and searches as one thing, so one control
 * clears both. Leaving the search side behind would make "Clear" a lie the
 * next time the search overlay opens.
 */
export function clearVisits(): void {
  try {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(RECENT_SEARCHES_KEY);
  } catch {
    /* nothing to clear */
  }
  clearClicks();
}
