import cyrillicToLatin from "cyrillic-romanization";
import { franc } from "franc-all";
import Kuroshiro from "kuroshiro";
import langs from "langs";
import { RetrievePackage } from "../ImportPackage.ts";
import * as KuromojiAnalyzer from "./KuromojiAnalyzer.ts";
import { PageContainer } from "../../components/Pages/PageView.ts";
import Logger from "../Logger.ts";

// Constants
const RomajiConverter = new Kuroshiro();
const RomajiPromise = RomajiConverter.init(KuromojiAnalyzer);

const romanizationLogger = new Logger("Lyrics Romanization");

const KoreanTextTest =
  /[가-힯]|[ᄀ-ᇿ]|[㄰-㆏]|[ꥠ-꥿]|[ힰ-퟿]/;
const ChineseTextText = /([一-鿿])/;
const JapaneseTextText = /([ぁ-んァ-ン])/;

// Cyrillic (basic + supplements + extended). The {2,} threshold avoids false
// positives on single Latin-lookalike Cyrillic letters at the song level.
const CyrillicTextTest = /[Ѐ-ӿԀ-ԯⷠ-ⷿꙀ-ꚟ]{2,}/;

// Greek (Basic + Extended)
const GreekTextTest = /[Ͱ-Ͽἀ-῿]/;

// Per-item (1-char) presence tests. Once a script is confirmed present in the
// whole song, a single matching character in an item is enough to romanize it
// (mirrors the previous "force conversion for the detected branch" behaviour).
const ItemJapaneseTest = /[぀-ヿ一-鿿]/; // kana + kanji
const ItemChineseTest = /[一-鿿]/;
const ItemKoreanTest = KoreanTextTest;
const ItemCyrillicTest = /[Ѐ-ӿԀ-ԯⷠ-ⷿꙀ-ꚟ]/;
const ItemGreekTest = GreekTextTest;

// Any original (non-Latin) romanizable script — used in dev to flag residue.
const ResidualScriptTest =
  /[぀-ヿ一-鿿가-힯ᄀ-ᇿ㄰-㆏Ѐ-ԯͰ-Ͽἀ-῿]/;

// Load Packages
RetrievePackage("pinyin", "4.0.0", "mjs")
  .catch(() => {});

RetrievePackage("aromanize", "1.0.0", "js")
  .catch(() => {});

RetrievePackage("GreekRomanization", "1.0.0", "js")
  .catch(() => {});

type RomanizationBranch = "Japanese" | "Chinese" | "Korean" | "Cyrillic" | "Greek";

// Priority order used both for detection and for composing converters per item.
const SCRIPT_PRIORITY: RomanizationBranch[] = [
  "Japanese",
  "Chinese",
  "Korean",
  "Cyrillic",
  "Greek",
];

