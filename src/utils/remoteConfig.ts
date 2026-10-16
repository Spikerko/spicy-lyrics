import { GetInstantStore } from "../modules/Store.ts";
import Logger from "./Logger.ts";
import { EdgeLookup } from "./API/EdgeService.ts";

/**
 * ─── Remote config ────────────────────────────────────────────────────────────
 *
 * Request cadence, timeouts, backoff and cache tuning, served from the edge so
 * they can be changed without shipping a build.
 *
 * The edge endpoint is cheap to hit, so it is fetched eagerly: at boot, every `remoteConfig.intervalMs`, and whenever the
 * window regains focus or the network comes back. It deliberately bypasses
 * `Query()` and its circuit breaker — a push meant to calm the fleet down during
 * an incident must still arrive while the breaker is holding the API back.
 *
 * Served values are trusted as-is — there are no policy bounds. Only a key the
 * client can't run on (missing, wrong type, negative) falls back to its compiled
 * default, one key at a time, while the rest of the payload still applies; see
 * `sanitizeRemoteConfig` for the few technical guards. The last payload received is
 * persisted and loaded synchronously at import, so modules that read config
 * while they initialise see it too, and a client that boots while the edge is
 * unreachable keeps what it last knew rather than the compiled defaults.
 *
 * Read through `getRemoteConfig()` at the point of use rather than caching a
 * value in a module-level constant, or updates won't reach it.
 */

const logger = new Logger("Remote Config");

/** Compiled defaults. Also the shape: only keys listed here are ever read. */
export const DEFAULT_REMOTE_CONFIG = {
  query: {
    requestTimeoutMs: 15000,
  },
  breaker: {
    tripStatuses: [403, 408, 425, 429, 500, 502, 503, 504],
    failureThreshold: 2,
    ladderMs: [
      30000, 30000, 30000, 60000, 120000, 120000, 120000, 120000, 120000, 120000, 120000, 120000,
      300000,
    ],
    ladderJitterRatio: 0.5,
    openUntilSanityMs: 2700000,
    ladderDecayMs: 3600000,
    probeMinIntervalMs: 30000,
    probeStaleAfterMs: 60000,
  },
  lyricsQueue: {
    baseDelayMs: 2000,
    maxDelayMs: 10000,
    backoffFactor: 1.5,
  },
  lyricsFetch: {
    rapidSwitchWindowMs: 1000,
    rapidSwitchBackoffMs: 400,
    loaderRevealDelayMs: 2000,
    safetyNetRefetchDelayMs: 1000,
  },
  cache: {
    lyricsTtlDays: 3,
    artistVisualsTtlDays: 3,
    audioAnalysisTtlMonths: 1,
    audioAnalysisNotFoundTtlHours: 24,
    canvasMediaCacheSize: 4,
  },
  canvas: {
    loadTimeoutMs: 20000,
    // Pauses before each retry of a failed canvas download; empty disables retries.
    retryDelaysMs: [3000, 10000, 30000],
  },
  updates: {
    checkIntervalMs: 120000,
    checkJitterRatio: 0.2,
    firstCheckDelayMs: 1000,
    latestVersionTimeoutMs: 15000,
  },
  session: {
    pingJitterRatio: 0.2,
    refreshJitterRatio: 0.1,
    backoffBaseMs: 5000,
    backoffMaxMs: 60000,
    createJitterRatio: 0.3,
    recreateJitterRatio: 0.3,
    recoverSpreadMs: 45000,
    pingFailureMaxMs: 1800000,
    pingFailureJitterRatio: 0.2,
    refreshFailureBaseMs: 60000,
    refreshFailureMaxMs: 900000,
    refreshFailureJitterRatio: 0.2,
  },
  token: {
    expiryMarginMs: 60000,
    renewCooldownMs: 10000,
    renewTimeoutMs: 10000,
    // Bounds each single source: the provider load and the Cosmos oauth lookup.
    sourceTimeoutMs: 4000,
    // Bounds the whole lookup, so keep it above 2 × sourceTimeoutMs +
    // renewTimeoutMs, or a slow chain never reaches the last-resort token.
    resolveTimeoutMs: 20000,
  },
  audioAnalysis: {
    timeoutMs: 15000,
  },
  experimentsSync: {
    timeoutMs: 5000,
    intervalMs: 60000,
  },
  remoteConfig: {
    timeoutMs: 5000,
    intervalMs: 15000,
  },
};

export type RemoteConfig = typeof DEFAULT_REMOTE_CONFIG;

