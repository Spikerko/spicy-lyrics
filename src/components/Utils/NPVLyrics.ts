// Compact lyrics card injected into Spotify's right-sidebar Now Playing View.
// Reuses the full synced lyrics pipeline by opening the page (PageView.Open)
// into the card body in cardMode. Because the pipeline is a global singleton
// (PageView.PageContainer), the card is strictly exclusive with the main page,
// PiP and fullscreen — a single reconciler keeps the card in whichever state
// the live conditions allow.
import PageView, { PageContainer } from "../Pages/PageView.ts";
import Fullscreen from "./Fullscreen.ts";
import { IsPIP, _IsPIP_after, IsPIPOpening } from "./PopupLyrics.ts";
import Session from "../Global/Session.ts";
import Global from "../Global/Global.ts";
import { Icons } from "../Styling/Icons.ts";
import { Maid } from "../../modules/Maid.ts";
import Whentil from "../../modules/Whentil.ts";
import { $npvLyricsExpanded, $npvLyricsOpen } from "../../utils/uiState.ts";
import {
  $currentLyricsData,
  $disableNpvLyrics,
  $hideNpvLyricsWhenUnavailable,
} from "../../utils/stores.ts";
import { SpotifyPlayer } from "../Global/SpotifyPlayer.ts";
import Logger from "../../utils/Logger.ts";

const cardLogger = new Logger("NPV Lyrics");

type CardState = "DORMANT" | "SHELL" | "ACTIVE";

let initialized = false;
let cardEl: HTMLElement | null = null;
let cardBodyEl: HTMLElement | null = null;
let cardOwnsPage = false;
let cardMaid: Maid | null = null;
const watcherMaid = new Maid();

let evaluateTimer: ReturnType<typeof setTimeout> | null = null;
let evaluating = false;
let evaluateAgain = false;
// Non-null while the card's open/close or expand/collapse morph is running;
// see holdEvaluateUntilSettled.
let stateAnimation: Promise<unknown> | null = null;

const getNPV = (): HTMLElement | null =>
  document.querySelector<HTMLElement>(
    ".Root__right-sidebar aside.NowPlayingView"
  ) ??
  document.querySelector<HTMLElement>(
    ".Root__right-sidebar aside#Desktop_PanelContainer_Id:has(.main-nowPlayingView-coverArtContainer)"
  );

export function NPVCardOwnsPage(): boolean {
  return cardOwnsPage;
}

/**
 * The injected card element, or null when no card is rendered.
 *
 * Exposed so the sidebar-wide observers elsewhere can skip mutations that
 * originate inside the card (the lyrics pipeline mutates it constantly) with a
 * plain `contains()` parent-pointer walk instead of re-matching a selector.
 */
export function GetNPVCardElement(): HTMLElement | null {
  return cardEl;
}

export async function DeRenderNPVCard(): Promise<void> {
  await teardownCard();
}

/** Ask the card to re-check its conditions (e.g. after an aborted PiP open). */
export function RequestNPVCardEvaluate(): void {
  scheduleEvaluate();
}

/**
 * True when the lyrics pipeline has positively reported "no lyrics" for the
 * track that's playing right now. `$currentLyricsData` carries the
 * `NO_LYRICS:<uri>` sentinel Applyer writes on a 404, so a stale sentinel left
 * over from the previous track no longer matches once the uri moves on — the
 * card comes straight back for the next song without needing to be told.
 */
function hiddenForMissingLyrics(): boolean {
  if (!$hideNpvLyricsWhenUnavailable.get()) return false;
  const uri = SpotifyPlayer.GetUri();
  if (!uri) return false;
  const data = $currentLyricsData.get();
  if (!data.startsWith("NO_LYRICS:")) return false;
  return data.slice("NO_LYRICS:".length) === uri;
}

