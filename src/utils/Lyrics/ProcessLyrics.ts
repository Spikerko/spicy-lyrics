import cyrillicToLatin from "cyrillic-romanization";
import { franc } from "franc-all";
import langs from "langs";
import { RetrievePackage } from "../ImportPackage.ts";
import * as KuromojiAnalyzer from "./KuromojiAnalyzer.ts";
import { PageContainer } from "../../components/Pages/PageView.ts";
import Logger from "../Logger.ts";
import { getRemoteConfig } from "../remoteConfig.ts";
import { StripEmptyLyricsLines } from "./EmptyLines.ts";
import { RomanizeJapaneseLine, RomanizeKanaOnly } from "./RomanizeJapaneseLine.ts";
import {
  RomanizeJapaneseLineLegacy,
  RomanizeJapaneseTextLegacy,
  RomanizeKanaOnlyLegacy,
} from "./RomanizeJapaneseLineLegacy.ts";
import { isExperimentEnabled } from "../experiments.ts";
import { KoreanCharReadings } from "./RomanizeKorean.ts";
import { ChineseCharReadings, IsHan, JoinChineseReadings } from "./RomanizeChinese.ts";

const romanizationLogger = new Logger("Lyrics Romanization");

// The Japanese dictionary is large, so it starts loading at startup and is
// ready by the time a Japanese song needs it.
KuromojiAnalyzer.init().catch((error) =>
  romanizationLogger.warn("Japanese dictionary didn't load", error)
);

const KoreanTextTest =
  /[가-힯]|[ᄀ-ᇿ]|[㄰-㆏]|[ꥠ-꥿]|[ힰ-퟿]/;
const ChineseTextText = /([一-鿿])/;
const JapaneseTextText = /([ぁ-んァ-ン])/;

// Cyrillic (basic + supplements + extended). The {2,} threshold avoids false
// positives on single Latin-lookalike Cyrillic letters at the song level.
const CyrillicTextTest = /[Ѐ-ӿԀ-ԯⷠ-ⷿꙀ-ꚟ]{2,}/;

// Greek (Basic + Extended)
const GreekTextTest = /[Ͱ-Ͽἀ-῿]/;

// Letters only Ukrainian uses, which read differently there (и is y, і is i).
const UkrainianTextTest = /[ЄєІіЇїҐґ]/;

// Per-item (1-char) presence tests. Once a script is confirmed present in the
// whole song, a single matching character in an item is enough to romanize it.
// Japanese includes 々, which repeats the kanji before it.
const ItemJapaneseTest = /[぀-ヿ一-鿿々]/;
const ItemChineseTest = /[一-鿿]/;
const ItemKoreanTest = KoreanTextTest;
const ItemCyrillicTest = /[Ѐ-ӿԀ-ԯⷠ-ⷿꙀ-ꚟ]/;
const ItemGreekTest = GreekTextTest;

// Any original (non-Latin) romanizable script — used to flag residue.
const ResidualScriptTest =
  /[぀-ヿ一-鿿가-힯ᄀ-ᇿ㄰-㆏Ѐ-ԯͰ-Ͽἀ-῿]/;

// Load Packages
// Note: pinyin@4's segmenter still misreads some heteronyms (看着 → kàn zháo,
// where it is kàn zhe); pinyin-pro reads these right. Bundled it adds about
// 450 kB (143 kB gzipped), so before this reaches main it should be hosted on
// pkgs.spikerko.org and loaded lazily here in place of pinyin@4.
RetrievePackage("pinyin", "4.0.0", "mjs").catch(() => {});

RetrievePackage("GreekRomanization", "1.0.0", "js").catch(() => {});

type RomanizationBranch = "Japanese" | "Chinese" | "Korean" | "Cyrillic" | "Greek";

// Priority order used both for detection and for composing converters per line.
const SCRIPT_PRIORITY: RomanizationBranch[] = ["Japanese", "Chinese", "Korean", "Cyrillic", "Greek"];

type RomanizationPackages = {
  pinyin?: any;
  greekRomanization?: any;
};

