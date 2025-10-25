// deno-lint-ignore-file no-explicit-any

import { LyricPlayer } from "@applemusic-like-lyrics/core";
import Defaults from "../../../components/Global/Defaults.ts";
import { parseTTML } from "../../../edited_packages/applemusic-like-lyrics-lyric/parser.ts";
import { SetWaitingForHeight } from "../../Scrolling/ScrollToActiveLine.ts";
import { ClearScrollSimplebar } from "../../Scrolling/Simplebar/ScrollSimplebar.ts";
import { setBlurringLastLine } from "../Animator/Lyrics/LyricsAnimator.ts";
import { DestroyAllLyricsContainers } from "../Applyer/CreateLyricsContainer.ts";
import { EmitApply, EmitNotApplyed } from "../Applyer/OnApply.ts";
import { ApplyStaticLyrics, type StaticLyricsData } from "../Applyer/Static.ts";
import { ApplyLineLyrics } from "../Applyer/Synced/Line.ts";
import { ApplySyllableLyrics } from "../Applyer/Synced/Syllable.ts";
import { ClearLyricsPageContainer } from "../fetchLyrics.ts";
import { ClearLyricsContentArrays, isRomanized } from "../lyrics.ts";
import { PageContainer } from "../../../components/Pages/PageView.ts";
import { CleanUpIsByCommunity } from "../Applyer/Credits/ApplyIsByCommunity.tsx";
import { IsCompactMode } from "../../../components/Utils/CompactMode.ts";
import Fullscreen from "../../../components/Utils/Fullscreen.ts";
import storage from "../../storage.ts";
import { SpotifyPlayer } from "../../../components/Global/SpotifyPlayer.ts";
import { _local_hashes, Component } from "@spicetify/bundler";

/**
 * Union type for all lyrics data types
 */
export type LyricsData = {
  Type: "Syllable" | "Line" | "Static" | string;
  [key: string]: any;
};

export let currentLyricsPlayer: LyricPlayer | null = null;

export const resetLyricsPlayer = () => {
  currentLyricsPlayer?.dispose();
  currentLyricsPlayer = null;
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
export default async function ApplyLyrics(lyricsContent: [object | string, number] | null): Promise<void> {
  if (!PageContainer) return;
  setBlurringLastLine(null);
  if (!lyricsContent) return;

  cleanupApplyLyricsAbortController()

  EmitNotApplyed();

  DestroyAllLyricsContainers();

  ClearLyricsContentArrays();
  ClearScrollSimplebar();
  ClearLyricsPageContainer();

  CleanUpIsByCommunity();

  const [descriptor, _status] = lyricsContent;

  let noticeContent: string | null = null;

  switch (descriptor) {
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
    default:
      break;
  }

  if (noticeContent) {
    Defaults.CurrentLyricsType = "None";

    PageContainer
      .querySelector<HTMLElement>(".ContentBox")
        ?.classList.remove("WaitingForHeight");
    
    if (descriptor === "lyrics-not-found") {
      const trackId = SpotifyPlayer.GetId() ?? "";
      storage.set("currentLyricsData", `NO_LYRICS:${trackId}`);
    } else {
      storage.set("currentLyricsData", null);
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

    if (!IsCompactMode() && (Fullscreen.IsOpen || Fullscreen.CinemaViewOpen) && descriptor === "lyrics-not-found") {
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
        Component.GetRootComponent("enqueueAction")("serverInvite");
      }, { signal: currentAbortController.signal });
    }

    EmitApply("None", null)
    SetWaitingForHeight(false);
    
    return;
  }

  const lyrics = descriptor as LyricsData;

  if (Defaults.LyricsRenderer === "aml-lyrics") {
    if (lyrics.AMLLContent) {
      const lrcs = lyrics.AMLLContent;
      const lyricsContainer = PageContainer.querySelector<HTMLElement>(
        ".LyricsContainer .LyricsContent"
      );
      if (!lyricsContainer) return;
      if (!currentLyricsPlayer) currentLyricsPlayer = new LyricPlayer();
      lyricsContainer.appendChild(currentLyricsPlayer.getElement());
      currentLyricsPlayer.setLyricLines(lrcs.lines);

      EmitApply(lyrics.Type, lyrics.Content);
      SetWaitingForHeight(false);
    } else {
      const ttml = lyrics.SourceTTML;
      const lyricsContainer = PageContainer.querySelector<HTMLElement>(
        ".LyricsContainer .LyricsContent"
      );
      if (!lyricsContainer) return;
      if (!currentLyricsPlayer) currentLyricsPlayer = new LyricPlayer();
      const parsedTTML = await parseTTML(ttml);
      lyricsContainer.appendChild(currentLyricsPlayer.getElement());
      currentLyricsPlayer.setLyricLines(parsedTTML.lines);
    }

    EmitApply(lyrics.Type, lyrics.Content);
    SetWaitingForHeight(false);

    return;
  }

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
