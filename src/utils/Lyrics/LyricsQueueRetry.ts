// deno-lint-ignore-file no-explicit-any
import { SpotifyPlayer } from "../../components/Global/SpotifyPlayer.ts";
import Global from "../../components/Global/Global.ts";
import Logger from "../logger.ts";
import ApplyLyrics from "./Global/Applyer.ts";
import fetchLyrics, { ShowQueueLoader } from "./fetchLyrics.ts";

const queueLogger = new Logger("Lyrics Queue Retry");

// Backoff schedule for the server-side queue (HTTP 503): start at 2s and grow
// by 1.5x with each consecutive error, capped at 10s.
const BASE_DELAY_MS = 2000;
const MAX_DELAY_MS = 10000;
const BACKOFF_FACTOR = 1.5;

function computeDelay(attempt: number): number {
  const scaled = BASE_DELAY_MS * Math.pow(BACKOFF_FACTOR, attempt);
  return Math.min(MAX_DELAY_MS, Math.round(scaled));
}

type FetchResult = [object | string, number] | null;

// `null` means the fetch was guarded/dropped (an overlapping fetch) — keep
// waiting. The "lyrics-queued" descriptor means the server is still queuing us.
function isStillQueued(result: FetchResult): boolean {
  if (result == null) return true;
  return Array.isArray(result) && result[0] === "lyrics-queued";
}

/**
 * Drives the HTTP 503 ("your request is in the queue") retry loop for lyrics.
 *
 * The controller lives at module scope, so its timer is completely independent
 * of the lyrics page DOM. Closing the page, swapping between Fullscreen / Cinema
 * / Sidebar / PIP views, or toggling rendering modes never disturbs the backoff
 * schedule — when a page is (re)built, the queued loader is simply re-shown for
 * the still-running loop.
 */
class LyricsQueueRetryController {
  private activeUri: string | null = null;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inTick = false;

  /** True while a 503 retry loop is running for the given uri. */
  IsRetryingFor(uri: string | null | undefined): boolean {
    return uri != null && this.activeUri === uri;
  }

  /**
   * Enter (or stay in) the queued state for `uri`. Called whenever a lyrics
   * query returns HTTP 503. Shows the queue loader immediately and makes sure a
   * single retry loop is running. Re-entering for the same uri does NOT reset
   * the backoff schedule, so closing/reopening the page or swapping views keeps
   * the timing intact.
   */
  HandleQueued(uri: string): void {
    ShowQueueLoader();

    if (this.activeUri === uri) {
      // Already looping for this track; only (re)start if the loop somehow
      // stalled (no pending timer and not mid-tick). Never reset the schedule.
      if (this.timer === null && !this.inTick) this.scheduleNext();
      return;
    }

    queueLogger.debug("Entering queued state", uri);
    this.clearTimer();
    this.activeUri = uri;
    this.attempt = 0;
    if (!this.inTick) this.scheduleNext();
  }

  /**
   * Lyrics for `uri` resolved outside the loop (a cache hit, a manual re-fetch,
   * an uploaded TTML, …). Stop the loop if it was retrying that exact track.
   */
  NotifyResolved(uri: string | null | undefined): void {
    if (uri != null && this.activeUri === uri) this.cancel("resolved");
  }

  /** The playing track changed — drop any retry loop for the previous track. */
  OnSongChange(newUri: string | null | undefined): void {
    if (this.activeUri !== null && this.activeUri !== newUri) {
      this.cancel("track-changed");
    }
  }

  private cancel(reason: string): void {
    if (this.activeUri === null && this.timer === null) return;
    queueLogger.debug("Leaving queued state", { uri: this.activeUri, reason });
    this.clearTimer();
    this.activeUri = null;
    this.attempt = 0;
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNext(): void {
    this.clearTimer();
    const uri = this.activeUri;
    if (!uri) return;
    const delay = computeDelay(this.attempt);
    this.attempt += 1;
    queueLogger.debug("Scheduling retry", { uri, attempt: this.attempt, delay });
    this.timer = setTimeout(() => {
      void this.tick(uri);
    }, delay);
  }

  private async tick(uri: string): Promise<void> {
    this.timer = null;

    // Abandon the loop if it was superseded, or the track is no longer playing.
    if (this.activeUri !== uri || SpotifyPlayer.GetUri() !== uri) {
      if (this.activeUri === uri) this.cancel("track-changed");
      return;
    }

    this.inTick = true;
    let result: FetchResult = null;
    try {
      result = await fetchLyrics(uri);
      await ApplyLyrics(result);
    } catch (error) {
      queueLogger.error("Retry tick failed", error);
    } finally {
      this.inTick = false;
    }

    // Cancelled / resolved while awaiting the fetch.
    if (this.activeUri !== uri) return;

    if (isStillQueued(result)) {
      this.scheduleNext();
    } else {
      this.cancel("resolved");
    }
  }
}

export const LyricsQueueRetry = new LyricsQueueRetryController();

// A real track change makes any in-flight 503 retry stale; the new track's own
// fetch re-enters the queued state if it also returns 503. Same-track events
// (e.g. repeat) are ignored so the backoff schedule is preserved.
Global.Event.listen("playback:songchange", (event: any) => {
  const newUri: string | undefined = event?.data?.item?.uri ?? SpotifyPlayer.GetUri();
  LyricsQueueRetry.OnSongChange(newUri);
});
