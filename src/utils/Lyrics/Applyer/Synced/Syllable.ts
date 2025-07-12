import Defaults from "../../../../components/Global/Defaults";
import { applyStyles, removeAllStyles } from "../../../CSS/Styles";
import { ClearScrollSimplebar, MountScrollSimplebar, RecalculateScrollSimplebar, ScrollSimplebar } from "../../../Scrolling/Simplebar/ScrollSimplebar";
import { ConvertTime } from "../../ConvertTime";
import { ClearLyricsContentArrays, CurrentLineLyricsObject, endInterludeEarlierBy, lyricsBetweenShow, LyricsObject, SetWordArrayInCurentLine, SimpleLyricsMode_InterludeAddonTime } from "../../lyrics";
import { ApplyLyricsCredits } from "../Credits/ApplyLyricsCredits";
import { IsLetterCapable } from "../Utils/IsLetterCapable";
import Emphasize from "../Utils/Emphasize";
import { IdleEmphasisLyricsScale, IdleLyricsScale } from "../../Animator/Shared";
import isRtl from '../../isRtl';
import { ClearLyricsPageContainer } from '../../fetchLyrics';
import { EmitApply, EmitNotApplyed } from '../OnApply';
import { CreateLyricsContainer, DestroyAllLyricsContainers } from "../CreateLyricsContainer";
import { ApplyIsByCommunity } from "../Credits/ApplyIsByCommunity";

// Define the data structure for syllable lyrics
interface SyllableData {
  Text: string;
  StartTime: number;
  EndTime: number;
  IsPartOfWord?: boolean;
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
  source?: "spt" | "spl" | "aml";
  classes?: string;
  styles?: Record<string, string>;
}


