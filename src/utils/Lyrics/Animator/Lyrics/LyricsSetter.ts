import Defaults from "../../../../components/Global/Defaults.ts";
import { LyricsObject, type LyricsType } from "../../lyrics.ts";
import { timeOffset } from "../Shared.ts";

// Extend the LyricsType to include "None"
type ExtendedLyricsType = LyricsType | "None";

// Define a type for the word/syllable status
type ElementStatus = "NotSung" | "Active" | "Sung";

// Define interfaces for the objects we're working with
interface _SyllableLead {
  HTMLElement: HTMLElement;
  StartTime: number;
  EndTime: number;
  Status?: ElementStatus;
  [key: string]: any;
}

function getElementStatus(
  currentTime: number,
  startTime: number,
  endTime: number
): ElementStatus {
  if (currentTime < startTime) return "NotSung";
  if (currentTime >= endTime) return "Sung";
  return "Active";
}

export function TimeSetter(PreCurrentPosition: number): void {
  const CurrentPosition = PreCurrentPosition + timeOffset;
  const CurrentLyricsType = Defaults.CurrentLyricsType as ExtendedLyricsType;

  if (!CurrentLyricsType || CurrentLyricsType === "None") return;

  // Type assertion to ensure we can index with CurrentLyricsType
  const lines = LyricsObject.Types[CurrentLyricsType as LyricsType].Lines;

  if (CurrentLyricsType === "Syllable") {
    for (let i = 0; i < lines.length; i++) {
      // Type assertion for the line
      const line = lines[i] as any;

      const lineTimes = {
        start: line.StartTime,
        end: line.EndTime,
        total: line.EndTime - line.StartTime,
      };

      if (getElementStatus(CurrentPosition, lineTimes.start, lineTimes.end) === "Active") {
        line.Status = "Active";

        // Check if Syllables exists
        if (!line.Syllables?.Lead) continue;

        const words = line.Syllables.Lead;
        for (let j = 0; j < words.length; j++) {
          const word = words[j];
          word.Status = getElementStatus(CurrentPosition, word.StartTime, word.EndTime);

          if (word?.LetterGroup) {
            for (let k = 0; k < word.Letters.length; k++) {
              const letter = word.Letters[k];
              letter.Status = getElementStatus(CurrentPosition, letter.StartTime, letter.EndTime);
            }
          }
        }
      } else if (lineTimes.start > CurrentPosition) {
        line.Status = "NotSung";

        // Check if Syllables exists
        if (!line.Syllables?.Lead) continue;

        const words = line.Syllables.Lead;
        for (let j = 0; j < words.length; j++) {
          const word = words[j];
          word.Status = "NotSung";

          if (word?.LetterGroup) {
            for (let k = 0; k < word.Letters.length; k++) {
              const letter = word.Letters[k];
              letter.Status = "NotSung";
            }
          }
        }
      } else if (lineTimes.end <= CurrentPosition) {
        line.Status = "Sung";

        // Check if Syllables exists
        if (!line.Syllables?.Lead) continue;

        const words = line.Syllables.Lead;
        for (let j = 0; j < words.length; j++) {
          const word = words[j];
          word.Status = "Sung";

          if (word?.LetterGroup) {
            for (let k = 0; k < word.Letters.length; k++) {
              const letter = word.Letters[k];
              letter.Status = "Sung";
            }
          }
        }
      }
    }
  } else if (CurrentLyricsType === "Line") {
    for (let i = 0; i < lines.length; i++) {
      // Type assertion for the line
      const line = lines[i] as any;

      const lineTimes = {
        start: line.StartTime,
        end: line.EndTime,
        total: line.EndTime - line.StartTime,
      };

      if (getElementStatus(CurrentPosition, lineTimes.start, lineTimes.end) === "Active") {
        line.Status = "Active";
        if (line.DotLine) {
          const leads = line.Syllables.Lead;
          for (let i = 0; i < leads.length; i++) {
            const dot = leads[i];
            dot.Status = getElementStatus(CurrentPosition, dot.StartTime, dot.EndTime);
          }
        }
      } else if (lineTimes.start > CurrentPosition) {
        line.Status = "NotSung";
        if (line.DotLine) {
          const leads = line.Syllables.Lead;
          for (let i = 0; i < leads.length; i++) {
            const dot = leads[i];
            dot.Status = "NotSung";
          }
        }
      } else if (lineTimes.end <= CurrentPosition) {
        line.Status = "Sung";
        if (line.DotLine) {
          const leads = line.Syllables.Lead;
          for (let i = 0; i < leads.length; i++) {
            const dot = leads[i];
            dot.Status = "Sung";
          }
        }
      }
    }
  }
}