/**
 * The served values are trusted: there are no policy bounds, so the server can
 * set anything it likes. A key is only rejected (and its default used) when the
 * client couldn't run on it at all:
 *
 * - it isn't a finite, non-negative number, or a list of them — a negative
 *   delay or timeout makes `AbortSignal.timeout` throw, and nothing in this
 *   config means anything below zero;
 * - `breaker.ladderMs` is empty — there would be no pause to apply.
 *
 * Two technical guards apply on top of that:
 *
 * - Every number is capped at `MAX_TIMER_MS`. `setTimeout` stores its delay as
 *   a signed 32-bit int and fires *immediately* past that, which would turn a
 *   very long interval into a request loop — the opposite of what was asked.
 * - `remoteConfig.timeoutMs` and `remoteConfig.intervalMs` have a floor of
 *   `MIN_SELF_MS`. This group governs the fetch that delivers every fix, and it
 *   is persisted: a zero timeout would abort every config fetch from then on,
 *   including the one that would correct it, on every restart.
 * - The other self-rescheduling loops (`POLL_INTERVALS`) get the same floor, since
 *   an interval of 0 turns them into a request loop.
 */
const MAX_TIMER_MS = 2_147_483_647;
const MIN_SELF_MS = 1000;
const POLL_INTERVALS = [
  ["experimentsSync", "intervalMs"],
  ["updates", "checkIntervalMs"],
] as const satisfies readonly (readonly [keyof RemoteConfig, string])[];
const NON_EMPTY_LISTS = new Set(["breaker.ladderMs"]);

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function sanitizeNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  return Math.min(value, MAX_TIMER_MS);
}

function sanitizeList(value: unknown, nonEmpty: boolean): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  if (nonEmpty && value.length === 0) return undefined;
  const out: number[] = [];
  for (const entry of value) {
    const n = sanitizeNumber(entry);
    // One bad element and the list isn't what the server meant; use ours.
    if (n === undefined) return undefined;
    out.push(n);
  }
  return out;
}

const show = (value: unknown): string => JSON.stringify(value) ?? String(value);

/**
 * Build a complete config from a payload. Never throws; a key the client can't
 * run on falls back to the compiled default for that key alone.
 *
 * Pass `issues` to collect a line for everything that wasn't taken as served —
 * unknown, missing, invalid or capped keys — so a bad push is visible.
 */
export function sanitizeRemoteConfig(data: unknown, issues?: string[]): RemoteConfig {
  const source = isPlainObject(data) ? data : {};
  const result = {} as Record<string, Record<string, unknown>>;

  for (const group of Object.keys(source)) {
    if (!Object.hasOwn(DEFAULT_REMOTE_CONFIG, group)) issues?.push(`${group}: unknown group, ignored`);
  }

  for (const group of Object.keys(DEFAULT_REMOTE_CONFIG) as (keyof RemoteConfig)[]) {
    const defaults = DEFAULT_REMOTE_CONFIG[group] as Record<string, unknown>;
    const incoming = isPlainObject(source[group]) ? source[group] : {};
    const out: Record<string, unknown> = {};

    if (!isPlainObject(source[group])) issues?.push(`${group}: group missing, using defaults`);
    for (const key of Object.keys(incoming)) {
      if (!Object.hasOwn(defaults, key)) issues?.push(`${group}.${key}: unknown key, ignored`);
    }

    for (const key of Object.keys(defaults)) {
      const fallback = defaults[key];
      const raw = incoming[key];
      const value = Array.isArray(fallback)
        ? sanitizeList(raw, NON_EMPTY_LISTS.has(`${group}.${key}`))
        : sanitizeNumber(raw);
      out[key] = value ?? (Array.isArray(fallback) ? [...fallback] : fallback);

      if (!isPlainObject(source[group])) continue;
      if (!Object.hasOwn(incoming, key)) {
        issues?.push(`${group}.${key}: missing, using default ${show(fallback)}`);
      } else if (value === undefined) {
        issues?.push(`${group}.${key}: invalid ${show(raw)}, using default ${show(fallback)}`);
      } else if (show(value) !== show(raw)) {
        issues?.push(`${group}.${key}: ${show(raw)} capped to ${show(value)} (setTimeout limit)`);
      }
    }
    result[group] = out;
  }

  const config = result as unknown as RemoteConfig;

  for (const key of ["timeoutMs", "intervalMs"] as const) {
    if (config.remoteConfig[key] >= MIN_SELF_MS) continue;
    issues?.push(`remoteConfig.${key}: ${config.remoteConfig[key]} raised to ${MIN_SELF_MS} (keeps config fetches working)`);
    config.remoteConfig[key] = MIN_SELF_MS;
  }

  for (const [group, key] of POLL_INTERVALS) {
    const values = config[group] as Record<string, number>;
    if (values[key] >= MIN_SELF_MS) continue;
    issues?.push(`${group}.${key}: ${values[key]} raised to ${MIN_SELF_MS} (would poll back-to-back)`);
    values[key] = MIN_SELF_MS;
  }

  return config;
}

/** Every leaf whose value differs between two configs, as `group.key: old → new`. */
function describeChanges(from: RemoteConfig, to: RemoteConfig): string[] {
  const lines: string[] = [];
  for (const group of Object.keys(to) as (keyof RemoteConfig)[]) {
    const before = from[group] as Record<string, unknown>;
    const after = to[group] as Record<string, unknown>;
    for (const key of Object.keys(after)) {
      if (show(before[key]) !== show(after[key])) {
        lines.push(`${group}.${key}: ${show(before[key])} → ${show(after[key])}`);
      }
    }
  }
  return lines;
}

