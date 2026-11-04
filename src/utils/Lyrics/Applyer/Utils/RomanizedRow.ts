// deno-lint-ignore-file no-explicit-any

import { $romanizationDisplay } from "../../../stores.ts";
import { ConvertTime } from "../../ConvertTime.ts";
import { HasLyricsText } from "../../EmptyLines.ts";
import { StripZeroWidth } from "./StripZeroWidth.ts";

// Romanization shown as a smaller row under each line ("Under each line")
// instead of in place of the line ("Replace the line").
//
// The row lives inside its line, as the last flex item on a row of its own, so
// it fades, blurs, scales and aligns with the line, and the virtualizer measures
// it as part of the line's height. Mixed.css draws it.
//
// In syllable lyrics each syllable's romanization is its own piece, lit from
// left to right over that syllable's sung time while the line is active, so the
// row keeps pace with the words above it however they are joined or split.
// Line-synced and static rows are plain text that follows the line's state.

// Whether this apply draws the romanization under each line.
export const RomanizeUnderLine = (useRomanized: boolean): boolean =>
  useRomanized && $romanizationDisplay.get() === "underLine";

interface RomanizedPiece {
  HTMLElement: HTMLElement;
  StartTime: number;
  EndTime: number;
  // Last position written, so an unchanged piece isn't written every frame.
  Position: number;
}

const timedRows = new WeakMap<HTMLElement, RomanizedPiece[]>();

const hasRomanization = (entry: any): boolean => HasLyricsText(entry?.TransliteratedText);

// Text without spacing or case, to spot a romanization that only repeats the line.
const bare = (text: string): string => StripZeroWidth(text).replace(/\s+/g, "").toLowerCase();

function createRow(beforeBackground: boolean): HTMLDivElement {
  const row = document.createElement("div");
  row.classList.add("RomanizedRow");
  if (beforeBackground) row.classList.add("BeforeBackground");
  return row;
}

// Appends the row for one lead or background line of syllable lyrics. Built
// from the syllables as sung, before any joining, with the word breaks of the
// romanization: a syllable glued to the next stays glued unless either side of
// the seam is a space.
export function AppendSyllableRomanization(
  lineElem: HTMLElement,
  syllables: any[],
  beforeBackground = false
): void {
  if (!syllables.some(hasRomanization)) return;
  const original = syllables.map((s) => (typeof s.Text === "string" ? s.Text : "")).join("");
  if (!HasLyricsText(original)) return;

  const row = createRow(beforeBackground);
  row.classList.add("Timed");
  const pieces: RomanizedPiece[] = [];
  let shown = "";
  let gluedToPrevious = false;

  for (const syllable of syllables) {
    const raw = StripZeroWidth(
      typeof syllable.TransliteratedText === "string" ? syllable.TransliteratedText : (syllable.Text ?? "")
    );
    const text = raw.trim();
    const startsWord = !gluedToPrevious || /^\s/.test(raw);
    const partOfWord = syllable.TransliteratedIsPartOfWord ?? syllable.IsPartOfWord;
    gluedToPrevious = !!partOfWord && !/\s$/.test(raw);
    if (text === "") continue;

    if (shown !== "" && startsWord) {
      row.appendChild(document.createTextNode(" "));
      shown += " ";
    }
    const piece = document.createElement("span");
    piece.classList.add("RomanizedPiece");
    piece.textContent = text;
    row.appendChild(piece);
    shown += text;
    pieces.push({
      HTMLElement: piece,
      StartTime: ConvertTime(syllable.StartTime),
      EndTime: ConvertTime(syllable.EndTime),
      Position: NaN,
    });
  }

  if (pieces.length === 0 || bare(shown) === bare(original)) return;
  lineElem.appendChild(row);
  timedRows.set(lineElem, pieces);
}

// Appends the plain row for a line-synced or static line.
export function AppendLineRomanization(lineElem: HTMLElement, entry: any): void {
  if (!hasRomanization(entry) || !HasLyricsText(entry?.Text)) return;
  const text = StripZeroWidth(entry.TransliteratedText).replace(/\s+/g, " ").trim();
  if (bare(text) === bare(entry.Text)) return;
  const row = createRow(false);
  row.textContent = text;
  lineElem.appendChild(row);
}

// Called each frame for an active syllable line: lights each piece over its
// syllable, on the same -20% to 100% scale as the line's own words.
export function UpdateRomanizedRow(lineElem: HTMLElement, position: number): void {
  const pieces = timedRows.get(lineElem);
  if (!pieces) return;
  for (const piece of pieces) {
    const duration = piece.EndTime - piece.StartTime;
    const progress =
      position <= piece.StartTime
        ? 0
        : position >= piece.EndTime || duration <= 0
          ? 1
          : (position - piece.StartTime) / duration;
    const value = Math.round((-20 + 120 * progress) * 10) / 10;
    if (value === piece.Position) continue;
    piece.Position = value;
    piece.HTMLElement.style.setProperty("--RomanizedPosition", `${value}%`);
  }
}
