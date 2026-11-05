import { GetCurrentLyricsContainerInstance } from "../../utils/Lyrics/Applyer/CreateLyricsContainer.ts";
import { SyncNoLyricsLayout } from "../../utils/Lyrics/LyricsNotice.ts";
import { ResetLastLine } from "../../utils/Scrolling/ScrollToActiveLine.ts";
import { $currentLyricsData } from "../../utils/stores.ts";
import { $forceCompactMode, $isNowBarOpen } from "../../utils/uiState.ts";
import Global from "../Global/Global.ts";
import { SetKawarpSuspended } from "../DynamicBG/dynamicBackground.ts";
import PageView, { Compactify, GetPageRoot, PageContainer, Tooltips } from "../Pages/PageView.ts";
import { EnableCompactMode, IsCompactMode } from "./CompactMode.ts";
import { CleanUpNowBarComponents, CloseNowBar, DeregisterNowBarBtn, OpenNowBar } from "./NowBar.ts";
import TransferElement from "./TransferElement.ts";
import { IsPIP } from "./PopupLyrics.ts";
import { Spring } from "../../modules/Spring.ts";
import { Maid } from "../../modules/Maid.ts";
import Scheduler from "../../modules/Scheduler.ts";
import { cancelCappedFrame, requestCappedFrame } from "../../utils/AnimationFrameLoop.ts";
import Logger from "../../utils/Logger.ts";

const fullscreenLogger = new Logger("Fullscreen");

const Fullscreen = {
  Open,
  Close,
  CloseImmediately,
  Toggle,
  IsOpen: false,
  CinemaViewOpen: false,
};

const ControlsMaid = new Maid();

const controlsOpacitySpring = new Spring(0, 2, 2, 0); // Goal: 0.65
const artworkBrightnessSpring = new Spring(0, 2, 2, 0); // Goal: 0.78
// Canvas Stage's dock rows: up with the controls, down only once they've fully faded.
const dockLiftSpring = new Spring(0, 2.5, 1, 0);

let animationLastTimestamp: number | undefined;

// The layouts whose dock rows read --DockLift (Canvas Stage, the popup dock). Nothing else does.
const isDockLayout = () =>
  (PageContainer?.classList.contains("CanvasImmersive") ||
    (IsPIP && PageContainer?.classList.contains("Exp_PopupDock"))) ??
  false;

// --DockLift sits on the Header, so every write restyles the whole Header; identical values are skipped.
let dockLiftWritten: { el: HTMLElement; value: string } | null = null;

function writeDockLift(header: HTMLElement, dockLift: number) {
  const value = dockLift.toString();
  if (dockLiftWritten?.el === header && dockLiftWritten.value === value) return;
  header.style.setProperty("--DockLift", value);
  dockLiftWritten = { el: header, value };
}

// Canvas Stage's stage element, kept between frames instead of looked up on each one.
let canvasStage: HTMLElement | null = null;

function getCanvasStage(): HTMLElement | null {
  if (canvasStage?.isConnected && PageContainer?.contains(canvasStage)) return canvasStage;
  canvasStage = PageContainer?.querySelector<HTMLElement>(".ContentBox > .CanvasStage") ?? null;
  return canvasStage;
}

let visualsApplied = false;
let pageHover = false;
let mediaBoxHover = false;

let lastPageMouseMove: number | undefined;

const Page_MouseMove = () => {
  pageHover = true;
  lastPageMouseMove = performance.now();
  ToggleControls();
  if (!mediaBoxHover) {
    MouseMoveChecker();
  }
};

const MouseMoveChecker = () => {
  const now = performance.now();
  if (lastPageMouseMove !== undefined && now - lastPageMouseMove >= 750 && !mediaBoxHover) {
    animationLastTimestamp = now;
    ToggleControls(true);
    ControlsMaid.Clean("MouseMoveChecker");
    return;
  }
  ControlsMaid.Give(Scheduler.OnPreRender(MouseMoveChecker), "MouseMoveChecker");
};

