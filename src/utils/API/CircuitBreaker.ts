import { GetInstantStore } from "../../modules/Store.ts";
import Logger from "../Logger.ts";
import { jitter } from "../jitter.ts";

const breakerLogger = new Logger("Query Breaker");

/**
 * A shared circuit breaker for every request the extension makes.
 *
 * All traffic funnels through `Query()`, so one breaker covers lyrics, session
 * ops and the version check. Its job is to make sure that when the API (or
 * Cloudflare in front of it) starts refusing us, the client gets *quieter*
 * rather than louder — a retry storm from the userbase is what turns a blocked
 * DDoS into an outage.
 *
 * Two things are deliberately true here:
 *
 * - Only **transport-level** signals are consulted: `res.status` and `fetch`
 *   rejections. The per-query `httpStatus` inside the response envelope is
 *   application-level and must never reach this file — the lyrics queue signals
 *   with an envelope 503 on an HTTP 200, and tripping on that would break it.
 * - State is **persisted**. Users restart Spotify precisely when lyrics look
 *   broken, so an in-memory-only breaker would be cleared by the very people
 *   experiencing the outage.
 */

/** Transport statuses that mean the edge refused us, not that nothing is there. */
const TRIP_STATUSES = new Set([403, 408, 425, 429, 500, 502, 503, 504]);

/** Consecutive qualifying failures before the breaker opens. */
const FAILURE_THRESHOLD = 2;

/** Escalating pause ladder. Each rung is jittered 0.5x-1.5x when applied. */
const LADDER_MS = [120_000, 300_000, 900_000, 1_800_000];
const LADDER_MAX_MS = LADDER_MS[LADDER_MS.length - 1];

/**
 * A persisted `openUntil` further out than this can only come from a corrupt
 * record or a backwards system-clock change; without the clamp such a value
 * would silence the client indefinitely.
 */
const OPEN_UNTIL_SANITY_MS = LADDER_MAX_MS * 1.5;

/** Quiet period after which the ladder drops back to its first rung. */
const LADDER_DECAY_MS = 3_600_000;

/** Minimum spacing between user-initiated lyrics probes while open. */
const PROBE_MIN_INTERVAL_MS = 30_000;

/**
 * A probe still unsettled after this long is treated as abandoned.
 *
 * `Query` holds every request to a 15s deadline, so this is a backstop rather
 * than the main defence — but it is the one that matters, because a probe slot
 * left held forever would stop the breaker ever closing again for the rest of
 * the session.
 */
const PROBE_STALE_AFTER_MS = 60_000;

type BreakerState = {
  /** Epoch ms. Requests are suppressed until this moment. */
  openUntil: number;
  /** Which ladder rung the next trip uses. */
  ladderIndex: number;
  /** Epoch ms of the last trip, for ladder decay. */
  lastTripAt: number;
  /** Epoch ms of the last probe, so a restart cannot hand out a free one. */
  lastProbeAt: number;
};

const DEFAULT_STATE: BreakerState = {
  openUntil: 0,
  ladderIndex: 0,
  lastTripAt: 0,
  lastProbeAt: 0,
};

const store = GetInstantStore<BreakerState>("SpicyLyrics_QueryBreaker_g1", 1, DEFAULT_STATE);
const state = store.Items;

/**
 * How a lease was granted. This decides what a *failure* does, which differs by
 * kind — see `SettleFailure`.
 */
type LeaseKind =
  /** Breaker closed; an ordinary request. */
  | "normal"
  /** The open window elapsed; this request is the health check. */
  | "halfOpen"
  /** Breaker still open, but a user is actively waiting on lyrics. */
  | "earlyProbe";

export type BreakerLease = {
  kind: LeaseKind;
  /**
   * Identifies which probe holds the single slot. A lease whose token no longer
   * matches has been superseded — see `claimSettle`.
   */
  probeToken?: number;
  /**
   * The breaker generation this lease was granted under. A settle from an older
   * generation describes a state the breaker has already moved on from.
   */
  gen: number;
};

/** Thrown instead of making a request while the breaker is open. */
export class ServiceUnavailableError extends Error {
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super(`Request suppressed; retry in ~${Math.round(retryAfterMs / 1000)}s`);
    this.name = "ServiceUnavailableError";
    this.retryAfterMs = retryAfterMs;
  }
}

// Transient, per-session state. Only the four persisted fields outlive a
// restart; everything here is safe to lose because the stored window still
// gates the network on the next boot.
let consecutiveFailures = 0;
let probeInFlight = false;
let probeStartedAt = 0;
let probeSeq = 0;
let activeProbeToken = 0;

