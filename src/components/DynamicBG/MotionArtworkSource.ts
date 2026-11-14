import { getRemoteConfig } from "../../utils/remoteConfig.ts";
import { $motionArtwork } from "../../utils/stores.ts";
import Global from "../Global/Global.ts";
import { SpotifyFetch } from "../Global/SpotifyFetch.ts";
import type { MotionVerdict } from "./ArtworkPlacement.ts";

// Album id → UPC (album metadata) → a URL signed for 5 minutes, for the NowBar cover and the stage.
// A missing file and an expired signature both fail with code 4; only a fresh URL failing means none.

const SIGN_URL = "https://artworkapi.spicylyrics.org/client/enqueueRequest?path=gtin14/";
const ALBUM_METADATA_URL = (gid: string) =>
  `https://spclient.wg.spotify.com/metadata/4/album/${gid}?market=from_token`;
const SIGNED_URL_CACHE_SIZE = 64;

/** The setting and the remote kill switch. */
export function IsMotionArtworkEnabled(): boolean {
  return $motionArtwork.get() && getRemoteConfig().animatedArtwork.enabled;
}

export function PlayingAlbumId(): string | null {
  const item = Spicetify?.Player?.data?.item as
    | { type?: string; album?: { uri?: string }; metadata?: Record<string, string> }
    | undefined;
  if (!item || (item.type && item.type !== "track")) return null;
  const uri = item.album?.uri ?? item.metadata?.album_uri;
  if (!uri?.startsWith("spotify:album:")) return null;
  const id = uri.slice("spotify:album:".length);
  return /^[0-9A-Za-z]{22}$/.test(id) ? id : null;
}

// album id → UPC (14 digits) or null when the album has none. Kept for the session.
const upcCache = new Map<string, string | null>();
const upcPending = new Map<string, Promise<string | null>>();
// UPC → time until which it is treated as having no video.
const missUntil = new Map<string, number>();
// UPCs whose video has loaded this session.
const availableUpcs = new Set<string>();

function normalizeUpc(raw: unknown): string | null {
  if (typeof raw !== "string" || !/^\d{8,14}$/.test(raw)) return null;
  return raw.padStart(14, "0");
}

/** undefined until the metadata has given a definite answer. */
export function KnownAlbumUpc(albumId: string): string | null | undefined {
  return upcCache.get(albumId);
}

export function GetAlbumUpc(albumId: string): Promise<string | null> {
  if (upcCache.has(albumId)) return Promise.resolve(upcCache.get(albumId) ?? null);
  const pending = upcPending.get(albumId);
  if (pending) return pending;

  const request = (async () => {
    try {
      const gid = Spicetify.URI.idToHex(albumId);
      const res = await SpotifyFetch(ALBUM_METADATA_URL(gid), {
        signal: AbortSignal.timeout(getRemoteConfig().animatedArtwork.metadataTimeoutMs),
      });
      // Only a definite answer is cached; anything else is asked again next time.
      if (res.status === 404) {
        upcCache.set(albumId, null);
        return null;
      }
      if (!res.ok) return null;
      const data = (await res.json()) as { external_id?: { type?: string; id?: string }[] };
      const entry = data.external_id?.find((e) => e?.type?.toLowerCase() === "upc");
      const upc = normalizeUpc(entry?.id);
      upcCache.set(albumId, upc);
      return upc;
    } catch {
      return null;
    } finally {
      upcPending.delete(albumId);
    }
  })();
  upcPending.set(albumId, request);
  return request;
}

type SignResponse = {
  aw?: { sig?: unknown; delivery?: unknown };
  cfg?: { base?: unknown; parcelValidation?: unknown };
};

export type ArtworkUrl = { url: string; reused: boolean };

// UPC → its last signed URL, kept past the signature's 5 minutes: the CDN lets the browser cache
// the video for a day under that exact URL, so reusing it usually never reaches the network.
const signedUrls = new Map<string, string>();
const signing = new Map<string, Promise<string | null>>();

/** The UPC's cached URL, or a new signature when there is none or `fresh` is asked for. A load
 * error on a reused URL is an expired signature until a fresh one fails too. */
export async function GetArtworkUrl(upc: string, fresh = false): Promise<ArtworkUrl | null> {
  const cached = signedUrls.get(upc);
  if (cached && !fresh) return { url: cached, reused: true };
  let request = signing.get(upc);
  if (!request) {
    request = signArtworkUrl(upc).finally(() => signing.delete(upc));
    signing.set(upc, request);
  }
  const url = await request;
  if (!url) return null;
  signedUrls.delete(upc);
  signedUrls.set(upc, url);
  if (signedUrls.size > SIGNED_URL_CACHE_SIZE) signedUrls.delete(signedUrls.keys().next().value!);
  return { url, reused: false };
}