const RunMediaBoxAnimation = () => {
  const timestampNow = performance.now();

  if (animationLastTimestamp !== undefined) {
    const deltaTime = (timestampNow - animationLastTimestamp) / 1000;
    const controlsOpacity = controlsOpacitySpring.Step(deltaTime);
    const artworkBrightness = artworkBrightnessSpring.Step(deltaTime);
    if (controlsOpacitySpring.GetGoal() > 0) {
      dockLiftSpring.SetGoal(1);
    } else if (controlsOpacity <= 0.005) {
      dockLiftSpring.SetGoal(0);
    }
    // Outside the dock layouts nothing reads the lift, so it isn't animated there: it sits at
    // its goal, ready for a dock layout that turns on, and doesn't keep this loop running.
    if (!isDockLayout()) dockLiftSpring.SetGoal(dockLiftSpring.GetGoal(), true);
    const dockLift = dockLiftSpring.Step(deltaTime);

    const MediaBox = PageContainer?.querySelector<HTMLElement>(
      ".ContentBox .NowBar .Header .MediaBox"
    );

    if (MediaBox) {
      MediaBox.style.setProperty("--ArtworkBrightness", artworkBrightness.toString());
      MediaBox.style.setProperty("--ControlsOpacity", controlsOpacity.toString());
      if (MediaBox.parentElement) writeDockLift(MediaBox.parentElement, dockLift);
    }
    getCanvasStage()?.style.setProperty("--StageBrightness", artworkBrightness.toString());

    if (controlsOpacitySpring.CanSleep() && artworkBrightnessSpring.CanSleep() && dockLiftSpring.CanSleep()) {
      animationLastTimestamp = undefined;
      visualsApplied = false;
      return;
    }
  }

  animationLastTimestamp = timestampNow;

  ControlsMaid.Give(Scheduler.OnPreRender(RunMediaBoxAnimation), "MediaBoxAnimation");
};

// While a slider handle is being dragged the pointer regularly leaves the MediaBox,
// and `MediaBox_MouseOut` fires unconditionally — without this latch the controls
// would fade out from under the cursor mid-drag.
let controlsDragLock = false;

export const SetControlsDragLock = (locked: boolean) => {
  if (controlsDragLock === locked) return;
  controlsDragLock = locked;
  // Re-evaluate once the drag is over so the controls settle into whatever the
  // hover state became while we were ignoring it.
  if (!locked) ToggleControls(true);
};

const ToggleControls = (force: boolean = false) => {
  if (controlsDragLock) return;

  const now = performance.now();

  const getControlsOpacityGoal = () => {
    if (lastPageMouseMove !== undefined && now - lastPageMouseMove >= 750) {
      return 0;
    } else if (pageHover && !mediaBoxHover) {
      return 0.65;
    } else if (mediaBoxHover) {
      return 0.985;
    } else {
      return 0;
    }
  };

  const getArtworkBrightnessGoal = () => {
    if (lastPageMouseMove !== undefined && now - lastPageMouseMove >= 750) {
      return 1;
    } else if (pageHover && !mediaBoxHover) {
      return 0.78;
    } else if (mediaBoxHover) {
      return 0.55;
    } else {
      return 1;
    }
  };

  // Canvas Stage and the popup dock move the dock rows on this spring, so it runs critically
  // damped at a quicker response there; the cover layout keeps its slow overdamped fade.
  const immersive = isDockLayout();
  for (const spring of [controlsOpacitySpring, artworkBrightnessSpring]) {
    spring.SetFrequency(immersive ? 2.5 : 2);
    spring.SetDampingRatio(immersive ? 1 : 2);
  }

  controlsOpacitySpring.SetGoal(getControlsOpacityGoal());
  artworkBrightnessSpring.SetGoal(getArtworkBrightnessGoal());

  if (force || visualsApplied === false) {
    visualsApplied = true;
    RunMediaBoxAnimation();
  }
};

let EventAbortController: AbortController | undefined;

const MediaBox_MouseIn = () => {
  mediaBoxHover = true;
  pageHover = true;
  ToggleControls();
  ControlsMaid.Clean("MouseMoveChecker");
};

const MediaBox_MouseOut = () => {
  mediaBoxHover = false;
  pageHover = true;
  ToggleControls();
};

const MediaBox_MouseMove = () => {
  mediaBoxHover = true;
  pageHover = true;
  ControlsMaid.Clean("MouseMoveChecker");
  ToggleControls();
};
const Page_MouseIn = () => {
  mediaBoxHover = false;
  pageHover = true;
  ToggleControls();
};

const Page_MouseOut = () => {
  mediaBoxHover = false;
  pageHover = false;
  ToggleControls();
  ControlsMaid.Clean("MouseMoveChecker");
};

/* Hides Spotify's UI behind the fullscreen page. content-visibility rather than
   display: none, so everything inside keeps its laid-out size. With display:
   none the global nav's ResizeObserver saw its width drop to 0, and Spotify
   collapsed the search bar to an icon. It only re-expands when the window
   grows, so it stayed collapsed after fullscreen. The contents are still
   skipped for paint, layout, focus and the accessibility tree. Fixed at the
   same full-window box takes #main out of the flow like display: none did, so
   a page that ends up in flow (themes that set position: relative on it)
   still starts at the top. */
