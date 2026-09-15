// deno-lint-ignore-file no-explicit-any

import { StripZeroWidth } from "./Applyer/Utils/StripZeroWidth.ts";

export const HasLyricsText = (text: unknown): boolean =>
  typeof text === "string" && StripZeroWidth(text).trim() !== "";

export const IsEmptySyllableGroup = (group: any): boolean =>
  !Array.isArray(group?.Syllables) ||
  !group.Syllables.some((syllable: any) => HasLyricsText(syllable?.Text));

export const IsEmptyLyricsLine = (line: any): boolean => {
  if (line?.Lead !== undefined || line?.Background !== undefined) {
    return (
      IsEmptySyllableGroup(line.Lead) &&
      !(Array.isArray(line.Background)
        ? line.Background.some((background: any) => !IsEmptySyllableGroup(background))
        : false)
    );
  }
  return !HasLyricsText(line?.Text);
};

export const RemoveEmptyLyricsLines = <T>(lines: T[] | undefined | null): T[] =>
  Array.isArray(lines) ? lines.filter((line) => !IsEmptyLyricsLine(line)) : [];

export const StripEmptyLyricsLines = (lyrics: any): void => {
  if (!lyrics || typeof lyrics !== "object") return;

  if (Array.isArray(lyrics.Lines)) {
    lyrics.Lines = RemoveEmptyLyricsLines(lyrics.Lines);
  }

  if (Array.isArray(lyrics.Content)) {
    lyrics.Content = RemoveEmptyLyricsLines(lyrics.Content);

    for (const line of lyrics.Content) {
      if (Array.isArray(line?.Lead?.Syllables)) {
        line.Lead.Syllables = line.Lead.Syllables.filter((syllable: any) =>
          HasLyricsText(syllable?.Text)
        );
      }

      if (Array.isArray(line?.Background)) {
        line.Background = line.Background
          .filter((background: any) => !IsEmptySyllableGroup(background))
          .map((background: any) => {
            background.Syllables = background.Syllables.filter((syllable: any) =>
              HasLyricsText(syllable?.Text)
            );
            return background;
          });

        if (line.Background.length === 0) delete line.Background;
      }
    }
  }
};
