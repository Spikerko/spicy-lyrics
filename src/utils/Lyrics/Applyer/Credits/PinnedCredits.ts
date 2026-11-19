import { $experiment, isExperimentEnabled } from "../../../experiments.ts";
import { $pinnedCredits } from "../../../stores.ts";
import { CreateTextScroller, type TextScroller } from "../../../TextScroller.ts";
import { ClaimSwitchClearance } from "../../../ViewSwitchClearance.ts";

/**
 * Pinned Credits (setting): the credit rows move out of the scrolling lyrics into a layer
 * held at the bottom of the lyrics area. "noWriters" moves the source and community rows
 * and leaves the songwriters to scroll in after the last line; "full" moves every row.
 *
 * The rows are moved, not copied, so their links and listeners come along, and they go
 * back to the scrolling block whenever pinning stops. The layer sits beside .LyricsContent
 * (inside it, the bottom fade would mask it too) and takes its padding and font size from
 * the lyrics, so the rows line up with the lines and size exactly as they would in place.
 *
 * With the "pinnedCreditsRise" experiment, the layer is not held at the bottom for good: a spacer
 * as tall as the rows is left at the end of the scrolling credits, and once scrolling down carries
 * it above where the rows rest, the layer is lifted by the same distance, as a scroll-driven
 * animation (PinnedCredits.css). Past the last line the rows then follow the lyrics up, ending where
 * they would be unpinned.
 *
 * The docked popup has no room for a block under its lyrics, so there the source and
 * community rows go into the timeline instead: one line between the elapsed and total
 * times, under the seekbar (.TimelineCredits, styled in PopupDock.css). Being part of
 * the timeline, it moves and resizes with the bar. A line has no space for the writers,
 * so in the popup "full" pins the same rows as "noWriters".
 */

const ROW_ORDER = [".Credits", ".LyricsProvider", ".SongInfo"];

let home: HTMLElement | null = null;
let layer: HTMLElement | null = null;
let observer: ResizeObserver | null = null;
// The popup's timeline is built with the player and rebuilt whenever the player is, so the
// line watches the player and moves into whichever timeline is current.
let timelineObserver: MutationObserver | null = null;
// Scrolls the timeline line when it doesn't fit.
let scroller: TextScroller | null = null;
// Pinned Credits Rise with the Scroll: an empty block at the end of the scrolling credits, as tall
// as the pinned rows, marks where they would sit unpinned. Once the scroll carries it above the
// rows' resting place, the layer rides up with it.
let spacer: HTMLElement | null = null;
let scrollSource: HTMLElement | null = null;
// Keeps the rows dimmed like the credits left in the scroll, until the last line has been sung.
let dimObserver: MutationObserver | null = null;
// The content box holding the layer, which carries the rise's state classes (see updateRise).
let riseBox: HTMLElement | null = null;
let risen = false;
let cleared = false;
let raised = false;
// --ViewSwitchInset in px, which places Up Next in the bottom corner (NextUp.css). Read again after
// a resize.
let insetPx: number | null = null;
// Raised past this, the rows are clear of the Lyrics / Queue switch's row.
const RAISED_PX = 64;
// Space under the layer's resting place, the same as `bottom` in PinnedCredits.css.
const REST_GAP_PX = 24;

function rowRank(row: Element): number {
  return ROW_ORDER.findIndex((selector) => row.matches(selector));
}

