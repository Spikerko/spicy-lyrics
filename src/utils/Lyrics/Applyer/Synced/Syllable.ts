import { $minimalLyricsMode, $simpleLyricsMode } from "../../../../utils/stores.ts";
import { IdleEmphasisLyricsScale, IdleLyricsScale } from "../../Animator/Shared.ts";
import { ConvertTime } from "../../ConvertTime.ts";
import isRtl from "../../isRtl.ts";
import { LyricsObject, SetWordArrayInCurentLine } from "../../lyrics.ts";
import Emphasize from "../Utils/Emphasize.ts";
import { IsLetterCapable } from "../Utils/IsLetterCapable.ts";
import {
  ApplySyncedLyrics,
  PushSyncedWord,
  type SyncedApplyMode,
  type SyncedLyricsLine,
} from "./Base.ts";

interface SyllableWordData {
  Text: string;
  TransliteratedText?: string;
  StartTime: number;
  EndTime: number;
  IsPartOfWord?: boolean;
}

interface SyllableLeadData {
  StartTime: number;
  EndTime: number;
  Syllables: SyllableWordData[];
}

interface SyllableBackgroundData {
  StartTime: number;
  EndTime: number;
  Syllables: SyllableWordData[];
}

interface SyllableLineData {
  Lead: SyllableLeadData;
  Background?: SyllableBackgroundData[];
  OppositeAligned?: boolean;
}

interface SyllableLyricsData {
  Type: string;
  Content: SyllableLineData[];
  StartTime: number;
  SongWriters?: string[];
  source?: "spt" | "spl" | "aml";
  classes?: string;
  styles?: Record<string, string>;
}

/**
 * Build a single word element (lead or background) and register it in the
 * current line's Syllables.Lead when it isn't a letter-capable word (letter
 * words are registered by Emphasize instead).
 */
function BuildSyllableWord(params: {
  wordData: SyllableWordData;
  isLast: boolean;
  isBackground: boolean;
  useRomanized: boolean;
  lines: SyncedLyricsLine[];
}): HTMLElement {
  const { wordData, isLast, isBackground, useRomanized, lines } = params;

  let word = document.createElement("span");

  const wordText =
    useRomanized && wordData.TransliteratedText !== undefined
      ? wordData.TransliteratedText
      : wordData.Text;

  const totalDuration = ConvertTime(wordData.EndTime) - ConvertTime(wordData.StartTime);
  const letterLength = wordText.split("").length;

  const ifLetterCapable = IsLetterCapable(letterLength, totalDuration) && !isRtl(wordText);

  if (ifLetterCapable) {
    word = document.createElement("div");
    const letters = wordText.split(""); // Split word into individual letters

    Emphasize(letters, word, wordData, isBackground);

    if (isLast) {
      word.classList.add("LastWordInLine");
    } else if (wordData.IsPartOfWord) {
      word.classList.add("PartOfWord");
    }

    if (!$simpleLyricsMode.get()) {
      word.style.setProperty("--text-shadow-opacity", `0%`);
      word.style.setProperty("--text-shadow-blur-radius", `4px`);
      word.style.scale = IdleEmphasisLyricsScale.toString();
      word.style.transform = `translateY(calc(${
        isBackground ? "var(--font-size)" : "var(--DefaultLyricsSize)"
      } * 0.02))`;
    }
  } else {
    word.textContent = wordText;

    if (!$simpleLyricsMode.get()) {
      word.style.setProperty("--gradient-position", isBackground ? `0%` : `-20%`);
      word.style.setProperty("--text-shadow-opacity", `0%`);
      word.style.setProperty("--text-shadow-blur-radius", `4px`);
      word.style.scale = IdleLyricsScale.toString();
      word.style.transform = `translateY(calc(${
        isBackground ? "var(--font-size)" : "var(--DefaultLyricsSize)"
      } * 0.01))`;
    }

    word.classList.add("word");

    if (isBackground) {
      word.classList.add("bg-word");
    }

    if (isLast) {
      word.classList.add("LastWordInLine");
    } else if (wordData.IsPartOfWord) {
      word.classList.add("PartOfWord");
    }

    PushSyncedWord(lines, {
      HTMLElement: word,
      StartTime: ConvertTime(wordData.StartTime),
      EndTime: ConvertTime(wordData.EndTime),
      TotalTime: totalDuration,
      ...(isBackground ? { BGWord: true } : {}),
    });
  }

  return word;
}