const romanizationBranchFromFranc = (
  primaryLanguage: string,
  iso2Language: string | undefined
): RomanizationBranch | undefined => {
  if (primaryLanguage === "jpn") return "Japanese";
  if (primaryLanguage === "cmn") return "Chinese";
  if (primaryLanguage === "kor") return "Korean";
  if (
    primaryLanguage === "bel" ||
    primaryLanguage === "bul" ||
    primaryLanguage === "kaz" ||
    iso2Language === "ky" ||
    primaryLanguage === "mkd" ||
    iso2Language === "mn" ||
    primaryLanguage === "rus" ||
    primaryLanguage === "srp" ||
    primaryLanguage === "tgk" ||
    primaryLanguage === "ukr"
  ) {
    return "Cyrillic";
  }
  if (primaryLanguage === "ell") return "Greek";
  return undefined;
};

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T | undefined> =>
  Promise.race([
    promise,
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms)),
  ]);

// Load every package needed for the scripts present in the current song, once.
// Korean and Cyrillic need none. A package that fails to load leaves its
// script as written instead of failing the lyrics.
const loadPackagesForScripts = async (
  scripts: RomanizationBranch[]
): Promise<RomanizationPackages> => {
  const packages: RomanizationPackages = {};
  const load = async (name: string, version: string, type: "js" | "mjs") => {
    try {
      return await RetrievePackage(name, version, type);
    } catch (error) {
      romanizationLogger.warn(`${name} didn't load`, error);
      return undefined;
    }
  };
  for (const script of scripts) {
    if (script === "Japanese") {
      // Waits a while for the dictionary; without it, kana are still spelled out.
      await withTimeout(
        KuromojiAnalyzer.init().catch(() => {}),
        getRemoteConfig().romanization.dictionaryWaitMs
      );
    } else if (script === "Chinese") {
      packages.pinyin = await load("pinyin", "4.0.0", "mjs");
    } else if (script === "Greek") {
      packages.greekRomanization = await load("GreekRomanization", "1.0.0", "js");
    }
  }
  return packages;
};

const romanizeCyrillicText = (text: string, ukrainian: boolean): string => {
  const result = cyrillicToLatin(text, ukrainian ? "ukr" : "rus");
  if (result == null) return text;
  // щ is shch, and the hard and soft signs aren't said on their own.
  return result.replace(/([Ss])hh/g, "$1hch").replace(/[ʺʹ]/g, "");
};

const romanizeGreekText = (text: string, greekRomanization: any): string => {
  if (!greekRomanization) return text;
  const result = greekRomanization.default(text);
  // A capital written as two letters is capitalized once (Θεσσαλονίκη → Thessalonikē).
  return result != null ? String(result).replace(/(TH|CH|PS)(?=\p{Ll})/gu, (m) => m[0] + m[1].toLowerCase()) : text;
};

// One unit of romanization work: the syllables of one lead or background vocal
// (Syllable lyrics), or a single line (Line and Static lyrics, where the line is
// its only "syllable", and `whole` is set). Every syllable receives its own
// TransliteratedText; `line` receives the HasTransliterations flag.
type RomanizeUnit = { syllables: any[]; line: any; whole?: boolean };

// Collect the units that get romanized plus the text franc analyses.
// Only Lead syllables feed franc; Background syllables are still romanized.
const gatherText = (
  lyrics: any
): {
  francText: string;
  scriptText: string;
  units: RomanizeUnit[];
} => {
  const units: RomanizeUnit[] = [];
  const textLines: string[] = [];
  const bgTextLines: string[] = [];

  if (lyrics.Type === "Static") {
    for (const line of lyrics.Lines) {
      units.push({ syllables: [line], line, whole: true });
      textLines.push(line.Text);
    }
  } else if (lyrics.Type === "Line") {
    for (const vocalGroup of lyrics.Content) {
      if (vocalGroup.Type === "Vocal") {
        units.push({ syllables: [vocalGroup], line: vocalGroup, whole: true });
        textLines.push(vocalGroup.Text);
      }
    }
  } else if (lyrics.Type === "Syllable") {
    for (const vocalGroup of lyrics.Content) {
      if (vocalGroup.Type !== "Vocal") continue;

      const syllables = vocalGroup.Lead.Syllables;
      if (syllables.length > 0) {
        units.push({ syllables, line: vocalGroup });
        textLines.push(spacedText(syllables));
      }

      // A line can carry several background vocals, and all of them render.
      for (const background of vocalGroup.Background ?? []) {
        if (background?.Syllables?.length > 0) {
          units.push({ syllables: background.Syllables, line: vocalGroup });
          for (const syllable of background.Syllables) bgTextLines.push(syllable.Text);
        }
      }
    }
  }

  // franc analyses lead text only (so Language detection is unchanged); script
  // detection additionally considers background vocals, which are romanized too.
  const francText = textLines.join("\n");
  const scriptText = bgTextLines.length > 0 ? `${francText}\n${bgTextLines.join("\n")}` : francText;
  return { francText, scriptText, units };
};

