import Defaults from "../../../components/Global/Defaults.ts";
import { PageContainer } from "../../../components/Pages/PageView.ts";
import { type StyleProperties, applyStyles, removeAllStyles } from "../../CSS/Styles.ts";
import {
  ClearScrollSimplebar,
  MountScrollSimplebar,
  RecalculateScrollSimplebar,
  ScrollSimplebar,
} from "../../Scrolling/Simplebar/ScrollSimplebar.ts";
import { ClearLyricsPageContainer } from "../fetchLyrics.ts";
import isRtl from "../isRtl.ts";
import {
  ClearLyricsContentArrays,
  LyricsObject,
  type LyricsStatic,
  setRomanizedStatus,
} from "../lyrics.ts";
import { CreateLyricsContainer, DestroyAllLyricsContainers } from "./CreateLyricsContainer.ts";
import { ApplyIsByCommunity } from "./Credits/ApplyIsByCommunity.tsx";
import { ApplyLyricsCredits } from "./Credits/ApplyLyricsCredits.ts";
import { EmitApply, EmitNotApplyed } from "./OnApply.ts";

/**
 * Interface for static lyrics data
 */
export interface StaticLyricsData {
  Type: string;
  Content?: any;
  Lines: Array<{
    Text: string;
    RomanizedText?: string;
  }>;
  offline?: boolean;
  classes?: string;
  styles?: StyleProperties;
  source?: "spt" | "spl" | "aml";
}

/**
 * Apply static lyrics to the lyrics container
 * @param data - Static lyrics data
 */
export function ApplyStaticLyrics(data: StaticLyricsData, UseRomanized: boolean = false): void {
  if (!Defaults.LyricsContainerExists) return;

  EmitNotApplyed();

  DestroyAllLyricsContainers();

  const LyricsContainerParent = PageContainer?.querySelector<HTMLElement>(
    ".LyricsContainer .LyricsContent"
  );
  const LyricsContainerInstance = CreateLyricsContainer();
  const LyricsContainer = LyricsContainerInstance.Container;

  if (!LyricsContainer) {
    console.error("Cannot apply static lyrics: LyricsContainer not found");
    return;
  }

  LyricsContainer.setAttribute("data-lyrics-type", "Static");

  ClearLyricsContentArrays();
  ClearScrollSimplebar();
  ClearLyricsPageContainer();

  data.Lines.forEach((line) => {
    const lineElem = document.createElement("div");

    lineElem.textContent =
      UseRomanized && line.RomanizedText !== undefined ? line.RomanizedText : line.Text;

    if (isRtl(line.Text) && !lineElem.classList.contains("rtl")) {
      lineElem.classList.add("rtl");
    }

    lineElem.classList.add("line");
    lineElem.classList.add("static");

    // Add the line element to the lyrics object
    const staticLine: LyricsStatic = {
      HTMLElement: lineElem,
    };

    LyricsObject.Types.Static.Lines.push(staticLine);
    LyricsContainer.appendChild(lineElem);
  });

  ApplyLyricsCredits(data, LyricsContainer);
  ApplyIsByCommunity(data, LyricsContainer);
  if (LyricsContainerParent) {
    LyricsContainerInstance.Append(LyricsContainerParent);
  }

  // Handle scrollbar
  if (ScrollSimplebar) {
    RecalculateScrollSimplebar();
  } else {
    MountScrollSimplebar();
  }

  // Apply styling to the content container
  const LyricsStylingContainer = PageContainer?.querySelector<HTMLElement>(
    ".LyricsContainer .LyricsContent .simplebar-content"
  );

  if (LyricsStylingContainer) {
    if (data.offline) {
      LyricsStylingContainer.classList.add("offline");
    }

    removeAllStyles(LyricsStylingContainer);

    if (data.classes) {
      LyricsStylingContainer.className = data.classes;
    }

    if (data.styles) {
      applyStyles(LyricsStylingContainer, data.styles);
    }
  }

  EmitApply(data.Type, data.Content);

  setRomanizedStatus(UseRomanized);
}