export function ApplySyllableLyrics(data: LyricsData): void {
  if (!Defaults.LyricsContainerExists) return;
  EmitNotApplyed();

  DestroyAllLyricsContainers();
  const LyricsContainerParent = document.querySelector<HTMLElement>("#SpicyLyricsPage .LyricsContainer .LyricsContent");
  const LyricsContainerInstance = CreateLyricsContainer();
  const LyricsContainer = LyricsContainerInstance.Container;

  // Check if LyricsContainer exists
  if (!LyricsContainer) {
    console.error("LyricsContainer not found");
    return;
  }

  LyricsContainer.setAttribute("data-lyrics-type", "Syllable");

  ClearLyricsContentArrays();
  ClearScrollSimplebar();

  ClearLyricsPageContainer();
  
  if (data.StartTime >= lyricsBetweenShow) {
    const musicalLine = document.createElement("div")
    musicalLine.classList.add("line")
    musicalLine.classList.add("musical-line")
    LyricsObject.Types.Syllable.Lines.push({
      HTMLElement: musicalLine,
      StartTime: 0,
      EndTime: ConvertTime(data.StartTime + endInterludeEarlierBy),
      TotalTime: ConvertTime(data.StartTime + endInterludeEarlierBy),
      DotLine: true
    })

    SetWordArrayInCurentLine();

    if (data.Content[0].OppositeAligned) {
      musicalLine.classList.add("OppositeAligned")
    }

    const dotGroup = document.createElement("div");
    dotGroup.classList.add("dotGroup");

    const musicalDots1 = document.createElement("span");
    const musicalDots2 = document.createElement("span");
    const musicalDots3 = document.createElement("span");

    const totalTime = ConvertTime(data.StartTime);
    const dotTime = totalTime / 3;

    musicalDots1.classList.add("word");
    musicalDots1.classList.add("dot");
    musicalDots1.textContent = "•";

    // Check if Syllables.Lead exists
    if (LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject]?.Syllables?.Lead) {
      LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject].Syllables?.Lead.push({
        HTMLElement: musicalDots1,
        StartTime: 0,
        EndTime: dotTime,
        TotalTime: dotTime,
        Dot: true
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
        StartTime: dotTime,
        EndTime: dotTime * 2,
        TotalTime: dotTime,
        Dot: true
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
        StartTime: dotTime * 2,
        EndTime: ConvertTime(data.StartTime) + (Defaults.SimpleLyricsMode ? SimpleLyricsMode_InterludeAddonTime : -400),
        TotalTime: dotTime,
        Dot: true
      });
    } else {
      console.warn("Syllables.Lead is undefined for CurrentLineLyricsObject");
    }

    dotGroup.appendChild(musicalDots1);
    dotGroup.appendChild(musicalDots2);
    dotGroup.appendChild(musicalDots3);

    musicalLine.appendChild(dotGroup);
    LyricsContainer.appendChild(musicalLine)
  }
    data.Content.forEach((line, index, arr) => {
      const lineElem = document.createElement("div")
      lineElem.classList.add("line")

      const nextLineStartTime = arr[index + 1]?.Lead.StartTime ?? 0;
      
      const lineEndTimeAndNextLineStartTimeDistance =
        nextLineStartTime !== 0 ? nextLineStartTime - line.Lead.EndTime : 0;

      const lineEndTime =
        Defaults.MinimalLyricsMode ?
          nextLineStartTime === 0 ? line.Lead.EndTime :
            lineEndTimeAndNextLineStartTimeDistance < lyricsBetweenShow && nextLineStartTime > line.Lead.EndTime ? nextLineStartTime :
              line.Lead.EndTime : line.Lead.EndTime;
      

      LyricsObject.Types.Syllable.Lines.push({
        HTMLElement: lineElem,
        StartTime: ConvertTime(line.Lead.StartTime),
        EndTime: ConvertTime(lineEndTime),
        TotalTime: ConvertTime(lineEndTime) - ConvertTime(line.Lead.StartTime)
      });

      SetWordArrayInCurentLine();

      if (line.OppositeAligned) {
        lineElem.classList.add("OppositeAligned")
      }


      LyricsContainer.appendChild(lineElem)


      line.Lead.Syllables.forEach((lead, iL, aL) => {
        let word = document.createElement("span")

        if (isRtl(lead.Text) && !lineElem.classList.contains("rtl")) {
          lineElem.classList.add("rtl")
        }

        const totalDuration = ConvertTime(lead.EndTime) - ConvertTime(lead.StartTime);

        const letterLength = lead.Text.split("").length;

        const IfLetterCapable = IsLetterCapable(letterLength, totalDuration);

        if (IfLetterCapable) {

          word = document.createElement("div")
          const letters = lead.Text.split(""); // Split word into individual letters

          Emphasize(letters, word, lead)

          iL === aL.length - 1 ? word.classList.add("LastWordInLine") : lead.IsPartOfWord ? word.classList.add("PartOfWord") : null;

          if (!Defaults.SimpleLyricsMode) {
            word.style.setProperty("--text-shadow-opacity", `0%`);
            word.style.setProperty("--text-shadow-blur-radius", `4px`);
            word.style.scale = IdleEmphasisLyricsScale.toString();
            word.style.transform = `translateY(calc(var(--DefaultLyricsSize) * 0.02))`;
          }

          //const contentDuration = totalDuration > 200 ? totalDuration : 200;
          //word.style.setProperty("--content-duration", `${contentDuration}ms`);

          lineElem.appendChild(word);

        } else {
          word.textContent = lead.Text;

          if (!Defaults.SimpleLyricsMode) {
            word.style.setProperty("--gradient-position", `-20%`);
            word.style.setProperty("--text-shadow-opacity", `0%`);
            word.style.setProperty("--text-shadow-blur-radius", `4px`);
            word.style.scale = IdleLyricsScale.toString();
            word.style.transform = `translateY(calc(var(--DefaultLyricsSize) * 0.01))`;
          }


          word.classList.add("word");

          iL === aL.length - 1 ? word.classList.add("LastWordInLine") : lead.IsPartOfWord ? word.classList.add("PartOfWord") : null;

          lineElem.appendChild(word);

          // Check if Syllables.Lead exists
          if (LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject]?.Syllables?.Lead) {
            LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject].Syllables?.Lead.push({
              HTMLElement: word,
              StartTime: ConvertTime(lead.StartTime),
              EndTime: ConvertTime(lead.EndTime),
              TotalTime: totalDuration,
            });
          } else {
            console.warn("Syllables.Lead is undefined for CurrentLineLyricsObject");
          }
        }

      })

      if (line.Background) {
        line.Background.forEach((bg) => {
          const lineE = document.createElement("div");
          lineE.classList.add("line", "bg-line");

          LyricsObject.Types.Syllable.Lines.push({
            HTMLElement: lineE,
            StartTime: ConvertTime(bg.StartTime),
            EndTime: ConvertTime(bg.EndTime),
            TotalTime: ConvertTime(bg.EndTime) - ConvertTime(bg.StartTime),
            BGLine: true
          })
          SetWordArrayInCurentLine();

          if (line.OppositeAligned) {
              lineE.classList.add("OppositeAligned")
          }
          LyricsContainer.appendChild(lineE)
          bg.Syllables.forEach((bw, bI, bA) => {
            let bwE = document.createElement("span")

            if (isRtl(bw.Text) && !lineE.classList.contains("rtl")) {
              lineE.classList.add("rtl")
            }

            const totalDuration = ConvertTime(bw.EndTime) - ConvertTime(bw.StartTime);

            const letterLength = bw.Text.split("").length;

            const IfLetterCapable = IsLetterCapable(letterLength, totalDuration);

            if (IfLetterCapable) {

              bwE = document.createElement("div")
              const letters = bw.Text.split(""); // Split word into individual letters

              Emphasize(letters, bwE, bw, true)

              bI === bA.length - 1 ? bwE.classList.add("LastWordInLine") : bw.IsPartOfWord ? bwE.classList.add("PartOfWord") : null;

              if (!Defaults.SimpleLyricsMode) {
                bwE.style.setProperty("--text-shadow-opacity", `0%`);
                bwE.style.setProperty("--text-shadow-blur-radius", `4px`);
                bwE.style.scale = IdleEmphasisLyricsScale.toString();
                bwE.style.transform = `translateY(calc(var(--font-size) * 0.02))`;
              }

              //const contentDuration = totalDuration > 200 ? totalDuration : 200;
              //bwE.style.setProperty("--content-duration", `${contentDuration}ms`);

              lineE.appendChild(bwE)

            } else {
              bwE.textContent = bw.Text

              if (!Defaults.SimpleLyricsMode) {
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
                  BGWord: true
                });
              } else {
                console.warn("Syllables.Lead is undefined for CurrentLineLyricsObject");
              }

              bwE.classList.add("bg-word")
              bwE.classList.add("word")

              bI === bA.length - 1 ? bwE.classList.add("LastWordInLine") : bw.IsPartOfWord ? bwE.classList.add("PartOfWord") : null;

              lineE.appendChild(bwE)
            }
          })
        })
      }
        if (arr[index + 1] && arr[index + 1].Lead.StartTime - line.Lead.EndTime >= lyricsBetweenShow) {
          const musicalLine = document.createElement("div")
          musicalLine.classList.add("line")
          musicalLine.classList.add("musical-line")

          LyricsObject.Types.Syllable.Lines.push({
            HTMLElement: musicalLine,
            StartTime: ConvertTime(line.Lead.EndTime),
            EndTime: ConvertTime(arr[index + 1].Lead.StartTime + endInterludeEarlierBy),
            TotalTime: ConvertTime(arr[index + 1].Lead.StartTime + endInterludeEarlierBy) - ConvertTime(line.Lead.EndTime),
            DotLine: true
          })

          SetWordArrayInCurentLine();

          if (arr[index + 1].OppositeAligned) {
            musicalLine.classList.add("OppositeAligned")
          }

          const dotGroup = document.createElement("div");
          dotGroup.classList.add("dotGroup");

          const musicalDots1 = document.createElement("span");
          const musicalDots2 = document.createElement("span");
          const musicalDots3 = document.createElement("span");

          const totalTime = ConvertTime(arr[index + 1].Lead.StartTime) - ConvertTime(line.Lead.EndTime);
          const dotTime = totalTime / 3;

          musicalDots1.classList.add("word");
          musicalDots1.classList.add("dot");
          musicalDots1.textContent = "•";

          // Check if Syllables.Lead exists
          if (LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject]?.Syllables?.Lead) {
            LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject].Syllables?.Lead.push({
              HTMLElement: musicalDots1,
              StartTime: ConvertTime(line.Lead.EndTime),
              EndTime: ConvertTime(line.Lead.EndTime) + dotTime,
              TotalTime: dotTime,
              Dot: true
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
              StartTime: ConvertTime(line.Lead.EndTime) + dotTime,
              EndTime: ConvertTime(line.Lead.EndTime) + (dotTime * 2),
              TotalTime: dotTime,
              Dot: true
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
              StartTime: ConvertTime(line.Lead.EndTime) + (dotTime * 2),
              EndTime: ConvertTime(arr[index + 1].Lead.StartTime) + (Defaults.SimpleLyricsMode ? SimpleLyricsMode_InterludeAddonTime : -400),
              TotalTime: dotTime,
              Dot: true
            });
          } else {
            console.warn("Syllables.Lead is undefined for CurrentLineLyricsObject");
          }

          dotGroup.appendChild(musicalDots1);
          dotGroup.appendChild(musicalDots2);
          dotGroup.appendChild(musicalDots3);

          musicalLine.appendChild(dotGroup);
          LyricsContainer.appendChild(musicalLine)
        }
  });

  ApplyLyricsCredits(data, LyricsContainer);
  ApplyIsByCommunity(data, LyricsContainer);
  
  if (LyricsContainerParent) {
    LyricsContainerInstance.Append(LyricsContainerParent);
  }

  if (ScrollSimplebar) RecalculateScrollSimplebar();
    else MountScrollSimplebar();

  const LyricsStylingContainer = document.querySelector<HTMLElement>("#SpicyLyricsPage .LyricsContainer .LyricsContent .simplebar-content");

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

  EmitApply(data.Type, data.Content)
}

