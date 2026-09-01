// deno-lint-ignore-file no-explicit-any

import { $currentLyricsData, $currentLyricsType } from "../../stores.ts";
import { ClearScrollSimplebar } from "../../Scrolling/Simplebar/ScrollSimplebar.ts";
import { setBlurringLastLine } from "../Animator/Lyrics/LyricsAnimator.ts";
import { DestroyAllLyricsContainers } from "../Applyer/CreateLyricsContainer.ts";
import { EmitApply, EmitNotApplyed } from "../Applyer/OnApply.ts";
import { ApplyStaticLyrics, type StaticLyricsData } from "../Applyer/Static.ts";
import { ApplyLineLyrics } from "../Applyer/Synced/Line.ts";
import { ApplySyllableLyrics } from "../Applyer/Synced/Syllable.ts";
import { ClearLyricsPageContainer, ShowQueueLoader, type FetchLyricsResult } from "../fetchLyrics.ts";
import { ClearLyricsContentArrays, isRomanized } from "../lyrics.ts";
import { PageContainer } from "../../../components/Pages/PageView.ts";
import { CleanUpIsByCommunity } from "../Applyer/Credits/ApplyIsByCommunity.tsx";
import { IsCompactMode } from "../../../components/Utils/CompactMode.ts";
import Fullscreen from "../../../components/Utils/Fullscreen.ts";
import { SpotifyPlayer } from "../../../components/Global/SpotifyPlayer.ts";

/**
 * Union type for all lyrics data types
 */
export type LyricsData = {
  Type: "Syllable" | "Line" | "Static" | string;
  [key: string]: any;
};


let currentAbortController: AbortController | null = null;

export const cleanupApplyLyricsAbortController = () => {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null
  }
}

/**
 * Apply lyrics based on their type
 * @param lyrics - The lyrics data to apply
 */
export default async function ApplyLyrics(lyricsContent: FetchLyricsResult): Promise<void> {
  if (!PageContainer) return;
  if (!lyricsContent) {
    setBlurringLastLine(null);
    return;
  }

  const [descriptor, _status, requestedUri] = lyricsContent;

  // Fetching is async, so a result can land after the user has already skipped
  // on. Applying it would paint the previous track's lyrics — or its "no
  // lyrics" notice — over the new track, and the notice branch below would
  // stamp the NO_LYRICS sentinel with the new track's uri, making every later
  // fetch for that track short-circuit to "no lyrics" for good. Drop it and
  // leave the current track's own apply to do the work.
  const currentUri = SpotifyPlayer.GetUri();
  if (requestedUri && currentUri && requestedUri !== currentUri) return;

  setBlurringLastLine(null);

  cleanupApplyLyricsAbortController()

  EmitNotApplyed();

  DestroyAllLyricsContainers();

  ClearLyricsContentArrays();
  ClearScrollSimplebar();
  ClearLyricsPageContainer();

  CleanUpIsByCommunity();

  let noticeContent: string | null = null;

  switch (descriptor) {
    case "lyrics-queued": {
      // HTTP 503: the lyrics server has queued our request. Keep the loader and
      // queue message visible (LyricsQueueRetry drives the backoff retry loop)
      // and render nothing else — the loop re-applies once it resolves.
      ShowQueueLoader();
      return;
    }
    case "lyrics-not-found": {
      noticeContent = `We don't have any lyrics for this song`
      break;
    }
    case "dj": {
      noticeContent = `Viewing lyrics, while using the DJ, is not supported`
      break;
    }
    case "unknown-track": {
      noticeContent = `We could not access the info for this song`
      break;
    }
    case "unknown-error": {
      noticeContent = `An unknown error happened`
      break;
    }
    case "offline": {
      noticeContent = `Please go online to enjoy your lyrics experience!`
      break;
    }
    case "service-unavailable": {
      // The circuit breaker is holding requests back. Nothing is broken and the
      // user needn't do anything — it retries on its own.
      noticeContent = `Lyrics are temporarily unavailable — we'll keep trying`
      break;
    }
    case "rate-limited": {
      noticeContent = `You're going a little fast for us — give it a moment and try again`
      break;
    }
    case "status-not-200": {
      noticeContent = `A server error occurred`
      break;
    }
    case "video-track": {
      noticeContent = `We currently don't have support for video lyrics`
      break;
    }
    case "episode-track": {
      noticeContent = `We currently don't have support for podcast episode lyrics`
      break;
    }
    case "mixed-track": {
      noticeContent = `We currently don't have support for video podcast episode lyrics`
      break;
    }
    case "local-track": {
      noticeContent = `Lyrics aren't available for local files`
      break;
    }
    default:
      break;
  }

  if (noticeContent) {
    $currentLyricsType.set("None");

    if (descriptor === "lyrics-not-found") {
      // Key the sentinel off the uri the fetch was made for, never off whatever
      // happens to be playing now — see the staleness check above.
      const uri = requestedUri ?? currentUri ?? "";
      $currentLyricsData.set(`NO_LYRICS:${uri}`);
    } else {
      $currentLyricsData.set("");
    }

    const lyricsContainer = PageContainer.querySelector<HTMLElement>(
      ".LyricsContainer .LyricsContent"
    );

    if (!lyricsContainer) return;

    if (!currentAbortController || currentAbortController.signal.aborted) {
      currentAbortController = new AbortController();
    }

    const currentNoticeElement = document.createElement("div");
    currentNoticeElement.classList.add("LyricsNotice");
    lyricsContainer.appendChild(currentNoticeElement);

    if (!IsCompactMode() && (Fullscreen.IsOpen || Fullscreen.CinemaViewOpen) && (descriptor === "lyrics-not-found" || descriptor === "local-track")) {
      PageContainer?.querySelector<HTMLElement>(".ContentBox .LyricsContainer")?.classList.add("Hidden");
      PageContainer?.querySelector<HTMLElement>(".ContentBox")?.classList.add("LyricsHidden");
    }

    currentNoticeElement.innerHTML = `
      <p class="notice-descriptor">${noticeContent.trim()}</p>
      <p class="notice-footer">Need more help? Join our <a>Discord</a>.</p>
    `;

    // Add click handler to log when the Discord link is clicked
    const discordLink = currentNoticeElement.querySelector("a");
    if (discordLink) {
      discordLink.addEventListener("click", () => {
        window.open("https://discord.com/invite/uqgXU5wh8j", "_blank");
      }, { signal: currentAbortController.signal });
    }

    EmitApply("None", null)
    return;
  }

  const lyrics = descriptor as LyricsData;

  const romanize = isRomanized;

  if (lyrics.Type === "Syllable") {
    ApplySyllableLyrics(lyrics as any, romanize);
  } else if (lyrics.Type === "Line") {
    ApplyLineLyrics(lyrics as any, romanize);
  } else if (lyrics.Type === "Static") {
    // Type assertion to StaticLyricsData since we've verified the Type is "Static"
    ApplyStaticLyrics(lyrics as StaticLyricsData, romanize);
  }
}