const HIDDEN_MAIN_STYLES = {
  "content-visibility": "hidden",
  position: "fixed",
  inset: "0",
} as const;

// The Now Playing sidebar is inside #main, so its background has nothing to draw while it's hidden.
function hideMainElement(mainElement: HTMLElement) {
  for (const [property, value] of Object.entries(HIDDEN_MAIN_STYLES)) {
    mainElement.style.setProperty(property, value);
  }
  SetKawarpSuspended("npvbg", true);
}

/* Spotify draws its menu button (top left) and window buttons (top right) natively over the web
   content, and holds their places in the global nav with empty spacers. Cinema View stays in the
   window, so those buttons sit over the page too. The page's corner controls line up with them
   the way the nav does: on the nav bar's centreline, no taller than its buttons, and set off from
   each spacer by the gap of the flex row it sits in. */
const NATIVE_CHROME_VARS = [
  "--NativeChromeMid",
  "--NativeChromeControlMax",
  "--NativeChromeLeftInset",
  "--NativeChromeRightInset",
] as const;

function syncNativeChromeInsets(page: HTMLElement) {
  const spacerIn = (row: HTMLElement | null, edge: "first" | "last") => {
    const el = edge === "first" ? row?.firstElementChild : row?.lastElementChild;
    return el instanceof HTMLElement && el.childElementCount === 0 && el.offsetWidth > 0
      ? el.getBoundingClientRect()
      : null;
  };
  const gapOf = (row: HTMLElement) => parseFloat(getComputedStyle(row).columnGap) || 0;

  const navBar = document.querySelector<HTMLElement>("#global-nav-bar");
  const leftRow = document.querySelector<HTMLElement>(".main-globalNav-historyButtonsWrapper");
  const rightRow = document.querySelector<HTMLElement>(".main-globalNav-contentRight");
  const left = spacerIn(leftRow, "first");
  const right = spacerIn(rightRow, "last");

  const values: Record<(typeof NATIVE_CHROME_VARS)[number], number | null> = {
    "--NativeChromeMid": null,
    "--NativeChromeControlMax": null,
    "--NativeChromeLeftInset": left && leftRow ? left.right + gapOf(leftRow) : null,
    "--NativeChromeRightInset":
      right && rightRow ? window.innerWidth - right.left + gapOf(rightRow) : null,
  };
  if (navBar && leftRow && (left || right)) {
    const bar = navBar.getBoundingClientRect();
    values["--NativeChromeMid"] = bar.top + bar.height / 2;
    values["--NativeChromeControlMax"] = leftRow.getBoundingClientRect().height;
  }

  // Every write restyles the whole page, so unchanged values are skipped.
  for (const name of NATIVE_CHROME_VARS) {
    const value = values[name] === null ? "" : `${values[name]}px`;
    if (page.style.getPropertyValue(name) === value) continue;
    if (value) page.style.setProperty(name, value);
    else page.style.removeProperty(name);
  }
}

function clearNativeChromeInsets(page: HTMLElement) {
  for (const name of NATIVE_CHROME_VARS) page.style.removeProperty(name);
}

function showMainElement() {
  SetKawarpSuspended("npvbg", false);
  const mainElement = document.querySelector<HTMLElement>("#main");
  if (!mainElement) return;
  for (const property of Object.keys(HIDDEN_MAIN_STYLES)) {
    mainElement.style.removeProperty(property);
  }
}

export const ExitFullscreenElement = async () => {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
  }
  setTimeout(Compactify, 1000);
};

export const EnterSpicyLyricsFullscreen = async () => {
  const mainElement = document.querySelector<HTMLElement>("#main");
  if (mainElement) {
    hideMainElement(mainElement);
  }

  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    fullscreenLogger.error(`Fullscreen error: ${errorMessage}`);
  }

  document.documentElement.focus();

  setTimeout(Compactify, 1000);
};

function CleanupMediaBox() {
  EventAbortController?.abort();
  EventAbortController = undefined;

  ControlsMaid.CleanUp();

  animationLastTimestamp = undefined;
  lastPageMouseMove = undefined;

  visualsApplied = false;
  mediaBoxHover = false;
  pageHover = false;
  controlsDragLock = false;
}

// Bumped by every Open and Close. The deferred work either one schedules checks
// it before touching the page, so a later transition (or the page being
// destroyed) cancels it instead of being overwritten by it.
let fullscreenGeneration = 0;
let closeInFlight: Promise<boolean> | null = null;

/** True while an animated Close is playing its exit animation. */
export const IsFullscreenClosing = () => closeInFlight !== null;

