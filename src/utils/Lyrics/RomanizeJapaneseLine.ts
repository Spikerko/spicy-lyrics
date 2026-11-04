// deno-lint-ignore-file no-explicit-any
// @ts-ignore: plain JS module without types
import { kanaToRomaji as KanaToRomaji } from "kuroshiro/src/util.js";
import * as KuromojiAnalyzer from "./KuromojiAnalyzer.ts";

/**
 * Japanese romanization: kuromoji (IPADIC) reads the whole line, so kanji get
 * their reading in context and words split over several syllables keep it,
 * and Hepburn writes it out. The spelling is the one romanized lyric pages
 * use: long vowels as written ("kyou", "koohii"), particles as said ("wa",
 * "e", "wo"), and a gap between words with endings kept on their word
 * ("kimi no namae wo yonde ita").
 */

export type LineSyllable = { Text: string; IsPartOfWord?: boolean };
/** One syllable's romaji, and whether a word ends after it. */
export type RomanizedSyllable = { text: string; gapAfter: boolean };

type Token = {
  surface: string;
  /** Katakana as written, with particles as said. */
  reading: string;
  pos: string;
  posDetail: string;
  /** UTF-16 offset in the line. */
  start: number;
};

const MACRONS: Record<string, string> = { ā: "aa", ī: "ii", ū: "uu", ē: "ee", ō: "oo" };

/** Hepburn, with ー written as the vowel again (コーヒー → koohii). */
const romanize = (kana: string): string =>
  (KanaToRomaji(kana, "hepburn") as string)
    .trim()
    .replace(/[āīūēō]/g, (c) => MACRONS[c] ?? c);

const isKanaChar = (c: string) => c >= "぀" && c <= "ヿ";
const isKanji = (c: string) =>
  (c >= "一" && c <= "鿏") ||
  (c >= "豈" && c <= "﫿") ||
  (c >= "㐀" && c <= "䶿") ||
  c === "々";
const isJapaneseChar = (c: string) => isKanaChar(c) || isKanji(c);
const hasJapanese = (s: string) => [...s].some(isJapaneseChar);
const toKatakana = (s: string) =>
  s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));

/**
 * Half-width katakana (ｿﾝﾅ) as the dictionary knows it (ソンナ), one
 * character for one, so every syllable keeps its length.
 */
const widenKatakana = (text: string) =>
  text.replace(/[｡-ﾟ]/g, (c) => {
    const wide = c.normalize("NFKC");
    return wide.length === 1 ? wide : c;
  });

/** The particles that aren't said as written. */
const PARTICLES: Record<string, string> = { は: "ワ", へ: "エ", を: "ヲ" };

const known = (value: unknown) =>
  typeof value === "string" && value !== "" && value !== "*" ? value : undefined;

const tokenize = async (text: string): Promise<Token[]> => {
  const raw: any[] = await KuromojiAnalyzer.parse(text);
  const tokens = raw.map((t): Token => {
    const surface: string = t.surface_form;
    const reading = known(t.reading);
    return {
      surface,
      reading:
        t.pos === "助詞" && PARTICLES[surface]
          ? PARTICLES[surface]
          : !hasJapanese(surface)
            ? surface
            : reading
              ? toKatakana(reading)
              : [...surface].every(isKanaChar)
                ? toKatakana(surface)
                : surface,
      pos: t.pos,
      posDetail: t.pos_detail_1,
      start: 0,
    };
  });

  // A verb or adjective ending in っ takes the next token in (言っ|て → itte).
  for (let i = 0; i + 1 < tokens.length; i++) {
    const t = tokens[i];
    if ((t.pos === "動詞" || t.pos === "形容詞") && t.surface.length > 1 && /[っッ]$/.test(t.surface)) {
      t.surface += tokens[i + 1].surface;
      t.reading += tokens[i + 1].reading;
      tokens.splice(i-- + 1, 1);
    }
  }

  let at = 0;
  for (const t of tokens) {
    t.start = at;
    at += t.surface.length;
  }
  if (tokens.map((t) => t.surface).join("") !== text) {
    throw new Error("Tokens don't cover the line");
  }
  return tokens;
};

const INFLECTING = new Set(["動詞", "形容詞", "助動詞"]);
const VOWEL_KANA: Record<string, string> = { ア: "a", イ: "i", ウ: "u", エ: "e", オ: "o" };

/** A lone vowel that holds the sound before it (うるせ|え → urusee). */
const stretches = (token: Token, previous: Token | undefined) => {
  const vowel = VOWEL_KANA[toKatakana(token.surface)];
  if (!vowel || !previous || !hasJapanese(previous.surface)) return false;
  return romanize(previous.reading).slice(-1) === vowel;
};

/**
 * Endings that stay on the word before: verb and adjective endings (yonde,
 * ita, ikou), て/で, and suffixes (tomodachisan). A copula after a noun stays
 * its own word (suki da).
 */
