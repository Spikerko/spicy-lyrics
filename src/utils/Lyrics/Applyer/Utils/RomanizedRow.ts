// deno-lint-ignore-file no-explicit-any

import { $romanizationDisplay } from "../../../stores.ts";
import { HasLyricsText } from "../../EmptyLines.ts";
import { StripZeroWidth } from "./StripZeroWidth.ts";

// Romanization shown as a smaller row under each line ("Under each line")
// instead of in place of the line ("Replace the line").
//
// The row lives inside its line, as the last flex item on a row of its own, so
// it fades, blurs, scales and aligns with the line, and the virtualizer measures
// it as part of the line's height. It is plain text: it brightens and dims with
// its line's state and has no timing of its own. Mixed.css draws it.

// Whether this apply draws the romanization under each line.
export const RomanizeUnderLine = (useRomanized: boolean): boolean =>
  useRomanized && $romanizationDisplay.get() === "underLine";

const hasRomanization = (entry: any): boolean => HasLyricsText(entry?.TransliteratedText);

// Text without spacing or case, to spot a romanization that only repeats the line.
const bare = (text: string): string => StripZeroWidth(text).replace(/\s+/g, "").toLowerCase();

function appendRow(lineElem: HTMLElement, text: string, beforeBackground = false): void {
  const row = document.createElement("div");
  row.classList.add("RomanizedRow");
  if (beforeBackground) row.classList.add("BeforeBackground");
  row.textContent = text;
  lineElem.appendChild(row);
}

// The romanization of one lead or background line of syllable lyrics, from the
// syllables as sung, with the word breaks of the romanization: a syllable glued
// to the next stays glued unless either side of the seam is a space.
function syllableRomanization(syllables: any[]): string {
  let text = "";
  let gluedToPrevious = false;
  for (const syllable of syllables) {
    const raw = StripZeroWidth(
      typeof syllable.TransliteratedText === "string" ? syllable.TransliteratedText : (syllable.Text ?? "")
    );
    const piece = raw.trim();
    const startsWord = !gluedToPrevious || /^\s/.test(raw);
    const partOfWord = syllable.RomanizedIsPartOfWord ?? syllable.IsPartOfWord;
    gluedToPrevious = !!partOfWord && !/\s$/.test(raw);
    if (piece === "") continue;
    if (text !== "" && startsWord) text += " ";
    text += piece;
  }
  return text;
}

// Appends the row for one lead or background line of syllable lyrics.
export function AppendSyllableRomanization(
  lineElem: HTMLElement,
  syllables: any[],
  beforeBackground = false
): void {
  if (!syllables.some(hasRomanization)) return;
  const original = syllables.map((s) => (typeof s.Text === "string" ? s.Text : "")).join("");
  if (!HasLyricsText(original)) return;
  const text = syllableRomanization(syllables);
  if (text === "" || bare(text) === bare(original)) return;
  appendRow(lineElem, text, beforeBackground);
}

// Appends the row for a line-synced or static line.
export function AppendLineRomanization(lineElem: HTMLElement, entry: any): void {
  if (!hasRomanization(entry) || !HasLyricsText(entry?.Text)) return;
  const text = StripZeroWidth(entry.TransliteratedText).replace(/\s+/g, " ").trim();
  if (bare(text) === bare(entry.Text)) return;
  appendRow(lineElem, text);
}
