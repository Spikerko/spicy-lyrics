// deno-lint-ignore-file no-explicit-any

const Han = /\p{Script=Han}/u;

/**
 * One reading per character of `text`: Han characters in pinyin with tone
 * marks, everything else as written. Each run of Han characters is read as a
 * whole with word segmentation, so a character with several readings takes
 * the one its word uses (行走 → xíng, 银行 → háng, 长大 → zhǎng).
 */
export const ChineseCharReadings = (text: string, pinyin: any): string[] => {
  const chars = text.split("");
  if (!pinyin?.pinyin) return chars;
  const readings = [...chars];
  for (const match of text.matchAll(/\p{Script=Han}+/gu)) {
    const run = match[0];
    const at = match.index ?? 0;
    let result: string[] | undefined;
    try {
      const segmented: string[][] = pinyin.pinyin(run, { segment: true, group: false });
      // Each entry must be one character's reading, or the readings can't be placed.
      if (segmented.length === run.length) result = segmented.map((r) => r[0]);
    } catch {
      result = undefined;
    }
    result ??= run.split("").map((c) => pinyin.pinyin(c, { segment: false })[0]?.[0] ?? c);
    result.forEach((reading, i) => (readings[at + i] = reading));
  }
  return readings;
};

/** Pinyin for a piece of text, one reading per Han character, spaced apart. */
export const JoinChineseReadings = (chars: string[], readings: string[]): string => {
  let out = "";
  chars.forEach((c, i) => {
    const reading = readings[i];
    const prev = chars[i - 1];
    // Han readings are spaced from each other and from the words beside them.
    if (
      i > 0 &&
      (Han.test(c) || Han.test(prev)) &&
      /[\p{L}\p{N}]/u.test(prev) &&
      /[\p{L}\p{N}]/u.test(c)
    ) {
      out += " ";
    }
    out += reading;
  });
  return out;
};

export const IsHan = (c: string | undefined) => c !== undefined && Han.test(c);
