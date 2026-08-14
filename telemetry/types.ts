export interface D1Result {
  run(): Promise<unknown>;
  // Needed by /api/hidden's GET (telemetry/hidden.ts): the write paths above
  // only ever call run(), but listing the hidden table reads rows back.
  all<T = unknown>(): Promise<{ results: T[] }>;
}
export interface D1PreparedStatement extends D1Result {
  bind(...values: unknown[]): D1Result;
}
export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
}

export interface TelemetryEnv {
  DB?: D1Database;
  VISITOR_SALT?: string;
  // Shared secret guarding /api/hidden — the TUI's own D1 token is
  // Read-scoped, so this is its only write path into D1. A Worker secret,
  // mirrored into houdinimd-analytics' .env.local. See telemetry/hidden.ts.
  ANALYTICS_ADMIN_TOKEN?: string;
}

export type WaitUntil = { waitUntil(promise: Promise<unknown>): void };

export const canRecord = (env: TelemetryEnv) => Boolean(env.DB && env.VISITOR_SALT);

/** UTC "YYYY-MM-DD HH:MM:SS" — sorts the same as SQLite's own datetime(), so retention's string compare works. */
export const nowStamp = () => new Date().toISOString().replace("T", " ").slice(0, 19);
