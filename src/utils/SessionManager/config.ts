import { GetInstantStore } from "../../modules/Store.ts";
import { jitter } from "../jitter.ts";
import type { PingConfigData } from "./types.ts";

export const OPERATIONS = {
  createSession: "createSession",
  refreshSession: "refreshSession",
  ping: "ping",
  pingConfig: "pingConfig",
} as const;

/**
 * Mirrors what the API currently serves.
 *
 * This must stay the *conservative* value. It is what the client falls back to
 * when the config cannot be fetched — which is exactly when the server is
 * struggling — so a fast default would mean every client that boots during an
 * incident starts hammering. The server may only ever slow clients down from
 * here, never speed them up.
 */
export const DEFAULT_PING_CONFIG: PingConfigData = {
  pingIntervalMs: 300000,
  minPingIntervalMs: 240000,
  sessionTtlSeconds: 3600,
  refreshAtTtlFraction: 0.8,
};

/**
 * Jitter ratios. These are mean-preserving, so the average request rate is
 * unchanged — they exist purely to stop the fleet from firing in unison. Any
 * global event (a restart, an outage) phase-locks every client, and without
 * meaningful spread they stay locked forever, arriving as one spike and looking
 * like coordinated bot traffic to the edge.
 */
const PING_JITTER_RATIO = 0.2;
const REFRESH_JITTER_RATIO = 0.1;

export const BACKOFF_BASE_MS = 5000;
export const BACKOFF_MAX_MS = 60000;

/** Window that a fleet-wide session-death wave is smeared across. */
export const RECOVER_SPREAD_MS = 45000;

/** Ceiling for the escalating ping-failure backoff. */
export const PING_FAILURE_MAX_MS = 1800000;

/**
 * Refresh-failure backoff. Bounded well under the TTL slack (the refresh fires
 * at 80% of a 1 hour TTL, leaving ~12 minutes), so 1-2-4-8 minutes covers a
 * recovery; past that the session simply dies and `recover()` takes over.
 */
export const REFRESH_FAILURE_BASE_MS = 60000;
export const REFRESH_FAILURE_MAX_MS = 900000;

/**
 * Last-known-good config, persisted. Without this a client that boots while the
 * config request is being blocked would silently run on the compiled default
 * for its entire session.
 */
const store = GetInstantStore<PingConfigData>(
  "SpicyLyrics_PingConfig_g1",
  1,
  DEFAULT_PING_CONFIG
);
const current = store.Items;

export function getPingConfig(): PingConfigData {
  return current;
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Merge a server-supplied config. Mutates the stored object in place — the
 * store persists the very object it handed out, so reassigning would silently
 * stop saving.
 */
export function applyPingConfig(data: unknown): void {
  if (typeof data !== "object" || data === null) return;

  const incoming = data as Record<string, unknown>;
  let changed = false;

  if (isPositiveFinite(incoming.pingIntervalMs) && incoming.pingIntervalMs !== current.pingIntervalMs) {
    current.pingIntervalMs = incoming.pingIntervalMs;
    changed = true;
  }
  if (
    isPositiveFinite(incoming.minPingIntervalMs) &&
    incoming.minPingIntervalMs !== current.minPingIntervalMs
  ) {
    current.minPingIntervalMs = incoming.minPingIntervalMs;
    changed = true;
  }
  if (
    isPositiveFinite(incoming.sessionTtlSeconds) &&
    incoming.sessionTtlSeconds !== current.sessionTtlSeconds
  ) {
    current.sessionTtlSeconds = incoming.sessionTtlSeconds;
    changed = true;
  }
  if (
    isPositiveFinite(incoming.refreshAtTtlFraction) &&
    incoming.refreshAtTtlFraction <= 1 &&
    incoming.refreshAtTtlFraction !== current.refreshAtTtlFraction
  ) {
    current.refreshAtTtlFraction = incoming.refreshAtTtlFraction;
    changed = true;
  }

  if (changed) store.SaveChanges();
}

/** The healthy ping interval. `minPingIntervalMs` is a floor, not a target. */
export function basePingDelayMs(): number {
  return Math.max(current.pingIntervalMs, current.minPingIntervalMs);
}

export function pingDelayMs(): number {
  return jitter(basePingDelayMs(), PING_JITTER_RATIO);
}

export function refreshDelayMs(): number {
  const base = current.sessionTtlSeconds * 1000 * current.refreshAtTtlFraction;
  return jitter(base, REFRESH_JITTER_RATIO);
}
