import { $simpleLyricsMode } from "../../../../utils/stores.ts";
import isRtl from "../../isRtl.ts";
import { LyricsObject, SetWordArrayInCurentLine_LINE_SYNCED } from "../../lyrics.ts";
import { ApplySyncedLyrics, type SyncedApplyMode } from "./Base.ts";

interface LyricsLineData {
  Text: string;
  StartTime: number;
  EndTime: number;
  TransliteratedText?: string;
  OppositeAligned?: boolean;
}

interface LineLyricsData {
  Type: string;
  Content: LyricsLineData[];
  StartTime: number;
  SongWriters?: string[];
  source?: "spt" | "spl" | "aml";
  classes?: string;
  styles?: Record<string, string>;
}

const LineMode: SyncedApplyMode<LyricsLineData> = {
  typeName: "Line",
  linesTarget: LyricsObject.Types.Line,
  // LINE_SYNCED lines carry no word arrays — only musical lines do.
  onRegularLinePushed: () => {},
  onMusicalLinePushed: SetWordArrayInCurentLine_LINE_SYNCED,
  extendLineEndTime: () => $simpleLyricsMode.get(),
  getLineStartTime: (line) => line.StartTime,
  getLineEndTime: (line) => line.EndTime,
  buildLineContent: ({ line, lineElem, useRomanized }) => {
    lineElem.textContent =
      useRomanized && line.TransliteratedText !== undefined ? line.TransliteratedText : line.Text;

    if (isRtl(line.Text) && !lineElem.classList.contains("rtl")) {
      lineElem.classList.add("rtl");
    }
  },
  hasRtlLines: (content) => content.some((line) => isRtl(line.Text)),
};

export function ApplyLineLyrics(data: LineLyricsData, UseRomanized: boolean = false): void {
  ApplySyncedLyrics(data, UseRomanized, LineMode);
}
