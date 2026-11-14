import {
  $lyricsContainerExists,
  $minimalLyricsMode,
  $syllableMerge,
  $syllablePace,
  isBloomRenderer,
} from "../../../../utils/stores.ts";
import { PageContainer } from "../../../../components/Pages/PageView.ts";
import { applyStyles, removeAllStyles } from "../../../CSS/Styles.ts";
import {
  ClearScrollSimplebar,
  MountScrollSimplebar,
  RecalculateScrollSimplebar,
  ScrollSimplebar,
} from "../../../Scrolling/Simplebar/ScrollSimplebar.ts";
import { IdleEmphasisLyricsScale, IdleLyricsScale } from "../../Animator/Shared.ts";
import { ConvertTime } from "../../ConvertTime.ts";
import { ClearLyricsPageContainer } from "../../fetchLyrics.ts";
import isRtl from "../../isRtl.ts";
import {
  ClearLyricsContentArrays,
  CurrentLineLyricsObject,
  LyricsObject,
  SetWordArrayInCurentLine,
  getInterludeTimePadding,
  getLyricsBetweenShow,
  setRomanizedStatus,
} from "../../lyrics.ts";
import { CreateLyricsContainer, DestroyAllLyricsContainers } from "../CreateLyricsContainer.ts";
import { StripZeroWidth } from "../Utils/StripZeroWidth.ts";
import { PickDisplayText, PickPartOfWord } from "../Utils/PickDisplayText.ts";
import { AppendSyllableRomanization, RomanizeUnderLine } from "../Utils/RomanizedRow.ts";
import { SetLineTranslation, TranslationModeNow, TranslationOf } from "../Utils/TranslationRow.ts";
import { StripBackgroundRomanParens } from "../Utils/StripWrappingParens.ts";
import { initLyricsVirtualizer } from "../../LyricsVirtualizer.ts";
import { ApplySongCredits, MarkLastLineSide } from "../Credits/ApplyLyricsCredits.ts";
import { EmitApply, EmitNotApplyed } from "../OnApply.ts";
import Emphasize, { createFlameGroup, type FlameGroup, type SyllablePart } from "../Utils/Emphasize.ts";
import { IsLetterCapable, MinLetterCapableDuration } from "../Utils/IsLetterCapable.ts";
import { JoinSplitWords } from "../Utils/JoinSplitWords.ts";
import { SplitLetters } from "../Utils/SplitLetters.ts";
import { HasRenderableText, IsEmptySyllableGroup, RemoveEmptyLyricsLines } from "../../EmptyLines.ts";
import Logger from "../../../Logger.ts";

const syllableLogger = new Logger("Syllable Lyrics");

// Define the data structure for syllable lyrics
interface SyllableData {
  Text: string;
  TransliteratedText?: string;
  StartTime: number;
  EndTime: number;
  IsPartOfWord?: boolean;
  TransliteratedIsPartOfWord?: boolean;
  // A word joined from syllables keeps them here.
  Parts?: SyllableData[];
}

interface LeadData {
  StartTime: number;
  EndTime: number;
  Syllables: SyllableData[];
}

interface BackgroundData {
  StartTime: number;
  EndTime: number;
  Syllables: SyllableData[];
}

interface LineData {
  Lead: LeadData;
  Background?: BackgroundData[];
  OppositeAligned?: boolean;
}

interface LyricsData {
  Type: string;
  Content: LineData[];
  StartTime: number;
  SongWriters?: string[];
  source?: "spt" | "spl" | "aml" | "uns";
  classes?: string;
  styles?: Record<string, string>;
}

// Joined before the empty parts are dropped, so a separator between two words
// still ends the run and they aren't joined across it.
// The romanization can end words the source text runs together (romaji under
// Japanese), so the romanized view takes its word breaks from there.
const renderableSyllables = (syllables: SyllableData[], useRomanized: boolean): SyllableData[] => {
  const words = useRomanized
    ? syllables.map((s) =>
        s.TransliteratedIsPartOfWord === undefined ? s : { ...s, IsPartOfWord: s.TransliteratedIsPartOfWord }
      )
    : syllables;
  const merge = $syllableMerge.get();
  const parts =
    merge === "off"
      ? words
      : JoinSplitWords(words, merge, (word) => splitLetters(word, useRomanized) !== null);
  return parts.filter(HasRenderableText);
};

