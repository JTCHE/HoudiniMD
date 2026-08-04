export interface Analytics {
  writeDataPoint(event: { indexes?: string[]; blobs?: string[]; doubles?: number[] }): void;
}

export interface TelemetryEnv {
  ANALYTICS?: Analytics;
  VISITOR_SALT?: string;
}

export const canRecord = (env: TelemetryEnv) => Boolean(env.ANALYTICS && env.VISITOR_SALT);
