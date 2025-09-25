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

/**
 * Apply lyrics based on their type
 * @param lyrics - The lyrics data to apply
 */
export default async function ApplyLyrics(lyrics: LyricsData | null | undefined): Promise<void> {
  if (!PageContainer) return;
  setBlurringLastLine(null);
  if (!lyrics) return;

  if (Defaults.LyricsRenderer === "aml-lyrics") {
    EmitNotApplyed();

    DestroyAllLyricsContainers();

    ClearLyricsContentArrays();
    ClearScrollSimplebar();
    ClearLyricsPageContainer();

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
