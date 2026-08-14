// Backs /api/hidden — the TUI's only write path into D1. Its own token is
// Account | D1 | Read (see the spec), so hiding a visitor from any machine
// has to go through here instead of a direct D1 write.
//
// Hide by `visitor` (hash(IP) alone), never `client`. Hiding is about an
// address, not a browser: it must remove every row from that address,
// whatever it was running.
import { timingSafeEqual } from "node:crypto";
import { nowStamp, type TelemetryEnv } from "./types";

export interface HiddenRow {
  visitor: string;
  hidden_at: string;
  reason: string;
}

/**
 * Constant-time compare of the `Authorization` header against
 * ANALYTICS_ADMIN_TOKEN. A naive `===` short-circuits on the first mismatched
 * byte, which leaks the secret one character at a time to anyone timing
 * responses — the whole point of gating a write route behind a shared secret
 * is defeated by a comparison that isn't constant-time. The length check
 * ahead of timingSafeEqual (which throws on mismatched lengths) still leaks
 * length, never content, and is the accepted, unavoidable exception.
 */
export function isAuthorized(request: Request, env: TelemetryEnv): boolean {
  const expected = env.ANALYTICS_ADMIN_TOKEN;
  if (!expected) return false; // no secret configured — reject, never accept
  const header = request.headers.get("authorization") ?? "";
  const provided = header.replace(/^Bearer\s+/i, "");
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Visitor hashes are base36 output from visitorHash() (FNV-1a) — never
// anything a caller typed by hand. Reject anything else before it reaches
// SQL, same guard the forged-set literal in the TUI uses for the same reason.
const VISITOR_RE = /^[0-9a-z]+$/;
export const isValidVisitor = (visitor: string): boolean => VISITOR_RE.test(visitor);

/** `POST /api/hidden`. Idempotent — registering the same machine twice (every dashboard hides every dashboard, including itself) is expected, not an error. */
export async function hideVisitor(env: TelemetryEnv, visitor: string): Promise<void> {
  await env.DB!.prepare(`INSERT OR IGNORE INTO hidden (visitor, hidden_at, reason) VALUES (?,?,?)`)
    .bind(visitor, nowStamp(), "")
    .run();
}

/** `DELETE /api/hidden/:visitor` — also the remote half of `Z` (undo). */
export async function unhideVisitor(env: TelemetryEnv, visitor: string): Promise<void> {
  await env.DB!.prepare(`DELETE FROM hidden WHERE visitor = ?`).bind(visitor).run();
}

/** `GET /api/hidden` — the whole table, read fresh by every dashboard on start-up. */
export async function listHidden(env: TelemetryEnv): Promise<HiddenRow[]> {
  const { results } = await env.DB!.prepare(`SELECT visitor, hidden_at, reason FROM hidden`).all<HiddenRow>();
  return results;
}
