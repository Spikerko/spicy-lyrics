import SimpleBar from "simplebar";
import { IntervalManager } from "../../IntervalManager.ts";
import {
  IsMouseInLyricsPage,
  LyricsPageMouseEnter,
  LyricsPageMouseLeave,
  SetIsMouseInLyricsPage,
} from "../Page/IsHovering.ts";
import { PageContainer } from "../../../components/Pages/PageView.ts";

export let ScrollSimplebar: any | null = null;

const ElementEventQuery = ".ContentBox .LyricsContainer";

export function MountScrollSimplebar() {
  if (!PageContainer) {
    console.warn("Cannot mount ScrollSimplebar: PageContainer not found");
    return;
  }
  const LyricsContainer = PageContainer.querySelector<HTMLElement>(
    ".LyricsContainer .LyricsContent"
  );

  if (!LyricsContainer) {
    console.warn("Cannot mount ScrollSimplebar: LyricsContainer not found");
    return;
  }

  // @ts-expect-error abc
  ScrollSimplebar = new SimpleBar(LyricsContainer, { autoHide: false });

  PageContainer
    .querySelector<HTMLElement>(ElementEventQuery)
    ?.addEventListener("mouseenter", LyricsPageMouseEnter);
  PageContainer
    .querySelector<HTMLElement>(ElementEventQuery)
    ?.addEventListener("mouseleave", LyricsPageMouseLeave);
}

export function ClearScrollSimplebar() {
  ScrollSimplebar?.unMount();
  ScrollSimplebar = null;
  SetIsMouseInLyricsPage(false);
  if (PageContainer) {
    PageContainer
      .querySelector<HTMLElement>(ElementEventQuery)
      ?.removeEventListener("mouseenter", LyricsPageMouseEnter);
    PageContainer
      .querySelector<HTMLElement>(ElementEventQuery)
      ?.removeEventListener("mouseleave", LyricsPageMouseLeave);
  }
}

export function RecalculateScrollSimplebar() {
  ScrollSimplebar?.recalculate();
}

new IntervalManager(Infinity, () => {
  if (!PageContainer) return;
  const LyricsContainer = PageContainer.querySelector<HTMLElement>(
    ".LyricsContainer .LyricsContent"
  );
  if (!LyricsContainer || !ScrollSimplebar) return;
  const hide = !IsMouseInLyricsPage && !ScrollSimplebar.isDragging;
  // Unguarded add/remove would queue a MutationObserver record every frame.
  if (LyricsContainer.classList.contains("hide-scrollbar") !== hide) {
    LyricsContainer.classList.toggle("hide-scrollbar", hide);
  }
}).Start();
