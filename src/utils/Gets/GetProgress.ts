import { Spicetify } from "@spicetify/bundler";
import { SpotifyPlayer } from "./../../components/Global/SpotifyPlayer.ts";

interface SyncedPosition {
  StartedSyncAt: number;
  Position: number;
}

let syncedPosition: SyncedPosition | null = null;
const syncTimings = [0.05, 0.1, 0.15, 0.75];
let canSyncNonLocalTimestamp = SpotifyPlayer?.IsPlaying ? syncTimings.length : 0;

export const requestPositionSync = () => {
  try {
    const SpotifyPlatform = Spicetify.Platform;
    const startedAt = Date.now();
    const isLocallyPlaying = SpotifyPlatform.PlaybackAPI._isLocal;

    const getLocalPosition = () => {
      return SpotifyPlatform.PlayerAPI._contextPlayer
        .getPositionState({})
        .then(({ position }: { position: number }) => ({
          StartedSyncAt: startedAt,
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
        return {
          StartedSyncAt: startedAt,
          Position:
            SpotifyPlatform.PlayerAPI._state.positionAsOfTimestamp +
            (Date.now() - SpotifyPlatform.PlayerAPI._state.timestamp),
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
          ? 1 / 60 // 60 FPS for local playback
          : canSyncNonLocalTimestamp === 0
            ? 1 / 60
            : syncTimings[syncTimings.length - canSyncNonLocalTimestamp];

        setTimeout(requestPositionSync, delay * 1000);
      });
  } catch (error) {
    console.error("Sync Position: Fail, More Details:", error);
  }
};

// Function to get the current progress
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

  const SpotifyPlatform = Spicetify.Platform;
  // const isLocallyPlaying = SpotifyPlatform.PlaybackAPI._isLocal;

  const { StartedSyncAt, Position } = syncedPosition;
  const now = Date.now();
  const deltaTime = now - StartedSyncAt;

  // Calculate and return the current track position
  if (!Spicetify.Player.isPlaying()) {
    return SpotifyPlatform.PlayerAPI._state.positionAsOfTimestamp; // Position remains static when paused
  }

  // Calculate and return the current track position
  const FinalPosition = Position + deltaTime;
  return FinalPosition + 85;
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