/** Puts every pinned row back in the scrolling block and drops the layer or timeline line. */
function unpin(): void {
  // The line fades out as a copy, since its rows go home at once.
  const ghost =
    layer?.classList.contains("TimelineCredits") && layer.isConnected
      ? (layer.cloneNode(true) as HTMLElement)
      : null;
  // A clone has no animations; it fades from wherever the scroll had got to.
  const track = layer?.firstElementChild as HTMLElement | null | undefined;
  const ghostTrack = ghost?.firstElementChild as HTMLElement | null | undefined;
  if (track && ghostTrack) {
    ghostTrack.style.translate = (track.ownerDocument.defaultView ?? window).getComputedStyle(track).translate;
  }
  scroller?.destroy();
  scroller = null;
  // First: the rows are re-homed from whatever is in the block.
  spacer?.remove();
  spacer = null;
  scrollSource?.removeEventListener("scroll", updateRise);
  scrollSource = null;
  dimObserver?.disconnect();
  dimObserver = null;
  riseBox?.classList.remove("CreditsRisen", "CreditsCleared");
  riseBox = null;
  risen = cleared = raised = false;
  insetPx = null;
  layer?.parentElement?.classList.remove("HasRisingCredits");
  if (layer && home) {
    const rows = [
      ...home.children,
      ...layer.querySelectorAll(ROW_ORDER.map((s) => `.SongCredits > ${s}`).join(", ")),
    ];
    home.append(...rows.sort((a, b) => rowRank(a) - rowRank(b)));
  }
  observer?.disconnect();
  observer = null;
  timelineObserver?.disconnect();
  timelineObserver = null;
  if (layer?.classList.contains("TimelineCredits")) {
    leaveTimeline(layer, ghost);
    layer = null;
    return;
  }
  const container = layer?.parentElement;
  container?.classList.remove("HasPinnedCredits");
  container?.style.removeProperty("--SL-PinnedCreditsHeight");
  layer?.remove();
  layer = null;
}

/** Swaps the timeline line for its fading copy, which removes itself once it has faded. */
function leaveTimeline(line: HTMLElement, ghost: HTMLElement | null): void {
  if (!ghost) {
    line.remove();
    return;
  }
  ghost.classList.add("Leaving");
  ghost.inert = true;
  ghost.setAttribute("aria-hidden", "true");
  line.replaceWith(ghost);
  const drop = () => ghost.remove();
  ghost.addEventListener("animationend", drop, { once: true });
  // No animation under reduced motion, and none runs while the popup is hidden.
  setTimeout(drop, 400);
}

/**
 * The timeline line sits centred with the avatars when it fits. When it doesn't, the avatars
 * go and the text scrolls back and forth like the song name (the scroller set up in place()).
 * Nothing in the line shrinks, so the credits' offsetWidth is their natural width; unlike
 * scrollWidth, it doesn't change as the scroll moves them.
 */
function fitTimelineLine(): void {
  const credits = layer?.firstElementChild as HTMLElement | null | undefined;
  if (!layer || !credits) return;
  delete layer.dataset.marquee;
  const style = (layer.ownerDocument.defaultView ?? window).getComputedStyle(layer);
  const room = layer.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  if (credits.offsetWidth <= room) return;
  layer.dataset.marquee = "";
}

/** Puts the timeline line into the popup's current timeline, if it isn't there already. */
function attachToTimeline(nowBar: Element): void {
  if (!layer) return;
  const timeline = nowBar.querySelector(".Timeline");
  if (timeline && layer.parentElement !== timeline) timeline.append(layer);
}

/** Copies the lyrics' side padding and font size onto the layer, and publishes its height. */
function syncLayout(): void {
  const container = layer?.parentElement;
  const content = container?.querySelector<HTMLElement>(":scope > .LyricsContent");
  const scroll = content?.querySelector<HTMLElement>(".SpicyLyricsScrollContainer");
  if (!layer || !container || !content || !scroll) return;

  // The padding goes on the column inside: the layer itself spans the lyrics area's width,
  // so `cqw` in the credit sizes resolves against the same width as it does in the scroll.
  const column = layer.firstElementChild as HTMLElement;
  const style = (scroll.ownerDocument.defaultView ?? window).getComputedStyle(scroll);
  const contentRect = content.getBoundingClientRect();
  const scrollRect = scroll.getBoundingClientRect();
  layer.style.fontSize = style.fontSize;
  column.style.paddingLeft = `${scrollRect.left - contentRect.left + parseFloat(style.paddingLeft)}px`;
  column.style.paddingRight = `${contentRect.right - scrollRect.right + parseFloat(style.paddingRight)}px`;
  container.style.setProperty("--SL-PinnedCreditsHeight", `${Math.ceil(layer.offsetHeight)}px`);
  insetPx = null;
  if (spacer) {
    spacer.style.height = `${layer.offsetHeight}px`;
    syncRiseRange(container, content);
  }
  updateRise();
}

