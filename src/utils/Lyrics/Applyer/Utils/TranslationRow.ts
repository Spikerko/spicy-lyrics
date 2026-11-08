// deno-lint-ignore-file no-explicit-any

import { $lyricsTranslation, $translationDisplay } from "../../../stores.ts";
import { HasLyricsText } from "../../EmptyLines.ts";
import { StripZeroWidth } from "./StripZeroWidth.ts";

// The translation a lyrics file carries (TTML x-translation), shown when the
// translation view control is on: as a smaller row under each line, or in place
// of the line's text.
//
// The row is the line's ::after, drawn from data-translation (Mixed.css), so it
// fades, blurs, scales and aligns with the line like the romanization row. It
// isn't a child element on purpose: other extensions read a line's textContent
// to find its lyric, and a translation in there would be read as part of it.

export type TranslationMode = "underLine" | "replace" | null;

// How this apply shows translations, or null when it doesn't.
export const TranslationModeNow = (): TranslationMode =>
  $lyricsTranslation.get() ? $translationDisplay.get() : null;

// An entry's translation as one line of text, or "" when it has none.
export function TranslationOf(entry: any): string {
  const text = entry?.TranslatedText;
  if (typeof text !== "string") return "";
  const clean = StripZeroWidth(text).replace(/\s+/g, " ").trim();
  return HasLyricsText(clean) ? clean : "";
}

// Marks a line to draw its translation underneath. `beforeBackground` drops the
// row's bottom gap when the line's own background vocal follows.
export function SetLineTranslation(lineElem: HTMLElement, text: string, beforeBackground = false): void {
  if (text === "") return;
  lineElem.dataset.translation = text;
  if (beforeBackground) lineElem.classList.add("TranslationBeforeBackground");
}

// Syllables joined back into one line of text, spaced where a word ends.
const joinSyllables = (syllables: any[], pick: (s: any) => string, glued: (s: any) => boolean): string =>
  syllables
    .map((s, i) => `${pick(s)}${i < syllables.length - 1 && !glued(s) ? " " : ""}`)
    .join("")
    .replace(/\s+/g, " ")
    .trim();

const lineEntry = (group: any, oppositeAligned: boolean | undefined, translation: string): any => {
  const syllables: any[] = group?.Syllables ?? [];
  const entry: any = {
    Type: "Vocal",
    Text: joinSyllables(syllables, (s) => s.Text ?? "", (s) => !!s.IsPartOfWord),
    StartTime: group.StartTime,
    EndTime: group.EndTime,
    OppositeAligned: oppositeAligned,
  };
  if (translation !== "") entry.TranslatedText = translation;
  if (HasLyricsText(group?.TransliteratedText)) {
    entry.TransliteratedText = group.TransliteratedText;
  } else if (syllables.some((s) => HasLyricsText(s.TransliteratedText))) {
    entry.TransliteratedText = joinSyllables(
      syllables,
      (s) => (typeof s.TransliteratedText === "string" ? s.TransliteratedText : (s.Text ?? "")).trim(),
      (s) => !!(s.TransliteratedIsPartOfWord ?? s.IsPartOfWord)
    );
  }
  return entry;
};

// Syllable lyrics as line-synced ones, for replacing lines with their
// translation: the file times a translation by line only, so the line is what
// lights up. Background vocals with a translation of their own become lines of
// their own; the rest are left out, since the line above already covers them.
export function SyllableLyricsAsLines(lyrics: any): any {
  const content: any[] = [];
  for (const group of lyrics.Content ?? []) {
    if (!group?.Lead) continue;
    content.push(lineEntry(group.Lead, group.OppositeAligned, TranslationOf(group.Lead) || TranslationOf(group)));
    for (const bg of group.Background ?? []) {
      const translation = TranslationOf(bg);
      if (translation !== "") content.push(lineEntry(bg, group.OppositeAligned, translation));
    }
  }
  return { ...lyrics, Type: "Line", Content: content };
}