function Open(skipDocumentFullscreen: boolean = false, moveElement: boolean = true) {
  const SpicyPage = PageContainer;
  const Root = document.body as HTMLElement;
  const mainElement = document.querySelector<HTMLElement>("#main");
  const generation = ++fullscreenGeneration;
  // Reopening mid exit-animation supersedes that Close.
  closeInFlight = null;
  const stillOpen = () =>
    Fullscreen.IsOpen && generation === fullscreenGeneration && PageContainer === SpicyPage;

  if (SpicyPage) {
    // Set state first
    Fullscreen.IsOpen = true;
    Fullscreen.CinemaViewOpen = skipDocumentFullscreen;

    // Handle DOM changes
    if (moveElement) TransferElement(SpicyPage, Root);
    SpicyPage.classList.add("Fullscreen");

    // Hide the main element
    if (mainElement && moveElement) {
      hideMainElement(mainElement);
    }

    // Safely destroy tooltip if it exists
    const nowBarToggle = Tooltips.NowBarToggle as any;
    if (nowBarToggle && typeof nowBarToggle.destroy === "function") {
      nowBarToggle.destroy();
    }

    const NowBarToggle = SpicyPage.querySelector<HTMLElement>(
      ".ViewControls #NowBarToggle"
    );
    if (NowBarToggle) {
      NowBarToggle.remove();
    }

    CleanUpNowBarComponents();
    CleanupMediaBox();
    OpenNowBar(true);

    // Handle fullscreen state
    const handleFullscreen = async () => {
      try {
        if (!skipDocumentFullscreen) {
          await EnterSpicyLyricsFullscreen();
        }
        setTimeout(() => PageView.AppendViewControls(true), 50);
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        fullscreenLogger.error(`Fullscreen error: ${errorMessage}`);
      }
    };

    handleFullscreen();
    ResetLastLine();

    // Setup media box interactions
    const MediaBox = SpicyPage.querySelector<HTMLElement>(
      ".ContentBox .NowBar .Header .MediaBox"
    );
    const MediaImageContainer = SpicyPage.querySelector<HTMLElement>(
      ".ContentBox .NowBar .Header .MediaBox .MediaImageContainer"
    );

    if (MediaBox && MediaImageContainer) {
      // Create and store the AbortController
      EventAbortController = new AbortController();
      const signal = EventAbortController.signal;

      MediaBox.addEventListener("mouseenter", MediaBox_MouseIn, { signal });
      MediaBox.addEventListener("mouseleave", MediaBox_MouseOut, { signal });
      MediaBox.addEventListener("mousemove", MediaBox_MouseMove, { signal });

      if (SpicyPage) {
        SpicyPage.addEventListener("mouseenter", Page_MouseIn, { signal });
        SpicyPage.addEventListener("mousemove", Page_MouseMove, { signal });
        SpicyPage.addEventListener("mouseleave", Page_MouseOut, { signal });
      }

      if (!IsPIP) {
        syncNativeChromeInsets(SpicyPage);
        // Resize fires on every pointer move of a window drag; one measure per frame is enough.
        let syncFrame: number | null = null;
        const sync = () => {
          if (syncFrame !== null) return;
          syncFrame = requestCappedFrame(() => {
            syncFrame = null;
            syncNativeChromeInsets(SpicyPage);
          });
        };
        signal.addEventListener("abort", () => {
          if (syncFrame !== null) cancelCappedFrame(syncFrame);
        });
        window.addEventListener("resize", sync, { signal });
        // On zoom, Spotify resizes the spacers only once it writes --zoom-level on .Root, after the resize event.
        const root = document.querySelector<HTMLElement>(".Root");
        if (root) {
          // The attribute carries other values too; only a zoom change moves the spacers.
          let zoom = root.style.getPropertyValue("--zoom-level");
          const zoomObserver = new MutationObserver(() => {
            const next = root.style.getPropertyValue("--zoom-level");
            if (next === zoom) return;
            zoom = next;
            sync();
          });
          zoomObserver.observe(root, { attributes: true, attributeFilter: ["style"] });
          signal.addEventListener("abort", () => zoomObserver.disconnect());
        }
      }
    }

    Global.Event.evoke("fullscreen:open", null);
  }
  setTimeout(() => {
    if (IsPIP || !stillOpen()) return;

    Compactify();

    if ($forceCompactMode.get() && !IsCompactMode()) {
      SpicyPage?.classList.add("ForcedCompactMode");
      EnableCompactMode();
    }
  }, 750);

  setTimeout(() => {
    if (!stillOpen()) return;
    PageView.AppendViewControls(true);

    SyncNoLyricsLayout();
  }, 75);

  GetCurrentLyricsContainerInstance()?.Resize();
}