// The raw payload is what's persisted, not the sanitized result, so validation
// changed in a later build applies to it as well.
const store = GetInstantStore<{ payload: Record<string, unknown> }>(
  "SpicyLyrics_RemoteConfig_g1",
  1,
  { payload: {} }
);

let current: RemoteConfig = sanitizeRemoteConfig(store.Items.payload);
let currentJson = JSON.stringify(current);

{
  const overrides = describeChanges(sanitizeRemoteConfig({}), current);
  if (overrides.length) {
    logger.info(`Starting on last session's config, ${overrides.length} value(s) off default:\n  ${overrides.join("\n  ")}`);
  } else {
    logger.debug("Starting on the default config");
  }
}

const listeners = new Set<(config: RemoteConfig) => void>();

export function getRemoteConfig(): RemoteConfig {
  return current;
}

/** Run `cb` after a fetch changes the effective config. Returns an unsubscribe. */
export function onRemoteConfigChange(cb: (config: RemoteConfig) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

let inFlight: Promise<void> | null = null;

/** What prompted a fetch, for the logs. */
export type RefreshReason = "boot" | "interval" | "focus" | "online" | "manual";

// Both of these exist so a state that persists across fetches — an outage, or a
// payload with a bad key — is logged once when it starts and once when it ends,
// rather than every interval.
let failing = false;
let lastIssues = "";

function noteFailure(reason: RefreshReason, detail: unknown): void {
  if (failing) {
    logger.debug(`Fetch (${reason}) still failing, keeping the current config`, detail);
    return;
  }
  failing = true;
  logger.warn(`Fetch (${reason}) failed, keeping the current config until it recovers`, detail);
}

function noteIssues(issues: string[]): void {
  const joined = issues.join("\n");
  if (joined === lastIssues) return;
  if (issues.length) {
    logger.warn(`Payload has ${issues.length} problem(s), affected keys don't apply as served:\n  ${issues.join("\n  ")}`);
  } else if (lastIssues) {
    logger.info("Payload problems resolved, every key is applied as served");
  }
  lastIssues = joined;
}

/**
 * Fetch and apply the remote config. Concurrent calls share one request. A
 * failure of any kind keeps the config already in place.
 */
export function RefreshRemoteConfig(reason: RefreshReason = "manual"): Promise<void> {
  inFlight ??= (async () => {
    try {
      const res = await EdgeLookup("config", { timeoutMs: current.remoteConfig.timeoutMs });
      if (!res.ok) {
        noteFailure(reason, `HTTP ${res.status}`);
        return;
      }
      const payload: unknown = await res.json();
      if (!isPlainObject(payload)) {
        noteFailure(reason, `payload is not an object: ${show(payload).slice(0, 200)}`);
        return;
      }

      if (failing) {
        failing = false;
        logger.info(`Fetch (${reason}) succeeded again`);
      }

      const issues: string[] = [];
      const next = sanitizeRemoteConfig(payload, issues);
      const nextJson = JSON.stringify(next);
      noteIssues(issues);

      if (JSON.stringify(store.Items.payload) !== JSON.stringify(payload)) {
        store.Items.payload = payload;
        store.SaveChanges();
      }

      if (nextJson === currentJson) {
        logger.debug(`Fetch (${reason}): unchanged`);
        return;
      }

      const changes = describeChanges(current, next);
      logger.info(`Config changed (${reason}), ${changes.length} value(s):\n  ${changes.join("\n  ")}`);

      current = next;
      currentJson = nextJson;
      for (const cb of listeners) {
        try {
          cb(next);
        } catch (error) {
          logger.error("Change listener failed", error);
        }
      }
    } catch (error) {
      noteFailure(reason, error);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

let syncStarted = false;

/**
 * Fetch now, then on an interval for the rest of the session, and again
 * whenever the window regains focus or the network comes back.
 */
export function StartRemoteConfigSync(): void {
  if (syncStarted) return;
  syncStarted = true;

  const tick = async (reason: RefreshReason) => {
    try {
      await RefreshRemoteConfig(reason);
    } finally {
      setTimeout(() => void tick("interval"), current.remoteConfig.intervalMs);
    }
  };
  void tick("boot");

  window.addEventListener("focus", () => void RefreshRemoteConfig("focus"));
  window.addEventListener("online", () => void RefreshRemoteConfig("online"));
}

/** Debug surface, wired into `window.SpicyLyrics.request.remoteConfig`. */
export const RemoteConfigDebug = {
  get: (): RemoteConfig => current,
  refresh: (): Promise<void> => RefreshRemoteConfig("manual"),
  sanitize: (data: unknown): RemoteConfig => sanitizeRemoteConfig(data),
  /** Lint a payload before publishing it: every key that wouldn't apply as written. */
  check: (data: unknown): string[] => {
    const issues: string[] = [];
    sanitizeRemoteConfig(data, issues);
    return issues;
  },
  defaults: (): RemoteConfig => sanitizeRemoteConfig({}),
};
