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
const syncTimings = [0.05, 0.1, 0.15, 0.75];
let canSyncNonLocalTimestamp = SpotifyPlayer?.IsPlaying ? syncTimings.length : 0;
// Forward lead (ms) added to every position to compensate for audio-output
// latency. A perceptual dial, not a correctness value: raise it if the sweep
// lands behind the beat, lower it if it runs ahead.
const PROGRESS_POSITION_OFFSET = 25;
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
        .then(({ position }: { position: number }) => ({
          // getPositionState is async: the resolved position is current somewhere
          // between the request and now. Use the NTP-style round-trip midpoint as
          // the best jitter-free estimate of when the sample was taken (anchoring
          // to startedAt would over-extrapolate by the full, variable IPC latency).
          StartedSyncAt: startedAt + (Date.now() - startedAt) / 2,
          Position: Number(position),
        }));
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

  if (!Spicetify.Player.isPlaying()) {
    // Static when paused. The synced position already comes from getPositionState
    // (kept fresh by requestPositionSync), so return it directly.
    return normalizeProgress(Position, false);
  }

  const FinalPosition = Position + deltaTime;
  return normalizeProgress(FinalPosition + PROGRESS_POSITION_OFFSET, true);
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
