import type { PingConfigData } from "./types.ts";

export const OPERATIONS = {
  createSession: "createSession",
  refreshSession: "refreshSession",
  ping: "ping",
  pingConfig: "pingConfig",
} as const;

export const DEFAULT_PING_CONFIG: PingConfigData = {
  pingIntervalMs: 25000,
  minPingIntervalMs: 15000,
  sessionTtlSeconds: 300,
  refreshAtTtlFraction: 0.8,
};

export const PING_JITTER_MS = 2000;
export const BACKOFF_BASE_MS = 5000;
export const BACKOFF_MAX_MS = 60000;

let current: PingConfigData = { ...DEFAULT_PING_CONFIG };

export function getPingConfig(): PingConfigData {
  return current;
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function applyPingConfig(data: unknown): void {
  if (typeof data !== "object" || data === null) return;

  const incoming = data as Record<string, unknown>;
  const next: PingConfigData = { ...current };

  if (isPositiveFinite(incoming.pingIntervalMs)) {
    next.pingIntervalMs = incoming.pingIntervalMs;
  }
  if (isPositiveFinite(incoming.minPingIntervalMs)) {
    next.minPingIntervalMs = incoming.minPingIntervalMs;
  }
  if (isPositiveFinite(incoming.sessionTtlSeconds)) {
    next.sessionTtlSeconds = incoming.sessionTtlSeconds;
  }
  if (isPositiveFinite(incoming.refreshAtTtlFraction) && incoming.refreshAtTtlFraction <= 1) {
    next.refreshAtTtlFraction = incoming.refreshAtTtlFraction;
  }

  current = next;
}

export function pingDelayMs(): number {
  const c = current;
  return Math.max(c.pingIntervalMs, c.minPingIntervalMs) + Math.random() * PING_JITTER_MS;
}

export function refreshDelayMs(): number {
  const c = current;
  return c.sessionTtlSeconds * 1000 * c.refreshAtTtlFraction;
}
