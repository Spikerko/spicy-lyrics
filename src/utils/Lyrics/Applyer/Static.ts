import { $lyricsContainerExists } from "../../../utils/stores.ts";
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
import { initLyricsVirtualizer } from "../LyricsVirtualizer.ts";
import { ApplyIsByCommunity } from "./Credits/ApplyIsByCommunity.tsx";
import { ApplyLyricsCredits } from "./Credits/ApplyLyricsCredits.ts";
import { EmitApply, EmitNotApplyed } from "./OnApply.ts";
import { ApplyLyricsProvider } from "./Credits/ApplyProvider.ts";

/**
 * Interface for static lyrics data
 */
export interface StaticLyricsData {
  Type: string;
  Lines: Array<{
    Text: string;
    TransliteratedText?: string;
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
  if (!$lyricsContainerExists.get()) return;

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

  LyricsContainer.classList.remove("HasDuetLines");
  const hasRtlLines = data.Lines.some(line => isRtl(line.Text));
  LyricsContainer.classList.toggle("HasRtlLines", hasRtlLines);

  LyricsContainer.setAttribute("data-lyrics-type", "Static");

  ClearLyricsContentArrays();
  ClearScrollSimplebar();
  ClearLyricsPageContainer();

  const virtualContainer = document.createElement("div");
  virtualContainer.classList.add("VirtualLyricsContainer");
  LyricsContainer.appendChild(virtualContainer);

  const lineElements: HTMLElement[] = [];

  data.Lines.forEach((line) => {
    const lineElem = document.createElement("div");

    lineElem.textContent =
      UseRomanized && line.TransliteratedText !== undefined ? line.TransliteratedText : line.Text;

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
    lineElements.push(lineElem);
  });

  ApplyLyricsCredits(data, LyricsContainer);
  ApplyLyricsProvider(data, LyricsContainer);
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

  const scrollEl = ScrollSimplebar?.getScrollElement() as HTMLElement | undefined;
  if (scrollEl) initLyricsVirtualizer(scrollEl, virtualContainer, lineElements);

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

  EmitApply(data.Type, data.Lines);

  setRomanizedStatus(UseRomanized);
}