/**
 * The shared tail of a non-PiP close: put the page back into the normal flow
 * (or leave it where it is, when it's about to be destroyed) and reset the
 * fullscreen-only NowBar/MediaBox state.
 */
function finishClose(SpicyPage: HTMLElement, transfer: boolean) {
  if (transfer) {
    const root = GetPageRoot();
    if (root) {
      TransferElement(SpicyPage, root);
    } else {
      // No main view to return to. Parking the page on <body> would strand it
      // over the whole client, so drop it instead.
      transfer = false;
      queueMicrotask(() => void PageView.Destroy());
    }
  }
  SpicyPage.classList.remove("Fullscreen", "frame_F_Exit");
  clearNativeChromeInsets(SpicyPage);

  void ExitFullscreenElement().then(() => {
    if (transfer) setTimeout(() => PageView.AppendViewControls(true), 50);
  });

  SyncNoLyricsLayout();
  if (transfer && $currentLyricsData.get().includes("NO_LYRICS")) DeregisterNowBarBtn();

  ResetLastLine();

  if (!$isNowBarOpen.get()) {
    CloseNowBar();
  }

  CleanupMediaBox();
  CleanUpNowBarComponents();

  Global.Event.evoke("fullscreen:exit", null);
}

/**
 * Resolves true once this close has finished, or false if it was superseded
 * (page destroyed, fullscreen reopened) — callers that navigate after closing
 * must then leave navigation to whoever superseded it.
 */
function Close(isPip: boolean = false): Promise<boolean> {
  // A second Close during the exit animation (double click, Esc + click) joins
  // the one already running instead of replaying the animation and transfer.
  if (closeInFlight) return closeInFlight;

  const SpicyPage = PageContainer;
  if (!SpicyPage) return Promise.resolve(false);

  const generation = ++fullscreenGeneration;
  Fullscreen.IsOpen = false;
  Fullscreen.CinemaViewOpen = false;

  if (isPip) {
    SpicyPage.classList.remove("Fullscreen");

    ResetLastLine();

    if (!$isNowBarOpen.get()) {
      CloseNowBar();
    }

    CleanupMediaBox();
    CleanUpNowBarComponents();

    Global.Event.evoke("fullscreen:exit", null);
    GetCurrentLyricsContainerInstance()?.Resize();
    return Promise.resolve(true);
  }

  showMainElement();

  // Apply exit animation and block all interaction for its duration
  SpicyPage.classList.add("frame_F_Exit");
  document.body.style.pointerEvents = "none";

  const run = async () => {
    try {
      await new Promise((r) => setTimeout(r, 650));
    } finally {
      document.body.style.removeProperty("pointer-events");
    }

    // The page was destroyed (route change) or replaced, or fullscreen was
    // reopened or force-closed while the animation played. Whoever did that
    // owns the page now; re-inserting it here would resurrect a dead page.
    if (generation !== fullscreenGeneration || PageContainer !== SpicyPage) {
      SpicyPage.classList.remove("frame_F_Exit");
      return false;
    }

    finishClose(SpicyPage, true);
    setTimeout(Compactify, 1000);
    GetCurrentLyricsContainerInstance()?.Resize();
    return true;
  };

  const promise: Promise<boolean> = run().finally(() => {
    if (closeInFlight === promise) closeInFlight = null;
  });
  closeInFlight = promise;
  return promise;
}

/**
 * Leave fullscreen synchronously, without the exit animation, for a page that
 * is about to be destroyed. Also cancels an animated Close that is mid-flight.
 */
function CloseImmediately() {
  const SpicyPage = PageContainer;
  if (!SpicyPage || (!Fullscreen.IsOpen && closeInFlight === null)) return;

  ++fullscreenGeneration;
  closeInFlight = null;
  Fullscreen.IsOpen = false;
  Fullscreen.CinemaViewOpen = false;
  document.body.style.removeProperty("pointer-events");

  if (IsPIP) {
    SpicyPage.classList.remove("Fullscreen");
    CleanupMediaBox();
    CleanUpNowBarComponents();
    Global.Event.evoke("fullscreen:exit", null);
    return;
  }

  showMainElement();
  finishClose(SpicyPage, false);
}

function Toggle(skipDocumentFullscreen: boolean = false) {
  const SpicyPage = PageContainer;

  if (SpicyPage) {
    if (Fullscreen.IsOpen) {
      Close();
    } else {
      Open(skipDocumentFullscreen);
    }
  }
}

export { CleanupMediaBox };
export default Fullscreen;
