import {
  $currentLyricsType,
  $lyricsContainerExists,
  $scrollLeadEnabled,
  $scrollLeadMs,
  $showScrollToActive,
  $smoothScrolling,
  $staticAutoScroll,
} from "../../utils/stores.ts";
import { GetStaticPace, type StaticPace } from "./StaticPace.ts";
import Global from "../../components/Global/Global.ts";
import { SpotifyPlayer } from "../../components/Global/SpotifyPlayer.ts";
import { PageContainer } from "../../components/Pages/PageView.ts";
import { IsCompactMode } from "../../components/Utils/CompactMode.ts";
import { IsPIP } from "../../components/Utils/PopupLyrics.ts";
import {
  type LyricsLine,
  LyricsObject,
  type LyricsSyllable,
  type LyricsType,
  setEarlySungBefore,
} from "../Lyrics/lyrics.ts";
import { createTooltip } from "../tooltip.ts";
import { ScrollIntoCenterViewCSS } from "../ScrollIntoView/Center.ts";
import { ScrollIntoTopViewCSS } from "../ScrollIntoView/Top.ts";
import {
  getLyricsVirtualizer,
  clearLyricsScrollFraction,
  fadesAwayPreviousLines,
  lyricsCenterScrollTopAt,
  setLyricsScrollPosition,
  lyricsUseRefreshedLayout,
  scrollLyricsToIndex,
  setBloomScrollDuration,
} from "../Lyrics/LyricsVirtualizer.ts";
import { IsScrollbarDragging } from "./Simplebar/ScrollSimplebar.ts";
import { IsBGLine, PickScrollLineIndex } from "./ScrollTarget.ts";

// Define intersection types that include _LineIndex
type LyricsLineWithIndex = LyricsLine & { _LineIndex: number };
type LyricsSyllableWithIndex = LyricsSyllable & { _LineIndex: number };
type EnhancedLyricsItem = LyricsLineWithIndex | LyricsSyllableWithIndex;

// Define proper types for variables
let lastLine: HTMLElement | null = null;
let isUserScrolling = false;
let lastUserScrollTime = 0;
let lastPosition: number = 0;
const USER_SCROLL_COOLDOWN = 750; // 0.75 second cooldown
// const POSITION_THRESHOLD = 500; // 500ms threshold for start/end detection

// Force scroll queue mechanism
let forceScrollQueued = false;
let smoothForceScrollQueued = false;

// --- NEW: Module variables for cleanup ---
let currentSimpleBarInstance: any | null = null;
let wheelHandler: (() => void) | null = null;
let touchMoveHandler: (() => void) | null = null;
let scrollHandler: (() => void) | null = null;
// --- END NEW ---

const wasDrasticPositionChange = (lastPosition: number, newPosition: number) => {
  const positionChange = Math.abs(newPosition - lastPosition);
  return positionChange > 1000;
};

// Add focus event listener to reset state when window is focused, unless a hand scroll has the
// lyrics elsewhere: the click that focuses the window can be on a line out there, and the reset
// would scroll it out from under the pointer before the click lands.
window.addEventListener("focus", () => {
  if (!isUserScrolling) ResetLastLine();
});
// Add resize event listener to reset state when window is resized
window.addEventListener("resize", ResetLastLine);

// Create ResizeObserver to monitor LyricsContent container dimensions
const lyricsContentObserver = new ResizeObserver(() => {
  ResetLastLine();
});

// Function to setup the observer
function setupLyricsContentObserver() {
  const lyricsContent = PageContainer?.querySelector(".LyricsContainer .LyricsContent");
  if (lyricsContent) {
    // Ensure we don't observe multiple times if called again
    lyricsContentObserver.disconnect();
    lyricsContentObserver.observe(lyricsContent);
  }
}

// Scroll to Active button: shown while a hand scroll has auto-scroll held off with the line
// being sung out of view, on the side that line lies. Clicking it hands scrolling back.
type ActiveLineDirection = "Above" | "Below";
let scrollToActiveButton: HTMLButtonElement | null = null;
let shownDirection: ActiveLineDirection | null = null;
// Unsynced lyrics glide back from a click instead of jumping, however far away they are.
let staticReturning = false;

const ScrollToActiveIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;

// Where the Lyrics / Queue switch is up (QueueView.ts), the button takes a seat in its capsule, which
// opens to fit it (QueueView.css). Everywhere else it floats at the lyrics column's edge.
function ScrollToActiveHome(): { container: HTMLElement; seat: boolean } | null {
  const seat = PageContainer?.querySelector<HTMLElement>(".ContentBox > .ViewSwitch .ViewSwitchSeat_Scroll");
  if (seat) return { container: seat, seat: true };
  const container = PageContainer?.querySelector<HTMLElement>(".LyricsContainer");
  return container ? { container, seat: false } : null;
}

let scrollToActiveTooltip: { destroy?: () => void; setContent?: (content: string) => void } | null =
  null;

function DropScrollToActiveButton() {
  scrollToActiveTooltip?.destroy?.();
  scrollToActiveTooltip = null;
  scrollToActiveButton?.remove();
  scrollToActiveButton = null;
}

