import { $simpleLyricsMode } from "../../../../utils/stores.ts";

const Simple = (letterLength: number, totalDuration: number) => {
  const minDuration = 1000;

  return totalDuration >= minDuration;
};

const SimpleLyricsModeCapable = (letterLength: number, totalDuration: number) => {
  if (letterLength > 12) {
    return false;
  }

  const minDuration = 1050;
  //const maxDuration = 8550;

  return totalDuration >= minDuration; // && totalDuration <= maxDuration;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _Complex = (letterLength: number, totalDuration: number) => {
  // Enforce a maximum letter length of 12
  if (letterLength > 12) {
    return false;
  }

  // Calculate the minimum duration based on the letter length
  const minDuration = 1000 + ((letterLength - 1) / 1) * 25; // Increases duration as letter length increases

  // Return whether the letter length and duration meet the criteria
  return totalDuration >= minDuration;
};

export function IsLetterCapable(letterLength: number, totalDuration: number) {
  return $simpleLyricsMode.get()
    ? SimpleLyricsModeCapable(letterLength, totalDuration)
    : Simple(letterLength, totalDuration);
}
