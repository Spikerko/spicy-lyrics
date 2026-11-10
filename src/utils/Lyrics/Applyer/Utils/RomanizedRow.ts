// deno-lint-ignore-file no-explicit-any

import { $romanizationDisplay, $simpleLyricsMode, $syllableMerge } from "../../../stores.ts";
import { JoinSplitWords } from "./JoinSplitWords.ts";
import { PickDisplayText } from "./PickDisplayText.ts";
import { isExperimentEnabled } from "../../../experiments.ts";
import { IdleEmphasisLyricsScale, IdleLyricsScale } from "../../Animator/Shared.ts";
import { ConvertTime } from "../../ConvertTime.ts";
import { HasLyricsText } from "../../EmptyLines.ts";
import isRtl from "../../isRtl.ts";
import { IsLetterCapable, MinLetterCapableDuration } from "./IsLetterCapable.ts";
import { SplitLetters } from "./SplitLetters.ts";
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
  // Last position and state written, so an unchanged piece isn't written every frame.
  Position: number;
  State: string;
  Glow: number;
  // Animated rows experiment: a held piece's letters, and the window they span.
  Letters?: { HTMLElement: HTMLElement; StartTime: number; EndTime: number }[];
  LettersStart?: number;
  LettersEnd?: number;
}

const timedRows = new WeakMap<HTMLElement, RomanizedPiece[]>();

const hasRomanization = (entry: any): boolean => HasLyricsText(entry?.TransliteratedText);

// Text without spacing, case or parentheses, to spot a romanization that only
// repeats the line (a background vocal's is shown without its parentheses).
const bare = (text: string): string => StripZeroWidth(text).replace(/[\s()]+/g, "").toLowerCase();

function createRow(beforeBackground: boolean): HTMLDivElement {
  const row = document.createElement("div");
  row.classList.add("RomanizedRow");
  if (beforeBackground) row.classList.add("BeforeBackground");
  return row;
}

// Join Split Words' "held" test as the line above applies it: the word, as the
// line shows it, is held long enough to be drawn letter by letter.
function drawnLetterByLetter(word: any): boolean {
  const duration = ConvertTime(word.EndTime) - ConvertTime(word.StartTime);
  if (duration < MinLetterCapableDuration()) return false;
  const text = StripZeroWidth(PickDisplayText(word, false));
  const letters = SplitLetters(text);
  return letters.length > 0 && IsLetterCapable(letters.length, duration) && !isRtl(text);
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
  // Glued syllables share a word span, so a row whose pieces move on their own
  // (the animated rows experiment) still never breaks inside a word.
  let word: HTMLSpanElement | null = null;

  // The same words the line above joins (Join Split Words) are one piece here,
  // timed over the whole word.
  const merge = $syllableMerge.get();
  const units = merge === "off" ? syllables : JoinSplitWords(syllables, merge, drawnLetterByLetter);

  for (const syllable of units) {
    const raw = StripZeroWidth(
      typeof syllable.TransliteratedText === "string" ? syllable.TransliteratedText : (syllable.Text ?? "")
    );
    const text = raw.trim();
    const startsWord = !gluedToPrevious || /^\s/.test(raw);
    const last = syllable.Parts ? syllable.Parts[syllable.Parts.length - 1] : syllable;
    const partOfWord = last.TransliteratedIsPartOfWord ?? last.IsPartOfWord;
    gluedToPrevious = !!partOfWord && !/\s$/.test(raw);
    if (text === "") continue;

    if (shown !== "" && startsWord) {
      row.appendChild(document.createTextNode(" "));
      shown += " ";
    }
    if (!word || startsWord) {
      word = document.createElement("span");
      word.classList.add("RomanizedWord");
      row.appendChild(word);
    }
    const piece = document.createElement("span");
    piece.classList.add("RomanizedPiece");
    piece.textContent = text;
    word.appendChild(piece);
    shown += text;
    pieces.push({
      HTMLElement: piece,
      StartTime: ConvertTime(syllable.StartTime),
      EndTime: ConvertTime(syllable.EndTime),
      Position: NaN,
      State: "",
      Glow: 0,
    });
  }

  if (pieces.length === 0 || bare(shown) === bare(original)) return;
  if (isExperimentEnabled("animatedUnderRows")) for (const piece of pieces) prepareAnimatedPiece(piece);
  lineElem.appendChild(row);
  timedRows.set(lineElem, pieces);
}