function desiredState(): CardState {
  if ($disableNpvLyrics.get()) return "DORMANT";
  const npv = getNPV();
  // closest("[inert]") covers the whole .Root__right-sidebar <-> aside chain
  if (!npv || !npv.isConnected || npv.closest("[inert]")) return "DORMANT";
  const pageBusyElsewhere =
    (PageView.IsOpened && !cardOwnsPage) ||
    IsPIP ||
    _IsPIP_after ||
    IsPIPOpening ||
    Fullscreen.IsOpen ||
    Fullscreen.CinemaViewOpen ||
    Spicetify.Platform.History.location.pathname === "/SpicyLyrics";
  if (pageBusyElsewhere) return "DORMANT";
  if (hiddenForMissingLyrics()) return "DORMANT";
  return $npvLyricsOpen.get() ? "ACTIVE" : "SHELL";
}

async function teardownCard(): Promise<void> {
  if (cardOwnsPage) {
    // Drop ownership first so PageView's card guard doesn't recurse into us.
    cardOwnsPage = false;
    await PageView.Destroy();
  }
  cardMaid?.CleanUp();
  cardMaid = null;
  cardEl = null;
  // A queued toggle belongs to this card; don't let it land on a replacement.
  pendingMutate = null;
  document.body.classList.remove("SpicyLyrics_NPVCardExpanded");
  cardBodyEl = null;
  lastToggleOpen = null;
  lastExpanded = null;
}

// The expanded body class hides the NPV's other content, so it must not outlive
// a card that Spotify's React removed. Called from the observers, which run
// before the next paint; reconcile's teardown would only follow after the
// evaluate debounce.
function clearExpandedIfDetached(): void {
  if (cardEl && !cardEl.isConnected) {
    document.body.classList.remove("SpicyLyrics_NPVCardExpanded");
  }
}

function insertCard(npv: HTMLElement, el: HTMLElement): boolean {
  const cover = npv.querySelector(".main-nowPlayingView-coverArtContainer");
  const anchor =
    cover?.closest(".main-nowPlayingView-nowPlayingWidget") ??
    cover?.closest(".main-nowPlayingView-section") ??
    cover?.parentElement ??
    null;
  if (anchor && anchor.parentElement && anchor !== npv) {
    anchor.insertAdjacentElement("afterend", el);
    return true;
  }
  const content = npv.querySelector(".main-nowPlayingView-content");
  if (content) {
    content.prepend(el);
    return true;
  }
  // Never attach to the aside root — the NPV's inner content hasn't rendered
  // yet; the sidebar observer re-triggers a render once it exists.
  return false;
}

function setTooltip(target: Element, content: string, maidKey: string): void {
  try {
    const tip = Spicetify.Tippy(target, {
      ...Spicetify.TippyProps,
      content,
    });
    if (tip) cardMaid?.Give(() => tip.destroy(), maidKey);
  } catch (err) {
    cardLogger.warn("Failed to setup tooltip", err);
  }
}

let lastToggleOpen: boolean | null = null;
let lastExpanded: boolean | null = null;

const STATE_ANIM_MS = 350;
const STATE_ANIM_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