function AppendWordToLine(
  lineElem: HTMLElement,
  word: HTMLElement,
  isPartOfWord: boolean,
  prevIsPartOfWord: boolean,
  currentWordGroup: HTMLSpanElement | null
): HTMLSpanElement | null {
  if (isPartOfWord || (prevIsPartOfWord && currentWordGroup)) {
    if (!currentWordGroup) {
      const group = document.createElement("span");
      group.classList.add("word-group");
      lineElem.appendChild(group);
      currentWordGroup = group;
    }

    currentWordGroup.appendChild(word);

    if (!isPartOfWord && prevIsPartOfWord) {
      currentWordGroup = null;
    }
  } else {
    currentWordGroup = null;
    lineElem.appendChild(word);
  }

  return currentWordGroup;
}

function BuildSyllableLineContent(params: {
  line: SyllableLineData;
  lineElem: HTMLElement;
  useRomanized: boolean;
  lines: SyncedLyricsLine[];
  lineElements: HTMLElement[];
}): void {
  const { line, lineElem, useRomanized, lines, lineElements } = params;

  let currentWordGroup: HTMLSpanElement | null = null;

  line.Lead.Syllables.forEach((lead, iL, aL) => {
    if (isRtl(lead.Text) && !lineElem.classList.contains("rtl")) {
      lineElem.classList.add("rtl");
    }

    const word = BuildSyllableWord({
      wordData: lead,
      isLast: iL === aL.length - 1,
      isBackground: false,
      useRomanized,
      lines,
    });

    currentWordGroup = AppendWordToLine(
      lineElem,
      word,
      lead.IsPartOfWord ?? false,
      aL[iL - 1]?.IsPartOfWord ?? false,
      currentWordGroup
    );
  });

  if (line.Background) {
    line.Background.forEach((bg) => {
      const lineE = document.createElement("div");
      lineE.classList.add("line", "bg-line");

      lines.push({
        HTMLElement: lineE,
        StartTime: ConvertTime(bg.StartTime),
        EndTime: ConvertTime(bg.EndTime),
        TotalTime: ConvertTime(bg.EndTime) - ConvertTime(bg.StartTime),
        BGLine: true,
      });

      SetWordArrayInCurentLine();

      if (line.OppositeAligned) {
        lineE.classList.add("OppositeAligned");
      }

      lineElements.push(lineE);

      let currentBGWordGroup: HTMLSpanElement | null = null;

      bg.Syllables.forEach((bw, bI, bA) => {
        if (isRtl(bw.Text) && !lineE.classList.contains("rtl")) {
          lineE.classList.add("rtl");
        }

        const bwE = BuildSyllableWord({
          wordData: bw,
          isLast: bI === bA.length - 1,
          isBackground: true,
          useRomanized,
          lines,
        });

        currentBGWordGroup = AppendWordToLine(
          lineE,
          bwE,
          bw.IsPartOfWord ?? false,
          bA[bI - 1]?.IsPartOfWord ?? false,
          currentBGWordGroup
        );
      });
    });
  }
}

const SyllableMode: SyncedApplyMode<SyllableLineData> = {
  typeName: "Syllable",
  linesTarget: LyricsObject.Types.Syllable,
  onRegularLinePushed: SetWordArrayInCurentLine,
  onMusicalLinePushed: SetWordArrayInCurentLine,
  extendLineEndTime: () => $minimalLyricsMode.get(),
  getLineStartTime: (line) => line.Lead.StartTime,
  getLineEndTime: (line) => line.Lead.EndTime,
  buildLineContent: BuildSyllableLineContent,
  hasRtlLines: (content) =>
    content.some(
      (line) =>
        line.Lead.Syllables.some((syllable) => isRtl(syllable.Text)) ||
        line.Background?.some((bg) => bg.Syllables.some((syllable) => isRtl(syllable.Text))) ===
          true
    ),
};

export function ApplySyllableLyrics(data: SyllableLyricsData, UseRomanized: boolean = false): void {
  ApplySyncedLyrics(data, UseRomanized, SyllableMode);
}
