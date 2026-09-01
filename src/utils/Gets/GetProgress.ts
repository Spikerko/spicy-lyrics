import { $playbackOffset } from "../stores.ts";
import { SpotifyPlayer } from "./../../components/Global/SpotifyPlayer.ts";

interface SyncedPosition {
  StartedSyncAt: number;
  Position: number;
}

interface PredictedProgress {
  TrackId: string | null;
  Position: number;
  UpdatedAt: number;
}

let syncedPosition: SyncedPosition | null = null;
let predictedProgress: PredictedProgress | null = null;
// Last *distinct* sample from the local position source, when it first
// appeared, and the track it belongs to. See getLocalPosition for why the
// anchor is held rather than refreshed on every poll.
let lastLocalSample: {
  Position: number;
  SampledAt: number;
  TrackUri: string | null;
} | null = null;
// Previous poll's reading of the player state, used only to spot a
// discontinuity (seek/track change) in the state itself. See getLocalPosition.
let lastStateReading: {
  Position: number;
  ReadAt: number;
  WasPlaying: boolean;
} | null = null;
const syncTimings = [0.05, 0.1, 0.15, 0.75];
let canSyncNonLocalTimestamp = SpotifyPlayer?.IsPlaying ? syncTimings.length : 0;
// Forward lead (ms) added to every position to compensate for audio-output
// latency. A perceptual dial, not a correctness value: raise it if the sweep
// lands behind the beat, lower it if it runs ahead.
const PROGRESS_POSITION_OFFSET = 100;
// Deltas within this window are treated as jitter and smoothed; larger deltas
// (seeks/track changes) snap immediately. Kept well below any deliberate seek (>=1s).
const JITTER_RESYNC_THRESHOLD = 500;
// Low-pass time constant (ms) for the jitter filter, applied as
// alpha = 1 - exp(-elapsed / TAU) so smoothing is frame-rate independent. The
// correction is a proportional pull (not a deadband), so a restoring force every
// frame keeps the predicted clock centred on the true position with zero
// steady-state offset. The clock advances on wall-clock time, so this only
// cancels divergence and never adds lag.
const JITTER_TIME_CONSTANT = 300;
// How far the player state may move *non-continuously* between two polls (ms)
// before it counts as a discontinuity that invalidates the held local anchor.
// Sits above a deliberate seek (>=1s) so ordinary state-update noise never
// discards a healthy anchor.
const LOCAL_ANCHOR_RESYNC_THRESHOLD = 1000;

function clampToTrack(position: number): number {
  const duration = SpotifyPlayer.GetDuration();
  let clamped = Math.max(0, position);
  if (duration > 0) {
    clamped = Math.min(clamped, duration);
  }
  return clamped;
}

/**
 * Smooths the raw, extrapolated player position into a stable lyric clock.
 *
 * Spotify's Linux builds report jittery positions, so we keep a predicted clock
 * that advances with real wall-clock time and only re-anchors to the measured
 * position: large deltas (seeks, track changes) snap immediately; small deltas
 * (jitter) are corrected gently and symmetrically, with no net bias or added delay.
 */
function normalizeProgress(position: number, isPlaying: boolean): number {
  const trackId = SpotifyPlayer.GetId() ?? null;
  const measured = clampToTrack(position);
  const now = Date.now();

  // Reset on first read, track change, or while paused — the predicted clock
  // only makes sense while actively playing.
  if (
    !predictedProgress ||
    predictedProgress.TrackId !== trackId ||
    !isPlaying
  ) {
    predictedProgress = { TrackId: trackId, Position: measured, UpdatedAt: now };
    return measured;
  }

  // Advance the prediction by the real time elapsed since the last frame.
  const elapsed = Math.max(0, now - predictedProgress.UpdatedAt);
  let predicted = predictedProgress.Position + elapsed;

  const error = measured - predicted;
  if (Math.abs(error) > JITTER_RESYNC_THRESHOLD) {
    // Real jump (seek/track change/large stall) — trust the measured value.
    predicted = measured;
  } else {
    // Jitter — nudge toward the measured value with a frame-rate-independent
    // low-pass (see JITTER_TIME_CONSTANT).
    //
    // NOTE: this correction assumes `measured` advances in real time. Against a
    // source that has stopped advancing, the pull settles at exactly -elapsed
    // per frame and parks the clock ~JITTER_TIME_CONSTANT ms past the stalled
    // value — a silent freeze. Keeping every branch of requestPositionSync
    // self-extrapolating is what upholds that assumption.
    const alpha = 1 - Math.exp(-elapsed / JITTER_TIME_CONSTANT);
    predicted += error * alpha;
  }

  predicted = clampToTrack(predicted);
  predictedProgress = { TrackId: trackId, Position: predicted, UpdatedAt: now };

  return predicted;
}

