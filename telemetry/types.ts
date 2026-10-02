export interface TelemetryEnv {
  SITE_EVENTS?: { writeDataPoint(point: { indexes: string[]; blobs: string[]; doubles: number[] }): void };
  VISITOR_SALT?: string;
}

export type WaitUntil = { waitUntil(promise: Promise<unknown>): void };

export const canRecord = (env: TelemetryEnv) => Boolean(env.SITE_EVENTS && env.VISITOR_SALT);
