import { isDev } from "../../components/Global/Defaults.ts";
import { $currentLyricsData, $currentLyricsType, $currentlyFetching } from "../stores.ts";
import Platform from "../../components/Global/Platform.ts";
import { SpotifyPlayer } from "../../components/Global/SpotifyPlayer.ts";
import PageView, { PageContainer } from "../../components/Pages/PageView.ts";
import { Query, QueryHttpError, QueryNetworkError } from "../API/Query.ts";
import { IsTripStatus, ServiceUnavailableError } from "../API/CircuitBreaker.ts";
import { ProcessLyrics } from "./ProcessLyrics.ts";
import Logger from "../Logger.ts";
import { LocalLyricsManager } from "./manager/index.ts";
import { LyricsQueueRetry } from "./LyricsQueueRetry.ts";
import { GetExpireStore } from "../../modules/Store.ts";
import { SLObjPack } from "../objpack.ts";

const lyricsLogger = new Logger("Lyrics Pipeline");
const lyricsCacheLogger = new Logger("Lyrics Cache");

// recently updated key structure - changed name
export const LyricsStore = GetExpireStore<any>("SpicyLyrics_LyricsStore_g1", 3, {
  Unit: "Days",
  Duration: 3,
}, isDev as true);

const lyricsPacker = new SLObjPack();

function setRomanizationClass(hasTransliterations: boolean | undefined): void {
  if (hasTransliterations) {
    PageContainer?.classList.add("Lyrics_RomanizationAvailable");
  } else {
    PageContainer?.classList.remove("Lyrics_RomanizationAvailable");
  }
}

/**
 * Shared "lyrics are ready" presentation: toggle the romanization class, hide the
 * loader, publish the type, reveal the containers and view controls, and clear the
 * fetching flag. Used by every successful return path.
 */
function presentLyrics(lyricsData: any): void {
  // Lyrics are in hand — end any 503 retry loop that was running for this track.
  LyricsQueueRetry.NotifyResolved(lyricsData?.uri);
  setRomanizationClass(lyricsData?.HasTransliterations);
  HideLoaderContainer();
  $currentLyricsType.set(lyricsData.Type);
  PageContainer?.querySelector<HTMLElement>(".ContentBox")?.classList.remove("LyricsHidden");
  PageContainer?.querySelector(".ContentBox .LyricsContainer")?.classList.remove("Hidden");
  PageView.AppendViewControls(true);
  $currentlyFetching.set(false);
}

/**
 * A lyrics fetch result: the descriptor (a lyrics payload, or a keyword naming
 * the notice to show), the HTTP-ish status, and the uri the fetch was made for.
 * The uri lets ApplyLyrics recognise — and drop — a result that only lands
 * after the user has already skipped to another track.
 */
export type FetchLyricsResult = [object | string, number, string?] | null;

/**
 * The uri of the fetch currently in flight, or `null`.
 *
 * A second request for the SAME uri is de-duplicated — the one already running
 * will paint. A request for a DIFFERENT uri supersedes it: the older fetch is
 * left to finish, but its result carries its own uri, so ApplyLyrics drops it
 * rather than painting the previous track's lyrics (or its "no lyrics" notice)
 * over the new one.
 */
let inFlightUri: string | null = null;

/**
 * The uri of the most recent fetch request. Unlike `inFlightUri` this is never
 * cleared, so a fetch that finishes *after* the one that superseded it still
 * sees that it lost the race.
 */
let latestRequestedUri: string | null = null;

/**
 * True when the fetch for `uri` has been overtaken and its result must not be
 * shown: a newer fetch for a different track was started, or the player has
 * already moved on. Presenting it would paint the previous track's lyrics — or
 * its "no lyrics" notice — over the track now playing, and stamp
 * `$currentLyricsData` with the wrong track's payload.
 */
function isStaleFetch(uri: string): boolean {
  if (latestRequestedUri !== null && latestRequestedUri !== uri) return true;
  const currentUri = SpotifyPlayer.GetUri();
  return currentUri != null && currentUri !== uri;
}

