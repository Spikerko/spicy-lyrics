import Logger from "./Logger.ts";

const logger = new Logger("Release Year");

export interface ReleaseYearQuery {
  uri: string;
  title: string;
  artist: string;
  album: string;
}

const yearCache = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();

/** A year already looked up for this URI: the year, null for none, undefined when not known yet. */
export function PeekReleaseYear(uri: string): string | null | undefined {
  return yearCache.get(uri);
}

/**
 * The year of the release the song is on. Spotify's track data has it for anything in its
 * catalogue; local files and tracks without a date fall back to the iTunes Search API.
 * Best effort: any failure is null.
 */
export function GetReleaseYear(query: ReleaseYearQuery): Promise<string | null> {
  if (yearCache.has(query.uri)) return Promise.resolve(yearCache.get(query.uri) ?? null);
  const running = pending.get(query.uri);
  if (running) return running;

  const request = (async () => {
    const year = (await spotifyYear(query.uri)) ?? (await itunesYear(query));
    yearCache.set(query.uri, year);
    trimCache(yearCache, 200);
    return year;
  })()
    .catch((err) => {
      logger.warn("Lookup failed", query.uri, err);
      return null;
    })
    .finally(() => pending.delete(query.uri));

  pending.set(query.uri, request);
  return request;
}

async function spotifyYear(uri: string): Promise<string | null> {
  if (!uri.startsWith("spotify:track:")) return null;
  const definition = Spicetify?.GraphQL?.Definitions?.getTrack;
  if (!definition) return null;
  const res = await Spicetify.GraphQL.Request(definition, { uri });
  const year = res?.data?.trackUnion?.albumOfTrack?.date?.year;
  return typeof year === "number" && year > 0 ? String(year) : null;
}

async function itunesYear({ title, artist, album }: ReleaseYearQuery): Promise<string | null> {
  if (!title.trim() || !artist.trim()) return null;
  const term = encodeURIComponent(`${artist} ${title}`);
  const res = await fetch(`https://itunes.apple.com/search?entity=song&limit=15&term=${term}`);
  if (!res.ok) return null;
  const body = await res.json();
  const songs: { title: string; artist: string; album: string; year: string }[] = (
    body?.results ?? []
  )
    .map((r: any) => ({
      title: String(r?.trackName ?? ""),
      artist: String(r?.artistName ?? ""),
      album: String(r?.collectionName ?? ""),
      year: String(r?.releaseDate ?? "").slice(0, 4),
    }))
    .filter((s: { year: string }) => /^\d{4}$/.test(s.year));

  // Search returns covers and namesakes too: only the same title by the same artist counts.
  const same = songs.filter((s) => plain(s.title) === plain(title) && loosely(s.artist, artist));
  if (!same.length) return null;
  const onAlbum = album.trim() && same.find((s) => plain(s.album) === plain(album));
  if (onAlbum) return onAlbum.year;
  // Otherwise the earliest: a live cut or re-release comes out later than the original.
  return same.map((s) => s.year).sort()[0];
}

/** Lower case, without bracketed parts ("(Remastered)", "[feat. X]") or punctuation. */
function plain(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s*[([].*?[)\]]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** One artist credit contains the other, so "A & B" matches "A". */
function loosely(a: string, b: string): boolean {
  const x = plain(a);
  const y = plain(b);
  return !!x && !!y && (x.includes(y) || y.includes(x));
}

function trimCache<K, V>(cache: Map<K, V>, max: number) {
  while (cache.size > max) {
    cache.delete(cache.keys().next().value as K);
  }
}
