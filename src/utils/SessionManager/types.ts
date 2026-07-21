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

export interface PingConfigData {
  pingIntervalMs: number;
  minPingIntervalMs: number;
  sessionTtlSeconds: number;
  refreshAtTtlFraction: number;
}

export const SessionStatus = {
  OK: 200,
  UNAUTHORIZED: 401,
  SESSION_DEAD: 403,
  THROTTLED: 429,
  SERVER_ERROR: 500,
  UPSTREAM_ERROR: 502,
} as const;