// A syllable's letters when it's held long enough to be drawn letter by letter, else null.
function splitLetters(syllable: SyllableData, useRomanized: boolean): string[] | null {
  const duration = ConvertTime(syllable.EndTime) - ConvertTime(syllable.StartTime);
  // Too short to split whatever its letters: skip the grapheme split.
  if (duration < MinLetterCapableDuration()) return null;
  const text = StripZeroWidth(PickDisplayText(syllable, useRomanized));
  const letters = SplitLetters(text);
  return letters.length > 0 && IsLetterCapable(letters.length, duration) && !isRtl(text) ? letters : null;
}

// With Keep Syllable Pace, where each syllable of a joined word starts and how
// many of its letters it has, so Emphasize can time them by syllable. Undefined
// for a word that wasn't joined, or whose syllables split into other letters.
function pacedParts(
  syllable: SyllableData,
  useRomanized: boolean,
  letterCount: number
): SyllablePart[] | undefined {
  if (!syllable.Parts || !$syllablePace.get()) return undefined;
  const parts = syllable.Parts.map((part) => ({
    StartTime: part.StartTime,
    Letters: SplitLetters(StripZeroWidth(PickDisplayText(part, useRomanized))).length,
  }));
  return parts.reduce((sum, part) => sum + part.Letters, 0) === letterCount ? parts : undefined;
}

// Bloom judges a word sung in syllables as a whole: whether it's split into
// letters, and how far the fill edge runs past it, go by the whole word's
// letters and length. Spring keeps judging each syllable alone.
type WordPlan = { Letters: string[]; Split: boolean; WordLetters: number; Group: FlameGroup | null };

function planWords(parts: SyllableData[], UseRomanized: boolean, isBackground: boolean): WordPlan[] {
  const texts = parts.map((part) => StripZeroWidth(PickDisplayText(part, UseRomanized)));
  const durations = parts.map((part) => ConvertTime(part.EndTime) - ConvertTime(part.StartTime));
  const lettersOf = (i: number, duration: number) =>
    duration >= MinLetterCapableDuration() ? SplitLetters(texts[i]) : [];
  const plans: WordPlan[] = [];
  for (let i = 0; i < parts.length; i++) {
    let end = i;
    if (isBloomRenderer()) {
      while (PickPartOfWord(parts[end], UseRomanized) && end + 1 < parts.length) end++;
    }
    if (end === i) {
      const letters = lettersOf(i, durations[i]);
      plans.push({
        Letters: letters,
        Split:
          letters.length > 0 && IsLetterCapable(letters.length, durations[i], isBackground) && !isRtl(texts[i]),
        WordLetters: letters.length || SplitLetters(texts[i]).length,
        Group: null,
      });
      continue;
    }
    const duration = ConvertTime(parts[end].EndTime) - ConvertTime(parts[i].StartTime);
    const letters = parts.slice(i, end + 1).map((_, k) => lettersOf(i + k, duration));
    const total = letters.reduce((sum, l) => sum + l.length, 0);
    const split =
      total > 0 &&
      IsLetterCapable(total, duration, isBackground) &&
      !texts.slice(i, end + 1).some((text) => isRtl(text));
    const group = split ? createFlameGroup(parts[i].StartTime, parts[end].EndTime) : null;
    for (let k = 0; k <= end - i; k++) {
      plans.push({
        Letters: letters[k],
        Split: split && letters[k].length > 0,
        WordLetters: total || texts.slice(i, end + 1).join("").length,
        Group: group,
      });
    }
    i = end;
  }
  return plans;
}

