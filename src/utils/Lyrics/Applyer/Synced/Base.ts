// Shared rendering pipeline for the two synced lyrics types (Syllable & Line).
// The types differ only in their line shapes and word-building; the container
// setup, musical interludes, credits, scrolling and virtualization are identical.

import { $lyricsContainerExists } from "../../../../utils/stores.ts";
import { PageContainer } from "../../../../components/Pages/PageView.ts";
import { applyStyles, removeAllStyles } from "../../../CSS/Styles.ts";
import {
  ClearScrollSimplebar,
  MountScrollSimplebar,
  RecalculateScrollSimplebar,
  ScrollSimplebar,
} from "../../../Scrolling/Simplebar/ScrollSimplebar.ts";
import { ConvertTime } from "../../ConvertTime.ts";
import { ClearLyricsPageContainer } from "../../fetchLyrics.ts";
import {
  ClearLyricsContentArrays,
  getInterludeTimePadding,
  getLyricsBetweenShow,
  setRomanizedStatus,
  type SyllableLead,
} from "../../lyrics.ts";
import { CreateLyricsContainer, DestroyAllLyricsContainers } from "../CreateLyricsContainer.ts";
import { initLyricsVirtualizer } from "../../LyricsVirtualizer.ts";
import { ApplyIsByCommunity } from "../Credits/ApplyIsByCommunity.tsx";
import { ApplyLyricsCredits } from "../Credits/ApplyLyricsCredits.ts";
import { EmitApply, EmitNotApplyed } from "../OnApply.ts";
import { ApplyLyricsProvider } from "../Credits/ApplyProvider.ts";

/** Structural view of a rendered synced-lyrics line, shared by both types. */
export interface SyncedLyricsLine {
  HTMLElement: HTMLElement;
  StartTime: number;
  EndTime: number;
  TotalTime?: number;
  DotLine?: boolean;
  BGLine?: boolean;
  Syllables?: { Lead: SyllableLead[] };
}

/** Base shape of synced-lyrics payloads. `Content` is defined per type. */
export interface SyncedLyricsData {
  Type: string;
  StartTime: number;
  SongWriters?: string[];
  source?: "spt" | "spl" | "aml";
  classes?: string;
  styles?: Record<string, string>;
}

export interface SyncedLineContent {
  OppositeAligned?: boolean;
}

/** The differences between the Syllable and Line renderers. */
export interface SyncedApplyMode<TLine extends SyncedLineContent> {
  typeName: "Syllable" | "Line";
  linesTarget: { Lines: SyncedLyricsLine[] };
  onRegularLinePushed: () => void;
  onMusicalLinePushed: () => void;
  extendLineEndTime: () => boolean;
  getLineStartTime: (line: TLine) => number;
  getLineEndTime: (line: TLine) => number;
  buildLineContent: (params: {
    line: TLine;
    lineElem: HTMLElement;
    useRomanized: boolean;
    lines: SyncedLyricsLine[];
    lineElements: HTMLElement[];
  }) => void;
  hasRtlLines: (content: TLine[]) => boolean;
}

/** Push a word/dot into the Syllables.Lead of the most recently pushed line. */
export function PushSyncedWord(lines: SyncedLyricsLine[], word: SyllableLead): void {
  const currentLine = lines[lines.length - 1];
  if (currentLine?.Syllables?.Lead) {
    currentLine.Syllables.Lead.push(word);
  } else {
    console.warn("Syllables.Lead is undefined for the current line");
  }
}

/**
 * Build a musical interlude line (the "• • •" dots) and register its three dots.
 * Used both for the leading interlude before the first line and for gaps
 * between lines.
 */
export function CreateMusicalLine<TLine extends SyncedLineContent>(params: {
  lineStartTime: number;
  lineEndTime: number;
  oppositeAligned: boolean | undefined;
  lineElements: HTMLElement[];
  lines: SyncedLyricsLine[];
  mode: SyncedApplyMode<TLine>;
}): void {
  const { lineStartTime, lineEndTime, oppositeAligned, lineElements, lines, mode } = params;

  const musicalLine = document.createElement("div");
  musicalLine.classList.add("line");
  musicalLine.classList.add("musical-line");

  lines.push({
    HTMLElement: musicalLine,
    StartTime: lineStartTime,
    EndTime: lineEndTime,
    TotalTime: lineEndTime - lineStartTime,
    DotLine: true,
  });

  mode.onMusicalLinePushed();

  if (oppositeAligned) {
    musicalLine.classList.add("OppositeAligned");
  }

  const dotGroup = document.createElement("div");
  dotGroup.classList.add("dotGroup");

  const totalTime = lineEndTime - lineStartTime;
  const baseDotTime = totalTime / 3;
  const dotPadding = getInterludeTimePadding() / 3;
  const dot1EndTime = Math.max(lineStartTime, lineStartTime + baseDotTime + dotPadding);
  const dot2EndTime = Math.max(dot1EndTime, lineStartTime + baseDotTime * 2 + dotPadding * 2);
  const dot3EndTime = Math.max(dot2EndTime, lineStartTime + totalTime + getInterludeTimePadding());

  const dotEndTimes = [dot1EndTime, dot2EndTime, dot3EndTime];
  let prevEndTime = lineStartTime;

  for (const endTime of dotEndTimes) {
    const dot = document.createElement("span");
    dot.classList.add("word");
    dot.classList.add("dot");
    dot.textContent = "•";

    PushSyncedWord(lines, {
      HTMLElement: dot,
      StartTime: prevEndTime,
      EndTime: endTime,
      TotalTime: endTime - prevEndTime,
      Dot: true,
    });

    dotGroup.appendChild(dot);
    prevEndTime = endTime;
  }

  musicalLine.appendChild(dotGroup);
  lineElements.push(musicalLine);
}

