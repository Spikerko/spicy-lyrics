// Compact lyrics card injected into Spotify's right-sidebar Now Playing View.
// Reuses the full synced lyrics pipeline by opening the page (PageView.Open)
// into the card body in cardMode. Because the pipeline is a global singleton
// (PageView.PageContainer), the card is strictly exclusive with the main page,
// PiP and fullscreen — a single reconciler keeps the card in whichever state
// the live conditions allow.
import PageView from "../Pages/PageView.ts";
import Fullscreen from "./Fullscreen.ts";
import { IsPIP, _IsPIP_after, IsPIPOpening } from "./PopupLyrics.ts";
import Session from "../Global/Session.ts";
import Global from "../Global/Global.ts";
import { Icons } from "../Styling/Icons.ts";
import { Maid } from "../../modules/Maid.ts";
import Whentil from "../../modules/Whentil.ts";
import { $npvLyricsExpanded, $npvLyricsOpen } from "../../utils/uiState.ts";
import { $currentLyricsData, $hideNpvLyricsWhenUnavailable } from "../../utils/stores.ts";
import { SpotifyPlayer } from "../Global/SpotifyPlayer.ts";
import Logger from "../../utils/logger.ts";

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
  cardBodyEl = null;
  lastToggleOpen = null;
  lastExpanded = null;
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

// FLIP morph instead of document.startViewTransition: view-transition
// snapshots render in a viewport-anchored top layer, unclipped by the
// sidebar, so the expanded card's true (scroll-clipped, near-viewport-tall)
// rect bled over the rest of the UI. Animating the live element keeps the
// stretch inside the sidebar's own clipping. The class flip happens
// synchronously here; the follow-up debounced evaluate re-runs refreshCardUI
// idempotently, so nothing jumps afterwards.
function animateStateChange(mutate: () => void): void {
  if (
    !cardEl ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    mutate();
    return;
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
    return;

  // Stretch the card box from its old size to its new one (overflow: hidden
  // clips the body while it grows/shrinks).
  card.animate(
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
}

function refreshCardUI(): void {
  if (!cardEl) return;
  const open = $npvLyricsOpen.get();
  // Defensive: never Expanded while Collapsed.
  const expanded = open && $npvLyricsExpanded.get();
  cardEl.classList.toggle("Collapsed", !open);
  cardEl.classList.toggle("Expanded", expanded);
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
      animateStateChange(() => {
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
      animateStateChange(() => {
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
    await PageView.Open(cardBodyEl, { cardMode: true });
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
  evaluateTimer = setTimeout(() => {
    evaluateTimer = null;
    void evaluate();
  }, 100);
}

let observedSidebar: Element | null = null;

function attachSidebarObserver(): void {
  const sidebar = document.querySelector(".Root__right-sidebar");
  if (!sidebar || sidebar === observedSidebar) return;
  const observer = new MutationObserver((records) => {
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

  Whentil.When(
    () =>
      document.querySelector(".Root__right-sidebar") ??
      document.querySelector(".Root"),
    () => {
      attachWatchers();
    }
  );
}
