import { TTMLParser, type LyricLine, type TTMLResult } from "@applemusic-like-lyrics/ttml";
import Logger from "../../Logger.ts";

const ttmlLogger = new Logger("TTML Parser");

export type TTMLLyricsType = "Static" | "Line" | "Syllable";

export interface ParsedStaticLine {
  Text: string;
  TransliteratedText?: string;
  TranslatedText?: string;
  HasTransliterations?: boolean;
  HasTranslations?: boolean;
}

export interface ParsedLineVocal {
  Type: "Vocal";
  OppositeAligned: boolean;
  Text: string | undefined;
  StartTime: number | undefined;
  EndTime: number | undefined;
  TransliteratedText?: string;
  TranslatedText?: string;
  HasTransliterations?: boolean;
  HasTranslations?: boolean;
}

export interface ParsedSyllable {
  Text: string;
  TransliteratedText?: string;
  IsPartOfWord: boolean;
  StartTime: number | undefined;
  EndTime: number | undefined;
}

export interface ParsedVocalGroup {
  Syllables: ParsedSyllable[];
  StartTime: number | undefined;
  EndTime: number | undefined;
  TransliteratedText?: string;
  TranslatedText?: string;
  HasTransliterations?: boolean;
  HasTranslations?: boolean;
}

export interface ParsedSyllableVocal {
  Type: "Vocal";
  OppositeAligned: boolean;
  Lead: ParsedVocalGroup;
  Background?: ParsedVocalGroup[];
  HasTransliterations?: boolean;
  HasTranslations?: boolean;
}

interface ParsedLyricsBase {
  SongWriters?: string[];
  HasTransliterations?: boolean;
  HasTranslations?: boolean;
}

export interface ParsedStaticLyrics extends ParsedLyricsBase {
  Type: "Static";
  Lines: ParsedStaticLine[];
}

export interface ParsedLineLyrics extends ParsedLyricsBase {
  Type: "Line";
  StartTime: number | undefined;
  EndTime: number | undefined;
  Content: ParsedLineVocal[];
}

export interface ParsedSyllableLyrics extends ParsedLyricsBase {
  Type: "Syllable";
  StartTime: number | undefined;
  EndTime?: number | undefined;
  Content: ParsedSyllableVocal[];
}

export type ParsedTTMLLyrics =
  | ParsedStaticLyrics
  | ParsedLineLyrics
  | ParsedSyllableLyrics;

const toSeconds = (ms: number | undefined): number | undefined =>
  ms == null || !Number.isFinite(ms) ? undefined : ms / 1000;

/**
 * Agent IDs that Apple Music uses for the "opposite aligned" (duet second) vocal
 * track. v1 is always the main lead; v2 / v2000 indicate the counterpart line.
 */
const isOppositeAlignedAgent = (agentId: string | undefined): boolean =>
  agentId === "v2" || agentId === "v2000";

/** First plain textual value out of a transliteration/translation block, if any. */
const firstSubText = (subs: ReadonlyArray<{ text: string }> | undefined): string | undefined => {
  if (!subs || subs.length === 0) return undefined;
  const text = subs[0]?.text;
  return text == null || text === "" ? undefined : text;
};

const hasSubContent = (
  subs: ReadonlyArray<{ text: string }> | undefined,
): boolean => subs != null && subs.some((s) => s.text != null && s.text !== "");

/** True when a document carries no real timing: every line is untimed (0..0). */
function isUntimed(result: TTMLResult): boolean {
  return (
    result.metadata.timingMode !== "Word" &&
    result.lines.every(
      (line) => (line.startTime || 0) === 0 && (line.endTime || 0) === 0,
    )
  );
}

/** True when any line carries word-level timings (more than a single fallback word). */
function isWordLevel(result: TTMLResult): boolean {
  return result.lines.some(
    (line) => (line.words?.length ?? 0) > 1 || (line.backgroundVocal?.words?.length ?? 0) > 1,
  );
}

/**
 * Word-level transliterations (an AMLL romanization whose timing lines up with
 * individual lyric syllables) are matched back onto those syllables so per-word
 * romanized text survives, exactly as the previous adjacency-scanned map did.
 */
interface WordLike {
  text: string;
  startTime: number;
  endTime: number;
  endsWithSpace?: boolean;
}

/** Match a timed source word to an AMLL word by index-aware start-time lookup. */
function romanizationFor(
  romanizations: ReadonlyArray<{ text: string; words?: ReadonlyArray<WordLike> }> | undefined,
  word: WordLike,
): string | undefined {
  if (!romanizations) return undefined;
  for (const r of romanizations) {
    if (!r.words || r.words.length === 0) continue;
    const hit = r.words.find(
      (w) => w.startTime === word.startTime && w.endTime === word.endTime,
    );
    if (hit && hit.text !== "") return hit.text;
  }
  return undefined;
}

