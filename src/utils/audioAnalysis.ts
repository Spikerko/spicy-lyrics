import { GetExpireStore } from "@spikerko/tools/Cache";
import type { AudioAnalysisData } from "../components/DynamicBG/BackgroundAnimationController";

interface CachedAudioAnalysis {
    analysis?: AudioAnalysisData;
    /** Persisted when Spotify has no analysis for this track (HTTP 404). */
    notFound?: boolean;
}

function getCosmosErrorStatus(error: unknown): number | undefined {
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

export const AudioAnalysisStore = GetExpireStore<CachedAudioAnalysis>("SpicyLyrics_AudioAnalysis", 1, {
    Duration: 1,
    Unit: "Months"
});

function isAudioAnalysisData(data: unknown): data is AudioAnalysisData {
    if (!data || typeof data !== "object") {
        return false;
    }

    const parsed = data as Partial<AudioAnalysisData>;
    return !!parsed.track && Array.isArray(parsed.sections) && Array.isArray(parsed.beats);
}

/**
 * Gets and validates the Spotify audio analysis for a given track ID.
 * * @param trackId The base62 Spotify track ID (e.g., '4uLU6hMCjMI75M1A2tKUQC')
 * @returns The parsed AudioAnalysisData, or null if the fetch fails
 */
export async function getDynamicAudioAnalysis(trackId: string): Promise<AudioAnalysisData | null> {
    if (!trackId) {
        return null;
    }

    const cached = await AudioAnalysisStore.GetItem(trackId);
    if (cached?.notFound) {
        return null;
    }
    if (cached?.analysis && isAudioAnalysisData(cached.analysis)) {
        return cached.analysis;
    }

    const url = `https://spclient.wg.spotify.com/audio-attributes/v1/audio-analysis/${trackId}?format=json`;
    try {
        const data = await Spicetify.CosmosAsync.get(url) as unknown;
        if (!isAudioAnalysisData(data)) {
            throw new Error("Payload is missing required audio analysis arrays (sections/beats).");
        }

        await AudioAnalysisStore.SetItem(trackId, {
            analysis: data,
        });

        return data;
    } catch (error: unknown) {
        const httpStatus = getCosmosErrorStatus(error);
        const message = error && typeof error === "object" && "message" in error
            ? String((error as { message?: unknown }).message)
            : undefined;

        if (httpStatus === 404) {
            console.error("Analysis not found (404)");
            await AudioAnalysisStore.SetItem(trackId, { notFound: true });
        } else if (httpStatus === 429) {
            console.error("Rate limited (429)");
        } else {
            console.error("Network or Validation Error:", message || error);
        }
        return null;
    }
}