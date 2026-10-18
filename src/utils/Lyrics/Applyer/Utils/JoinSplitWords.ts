import { ConvertTime } from "../../ConvertTime.ts";
import { HasLyricsText } from "../../EmptyLines.ts";

interface JoinableSyllable {
  Text: string;
  TransliteratedText?: string;
  StartTime: number;
  EndTime: number;
  IsPartOfWord?: boolean;
}

// Silence between two parts of a word beyond which one fill would run through it.
const MaxJoinGapMs = 100;
// A part sung this many times faster or slower per character than the word as a
// whole stays split, since a joined word fills at one steady pace.
const MaxPaceRatio = 3;

const HasSpace = (text: string | undefined): boolean => text !== undefined && /\s/.test(text);
// "Ah-" "ah-" "ah": a trailing dash marks a deliberate break, so the parts stay apart.
const EndsWithDash = (text: string): boolean => /[-‐-―]$/.test(text);
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

function canJoin(run: JoinableSyllable[]): boolean {
  if (!run.every((part) => HasLyricsText(part.Text) && !HasSpace(part.Text) && !HasSpace(part.TransliteratedText))) {
    return false;
  }

  if (run.slice(0, -1).some((part) => EndsWithDash(part.Text))) return false;
  if (run.some((part) => UnspacedScript.test(part.Text))) return false;

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
  };
}

// Puts the parts of a split word back into one syllable. A word that
// doesn't join cleanly (a gap, an uneven pace, a space inside) stays split.
export function JoinSplitWords<T extends JoinableSyllable>(syllables: T[]): T[] {
  const joined: T[] = [];

  for (let i = 0; i < syllables.length; i++) {
    let end = i;
    while (syllables[end].IsPartOfWord && end + 1 < syllables.length) end++;

    const run = syllables.slice(i, end + 1);
    if (run.length > 1 && canJoin(run)) {
      joined.push(join(run));
    } else {
      joined.push(...run);
    }
    i = end;
  }

  return joined;
}
