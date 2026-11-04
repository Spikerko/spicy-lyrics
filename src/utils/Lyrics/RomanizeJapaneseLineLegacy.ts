// deno-lint-ignore-file no-explicit-any
// The previous Japanese spelling, kept for when the romajiAsWritten experiment is
// off: each token read by its pronunciation with macrons (tōkyō, kyō), particles
// as said (wa, e, o), one token per word.
import Kuroshiro from "kuroshiro";
import * as KuromojiAnalyzer from "./KuromojiAnalyzer.ts";

const KanaToRomaji: (kana: string, system: string) => string = (Kuroshiro as any).Util.kanaToRomaji;

type LineSyllable = { Text: string; IsPartOfWord?: boolean };

// A kuromoji token after the same patches kuroshiro applies before converting.
type JapaneseToken = {
  surface: string;
  reading: string;
  pronunciation?: string;
  pos?: string;
  start: number;
};

const isKanaChar = (c: string) => c >= "぀" && c <= "ヿ";
const isKanji = (c: string) =>
  (c >= "一" && c <= "鿏") || (c >= "豈" && c <= "﫿") || (c >= "㐀" && c <= "䶿");
const hasJapanese = (s: string) => [...s].some((c) => isKanaChar(c) || isKanji(c));
const toKatakana = (s: string) =>
  s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
const romanize = (kana: string) => KanaToRomaji(kana, "hepburn").trim();