// The switch is built and taken down with the view controls; the button moves with it, keeping
// whatever it was showing.
Global.Event.listen("view-switch:changed", () => {
  const direction = shownDirection;
  if (scrollToActiveButton && scrollToActiveButton.parentElement !== ScrollToActiveHome()?.container)
    DropScrollToActiveButton();
  shownDirection = null;
  SetScrollToActiveDirection(direction);
});

function GetScrollToActiveButton(): HTMLButtonElement | null {
  const home = ScrollToActiveHome();
  if (!home) return null;
  const container = home.container;
  if (scrollToActiveButton?.parentElement === container) return scrollToActiveButton;
  DropScrollToActiveButton();
  const button = document.createElement("button");
  button.type = "button";
  button.className = home.seat ? "ViewSwitchScroll" : "ScrollToActive";
  button.innerHTML = ScrollToActiveIcon;
  button.inert = true;
  if (home.seat)
    scrollToActiveTooltip = createTooltip(button, {
      ...(Spicetify as any).TippyProps,
      placement: "top",
      content: "Scroll to the current line",
    });
  button.addEventListener("click", () => {
    lastUserScrollTime = 0;
    if ($currentLyricsType.get() === "Static") staticReturning = true;
    else ScrollBackToLine();
    // Going inert would drop keyboard focus to the page; keep it on the lyrics instead.
    if (document.activeElement === button)
      (currentSimpleBarInstance?.getScrollElement() as HTMLElement | undefined)?.focus({
        preventScroll: true,
      });
    SetScrollToActiveDirection(null);
  });
  // It sits outside the scroller, so a wheel over it would otherwise scroll nothing.
  button.addEventListener(
    "wheel",
    (event) => {
      const scrollElement = currentSimpleBarInstance?.getScrollElement() as HTMLElement | undefined;
      if (!scrollElement) return;
      event.preventDefault();
      // Lets the hand-scroll listeners on the scroller see it.
      scrollElement.dispatchEvent(new WheelEvent("wheel", event));
      const lines = event.deltaMode === WheelEvent.DOM_DELTA_LINE;
      const pages = event.deltaMode === WheelEvent.DOM_DELTA_PAGE;
      scrollElement.scrollBy(0, event.deltaY * (lines ? 40 : pages ? scrollElement.clientHeight : 1));
    },
    { passive: false }
  );
  // After .LyricsContent, the anchor it is pinned to.
  container.appendChild(button);
  scrollToActiveButton = button;
  return button;
}

function SetScrollToActiveDirection(direction: ActiveLineDirection | null) {
  if (direction && !$showScrollToActive.get()) direction = null;
  if (direction === shownDirection) return;
  shownDirection = direction;
  const button = direction ? GetScrollToActiveButton() : scrollToActiveButton;
  if (!button) return;
  // Keeps its side while it fades out.
  if (direction) {
    const appearing = !button.classList.contains("Visible");
    button.classList.toggle("Above", direction === "Above");
    button.ariaLabel =
      direction === "Above" ? "Scroll up to the current line" : "Scroll down to the current line";
    scrollToActiveTooltip?.setContent?.(button.ariaLabel);
    // In the capsule the chevron turns when the line crosses sides while it's up. Coming back on
    // the other side it has to start out pointing the new way, not turn around in view: settle the
    // hidden state's (untransitioned) rotation before it shows.
    if (appearing) void getComputedStyle(button.firstElementChild ?? button).rotate;
  }
  button.classList.toggle("Visible", direction !== null);
  button.inert = direction === null;
  // The capsule opens its seat (and wakes, a wheel scroll doesn't move the pointer) while it's shown.
  button.closest<HTMLElement>(".ViewSwitch")?.classList.toggle("HasScroll", direction !== null);
}

// Where the line being sung lies, or null while it is in view. An IntersectionObserver on the line
// reports it the frame it crosses the edge, from layout the browser has already done. The resume
// check's isConnected can't: it counts rows mounted in the overscan, off-screen, as in view.
let sideObserver: IntersectionObserver | null = null;
let sideRoot: HTMLElement | null = null;
let sideLine: HTMLElement | null = null;
let side: ActiveLineDirection | null = null;
let sideRefreshFrame: number | null = null;
let sideItem: EnhancedLyricsItem | null = null;

// Shown only while a hand scroll holds auto-scroll off, so the glide back from a click (whose
// scroll keeps the line out of view until it lands) never brings it up again.
function ShowActiveLineSide() {
  SetScrollToActiveDirection(isUserScrolling && allowForceScrolling ? side : null);
}

function StopObservingActiveLine() {
  if (sideRefreshFrame !== null) cancelAnimationFrame(sideRefreshFrame);
  sideRefreshFrame = null;
  sideObserver?.disconnect();
  sideObserver = null;
  sideRoot = null;
  sideLine = null;
  side = null;
  sideItem = null;
}