export const requestPositionSync = () => {
  try {
    const SpotifyPlatform = Spicetify.Platform;
    const startedAt = Date.now();
    const isLocallyPlaying = SpotifyPlatform.PlaybackAPI._isLocal;

    const getLocalPosition = () => {
      return SpotifyPlatform.PlayerAPI._contextPlayer
        .getPositionState({})
        .then(({ position }: { position: number }) => {
          // getPositionState is async: the resolved position is current somewhere
          // between the request and now. Use the NTP-style round-trip midpoint as
          // the best jitter-free estimate of when the sample was taken (anchoring
          // to startedAt would over-extrapolate by the full, variable IPC latency).
          const sampledAt = startedAt + (Date.now() - startedAt) / 2;
          const sampled = Number(position);

          // Not every client refreshes getPositionState continuously — on some
          // builds it only moves when the player emits a state change, so the
          // same value comes back for hundreds of consecutive polls. Because
          // GetProgress derives the clock from (Position + (now - StartedSyncAt)),
          // re-anchoring StartedSyncAt on every poll pins deltaTime to ~0 and
          // makes the clock a pure mirror of the source: if the source stalls,
          // the lyrics stall with it. Holding the anchor from when the value
          // *first* appeared lets deltaTime extrapolate through the gap, exactly
          // as the non-local branch does with positionAsOfTimestamp/timestamp.
          // A healthy source returns a new value every poll and so re-anchors
          // every poll, leaving current behaviour untouched.
          //
          // While paused the position legitimately holds still, so keep
          // re-anchoring — otherwise a long pause would build up a large
          // deltaTime that jumps the clock forward the instant playback resumes.
          const isPlaying = Spicetify.Player.isPlaying();
          const trackUri = SpotifyPlayer.GetUri() ?? null;

          // A held anchor is only valid for the playback it was taken from. A
          // track change, seek or context switch that happens to report the
          // *same* millisecond as the held sample (on a stalling build both
          // sides commonly sit at 0) would otherwise keep the pre-transition
          // SampledAt and extrapolate the whole gap on top of the new position,
          // running the lyrics to the end of the track.
          //
          // Second signal: the player state jumping non-continuously. While
          // playing, positionAsOfTimestamp + (now - timestamp) advances at
          // wall-clock rate whether or not the state is being refreshed, so
          // comparing it against its own previous reading isolates real jumps.
          // This is deliberately a jump detector and not a running agreement
          // check between the two sources: a *persistent* offset between them
          // would make an agreement check re-anchor on every poll, pinning the
          // clock to a stalled sample — the exact freeze the hold prevents.
          // A jump fires once, because the next poll's expectation is rebuilt
          // from the post-jump reading.
          const state = SpotifyPlatform.PlayerAPI._state;
          const stateReading = state
            ? isPlaying
              ? state.positionAsOfTimestamp + (sampledAt - state.timestamp)
              : state.positionAsOfTimestamp
            : Number.NaN;

          let stateJumped = false;
          if (Number.isFinite(stateReading)) {
            if (lastStateReading?.WasPlaying && isPlaying) {
              const expected =
                lastStateReading.Position + (sampledAt - lastStateReading.ReadAt);
              stateJumped =
                Math.abs(stateReading - expected) >
                LOCAL_ANCHOR_RESYNC_THRESHOLD;
            }
            lastStateReading = {
              Position: stateReading,
              ReadAt: sampledAt,
              WasPlaying: isPlaying,
            };
          }

          const anchorIsStale =
            lastLocalSample !== null &&
            isPlaying &&
            (lastLocalSample.TrackUri !== trackUri || stateJumped);

          if (
            !lastLocalSample ||
            lastLocalSample.Position !== sampled ||
            !isPlaying ||
            anchorIsStale
          ) {
            lastLocalSample = {
              Position: sampled,
              SampledAt: sampledAt,
              TrackUri: trackUri,
            };
          }

          return {
            StartedSyncAt: lastLocalSample.SampledAt,
            Position: lastLocalSample.Position,
          };
        });
    };

    const getNonLocalPosition = () => {
      return (
        canSyncNonLocalTimestamp > 0
          ? SpotifyPlatform.PlayerAPI._contextPlayer.resume({})
          : Promise.resolve()
      ).then(() => {
        canSyncNonLocalTimestamp = Math.max(0, canSyncNonLocalTimestamp - 1);
        const state = SpotifyPlatform.PlayerAPI._state;
        // positionAsOfTimestamp is only live while playing; the (now - timestamp)
        // term extrapolates it forward. While paused timestamp is frozen, so that
        // term would make the position creep forward — only extrapolate while
        // actually playing, otherwise report the static position as-is.
        const Position = Spicetify.Player.isPlaying()
          ? state.positionAsOfTimestamp + (Date.now() - state.timestamp)
          : state.positionAsOfTimestamp;
        return {
          StartedSyncAt: startedAt,
          Position,
        };
      });
    };

    const sync = isLocallyPlaying ? getLocalPosition() : getNonLocalPosition();

    sync
      .then((position: SyncedPosition) => {
        syncedPosition = position;
      })
      // Without this the loop is one rejection away from stopping forever: the
      // reschedule below lives in the success path, so a single failed poll
      // would leave syncedPosition frozen with no way to recover.
      .catch((error: unknown) => {
        console.error("Sync Position: Poll failed, More Details:", error);
      })
      .then(() => {
        const delay = isLocallyPlaying
          ? 1 / 60
          : canSyncNonLocalTimestamp === 0
            ? 1 / 60
            : syncTimings[syncTimings.length - canSyncNonLocalTimestamp];

        setTimeout(requestPositionSync, delay * 1000);
      });
  } catch (error) {
    console.error("Sync Position: Fail, More Details:", error);
    // A synchronous throw (a Platform API not ready or renamed) must not kill
    // the loop either — retry on a slow cadence instead of hammering.
    setTimeout(requestPositionSync, 1000);
  }
};

