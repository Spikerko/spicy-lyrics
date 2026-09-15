import Platform from "../components/Global/Platform.ts";
import { SpotifyPlayer } from "../components/Global/SpotifyPlayer.ts";

interface LocalTrackSearchContext {
    name?: string;
    artists?: string[];
    album?: string;
}


function normalize(value?: string): string {
    return (value ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function getLocalTrackSearchContext(): LocalTrackSearchContext {
    const item = (Spicetify?.Player?.data?.item as any) ?? undefined;
    const artists = item?.artists?.map((artist: { name?: string }) => artist?.name).filter(Boolean) ?? [];
    const album = item?.album?.name ?? item?.metadata?.album_title;

    return {
        name: item?.name,
        artists,
        album,
    };
}

export function buildLocalTrackSearchQuery(context?: LocalTrackSearchContext): string {
    const resolvedContext = context ?? getLocalTrackSearchContext();
    const queryParts: string[] = [];

    if (resolvedContext.name) {
        queryParts.push(`track:${resolvedContext.name}`);
    }

    if (resolvedContext.artists?.length) {
        queryParts.push(`artist:${resolvedContext.artists.join(" ")}`);
    }

    if (resolvedContext.album) {
        queryParts.push(`album:${resolvedContext.album}`);
    }

    return queryParts.join(" ");
}

export async function resolveLocalTrackUri(uri?: string): Promise<string | undefined> {
    const currentUri = uri ?? SpotifyPlayer.GetUri();
    if (!currentUri || !currentUri.startsWith("spotify:local:")) {
        return currentUri;
    }

    const token = await Platform.GetSpotifyAccessToken();
    if (!token) {
        return currentUri;
    }

    const searchQuery = buildLocalTrackSearchQuery();
    if (!searchQuery) {
        return currentUri;
    }

    try {
        const response = await fetchSpotifyPartnerSearch(searchQuery, token);

        const data = response.data.search
        const items = data?.tracks?.items ?? [];
        const context = getLocalTrackSearchContext();
        const normalizedName = normalize(context.name);
        const normalizedArtists = (context.artists ?? []).map(normalize).filter(Boolean);

        for (const item of items) {
            const itemName = normalize(item.track.name);
            const itemMatchesName = !normalizedName || itemName.includes(normalizedName) || normalizedName.includes(itemName);
            const itemMatchesArtists = normalizedArtists.length === 0 || normalizedArtists.some((artist) => itemName.includes(artist) || artist.includes(itemName));

            if (item.track.uri && itemMatchesName && itemMatchesArtists) {
                return item.track.uri;
            }
        }

        return items[0]?.track.uri ?? currentUri;
    } catch {
        return currentUri;
    }
}

function buildUrlWithParams(url, params = {}) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && `${value}`.length > 0) {
            query.set(key, String(value));
        }
    }
    return query.size ? `${url}?${query.toString()}` : url;
}

function tryParseJson(input) {
    try {
        return { ok: true, value: JSON.parse(input) };
    } catch {
        return { ok: false, value: null };
    }
}

function parseJsonLenient(rawText) {
    const text = String(rawText || "").trim();
    if (!text) {
        throw new Error("Empty response body");
    }
    const direct = tryParseJson(text);
    if (direct.ok) {
        return direct.value;
    }

    const jsonpMatch = text.match(/^[^(]+\(([\s\S]+)\)\s*;?\s*$/);
    if (jsonpMatch?.[1]) {
        const parsedJsonp = tryParseJson(jsonpMatch[1].trim());
        if (parsedJsonp.ok) {
            return parsedJsonp.value;
        }
    }

    const prefixed = text.replace(/^\)\]\}',?\s*/, "");
    const parsedPrefixed = tryParseJson(prefixed);
    if (parsedPrefixed.ok) {
        return parsedPrefixed.value;
    }

    throw new Error(`Invalid JSON response (${text.slice(0, 80)})`);
}

async function fetchSpotifyPartnerSearch(query, accessToken) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
        const response = await fetch(
            buildUrlWithParams("https://api-partner.spotify.com/pathfinder/v1/query", {
                operationName: "searchDesktop",
                variables: JSON.stringify({
                    searchTerm: query,
                    offset: 0,
                    limit: 25,
                    numberOfTopResults: 10,
                }),
                extensions: JSON.stringify({
                    persistedQuery: {
                        version: 1,
                        sha256Hash: "75bbf6bfcfdf85b8fc828417bfad92b7cd66bf7f556d85670f4da8292373ebec",
                    },
                }),
            }),
            {
                method: "GET",
                headers: {
                    Accept: "application/json,text/plain,*/*",
                    Authorization: `Bearer ${accessToken}`,
                    "app-platform": "WebPlayer",
                    "spotify-app-version": "1.2.66.447.g4e37e896",
                    Origin: "https://open.spotify.com",
                    Referer: "https://open.spotify.com/",
                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36",
                },
                signal: controller.signal,
            },
        );
        const rawBody = await response.text();
        if (!response.ok) {
            const normalizedBody = String(rawBody || "").toLowerCase();
            if (
                response.status === 403 &&
                (normalizedBody.includes("url blocked") ||
                    normalizedBody.includes("error 54113"))
            ) {
                throw new Error(
                    "Spotify partner search URL Blocked (HTTP 403, Error 54113).",
                );
            }
            if (response.status === 429) {
                const retryAfter = response.headers.get("retry-after");
                throw new Error(
                    `Spotify partner search HTTP 429${retryAfter ? ` (retry-after=${retryAfter})` : ""}.`,
                );
            }
            if (response.status === 403) {
                throw new Error(
                    `Spotify partner search HTTP 403${normalizedBody ? ` (${normalizedBody.slice(0, 120)})` : ""}.`,
                );
            }
            throw new Error(`Spotify partner search HTTP ${response.status}.`);
        }
        return parseJsonLenient(rawBody);
    } finally {
        clearTimeout(timer);
    }
}