import Platform from "../components/Global/Platform.ts";
import { Query } from "./API/Query.ts";
import { LyricsStore } from "./Lyrics/fetchLyrics.ts";

let warmupInProgress = false;
const warmupSeen = new Set<string>();

async function warmupNextTracks(): Promise<void> {
  if (warmupInProgress) return;
  warmupInProgress = true;
  try {
    const queueResult: any = await (Spicetify.Platform as any).PlayerAPI?.getQueue?.();
    const nextTracks: any[] = queueResult?.nextTracks?.slice(0, 3) ?? [];

    for (const item of nextTracks) {
      const uri: string | undefined = item?.contextTrack?.uri ?? item?.uri;
      if (!uri || !uri.startsWith("spotify:track:")) continue;
      if (warmupSeen.has(uri)) continue;

      const trackId = uri.split(":")[2];
      if (!trackId) continue;

      // Skip if already cached
      if (LyricsStore) {
        try {
          const cached = await LyricsStore.GetItem(trackId);
          if (cached) {
            warmupSeen.add(uri);
            continue;
          }
        } catch {
          // ignore
        }
      }

      try {
        const token = await Platform.GetSpotifyAccessToken();
        const queries = await Query(
          [{ operation: "lyrics", variables: { id: trackId, auth: "SpicyLyrics-WebAuth" } }],
          { "SpicyLyrics-WebAuth": `Bearer ${token}` }
        );
        const result = queries.get("0");
        if (result?.httpStatus === 200 && result.format === "json" && LyricsStore) {
          await LyricsStore.SetItem(trackId, result.data).catch(() => {});
        }
        warmupSeen.add(uri);
      } catch {
        // Non-critical
      }
    }
  } finally {
    warmupInProgress = false;
  }
}

export function initCacheWarmup(): void {
  try {
    Spicetify.Player.addEventListener("songchange", () => {
      warmupSeen.clear();
      // Delay so the main fetch for the current song completes first
      setTimeout(() => warmupNextTracks(), 4000);
    });
  } catch {
    // Player API may not be available in all versions
  }
}