export default function GetProgress() {
  if (SpotifyPlayer.GetContentType() !== "track") {
    return Spicetify.Player.getProgress();
  }

  if (!syncedPosition) {
    console.error("Synced Position: Unavailable");
    if (SpotifyPlayer?._DEPRECATED_?.GetTrackPosition) {
      // Also added this backup in case, if the "sycedPosition" is unavailable, but the "_DEPRECATED_" version is available
      console.warn("Synced Position: Skip, Using DEPRECATED Version");
      return SpotifyPlayer._DEPRECATED_.GetTrackPosition();
    }
    console.warn("Synced Position: Skip, Returning 0");
    return 0;
  }

  const { StartedSyncAt, Position } = syncedPosition;
  const now = Date.now();
  const deltaTime = now - StartedSyncAt;

  // User-configured lyric sync offset (ms). Subtracted from the clock so the
  // sign reads the way the setting is described: negative values run the clock
  // ahead of the audio (lyrics appear earlier), positive values hold it back
  // (lyrics are delayed). Applied in both play/pause branches so the active
  // line doesn't jump when playback is paused. See $playbackOffset.
  const playbackOffset = $playbackOffset.get();

  if (!Spicetify.Player.isPlaying()) {
    // Static when paused. The synced position already comes from getPositionState
    // (kept fresh by requestPositionSync), so return it directly.
    return normalizeProgress(Position - playbackOffset, false);
  }

  const FinalPosition = Position + deltaTime;
  return normalizeProgress(FinalPosition + PROGRESS_POSITION_OFFSET - playbackOffset, true);
}

// DEPRECATED
export function _DEPRECATED___GetProgress() {
  // Ensure Spicetify is loaded and state is available
  if (!(Spicetify?.Player as any)?.origin?._state) {
    console.error("Spicetify Player state is not available.");
    return 0;
  }

  const state = (Spicetify.Player as any).origin._state;

  // Extract necessary properties from Spicetify Player state
  const positionAsOfTimestamp = state.positionAsOfTimestamp; // Last known position in ms
  const timestamp = state.timestamp; // Last known timestamp
  const isPaused = state.isPaused; // Playback state

  // Validate data integrity
  if (positionAsOfTimestamp == null || timestamp == null) {
    console.error("Playback state is incomplete.");
    return null;
  }

  const now = Date.now();

  // Calculate and return the current track position
  if (isPaused) {
    return positionAsOfTimestamp; // Position remains static when paused
  } else {
    return positionAsOfTimestamp + (now - timestamp);
  }
}
