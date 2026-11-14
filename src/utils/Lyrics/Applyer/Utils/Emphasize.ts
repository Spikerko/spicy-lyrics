import { isBloomRenderer } from "../../../../utils/stores.ts";
import { ArabicPersianRegex } from "../../../Addons.ts";
import { IdleEmphasisLyricsScale } from "../../Animator/Shared.ts";
import { ConvertTime } from "../../ConvertTime.ts";
import { CurrentLineLyricsObject, LyricsObject } from "../../lyrics.ts";

// Read when the lyrics are built, so a style change applies on the rebuild.
const getSubstractions = () => ({
  StartTime: isBloomRenderer() ? -21 : 0,
  EndTime: isBloomRenderer() ? -40 : 250,
});

// Bloom: how much sooner an emphasized word's letters finish
// than the word is sung, in ms. This is the emphasis' total length: shortening
// it brings the whole fill and lift forward. A word is never cut below
// RefreshedEmphasisMinShare of its length, so short words keep their emphasis.
export const RefreshedEmphasisTrimMs = 0;
export const RefreshedEmphasisMinShare = 0.5;

interface LetterData {
  HTMLElement: HTMLElement;
  StartTime: number;
  EndTime: number;
  TotalTime: number;
  Emphasis: boolean;
  BGLetter?: boolean;
}

// One of the syllables a joined word was made from: when it starts, and how
// many of the word's letters are its own.
export interface SyllablePart {
  StartTime: number;
  Letters: number;
}

// Each letter's [start, end]. Even over the word by default; given its
// syllables, each syllable's letters are spread over that syllable alone,
// running until the next one starts, so a long "per" and a quick "fect" keep
// their pace. The syllables' times are scaled into the word's window, which
// may be shifted or trimmed from its sung times.
function letterTimes(
  count: number,
  start: number,
  end: number,
  lead: any,
  parts?: SyllablePart[]
): Array<[number, number]> {
  const spread = (n: number, from: number, to: number): Array<[number, number]> =>
    Array.from({ length: n }, (_, i) => [from + (i * (to - from)) / n, from + ((i + 1) * (to - from)) / n]);
  if (!parts) return spread(count, start, end);

  const sungStart = ConvertTime(lead.StartTime);
  const scale = (end - start) / Math.max(1, ConvertTime(lead.EndTime) - sungStart);
  const times: Array<[number, number]> = [];
  let cursor = start;
  parts.forEach((part, i) => {
    const next = parts[i + 1];
    const partEnd = next
      ? Math.min(end, Math.max(cursor, start + (ConvertTime(next.StartTime) - sungStart) * scale))
      : end;
    times.push(...spread(part.Letters, cursor, partEnd));
    cursor = partEnd;
  });
  return times;
}

// Bloom: a word sung in several syllables swells as one. Each syllable keeps
// its own letters and fill, and they all read their swell off this shared
// group: every letter of the word in order, timed from the first syllable's
// start to the last one's end.
export interface FlameGroup {
  Letters: LetterData[];
  StartTime: number;
  EndTime: number;
}

export function createFlameGroup(startTime: number, endTime: number): FlameGroup {
  const s = getSubstractions();
  return {
    Letters: [],
    StartTime: ConvertTime(startTime) - s.StartTime,
    EndTime: ConvertTime(endTime) - s.EndTime,
  };
}

export default function Emphasize(
  letters: Array<string>,
  applyTo: HTMLElement,
  lead: any,
  isBgWord: boolean = false,
  parts?: SyllablePart[],
  flameGroup: FlameGroup | null = null
) {
  const Substractions = getSubstractions();
  const StartTime = ConvertTime(lead.StartTime) - Substractions.StartTime;
  let EndTime = ConvertTime(lead.EndTime) - Substractions.EndTime;
  const refreshed = isBloomRenderer();
  if (refreshed) {
    const sung = EndTime - StartTime;
    EndTime = StartTime + Math.max(sung - RefreshedEmphasisTrimMs, sung * RefreshedEmphasisMinShare);
  }
  const totalDuration = EndTime - StartTime;
  const times = letterTimes(letters.length, StartTime, EndTime, lead, parts);
  const word = applyTo;
  const Letters: LetterData[] = [];
  const FlameOffset = flameGroup?.Letters.length ?? 0;

  letters.forEach((letter, index) => {
    const letterElem = document.createElement("span");
    letterElem.textContent = letter;
    letterElem.classList.add("letter");
    letterElem.classList.add("Emphasis");
    // Whitespace inside an inline-block collapses to a 0px box, which glues
    // multi-word syllables ("Watch this") together. Tag it so CSS can size it.
    if (letter.trim().length === 0) {
      letterElem.classList.add("SpaceLetter");
    }
    const isLastLetter = index === letters.length - 1;
    const [letterStartTime, letterEndTime] = times[index];
    const letterDuration = letterEndTime - letterStartTime;

    //const contentDuration = letterDuration > 150 ? letterDuration : 150;
    //letterElem.style.setProperty("--content-duration", `${contentDuration}ms`);

    if (isLastLetter) {
      letterElem.classList.add("LastLetterInWord");
    }

    if (ArabicPersianRegex.test(lead.Text)) {
      word.setAttribute("font", "Vazirmatn");
    }

    const mcont = isBgWord
      ? {
          BGLetter: true,
        }
      : {};

    Letters.push({
      HTMLElement: letterElem,
      StartTime: letterStartTime,
      EndTime: letterEndTime,
      TotalTime: letterDuration,
      Emphasis: true,
      ...mcont,
    });

    if (!isBloomRenderer()) {
      letterElem.style.setProperty("--gradient-position", `-20%`);
    }
    letterElem.style.setProperty("--text-shadow-opacity", `0%`);
    letterElem.style.setProperty("--text-shadow-blur-radius", `4px`);
    // Refreshed letters rest level and at full size. Starting them at the old
    // idle pose made them snap up in one frame when their line went active.
    if (!refreshed) {
      letterElem.style.scale = IdleEmphasisLyricsScale.toString();
      letterElem.style.transform = `translateY(calc(var(--DefaultLyricsSize) * 0.02))`;
    }

    word.appendChild(letterElem);
  });

  word.classList.add("letterGroup");
  flameGroup?.Letters.push(...Letters);

  const mcont = isBgWord
    ? {
        BGWord: true,
      }
    : {};

  // Make sure CurrentLineLyricsObject is valid and Syllables.Lead exists
  if (
    CurrentLineLyricsObject >= 0 &&
    LyricsObject.Types.Syllable.Lines?.[CurrentLineLyricsObject].Syllables
  ) {
    LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject].Syllables.Lead.push({
      HTMLElement: word,
      StartTime: StartTime,
      EndTime: EndTime,
      TotalTime: totalDuration,
      LetterGroup: true,
      Letters,
      ...(parts ? { Paced: true } : {}),
      ...(flameGroup ? { FlameGroup: flameGroup, FlameOffset } : {}),
      ...mcont,
    });
  } else {
    console.warn(
      "Cannot add letter group: CurrentLineLyricsObject is invalid or Syllables.Lead doesn't exist"
    );
  }

  // No need to reset Letters as it's a local constant
}
