import { normalizeLyricLine, tokenSetScore } from "../AnnotationMatcher.ts";
import { $geniusAccessToken, $geniusProxyUrl } from "../AnnotationState.ts";
import type {
  AnnotationProvider,
  AnnotationTrackMatch,
  RawLyricAnnotation,
  TrackMetadata,
} from "../types.ts";

interface GeniusHit {
  result: {
    id: number;
    full_title?: string;
    title?: string;
    url?: string;
    primary_artist?: {
      name?: string;
    };
  };
}

interface GeniusReferent {
  id: number;
  fragment?: string;
  url?: string;
  annotations?: Array<{
    body?: {
      plain?: string;
    };
    url?: string;
    votes_total?: number;
  }>;
}

class GeniusRequestError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
  }
}

function stripSearchNoise(title: string): string {
  return title
    .replace(/\s*\((feat\.?|ft\.?).*?\)\s*/gi, " ")
    .replace(/\s*-\s*(remastered|live|edit|version|radio edit|\d{4}).*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function containsVersionNoise(value: string): boolean {
  return /\b(remix|live|version|edit|remaster(ed)?)\b/i.test(value);
}

function anySignal(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  const abort = () => controller.abort();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener("abort", abort, { once: true });
  }
  return controller.signal;
}

async function requestGenius<T>(apiUrl: string, signal?: AbortSignal): Promise<T> {
  const token = $geniusAccessToken.get().trim();
  const proxy = $geniusProxyUrl.get().trim();
  const direct = proxy.length === 0;
  const url = direct ? apiUrl : `${proxy}${encodeURIComponent(apiUrl)}`;
  const timeout = AbortSignal.timeout(6000);
  const requestSignal = signal ? anySignal([signal, timeout]) : timeout;
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (direct && token.length > 0) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    headers,
    signal: requestSignal,
  });

  if (!response.ok) {
    throw new GeniusRequestError(`Genius request failed with ${response.status}`, response.status);
  }

  return response.json() as Promise<T>;
}

function scoreHit(hit: GeniusHit["result"], track: TrackMetadata): AnnotationTrackMatch {
  const hitTitle = hit.title ?? "";
  const hitArtist = hit.primary_artist?.name ?? "";
  const trackTitle = stripSearchNoise(track.title);
  const firstArtist = track.artists[0] ?? "";
  const titleScore = tokenSetScore(normalizeLyricLine(hitTitle), normalizeLyricLine(trackTitle));
  const artistScore = tokenSetScore(normalizeLyricLine(hitArtist), normalizeLyricLine(firstArtist));
  const fullTitle = normalizeLyricLine(hit.full_title ?? "");
  const allArtistsAppear =
    track.artists.length > 0 &&
    track.artists.every((artist) => fullTitle.includes(normalizeLyricLine(artist)));
  const versionPenalty =
    containsVersionNoise(hitTitle) && !containsVersionNoise(track.title) ? -0.15 : 0;
  const featuredBonus = track.artists
    .slice(1)
    .some((artist) => fullTitle.includes(normalizeLyricLine(artist)))
    ? 0.05
    : 0;
  const artistBonus = allArtistsAppear ? 0.1 : 0;

  return {
    provider: "genius",
    providerSongId: String(hit.id),
    title: hitTitle,
    artist: hitArtist,
    url: hit.url,
    confidence: clamp(
      titleScore * 0.5 + artistScore * 0.35 + artistBonus + featuredBonus + versionPenalty
    ),
  };
}

export const GeniusAnnotationProvider: AnnotationProvider = {
  id: "genius",
  name: "Genius",
  isConfigured() {
    return $geniusAccessToken.get().trim().length > 0 || $geniusProxyUrl.get().trim().length > 0;
  },
  async searchTrack(track, signal) {
    const query = `${track.artists[0] ?? ""} ${stripSearchNoise(track.title)}`.trim();
    if (!query) return null;

    const data = await requestGenius<{ response?: { hits?: GeniusHit[] } }>(
      `https://api.genius.com/search?q=${encodeURIComponent(query)}`,
      signal
    );
    const hits = data.response?.hits ?? [];
    const best = hits
      .map((hit) => scoreHit(hit.result, track))
      .sort((a, b) => b.confidence - a.confidence)[0];

    return best && best.confidence >= 0.6 ? best : null;
  },
  async getAnnotations(match, signal) {
    const data = await requestGenius<{ response?: { referents?: GeniusReferent[] } }>(
      `https://api.genius.com/referents?song_id=${encodeURIComponent(match.providerSongId)}&text_format=plain&per_page=50`,
      signal
    );

    return (data.response?.referents ?? [])
      .map<RawLyricAnnotation | null>((referent) => {
        const annotation = referent.annotations?.[0];
        const fragment = referent.fragment?.trim() ?? "";
        const text = annotation?.body?.plain?.trim() ?? "";
        if (!fragment || !text) return null;

        return {
          id: referent.id,
          provider: "genius",
          fragment,
          text,
          url: annotation?.url ?? referent.url,
          votes: annotation?.votes_total,
        };
      })
      .filter((annotation): annotation is RawLyricAnnotation => annotation !== null);
  },
};

export { GeniusRequestError };