function ObserveActiveLine(container: HTMLElement, LineElem: HTMLElement) {
  if (!sideObserver || sideRoot !== container) {
    StopObservingActiveLine();
    sideRoot = container;
    sideObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry?.rootBounds || entry.target !== sideLine) return;
        const { boundingClientRect: line, rootBounds: view } = entry;
        side = line.bottom <= view.top ? "Above" : line.top >= view.bottom ? "Below" : null;
        ShowActiveLineSide();
      },
      { root: container, threshold: 0 }
    );
  }
  if (sideLine === LineElem) return;
  if (sideLine) sideObserver.unobserve(sideLine);
  // side keeps the last answer until this line's first entry, so a line change while scrolled
  // away doesn't blink the button.
  sideLine = LineElem;
  sideObserver.observe(LineElem);
}

// A scroll can carry the line from one side of the view to the other without crossing it, which
// the observer doesn't report; observing it again asks for a fresh entry.
function RefreshActiveLineSide() {
  if (!sideObserver || sideRefreshFrame !== null) return;
  sideRefreshFrame = requestAnimationFrame(() => {
    sideRefreshFrame = null;
    if (!sideObserver || !sideLine?.isConnected) return;
    sideObserver.unobserve(sideLine);
    sideObserver.observe(sideLine);
  });
}

function TrackActiveLineSide(container: HTMLElement, line: EnhancedLyricsItem) {
  sideItem = line;
  const LineElem = line.HTMLElement as HTMLElement | undefined;
  if (LineElem?.isConnected) {
    ObserveActiveLine(container, LineElem);
  } else {
    // An unmounted row has no box; the virtualizer's mounted range says which side it is on.
    if (sideLine) sideObserver?.unobserve(sideLine);
    sideLine = null;
    const items = getLyricsVirtualizer()?.getVirtualItems() ?? [];
    const first = items[0]?.index;
    const last = items[items.length - 1]?.index;
    side =
      first === undefined || last === undefined
        ? null
        : line._LineIndex < first
          ? "Above"
          : line._LineIndex > last
            ? "Below"
            : null;
  }
  ShowActiveLineSide();
}

// Glides to the line the button points at and hands scrolling back. Scrolled straight from here,
// because a queued scroll waits for a line being sung, which the intro doesn't have.
function ScrollBackToLine() {
  const container = currentSimpleBarInstance?.getScrollElement() as HTMLElement | undefined;
  const LineElem = sideItem?.HTMLElement as HTMLElement | undefined;
  if (!container || !sideItem || !LineElem || !allowForceScrolling) return;
  isUserScrolling = false;
  lastLine = LineElem;
  PageContainer?.querySelector(".LyricsContainer .LyricsContent")?.classList.remove("HideLineBlur");
  ScrollTo(container, LineElem, false, GetScrollType(), sideItem._LineIndex, true);
}

// Between lines, the next one to be sung; after the last, the last.
function LineAfter(
  Lines: LyricsLine[] | LyricsSyllable[],
  position: number
): EnhancedLyricsItem | null {
  const next = Lines.findIndex((line) => line.StartTime > position && !IsBGLine(line));
  const index = next !== -1 ? next : Lines.length - 1;
  return index >= 0 ? ({ ...Lines[index], _LineIndex: index } as EnhancedLyricsItem) : null;
}

function handleUserScroll(ScrollSimplebar: any | null) {
  // Allow null
  if (!ScrollSimplebar) return; // Add null check
  staticReturning = false;
  if (!isUserScrolling) {
    isUserScrolling = true;
    // Add HideLineBlur class when user starts scrolling
    const lyricsContent = PageContainer?.querySelector(
      ".LyricsContainer .LyricsContent"
    );
    if (lyricsContent) {
      lyricsContent.classList.add("HideLineBlur");
    } else {
      // --- NEW: Add warning if element not found ---
      console.warn(
        "SpicyLyrics: Could not find .LyricsContent in handleUserScroll to add HideLineBlur."
      );
      // --- END NEW ---
    }
  }
  lastUserScrollTime = performance.now();
}

// Initialization function for scroll events and observers
export function InitializeScrollEvents(ScrollSimplebar: any) {
  if (!$lyricsContainerExists.get()) return;
  // --- NEW: Store instance and define handlers ---
  currentSimpleBarInstance = ScrollSimplebar;
  wheelHandler = () => handleUserScroll(currentSimpleBarInstance);
  touchMoveHandler = () => handleUserScroll(currentSimpleBarInstance);
  scrollHandler = RefreshActiveLineSide;
  // --- END NEW ---

  // Setup the observer
  setupLyricsContentObserver();

  // Add scroll event listener
  const scrollElement = ScrollSimplebar?.getScrollElement();
  if (scrollElement && wheelHandler && touchMoveHandler && scrollHandler) {
    // Check handlers exist
    // Remove potential old listeners first (optional, but safer if called multiple times)
    scrollElement.removeEventListener("wheel", wheelHandler);
    scrollElement.removeEventListener("touchmove", touchMoveHandler);
    scrollElement.removeEventListener("scroll", scrollHandler);
    // Add new listeners
    scrollElement.addEventListener("wheel", wheelHandler);
    scrollElement.addEventListener("touchmove", touchMoveHandler);
    scrollElement.addEventListener("scroll", scrollHandler, { passive: true });
  }
}

