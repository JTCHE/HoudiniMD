/**
 * Click learning, local to one browser.
 *
 * When someone searches "copy points" and opens Copy to Points, that is the
 * strongest possible signal about what they meant — stronger than any text
 * score, because it is the answer rather than a guess at it. Remembering it
 * makes the same search better next time.
 *
 * Deliberately `localStorage` and nothing else. No beacon, no endpoint, no
 * aggregation: the data never leaves the machine that produced it, so there is
 * no privacy question to answer, no schema to migrate, and no way for one
 * user's clicks to degrade anybody else's results. Global aggregation is a
 * different feature with different problems (position bias, poisoning) and
 * should be built as one if it is ever wanted.
 *
 * Client-only. `/api/search` must not use this — a server has no user to learn
 * from, and results would stop being reproducible.
 */

const KEY = "houdinimd:clicks";
/** Cap on remembered (query, page) pairs. Oldest use is dropped first. */
const MAX_ROWS = 200;

interface ClickRow {
  /** Normalised query as typed. */
  q: string;
  path: string;
  /** Times this pair was chosen. */
  n: number;
  /** Last use, for eviction. */
  at: number;
}

function normalise(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, " ");
}

function load(): ClickRow[] {
  try {
    const rows = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(rows) ? rows : [];
  } catch {
    // Private mode, quota, or a hand-edited value. Learning is an enhancement;
    // losing it must never break search.
    return [];
  }
}

function save(rows: ClickRow[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(rows));
  } catch {
    /* quota or private mode — drop the lesson, keep the search */
  }
}

/** Record that `path` was opened from `query`. Call on navigation, not hover. */
export function recordClick(query: string, path: string): void {
  const q = normalise(query);
  if (!q || !path) return;

  const rows = load();
  const existing = rows.find((r) => r.q === q && r.path === path);
  if (existing) {
    existing.n++;
    existing.at = Date.now();
  } else {
    rows.push({ q, path, n: 1, at: Date.now() });
  }

  // Evict least recently used, so a long-lived browser cannot grow this without
  // bound and a query someone has stopped making eventually stops steering.
  if (rows.length > MAX_ROWS) {
    rows.sort((a, b) => b.at - a.at).length = MAX_ROWS;
  }
  save(rows);
}

/**
 * How much a page has been chosen for this query, or for a query this one is
 * growing into. Typing "cop" benefits from a click made at "copy points",
 * which is what makes the effect feel immediate while still typing.
 */
function learnedScore(rows: ClickRow[], q: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of rows) {
    if (!row.q.startsWith(q) && !q.startsWith(row.q)) continue;
    // An exact match is worth more than a prefix relationship.
    const affinity = row.q === q ? 1 : 0.6;
    out.set(row.path, (out.get(row.path) ?? 0) + row.n * affinity);
  }
  return out;
}

/**
 * Reorder ranked results by what this browser has learned.
 *
 * Learned pages move to the front, strongest first; everything else keeps the
 * order the ranker gave it. A softer nudge was tried first — multiply each
 * result's position by a capped factor — and it could not move a result more
 * than one place, which is indistinguishable from doing nothing.
 *
 * The guard against a stray click pinning a wrong page is that only pages the
 * ranker ALREADY returned can be promoted. Pass more results than you intend to
 * show, or there is nothing below the cut left to rescue.
 */
export function applyClickBoost<T extends { path: string; score: number | null }>(
  query: string,
  results: T[],
): T[] {
  const q = normalise(query);
  if (!q || results.length < 2) return results;

  const learned = learnedScore(load(), q);
  if (learned.size === 0) return results;

  const promoted = results.filter((r) => learned.has(r.path));
  if (!promoted.length) return results;

  promoted.sort((a, b) => learned.get(b.path)! - learned.get(a.path)!);
  return [...promoted, ...results.filter((r) => !learned.has(r.path))];
}

/** Forget everything learned. Exposed so a "clear history" control has something to call. */
export function clearClicks(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