// Open/close morph. FLIP instead of document.startViewTransition: view-transition
// snapshots render in a viewport-anchored top layer, unclipped by the
// sidebar, so the expanded card's true (scroll-clipped, near-viewport-tall)
// rect bled over the rest of the UI. Animating the live element keeps the
// stretch inside the sidebar's own clipping. The class flip happens
// synchronously here; the follow-up debounced evaluate re-runs refreshCardUI
// idempotently, so nothing jumps afterwards.
function animateStateChange(mutate: () => void): Animation | null {
  if (
    !cardEl ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    mutate();
    return null;
  }
  const card = cardEl;
  const buttons = Array.from(
    card.querySelectorAll<HTMLElement>(".CardControl")
  );
  const firstCard = card.getBoundingClientRect();
  const firstButtons = buttons.map((b) => b.getBoundingClientRect());

  mutate();

  const lastCard = card.getBoundingClientRect();
  if (
    firstCard.width === 0 ||
    firstCard.height === 0 ||
    lastCard.width === 0 ||
    lastCard.height === 0
  )
    return null;

  // Stretch the card box from its old size to its new one (overflow: hidden
  // clips the body while it grows/shrinks).
  // The compact body is pinned (flex-shrink: 0) and merely clipped, so the
  // lyrics can render straight away rather than waiting out the morph.
  const morph = card.animate(
    [
      { width: `${firstCard.width}px`, height: `${firstCard.height}px` },
      { width: `${lastCard.width}px`, height: `${lastCard.height}px` },
    ],
    { duration: STATE_ANIM_MS, easing: STATE_ANIM_EASE }
  );

  // Glide each control from its old spot (right cluster <-> centered).
  buttons.forEach((button, i) => {
    const first = firstButtons[i];
    const last = button.getBoundingClientRect();
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    if (dx === 0 && dy === 0) return;
    button.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
      { duration: STATE_ANIM_MS, easing: STATE_ANIM_EASE }
    );
  });
  return morph;
}

const MORPH_CLASSES = [
  "SpicyLyrics_NPVMorph",
  "SpicyLyrics_NPVMorphIn",
  "SpicyLyrics_NPVMorphOut",
];
let activeMorph: ViewTransition | null = null;
// The update callback of a morph that hasn't run yet. startViewTransition
// defers it a frame, so a click in that window would read the old state (the
// stores and the Expanded class) and morph in the wrong direction.
let pendingMutate: (() => void) | null = null;

// Apply a queued morph's state change now, so the next click sees it.
function flushPendingMorph(): void {
  pendingMutate?.();
}

// The morph's clipping comes from nested view-transition groups (Chromium 140+).
// Without them the card's snapshot is a top-level group and bleeds over the UI.
const supportsNestedViewTransitions =
  typeof document.startViewTransition === "function" &&
  CSS.supports("view-transition-group", "nearest");

// Entering/leaving expanded mode can't use the FLIP morph above: the body
// flexes with the card there, and the page is a `container-type: size`
// container with a cqw type scale, so every frame of a height animation
// re-resolved the lyrics' styles and relaid out every line (60–100ms a frame).
// A view transition lays the new state out once and morphs snapshots instead.
// NPVLyrics.css names the NPV panel as the outer group with the card and its
// controls nested inside, so the morph stays clipped to the sidebar — the
// unclipped top-layer snapshots were why this used FLIP originally.
// Nothing here may read layout or computed style: the lyrics dirty both every
// frame, so any read forces a full relayout before the first capture.
function morphExpandedState(mutate: () => void): void {
  flushPendingMorph();
  const card = cardEl;
  if (
    !card ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    mutate();
    return;
  }
  if (!supportsNestedViewTransitions) {
    // The FLIP morph, janky here but contained. Only the expanded body flexes
    // with the animated height, so park the lyrics until it settles.
    const morph = animateStateChange(mutate);
    if (morph && card.classList.contains("Expanded")) {
      holdEvaluateUntilSettled(morph.finished);
    }
    return;
  }
  const root = document.documentElement;
  root.classList.remove(...MORPH_CLASSES);
  root.classList.add(
    "SpicyLyrics_NPVMorph",
    card.classList.contains("Expanded")
      ? "SpicyLyrics_NPVMorphOut"
      : "SpicyLyrics_NPVMorphIn"
  );
  // Runs once: from the callback, or from a later click's flush — the skipped
  // transition still invokes its callback afterwards, which is then a no-op.
  // Dropped if Spotify removed the card first: refreshCardUI would re-add the
  // expanded body class and hide the NPV with no card to show.
  const run = () => {
    if (pendingMutate !== run) return;
    pendingMutate = null;
    if (cardEl !== card || !card.isConnected) return;
    mutate();
  };
  pendingMutate = run;
  const transition = document.startViewTransition(run);
  activeMorph = transition;
  // The stores flip inside the update callback, a frame from now; park the
  // evaluate they trigger until the morph is over.
  holdEvaluateUntilSettled(transition.finished);
  const settle = () => {
    // A newer morph skipped this one and still needs the names.
    if (activeMorph !== transition) return;
    activeMorph = null;
    root.classList.remove(...MORPH_CLASSES);
  };
  transition.finished.then(settle, settle);
}