/**
 * Bloom's timed scroll: a move into a line takes longer the more room there is
 * before it, from MinMs when the line follows straight on to MaxMs after a
 * pause, and starts that long before the line so it arrives as it's sung.
 */
const BloomScroll = { MinMs: 480, MaxMs: 750, GapFromMs: 200, GapToMs: 750 };

// Where a line's own singing ends. Fade Away Previous Lines stretches EndTime
// to the next line; LeadEndTime keeps the real end.
const GetLeadEndTime = (line: LyricsLine | LyricsSyllable): number =>
  (line as { LeadEndTime?: number }).LeadEndTime ?? line.EndTime;

// How long the move into the next line takes (Ms), and how far ahead of it
// the scroll may start (LeadMs): never before the line above, with its
// background vocals, has finished singing, so nothing is cut off.
const GetBloomScroll = (
  Lines: LyricsLine[] | LyricsSyllable[],
  position: number
): { Ms: number; LeadMs: number } => {
  let next = -1;
  for (let i = 0; i < Lines.length; i++) {
    if (!IsBGLine(Lines[i]) && Lines[i].StartTime > position) {
      next = i;
      break;
    }
  }
  if (next < 0) return { Ms: BloomScroll.MaxMs, LeadMs: 0 };
  let prevEnd = -Infinity;
  for (let i = next - 1; i >= 0; i--) {
    const end = GetLeadEndTime(Lines[i]);
    if (end > prevEnd) prevEnd = end;
    if (!IsBGLine(Lines[i])) break;
  }
  const room = Lines[next].StartTime - prevEnd;
  const gap = Math.min(BloomScroll.GapToMs, Math.max(BloomScroll.GapFromMs, room));
  const share = (gap - BloomScroll.GapFromMs) / (BloomScroll.GapToMs - BloomScroll.GapFromMs);
  const ms = Math.round(BloomScroll.MinMs + (BloomScroll.MaxMs - BloomScroll.MinMs) * share);
  return { Ms: ms, LeadMs: Math.min(ms, Math.max(0, room)) };
};

// The line Bloom's timed scroll is bringing in. It grows to full size as it
// arrives, rather than when its first word is sung (Mixed.css).
let bloomFocus: HTMLElement | null = null;
const SetBloomFocus = (el: HTMLElement | null) => {
  if (el === bloomFocus) return;
  bloomFocus?.classList.remove("BloomFocus");
  bloomFocus = el;
  el?.classList.add("BloomFocus");
};


const GetScrollLine = (Lines: LyricsLine[] | LyricsSyllable[], ProcessedPosition: number) => {
  if ($currentLyricsType.get() === "Static" || $currentLyricsType.get() === "None" || !Lines)
    return;
  const index = PickScrollLineIndex(Lines, ProcessedPosition);
  if (index === null) return null;
  return { ...Lines[index], _LineIndex: index } as EnhancedLyricsItem;
};

// Gap above the active line in "Top" scrolling. A resized popup can leave only
// a sliver of lyrics, where a fixed 50px pushed the line into the bottom fade,
// so in PiP it shrinks with the viewport, staying just inside the mask's top
// fade, which scales too (.spicy-pip-wrapper in Lyrics/main.css).
const GetTopScrollOffset = (container: HTMLElement) =>
  IsPIP ? Math.min(50, Math.round(container.clientHeight * 0.2)) : 85;

// Push on the active line in "Center" scrolling. In Fullscreen and Cinema View it
// goes further for Bloom, and for any renderer style with Player Below the Cover
// on (Exp_PlayerBelowCover).
// Not while Canvas Stage shows a canvas (.CanvasImmersive): the lines keep the
// usual offset there.
const GetCenterScrollOffset = (container: HTMLElement) => {
  const page = container.closest("#SpicyLyricsPage")?.classList;
  if (!page?.contains("Fullscreen") || page.contains("CanvasImmersive")) return 30;
  return lyricsUseRefreshedLayout() || page.contains("Exp_PlayerBelowCover") ? 80 : 30;
};

const ScrollTo = (
  container: HTMLElement,
  element: HTMLElement,
  instantScroll: boolean = false,
  type: "Center" | "Top" = "Center",
  lineIndex?: number,
  // Glides however far the line is (the scroll-to-active button).
  glide: boolean = false
) => {
  if (lineIndex !== undefined && getLyricsVirtualizer()) {
    // instantScroll is effectively always true in the virtualizer path
    // (we set scrollTop directly), but passing the flag keeps the intent
    // explicit and allows a future smooth-scroll path if needed.
    scrollLyricsToIndex(
      lineIndex,
      type === "Top" ? "start" : "center",
      instantScroll,
      type === "Top" ? -GetTopScrollOffset(container) : GetCenterScrollOffset(container),
      glide
    );
    return;
  }
  if (type === "Center") {
    ScrollIntoCenterViewCSS(container, element, -GetCenterScrollOffset(container), instantScroll);
  } else if (type === "Top") {
    ScrollIntoTopViewCSS(container, element, GetTopScrollOffset(container), instantScroll);
  }
};

