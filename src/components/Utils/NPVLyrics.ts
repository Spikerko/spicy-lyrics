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
import { $npvLyricsOpen } from "../../utils/uiState.ts";
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

function refreshCollapsedUI(): void {
  if (!cardEl) return;
  const open = $npvLyricsOpen.get();
  cardEl.classList.toggle("Collapsed", !open);
  // Only rewrite the button when the state actually changed — these DOM writes
  // land inside the observed sidebar subtree and would otherwise re-trigger
  // the observer on every evaluate.
  if (lastToggleOpen === open) return;
  lastToggleOpen = open;
  const toggle = cardEl.querySelector<HTMLElement>("#NPVCardToggle");
  if (toggle) {
    toggle.innerHTML = open ? Icons.Collapse : Icons.Uncollapse;
    setTooltip(toggle, open ? "Hide Lyrics" : "Show Lyrics", "toggle-tip");
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

  const toggle = cardEl.querySelector<HTMLElement>("#NPVCardToggle");
  if (toggle) {
    toggle.addEventListener("click", () => {
      // The atom listener drives the transition, keeping UI and persistence in sync.
      $npvLyricsOpen.set(!$npvLyricsOpen.get());
    });
  }

  refreshCollapsedUI();
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
    if (cardEl) refreshCollapsedUI();
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
    refreshCollapsedUI();
    cardOwnsPage = true;
    await PageView.Open(cardBodyEl, { cardMode: true });
  } else if (desired === "SHELL" && cardOwnsPage) {
    cardOwnsPage = false;
    await PageView.Destroy();
    refreshCollapsedUI();
  } else {
    refreshCollapsedUI();
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
  ]) {
    const id = Global.Event.listen(name, () => scheduleEvaluate());
    watcherMaid.Give(() => {
      Global.Event.unListen(id);
    });
  }

  watcherMaid.Give($npvLyricsOpen.listen(() => scheduleEvaluate()));

  Whentil.When(
    () =>
      document.querySelector(".Root__right-sidebar") ??
      document.querySelector(".Root"),
    () => {
      attachWatchers();
    }
  );
}