/**
 * Shared pipeline for applying synced lyrics.
 * @param data - the lyrics payload (Syllable or Line shaped)
 * @param useRomanized - whether to prefer transliterated text
 * @param mode - the per-type differences
 */
export function ApplySyncedLyrics<TLine extends SyncedLineContent>(
  data: SyncedLyricsData & { Content: TLine[] },
  useRomanized: boolean,
  mode: SyncedApplyMode<TLine>
): void {
  if (!$lyricsContainerExists.get()) return;
  EmitNotApplyed();

  DestroyAllLyricsContainers();

  const LyricsContainerParent = PageContainer?.querySelector<HTMLElement>(
    ".LyricsContainer .LyricsContent"
  );
  const LyricsContainerInstance = CreateLyricsContainer();
  const LyricsContainer = LyricsContainerInstance.Container;

  if (!LyricsContainer) {
    console.error("LyricsContainer not found");
    return;
  }

  const hasOppositeAligned = data.Content.some((item) => item.OppositeAligned === true);
  LyricsContainer.classList.toggle("HasDuetLines", hasOppositeAligned);
  LyricsContainer.classList.toggle("HasRtlLines", mode.hasRtlLines(data.Content));

  LyricsContainer.setAttribute("data-lyrics-type", mode.typeName);

  ClearLyricsContentArrays();
  ClearScrollSimplebar();
  ClearLyricsPageContainer();

  // Resolve the target array after the clears: ClearLyricsContentArrays
  // replaces the arrays with fresh ones.
  const lines = mode.linesTarget.Lines;

  const virtualContainer = document.createElement("div");
  virtualContainer.classList.add("VirtualLyricsContainer");
  LyricsContainer.appendChild(virtualContainer);

  const lineElements: HTMLElement[] = [];

  if (data.StartTime >= getLyricsBetweenShow()) {
    CreateMusicalLine({
      lineStartTime: 0,
      lineEndTime: ConvertTime(data.StartTime),
      oppositeAligned: data.Content[0]?.OppositeAligned,
      lineElements,
      lines,
      mode,
    });
  }

  data.Content.forEach((line, index, arr) => {
    const lineElem = document.createElement("div");
    lineElem.classList.add("line");

    const lineStartTime = mode.getLineStartTime(line);
    const lineEndTimeRaw = mode.getLineEndTime(line);
    const nextLineStartTime = arr[index + 1] ? mode.getLineStartTime(arr[index + 1]) : 0;

    const lineEndTime = mode.extendLineEndTime()
      ? nextLineStartTime === 0
        ? lineEndTimeRaw
        : nextLineStartTime - lineEndTimeRaw < getLyricsBetweenShow() &&
            nextLineStartTime > lineEndTimeRaw
          ? nextLineStartTime
          : lineEndTimeRaw
      : lineEndTimeRaw;

    lines.push({
      HTMLElement: lineElem,
      StartTime: ConvertTime(lineStartTime),
      EndTime: ConvertTime(lineEndTime),
      TotalTime: ConvertTime(lineEndTime) - ConvertTime(lineStartTime),
    });

    mode.onRegularLinePushed();

    if (line.OppositeAligned) {
      lineElem.classList.add("OppositeAligned");
    }

    lineElements.push(lineElem);

    mode.buildLineContent({ line, lineElem, useRomanized, lines, lineElements });

    const nextLine = arr[index + 1];
    if (nextLine && mode.getLineStartTime(nextLine) - lineEndTimeRaw >= getLyricsBetweenShow()) {
      CreateMusicalLine({
        lineStartTime: ConvertTime(lineEndTimeRaw),
        lineEndTime: ConvertTime(mode.getLineStartTime(nextLine)),
        oppositeAligned: nextLine.OppositeAligned,
        lineElements,
        lines,
        mode,
      });
    }
  });

  ApplyLyricsCredits(data, LyricsContainer);
  ApplyLyricsProvider(data, LyricsContainer);
  ApplyIsByCommunity(data, LyricsContainer);

  if (LyricsContainerParent) {
    LyricsContainerInstance.Append(LyricsContainerParent);
  }

  if (ScrollSimplebar) RecalculateScrollSimplebar();
  else MountScrollSimplebar();

  const scrollEl = ScrollSimplebar?.getScrollElement() as HTMLElement | undefined;
  if (scrollEl) initLyricsVirtualizer(scrollEl, virtualContainer, lineElements);

  const LyricsStylingContainer = PageContainer?.querySelector<HTMLElement>(
    ".LyricsContainer .LyricsContent .simplebar-content"
  );

  if (LyricsStylingContainer) {
    removeAllStyles(LyricsStylingContainer);

    if (data.classes) {
      LyricsStylingContainer.className = data.classes;
    }

    if (data.styles) {
      applyStyles(LyricsStylingContainer, data.styles);
    }
  } else {
    console.warn("LyricsStylingContainer not found");
  }

  EmitApply(data.Type, data.Content);

  setRomanizedStatus(useRomanized);
}