export default async function fetchLyrics(uri: string): Promise<FetchLyricsResult> {
  if (inFlightUri === uri) {
    lyricsLogger.debug("Fetch already in flight for this track, skipping", uri);
    return null;
  }

  inFlightUri = uri;
  latestRequestedUri = uri;
  $currentlyFetching.set(true);

  try {
    const result = await runFetchLyrics(uri);
    // Stamp the result with the uri it was requested for, so a late arrival can
    // be told apart from a result for the track that's playing now.
    return result ? [result[0], result[1], uri] : null;
  } finally {
    // Only release the lock if we still hold it — a newer fetch may have taken
    // over while this one was awaiting.
    if (inFlightUri === uri) inFlightUri = null;
    $currentlyFetching.set(false);
  }
}

async function runFetchLyrics(uri: string): Promise<[object | string, number] | null> {
  lyricsLogger.debug("Fetch requested", uri);
  //if (!PageContainer) return;
  const LyricsContent =
    PageContainer?.querySelector(".LyricsContainer .LyricsContent") ?? undefined;
  if (!LyricsContent) return;
  if (LyricsContent?.classList.contains("offline")) {
    LyricsContent.classList.remove("offline");
  }

  //if (!Fullscreen.IsOpen) PageView.AppendViewControls(true);

  if (SpotifyPlayer.IsDJ()) {
    $currentlyFetching.set(false);
    return ["dj", 400];
  }

  const mediaType = SpotifyPlayer.GetMediaType();

  if (
    mediaType &&
    mediaType !== "audio"
  ) {
    $currentlyFetching.set(false);
    if (mediaType === "video") {
      return ["video-track", 400];
    } else if (mediaType === "mixed") {
      return ["mixed-track", 400];
    }
    return ["unknown-track", 400];
  }

  const contentType = SpotifyPlayer.GetContentType();
  if (contentType !== "track") {
    $currentlyFetching.set(false);
    if (contentType === "episode") {
      return ["episode-track", 400];
    }
    return ["unknown-track", 400];
  }

  const trackId = uri.split(":")[2];

  if (LyricsContent) {
    LyricsContent.classList.add("HiddenTransitioned");
  }


  // Check if there's already data in localStorage
  const savedLyricsData = $currentLyricsData.get();

  if (savedLyricsData && !isDev) {
    try {
      if (savedLyricsData.startsWith("NO_LYRICS:")) {
        // Sentinel format is `NO_LYRICS:<uri>`. The uri itself contains colons,
        // so strip the prefix rather than splitting on ":".
        const savedUri = savedLyricsData.slice("NO_LYRICS:".length);
        if (savedUri === uri) {
          $currentlyFetching.set(false);
          return ["lyrics-not-found", 404];
        }
      } else {
        const lyricsData = JSON.parse(savedLyricsData);
        // Return the stored lyrics if the URI matches the current track URI
        if (lyricsData?.uri === uri) {
          presentLyrics(lyricsData);
          return [lyricsData, 200];
        }
      }
    } catch (error) {
      lyricsCacheLogger.error("Error parsing saved lyrics data", error);
      $currentlyFetching.set(false);
      HideLoaderContainer();
    }
  }

  const localLyric = await LocalLyricsManager.get(uri);
  if (localLyric) {
    const lyricsData = { ...localLyric, uri };
    if (isStaleFetch(uri)) return [lyricsData, 200];
    $currentLyricsData.set(JSON.stringify(lyricsData));
    presentLyrics(lyricsData);
    return [lyricsData, 200];
  }

  // Local files have no real track id (uri.split(":")[2] is the URL-encoded
  // artist name), so they can't be looked up in LyricsStore or fetched from the
  // API. Bail out here — after LocalLyricsManager.get() (which serves any
  // user-uploaded TTML) but before the meaningless remote cache read.
  if (uri.startsWith("spotify:local:")) {
    $currentlyFetching.set(false);
    return ["local-track", 400];
  }

  if (LyricsStore) {
    try {
      const lyricsFromCacheRes = await LyricsStore.GetItem(trackId);
      if (lyricsFromCacheRes) {
        if (lyricsFromCacheRes?.Value === "NO_LYRICS") {
          $currentlyFetching.set(false);
          return ["lyrics-not-found", 404];
        }
        // Tag the cached payload with the current uri so the saved-data and
        // re-fetch checks (which match on uri) recognise it — older cache
        // entries predate the uri field.
        const lyricsFromCache = { ...(lyricsFromCacheRes ?? {}), uri };
        if (isStaleFetch(uri)) return [{ ...lyricsFromCache, fromCache: true }, 200];
        $currentLyricsData.set(JSON.stringify(lyricsFromCache));
        presentLyrics(lyricsFromCache);
        return [{ ...lyricsFromCache, fromCache: true }, 200];
      }
    } catch (error) {
      lyricsCacheLogger.error("Error parsing cache entry", error);
      $currentlyFetching.set(false);
      return ["unknown-error", 0];
    }
  }


  if (!navigator.onLine) {
    $currentlyFetching.set(false);
    return ["offline", 400];
  }

  ShowLoaderContainer();

  // Fetch new lyrics if no match in localStorage
  /* const lyricsApi = storage.get("customLyricsApi") ?? Defaults.LyricsContent.api.url;
    const lyricsAccessToken = storage.get("lyricsApiAccessToken") ?? Defaults.LyricsContent.api.accessToken; */

  try {
    const Token = await Platform.GetSpotifyAccessToken();

    let status = 0;

    lyricsLogger.debug("API lyrics query", { trackId });
    const queries = await Query(
      [
        {
          operation: "lyrics",
          variables: {
            id: trackId,
            auth: "SpicyLyrics-WebAuth",
          },
        },
      ],
      {
        "SpicyLyrics-WebAuth": `Bearer ${Token}`,
      },
      // Someone is waiting on this, so it may pass even while the breaker is
      // open (subject to the breaker's own cooldown) and doubles as the health
      // check that closes it. This is the only caller allowed to set it.
      { probe: true }
    );

    const lyricsQuery = queries.get("0");
    if (!lyricsQuery) {
      lyricsLogger.error("Lyrics query not found");
      HideLoaderContainer();
      $currentlyFetching.set(false);
      return ["lyrics-not-found", 404];
    }

    status = lyricsQuery.httpStatus;

    if (status === 503) {
      // The server accepted the request but hasn't processed it yet — it's
      // queued. Surface the queue loader immediately and hand off to the retry
      // loop, which keeps polling with backoff (and survives page close / view
      // swaps). We deliberately leave the loader up and return a sentinel so no
      // error notice is rendered.
      $currentlyFetching.set(false);
      LyricsQueueRetry.HandleQueued(uri);
      return ["lyrics-queued", 503];
    }

    if (status !== 200) {
      if (status === 404) {
        HideLoaderContainer();
        $currentlyFetching.set(false);
        return ["lyrics-not-found", 404];
      }
      if (status === 429) {
        // The server's own per-query rate limit. (A *transport* 429 never gets
        // here — that trips the circuit breaker and throws.)
        HideLoaderContainer();
        $currentlyFetching.set(false);
        return ["rate-limited", 429];
      }
      HideLoaderContainer();
      $currentlyFetching.set(false);
      return ["status-not-200", status];
    }

    const lyrics = lyricsPacker.unpack(lyricsQuery.data) as any;

    if (lyrics === null || lyrics === undefined || lyrics === "") {
      HideLoaderContainer();
      $currentlyFetching.set(false);
      return ["lyrics-not-found", 404];
    }

    await ProcessLyrics(lyrics);

    // Stamp the uri so every match downstream (saved-data, re-fetch, cache)
    // keys off the stable uri instead of the API-supplied id.
    lyrics.uri = uri;

    // The request already completed, so cache it either way — even if the user
    // has skipped on, the next play of this track gets a cache hit.
    if (LyricsStore) {
      try {
        await LyricsStore.SetItem(trackId, lyrics);
      } catch (error) {
        lyricsCacheLogger.error("Error saving lyrics to cache", error);
      }
    }

    if (isStaleFetch(uri)) return [{ ...lyrics, fromCache: false }, 200];

    $currentLyricsData.set(JSON.stringify(lyrics));
    presentLyrics(lyrics);
    return [{ ...lyrics, fromCache: false }, 200];
  } catch (error) {
    $currentlyFetching.set(false);
    HideLoaderContainer();

    // The request was never made: the circuit breaker is holding traffic back
    // because the API is refusing us. That is a temporary pause, not a fault,
    // and it deserves different copy from a genuine error.
    if (error instanceof ServiceUnavailableError) {
      lyricsLogger.warn("Lyrics request suppressed", error.message);
      return ["service-unavailable", 0];
    }

    // Refused at the transport layer. A 429 here is the edge rate-limiting us
    // rather than the server's own per-query limit, but it means the same thing
    // to the user, so it gets the same wording.
    if (error instanceof QueryHttpError) {
      lyricsLogger.warn("Lyrics request refused", error.status);
      if (error.status === 429) return ["rate-limited", 429];
      if (IsTripStatus(error.status)) return ["service-unavailable", error.status];
      return ["status-not-200", error.status];
    }

    // No readable response. The status is hidden from us (see QueryNetworkError),
    // so we can't name the reason — but it is a service problem, not a fault in
    // the extension, and saying "unknown error" here is misleading.
    if (error instanceof QueryNetworkError) {
      lyricsLogger.warn("Lyrics request never returned a readable response", error.cause);
      return ["service-unavailable", 0];
    }

    // Anything left is a genuine fault in our own pipeline (unpacking, parsing,
    // presenting) and should stay loud.
    lyricsLogger.error("Error fetching lyrics", error);
    return ["unknown-error", 0];
  }
}