/** Convert one AMLL syllable into the extension's parsed syllable. */
function mapSyllable(
  word: WordLike,
  romanizations?: ReadonlyArray<{ text: string; words?: ReadonlyArray<WordLike> }>,
): ParsedSyllable {
  const parsed: ParsedSyllable = {
    Text: word.text,
    IsPartOfWord: word.endsWithSpace !== true,
    StartTime: toSeconds(word.startTime),
    EndTime: toSeconds(word.endTime),
  };
  const roman = romanizationFor(romanizations, word);
  if (roman !== undefined) parsed.TransliteratedText = roman;
  return parsed;
}

/** Attach romanization/translation to a vocal group and report whether it has either. */
function attachSubText(
  target: { TransliteratedText?: string; TranslatedText?: string },
  line: LyricLine,
  isBackground: boolean,
): { hasTranslits: boolean; hasTransls: boolean } {
  const romanizations = isBackground ? line.backgroundVocal?.romanizations : line.romanizations;
  const translations = isBackground ? line.backgroundVocal?.translations : line.translations;

  const roman = firstSubText(romanizations);
  const translation = firstSubText(translations);

  if (roman !== undefined) target.TransliteratedText = roman;
  if (translation !== undefined) target.TranslatedText = translation;

  return {
    hasTranslits: hasSubContent(romanizations),
    hasTransls: hasSubContent(translations),
  };
}

function buildStatic(result: TTMLResult): ParsedStaticLyrics {
  const staticLyrics: ParsedStaticLyrics = {
    Type: "Static",
    Lines: [],
  };

  for (const line of result.lines) {
    const parsed: ParsedStaticLine = { Text: line.text };
    const { hasTranslits, hasTransls } = attachSubText(parsed, line, false);
    if (hasTranslits) parsed.HasTransliterations = true;
    if (hasTransls) parsed.HasTranslations = true;
    staticLyrics.Lines.push(parsed);
  }

  const anyTranslit = result.lines.some((l) => hasSubContent(l.romanizations));
  const anyTranslation = result.lines.some((l) => hasSubContent(l.translations));
  if (anyTranslit) staticLyrics.HasTransliterations = true;
  if (anyTranslation) staticLyrics.HasTranslations = true;

  return staticLyrics;
}

function buildLine(result: TTMLResult): ParsedLineLyrics {
  const lineLyrics: ParsedLineLyrics = {
    Type: "Line",
    StartTime: undefined,
    EndTime: undefined,
    Content: [],
  };

  for (const line of result.lines) {
    const vocal: ParsedLineVocal = {
      Type: "Vocal",
      OppositeAligned: isOppositeAlignedAgent(line.agentId),
      Text: line.text,
      StartTime: toSeconds(line.startTime),
      EndTime: toSeconds(line.endTime),
    };

    const { hasTranslits, hasTransls } = attachSubText(vocal, line, false);
    if (hasTranslits) {
      vocal.HasTransliterations = true;
      lineLyrics.HasTransliterations = true;
    }
    if (hasTransls) {
      vocal.HasTranslations = true;
      lineLyrics.HasTranslations = true;
    }

    lineLyrics.Content.push(vocal);
  }

  const first = lineLyrics.Content[0];
  const last = lineLyrics.Content[lineLyrics.Content.length - 1];
  lineLyrics.StartTime = first?.StartTime;
  lineLyrics.EndTime = last?.EndTime;

  return lineLyrics;
}

function buildSyllable(result: TTMLResult): ParsedSyllableLyrics {
  const syllableLyrics: ParsedSyllableLyrics = {
    Type: "Syllable",
    StartTime: undefined,
    Content: [],
  };

  for (const line of result.lines) {
    const vocal: ParsedSyllableVocal = {
      Type: "Vocal",
      OppositeAligned: isOppositeAlignedAgent(line.agentId),
      Lead: {
        Syllables: (line.words ?? []).map((word) => mapSyllable(word, line.romanizations)),
        StartTime: toSeconds(line.startTime),
        EndTime: toSeconds(line.endTime),
      },
    };

    const leadSubs = attachSubText(vocal.Lead, line, false);
    if (leadSubs.hasTranslits) {
      vocal.Lead.HasTransliterations = true;
      vocal.HasTransliterations = true;
    }
    if (leadSubs.hasTransls) {
      vocal.Lead.HasTranslations = true;
      vocal.HasTranslations = true;
    }

    if (line.backgroundVocal) {
      const bg = line.backgroundVocal;
      const bgGroup: ParsedVocalGroup = {
        Syllables: (bg.words ?? []).map((word) => mapSyllable(word, bg.romanizations)),
        StartTime: toSeconds(bg.startTime),
        EndTime: toSeconds(bg.endTime),
      };
      const bgSubs = attachSubText(bgGroup, line, true);
      if (bgSubs.hasTranslits) {
        bgGroup.HasTransliterations = true;
        vocal.HasTransliterations = true;
      }
      if (bgSubs.hasTransls) {
        bgGroup.HasTranslations = true;
        vocal.HasTranslations = true;
      }
      vocal.Background = [bgGroup];
    }

    syllableLyrics.Content.push(vocal);
  }

  const first = syllableLyrics.Content[0];
  syllableLyrics.StartTime = first?.Lead?.StartTime;

  let latestEnd: number | undefined;
  for (const content of syllableLyrics.Content) {
    const ends = [content.Lead?.EndTime, ...(content.Background ?? []).map((bg) => bg?.EndTime)];
    for (const end of ends) {
      if (typeof end === "number" && (latestEnd === undefined || end > latestEnd)) {
        latestEnd = end;
      }
    }
  }
  syllableLyrics.EndTime = latestEnd;

  return syllableLyrics;
}