// Syllables joined as the lyrics show them: a space after each that ends a word.
const spacedText = (syllables: any[]): string =>
  syllables
    .map((s, i) => (i < syllables.length - 1 && !s.IsPartOfWord ? `${s.Text} ` : s.Text))
    .join("");

// Which scripts actually appear in the song. CJK is disambiguated to exactly one
// of Japanese/Chinese (kana => Japanese, else Han => Chinese) so pinyin never
// runs over a kana song's kanji. franc is folded in as a hint to cover short
// text where a regex threshold (e.g. Cyrillic {2,}) might miss.
const detectPresentScripts = (
  scriptText: string,
  language: string,
  iso2Language: string | undefined
): RomanizationBranch[] => {
  const present = new Set<RomanizationBranch>();

  if (JapaneseTextText.test(scriptText)) {
    present.add("Japanese");
  } else if (ChineseTextText.test(scriptText)) {
    present.add("Chinese");
  }
  if (KoreanTextTest.test(scriptText)) present.add("Korean");
  if (CyrillicTextTest.test(scriptText)) present.add("Cyrillic");
  if (GreekTextTest.test(scriptText)) present.add("Greek");

  const hint = romanizationBranchFromFranc(language, iso2Language);
  if (hint && !present.has(hint)) {
    if (hint === "Japanese" || hint === "Chinese") {
      if (!present.has("Japanese") && !present.has("Chinese")) present.add(hint);
    } else {
      present.add(hint);
    }
  }

  return SCRIPT_PRIORITY.filter((script) => present.has(script));
};

// Whether an entry already carries a transliteration (e.g. supplied by the API).
const hasTransliteration = (entry: any): boolean =>
  typeof entry.TransliteratedText === "string" && entry.TransliteratedText !== "";

/**
 * Reads a whole unit's text a character at a time with the line as context
 * (Chinese words, Korean sound changes across a syllable seam), then hands each
 * syllable the readings of its own characters.
 */
const byCharacter = (
  texts: string[],
  syllables: any[],
  read: (text: string) => string[]
): string[][] => {
  let text = "";
  const starts: number[] = [];
  texts.forEach((t, i) => {
    if (i > 0 && !syllables[i - 1].IsPartOfWord) text += " ";
    starts.push(text.length);
    text += t;
  });
  const readings = read(text);
  return texts.map((t, i) => readings.slice(starts[i], starts[i] + t.length));
};

type UnitResult = { texts: string[]; gaps: boolean[]; complete: boolean };

