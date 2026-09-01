export interface SessionState {
  tk: string | null;
  createdAt: number;
  lastPingAt: number;
}

export interface OpResult {
  data: any;
  httpStatus: number;
  format: "text" | "json";
}

/**
 * A `type` rather than an `interface` on purpose: only type aliases satisfy the
 * `Record<string, unknown>` constraint on `GetInstantStore`, which persists this.
 */
export type PingConfigData = {
  pingIntervalMs: number;
  minPingIntervalMs: number;
  sessionTtlSeconds: number;
  refreshAtTtlFraction: number;
};

export const SessionStatus = {
  OK: 200,
  UNAUTHORIZED: 401,
  SESSION_DEAD: 403,
  THROTTLED: 429,
  SERVER_ERROR: 500,
  UPSTREAM_ERROR: 502,
} as const;