const tokenize = async (text: string): Promise<JapaneseToken[]> => {
  const raw: any[] = await KuromojiAnalyzer.parse(text);
  const tokens = raw.map((t): JapaneseToken => {
    const surface: string = t.surface_form;
    const reading = t.reading && t.reading !== "*" ? (t.reading as string) : undefined;
    const pronunciation =
      t.pronunciation && t.pronunciation !== "*" ? (t.pronunciation as string) : undefined;
    return {
      surface,
      reading: !hasJapanese(surface)
        ? surface
        : reading === undefined
          ? [...surface].every(isKanaChar)
            ? toKatakana(surface)
            : surface
          : toKatakana(reading),
      pronunciation,
      pos: t.pos,
      start: 0,
    };
  });

  // 助動詞 "う" after a 動詞 joins it as a long vowel (行こう → ikō).
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    const prev = tokens[i - 1];
    if (t.pos === "助動詞" && (t.surface === "う" || t.surface === "ウ") && prev.pos === "動詞") {
      prev.surface += t.surface;
      prev.pronunciation = `${prev.pronunciation ?? prev.reading}ー`;
      prev.reading += "ウ";
      tokens.splice(i--, 1);
    }
  }

  // A 動詞 or 形容詞 ending in っ takes the next token in (言っ|て → itte).
  for (let i = 0; i + 1 < tokens.length; i++) {
    const t = tokens[i];
    if (
      (t.pos === "動詞" || t.pos === "形容詞") &&
      t.surface.length > 1 &&
      /[っッ]$/.test(t.surface)
    ) {
      const next = tokens[i + 1];
      t.surface += next.surface;
      t.pronunciation = (t.pronunciation ?? t.reading) + (next.pronunciation ?? next.reading);
      t.reading += next.reading;
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

const morae = (reading: string, splitLongVowels: boolean): string[] => {
  const result: string[] = [];
  const joins = splitLongVowels ? "ャュョァィゥェォヮ" : "ャュョァィゥェォヮー";
  for (const c of reading) {
    if (result.length === 0 || !joins.includes(c)) result.push(c);
    else result[result.length - 1] += c;
  }
  return result;
};

// Shares a reading between characters by mora, the extra mora going to the
// last (名前 → ナ|マエ). With fewer morae than characters a long vowel counts
// as its own (今日 → キョ|ー) and the first characters get them, so nothing
// sung is left without a reading.
const share = (reading: string, count: number): string[] => {
  let parts = morae(reading, false);
  if (parts.length < count) parts = morae(reading, true);
  const cut = parts.length < count ? Math.round : Math.floor;
  return Array.from({ length: count }, (_, i) =>
    parts.slice(cut((i * parts.length) / count), cut(((i + 1) * parts.length) / count)).join("")
  );
};

// How a written kana may appear in a pronunciation: vowels lengthen the one
// before (トウ → トー) and some particles are said differently (は → ワ).
const SaidAs: Record<string, string> = { ハ: "ワ", ヘ: "エ", ヲ: "オ", ヅ: "ズ", ヂ: "ジ" };
const kanaPattern = (c: string): string => {
  const k = toKatakana(c);
  const forms = [k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")];
  if ("アイウエオ".includes(k)) forms.push("ー");
  if (SaidAs[k]) forms.push(SaidAs[k]);
  return `(${forms.join("|")})`;
};

// One kana reading per surface character. Kana read as themselves, and each
// run of kanji takes the reading between them (走り出す → ハシ|リ|ダ|ス); a run
// of several kanji shares its part by mora (per-kanji readings would need a
// dictionary that isn't loaded).
const charReadings = (surface: string, reading: string | undefined): string[] => {
  if (reading === undefined) return surface.split("");
  const runs = surface.match(/[぀-ヿ]+|[^぀-ヿ]+/g) ?? [];
  const isKanaRun = (run: string) => isKanaChar(run[0]);
  const pattern = runs.map((run) =>
    isKanaRun(run) ? run.split("").map(kanaPattern).join("") : "(.+?)"
  );
  const match = reading.match(new RegExp(`^${pattern.join("")}$`));
  // No clean alignment (an unusual reading): share it over the whole word.
  if (!match) return share(reading, surface.length);

  let group = 1;
  return runs.flatMap((run) => {
    if (isKanaRun(run)) return run.split("").map(() => match[group++]);
    const shares = share(match[group++], run.length);
    // A っ is the end of the kanji before it, never the start of the next (発火 → ハッ|カ).
    for (let i = 1; i < shares.length; i++) {
      while (shares[i].startsWith("ッ")) {
        shares[i - 1] += "ッ";
        shares[i] = shares[i].slice(1);
      }
    }
    return shares;
  });
};

const RubyReading = /[(（]([ぁ-ゖァ-ーー]+)[)）]/g;

// Character index -> reading for kanji read by the kana in brackets after them
// (傾(かぶ)けば): the word's kanji and the brackets read nothing, the kana read themselves.
const rubyReadings = (text: string, tokens: JapaneseToken[]): Map<number, string> => {
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
 * Romanizes one line's syllables with the whole line as tokenizer context and
 * returns one romaji string per syllable. Romanizing each syllable alone loses
 * sounds at the seams: 段|々 reads "dan" + "々", and the っ in 黙っ|て has no
 * consonant to double. Here the line's reading is shared back out to the
 * syllables it spans.
 *
 * A っ ending a syllable keeps the consonant it doubles there (黙っ|て → damat|te,
 * 発|火 → hak|ka); before a vowel, a pause or the line's end it is a stop and
 * unwritten (まっ|いっ|か → ma|ik|ka, あっ → a).
 */
export const RomanizeJapaneseLineLegacy = async (syllables: LineSyllable[]): Promise<string[]> => {
  // Syllables that aren't part of the same word are spaced apart, so the
  // tokenizer sees the same word boundaries the lyrics do.
  let text = "";
  const owner: number[] = [];
  syllables.forEach((syllable, index) => {
    if (index > 0 && !syllables[index - 1].IsPartOfWord) {
      text += " ";
      owner.push(-1);
    }
    text += syllable.Text;
    for (let i = 0; i < syllable.Text.length; i++) owner.push(index);
  });

  const tokens = await tokenize(text);
  const ruby = rubyReadings(text, tokens);
  const kana: string[][] = syllables.map(() => []);
  let lastReading: string | undefined;

  for (const token of tokens) {
    let readings: string[];
    if (
      [...token.surface].every((c) => c === "々") &&
      ![...(token.pronunciation ?? "")].some(isKanaChar) &&
      lastReading !== undefined
    ) {
      // A 々 the dictionary didn't read repeats the kanji before it (燦々 → san san).
      readings = token.surface.split("").map(() => lastReading as string);
    } else if (hasJapanese(token.surface)) {
      readings = charReadings(token.surface, token.pronunciation ?? token.reading);
    } else {
      readings = token.surface.split("");
    }
    readings = readings.map((r, i) => ruby.get(token.start + i) ?? r);
    lastReading = readings.findLast((r) => r !== "") ?? lastReading;

    const bySyllable = new Map<number, string>();
    readings.forEach((r, i) => {
      const syllable = owner[token.start + i];
      if (syllable < 0) return;
      // A vowel split off from the mora it lengthens (ありがと|う) reads as written.
      const written = toKatakana(token.surface[i]);
      if (!bySyllable.has(syllable) && r.startsWith("ー") && "アイウエオ".includes(written)) {
        r = written + r.slice(1);
      }
      bySyllable.set(syllable, (bySyllable.get(syllable) ?? "") + r);
    });
    for (const [syllable, piece] of [...bySyllable].sort((a, b) => a[0] - b[0])) {
      if (piece.trim() !== "") kana[syllable].push(piece);
    }
  }

  const pieces = kana.flatMap((list, syllable) => list.map((piece) => ({ syllable, piece })));
  const romaji: string[][] = syllables.map(() => []);
  let lastVowel = "";
  pieces.forEach(({ syllable, piece }, k) => {
    let text: string;
    if (!piece.endsWith("ッ")) {
      text = romanize(piece);
    } else {
      // The consonant the stop doubles, from the first sound after it.
      const next = pieces[k + 1] ? romanize(pieces[k + 1].piece) : "";
      const doubled = next.startsWith("ch")
        ? "t"
        : /^[a-z]/i.test(next) && !/^[aeiouāēīōūn]/i.test(next)
          ? next[0]
          : "";
      text = romanize(piece.replace(/ッ+$/, "")) + doubled;
    }
    // A ー in a syllable of its own holds the vowel before it (セ|ー → se|e).
    text = text.replace(/^ー+/, (marks) => lastVowel.repeat(marks.length));
    const vowel = text.match(/[aeiouāēīōū](?=[^a-zāēīōū]*$)/i)?.[0];
    if (vowel) lastVowel = vowel.toLowerCase().normalize("NFD")[0];
    romaji[syllable].push(text);
  });

  return romaji.map((list) => list.filter((r) => r !== "").join(" "));
};

let Converter: Promise<any> | undefined;

/** A whole line in the previous spelling, one token per word. */
export const RomanizeJapaneseTextLegacy = async (text: string): Promise<string> => {
  Converter ??= (async () => {
    const converter = new Kuroshiro();
    await converter.init(KuromojiAnalyzer);
    return converter;
  })().catch((error) => {
    Converter = undefined;
    throw error;
  });
  return await (await Converter).convert(text, { to: "romaji", mode: "spaced" });
};

/** Kana only in the previous spelling, for when the dictionary isn't available. */
export const RomanizeKanaOnlyLegacy = (text: string): string => romanize(toKatakana(text));
