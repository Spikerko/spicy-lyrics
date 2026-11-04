/**
 * Korean romanization by sound, Revised Romanization as it is said rather
 * than letter by letter (사랑해 → saranghae, 좋아 → joha, 신라 → silla). Each
 * block splits into jamo, and a final consonant reads by what follows it,
 * longest rule first: final + next initial + next vowel, then final + next
 * initial, then alone. When the final's rule already covers the next initial,
 * that initial isn't read again.
 *
 * The rules run over the whole line, so a final reads by the next block even
 * when the two are sung in different syllables (먹|는 → meong|neun).
 */

const CHO: Record<string, string> = {
  "ᄀ": "g", "ᄁ": "kk", "ᄂ": "n", "ᄃ": "d", "ᄄ": "tt", "ᄅ": "r", "ᄆ": "m",
  "ᄇ": "b", "ᄈ": "pp", "ᄉ": "s", "ᄊ": "ss", "ᄋ": "", "ᄌ": "j", "ᄍ": "jj",
  "ᄎ": "ch", "ᄏ": "k", "ᄐ": "t", "ᄑ": "p", "ᄒ": "h",
};

const JUNG: Record<string, string> = {
  "ᅡ": "a", "ᅢ": "ae", "ᅣ": "ya", "ᅤ": "yae", "ᅥ": "eo", "ᅦ": "e", "ᅧ": "yeo",
  "ᅨ": "ye", "ᅩ": "o", "ᅪ": "wa", "ᅫ": "wae", "ᅬ": "oe", "ᅭ": "yo", "ᅮ": "u",
  "ᅯ": "wo", "ᅰ": "we", "ᅱ": "wi", "ᅲ": "yu", "ᅳ": "eu", "ᅴ": "ui", "ᅵ": "i",
};

// Finals, alone and before the next block's initial (and vowel). ㅇ is the
// silent initial, so "ᆨᄋ" is ㄱ before a vowel; a final ㅎ there is silent
// (좋아 → joa, 괜찮아 → gwaenchana), and before ㄱ, ㄷ or ㅈ it
// aspirates them (좋다 → jota, 놓고 → noko).
const JONG: Record<string, string> = {
  "ᆨ": "k", "ᆨᄋ": "g", "ᆨᄂ": "ngn", "ᆨᄅ": "ngn", "ᆨᄆ": "ngm", "ᆨᄒ": "kh",
  "ᆩ": "kk", "ᆩᄋ": "kg", "ᆩᄂ": "ngn", "ᆩᄅ": "ngn", "ᆩᄆ": "ngm", "ᆩᄒ": "kh",
  "ᆪ": "k", "ᆪᄋ": "ks", "ᆪᄂ": "ngn", "ᆪᄅ": "ngn", "ᆪᄆ": "ngm", "ᆪᄒ": "kch",
  "ᆫ": "n", "ᆫᄅ": "ll",
  "ᆬ": "n", "ᆬᄋ": "nj", "ᆬᄂ": "nn", "ᆬᄅ": "nn", "ᆬᄆ": "nm", "ᆬᄒ": "nch",
  "ᆭ": "n", "ᆭᄋ": "n", "ᆭᄅ": "nn", "ᆭᄀ": "nk", "ᆭᄃ": "nt", "ᆭᄌ": "nch",
  "ᆮ": "t", "ᆮᄋ": "d", "ᆮᄂ": "nn", "ᆮᄅ": "nn", "ᆮᄆ": "nm", "ᆮᄒ": "th",
  "ᆯ": "l", "ᆯᄋ": "r", "ᆯᄂ": "ll",
  "ᆰ": "k", "ᆰᄋ": "lg", "ᆰᄂ": "ngn", "ᆰᄅ": "ngn", "ᆰᄆ": "ngm", "ᆰᄒ": "lkh",
  "ᆱ": "m", "ᆱᄋ": "lm", "ᆱᄂ": "mn", "ᆱᄅ": "mn", "ᆱᄆ": "mm", "ᆱᄒ": "lmh",
  "ᆲ": "p", "ᆲᄋ": "lb", "ᆲᄂ": "mn", "ᆲᄅ": "mn", "ᆲᄆ": "mm", "ᆲᄒ": "lph",
  "ᆳ": "t", "ᆳᄋ": "ls", "ᆳᄂ": "nn", "ᆳᄅ": "nn", "ᆳᄆ": "nm", "ᆳᄒ": "lsh",
  "ᆴ": "t", "ᆴᄋ": "lt", "ᆴᄂ": "nn", "ᆴᄅ": "nn", "ᆴᄆ": "nm", "ᆴᄒ": "lth",
  "ᆵ": "p", "ᆵᄋ": "lp", "ᆵᄂ": "mn", "ᆵᄅ": "mn", "ᆵᄆ": "mm", "ᆵᄒ": "lph",
  "ᆶ": "l", "ᆶᄋ": "r", "ᆶᄂ": "ll", "ᆶᄅ": "ll", "ᆶᄆ": "lm", "ᆶᄒ": "lh", "ᆶᄀ": "lk", "ᆶᄃ": "lt", "ᆶᄌ": "lch",
  "ᆷ": "m", "ᆷᄅ": "mn",
  "ᆸ": "p", "ᆸᄋ": "b", "ᆸᄂ": "mn", "ᆸᄅ": "mn", "ᆸᄆ": "mm", "ᆸᄒ": "ph",
  "ᆹ": "p", "ᆹᄋ": "ps", "ᆹᄂ": "mn", "ᆹᄅ": "mn", "ᆹᄆ": "mm", "ᆹᄒ": "psh",
  "ᆺ": "t", "ᆺᄋ": "s", "ᆺᄂ": "nn", "ᆺᄅ": "nn", "ᆺᄆ": "nm", "ᆺᄒ": "sh",
  "ᆻ": "t", "ᆻᄋ": "ss", "ᆻᄂ": "nn", "ᆻᄅ": "nn", "ᆻᄆ": "nm", "ᆻᄒ": "th",
  "ᆼ": "ng",
  "ᆽ": "t", "ᆽᄋ": "j", "ᆽᄂ": "nn", "ᆽᄅ": "nn", "ᆽᄆ": "nm", "ᆽᄒ": "ch",
  "ᆾ": "t", "ᆾᄋ": "ch", "ᆾᄂ": "nn", "ᆾᄅ": "nn", "ᆾᄆ": "nm", "ᆾᄒ": "ch",
  "ᆿ": "k", "ᆿᄋ": "k", "ᆿᄂ": "ngn", "ᆿᄅ": "ngn", "ᆿᄆ": "ngm", "ᆿᄒ": "kh",
  "ᇀ": "t", "ᇀᄋ": "t", "ᇀᄂ": "nn", "ᇀᄅ": "nn", "ᇀᄆ": "nm", "ᇀᄒ": "th",
  "ᇁ": "p", "ᇁᄋ": "p", "ᇁᄂ": "mn", "ᇁᄅ": "mn", "ᇁᄆ": "mm", "ᇁᄒ": "ph",
  "ᇂ": "t", "ᇂᄋ": "", "ᇂᄀ": "k", "ᇂᄃ": "t", "ᇂᄌ": "ch", "ᇂᄂ": "nn", "ᇂᄅ": "nn", "ᇂᄆ": "mm", "ᇂᄒ": "t",
  // ㄷ and ㅌ before 이 (and ㄷ before 히/혀) soften to j and ch: 같이 → gachi,
  // 굳이 → guji, 닫혀 → dachyeo.
  "\u11AE\u110B\u1175": "j", "\u11C0\u110B\u1175": "ch", "\u11AE\u1112\u1175": "ch", "\u11AE\u1112\u1167": "ch", "\u11B4\u110B\u1175": "lch",
};

