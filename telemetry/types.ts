export interface D1Result {
  run(): Promise<unknown>;
}
export interface D1Database {
  prepare(sql: string): { bind(...values: unknown[]): D1Result };
}

export interface TelemetryEnv {
  DB?: D1Database;
  VISITOR_SALT?: string;
}

export type WaitUntil = { waitUntil(promise: Promise<unknown>): void };

export const canRecord = (env: TelemetryEnv) => Boolean(env.DB && env.VISITOR_SALT);

/** UTC "YYYY-MM-DD HH:MM:SS" — sorts the same as SQLite's own datetime(), so retention's string compare works. */
export const nowStamp = () => new Date().toISOString().replace("T", " ").slice(0, 19);
