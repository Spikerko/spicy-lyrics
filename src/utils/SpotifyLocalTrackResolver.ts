import { SpotifyPlayer } from "../components/Global/SpotifyPlayer.ts";
import { $spotifyClientId, $spotifyClientSecret } from "./stores.ts";

interface SpotifyTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
}

interface LocalTrackSearchContext {
    name?: string;
    artists?: string[];
    album?: string;
}

let tokenPromise: Promise<string | null> | null = null;
let cachedToken: string | null = null;
let cachedTokenExpiresAt = 0;

function normalize(value?: string): string {
    return (value ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function getStoredCredentials(): { clientId: string; clientSecret: string } {
    return {
        clientId: $spotifyClientId.get().trim(),
        clientSecret: $spotifyClientSecret.get().trim(),
    };
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

async function getClientCredentialsToken(): Promise<string | null> {
    const { clientId, clientSecret } = getStoredCredentials();
    if (!clientId || !clientSecret) return null;

    const now = Date.now();
    if (cachedToken && now < cachedTokenExpiresAt) {
        return cachedToken;
    }

    if (tokenPromise) {
        return tokenPromise;
    }

    tokenPromise = fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        },
        body: new URLSearchParams({ grant_type: "client_credentials" }),
    })
        .then(async (response) => {
            if (!response.ok) {
                return null;
            }

            const data = (await response.json()) as SpotifyTokenResponse;
            if (!data.access_token) {
                return null;
            }

            cachedToken = data.access_token;
            cachedTokenExpiresAt = Date.now() + Math.max(0, (data.expires_in ?? 0) - 30) * 1000;
            return cachedToken;
        })
        .catch(() => null)
        .finally(() => {
            tokenPromise = null;
        });

    return tokenPromise;
}

export async function resolveLocalTrackUri(uri?: string): Promise<string | undefined> {
    const currentUri = uri ?? SpotifyPlayer.GetUri();
    if (!currentUri || !currentUri.startsWith("spotify:local:")) {
        return currentUri;
    }

    const token = await getClientCredentialsToken();
    if (!token) {
        return currentUri;
    }

    const searchQuery = buildLocalTrackSearchQuery();
    if (!searchQuery) {
        return currentUri;
    }

    try {
        const response = await fetch(
            `https://api.spotify.com/v1/search?q=${encodeURIComponent(searchQuery)}&type=track&limit=5`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            }
        );

        if (!response.ok) {
            return currentUri;
        }

        const data = (await response.json()) as { tracks?: { items?: Array<{ uri?: string; name?: string }> } };
        const items = data?.tracks?.items ?? [];
        const context = getLocalTrackSearchContext();
        const normalizedName = normalize(context.name);
        const normalizedArtists = (context.artists ?? []).map(normalize).filter(Boolean);

        for (const item of items) {
            const itemName = normalize(item.name);
            const itemMatchesName = !normalizedName || itemName.includes(normalizedName) || normalizedName.includes(itemName);
            const itemMatchesArtists = normalizedArtists.length === 0 || normalizedArtists.some((artist) => itemName.includes(artist) || artist.includes(itemName));

            if (item.uri && itemMatchesName && itemMatchesArtists) {
                return item.uri;
            }
        }

        return items[0]?.uri ?? currentUri;
    } catch {
        return currentUri;
    }
}