const attaches = (token: Token, previous: Token | undefined) =>
  (token.pos === "助動詞" && !!previous && INFLECTING.has(previous.pos)) ||
  (token.pos === "助詞" && token.posDetail === "接続助詞") ||
  token.posDetail === "接尾" ||
  // Casual ん (やってんの, 抜かしてんだ) is said as part of the word before.
  (!!previous && /^[んン]$/.test(token.surface)) ||
  // A ー on its own stretches the sound before it (せー → see).
  (!!previous && /^[ーｰ〜～]+$/.test(token.surface)) ||
  stretches(token, previous);

const OPENS = /^[「『（(“‘〈《【]$/;

/**
 * A reading in sounds, the units shared out between kanji: small kana, ー,
 * ン and ッ stay with the kana before them, so a kanji never starts with one
 * (千里眼 → セン|リ|ガン, 一歩 → イッ|ポ).
 */
const morae = (reading: string): string[] => {
  const result: string[] = [];
  for (const c of reading) {
    if (result.length === 0 || !"ャュョァィゥェォヮーンッ".includes(c)) result.push(c);
    else result[result.length - 1] += c;
  }
  return result;
};

/**
 * Shares a reading between characters by mora, the extra mora going to the
 * last (名前 → ナ|マエ); with fewer morae than characters the first ones get
 * them, so nothing sung is left without a reading.
 */
const share = (reading: string, count: number): string[] => {
  const parts = morae(reading);
  const cut = parts.length < count ? Math.round : Math.floor;
  return Array.from({ length: count }, (_, i) =>
    parts.slice(cut((i * parts.length) / count), cut(((i + 1) * parts.length) / count)).join("")
  );
};

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * One kana reading per character of a word. Kana read as themselves, and each
 * run of kanji takes the reading between them (走り出す → ハシ|リ|ダ|ス); a run
 * of several kanji shares its part by mora.
 */
const charReadings = (surface: string, reading: string): string[] => {
  const runs = surface.match(/[぀-ヿ]+|[^぀-ヿ]+/g) ?? [];
  const pattern = new RegExp(
    `^${runs.map((run) => (isKanaChar(run[0]) ? `(${escapeRegExp(toKatakana(run))})` : "(.+?)")).join("")}$`
  );
  const match = reading.match(pattern);
  // No clean alignment (an unusual reading): share it over the whole word.
  if (!match) return share(reading, surface.length);
  return runs.flatMap((run, i) =>
    isKanaChar(run[0]) ? toKatakana(run).split("") : share(match[i + 1], run.length)
  );
};

const RubyReading = /[(（]([ぁ-ゖァ-ーー]+)[)）]/g;

// Character index -> reading for kanji read by the kana in brackets after them
// (傾(かぶ)けば): the word's kanji and the brackets read nothing, the kana read themselves.
const rubyReadings = (text: string, tokens: Token[]): Map<number, string> => {
  const readings = new Map<number, string>();
  for (const match of text.matchAll(RubyReading)) {
    const open = match.index ?? 0;
    const word = tokens.findLast((t) => t.start + t.surface.length === open);
    if (!word) continue;
    let kanji = 0;
    while (kanji < word.surface.length && isKanji(word.surface[word.surface.length - 1 - kanji]))
      kanji++;
    if (kanji === 0) continue;
    for (let i = open - kanji; i < open; i++) readings.set(i, "");
    const close = open + match[0].length - 1;
    for (let i = open; i <= close; i++)
      readings.set(i, i === open || i === close ? "" : toKatakana(text[i]));
  }
  return readings;
};

/**
 * Romanizes one line's syllables with the whole line as tokenizer context,
 * one entry per syllable. Romanizing each syllable alone loses sounds at the
 * seams: 段|々 reads "dan" + "々", and the っ in 黙っ|て has no consonant to
 * double. Here the line's reading is shared back out to the syllables it spans.
 *
 * A っ ending a syllable keeps the consonant it doubles there (黙っ|て →
 * damat|te, 発|火 → hak|ka); before a vowel, a pause or the line's end it is a
 * stop and unwritten (まっ|いっ|か → ma|ik|ka, あっ → a).
 *
 * `gapAfter` marks a syllable after which a new word starts, so the romaji
 * reads by word ("anata no koto") although the syllables are written glued.
 * A syllable with more than one word in it gets its gaps inside the text.
 */
export const RomanizeJapaneseLine = async (
  syllables: LineSyllable[]
): Promise<RomanizedSyllable[]> => {
  // Syllables that aren't part of the same word are spaced apart, so the
  // tokenizer sees the same word boundaries the lyrics do. Not between two
  // Japanese ones: many lyrics put a space after every syllable of Japanese,
  // and spaced apart the tokenizer would read each kanji on its own (世|界 →
  // "yo sakai").
  let text = "";
  const owner: number[] = [];
  const startsAt: number[] = [];
  syllables.forEach((syllable, index) => {
    const previous = syllables[index - 1];
    if (
      previous &&
      !previous.IsPartOfWord &&
      !(isJapaneseChar([...previous.Text].at(-1) ?? "") && isJapaneseChar([...syllable.Text][0] ?? ""))
    ) {
      text += " ";
      owner.push(-1);
    }
    startsAt.push(text.length);
    text += widenKatakana(syllable.Text);
    for (let i = 0; i < syllable.Text.length; i++) owner.push(index);
  });

  const tokens = await tokenize(text);
  const ruby = rubyReadings(text, tokens);
  const kana: { piece: string; newWord: boolean }[][] = syllables.map(() => []);
  const startsWord = syllables.map(() => false);
  let lastReading: string | undefined;

  tokens.forEach((token, tokenIndex) => {
    // Punctuation never starts a word ("Oh yeah, hashiridasu").
    const newWord =
      tokenIndex > 0 && /[\p{L}\p{N}]/u.test(token.surface) && !attaches(token, tokens[tokenIndex - 1]);
    if (newWord) {
      const syllable = startsAt.indexOf(token.start);
      if (syllable > 0) startsWord[syllable] = true;
    }

    let readings: string[];
    if (/^々+$/.test(token.surface) && !isKanaChar(token.reading[0] ?? "") && lastReading !== undefined) {
      // A 々 the dictionary didn't read repeats the kanji before it (燦々 → san san).
      readings = token.surface.split("").map(() => lastReading as string);
    } else if (hasJapanese(token.surface)) {
      readings = charReadings(token.surface, token.reading);
    } else {
      readings = token.surface.split("");
    }
    readings = readings.map((r, i) => ruby.get(token.start + i) ?? r);
    lastReading = readings.findLast((r) => r !== "") ?? lastReading;

    const bySyllable = new Map<number, string>();
    readings.forEach((r, i) => {
      const syllable = owner[token.start + i];
      if (syllable < 0) return;
      bySyllable.set(syllable, (bySyllable.get(syllable) ?? "") + r);
    });
    let first = true;
    for (const [syllable, piece] of [...bySyllable].sort((a, b) => a[0] - b[0])) {
      if (piece.trim() !== "") kana[syllable].push({ piece, newWord: first && newWord });
      first = false;
    }
  });

  const pieces = kana.flatMap((list, syllable) => list.map((entry) => ({ syllable, ...entry })));
  const romaji: { text: string; newWord: boolean; opens: boolean }[][] = syllables.map(() => []);
  let lastVowel = "";
  pieces.forEach(({ syllable, piece, newWord }, k) => {
    let out: string;
    if (piece === "ヲ") out = "wo";
    else if (!/[っッ]$/.test(piece)) out = romanize(piece);
    else {
      // The consonant the stop doubles, from the first sound after it.
      const next = pieces[k + 1] ? romanize(pieces[k + 1].piece) : "";
      const doubled = next.startsWith("ch")
        ? "t"
        : /^[a-z]/i.test(next) && !/^[aeioun]/i.test(next)
          ? next[0]
          : "";
      out = romanize(piece.replace(/[っッ]+$/, "")) + doubled;
    }
    // A ー in a syllable of its own holds the vowel before it (セ|ー → se|e).
    out = out
      .replace(/^ー+/, (marks) => lastVowel.repeat(marks.length))
      .replace(/[『』]/g, '"')
      .replace(/〜/g, "~");
    const vowel = out.match(/[aeiou](?=[^a-z]*$)/i)?.[0];
    if (vowel) lastVowel = vowel.toLowerCase();
    romaji[syllable].push({ text: out, newWord, opens: OPENS.test(piece.trim()) });
  });

  return romaji.map((list, index) => {
    const kept = list.filter((entry) => entry.text !== "");
    // Inside one syllable (a line that isn't split, say), words still get gaps.
    const joined = kept
      .map((entry, i) => (i > 0 && entry.newWord && !kept[i - 1].opens ? ` ${entry.text}` : entry.text))
      .join("")
      .trim();
    if (joined === "") return { text: "", gapAfter: false };
    // A word ends here when the next syllable that says anything starts one.
    let next = index + 1;
    while (next < syllables.length && !startsWord[next] && romaji[next].every((e) => !e.text)) next++;
    const gapAfter =
      next < syllables.length && startsWord[next] && !kept[kept.length - 1]?.opens;
    return { text: joined, gapAfter };
  });
};

/**
 * Kana only, for when the dictionary isn't available: kana are spelled out
 * and kanji are left as written, since reading them needs the dictionary.
 */
export const RomanizeKanaOnly = (text: string): string =>
  romanize(widenKatakana(toKatakana(text))).replace(/[『』]/g, '"').replace(/〜/g, "~");
