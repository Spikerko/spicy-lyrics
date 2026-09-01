import Platform from "../../components/Global/Platform.ts";
import { ServiceUnavailableError } from "../API/CircuitBreaker.ts";
import { fullJitter, jitter } from "../jitter.ts";
import Logger from "../Logger.ts";
import {
  basePingDelayMs,
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  PING_FAILURE_MAX_MS,
  pingDelayMs,
  RECOVER_SPREAD_MS,
  REFRESH_FAILURE_BASE_MS,
  REFRESH_FAILURE_MAX_MS,
  refreshDelayMs,
} from "./config.ts";
import { opCreateSession, opPing, opRefreshSession } from "./operations.ts";
import { clearTk, getTk, markPing, setTk } from "./state.ts";
import { SessionStatus, type OpResult } from "./types.ts";

/**
 * The rule every retry path in this class follows: **a failure delay is never
 * shorter than the healthy interval.**
 *
 * Previously each one broke it — a failed refresh retried in 5s instead of 48
 * minutes, a failed ping kept its normal cadence, and a dead session was
 * recreated instantly — so a blocked client generated far more load than a
 * healthy one, at exactly the moment the server could least afford it.
 */
export class SessionManager {
  private readonly logger = new Logger("SessionManager");

  private pingTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private recoverTimer: ReturnType<typeof setTimeout> | null = null;

  private ensurePromise: Promise<void> | null = null;
  private recreateBackoffMs = 0;
  private createBackoffMs = BACKOFF_BASE_MS;
  private pingFailures = 0;
  private refreshFailures = 0;

  async ensureSession(): Promise<void> {
    if (this.ensurePromise) return this.ensurePromise;

    const run = this.runEnsure();
    this.ensurePromise = run.finally(() => {
      this.ensurePromise = null;
    });
    return this.ensurePromise;
  }

  private async runEnsure(): Promise<void> {
    if (getTk()) {
      this.startTimers();
      return;
    }
    await this.createLoop();
  }

  private async createLoop(): Promise<void> {
    while (!getTk()) {
      const token = await this.getSpotifyToken();
      if (!token) {
        await this.sleep(this.nextCreateDelay());
        continue;
      }

      let result: OpResult;
      try {
        result = await opCreateSession(token);
      } catch (error) {
        // While the breaker is open this throws without touching the network,
        // so waiting out its window is what stops the loop from becoming a
        // tight spin of fail-fast no-ops.
        if (error instanceof ServiceUnavailableError) {
          this.logger.info("createSession suppressed by breaker, waiting it out");
          await this.sleep(error.retryAfterMs);
          continue;
        }
        this.logger.warn("createSession transport error", error);
        await this.sleep(this.nextCreateDelay());
        continue;
      }

      const status = result.httpStatus;

      if (status === SessionStatus.OK && result.data?.tk) {
        setTk(result.data.tk);
        this.resetCreateBackoff();
        this.startTimers();
        return;
      }

      if (status === SessionStatus.UPSTREAM_ERROR) {
        this.logger.warn("createSession upstream unavailable, backing off");
        await this.sleep(this.nextCreateDelay());
        continue;
      }

      this.logger.warn("createSession failed", status, result.data);
      await this.sleep(this.nextCreateDelay());
    }
  }

  private async refreshTick(): Promise<void> {
    const tk = getTk();
    if (!tk) return;

    const token = await this.getSpotifyToken();
    if (!token) {
      this.scheduleRefresh(this.nextRefreshFailureDelay());
      return;
    }

    let result: OpResult;
    try {
      result = await opRefreshSession(tk, token);
    } catch (error) {
      this.logger.warn("refresh transport error", error);
      this.scheduleRefresh(this.nextRefreshFailureDelay());
      return;
    }

    const status = result.httpStatus;

    if (status === SessionStatus.OK && result.data?.tk) {
      setTk(result.data.tk);
      this.resetRecreateBackoff();
      this.refreshFailures = 0;
      this.scheduleRefresh();
      return;
    }

    if (status === SessionStatus.SESSION_DEAD) {
      this.logger.warn("refresh session dead, recreating");
      this.recover();
      return;
    }

    if (status === SessionStatus.UPSTREAM_ERROR) {
      this.logger.warn("refresh upstream unavailable, retrying with backoff");
      this.scheduleRefresh(this.nextRefreshFailureDelay());
      return;
    }

    this.logger.warn("refresh non-ok status", status, result.data);
    this.scheduleRefresh(this.nextRefreshFailureDelay());
  }