// The whole word's letter count, for the fill edge (see getLineSweep).
const tagWordLetters = (count: number) => {
  const lead = LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject]?.Syllables?.Lead;
  const entry = lead?.[lead.length - 1] as { WordLetters?: number } | undefined;
  if (entry) entry.WordLetters = count;
};

export function ApplySyllableLyrics(data: LyricsData, UseRomanized: boolean = false): void {
  if (!$lyricsContainerExists.get()) return;
  // Under each line, the line keeps its own text and the romanization gets a row below it.
  const UnderLine = RomanizeUnderLine();
  const ShowRomanized = UseRomanized && !UnderLine;
  // Replacing lines with their translation renders line-synced (Global/Applyer).
  const TranslateUnderLine = TranslationModeNow() === "underLine";
  EmitNotApplyed();

  DestroyAllLyricsContainers();
  const LyricsContainerParent = PageContainer?.querySelector<HTMLElement>(
    ".LyricsContainer .LyricsContent"
  );
  const LyricsContainerInstance = CreateLyricsContainer();
  const LyricsContainer = LyricsContainerInstance.Container;

  // Check if LyricsContainer exists
  if (!LyricsContainer) {
    syllableLogger.error("LyricsContainer not found");
    return;
  }

  const content = RemoveEmptyLyricsLines(data.Content);

  const hasOppositeAligned = content.some(item => item.OppositeAligned === true);
  LyricsContainer.classList.toggle("HasDuetLines", hasOppositeAligned);
  const hasRtlLines = content.some(line =>
    line.Lead.Syllables.some(syllable => isRtl(syllable.Text)) ||
    line.Background?.some(bg => bg.Syllables.some(syllable => isRtl(syllable.Text))) === true
  );
  LyricsContainer.classList.toggle("HasRtlLines", hasRtlLines);
  const lastLine = content[content.length - 1];
  MarkLastLineSide(
    LyricsContainer,
    !!lastLine?.OppositeAligned,
    !!lastLine?.Lead.Syllables.some(syllable => isRtl(syllable.Text))
  );

  LyricsContainer.setAttribute("data-lyrics-type", "Syllable");

  ClearLyricsContentArrays();
  ClearScrollSimplebar();

  ClearLyricsPageContainer();

  const virtualContainer = document.createElement("div");
  virtualContainer.classList.add("VirtualLyricsContainer");
  LyricsContainer.appendChild(virtualContainer);

  const lineElements: HTMLElement[] = [];

  if (data.StartTime >= getLyricsBetweenShow()) {
    const musicalLine = document.createElement("div");
    musicalLine.classList.add("line");
    musicalLine.classList.add("musical-line");
    LyricsObject.Types.Syllable.Lines.push({
      HTMLElement: musicalLine,
      StartTime: 0,
      EndTime: ConvertTime(data.StartTime),
      TotalTime: ConvertTime(data.StartTime),
      DotLine: true,
    });

    SetWordArrayInCurentLine();

    if (content[0]?.OppositeAligned) {
      musicalLine.classList.add("OppositeAligned");
    }

    const dotGroup = document.createElement("div");
    dotGroup.classList.add("dotGroup");

    const musicalDots1 = document.createElement("span");
    const musicalDots2 = document.createElement("span");
    const musicalDots3 = document.createElement("span");

    const totalTime = ConvertTime(data.StartTime);
    const baseDotTime = totalTime / 3;
    const dotPadding = getInterludeTimePadding() / 3;
    const dot1EndTime = Math.max(0, baseDotTime + dotPadding);
    const dot2EndTime = Math.max(dot1EndTime, baseDotTime * 2 + dotPadding * 2);
    const dot3EndTime = Math.max(dot2EndTime, totalTime + getInterludeTimePadding());

    musicalDots1.classList.add("word");
    musicalDots1.classList.add("dot");
    musicalDots1.textContent = "•";

    // Check if Syllables.Lead exists
    if (LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject]?.Syllables?.Lead) {
      LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject].Syllables?.Lead.push({
        HTMLElement: musicalDots1,
        StartTime: 0,
        EndTime: dot1EndTime,
        TotalTime: dot1EndTime,
        Dot: true,
      });
    } else {
      console.warn("Syllables.Lead is undefined for CurrentLineLyricsObject");
    }

    musicalDots2.classList.add("word");
    musicalDots2.classList.add("dot");
    musicalDots2.textContent = "•";

    // Check if Syllables.Lead exists
    if (LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject]?.Syllables?.Lead) {
      LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject].Syllables?.Lead.push({
        HTMLElement: musicalDots2,
        StartTime: dot1EndTime,
        EndTime: dot2EndTime,
        TotalTime: dot2EndTime - dot1EndTime,
        Dot: true,
      });
    } else {
      console.warn("Syllables.Lead is undefined for CurrentLineLyricsObject");
    }

    musicalDots3.classList.add("word");
    musicalDots3.classList.add("dot");
    musicalDots3.textContent = "•";

    // Check if Syllables.Lead exists
    if (LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject]?.Syllables?.Lead) {
      LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject].Syllables?.Lead.push({
        HTMLElement: musicalDots3,
        StartTime: dot2EndTime,
        EndTime: dot3EndTime,
        TotalTime: dot3EndTime - dot2EndTime,
        Dot: true,
      });
    } else {
      console.warn("Syllables.Lead is undefined for CurrentLineLyricsObject");
    }

    dotGroup.appendChild(musicalDots1);
    dotGroup.appendChild(musicalDots2);
    dotGroup.appendChild(musicalDots3);

    musicalLine.appendChild(dotGroup);
    lineElements.push(musicalLine);
  }
  content.forEach((line, index, arr) => {
    const lineElem = document.createElement("div");
    lineElem.classList.add("line");

    const nextLineStartTime = arr[index + 1]?.Lead.StartTime ?? 0;

    const lineEndTimeAndNextLineStartTimeDistance =
      nextLineStartTime !== 0 ? nextLineStartTime - line.Lead.EndTime : 0;

    // Fade Away Previous Lines and Bloom keep a line active until the next one
    // starts, unless the gap is long enough for an interlude.
    const lineEndTime =
      $minimalLyricsMode.get() || isBloomRenderer()
        ? nextLineStartTime === 0
          ? line.Lead.EndTime
          : lineEndTimeAndNextLineStartTimeDistance < getLyricsBetweenShow() &&
              nextLineStartTime > line.Lead.EndTime
            ? nextLineStartTime
            : line.Lead.EndTime
        : line.Lead.EndTime;

    LyricsObject.Types.Syllable.Lines.push({
      HTMLElement: lineElem,
      StartTime: ConvertTime(line.Lead.StartTime),
      EndTime: ConvertTime(lineEndTime),
      TotalTime: ConvertTime(lineEndTime) - ConvertTime(line.Lead.StartTime),
      LeadEndTime: ConvertTime(line.Lead.EndTime),
    });

    SetWordArrayInCurentLine();

    if (line.OppositeAligned) {
      lineElem.classList.add("OppositeAligned");
    }

    lineElements.push(lineElem);

    let currentWordGroup: HTMLSpanElement | null = null;

    const leadParts = renderableSyllables(line.Lead.Syllables, ShowRomanized);
    const leadPlans = planWords(leadParts, ShowRomanized, false);

    leadParts.forEach((lead, iL, aL) => {
      let word = document.createElement("span");
      const leadPartOfWord = PickPartOfWord(lead, ShowRomanized);

      if (isRtl(lead.Text) && !lineElem.classList.contains("rtl")) {
        lineElem.classList.add("rtl");
      }

      const totalDuration = ConvertTime(lead.EndTime) - ConvertTime(lead.StartTime);

      const leadRenderText = StripZeroWidth(
        PickDisplayText(lead, ShowRomanized)
      );

      const plan = leadPlans[iL];
      const letters = plan.Letters;

      if (plan.Split) {
        word = document.createElement("div");
        Emphasize(letters, word, lead, false, pacedParts(lead, ShowRomanized, letters.length), plan.Group);
        tagWordLetters(plan.WordLetters);

        iL === aL.length - 1
          ? word.classList.add("LastWordInLine")
          : leadPartOfWord
            ? word.classList.add("PartOfWord")
            : null;

        if (!isBloomRenderer()) {
          word.style.setProperty("--text-shadow-opacity", `0%`);
          word.style.setProperty("--text-shadow-blur-radius", `4px`);
          word.style.scale = IdleEmphasisLyricsScale.toString();
          word.style.transform = `translateY(calc(var(--DefaultLyricsSize) * 0.02))`;
        }
      } else {
        word.textContent = leadRenderText;

        if (!isBloomRenderer()) {
          word.style.setProperty("--gradient-position", `-20%`);
          word.style.setProperty("--text-shadow-opacity", `0%`);
          word.style.setProperty("--text-shadow-blur-radius", `4px`);
          word.style.scale = IdleLyricsScale.toString();
          word.style.transform = `translateY(calc(var(--DefaultLyricsSize) * 0.01))`;
        }

        word.classList.add("word");

        iL === aL.length - 1
          ? word.classList.add("LastWordInLine")
          : leadPartOfWord
            ? word.classList.add("PartOfWord")
            : null;

        if (LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject]?.Syllables?.Lead) {
          LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject].Syllables?.Lead.push({
            HTMLElement: word,
            StartTime: ConvertTime(lead.StartTime),
            EndTime: ConvertTime(lead.EndTime),
            TotalTime: totalDuration,
          });
          tagWordLetters(plan.WordLetters);
        } else {
          console.warn("Syllables.Lead is undefined for CurrentLineLyricsObject");
        }
      }

      const prevPartOfWord = iL > 0 && PickPartOfWord(aL[iL - 1], ShowRomanized);

      if (leadPartOfWord || (prevPartOfWord && currentWordGroup)) {
        if (!currentWordGroup) {
          const group = document.createElement("span");
          group.classList.add("word-group");
          lineElem.appendChild(group);
          currentWordGroup = group;
        }

        currentWordGroup.appendChild(word);

        if (!leadPartOfWord && prevPartOfWord) {
          currentWordGroup = null;
        }
      } else {
        currentWordGroup = null;
        lineElem.appendChild(word);
      }
    });

    const backgrounds = line.Background?.filter((bg) => !IsEmptySyllableGroup(bg)) ?? [];
    if (UnderLine) {
      AppendSyllableRomanization(lineElem, line.Lead.Syllables, backgrounds.length > 0);
    }
    if (TranslateUnderLine) {
      SetLineTranslation(lineElem, TranslationOf(line.Lead) || TranslationOf(line), backgrounds.length > 0);
    }

    if (line.Background) {
      line.Background.filter((bg) => !IsEmptySyllableGroup(bg)).forEach((bg) => {
        const lineE = document.createElement("div");
        lineE.classList.add("line", "bg-line");

        LyricsObject.Types.Syllable.Lines.push({
          HTMLElement: lineE,
          StartTime: ConvertTime(bg.StartTime),
          EndTime: ConvertTime(bg.EndTime),
          TotalTime: ConvertTime(bg.EndTime) - ConvertTime(bg.StartTime),
          BGLine: true,
        });
        SetWordArrayInCurentLine();

        if (line.OppositeAligned) {
          lineE.classList.add("OppositeAligned");
        }
        lineElements.push(lineE);

        let currentBGWordGroup: HTMLSpanElement | null = null;
        const bgSyllables = StripBackgroundRomanParens(bg.Syllables);

        const bgParts = renderableSyllables(bgSyllables, ShowRomanized);
        const bgPlans = planWords(bgParts, ShowRomanized, true);

        bgParts.forEach((bw, bI, bA) => {
          let bwE = document.createElement("span");
          const bgPartOfWord = PickPartOfWord(bw, ShowRomanized);

          if (isRtl(bw.Text) && !lineE.classList.contains("rtl")) {
            lineE.classList.add("rtl");
          }

          const bgRenderText = StripZeroWidth(
            PickDisplayText(bw, ShowRomanized)
          );

          const plan = bgPlans[bI];

          if (plan.Split) {
            bwE = document.createElement("div");
            Emphasize(plan.Letters, bwE, bw, true, pacedParts(bw, ShowRomanized, plan.Letters.length), plan.Group);
            tagWordLetters(plan.WordLetters);

            bI === bA.length - 1
              ? bwE.classList.add("LastWordInLine")
              : bgPartOfWord
                ? bwE.classList.add("PartOfWord")
                : null;

            if (!isBloomRenderer()) {
              bwE.style.setProperty("--text-shadow-opacity", `0%`);
              bwE.style.setProperty("--text-shadow-blur-radius", `4px`);
              bwE.style.scale = IdleEmphasisLyricsScale.toString();
              bwE.style.transform = `translateY(calc(var(--font-size) * 0.02))`;
            }
          } else {
            bwE.textContent = bgRenderText;

            if (!isBloomRenderer()) {
              bwE.style.setProperty("--gradient-position", `0%`);
              bwE.style.setProperty("--text-shadow-opacity", `0%`);
              bwE.style.setProperty("--text-shadow-blur-radius", `4px`);
              bwE.style.scale = IdleLyricsScale.toString();
              bwE.style.transform = `translateY(calc(var(--font-size) * 0.01))`;
            }

            // Check if Syllables.Lead exists
            if (LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject]?.Syllables?.Lead) {
              LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject].Syllables?.Lead.push({
                HTMLElement: bwE,
                StartTime: ConvertTime(bw.StartTime),
                EndTime: ConvertTime(bw.EndTime),
                TotalTime: ConvertTime(bw.EndTime) - ConvertTime(bw.StartTime),
                BGWord: true,
              });
              tagWordLetters(plan.WordLetters);
            } else {
              console.warn("Syllables.Lead is undefined for CurrentLineLyricsObject");
            }

            bwE.classList.add("bg-word");
            bwE.classList.add("word");

            bI === bA.length - 1
              ? bwE.classList.add("LastWordInLine")
              : bgPartOfWord
                ? bwE.classList.add("PartOfWord")
                : null;
          }

          const prevBGPartOfWord = bI > 0 && PickPartOfWord(bA[bI - 1], ShowRomanized);

          if (bgPartOfWord || (prevBGPartOfWord && currentBGWordGroup)) {
            if (!currentBGWordGroup) {
              const group = document.createElement("span");
              group.classList.add("word-group");
              lineE.appendChild(group);
              currentBGWordGroup = group;
            }

            currentBGWordGroup.appendChild(bwE);

            if (!bgPartOfWord && prevBGPartOfWord) {
              currentBGWordGroup = null;
            }
          } else {
            currentBGWordGroup = null;
            lineE.appendChild(bwE);
          }
        });

        if (UnderLine) AppendSyllableRomanization(lineE, bgSyllables);
        if (TranslateUnderLine) SetLineTranslation(lineE, TranslationOf(bg, true));
      });
    }
    if (arr[index + 1] && arr[index + 1].Lead.StartTime - line.Lead.EndTime >= getLyricsBetweenShow()) {
      const musicalLine = document.createElement("div");
      musicalLine.classList.add("line");
      musicalLine.classList.add("musical-line");

      LyricsObject.Types.Syllable.Lines.push({
        HTMLElement: musicalLine,
        StartTime: ConvertTime(line.Lead.EndTime),
        EndTime: ConvertTime(arr[index + 1].Lead.StartTime),
        TotalTime:
          ConvertTime(arr[index + 1].Lead.StartTime) -
          ConvertTime(line.Lead.EndTime),
        DotLine: true,
      });

      SetWordArrayInCurentLine();

      if (arr[index + 1].OppositeAligned) {
        musicalLine.classList.add("OppositeAligned");
      }

      const dotGroup = document.createElement("div");
      dotGroup.classList.add("dotGroup");

      const musicalDots1 = document.createElement("span");
      const musicalDots2 = document.createElement("span");
      const musicalDots3 = document.createElement("span");

      const gapStartTime = ConvertTime(line.Lead.EndTime);
      const totalTime = ConvertTime(arr[index + 1].Lead.StartTime) - gapStartTime;
      const baseDotTime = totalTime / 3;
      const dotPadding = getInterludeTimePadding() / 3;
      const dot1EndTime = Math.max(gapStartTime, gapStartTime + baseDotTime + dotPadding);
      const dot2EndTime = Math.max(dot1EndTime, gapStartTime + baseDotTime * 2 + dotPadding * 2);
      const dot3EndTime = Math.max(dot2EndTime, gapStartTime + totalTime + getInterludeTimePadding());

      musicalDots1.classList.add("word");
      musicalDots1.classList.add("dot");
      musicalDots1.textContent = "•";

      // Check if Syllables.Lead exists
      if (LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject]?.Syllables?.Lead) {
        LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject].Syllables?.Lead.push({
          HTMLElement: musicalDots1,
          StartTime: gapStartTime,
          EndTime: dot1EndTime,
          TotalTime: dot1EndTime - gapStartTime,
          Dot: true,
        });
      } else {
        console.warn("Syllables.Lead is undefined for CurrentLineLyricsObject");
      }

      musicalDots2.classList.add("word");
      musicalDots2.classList.add("dot");
      musicalDots2.textContent = "•";

      // Check if Syllables.Lead exists
      if (LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject]?.Syllables?.Lead) {
        LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject].Syllables?.Lead.push({
          HTMLElement: musicalDots2,
          StartTime: dot1EndTime,
          EndTime: dot2EndTime,
          TotalTime: dot2EndTime - dot1EndTime,
          Dot: true,
        });
      } else {
        console.warn("Syllables.Lead is undefined for CurrentLineLyricsObject");
      }

      musicalDots3.classList.add("word");
      musicalDots3.classList.add("dot");
      musicalDots3.textContent = "•";

      // Check if Syllables.Lead exists
      if (LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject]?.Syllables?.Lead) {
        LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject].Syllables?.Lead.push({
          HTMLElement: musicalDots3,
          StartTime: dot2EndTime,
          EndTime: dot3EndTime,
          TotalTime: dot3EndTime - dot2EndTime,
          Dot: true,
        });
      } else {
        console.warn("Syllables.Lead is undefined for CurrentLineLyricsObject");
      }

      dotGroup.appendChild(musicalDots1);
      dotGroup.appendChild(musicalDots2);
      dotGroup.appendChild(musicalDots3);

      musicalLine.appendChild(dotGroup);
      lineElements.push(musicalLine);
    }
  });

  ApplySongCredits(data, LyricsContainer);

  if (LyricsContainerParent) {
    LyricsContainerInstance.Append(LyricsContainerParent);
  }

  if (ScrollSimplebar) RecalculateScrollSimplebar();
  else MountScrollSimplebar();

  const scrollEl = ScrollSimplebar?.getScrollElement() as HTMLElement | undefined;
  if (scrollEl) initLyricsVirtualizer(scrollEl, virtualContainer, lineElements);

  const LyricsStylingContainer = PageContainer?.querySelector<HTMLElement>(
    ".LyricsContainer .LyricsContent .simplebar-content"
  );

  // Check if LyricsStylingContainer exists
  if (LyricsStylingContainer) {
    removeAllStyles(LyricsStylingContainer);

    if (data.classes) {
      LyricsStylingContainer.className = data.classes;
    }

    if (data.styles) {
      applyStyles(LyricsStylingContainer, data.styles);
    }
  } else {
    console.warn("LyricsStylingContainer not found");
  }

  EmitApply(data.Type, content);

  setRomanizedStatus(UseRomanized);
}
