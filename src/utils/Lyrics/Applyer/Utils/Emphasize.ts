import { $simpleLyricsMode } from "../../../../utils/stores.ts";
import { ArabicPersianRegex } from "../../../Addons.ts";
import { IdleEmphasisLyricsScale } from "../../Animator/Shared.ts";
import { ConvertTime } from "../../ConvertTime.ts";
import { CurrentLineLyricsObject, LyricsObject } from "../../lyrics.ts";

const Substractions = {
  StartTime: $simpleLyricsMode.get() ? -21 : 0,
  EndTime: $simpleLyricsMode.get() ? -40 : 250,
};

interface LetterData {
  HTMLElement: HTMLElement;
  StartTime: number;
  EndTime: number;
  TotalTime: number;
  Emphasis: boolean;
  BGLetter?: boolean;
}

export default function Emphasize(
  letters: Array<string>,
  applyTo: HTMLElement,
  lead: any,
  isBgWord: boolean = false
) {
  const StartTime = ConvertTime(lead.StartTime) - Substractions.StartTime;
  const EndTime = ConvertTime(lead.EndTime) - Substractions.EndTime;
  const totalDuration = EndTime - StartTime;
  const letterDuration = totalDuration / letters.length; // Duration per letter
  const word = applyTo;
  const Letters: LetterData[] = [];

  letters.forEach((letter, index) => {
    const letterElem = document.createElement("span");
    letterElem.textContent = letter;
    letterElem.classList.add("letter");
    letterElem.classList.add("Emphasis");
    const isLastLetter = index === letters.length - 1;
    // Calculate start and end time for each letter
    const letterStartTime = StartTime + index * letterDuration;
    const letterEndTime = letterStartTime + letterDuration;

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

    if (!$simpleLyricsMode.get()) {
      letterElem.style.setProperty("--gradient-position", `-20%`);
    }
    letterElem.style.setProperty("--text-shadow-opacity", `0%`);
    letterElem.style.setProperty("--text-shadow-blur-radius", `4px`);
    letterElem.style.scale = IdleEmphasisLyricsScale.toString();
    letterElem.style.transform = `translateY(calc(var(--DefaultLyricsSize) * 0.02))`;

    word.appendChild(letterElem);
  });

  word.classList.add("letterGroup");

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
      ...mcont,
    });
  } else {
    console.warn(
      "Cannot add letter group: CurrentLineLyricsObject is invalid or Syllables.Lead doesn't exist"
    );
  }

  // No need to reset Letters as it's a local constant
}
