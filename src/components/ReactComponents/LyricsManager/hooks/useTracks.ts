import { useEffect, useMemo, useState } from "react";
import { GetTracks } from "../utils/getTracks";
import type { ProcessedTrack } from "../utils/getTracks";

export type UseTracksResult = {
  tracksByUri: Map<string, ProcessedTrack>;
  loading: boolean;
  error: Error | null;
};

export function useTracks(uris: string[]): UseTracksResult {
  const [tracksByUri, setTracksByUri] = useState<Map<string, ProcessedTrack>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const stableKey = useMemo(() => [...uris].sort().join("\0"), [uris]);

  useEffect(() => {
    if (uris.length === 0) {
      setTracksByUri(new Map());
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    GetTracks(uris, { signal: controller.signal })
      .then((tracks) => {
        if (controller.signal.aborted) return;
        const map = new Map<string, ProcessedTrack>();
        for (const track of tracks) {
          map.set(track.uri, track);
        }
        setTracksByUri(map);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => {
      controller.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stableKey]);

  return { tracksByUri, loading, error };
}