function refreshCardUI(): void {
  if (!cardEl) return;
  const open = $npvLyricsOpen.get();
  // Defensive: never Expanded while Collapsed.
  const expanded = open && $npvLyricsExpanded.get();
  cardEl.classList.toggle("Collapsed", !open);
  cardEl.classList.toggle("Expanded", expanded);
  // NPVLyrics.css hides the card's wrapper siblings off this, for when the card
  // is nested inside .main-nowPlayingView-content.
  document.body.classList.toggle("SpicyLyrics_NPVCardExpanded", expanded);
  // Only rewrite the buttons when the state actually changed — these DOM
  // writes land inside the observed sidebar subtree and would otherwise
  // re-trigger the observer on every evaluate.
  if (lastToggleOpen !== open) {
    lastToggleOpen = open;
    const toggle = cardEl.querySelector<HTMLElement>("#NPVCardToggle");
    if (toggle) {
      toggle.innerHTML = open ? Icons.Collapse : Icons.Uncollapse;
      setTooltip(toggle, open ? "Hide Lyrics" : "Show Lyrics", "toggle-tip");
    }
  }
  if (lastExpanded !== expanded) {
    lastExpanded = expanded;
    const maximize = cardEl.querySelector<HTMLElement>("#NPVCardMaximize");
    if (maximize) {
      maximize.innerHTML = expanded ? Icons.Minimize : Icons.Maximize;
      setTooltip(
        maximize,
        expanded ? "Exit Expanded" : "Expand Lyrics",
        "maximize-tip"
      );
    }
  }
}

function renderCardShell(npv: HTMLElement): boolean {
  const el = document.createElement("div");
  el.id = "SpicyLyricsNPVCard";
  el.innerHTML = `
        <div class="CardHeader">
            <span class="CardTitle">Lyrics</span>
            <div class="CardControls">
                <button id="NPVCardExpand" class="CardControl">${Icons.CinemaView}</button>
                <button id="NPVCardMaximize" class="CardControl">${Icons.Maximize}</button>
                <button id="NPVCardToggle" class="CardControl">${Icons.Collapse}</button>
            </div>
        </div>
        <div class="CardBody"></div>
    `;
  if (!insertCard(npv, el)) return false;
  cardMaid = new Maid();
  cardEl = el;
  cardMaid.Give(cardEl);
  cardBodyEl = cardEl.querySelector<HTMLElement>(".CardBody");

  const expand = cardEl.querySelector<HTMLElement>("#NPVCardExpand");
  if (expand) {
    expand.addEventListener("click", () => {
      // The card guard inside PageView.Open hands the pipeline over.
      Session.Navigate({ pathname: "/SpicyLyrics" });
    });
    setTooltip(expand, "Open Spicy Lyrics", "expand-tip");
  }

  const maximize = cardEl.querySelector<HTMLElement>("#NPVCardMaximize");
  if (maximize) {
    maximize.addEventListener("click", () => {
      morphExpandedState(() => {
        const next = !$npvLyricsExpanded.get();
        $npvLyricsExpanded.set(next);
        // Expanding a collapsed card opens + expands in one step.
        if (next && !$npvLyricsOpen.get()) $npvLyricsOpen.set(true);
        refreshCardUI();
      });
    });
  }

  const toggle = cardEl.querySelector<HTMLElement>("#NPVCardToggle");
  if (toggle) {
    toggle.addEventListener("click", () => {
      flushPendingMorph();
      // Hiding an expanded card also leaves expanded mode.
      const morph = cardEl?.classList.contains("Expanded")
        ? morphExpandedState
        : animateStateChange;
      morph(() => {
        const open = $npvLyricsOpen.get();
        // Collapsing an expanded card exits expanded mode for good — reopening
        // shows the normal card again.
        if (open && $npvLyricsExpanded.get()) $npvLyricsExpanded.set(false);
        $npvLyricsOpen.set(!open);
        refreshCardUI();
      });
    });
  }

  refreshCardUI();
  return true;
}

