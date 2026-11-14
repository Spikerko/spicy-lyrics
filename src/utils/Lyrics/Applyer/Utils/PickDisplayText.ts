// deno-lint-ignore-file no-explicit-any

import { HasLyricsText } from "../../EmptyLines.ts";

// Which of an entry's two texts to render.
//
// Normally that is simply the romanization when the romanized view is on and
// the original otherwise, but either one can be missing: TTML lines carrying
// only an `x-roman` span have no source text at all, and most lines have no
// romanization. Whichever side is absent falls back to the other so a line we
// kept because it has *some* text never renders blank.
export function PickDisplayText(entry: any, useRomanized: boolean): string {
  const original = entry?.Text;
  const romanized = entry?.TransliteratedText;

  if (useRomanized && romanized !== undefined) return romanized;
  if (HasLyricsText(original)) return original;
  return HasLyricsText(romanized) ? romanized : (original ?? "");
}

// Whether the next syllable continues this one's word, judged on the text that
// renders. IsPartOfWord describes the original script, where Japanese or
// Chinese has no gaps at all, so a syllable shown from its romanization reads
// TransliteratedIsPartOfWord instead and falls back when it isn't there.
export function PickPartOfWord(entry: any, useRomanized: boolean): boolean {
  if (useRomanized && entry?.TransliteratedText !== undefined) {
    return !!(entry.TransliteratedIsPartOfWord ?? entry.IsPartOfWord);
  }
  return !!entry?.IsPartOfWord;
}

export default PickDisplayText;