// Animated Romanization and Translation (experiment): a piece is animated like
// a word of the line above (LyricsAnimator.ts), so it starts from a word's
// resting style, and one held long enough to go letter by letter above is
// split into letters the same way (Emphasize.ts: the same test, timing and
// resting pose), with lift and glow scaled to the row's size.
export const ROMANIZED_ROW_SIZE = 0.6;

function rest(el: HTMLElement, scale: number, lift: number): void {
  if ($simpleLyricsMode.get()) return;
  el.style.setProperty("--gradient-position", "-20%");
  el.style.setProperty("--text-shadow-opacity", "0%");
  el.style.setProperty("--text-shadow-blur-radius", `${4 * ROMANIZED_ROW_SIZE}px`);
  el.style.scale = String(scale);
  el.style.transform = `translateY(calc(var(--DefaultLyricsSize) * ${lift * ROMANIZED_ROW_SIZE}))`;
}

function prepareAnimatedPiece(piece: RomanizedPiece): void {
  const el = piece.HTMLElement;
  const text = el.textContent ?? "";
  const letters = SplitLetters(text);
  const duration = piece.EndTime - piece.StartTime;
  const held =
    letters.length > 0 &&
    duration >= MinLetterCapableDuration() &&
    IsLetterCapable(letters.length, duration) &&
    !isRtl(text);
  if (!held) {
    rest(el, IdleLyricsScale, 0.01);
    return;
  }

  rest(el, IdleEmphasisLyricsScale, 0.02);
  // Emphasize's window: letters finish a little before the syllable does.
  const simple = $simpleLyricsMode.get();
  const start = piece.StartTime + (simple ? 21 : 0);
  const end = Math.max(start + 1, piece.EndTime - (simple ? -40 : 250));
  const span = (end - start) / letters.length;
  el.textContent = "";
  el.classList.add("HasLetters");
  piece.Letters = letters.map((letter, k) => {
    const letterEl = document.createElement("span");
    letterEl.classList.add("RomanizedLetter");
    letterEl.textContent = letter;
    rest(letterEl, IdleEmphasisLyricsScale, 0.02);
    el.appendChild(letterEl);
    return { HTMLElement: letterEl, StartTime: start + span * k, EndTime: start + span * (k + 1) };
  });
  piece.LettersStart = start;
  piece.LettersEnd = end;
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

// The timed pieces of a line's syllable row, for the animated rows experiment.
export const GetRomanizedPieces = (
  lineElem: HTMLElement
): readonly Readonly<Omit<RomanizedPiece, "Position" | "State" | "Glow">>[] | undefined =>
  timedRows.get(lineElem);

// A lyric word's glow over its progress: up over the first 15%, held to 60%,
// gone by the end.
const glowAt = (progress: number): number =>
  progress <= 0 || progress >= 1 ? 0 : progress < 0.15 ? progress / 0.15 : progress <= 0.6 ? 1 : (1 - progress) / 0.4;

// Called each frame for an active syllable line: lights each piece over its
// syllable, on the same -20% to 100% scale as the line's own words, sets its
// glow, and marks it PieceActive while sung and PieceSung after, for the other
// Romanization Highlight styles.
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
    const state = progress >= 1 ? "PieceSung" : position > piece.StartTime ? "PieceActive" : "";
    if (state !== piece.State) {
      if (piece.State !== "") piece.HTMLElement.classList.remove(piece.State);
      if (state !== "") piece.HTMLElement.classList.add(state);
      piece.State = state;
    }
    const glow = Math.round(glowAt(progress) * 50) / 50;
    if (glow !== piece.Glow) {
      piece.Glow = glow;
      piece.HTMLElement.style.setProperty("--RomanizedGlow", String(glow));
    }
    const value = Math.round((-20 + 120 * progress) * 10) / 10;
    if (value === piece.Position) continue;
    piece.Position = value;
    piece.HTMLElement.style.setProperty("--RomanizedPosition", `${value}%`);
  }
}