let scrolledToLastLine = false;
let scrolledToFirstLine = false;

// Throttle layout-dependent viewport checks to avoid forced sync layouts on every tick
const VIEWPORT_CHECK_INTERVAL = 350; // milliseconds
let lastViewportCheckTime = 0;
let lastViewportLine: HTMLElement | null = null;
let lastViewportContainer: HTMLElement | null = null;
let lastIsLineInViewport = false;

const GetScrollType = (): "Center" | "Top" => {
  return IsCompactMode() ? "Top" : "Center";
};

const policyEventPreset = "policy:";

let allowForceScrolling = true;

export const SetForceScrollingPolicy = (value: boolean) => {
  allowForceScrolling = value; // true = allow force scrolling, false = disallow force scrolling
  Global.Event.evoke(`${policyEventPreset}force-scrolling`, value);
};
export const GetForceScrollingPolicy = () => {
  return allowForceScrolling;
};

// Unsynced lyrics with auto-scroll on follow the song's pace from StaticPace.ts.
let staticPace: { key: string; pace: StaticPace | null } = { key: "", pace: null };
let lastStaticFrame = 0;
let lastStaticPosition = 0;
let staticScrollY: number | null = null;

function ScrollStaticLyrics(ScrollSimplebar: any) {
  const mode = $staticAutoScroll.get();
  const uri = SpotifyPlayer.GetUri();
  const lineCount = LyricsObject.Types.Static.Lines.length;
  if (mode === "off" || !uri || !lineCount) {
    SetScrollToActiveDirection(null);
    ReleaseStaticScroll();
    return;
  }

  const key = `${mode}:${uri}`;
  if (staticPace.key !== key) {
    staticPace = { key, pace: null };
    staticReturning = false;
    GetStaticPace(uri, SpotifyPlayer.GetDuration(), mode).then((pace) => {
      if (staticPace.key === key) staticPace.pace = pace;
    });
  }
  const pace = staticPace.pace;
  const container = ScrollSimplebar?.getScrollElement() as HTMLElement | undefined;
  if (!pace || !container) {
    SetScrollToActiveDirection(null);
    return;
  }

  const now = performance.now();
  const frameMs = lastStaticFrame ? Math.min(now - lastStaticFrame, 100) : 16;
  lastStaticFrame = now;
  const position = SpotifyPlayer.GetPosition();
  // A seek takes the list back from a hand scroll, as it does for synced lyrics.
  if (wasDrasticPositionChange(lastStaticPosition, position)) lastUserScrollTime = 0;
  lastStaticPosition = position;
  if (IsScrollbarDragging()) handleUserScroll(ScrollSimplebar);

  const target = lyricsCenterScrollTopAt(pace(position) * (lineCount - 1));
  if (target === null) return;
  // scrollTop only holds whole device pixels, so the list's own position is kept here.
  // Anything else moving it (a hand scroll, a relayout) takes over from where it put it.
  if (staticScrollY === null || Math.abs(staticScrollY - container.scrollTop) > 2) {
    staticScrollY = container.scrollTop;
  }
  const distance = target - staticScrollY;
  // A hand scroll that left the point being sung half a screen or more away holds auto-scroll off.
  const scrolledAway = lastUserScrollTime !== 0 && Math.abs(distance) > container.clientHeight / 2;
  SetScrollToActiveDirection(scrolledAway ? (distance < 0 ? "Above" : "Below") : null);
  // After a hand scroll, take over again once it has settled with the point being sung in view.
  if (lastUserScrollTime) {
    // The hand has the list: let it sit on scrollTop, with no offset of ours left over.
    ReleaseStaticScroll();
    if (now - lastUserScrollTime <= USER_SCROLL_COOLDOWN) return;
    if (scrolledAway) return;
    lastUserScrollTime = 0;
  }
  if (Math.abs(distance) < 0.05) {
    staticReturning = false;
    return;
  }
  // Eased toward the target each frame; more than a screen away (new lyrics, a seek) it jumps.
  const next =
    Math.abs(distance) > container.clientHeight && !staticReturning
      ? target
      : staticScrollY + distance * (1 - Math.exp(-frameMs / 200));
  staticScrollY = setLyricsScrollPosition(next);
  // Without the virtualizer, whole steps only. "instant" because the container's CSS
  // smooth scrolling would queue up every step.
  if (staticScrollY === null) container.scrollTo({ top: next, behavior: "instant" });
}

function ReleaseStaticScroll() {
  if (staticScrollY === null) return;
  staticScrollY = null;
  clearLyricsScrollFraction();
}

