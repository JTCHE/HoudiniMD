import type { D1Database } from "./types";

/** Matches Analytics Engine's old retention and the promise on /privacy. */
export const RETENTION_DAYS = 90;

/** `ts` is UTC "YYYY-MM-DD HH:MM:SS", which sorts the same as SQLite's own datetime(). */
export async function pruneAnalytics(db: D1Database): Promise<void> {
  const cutoff = `datetime('now', '-${RETENTION_DAYS} days')`;
  await db.prepare(`DELETE FROM views WHERE ts < ${cutoff}`).bind().run();
  await db.prepare(`DELETE FROM searches WHERE ts < ${cutoff}`).bind().run();
}