/** A Hangul block as its initial, vowel and (if any) final jamo; anything else as itself. */
const segment = (c: string): string => {
  const idx = (c.codePointAt(0) ?? 0) - 0xac00;
  if (c.length !== 1 || idx < 0 || idx > 11171) return c;
  const cho = String.fromCharCode(Math.floor(idx / 588) + 0x1100);
  const jung = String.fromCharCode(Math.floor((idx % 588) / 28) + 0x1161);
  const jong = idx % 28 !== 0 ? String.fromCharCode((idx % 28) + 0x11a7) : "";
  return cho + jung + jong;
};

// The consonant a joined final hands to the next block, as it's sung there.
const Onset = /(ch|ss|kk|tt|pp|jj|[a-z])$/;

/**
 * One romanization per character of `text`: Hangul blocks read by sound with
 * the blocks around them as context, everything else as written. Where a
 * final and the next initial are read together, the next block's consonant
 * starts that block, so each block reads as it is sung (같|이 → ga|chi,
 * 먹|는 → meong|neun, 없|어 → eop|seo).
 */
export const KoreanCharReadings = (text: string): string[] => {
  const chars = text.split("");
  const blocks = chars.map(segment);
  let carried: string | undefined;
  return blocks.map((block, index) => {
    if (block.length < 2) {
      carried = undefined;
      return block;
    }
    const next = blocks[index + 1] ?? "";
    let piece = carried ?? CHO[block[0]] ?? block[0];
    carried = undefined;
    piece += JUNG[block[1]] ?? block[1];
    if (block.length === 3) {
      const last = block[2];
      const nextIsBlock = next.length >= 2;
      const joined = nextIsBlock
        ? (JONG[last + next[0] + next[1]] ?? JONG[last + next[0]])
        : undefined;
      if (joined !== undefined) {
        carried = joined.match(Onset)?.[0] ?? "";
        piece += joined.slice(0, joined.length - carried.length);
      } else {
        piece += JONG[last] ?? last;
      }
    }
    return piece;
  });
};

export const RomanizeKoreanText = (text: string): string => KoreanCharReadings(text).join("");