export function ScrollToActiveLine(ScrollSimplebar: any) {
  if ($currentLyricsType.get() === "Static") {
    StopObservingActiveLine();
    if ($lyricsContainerExists.get()) ScrollStaticLyrics(ScrollSimplebar);
    return;
  }
  if ($currentLyricsType.get() === "None") {
    StopObservingActiveLine();
    SetScrollToActiveDirection(null);
    return;
  }
  if (!$lyricsContainerExists.get()) return;

  const currentType = $currentLyricsType.get() as LyricsType;
  const Lines = LyricsObject.Types[currentType]?.Lines as LyricsLine[] | LyricsSyllable[];
  if (!Lines) return;

  // Check if a force scroll was queued
  const isForceScrollQueued = forceScrollQueued;
  const isSmoothForceScrollQueued = smoothForceScrollQueued;

  //if (Spicetify.Platform.History.location.pathname === "/SpicyLyrics") {
  const Position = SpotifyPlayer.GetPosition();
  // Early scroll: pick the scroll target as if the clock were this far ahead, so
  // the list starts moving before the line lights up instead of snapping to it
  // the moment it does. Only the target changes — line states (Status) still
  // follow the real position.
  // Bloom times its own scroll, except while sung lines are faded away. Only in
  // Popup Lyrics and the Now Playing card does it also start that scroll early;
  // elsewhere Early Scroll decides, as it does for Spring.
  const page = ScrollSimplebar?.getScrollElement()?.closest("#SpicyLyricsPage");
  const bloomTimed = lyricsUseRefreshedLayout() && !fadesAwayPreviousLines(page);
  let PositionOffset = $scrollLeadEnabled.get() ? Math.max(0, $scrollLeadMs.get()) : 0;
  const bloomEarly = bloomTimed && (IsPIP || !!page?.classList.contains("CardMode"));
  if (bloomTimed) {
    const scroll = GetBloomScroll(Lines, Position);
    setBloomScrollDuration(scroll.Ms);
    if (bloomEarly) PositionOffset = scroll.LeadMs;
  }
  const ProcessedPosition = Position + PositionOffset;
  const currentLine = GetScrollLine(Lines, ProcessedPosition) as EnhancedLyricsItem | null;
  SetBloomFocus(bloomTimed ? (currentLine?.HTMLElement ?? null) : null);
  // Once the scroll has moved on early, the lines above it count as sung.
  setEarlySungBefore(bloomEarly && currentLine ? currentLine._LineIndex : -1);

  // Before the returns below, which skip the rest in the intro and outro.
  const sideTarget = currentLine ?? LineAfter(Lines, ProcessedPosition);
  const sideContainer = ScrollSimplebar?.getScrollElement() as HTMLElement | undefined;
  if (sideTarget && sideContainer) TrackActiveLineSide(sideContainer, sideTarget);

  let notSungCount = 0;
  let activeCount = 0;
  let sungCount = 0;
  for (let i = 0; i < Lines.length; i++) {
    const status = Lines[i].Status;
    if (status === "NotSung") notSungCount++;
    else if (status === "Active") activeCount++;
    else if (status === "Sung") sungCount++;
  }
  const allLinesNotSung = notSungCount === Lines.length;
  const oneActiveNoSung = activeCount === 1 && sungCount === 0;
  const allLinesSung = sungCount === Lines.length;
  const shouldForceScroll = isForceScrollQueued || lastLine == null;

  if (
    shouldForceScroll ||
    (!SpotifyPlayer.IsPlaying && lastPosition !== Position) ||
    (lastPosition !== 0 && wasDrasticPositionChange(lastPosition ?? 0, Position))
  ) {
    if (!allowForceScrolling) return;
    const container = ScrollSimplebar?.getScrollElement() as HTMLElement;
    if (!container) return;
    isUserScrolling = false;
    const scrollToLine = allLinesSung
      ? Lines[Lines.length - 1]?.HTMLElement
      : currentLine?.HTMLElement;
    if (!scrollToLine) return;
    lastLine = scrollToLine;
    const forceScrollLineIndex = allLinesSung ? Lines.length - 1 : currentLine?._LineIndex;
    ScrollTo(
      container,
      scrollToLine,
      shouldForceScroll || (lastPosition !== 0 && wasDrasticPositionChange(lastPosition ?? 0, Position)),
      GetScrollType(),
      forceScrollLineIndex
    );
    if (forceScrollQueued) {
      forceScrollQueued = false; // Reset the queue after using it
    }
    lastPosition = Position;
    return;
  }

  lastPosition = Position;

  // A held scrollbar thumb is user scrolling too; without this the list slid
  // out from under it on the next line change.
  if (IsScrollbarDragging()) handleUserScroll(ScrollSimplebar);

  if (isSmoothForceScrollQueued) {
    if (!allowForceScrolling) return;
    const container = ScrollSimplebar?.getScrollElement() as HTMLElement;
    if (!container) return;
    isUserScrolling = false;
    const scrollToLine = allLinesSung
      ? Lines[Lines.length - 1]?.HTMLElement
      : currentLine?.HTMLElement;
    if (!scrollToLine) return;
    lastLine = scrollToLine;
    const smoothScrollLineIndex = allLinesSung ? Lines.length - 1 : currentLine?._LineIndex;
    ScrollTo(container, scrollToLine, false, GetScrollType(), smoothScrollLineIndex);
    if (smoothForceScrollQueued) {
      smoothForceScrollQueued = false; // Reset the queue after using it
    }
    return;
  }

  if (!Lines) return;

  // --- NEW: Check conditions to scroll to top ---

  if (allLinesNotSung || oneActiveNoSung) {
    /*  const container = ScrollSimplebar?.getScrollElement() as HTMLElement;
            if (container) {
                const timeSinceLastScroll = performance.now() - lastUserScrollTime;
                // Only auto-scroll if user hasn't scrolled recently
                if (timeSinceLastScroll > USER_SCROLL_COOLDOWN && !isUserScrolling) {
                    isUserScrolling = false;
                    const lyricsContent = PageContainer?.querySelector(".LyricsContainer .LyricsContent");
                    if (lyricsContent) {
                        lyricsContent.classList.remove("HideLineBlur");
                    }
                    // Use smooth scrolling to top
                    container.scrollTop = 0;
                }
                return; // Exit early after handling scroll to top
            } */
    if (scrolledToFirstLine) return;
    QueueSmoothForceScroll();
    scrolledToFirstLine = true;
  }
  // --- END NEW ---

  // Check if all lines are sung

  if (allLinesSung) {
    /* const container = ScrollSimplebar?.getScrollElement() as HTMLElement;
            if (container) {
                const timeSinceLastScroll = performance.now() - lastUserScrollTime;

                // Only auto-scroll if user hasn't scrolled recently
                if (timeSinceLastScroll > USER_SCROLL_COOLDOWN && !isUserScrolling) {
                    isUserScrolling = false;
                    // Remove HideLineBlur class when auto-scroll resumes
                    const lyricsContent = PageContainer?.querySelector(".LyricsContainer .LyricsContent");
                    if (lyricsContent) {
                        lyricsContent.classList.remove("HideLineBlur");
                    }
                    // Get the last line element to scroll to
                    const lastLineElement = Lines[Lines.length - 1].HTMLElement as HTMLElement;
                    ScrollIntoCenterViewCSS(container, lastLineElement, true);
                }
                return;
            } */
    if (scrolledToLastLine) return;
    QueueSmoothForceScroll();
    scrolledToLastLine = true;
  }

  // Handle start of track
  //if (Position <= POSITION_THRESHOLD) {
  /* const container = ScrollSimplebar?.getScrollElement() as HTMLElement;
            if (container) {
                // Use smooth scrolling to top
                container.scrollTop = 0;
                return;
            } */
  /* QueueForceScroll();
        } */

  // Handle end of track
  /* if (ProcessedPosition >= TrackDuration - POSITION_THRESHOLD) {
            /* const container = ScrollSimplebar?.getScrollElement() as HTMLElement;
            if (container) {
                // Use smooth scrolling to bottom
                container.scrollTop = container.scrollHeight;
                return;
            } 
            QueueForceScroll();
        } */


  Continue(currentLine);

  function Continue(currentLine: EnhancedLyricsItem | null) {
    if (currentLine) {
      const LineElem = currentLine?.HTMLElement as HTMLElement;
      if (!LineElem) return;
      const container = ScrollSimplebar?.getScrollElement() as HTMLElement;
      if (!container) return;
      const now = performance.now();
      const timeSinceLastScroll = now - lastUserScrollTime;

      const hasVirtualizer = getLyricsVirtualizer() !== null;

      // Throttled layout read for viewport visibility. Under the virtualizer
      // isConnected alone decides (below), so skip the forced layout.
      const shouldRecalculateViewport =
        !hasVirtualizer &&
        (now - lastViewportCheckTime > VIEWPORT_CHECK_INTERVAL ||
          lastViewportLine !== LineElem ||
          lastViewportContainer !== container);

      if (shouldRecalculateViewport) {
        // Check if the line is at least 5px visible within the scroll container
        const elementOffsetTop = LineElem.offsetTop;
        const elementBottom = elementOffsetTop + LineElem.clientHeight;
        const viewportTop = container.scrollTop;
        const viewportBottom = viewportTop + container.clientHeight;

        const visibleTop = Math.max(elementOffsetTop, viewportTop);
        const visibleBottom = Math.min(elementBottom, viewportBottom);
        const visibleHeight = Math.max(0, visibleBottom - visibleTop);

        // Consider the line "in viewport" if at least 5px is visible
        lastIsLineInViewport = visibleHeight >= 5;
        lastViewportCheckTime = now;
        lastViewportLine = LineElem;
        lastViewportContainer = container;
      }

      // When virtualizer is active, detached (off-screen) elements have offsetTop=0,
      // making the standard viewport check unreliable. Use isConnected as a proxy:
      // mounted elements are near the current scroll position (within overscan), so
      // treating them as "in viewport" is close enough. Detached elements mean the
      // user scrolled far away — preserve the original no-scroll behavior.
      const isLineInViewport = hasVirtualizer ? LineElem.isConnected : lastIsLineInViewport;

      const isSameLine = lastLine === LineElem;

      /*
                for (let i = 0; i < Lines.length; i++) {
                    const line = Lines[i];
                    if (line.HTMLElement) {
                        const container = ScrollSimplebar?.getScrollElement() as HTMLElement;
                        if (!container) return;
                        const LineElem = line.HTMLElement;
                        const lineRect = LineElem.getBoundingClientRect();
                        const containerRect = container.getBoundingClientRect();
                        const isLineInViewport = lineRect.top >= containerRect.top && lineRect.bottom <= containerRect.bottom;

                        if (!isLineInViewport) {
                            if (!LineElem.classList.contains("NotInViewport")) LineElem.classList.add("NotInViewport")
                        } else {
                            if (LineElem.classList.contains("NotInViewport")) LineElem.classList.remove("NotInViewport")
                        }
                    }
                } */

      // If this is the first line (no previous line), force scroll without checks
      /* if (!shouldForceScroll) {
                    isUserScrolling = false;
                    lastLine = LineElem;
                    ScrollIntoCenterViewCSS(container, LineElem, true);
                    return;
                } */

      // Only auto-scroll if BOTH conditions are met:
      // 1. User hasn't scrolled in the last second (cooldown passed)
      // 2. AND the active line is in viewport
      if (timeSinceLastScroll > USER_SCROLL_COOLDOWN && isLineInViewport) {
        // --- REVISED LOGIC for resuming auto-scroll ---
        //const wasUserScrolling = isUserScrolling; // Capture state before changing
        isUserScrolling = false;
        // Remove HideLineBlur class ONLY if we were user scrolling
        //if (wasUserScrolling) {
        const lyricsContent = PageContainer?.querySelector(
          ".LyricsContainer .LyricsContent"
        );
        if (lyricsContent) {
          if (lyricsContent.classList.contains("HideLineBlur")) {
            lyricsContent.classList.remove("HideLineBlur");
          }
        } else {
          console.warn(
            "SpicyLyrics: Could not find .LyricsContent in ScrollToActiveLine to remove HideLineBlur."
          );
        }
        //}
        // Scroll if the line is different from the last auto-scrolled line
        if (!isSameLine) {
          lastLine = LineElem;
          const Scroll = () => {
            ScrollTo(container, LineElem, false, GetScrollType(), currentLine._LineIndex);
            scrolledToLastLine = false;
            scrolledToFirstLine = false;
          };
          // Leaving a "•••" interlude: normally wait for it to collapse first.
          // With Smooth Scrolling (or Bloom) the rows glide as
          // it collapses, so scrolling at the same moment makes the two read as
          // one motion instead of two.
          if (
            !$smoothScrolling.get() &&
            !lyricsUseRefreshedLayout() &&
            Lines[currentLine._LineIndex - 1] &&
            Lines[currentLine._LineIndex - 1].DotLine === true
          ) {
            // Skip if a song change, seek or reset moved on in the meantime —
            // the captured index would scroll the new lyrics to a stale line.
            setTimeout(() => {
              if (lastLine === LineElem) Scroll();
            }, 240);
          } else {
            Scroll();
          }
        }
        // --- END REVISED LOGIC ---
      }

    }
  }
  //}
}