async function reconcile(): Promise<void> {
  // Health check: Spotify's React may wipe the injected card at any time.
  // Never leave PageView.IsOpened pointing at a detached PageContainer.
  if (cardEl && !cardEl.isConnected) {
    cardLogger.debug("Card was removed externally, cleaning up");
    await teardownCard();
  }

  const desired = desiredState();
  const current: CardState = !cardEl
    ? "DORMANT"
    : cardOwnsPage
      ? "ACTIVE"
      : "SHELL";

  if (desired === current) {
    if (cardEl) refreshCardUI();
    return;
  }

  cardLogger.debug(`State: ${current} -> ${desired}`);

  if (desired === "DORMANT") {
    await teardownCard();
    return;
  }

  if (current === "DORMANT") {
    const npv = getNPV();
    if (!npv) return;
    // NPV inner content not rendered yet — the sidebar observer retries.
    if (!renderCardShell(npv)) return;
  }

  if (desired === "ACTIVE" && !cardOwnsPage && cardBodyEl) {
    refreshCardUI();
    cardOwnsPage = true;
    const body = cardBodyEl;
    await PageView.Open(body, { cardMode: true });
    // Open bails if another page got there first. Claiming ownership anyway
    // would let a later teardown destroy that other page.
    if (!PageView.IsOpened || !body.contains(PageContainer)) {
      cardOwnsPage = false;
    }
  } else if (desired === "SHELL" && cardOwnsPage) {
    cardOwnsPage = false;
    await PageView.Destroy();
    refreshCardUI();
  } else {
    refreshCardUI();
  }
}

async function evaluate(): Promise<void> {
  if (evaluating) {
    evaluateAgain = true;
    return;
  }
  evaluating = true;
  try {
    do {
      evaluateAgain = false;
      await reconcile();
    } while (evaluateAgain);
  } catch (err) {
    cardLogger.error("Reconcile failed", err);
  } finally {
    evaluating = false;
  }
}

// Coalescing debounce: lets multi-step flows (PiP close, the page handover in
// PageView.Open) finish before conditions are re-read.
function scheduleEvaluate(): void {
  if (evaluateTimer !== null) return;
  // A morph is in flight — its settle handler re-schedules us. See
  // holdEvaluateUntilSettled.
  if (stateAnimation !== null) return;
  evaluateTimer = setTimeout(() => {
    evaluateTimer = null;
    void evaluate();
  }, 100);
}

/**
 * Park pending evaluates until the card's size morph finishes.
 *
 * reconcile() runs the synchronous, DOM-heavy PageView.Open/Destroy. The 100ms
 * debounce used to drop that squarely inside the 350ms morph — and because the
 * card body is a `container-type: size` container whose type scale is cqw-derived,
 * every animation frame re-resolved the lyrics' font sizes, relaid out every
 * mounted line, and kicked the virtualizer's per-wrapper ResizeObserver into
 * another measure/mount cycle. Letting the box settle first means the lyrics are
 * built and measured once, against final dimensions.
 */
