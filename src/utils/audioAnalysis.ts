import type { AudioAnalysisData } from "../components/DynamicBG/BackgroundAnimationController";
import { GetExpireStore } from "../modules/Store";
import { getRemoteConfig } from "./remoteConfig";
import { SpotifyFetch } from "../components/Global/SpotifyFetch.ts";

interface CachedAudioAnalysis {
    analysis?: AudioAnalysisData;
    /**
     * Written by older builds for a 404; no longer read, since it pinned the miss
     * for the whole analysis TTL. 404s now go to AudioAnalysisNotFoundStore.
     */
    notFound?: boolean;
}

function getHttpErrorStatus(error: unknown): number | undefined {
    if (!error || typeof error !== "object") {
        return undefined;
    }
    const e = error as { status?: unknown; code?: unknown };
    if (typeof e.status === "number") {
        return e.status;
    }
    if (typeof e.code === "number") {
        return e.code;
    }
    return undefined;
}

// A getter so a pushed TTL applies to every write from then on.
export const AudioAnalysisStore = GetExpireStore<CachedAudioAnalysis>("SpicyLyrics_AudioAnalysis", 1, {
    get Duration() {
        return getRemoteConfig().cache.audioAnalysisTtlMonths;
    },
    Unit: "Months"
});

// Spotify's 404 here isn't always permanent, so a miss is only trusted for a
// short while (`cache.audioAnalysisNotFoundTtlHours`) before asking again.
const AudioAnalysisNotFoundStore = GetExpireStore<true>("SpicyLyrics_AudioAnalysisNotFound", 1, {
    get Duration() {
        return getRemoteConfig().cache.audioAnalysisNotFoundTtlHours;
    },
    Unit: "Hours"
});

function isAudioAnalysisData(data: unknown): data is AudioAnalysisData {
    if (!data || typeof data !== "object") {
        return false;
    }

    const parsed = data as Partial<AudioAnalysisData>;
    return !!parsed.track && Array.isArray(parsed.sections) && Array.isArray(parsed.beats);
}

/**
 * Gets and validates the Spotify audio analysis for a given track URI.
 * * @param uri The Spotify track URI (e.g., 'spotify:track:4uLU6hMCjMI75M1A2tKUQC')
 * @returns The parsed AudioAnalysisData, or null if the fetch fails
 */
export async function getDynamicAudioAnalysis(uri: string): Promise<AudioAnalysisData | null> {
    if (!uri) {
        return null;
    }

    // Local tracks aren't hosted by Spotify, so there's no audio analysis to
    // load for them — skip the request entirely.
    if (uri.startsWith("spotify:local:")) {
        return null;
    }

    const trackId = uri.split(":")[2];
    if (!trackId) {
        return null;
    }

    if (await AudioAnalysisNotFoundStore.GetItem(trackId)) {
        return null;
    }
    const cached = await AudioAnalysisStore.GetItem(trackId);
    if (cached?.analysis && isAudioAnalysisData(cached.analysis)) {
        return cached.analysis;
    }

    const url = `https://spclient.wg.spotify.com/audio-attributes/v1/audio-analysis/${trackId}?format=json`;
    try {
        // Bounded: the caller keeps this promise as the track's in-flight request,
        // so a hang here would block audio analysis for the track until reload.
        const res = await SpotifyFetch(url, { signal: AbortSignal.timeout(getRemoteConfig().audioAnalysis.timeoutMs) });
        if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
        const data = await res.json() as unknown;
        if (!isAudioAnalysisData(data)) {
            throw new Error("Payload is missing required audio analysis arrays (sections/beats).");
        }

        await AudioAnalysisStore.SetItem(trackId, {
            analysis: data,
        });

        return data;
    } catch (error: unknown) {
        const httpStatus = getHttpErrorStatus(error);
        const message = error && typeof error === "object" && "message" in error
            ? String((error as { message?: unknown }).message)
            : undefined;

        if (httpStatus === 404) {
            console.error("Analysis not found (404)");
            await AudioAnalysisNotFoundStore.SetItem(trackId, true);
        } else if (httpStatus === 429) {
            console.error("Rate limited (429)");
        } else {
            console.error("Network or Validation Error:", message || error);
        }
        return null;
    }
}