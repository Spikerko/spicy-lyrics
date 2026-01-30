import cyrillicToLatin from "npm:cyrillic-romanization";
import { francAll } from "npm:franc-all";
import Kuroshiro from "npm:kuroshiro";
import langs from "npm:langs";
import { RetrievePackage } from "../ImportPackage.ts";
import * as KuromojiAnalyzer from "./KuromojiAnalyzer.ts";
import { PageContainer } from "../../components/Pages/PageView.ts";
import { lyricsBetweenShow } from "./lyrics.ts";
import { bengaliRomanization } from "./Romanization/bengaliRomanization.ts";
import { hindiRomanization } from "./Romanization/hindiRomanization.ts";
import { gujaratiRomanization } from "./Romanization/gujaratiRomanization.ts";
import { malayalamRomanization } from "./Romanization/malayalamRomanization.ts";
import { tamilRomanization } from "./Romanization/tamilRomanization.ts";
import { teluguRomanization } from "./Romanization/teluguRomanization.ts";
import { punjabiRomanization } from "./Romanization/punjabiRomanization.ts";

// Constants
const RomajiConverter = new Kuroshiro();
const RomajiPromise = RomajiConverter.init(KuromojiAnalyzer);

const KoreanTextTest =
  /[\uac00-\ud7af]|[\u1100-\u11ff]|[\u3130-\u318f]|[\ua960-\ua97f]|[\ud7b0-\ud7ff]/;
const ChineseTextText = /([\u4E00-\u9FFF])/;
const JapaneseTextText = /([ぁ-んァ-ン])/;

// Cyrillic (basic + supplements + extended)
const CyrillicTextTest = /[\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F]{2,}/;

// Greek (Basic + Extended)
const GreekTextTest = /[\u0370-\u03FF\u1F00-\u1FFF]/;

// Indic Scripts
const HINDI_REGEX = /[\u0900-\u097F]/;
const PUNJABI_REGEX = /[\u0a00-\u0a7f]/;
const GUJARATI_REGEX = /[\u0a80-\u0aff]/;
const MALAYALAM_REGEX = /[\u0d00-\u0d7f]/;
const TELUGU_REGEX = /[\u0c00-\u0c7f]/;
const TAMIL_REGEX = /[\u0b80-\u0bff]/;
const BENGALI_REGEX = /[\u0980-\u09ff]/;

// Load Packages
RetrievePackage("pinyin", "4.0.0", "mjs").catch(() => {});

RetrievePackage("aromanize", "1.0.0", "js").catch(() => {});

RetrievePackage("GreekRomanization", "1.0.0", "js").catch(() => {});

const RomanizeKorean = async (lyricMetadata: any, primaryLanguage: string) => {
  const aromanize = await RetrievePackage("aromanize", "1.0.0", "js");
  while (!aromanize) {
    await new Promise((r) => setTimeout(r, 50));
  }
  if (primaryLanguage === "kor" || KoreanTextTest.test(lyricMetadata.Text)) {
    lyricMetadata.RomanizedText = aromanize.default(
      lyricMetadata.Text,
      "RevisedRomanizationTransliteration"
    );
  }
};

const RomanizeChinese = async (lyricMetadata: any, primaryLanguage: string) => {
  const pinyin = await RetrievePackage("pinyin", "4.0.0", "mjs");
  while (!pinyin) {
    await new Promise((r) => setTimeout(r, 50));
  }
  if (primaryLanguage === "cmn" || ChineseTextText.test(lyricMetadata.Text)) {
    const result = pinyin.pinyin(lyricMetadata.Text, {
      segment: false,
      group: true,
    });

    lyricMetadata.RomanizedText = result.join("-");
  }
};

const RomanizeJapanese = async (lyricMetadata: any, primaryLanguage: string) => {
  if (primaryLanguage === "jpn" || JapaneseTextText.test(lyricMetadata.Text)) {
    await RomajiPromise;

    const result = await RomajiConverter.convert(lyricMetadata.Text, {
      to: "romaji",
      mode: "spaced",
    });

    lyricMetadata.RomanizedText = result;
  }
};

