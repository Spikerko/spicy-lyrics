// deno-lint-ignore-file no-explicit-any

import { StripZeroWidth } from "./Applyer/Utils/StripZeroWidth.ts";

export const HasLyricsText = (text: unknown): boolean =>
  typeof text === "string" && StripZeroWidth(text).trim() !== "";

// A line or syllable earns its place if *any* of the forms we can render carries
// text. TTML keeps `x-roman` in `TransliteratedText`, so an entry whose source
// text is empty but whose romanization isn't still shows up in the romanized
// view — dropping it would blank out that view.
export const HasRenderableText = (entry: any): boolean =>
  HasLyricsText(entry?.Text) || HasLyricsText(entry?.TransliteratedText);

export const IsEmptySyllableGroup = (group: any): boolean =>
  !Array.isArray(group?.Syllables) ||
  !group.Syllables.some((syllable: any) => HasRenderableText(syllable));

export const IsEmptyLyricsLine = (line: any): boolean => {
  if (line?.Lead !== undefined || line?.Background !== undefined) {
    return (
      IsEmptySyllableGroup(line.Lead) &&
      !(Array.isArray(line.Background)
        ? line.Background.some((background: any) => !IsEmptySyllableGroup(background))
        : false)
    );
  }
  return !HasRenderableText(line);
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
        line.Lead.Syllables = line.Lead.Syllables.filter(HasRenderableText);
      }

      if (Array.isArray(line?.Background)) {
        line.Background = line.Background
          .filter((background: any) => !IsEmptySyllableGroup(background))
          .map((background: any) => {
            background.Syllables = background.Syllables.filter(HasRenderableText);
            return background;
          });

        if (line.Background.length === 0) delete line.Background;
      }
    }
  }
};

// True when nothing renderable is left in a payload — most often because
// pruning emptied out a response the API still considered a hit. Shapes we
// don't recognise (no `Lines`, no `Content`) are left alone rather than
// reported as empty.
export const IsEmptyLyrics = (lyrics: any): boolean => {
  if (!lyrics || typeof lyrics !== "object") return true;

  const lines = Array.isArray(lyrics.Lines) ? lyrics.Lines : undefined;
  const content = Array.isArray(lyrics.Content) ? lyrics.Content : undefined;
  if (lines === undefined && content === undefined) return false;

  return (lines?.length ?? 0) === 0 && (content?.length ?? 0) === 0;
};