/**
 * Bumped on every breaker transition (a trip, or a close). A lease carries the
 * generation it was granted under, so a request still in flight across a
 * transition can be told apart from one describing the current state.
 */
let generation = 0;

/** True while a probe is outstanding and has not yet gone stale. */
function probeIsHeld(now: number): boolean {
  if (!probeInFlight) return false;

  if (now - probeStartedAt > PROBE_STALE_AFTER_MS) {
    breakerLogger.warn("Probe never settled, releasing the slot");
    probeInFlight = false;
    // Drop the token too, so if the abandoned request does eventually settle it
    // cannot free a slot that by then belongs to someone else.
    activeProbeToken = 0;
    return false;
  }

  return true;
}

/**
 * Take ownership of a settle, handing the probe slot back if this lease holds it.
 *
 * Returns false when the lease no longer describes the breaker's current view of
 * the world, in which case the caller must leave breaker state alone. `Query`'s
 * 15s timeout bounds how long a lease can stay open, but not the order in which
 * two settles arrive, so both ways of getting there are reachable:
 *
 * - **A superseded probe.** Released as stale while its request was still open,
 *   with a replacement since granted. Freeing the slot would put a second probe
 *   on the network beside the replacement, which is what the single-probe guard
 *   exists to prevent.
 * - **A stale generation.** The breaker tripped or closed after the lease was
 *   granted, so the lease is evidence about a decision already taken. This
 *   catches slow *normal* requests as well, which matters more than it sounds:
 *   they are granted while the breaker is closed and they outnumber probes, so
 *   the moment other failures trip the breaker there can be several of them
 *   still outstanding. Any one settling late would otherwise close the breaker
 *   and readmit background traffic while the health-check probe is still
 *   failing, or re-trip it while that probe is proving the origin healthy.
 *
 * The current probe's verdict lands within seconds and is the one worth acting
 * on. Without this, breaker state would follow whichever request happened to
 * settle last rather than what the origin is actually doing.
 */
function claimSettle(lease: BreakerLease): boolean {
  if (lease.kind !== "normal") {
    if (lease.probeToken !== activeProbeToken) {
      breakerLogger.info("Superseded probe settled, ignoring its outcome");
      return false;
    }

    // The slot goes back even if the outcome is discarded below — this lease is
    // finished either way, and holding it would block the next probe.
    probeInFlight = false;
    activeProbeToken = 0;
  }

  if (lease.gen !== generation) {
    breakerLogger.info("Lease predates a breaker transition, ignoring its outcome");
    return false;
  }

  return true;
}

/**
 * Repair anything nonsensical in the persisted record before it can gate a
 * request. Runs once at import, which is before the first `Query()` call.
 */
function normalizeState(): void {
  const now = Date.now();
  let changed = false;

  if (state.openUntil - now > OPEN_UNTIL_SANITY_MS) {
    breakerLogger.warn("openUntil beyond sanity bound, resetting", state.openUntil);
    state.openUntil = 0;
    state.ladderIndex = 0;
    state.lastTripAt = 0;
    changed = true;
  }

  // Timestamps in the future mean the clock moved backwards.
  if (state.lastTripAt > now) {
    state.lastTripAt = 0;
    changed = true;
  }
  if (state.lastProbeAt > now) {
    state.lastProbeAt = 0;
    changed = true;
  }

  // A long quiet spell should not leave us starting at the 30 minute rung.
  if (state.ladderIndex > 0 && now - state.lastTripAt > LADDER_DECAY_MS) {
    breakerLogger.info("Ladder decayed back to its first rung");
    state.ladderIndex = 0;
    changed = true;
  }

  if (changed) store.SaveChanges();
}

normalizeState();

/** True when a response status means the edge refused us. */
export function IsTripStatus(status: number): boolean {
  return TRIP_STATUSES.has(status);
}

/** Milliseconds until the breaker closes, or 0 when it is not open. */
export function RetryAfterMs(): number {
  return Math.max(0, state.openUntil - Date.now());
}

export function IsOpen(): boolean {
  return RetryAfterMs() > 0;
}

/**
 * Ask permission to make a request.
 *
 * `probeCandidate` marks a user-initiated lyrics fetch, which may pass even
 * while the breaker is open — an actively-listening user then recovers as soon
 * as the API relents, and their request doubles as the health check. It is
 * bounded by `PROBE_MIN_INTERVAL_MS` and the single-in-flight guard, so a user
 * skipping tracks still costs at most two requests a minute.
 *
 * @throws {ServiceUnavailableError} when the request must not be made.
 */