// Function to queue a force scroll for the next frame
export function QueueForceScroll() {
  forceScrollQueued = true;
}

export function QueueSmoothForceScroll() {
  smoothForceScrollQueued = true;
}

export function ResetLastLine() {
  lastLine = null;
  lastViewportLine = null;
  lastViewportContainer = null;
  lastIsLineInViewport = false;
  lastViewportCheckTime = 0;
  RefreshActiveLineSide();
  SetScrollToActiveDirection(null);
  isUserScrolling = false;
  lastUserScrollTime = 0;
  lastPosition = 0;
  forceScrollQueued = false;
  smoothForceScrollQueued = false;
  scrolledToLastLine = false;
  scrolledToFirstLine = false;
  // Also disconnect observer on reset if needed, though setup handles disconnect now
  // lyricsContentObserver.disconnect();
}

// --- NEW: Cleanup Function ---
export function CleanupScrollEvents() {
  // Remove scroll listeners
  const scrollElement = currentSimpleBarInstance?.getScrollElement();
  if (scrollElement) {
    if (wheelHandler) {
      scrollElement.removeEventListener("wheel", wheelHandler);
    }
    if (touchMoveHandler) {
      scrollElement.removeEventListener("touchmove", touchMoveHandler);
    }
    if (scrollHandler) {
      scrollElement.removeEventListener("scroll", scrollHandler);
    }
  }

  // Disconnect observer
  lyricsContentObserver?.disconnect();

  // The window focus/resize listeners stay: they are added once at module load,
  // and this runs on every lyrics apply, so removing them here dropped them for
  // the rest of the session.

  // Reset module variables
  currentSimpleBarInstance = null;
  wheelHandler = null;
  touchMoveHandler = null;
  scrollHandler = null;
  StopObservingActiveLine();
  forceScrollQueued = false; // Reset force scroll queue
  smoothForceScrollQueued = false;
  scrolledToLastLine = false;
  scrolledToFirstLine = false;
  staticReturning = false;
  SetScrollToActiveDirection(null);
  //console.log("SpicyLyrics scroll events cleaned up."); // Optional log
}
// --- END NEW ---