/**
 * The lift itself is a CSS animation against the spacer's view timeline (PinnedCredits.css), which
 * the compositor plays in step with the scroll. This gives it its range: it starts once the spacer
 * has risen above where the rows rest, and from then on follows it one for one.
 */
function syncRiseRange(container: HTMLElement, content: HTMLElement): void {
  if (!layer || !spacer || !scrollSource) return;
  const port = scrollSource.getBoundingClientRect();
  const restTop = content.getBoundingClientRect().bottom - REST_GAP_PX - layer.offsetHeight;
  const start = Math.max(0, port.bottom - restTop);
  layer.style.setProperty("--SL-RiseStart", `${start}px`);
  layer.style.setProperty("--SL-RiseSpan", `${Math.max(0, port.height + spacer.offsetHeight - start)}px`);
  container.classList.add("HasRisingCredits");
}

/**
 * Follows how far the rows are lifted, only to set state classes for what else is down in the corner
 * (the lift is the animation's). Up Next rests above the rows, so rising rows would pass through it:
 * it fades out while they do, and once they are clear of it comes back in the bottom corner.
 */
function updateRise(): void {
  const container = layer?.parentElement;
  const content = container?.querySelector<HTMLElement>(":scope > .LyricsContent");
  if (!layer || !container || !content || !spacer) return;
  const restBottom = content.getBoundingClientRect().bottom - REST_GAP_PX;
  const rise = Math.max(0, Math.round(restBottom - layer.offsetHeight - spacer.getBoundingClientRect().top));

  const box = (riseBox ??= layer.closest<HTMLElement>(".ContentBox"));
  const nextUp = box?.querySelector<HTMLElement>(":scope > .NextUp");

  const nextRisen = rise > 0;
  // Clear once Up Next fits in the corner under the rows, an inset below them. Worked out from where
  // the corner is rather than from where Up Next is, so it holds whether Up Next is showing yet or
  // not: it often first shows with the rows already partly risen.
  let nextCleared = false;
  if (nextRisen && box && nextUp) {
    insetPx ??= measureInset(box);
    const cornerTop = box.getBoundingClientRect().bottom - insetPx - nextUp.offsetHeight;
    const clearPx = restBottom - cornerTop + insetPx;
    nextCleared = rise >= (cleared ? clearPx - 8 : clearPx);
  }
  const nextRaised = rise > RAISED_PX;
  if (nextRisen !== risen) box?.classList.toggle("CreditsRisen", (risen = nextRisen));
  if (nextCleared !== cleared) box?.classList.toggle("CreditsCleared", (cleared = nextCleared));
  if (nextRaised !== raised) layer.classList.toggle("Raised", (raised = nextRaised));
}

/** --ViewSwitchInset resolved in px, by a throwaway block sized with it where Up Next lives. */
function measureInset(box: HTMLElement): number {
  const probe = box.ownerDocument.createElement("div");
  probe.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;height:var(--ViewSwitchInset, 0px)";
  box.append(probe);
  const px = probe.offsetHeight;
  probe.remove();
  return px;
}

