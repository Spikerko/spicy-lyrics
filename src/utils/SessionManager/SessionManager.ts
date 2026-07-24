import Platform from "../../components/Global/Platform.ts";
import Logger from "../logger.ts";
import {
  applyPingConfig,
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  pingDelayMs,
  refreshDelayMs,
} from "./config.ts";
import { opCreateSession, opPing, opPingConfig, opRefreshSession } from "./operations.ts";
import { clearTk, getTk, markPing, setTk } from "./state.ts";
import { SessionStatus, type OpResult } from "./types.ts";

export class SessionManager {
  private readonly logger = new Logger("SessionManager");

  private pingTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private recoverTimer: ReturnType<typeof setTimeout> | null = null;

  private ensurePromise: Promise<void> | null = null;
  private recreateBackoffMs = 0;
  private createBackoffMs = BACKOFF_BASE_MS;

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
      await this.syncPingConfig();

      const token = await this.getSpotifyToken();
      if (!token) {
        await this.sleep(this.nextCreateDelay());
        continue;
      }

      let result: OpResult;
      try {
        result = await opCreateSession(token);
      } catch (error) {
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

    await this.syncPingConfig();

    const token = await this.getSpotifyToken();
    if (!token) {
      this.scheduleRefresh(BACKOFF_BASE_MS);
      return;
    }

    let result: OpResult;
    try {
      result = await opRefreshSession(tk, token);
    } catch (error) {
      this.logger.warn("refresh transport error", error);
      this.scheduleRefresh(BACKOFF_BASE_MS);
      return;
    }

    const status = result.httpStatus;

    if (status === SessionStatus.OK && result.data?.tk) {
      setTk(result.data.tk);
      this.resetRecreateBackoff();
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
      this.scheduleRefresh(BACKOFF_BASE_MS);
      return;
    }

    this.logger.warn("refresh non-ok status", status, result.data);
    this.scheduleRefresh(BACKOFF_BASE_MS);
  }

  private async pingTick(): Promise<void> {
    const tk = getTk();
    if (!tk) return;

    let result: OpResult;
    try {
      result = await opPing(tk);
    } catch (error) {
      this.logger.warn("ping transport error", error);
      this.schedulePing();
      return;
    }

    const status = result.httpStatus;

    if (status === SessionStatus.OK) {
      markPing(Date.now());
      this.resetRecreateBackoff();
      this.schedulePing();
      return;
    }

    if (status === SessionStatus.SESSION_DEAD) {
      this.logger.warn("ping session dead, recreating");
      this.recover();
      return;
    }

    this.logger.warn("ping non-ok status", status, result.data);
    this.schedulePing();
  }

  private recover(): void {
    clearTk();
    this.clearTimers();
    const delay = this.nextRecreateDelay();
    this.recoverTimer = setTimeout(() => {
      void this.ensureSession();
    }, delay);
  }

  private async syncPingConfig(): Promise<void> {
    try {
      const result = await opPingConfig();
      if (result.httpStatus === SessionStatus.OK) {
        applyPingConfig(result.data);
      } else {
        this.logger.warn("pingConfig non-ok status", result.httpStatus);
      }
    } catch (error) {
      this.logger.warn("pingConfig fetch failed", error);
    }
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

  private nextRecreateDelay(): number {
    const delay = this.recreateBackoffMs;
    this.recreateBackoffMs =
      this.recreateBackoffMs === 0
        ? BACKOFF_BASE_MS
        : Math.min(this.recreateBackoffMs * 2, BACKOFF_MAX_MS);
    return delay;
  }

  private resetRecreateBackoff(): void {
    this.recreateBackoffMs = 0;
  }

  private nextCreateDelay(): number {
    const delay = this.createBackoffMs;
    this.createBackoffMs = Math.min(this.createBackoffMs * 2, BACKOFF_MAX_MS);
    return delay;
  }

  private resetCreateBackoff(): void {
    this.createBackoffMs = BACKOFF_BASE_MS;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