const romanizeUnit = async (
  unit: RomanizeUnit,
  scripts: RomanizationBranch[],
  packages: RomanizationPackages,
  ukrainian: boolean,
  writtenRomaji: boolean
): Promise<UnitResult> => {
  const { syllables } = unit;
  const texts: string[] = syllables.map((s) => (typeof s.Text === "string" ? s.Text : ""));
  const gaps = texts.map(() => false);
  let complete = true;
  // The previous Japanese spelling adds no capitals, so its lines stay as they were.
  let capitalize = true;

  for (const script of scripts) {
    if (script === "Japanese" && !writtenRomaji) {
      if (!texts.some((t) => ItemJapaneseTest.test(t))) continue;
      capitalize = false;
      const japanese = texts.map((t) => ItemJapaneseTest.test(t));
      let result: string[] | undefined;
      if (KuromojiAnalyzer.isReady()) {
        try {
          result = unit.whole
            ? [await RomanizeJapaneseTextLegacy(texts[0])]
            : await RomanizeJapaneseLineLegacy(
                syllables.map((s, i) => ({ Text: texts[i], IsPartOfWord: s.IsPartOfWord }))
              );
        } catch (error) {
          romanizationLogger.warn("Japanese line didn't tokenize, romanizing per syllable", error);
          try {
            result = await Promise.all(
              texts.map((t, i) => (japanese[i] ? RomanizeJapaneseTextLegacy(t) : t))
            );
          } catch {
            result = undefined;
          }
        }
      }
      // Only a dictionary still loading is worth another try; a line that doesn't
      // tokenize won't the next time either.
      if (!KuromojiAnalyzer.isReady()) complete = false;
      texts.forEach((t, i) => {
        if (japanese[i]) texts[i] = result ? result[i] : RomanizeKanaOnlyLegacy(t);
      });
    } else if (script === "Japanese") {
      if (!texts.some((t) => ItemJapaneseTest.test(t))) continue;
      let result: { text: string; gapAfter: boolean }[] | undefined;
      if (KuromojiAnalyzer.isReady()) {
        try {
          result = await RomanizeJapaneseLine(
            syllables.map((s, i) => ({ Text: texts[i], IsPartOfWord: s.IsPartOfWord }))
          );
        } catch (error) {
          romanizationLogger.warn("Japanese line didn't tokenize, spelling out kana only", error);
        }
      }
      // Only a dictionary still loading is worth another try; a line that doesn't
      // tokenize won't the next time either.
      if (!KuromojiAnalyzer.isReady()) complete = false;
      texts.forEach((t, i) => {
        const japanese = ItemJapaneseTest.test(t);
        if (result) {
          gaps[i] = result[i].gapAfter;
          // Japanese punctuation (『』, 〜) in a syllable of its own is written out too.
          if (japanese || result[i].text !== "") texts[i] = result[i].text;
        } else if (japanese) {
          texts[i] = RomanizeKanaOnly(t);
        }
      });
    } else if (script === "Chinese") {
      if (!texts.some((t) => ItemChineseTest.test(t))) continue;
      if (!packages.pinyin) {
        complete = false;
        continue;
      }
      const readings = byCharacter(texts, syllables, (text) => ChineseCharReadings(text, packages.pinyin));
      const original = [...texts];
      texts.forEach((t, i) => {
        if (!ItemChineseTest.test(t)) return;
        texts[i] = JoinChineseReadings(t.split(""), readings[i]);
      });
      // Pinyin reads by character, so a Han syllable is a word of its own.
      original.forEach((t, i) => {
        const next = original[i + 1];
        if (next === undefined || !/[\p{L}\p{N}]/u.test(next)) return;
        if (IsHan(t[t.length - 1]) || IsHan(next[0])) gaps[i] = true;
      });
    } else if (script === "Korean") {
      if (!texts.some((t) => ItemKoreanTest.test(t))) continue;
      const readings = byCharacter(texts, syllables, KoreanCharReadings);
      texts.forEach((t, i) => {
        if (ItemKoreanTest.test(t)) texts[i] = readings[i].join("");
      });
    } else if (script === "Cyrillic") {
      texts.forEach((t, i) => {
        if (ItemCyrillicTest.test(t)) texts[i] = romanizeCyrillicText(t, ukrainian);
      });
    } else if (script === "Greek") {
      texts.forEach((t, i) => {
        if (ItemGreekTest.test(t)) texts[i] = romanizeGreekText(t, packages.greekRomanization);
      });
    }
  }

  // The line starts with a capital when its first word is a romanized one
  // (words already in Latin letters stay as written).
  const first = syllables.findIndex((s) => /\p{L}/u.test(s.Text ?? ""));
  if (capitalize && first >= 0) {
    const firstLetter = (syllables[first].Text as string).match(/\p{L}/u)?.[0] ?? "";
    if (!/\p{Script=Latin}/u.test(firstLetter) && texts[first] !== syllables[first].Text) {
      texts[first] = texts[first].replace(/\p{L}/u, (c) => c.toUpperCase());
    }
  }

  return { texts, gaps, complete };
};