function place(): void {
  unpin();

  const mode = $pinnedCredits.get();
  const scroll = home?.parentElement;
  const content = scroll?.closest<HTMLElement>(".LyricsContent");
  const container = content?.parentElement;
  if (
    mode === "off" ||
    !home ||
    !scroll ||
    !content ||
    !container?.classList.contains("LyricsContainer")
  )
    return;
  // The popup window has its own document and globals, so everything is made from the lyrics' own.
  const doc = container.ownerDocument;
  const view = doc.defaultView ?? window;
  // The sidebar card is too short to give up its bottom to the credits, and without
  // anchor positioning there is no box to pin them to: both keep them in the scroll.
  if (container.closest("#SpicyLyricsPage")?.classList.contains("CardMode")) return;

  const nowBar =
    container.closest(".spicy-pip-wrapper") && isExperimentEnabled("popupDock")
      ? container.closest(".ContentBox")?.querySelector(".NowBar")
      : null;
  if (nowBar) {
    const rows = [...home.children].filter((row) => rowRank(row) > 0);
    if (rows.length === 0) return;
    layer = doc.createElement("div");
    layer.classList.add("TimelineCredits");
    const credits = doc.createElement("div");
    credits.className = home.className;
    credits.append(...rows);
    layer.append(credits);
    attachToTimeline(nowBar);
    // Also fires each time the line goes into a timeline, so a new one is fitted too, and when
    // the text's own width changes (a late font or avatar).
    observer = new view.ResizeObserver(fitTimelineLine);
    observer.observe(layer);
    observer.observe(credits);
    // Under reduced motion the line holds at its start and its end fades out.
    scroller = CreateTextScroller([layer], { holdOnReducedMotion: true });
    timelineObserver = new view.MutationObserver(() => attachToTimeline(nowBar));
    timelineObserver.observe(nowBar, { childList: true, subtree: true });
    return;
  }

  if (!view.CSS.supports("anchor-name", "--a")) return;

  const rows = [...home.children].filter((row) =>
    mode === "full" ? rowRank(row) >= 0 : rowRank(row) > 0
  );
  if (rows.length === 0) return;

  layer = doc.createElement("div");
  layer.classList.add("LyricsPinnedCredits");
  layer.classList.toggle("EndsOnOppositeLine", scroll.classList.contains("EndsOnOppositeLine"));
  const column = doc.createElement("div");
  column.classList.add("PinnedCreditsColumn");
  const credits = doc.createElement("div");
  credits.className = home.className;
  credits.append(...rows);
  column.append(credits);
  layer.append(column);
  content.after(layer);
  container.classList.add("HasPinnedCredits");
  // On the Lyrics / Queue switch's row, it steps aside while the switch shows (PinnedCredits.css).
  ClaimSwitchClearance(layer);

  observer = new view.ResizeObserver(syncLayout);
  observer.observe(layer);
  observer.observe(content);
  observer.observe(scroll);
  if (isExperimentEnabled("pinnedCreditsRise")) {
    spacer = doc.createElement("div");
    spacer.classList.add("PinnedCreditsSpacer");
    spacer.setAttribute("aria-hidden", "true");
    home.append(spacer);
    scrollSource = scroll.closest<HTMLElement>(".simplebar-content-wrapper") ?? content;
    scrollSource.addEventListener("scroll", updateRise, { passive: true });
    layer.classList.add("Rising");
    // The credits in the scroll dim until every line has been sung, and the rows follow suit.
    const syncDim = () =>
      layer?.classList.toggle(
        "UntilSung",
        !content.classList.contains("LinesAllSung") && scroll.dataset.lyricsType !== "Static"
      );
    dimObserver = new view.MutationObserver(syncDim);
    dimObserver.observe(content, { attributes: true, attributeFilter: ["class"] });
    dimObserver.observe(scroll, { attributes: true, attributeFilter: ["data-lyrics-type"] });
    syncDim();
  }
  syncLayout();
}

/**
 * Takes the credits block built for the current lyrics. Placement waits for the current
 * task to finish: the appliers build the block just before they attach the lyrics to the
 * page. Not a frame, which never comes while Spotify's window is hidden.
 */
export function PinSongCredits(credits: HTMLElement): void {
  unpin();
  home = credits;
  queueMicrotask(place);
}

/** Drops the pinned credits with the lyrics they belong to. */
export function ClearPinnedCredits(): void {
  unpin();
  home = null;
}

$pinnedCredits.listen(() => {
  if (home?.isConnected) queueMicrotask(place);
});

$experiment("popupDock").listen(() => {
  if (home?.isConnected) queueMicrotask(place);
});

$experiment("pinnedCreditsRise").listen(() => {
  if (home?.isConnected) queueMicrotask(place);
});