type RomanizationPackages = {
  aromanize?: any;
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

// Load every package needed for the scripts present in the current song, once.
// (Cyrillic uses the statically-imported cyrillicToLatin, so it needs nothing.)
const loadPackagesForScripts = async (
  scripts: RomanizationBranch[]
): Promise<RomanizationPackages> => {
  const packages: RomanizationPackages = {};
  for (const script of scripts) {
    if (script === "Japanese") {
      await RomajiPromise;
    } else if (script === "Chinese") {
      packages.pinyin = await RetrievePackage("pinyin", "4.0.0", "mjs");
    } else if (script === "Korean") {
      packages.aromanize = await RetrievePackage("aromanize", "1.0.0", "js");
    } else if (script === "Greek") {
      packages.greekRomanization = await RetrievePackage("GreekRomanization", "1.0.0", "js");
    }
  }
  return packages;
};

// --- Pure converter steps: romanize their own script, pass everything else
// through unchanged so they can be composed for mixed-script text. ---

const romanizeJapaneseText = async (text: string): Promise<string> => {
  await RomajiPromise;
  return await RomajiConverter.convert(text, { to: "romaji", mode: "spaced" });
};

const romanizeChineseText = (text: string, pinyin: any): string => {
  if (!pinyin) return text;
  const result = pinyin.pinyin(text, { segment: false, group: true });
  return result.join("-");
};

const romanizeKoreanText = (text: string, aromanize: any): string => {
  if (!aromanize) return text;
  return aromanize.default(text, "RevisedRomanizationTransliteration");
};

const romanizeCyrillicText = (text: string): string => {
  const result = cyrillicToLatin(text);
  return result != null ? result : text;
};

const romanizeGreekText = (text: string, greekRomanization: any): string => {
  if (!greekRomanization) return text;
  const result = greekRomanization.default(text);
  return result != null ? result : text;
};

// One unit of romanization work. `target` is the object that receives
// TransliteratedText (a line, or an individual syllable); `line` is the
// line-level object that receives the HasTransliterations flag. For Static and
// Line lyrics these are the same object; for Syllable lyrics `line` is the
// vocal group while `target` is each syllable.
type RomanizeEntry = { target: any; line: any };

// Collect the units that get romanized plus the text franc analyses.
// The traversal (and which objects are romanized) is identical to the original
// per-type logic; only Lead syllables feed franc, Background syllables are still
// romanized.
const gatherText = (
  lyrics: any
): { francText: string; scriptText: string; entries: RomanizeEntry[] } => {
  const entries: RomanizeEntry[] = [];
  const textLines: string[] = [];
  const bgTextLines: string[] = [];

  if (lyrics.Type === "Static") {
    for (const line of lyrics.Lines) {
      entries.push({ target: line, line });
      textLines.push(line.Text);
    }
  } else if (lyrics.Type === "Line") {
    for (const vocalGroup of lyrics.Content) {
      if (vocalGroup.Type === "Vocal") {
        entries.push({ target: vocalGroup, line: vocalGroup });
        textLines.push(vocalGroup.Text);
      }
    }
  } else if (lyrics.Type === "Syllable") {
    for (const vocalGroup of lyrics.Content) {
      if (vocalGroup.Type !== "Vocal") continue;

      const syllables = vocalGroup.Lead.Syllables;
      if (syllables.length > 0) {
        let text = syllables[0].Text;
        entries.push({ target: syllables[0], line: vocalGroup });
        for (let index = 1; index < syllables.length; index += 1) {
          const syllable = syllables[index];
          text += `${syllable.IsPartOfWord ? "" : " "}${syllable.Text}`;
          entries.push({ target: syllable, line: vocalGroup });
        }
        textLines.push(text);
      }

      if (vocalGroup.Background !== undefined) {
        for (const syllable of vocalGroup.Background[0].Syllables) {
          entries.push({ target: syllable, line: vocalGroup });
          bgTextLines.push(syllable.Text);
        }
      }
    }
  }

  // franc analyses lead text only (so Language detection is unchanged); script
  // detection additionally considers background vocals, which are romanized too.
  const francText = textLines.join("\n");
  const scriptText =
    bgTextLines.length > 0 ? `${francText}\n${bgTextLines.join("\n")}` : francText;
  return { francText, scriptText, entries };
};

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

// Romanize a single entry by composing every present-script converter whose
// characters it contains, in priority order, feeding each step's output forward.
// Returns true if it produced a transliteration for this entry.
const romanizeEntry = async (
  entry: RomanizeEntry,
  presentScripts: RomanizationBranch[],
  packages: RomanizationPackages
): Promise<boolean> => {
  const { target, line } = entry;

  // Prefer a transliteration the API already provided — only fill in the gaps.
  if (hasTransliteration(target)) return false;

  let text: string = target.Text;
  let changed = false;

  for (const script of presentScripts) {
    if (script === "Japanese") {
      if (ItemJapaneseTest.test(text)) {
        text = await romanizeJapaneseText(text);
        changed = true;
      }
    } else if (script === "Chinese") {
      if (ItemChineseTest.test(text)) {
        text = romanizeChineseText(text, packages.pinyin);
        changed = true;
      }
    } else if (script === "Korean") {
      if (ItemKoreanTest.test(text)) {
        text = romanizeKoreanText(text, packages.aromanize);
        changed = true;
      }
    } else if (script === "Cyrillic") {
      if (ItemCyrillicTest.test(text)) {
        text = romanizeCyrillicText(text);
        changed = true;
      }
    } else if (script === "Greek") {
      if (ItemGreekTest.test(text)) {
        text = romanizeGreekText(text, packages.greekRomanization);
        changed = true;
      }
    }
  }

  if (changed) {
    // TransliteratedText lives on the word/syllable; the HasTransliterations flag
    // lives on the line (and the root) — never on individual words/syllables.
    target.TransliteratedText = text;
    line.HasTransliterations = true;
    if (ResidualScriptTest.test(text)) {
      romanizationLogger.warn(
        "Incomplete romanization (original-script characters remain)",
        { original: target.Text, romanized: text }
      );
    }
  }

  return changed;
};

export const ProcessLyrics = async (lyrics: any) => {
  // Transliterations the API already shipped are preferred and never overwritten,
  // but we still romanize any entry that's missing one — partial API data should
  // not leave gaps.
  const hadApiTransliterations = lyrics.HasTransliterations === true;

  const { francText, scriptText, entries } = gatherText(lyrics);

  const language = franc(francText);
  const languageISO2 = langs.where("3", language)?.["1"];
  lyrics.Language = language;
  lyrics.LanguageISO2 = languageISO2;

  const presentScripts = detectPresentScripts(scriptText, language, languageISO2);

  // Skip the work (incl. loading packages) when there are no romanizable scripts
  // or every entry already has a transliteration.
  let appliedRomanization = false;
  if (presentScripts.length > 0 && entries.some((entry) => !hasTransliteration(entry.target))) {
    const packages = await loadPackagesForScripts(presentScripts);
    const results = await Promise.all(
      entries.map((entry) => romanizeEntry(entry, presentScripts, packages))
    );
    appliedRomanization = results.some(Boolean);
  }

  // True if the API shipped transliterations or we generated any here.
  lyrics.HasTransliterations = hadApiTransliterations || appliedRomanization;

  if (lyrics.HasTransliterations === true) {
    PageContainer?.classList.add("Lyrics_RomanizationAvailable");
  } else {
    PageContainer?.classList.remove("Lyrics_RomanizationAvailable");
  }
};