/**
 * Parse TTML lyric markup, using the @applemusic-like-lyrics/ttml parser as the
 * engine. Its output is mapped onto the extension's parsed lyrics shape, and its
 * timings (milliseconds) are converted to seconds.
 */
export function parseTTML(ttml: string): ParsedTTMLLyrics | null {
  if (typeof ttml !== "string" || ttml.trim() === "") {
    ttmlLogger.warn("Refusing to parse empty or non-string TTML input");
    return null;
  }

  let result: TTMLResult;
  try {
    result = TTMLParser.parse(ttml);
  } catch (error) {
    ttmlLogger.error(
      "Failed to parse TTML with AMLL parser",
      (error as Error)?.message ?? String(error),
    );
    return null;
  }

  if (!result || !Array.isArray(result.lines) || result.lines.length === 0) {
    ttmlLogger.warn("TTML parsed to no usable lines, rejecting");
    return null;
  }

  const SongWriters = result.metadata?.songwriters?.length
    ? result.metadata.songwriters.map((s) => s.trim()).filter(Boolean)
    : undefined;
  const base: ParsedLyricsBase = SongWriters && SongWriters.length > 0 ? { SongWriters } : {};

  let lyrics: ParsedTTMLLyrics;
  if (isUntimed(result)) {
    ttmlLogger.debug("No timings present, treating lyrics as Static");
    lyrics = { ...buildStatic(result), ...base };
  } else if (isWordLevel(result)) {
    ttmlLogger.debug("Word-level timings present, treating lyrics as Syllable");
    lyrics = { ...buildSyllable(result), ...base };
  } else {
    ttmlLogger.debug("Line-level timings present, treating lyrics as Line");
    const line = buildLine(result);
    line.StartTime = toSeconds(result.lines[0]?.startTime) ?? line.StartTime;
    line.EndTime = toSeconds(result.lines[result.lines.length - 1]?.endTime) ?? line.EndTime;
    lyrics = { ...line, ...base };
  }

  if (lyrics.Type !== "Static" && !lyrics.HasTransliterations) {
    const anyTranslit = result.lines.some((l) => hasSubContent(l.romanizations));
    if (anyTranslit) lyrics.HasTransliterations = true;
  }
  if (!lyrics.HasTranslations) {
    const anyTranslation = result.lines.some(
      (l) => hasSubContent(l.translations) || hasSubContent(l.backgroundVocal?.translations),
    );
    if (anyTranslation) lyrics.HasTranslations = true;
  }

  const rootItems =
    lyrics.Type === "Static" ? lyrics.Lines : (lyrics as ParsedLineLyrics | ParsedSyllableLyrics).Content;

  if (rootItems.length === 0) {
    ttmlLogger.warn("Parsed TTML produced no usable lyric content");
    return null;
  }

  ttmlLogger.info("Successfully converted lyrics using AMLL parser");
  return lyrics;
}

export function GetLyricsType(ttml: string): TTMLLyricsType | null {
  ttmlLogger.debug("Getting lyrics type from TTML XML");

  if (typeof ttml !== "string" || ttml.trim() === "") {
    ttmlLogger.warn("Cannot determine lyrics type: empty or non-string input");
    return null;
  }

  let result: TTMLResult;
  try {
    result = TTMLParser.parse(ttml);
  } catch (error) {
    ttmlLogger.error("Failed to parse TTML XML", (error as Error)?.message);
    return null;
  }

  if (!result || !Array.isArray(result.lines) || result.lines.length === 0) {
    ttmlLogger.warn("Cannot determine lyrics type: no usable lines");
    return null;
  }

  if (isUntimed(result)) return "Static";
  if (isWordLevel(result)) return "Syllable";
  return "Line";
}