function holdEvaluateUntilSettled(finished: Promise<unknown>): void {
  if (evaluateTimer !== null) {
    clearTimeout(evaluateTimer);
    evaluateTimer = null;
  }
  stateAnimation = finished;
  const settle = () => {
    // A newer morph took over; it owns the re-schedule now.
    if (stateAnimation !== finished) return;
    stateAnimation = null;
    // Skip the debounce: the box has settled, and an expand from the closed
    // state would otherwise sit empty for another 100ms before the lyrics mount.
    if (evaluateTimer !== null) {
      clearTimeout(evaluateTimer);
      evaluateTimer = null;
    }
    void evaluate();
  };
  // finished rejects when the animation is cancelled (card torn down mid-morph);
  // settle either way so we can never wedge with a stale hold.
  finished.then(settle, settle);
}

let observedSidebar: Element | null = null;

function attachSidebarObserver(): void {
  const sidebar = document.querySelector(".Root__right-sidebar");
  if (!sidebar || sidebar === observedSidebar) return;
  const observer = new MutationObserver((records) => {
    clearExpandedIfDetached();
    // Ignore mutations inside our own card (the synced lyrics pipeline
    // mutates it constantly); the card's removal itself still passes, since
    // that mutation targets the card's parent.
    for (const record of records) {
      const target = record.target;
      if (cardEl && (target === cardEl || cardEl.contains(target))) continue;
      scheduleEvaluate();
      return;
    }
  });
  observer.observe(sidebar, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["inert"],
  });
  // Keyed Give disconnects the previous observer when the sidebar is swapped.
  watcherMaid.Give(observer, "sidebar-observer");
  observedSidebar = sidebar;
  scheduleEvaluate();
}

function attachWatchers(): void {
  attachSidebarObserver();

  // Spotify swaps the sidebar element itself (e.g. for cinema view) — watch
  // its parent and re-attach the sidebar observer when that happens.
  const topContainer = document.querySelector(".Root__top-container");
  const watchRoot =
    topContainer ?? document.querySelector(".Root") ?? document.body;
  const topObserver = new MutationObserver(() => {
    clearExpandedIfDetached();
    if (!observedSidebar || !observedSidebar.isConnected) {
      observedSidebar = null;
      attachSidebarObserver();
    }
  });
  topObserver.observe(watchRoot, {
    childList: true,
    subtree: topContainer === null,
  });
  watcherMaid.Give(topObserver, "top-observer");
}

export function initNPVLyrics(): void {
  if (initialized) return;
  initialized = true;

  for (const name of [
    "page:destroy",
    "page:open",
    "fullscreen:open",
    "fullscreen:exit",
    "platform:history",
    // A new track invalidates any "no lyrics" hide — re-render and let the
    // freshly opened page fetch decide whether it stays.
    "playback:songchange",
  ]) {
    const id = Global.Event.listen(name, () => scheduleEvaluate());
    watcherMaid.Give(() => {
      Global.Event.unListen(id);
    });
  }

  watcherMaid.Give($npvLyricsOpen.listen(() => scheduleEvaluate()));
  watcherMaid.Give($npvLyricsExpanded.listen(() => scheduleEvaluate()));
  // The apply pipeline publishes the 404 sentinel (and clears it once real
  // lyrics land) through $currentLyricsData, so this is both the hide and the
  // un-hide trigger.
  watcherMaid.Give($currentLyricsData.listen(() => scheduleEvaluate()));
  watcherMaid.Give($hideNpvLyricsWhenUnavailable.listen(() => scheduleEvaluate()));
  // Turning the card off tears it down live; turning it back on re-injects it.
  watcherMaid.Give($disableNpvLyrics.listen(() => scheduleEvaluate()));
  // Hide Spotify's own NPV lyrics section whenever the card is enabled, even
  // while the card itself isn't rendered.
  watcherMaid.Give(
    $disableNpvLyrics.subscribe((disabled) => {
      document.body.classList.toggle("SpicyLyrics_NPVCardEnabled", !disabled);
    })
  );

  Whentil.When(
    () =>
      document.querySelector(".Root__right-sidebar") ??
      document.querySelector(".Root"),
    () => {
      attachWatchers();
    }
  );
}