let ContainerShowLoaderTimeout: ReturnType<typeof setTimeout> | null = null;

/** Default copy shown in the loader while a lyrics request is queued (HTTP 503). */
export const LYRICS_QUEUE_MESSAGE =
  "Your request is in the queue — hang tight, your lyrics are on the way!";

/**
 * Show the loader container after a delay
 */
function ShowLoaderContainer(): void {
  const loaderContainer = PageContainer?.querySelector<HTMLElement>(
    ".LyricsContainer .loaderContainer"
  );
  if (loaderContainer) {
    ContainerShowLoaderTimeout = setTimeout(() => {
      loaderContainer.classList.add("active");
    }, 2000);
  }
}

/**
 * Immediately reveal the loader with a "request queued" message. Used for the
 * HTTP 503 server-queue state, where we want instant feedback (no 2s delay)
 * plus a note explaining the wait. Idempotent and safe to call when the page is
 * closed (no-ops if there's no loader in the current DOM).
 */
export function ShowQueueLoader(message: string = LYRICS_QUEUE_MESSAGE): void {
  const loaderContainer = PageContainer?.querySelector<HTMLElement>(
    ".LyricsContainer .loaderContainer"
  );
  if (!loaderContainer) return;

  // We're showing now, so cancel the delayed plain-loader reveal.
  if (ContainerShowLoaderTimeout) {
    clearTimeout(ContainerShowLoaderTimeout);
    ContainerShowLoaderTimeout = null;
  }

  loaderContainer.classList.add("active", "queued");

  let messageEl = loaderContainer.querySelector<HTMLElement>(".loaderMessage");
  if (!messageEl) {
    messageEl = document.createElement("div");
    messageEl.className = "loaderMessage";
    loaderContainer.appendChild(messageEl);
  }
  messageEl.textContent = message;
}

/**
 * Hide the loader container and clear any pending timeout
 */
function HideLoaderContainer(): void {
  const loaderContainer = PageContainer?.querySelector<HTMLElement>(
    ".LyricsContainer .loaderContainer"
  );
  if (loaderContainer) {
    if (ContainerShowLoaderTimeout) {
      clearTimeout(ContainerShowLoaderTimeout);
      ContainerShowLoaderTimeout = null;
    }
    loaderContainer.classList.remove("active", "queued");
    loaderContainer.querySelector(".loaderMessage")?.remove();
  }
}

/**
 * Clear the lyrics container content
 */
export function ClearLyricsPageContainer(): void {
  const lyricsContent = PageContainer?.querySelector<HTMLElement>(
    ".LyricsContainer .LyricsContent"
  );
  if (lyricsContent) {
    lyricsContent.innerHTML = "";
  }
}