export function Acquire(probeCandidate: boolean): BreakerLease {
  const now = Date.now();

  if (now < state.openUntil) {
    if (!probeCandidate) throw new ServiceUnavailableError(state.openUntil - now);
    if (probeIsHeld(now)) throw new ServiceUnavailableError(state.openUntil - now);

    const sinceLastProbe = now - state.lastProbeAt;
    if (sinceLastProbe < PROBE_MIN_INTERVAL_MS) {
      throw new ServiceUnavailableError(PROBE_MIN_INTERVAL_MS - sinceLastProbe);
    }

    return grantProbe("earlyProbe", now);
  }

  // Past the window but never closed: the next request is the health check.
  if (state.openUntil !== 0) {
    if (probeIsHeld(now)) throw new ServiceUnavailableError(PROBE_MIN_INTERVAL_MS);
    return grantProbe("halfOpen", now);
  }

  return { kind: "normal", gen: generation };
}

function grantProbe(kind: LeaseKind, now: number): BreakerLease {
  probeInFlight = true;
  probeStartedAt = now;
  activeProbeToken = ++probeSeq;
  state.lastProbeAt = now;
  store.SaveChanges();
  breakerLogger.info("Probe granted", kind);
  return { kind, probeToken: activeProbeToken, gen: generation };
}

/**
 * The request reached the origin. Any answer at all — including a 404 — proves
 * the service is reachable, so the breaker closes completely.
 */
export function SettleSuccess(lease: BreakerLease): void {
  if (!claimSettle(lease)) return;
  consecutiveFailures = 0;

  if (state.openUntil !== 0 || state.ladderIndex !== 0) {
    breakerLogger.info("Service reachable again, breaker closed");
    generation += 1;
    state.openUntil = 0;
    state.ladderIndex = 0;
    store.SaveChanges();
  }
}

/**
 * The request was refused or never arrived.
 *
 * `retryAfterHeaderMs` comes from a `Retry-After` response header when present;
 * the origin's own guidance beats our ladder.
 */
export function SettleFailure(lease: BreakerLease, retryAfterHeaderMs?: number): void {
  if (!claimSettle(lease)) return;

  // A lyrics probe never escalates: otherwise a user skipping tracks would push
  // their own client from the 2 minute rung to the 30 minute one.
  if (lease.kind === "earlyProbe") return;

  if (lease.kind === "halfOpen") {
    trip(retryAfterHeaderMs);
    return;
  }

  consecutiveFailures += 1;
  if (consecutiveFailures >= FAILURE_THRESHOLD) trip(retryAfterHeaderMs);
}

function trip(retryAfterHeaderMs?: number): void {
  const now = Date.now();
  const rung = LADDER_MS[Math.min(state.ladderIndex, LADDER_MS.length - 1)];
  const pause = Math.min(retryAfterHeaderMs ?? jitter(rung, 0.5), OPEN_UNTIL_SANITY_MS);

  state.openUntil = now + pause;
  state.lastTripAt = now;
  state.ladderIndex = Math.min(state.ladderIndex + 1, LADDER_MS.length - 1);
  generation += 1;
  consecutiveFailures = 0;
  store.SaveChanges();

  breakerLogger.warn(`Breaker open for ${Math.round(pause / 1000)}s`, {
    ladderIndex: state.ladderIndex,
    fromHeader: retryAfterHeaderMs !== undefined,
  });
}

/**
 * Parse a `Retry-After` header. Both legal forms are accepted — delta-seconds
 * and an HTTP-date — and anything else is ignored rather than guessed at.
 */
export function ParseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;

  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;

  const date = Date.parse(header);
  if (Number.isNaN(date)) return undefined;

  const delta = date - Date.now();
  return delta > 0 ? delta : undefined;
}

/** Debug surface, wired into `window.SpicyLyrics.testing.breaker`. */
export const BreakerDebug = {
  state: (): BreakerState & { open: boolean; retryAfterMs: number } => ({
    ...state,
    open: IsOpen(),
    retryAfterMs: RetryAfterMs(),
  }),
  reset: (): void => {
    state.openUntil = 0;
    state.ladderIndex = 0;
    state.lastTripAt = 0;
    state.lastProbeAt = 0;
    consecutiveFailures = 0;
    probeInFlight = false;
    probeStartedAt = 0;
    activeProbeToken = 0;
    // Bumping the generation keeps anything still in flight from re-applying
    // its outcome over the reset.
    generation += 1;
    store.SaveChanges();
    breakerLogger.info("Breaker manually reset");
  },
};