/** Drops the cached URL after it failed to load, unless a newer one already replaced it. */
export function ForgetArtworkUrl(upc: string, url: string) {
  if (signedUrls.get(upc) === url) signedUrls.delete(upc);
}

// A plain fetch with no custom headers.
async function signArtworkUrl(upc: string): Promise<string | null> {
  try {
    const res = await fetch(SIGN_URL + upc, {
      cache: "no-store",
      signal: AbortSignal.timeout(getRemoteConfig().animatedArtwork.signTimeoutMs),
    });
    if (!res.ok) return null;
    const { aw, cfg } = (await res.json()) as SignResponse;
    const parts = [cfg?.base, aw?.delivery, cfg?.parcelValidation, aw?.sig];
    if (!parts.every((part) => typeof part === "string" && part.length > 0)) return null;
    // `sig` arrives percent-encoded already.
    return `https${cfg!.base}${aw!.delivery}?${cfg!.parcelValidation}=${aw!.sig}`;
  } catch {
    return null;
  }
}

export function IsMissed(upc: string): boolean {
  const until = missUntil.get(upc);
  if (until === undefined) return false;
  if (Date.now() < until) return true;
  missUntil.delete(upc);
  return false;
}

// The stage may have stepped aside for this video; it hears that there is none after all.
export function MarkMissed(upc: string) {
  availableUpcs.delete(upc);
  signedUrls.delete(upc);
  missUntil.set(upc, Date.now() + getRemoteConfig().animatedArtwork.missTtlMs);
  Global.Event.evoke("motion-artwork:verdict", upc);
}

export function MarkAvailable(upc: string) {
  availableUpcs.add(upc);
}

// Does this album have a video? Asked only when that decides Canvas Stage vs. cover
// (ArtworkPlacement.ts), so ordinary playback costs nothing extra.

const checking = new Set<string>();
// album id → time until which a check that couldn't finish counts as "unknown".
const unknownUntil = new Map<string, number>();

/** What is known about the album, starting a check when nothing is yet. */
export function RequestMotionVerdict(albumId: string): MotionVerdict {
  const upc = upcCache.get(albumId);
  if (upc === null) return "none";
  if (upc) {
    if (IsMissed(upc)) return "none";
    if (availableUpcs.has(upc)) return "available";
  }
  if (checking.has(albumId)) return "pending";
  const until = unknownUntil.get(albumId);
  if (until !== undefined && Date.now() < until) return "unknown";
  unknownUntil.delete(albumId);
  void check(albumId);
  return "pending";
}

// true: plays; false: the freshly signed URL was refused; null: no answer in time.
function probe(url: string): Promise<boolean | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "metadata";
    const finish = (result: boolean | null) => {
      clearTimeout(timer);
      video.onloadedmetadata = video.onerror = null;
      video.removeAttribute("src");
      video.load();
      resolve(result);
    };
    const timer = setTimeout(() => finish(null), getRemoteConfig().animatedArtwork.checkTimeoutMs);
    video.onloadedmetadata = () => finish(true);
    // MEDIA_ERR_NETWORK says nothing about the file.
    video.onerror = () => finish(video.error?.code === MediaError.MEDIA_ERR_NETWORK ? null : false);
    video.src = url;
  });
}

async function check(albumId: string) {
  checking.add(albumId);
  const unknown = () => {
    unknownUntil.set(albumId, Date.now() + getRemoteConfig().animatedArtwork.signRetryMs);
  };
  try {
    await new Promise((resolve) => setTimeout(resolve, getRemoteConfig().animatedArtwork.checkDelayMs));
    if (PlayingAlbumId() !== albumId) return;
    const upc = await GetAlbumUpc(albumId);
    if (!upcCache.has(albumId)) return unknown();
    if (!upc || IsMissed(upc) || availableUpcs.has(upc)) return;
    const signed = await GetArtworkUrl(upc, true);
    if (!signed) return unknown();
    const result = await probe(signed.url);
    if (result === true) {
      availableUpcs.add(upc);
    } else if (result === false) {
      MarkMissed(upc);
    } else {
      unknown();
    }
  } finally {
    checking.delete(albumId);
    Global.Event.evoke("motion-artwork:verdict", albumId);
  }
}
