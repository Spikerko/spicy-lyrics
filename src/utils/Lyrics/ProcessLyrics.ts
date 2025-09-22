import cyrillicToLatin from "npm:cyrillic-romanization";
import { franc } from "npm:franc-all";
import Kuroshiro from "npm:kuroshiro";
import langs from "npm:langs";
import { RetrievePackage } from "../ImportPackage.ts";
import Aromanize from "./Aromanize.ts";
import greekRomanization from "./GreekRomanization.js";
import * as KuromojiAnalyzer from "./KuromojiAnalyzer.ts";

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

const RomanizeKorean = (lyricMetadata: any, primaryLanguage: string) => {
  if (primaryLanguage === "kor" || KoreanTextTest.test(lyricMetadata.Text)) {
    lyricMetadata.RomanizedText = Aromanize(
      lyricMetadata.Text,
      "RevisedRomanizationTransliteration"
    );
  }
};

// Load Pinyin

RetrievePackage("pinyin", "4.0.0", "mjs")
  .then((data) => {
    console.log(`Spicy Lyrics Package: "Pinyin" Retrieved`, data);
  })
  .catch(() => {});

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
  if (primaryLanguage === "ell" || GreekTextTest.test(lyricMetadata.Text)) {
    const result = greekRomanization(lyricMetadata.Text);
    if (result != null) {
      lyricMetadata.RomanizedText = result;
    }
  }
};

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

      const language = franc(textToProcess);
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

      const language = franc(textToProcess);
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

      const language = franc(textToProcess);
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
    document.querySelector("#SpicyLyricsPage")?.classList.add("Lyrics_RomanizationAvailable");
  } else {
    document.querySelector("#SpicyLyricsPage")?.classList.remove("Lyrics_RomanizationAvailable");
  }
};
