import { $annotationOpen, $currentAnnotations } from "../AnnotationState.ts";
import { LyricsObject, type LyricsType } from "../../Lyrics/lyrics.ts";
import type { AnchoredLyricAnnotation } from "../types.ts";

const ICON_ANNOTATION_MARKER = `<svg class="NoFill" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8"/><path d="M8 13h5"/></svg>`;

let activeType: LyricsType | null = null;
let listenerAttached = false;

function getLineElements(type: LyricsType): HTMLElement[] {
  return LyricsObject.Types[type].Lines.map((line) => line.HTMLElement);
}

function getLyricsContent(): HTMLElement | null {
  return document.querySelector<HTMLElement>("#SpicyLyricsPage .LyricsContainer .LyricsContent");
}

function onMarkerClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  const marker = target?.closest<HTMLButtonElement>(".spicy-annotation-marker");
  if (!marker) return;

  event.preventDefault();
  event.stopPropagation();

  const lineIndex = Number(marker.dataset.lineIndex);
  const annotation = $currentAnnotations
    .get()
    .find((item) => item.anchor.lineIndexStart === lineIndex);

  if (!annotation) return;

  $annotationOpen.set({
    annotation,
    lineIndex,
    anchorRect: marker.getBoundingClientRect(),
  });
}

function ensureMarkerClickListener() {
  if (listenerAttached) return;
  const content = getLyricsContent();
  if (!content) return;
  content.addEventListener("click", onMarkerClick);
  listenerAttached = true;
}

function removeMarkerClickListener() {
  const content = getLyricsContent();
  if (content) content.removeEventListener("click", onMarkerClick);
  listenerAttached = false;
}

export function clearAllMarkers() {
  if (activeType) {
    for (const lineEl of getLineElements(activeType)) {
      lineEl.querySelectorAll(".spicy-annotation-marker").forEach((marker) => marker.remove());
      lineEl.classList.remove("has-annotation");
    }
  } else {
    document.querySelectorAll(".spicy-annotation-marker").forEach((marker) => marker.remove());
    document.querySelectorAll(".line.has-annotation").forEach((line) => {
      line.classList.remove("has-annotation");
    });
  }
  removeMarkerClickListener();
  activeType = null;
}

export function setMarkersVisible(visible: boolean) {
  getLyricsContent()?.classList.toggle("annotations-markers-off", !visible);
}

export function renderMarkers(type: LyricsType, annotations: AnchoredLyricAnnotation[]) {
  activeType = type;
  const grouped = new Map<number, AnchoredLyricAnnotation[]>();

  for (const annotation of annotations) {
    const index = annotation.anchor.lineIndexStart;
    const existing = grouped.get(index) ?? [];
    existing.push(annotation);
    grouped.set(index, existing);
  }

  for (const [lineIndex, group] of grouped) {
    const lineEl = LyricsObject.Types[type].Lines[lineIndex]?.HTMLElement;
    if (!lineEl) continue;

    lineEl.querySelectorAll(".spicy-annotation-marker").forEach((marker) => marker.remove());
    lineEl.classList.add("has-annotation");

    const marker = document.createElement("button");
    marker.className = "spicy-annotation-marker";
    marker.type = "button";
    marker.setAttribute(
      "aria-label",
      `${group.length} annotation${group.length > 1 ? "s" : ""} for this line`
    );
    marker.dataset.count = String(group.length);
    marker.dataset.lineIndex = String(lineIndex);
    marker.innerHTML = ICON_ANNOTATION_MARKER;
    lineEl.appendChild(marker);
  }

  ensureMarkerClickListener();
}