// Writes a unit's romanization onto its syllables. A syllable that already has a
// transliteration (from the API or the TTML) keeps it; if any does, the lyrics'
// own word gaps are kept too.
const applyUnit = (unit: RomanizeUnit, result: UnitResult): boolean => {
  const { syllables, line } = unit;
  const supplied = syllables.some(hasTransliteration);
  let changed = false;
  syllables.forEach((syllable, i) => {
    if (hasTransliteration(syllable)) return;
    const text = result.texts[i];
    if (text === syllable.Text) return;
    // An empty romanization is kept only for script that reads as nothing (a っ
    // sung as a stop, a kanji read by the bracketed kana after it).
    if (text.trim() === "" && !ResidualScriptTest.test(syllable.Text ?? "")) return;
    // TransliteratedText lives on the word/syllable; the HasTransliterations flag
    // lives on the line (and the root) — never on individual words/syllables.
    syllable.TransliteratedText = text;
    line.HasTransliterations = true;
    changed = true;
    if (ResidualScriptTest.test(text) && result.complete) {
      romanizationLogger.warn("Incomplete romanization (original-script characters remain)", {
        original: syllable.Text,
        romanized: text,
      });
    }
  });
  if (!supplied) {
    // Where the romaji ends a word the source runs together, the romanized view
    // puts a gap after the syllable.
    syllables.forEach((syllable, i) => {
      if (i < syllables.length - 1 && result.gaps[i] && syllable.IsPartOfWord) {
        syllable.TransliteratedIsPartOfWord = false;
      }
    });
  }
  return changed;
};

// "written2": the written spelling no longer splits Japanese at spaced
// syllables, so lyrics cached as "written" read some kanji alone and are redone.
const japaneseRomajiSpelling = () => (isExperimentEnabled("romajiAsWritten") ? "written2" : "said");

/**
 * Whether lyrics (from the cache, say) carry the Japanese spelling currently
 * chosen. Lyrics from before the marker existed were spelled the previous way.
 */
export const JapaneseRomajiIsCurrent = (lyrics: any): boolean => {
  const spelling = lyrics?.JapaneseRomaji ?? (lyrics?.Language === "jpn" ? "said" : undefined);
  return spelling === undefined || spelling === japaneseRomajiSpelling();
};

/**
 * Romanizes the lyrics in place. Resolves to false when a script couldn't be
 * read in full (the Japanese dictionary or a package didn't load), so the
 * caller can skip caching the result and try again next time.
 */
export const ProcessLyrics = async (lyrics: any): Promise<boolean> => {
  // Transliterations the API already shipped are preferred and never overwritten,
  // but we still romanize any entry that's missing one — partial API data should
  // not leave gaps.
  const hadApiTransliterations = lyrics.HasTransliterations === true;

  StripEmptyLyricsLines(lyrics);

  const { francText, scriptText, units } = gatherText(lyrics);

  const language = franc(francText);
  const languageISO2 = langs.where("3", language)?.["1"];
  lyrics.Language = language;
  lyrics.LanguageISO2 = languageISO2;

  const presentScripts = detectPresentScripts(scriptText, language, languageISO2);

  // Skip the work (incl. loading packages) when there are no romanizable scripts
  // or every entry already has a transliteration.
  let appliedRomanization = false;
  let complete = true;
  if (
    presentScripts.length > 0 &&
    units.some((unit) => unit.syllables.some((s) => !hasTransliteration(s)))
  ) {
    const packages = await loadPackagesForScripts(presentScripts);
    const ukrainian = UkrainianTextTest.test(scriptText);
    const writtenRomaji = isExperimentEnabled("romajiAsWritten");
    // Which Japanese spelling the lyrics carry, so cached lyrics made with the
    // other one are romanized again (see JapaneseRomajiIsCurrent).
    if (presentScripts.includes("Japanese")) lyrics.JapaneseRomaji = japaneseRomajiSpelling();
    for (const unit of units) {
      if (unit.syllables.every(hasTransliteration)) continue;
      try {
        const result = await romanizeUnit(unit, presentScripts, packages, ukrainian, writtenRomaji);
        if (!result.complete) complete = false;
        if (applyUnit(unit, result)) appliedRomanization = true;
      } catch (error) {
        romanizationLogger.warn("Line romanization failed", error);
      }
    }
  }

  // True if the API shipped transliterations or we generated any here.
  lyrics.HasTransliterations = hadApiTransliterations || appliedRomanization;

  if (lyrics.HasTransliterations === true) {
    PageContainer?.classList.add("Lyrics_RomanizationAvailable");
  } else {
    PageContainer?.classList.remove("Lyrics_RomanizationAvailable");
  }

  return complete;
};
