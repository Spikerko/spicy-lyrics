import { ConvertTime } from "../../ConvertTime.ts";
import { HasLyricsText } from "../../EmptyLines.ts";
import type { SyllableMerge } from "../../../stores.ts";

interface JoinableSyllable {
  Text: string;
  TransliteratedText?: string;
  StartTime: number;
  EndTime: number;
  IsPartOfWord?: boolean;
  Parts?: JoinableSyllable[];
  TransliteratedIsPartOfWord?: boolean;
}

// Silence between two parts of a word beyond which one fill would run through it.
const MaxJoinGapMs = 100;
// A part sung this many times faster or slower per character than the word as a
// whole stays split, since a joined word fills at one steady pace.
const MaxPaceRatio = 3;

const HasSpace = (text: string | undefined): boolean => text !== undefined && /\s/.test(text);
// A dash or slash between two parts ends a word there: "tea" "ry-" "eyed" is
// "teary-" then "eyed", and "Ah-" "ah-" "ah" stays three.
const StartsNewWord = (prev: JoinableSyllable, next: JoinableSyllable): boolean =>
  /[-‐-―/]$/.test(prev.Text) || /^[-‐-―/]/.test(next.Text);
// Scripts written without spaces: there the parts of a "word" can run the whole
// line, which would join into one, so they stay as they were timed.
const UnspacedScript =
  /[\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Thai}\p{scx=Lao}\p{scx=Khmer}\p{scx=Myanmar}]/u;

function paceIsEven(run: JoinableSyllable[]): boolean {
  const duration = ConvertTime(run[run.length - 1].EndTime) - ConvertTime(run[0].StartTime);
  const chars = run.reduce((sum, part) => sum + part.Text.length, 0);
  if (duration <= 0 || chars === 0) return false;

  return run.every((part) => {
    const timeShare = (ConvertTime(part.EndTime) - ConvertTime(part.StartTime)) / duration;
    const charShare = part.Text.length / chars;
    return timeShare >= charShare / MaxPaceRatio && timeShare <= charShare * MaxPaceRatio;
  });
}

// Whether the run is one word at all: every mode leaves it split otherwise.
function isOneWord(run: JoinableSyllable[]): boolean {
  if (!run.every((part) => HasLyricsText(part.Text) && !HasSpace(part.Text) && !HasSpace(part.TransliteratedText))) {
    return false;
  }

  return !run.some((part) => UnspacedScript.test(part.Text));
}

function isSungSteadily(run: JoinableSyllable[]): boolean {
  for (let i = 1; i < run.length; i++) {
    if (ConvertTime(run[i].StartTime) - ConvertTime(run[i - 1].EndTime) > MaxJoinGapMs) return false;
  }
  return paceIsEven(run);
}

function join<T extends JoinableSyllable>(run: T[]): T {
  const first = run[0];
  const last = run[run.length - 1];
  const hasRomanization = run.some((part) => part.TransliteratedText !== undefined);

  return {
    ...first,
    Text: run.map((part) => part.Text).join(""),
    ...(hasRomanization
      ? { TransliteratedText: run.map((part) => part.TransliteratedText ?? part.Text).join("") }
      : {}),
    EndTime: Math.max(...run.map((part) => part.EndTime)),
    IsPartOfWord: last.IsPartOfWord,
    Parts: run,
    // Set from the last part even when it's undefined, so the first part's
    // value, which says the word goes on, doesn't survive the spread.
    TransliteratedIsPartOfWord: last.TransliteratedIsPartOfWord,
  };
}

// Puts the parts of a split word back into one syllable, the joined word keeping
// them as Parts. A word ends at a dash or slash between parts; one with a space
// inside or an unspaced script stays split in every mode. "full" joins every other word; "steady" only one
// sung without a gap and at an even pace; "held" only one keepJoined accepts
// (the caller's test for a word drawn letter by letter).
export function JoinSplitWords<T extends JoinableSyllable>(
  syllables: T[],
  mode: Exclude<SyllableMerge, "off">,
  keepJoined: (word: T) => boolean = () => true
): T[] {
  const joined: T[] = [];

  for (let i = 0; i < syllables.length; i++) {
    let end = i;
    while (
      syllables[end].IsPartOfWord &&
      end + 1 < syllables.length &&
      !StartsNewWord(syllables[end], syllables[end + 1])
    ) {
      end++;
    }

    const run = syllables.slice(i, end + 1);
    const word =
      run.length > 1 && isOneWord(run) && (mode !== "steady" || isSungSteadily(run)) ? join(run) : null;
    if (word && (mode !== "held" || keepJoined(word))) {
      joined.push(word);
    } else {
      joined.push(...run);
    }
    i = end;
  }

  return joined;
}