const RomanizeCyrillic = async (lyricMetadata: any, primaryLanguage: string, iso2Lang: string) => {
  if (
    primaryLanguage === "bel" ||
    primaryLanguage === "bul" ||
    primaryLanguage === "kaz" ||
    iso2Lang === "ky" ||
    primaryLanguage === "mkd" ||
    iso2Lang === "mn" ||
    primaryLanguage === "rus" ||
    primaryLanguage === "srp" ||
    primaryLanguage === "tgk" ||
    primaryLanguage === "ukr" ||
    CyrillicTextTest.test(lyricMetadata.Text)
  ) {
    const result = cyrillicToLatin(lyricMetadata.Text);
    if (result != null) {
      lyricMetadata.RomanizedText = result;
    }
  }
};

const RomanizeGreek = async (lyricMetadata: any, primaryLanguage: string) => {
  const greekRomanization = await RetrievePackage("GreekRomanization", "1.0.0", "js");
  while (!greekRomanization) {
    await new Promise((r) => setTimeout(r, 50));
  }
  if (primaryLanguage === "ell" || GreekTextTest.test(lyricMetadata.Text)) {
    const result = greekRomanization.default(lyricMetadata.Text);
    if (result != null) {
      lyricMetadata.RomanizedText = result;
    }
  }
};

const GetRomanizeFn = async (lyricMetadata: any, fn: (text: string) => string) => {
  lyricMetadata.RomanizedText = fn(lyricMetadata.Text);
};

const RomanizeHindi = (l: any) => GetRomanizeFn(l, hindiRomanization);
const RomanizePunjabi = (l: any) => GetRomanizeFn(l, punjabiRomanization);
const RomanizeMalayalam = (l: any) => GetRomanizeFn(l, malayalamRomanization);
const RomanizeGujarati = (l: any) => GetRomanizeFn(l, gujaratiRomanization);
const RomanizeTamil = (l: any) => GetRomanizeFn(l, tamilRomanization);
const RomanizeTelugu = (l: any) => GetRomanizeFn(l, teluguRomanization);
const RomanizeBengali = (l: any) => GetRomanizeFn(l, bengaliRomanization);

const Romanize = async (lyricMetadata: any, rootInformation: any): Promise<string | undefined> => {
  const primaryLanguage = rootInformation.Language;
  const iso2Language = rootInformation.LanguageISO2;
  if (primaryLanguage === "jpn" || JapaneseTextText.test(lyricMetadata.Text)) {
    await RomanizeJapanese(lyricMetadata, primaryLanguage);
    rootInformation.IncludesRomanization = true;
    return "Japanese";
  } else if (primaryLanguage === "cmn" || ChineseTextText.test(lyricMetadata.Text)) {
    await RomanizeChinese(lyricMetadata, primaryLanguage);
    rootInformation.IncludesRomanization = true;
    return "Chinese";
  } else if (primaryLanguage === "kor" || KoreanTextTest.test(lyricMetadata.Text)) {
    await RomanizeKorean(lyricMetadata, primaryLanguage);
    rootInformation.IncludesRomanization = true;
    return "Korean";
  } else if (
    primaryLanguage === "bel" ||
    primaryLanguage === "bul" ||
    primaryLanguage === "kaz" ||
    iso2Language === "ky" ||
    primaryLanguage === "mkd" ||
    iso2Language === "mn" ||
    primaryLanguage === "rus" ||
    primaryLanguage === "srp" ||
    primaryLanguage === "tgk" ||
    primaryLanguage === "ukr" ||
    CyrillicTextTest.test(lyricMetadata.Text)
  ) {
    await RomanizeCyrillic(lyricMetadata, primaryLanguage, iso2Language);
    rootInformation.IncludesRomanization = true;
    return "Cyrillic";
  } else if (primaryLanguage === "ell" || GreekTextTest.test(lyricMetadata.Text)) {
    await RomanizeGreek(lyricMetadata, primaryLanguage);
    rootInformation.IncludesRomanization = true;
    return "Greek";
  } else if (primaryLanguage === "ben" || BENGALI_REGEX.test(lyricMetadata.Text)) {
    RomanizeBengali(lyricMetadata);
    rootInformation.IncludesRomanization = true;
    return "bengali";
  } else if (primaryLanguage === "guj" || GUJARATI_REGEX.test(lyricMetadata.Text)) {
    RomanizeGujarati(lyricMetadata);
    rootInformation.IncludesRomanization = true;
    return "gujarati";
  } else if (primaryLanguage === "pan" || PUNJABI_REGEX.test(lyricMetadata.Text)) {
    RomanizePunjabi(lyricMetadata);
    rootInformation.IncludesRomanization = true;
    return "punjabi";
  } else if (primaryLanguage === "mal" || MALAYALAM_REGEX.test(lyricMetadata.Text)) {
    RomanizeMalayalam(lyricMetadata);
    rootInformation.IncludesRomanization = true;
    return "malayalam";
  } else if (primaryLanguage === "tam" || TAMIL_REGEX.test(lyricMetadata.Text)) {
    RomanizeTamil(lyricMetadata);
    rootInformation.IncludesRomanization = true;
    return "tamil";
  } else if (primaryLanguage === "tel" || TELUGU_REGEX.test(lyricMetadata.Text)) {
    RomanizeTelugu(lyricMetadata);
    rootInformation.IncludesRomanization = true;
    return "telugu";
  } else if (primaryLanguage === "hin" || HINDI_REGEX.test(lyricMetadata.Text)) {
    RomanizeHindi(lyricMetadata);
    rootInformation.IncludesRomanization = true;
    return "hindi";
  } else {
    rootInformation.IncludesRomanization = false;
    return undefined;
  }
};