  private async pingTick(): Promise<void> {
    const tk = getTk();
    if (!tk) return;

    let result: OpResult;
    try {
      result = await opPing(tk);
    } catch (error) {
      this.logger.warn("ping transport error", error);
      this.schedulePing(this.nextPingFailureDelay());
      return;
    }

    const status = result.httpStatus;

    if (status === SessionStatus.OK) {
      markPing(Date.now());
      this.resetRecreateBackoff();
      this.pingFailures = 0;
      this.schedulePing();
      return;
    }

    if (status === SessionStatus.SESSION_DEAD) {
      this.logger.warn("ping session dead, recreating");
      this.recover();
      return;
    }

    this.logger.warn("ping non-ok status", status, result.data);
    this.schedulePing(this.nextPingFailureDelay());
  }

  private recover(): void {
    clearTk();
    this.clearTimers();
    const delay = this.nextRecreateDelay();
    this.logger.info(`Recreating session in ${Math.round(delay / 1000)}s`);
    this.recoverTimer = setTimeout(() => {
      void this.ensureSession();
    }, delay);
  }

  private async getSpotifyToken(): Promise<string | null> {
    try {
      const token = await Platform.GetSpotifyAccessToken();
      return token || null;
    } catch (error) {
      this.logger.warn("failed to get spotify token", error);
      return null;
    }
  }

  private startTimers(): void {
    this.schedulePing();
    this.scheduleRefresh();
  }

  private schedulePing(delay: number = pingDelayMs()): void {
    if (this.pingTimer) clearTimeout(this.pingTimer);
    this.pingTimer = setTimeout(() => {
      void this.pingTick();
    }, delay);
  }

  private scheduleRefresh(delay: number = refreshDelayMs()): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      void this.refreshTick();
    }, delay);
  }

  private clearTimers(): void {
    if (this.pingTimer) {
      clearTimeout(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (this.recoverTimer) {
      clearTimeout(this.recoverTimer);
      this.recoverTimer = null;
    }
  }

  /**
   * Sessions die in correlated waves — a server restart or a deploy kills every
   * one at once — so the first recovery is spread across a window rather than
   * fired immediately. Nothing outside this class reads the session token, so
   * the delay costs the user nothing.
   */
  private nextRecreateDelay(): number {
    if (this.recreateBackoffMs === 0) {
      this.recreateBackoffMs = BACKOFF_BASE_MS;
      return fullJitter(RECOVER_SPREAD_MS);
    }

    this.recreateBackoffMs = Math.min(this.recreateBackoffMs * 2, BACKOFF_MAX_MS);
    return jitter(this.recreateBackoffMs, 0.3);
  }

  private resetRecreateBackoff(): void {
    this.recreateBackoffMs = 0;
  }

  /** Doubles the healthy ping interval per failure: 5m, 10m, 20m, capped at 30m. */
  private nextPingFailureDelay(): number {
    const base = basePingDelayMs() * Math.pow(2, this.pingFailures);
    this.pingFailures += 1;
    return jitter(Math.min(base, PING_FAILURE_MAX_MS), 0.2);
  }

  /** 1m, 2m, 4m, 8m, capped at 15m — bounded by the TTL slack, see config.ts. */
  private nextRefreshFailureDelay(): number {
    const base = REFRESH_FAILURE_BASE_MS * Math.pow(2, this.refreshFailures);
    this.refreshFailures += 1;
    return jitter(Math.min(base, REFRESH_FAILURE_MAX_MS), 0.2);
  }

  private nextCreateDelay(): number {
    const delay = this.createBackoffMs;
    this.createBackoffMs = Math.min(this.createBackoffMs * 2, BACKOFF_MAX_MS);
    return jitter(delay, 0.3);
  }

  private resetCreateBackoff(): void {
    this.createBackoffMs = BACKOFF_BASE_MS;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