export const ProcessLyrics = async (lyrics: any) => {
  const romanizationPromises: Promise<string | undefined>[] = [];
  if (lyrics.Type === "Static") {
    {
      let textToProcess = lyrics.Lines[0].Text;
      for (let index = 1; index < lyrics.Lines.length; index += 1) {
        textToProcess += `\n${lyrics.Lines[index].Text}`;
      }

      const language = francAll(textToProcess);
      const languageISO2 = langs.where("3", language)?.["1"];

      lyrics.Language = language;
      lyrics.LanguageISO2 = languageISO2;
    }

    for (const lyricMetadata of lyrics.Lines) {
      romanizationPromises.push(Romanize(lyricMetadata, lyrics));
    }
  } else if (lyrics.Type === "Line") {
    {
      const lines = [];
      for (const vocalGroup of lyrics.Content) {
        if (vocalGroup.Type === "Vocal") {
          lines.push(vocalGroup.Text);
        }
      }
      const textToProcess = lines.join("\n");

      const language = francAll(textToProcess);
      const languageISO2 = langs.where("3", language)?.["1"];

      lyrics.Language = language;
      lyrics.LanguageISO2 = languageISO2;
    }

    for (const vocalGroup of lyrics.Content) {
      if (vocalGroup.Type === "Vocal") {
        romanizationPromises.push(Romanize(vocalGroup, lyrics));
      }
    }
  } else if (lyrics.Type === "Syllable") {
    {
      const lines = [];
      for (const vocalGroup of lyrics.Content) {
        if (vocalGroup.Type === "Vocal") {
          let text = vocalGroup.Lead.Syllables[0].Text;
          for (let index = 1; index < vocalGroup.Lead.Syllables.length; index += 1) {
            const syllable = vocalGroup.Lead.Syllables[index];
            text += `${syllable.IsPartOfWord ? "" : " "}${syllable.Text}`;
          }

          lines.push(text);
        }
      }
      const textToProcess = lines.join("\n");

      const language = francAll(textToProcess);
      const languageISO2 = langs.where("3", language)?.["1"];

      lyrics.Language = language;
      lyrics.LanguageISO2 = languageISO2;
    }

    for (const vocalGroup of lyrics.Content) {
      if (vocalGroup.Type === "Vocal") {
        for (const syllable of vocalGroup.Lead.Syllables) {
          romanizationPromises.push(Romanize(syllable, lyrics));
        }

        if (vocalGroup.Background !== undefined) {
          for (const syllable of vocalGroup.Background[0].Syllables) {
            romanizationPromises.push(Romanize(syllable, lyrics));
          }
        }
      }
    }
  }

  await Promise.all(romanizationPromises);
  if (lyrics.IncludesRomanization === true) {
    PageContainer?.classList.add("Lyrics_RomanizationAvailable");
  } else {
    PageContainer?.classList.remove("Lyrics_RomanizationAvailable");
  }
};
