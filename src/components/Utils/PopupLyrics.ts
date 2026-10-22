// deno-lint-ignore-file no-explicit-any
import Session from "../Global/Session.ts";
import PageView, { PageContainer } from "../Pages/PageView.ts";
import Fullscreen from "./Fullscreen.ts";
import { NPVCardOwnsPage, DeRenderNPVCard, RequestNPVCardEvaluate } from "./NPVLyrics.ts";

export let IsPIP = false;
export let _IsPIP_after = false;
// True for the whole PiP setup flow. The NPV card treats it as "page busy" so
// it can't re-take the pipeline during the long awaits (requestWindow, style
// fetches) before IsPIP itself is set.
export let IsPIPOpening = false;

let currentPipWindow = null;
let pipPageHideHandler: ((event: Event) => void) | null = null;

// Smallest popup viewport the layout is built for: the NowBar (artwork +
// metadata) plus room for a couple of lyric lines below it. Document PiP has no
// min-size option, so the window is snapped back up instead.
const PIP_MIN_WIDTH = 260;
const PIP_MIN_HEIGHT = 180;
// Snap once the user lets go — resizing mid-drag fights the OS resize loop.
const PIP_MIN_SIZE_SETTLE_MS = 200;
let pipMinSizeTimer: ReturnType<typeof setTimeout> | null = null;

const EnforcePipMinSize = (pipWindow: Window) => {
  if (pipWindow.closed) return;
  const missingWidth = Math.max(0, PIP_MIN_WIDTH - pipWindow.innerWidth);
  const missingHeight = Math.max(0, PIP_MIN_HEIGHT - pipWindow.innerHeight);
  if (!missingWidth && !missingHeight) return;
  // resizeTo takes the outer size; grow it by exactly what the viewport lacks.
  pipWindow.resizeTo(pipWindow.outerWidth + missingWidth, pipWindow.outerHeight + missingHeight);
};

// Spotify's native side grows every Document PiP window (its own Miniplayer
// too) by about one window-frame inset, once right after it opens and again a
// few seconds later; nothing in the page asks for it. Chromium then remembers
// the grown size, so each open starts bigger than the last. Each jump arrives as
// a single, isolated resize event that grows both axes by the same step, which a
// user drag (a stream of small resize events) never looks like. The first
// jump teaches us the step; any matching jump during the guard is undone.
// The jump can also move the window (in a screen corner it grows toward the
// top-left), and Chromium remembers that position too, so the undo restores
// the window's bounds from before the jump, not just its size.
const PIP_GROWTH_GUARD_MS = 10000;
const PIP_GROWTH_FIRST_JUMP_MS = 1000;
const PIP_GROWTH_SETTLE_MS = 100;
const PIP_GROWTH_TOLERANCE = 2;
const PIP_GROWTH_MAX_STEP = { width: 40, height: 60 };
const PIP_GROWTH_POSITION_POLL_MS = 100;

type PipBounds = { x: number; y: number; width: number; height: number };

type PipGrowthGuard = {
  openedAt: number;
  last: { width: number; height: number };
  // Outer bounds as of the latest resize event. Null until the first one: at
  // "enter" the window isn't placed yet and reports the main window's bounds.
  bounds: PipBounds | null;
  burstFrom: { width: number; height: number; bounds: PipBounds | null } | null;
  burstEvents: number;
  step: { width: number; height: number } | null;
  timer: ReturnType<typeof setTimeout> | null;
  handler: () => void;
  poll: ReturnType<typeof setInterval>;
};
let pipGrowthGuard: PipGrowthGuard | null = null;

const GetPipBounds = (pipWindow: Window): PipBounds => ({
  x: pipWindow.screenX,
  y: pipWindow.screenY,
  width: pipWindow.outerWidth,
  height: pipWindow.outerHeight,
});

const SettlePipGrowthBurst = (pipWindow: Window, guard: PipGrowthGuard) => {
  guard.timer = null;
  const from = guard.burstFrom;
  const events = guard.burstEvents;
  guard.burstFrom = null;
  guard.burstEvents = 0;
  if (pipWindow.closed) return;
  // Moves fire no resize event, so a snapshot taken mid-burst (e.g. by the
  // resize our own undo causes, before its move lands) can be stale.
  guard.bounds = GetPipBounds(pipWindow);
  if (!from || events !== 1) return;

  const grewWidth = pipWindow.innerWidth - from.width;
  const grewHeight = pipWindow.innerHeight - from.height;
  if (grewWidth <= 0 || grewHeight <= 0) return;

  if (!guard.step) {
    if (performance.now() - guard.openedAt > PIP_GROWTH_FIRST_JUMP_MS) return;
    if (grewWidth > PIP_GROWTH_MAX_STEP.width || grewHeight > PIP_GROWTH_MAX_STEP.height) return;
    guard.step = { width: grewWidth, height: grewHeight };
  } else if (
    Math.abs(grewWidth - guard.step.width) > PIP_GROWTH_TOLERANCE ||
    Math.abs(grewHeight - guard.step.height) > PIP_GROWTH_TOLERANCE
  ) {
    return;
  }

  // Only trust the snapshot if it's within one step of where the window is
  // now; otherwise fall back to undoing just the size.
  const before = from.bounds;
  const now = GetPipBounds(pipWindow);
  if (
    before &&
    Math.abs(now.x - before.x) <= PIP_GROWTH_MAX_STEP.width &&
    Math.abs(now.y - before.y) <= PIP_GROWTH_MAX_STEP.height &&
    Math.abs(now.width - before.width) <= PIP_GROWTH_MAX_STEP.width &&
    Math.abs(now.height - before.height) <= PIP_GROWTH_MAX_STEP.height
  ) {
    // Shrink before moving, so a window against the screen edge isn't
    // clamped by the move.
    pipWindow.resizeTo(before.width, before.height);
    pipWindow.moveTo(before.x, before.y);
    guard.bounds = before;
  } else {
    pipWindow.resizeTo(pipWindow.outerWidth - grewWidth, pipWindow.outerHeight - grewHeight);
  }
};

const StartPipGrowthGuard = (pipWindow: Window) => {
  const guard: PipGrowthGuard = {
    openedAt: performance.now(),
    last: { width: pipWindow.innerWidth, height: pipWindow.innerHeight },
    bounds: null,
    burstFrom: null,
    burstEvents: 0,
    step: null,
    timer: null,
    handler: () => {
      if (performance.now() - guard.openedAt > PIP_GROWTH_GUARD_MS) {
        StopPipGrowthGuard(pipWindow);
        return;
      }
      // Opening also fires resizes that only update the outer size; they'd
      // turn the jump that follows into a two-event "drag". They still carry
      // the window's placement, so record that first.
      if (pipWindow.innerWidth === guard.last.width && pipWindow.innerHeight === guard.last.height) {
        guard.bounds = GetPipBounds(pipWindow);
        return;
      }
      if (!guard.burstFrom) guard.burstFrom = { ...guard.last, bounds: guard.bounds };
      guard.bounds = GetPipBounds(pipWindow);
      guard.burstEvents++;
      guard.last = { width: pipWindow.innerWidth, height: pipWindow.innerHeight };
      if (guard.timer) clearTimeout(guard.timer);
      guard.timer = setTimeout(() => SettlePipGrowthBurst(pipWindow, guard), PIP_GROWTH_SETTLE_MS);
    },
    // Moves fire no resize event, so a window dragged between jumps would be
    // put back where it was. Keep the snapshot current while nothing else is
    // changing; the inner-size check skips a jump that has landed but whose
    // resize event hasn't fired yet.
    poll: setInterval(() => {
      // A newer popup's guard isn't ours to stop.
      if (pipGrowthGuard !== guard) {
        clearInterval(guard.poll);
        return;
      }
      if (pipWindow.closed || performance.now() - guard.openedAt > PIP_GROWTH_GUARD_MS) {
        StopPipGrowthGuard(pipWindow);
        return;
      }
      if (!guard.bounds || guard.burstFrom) return;
      if (pipWindow.innerWidth !== guard.last.width || pipWindow.innerHeight !== guard.last.height) return;
      guard.bounds = GetPipBounds(pipWindow);
    }, PIP_GROWTH_POSITION_POLL_MS),
  };
  pipGrowthGuard = guard;
  pipWindow.addEventListener("resize", guard.handler);
};

const StopPipGrowthGuard = (pipWindow: Window | null) => {
  if (!pipGrowthGuard) return;
  pipWindow?.removeEventListener("resize", pipGrowthGuard.handler);
  if (pipGrowthGuard.timer) clearTimeout(pipGrowthGuard.timer);
  clearInterval(pipGrowthGuard.poll);
  pipGrowthGuard = null;
};

const pipResizeHandler = () => {
  if (pipMinSizeTimer) clearTimeout(pipMinSizeTimer);
  pipMinSizeTimer = setTimeout(() => {
    pipMinSizeTimer = null;
    if (currentPipWindow) EnforcePipMinSize(currentPipWindow);
  }, PIP_MIN_SIZE_SETTLE_MS);
};

export const OpenPopupLyrics = async () => {
  IsPIPOpening = true;
  try {
    await OpenPopupLyricsFlow();
  } finally {
    IsPIPOpening = false;
    // If the flow failed or was cancelled, no page event fires — nudge the
    // card so it can come back.
    RequestNPVCardEvaluate();
  }
};

const OpenPopupLyricsFlow = async () => {
  // If the NPV card owns the page, tear it down directly — the guard below
  // would otherwise call Session.GoBack() and wrongly navigate the main view.
  if (NPVCardOwnsPage()) await DeRenderNPVCard();

  if (PageView.IsOpened && !IsPIP) {
    // Destroy leaves fullscreen itself and is synchronous, so the page is
    // guaranteed closed before we recurse — whether or not GoBack applies.
    await PageView.Destroy();
    Session.GoBackFrom("/SpicyLyrics");

    await OpenPopupLyricsFlow();
    return;
  }



  if (PageView.IsOpened) return;

  // Check for the Picture-in-Picture API
  // @ts-ignore: documentPictureInPicture is not yet standard
  const docPiP = globalThis.documentPictureInPicture;
  if (!docPiP || typeof docPiP.requestWindow !== "function") {
    throw new Error("documentPictureInPicture API is not available in this browser.");
  }

  // The first native growth can land before requestWindow resolves, so the
  // guard starts from "enter", which fires as soon as the window exists.
  const startGuardOnEnter = (event: any) => StartPipGrowthGuard(event.window);
  docPiP.addEventListener("enter", startGuardOnEnter, { once: true });

  // Open a Picture-in-Picture window.
  try {
    // @ts-ignore: requestWindow is not yet standard
    currentPipWindow = await docPiP.requestWindow({
      disallowReturnToOpener: true,
      preferInitialWindowPlacement: false,
      width: 390,
      height: 379,
    });
  } finally {
    docPiP.removeEventListener("enter", startGuardOnEnter);
  }
  if (!pipGrowthGuard) StartPipGrowthGuard(currentPipWindow);

  // Copy style sheets over from the initial document
  // so that the player looks the same.
  // Only copy <link> elements with href starting with "https://fonts.spikerko.org" to the PiP window
  Array.from(document.querySelectorAll('link[rel="stylesheet"]')).forEach((link: HTMLLinkElement) => {
    const href = link.getAttribute("href") || "";
    const classList = Array.from(link.classList || []);
    const isFont = href.startsWith("https://fonts.spikerko.org");
    const isLocalCss = /^\/[a-zA-Z]{2}.*\.css$/.test(href);
    const isUserCss = (
      (href.endsWith("colors.css") || href.endsWith("user.css")) &&
      classList.length === 1 &&
      classList[0] === "userCSS"
    );
    if (
      link.href &&
      (isFont || isLocalCss || isUserCss)
    ) {
      const pipLink = document.createElement('link');
      pipLink.rel = 'stylesheet';
      pipLink.type = link.type || 'text/css';
      pipLink.media = link.media || '';
      pipLink.href = link.href;
      // Copy classes if it's a userCSS link
      if (isUserCss) {
        pipLink.className = link.className;
      }
      currentPipWindow.document.head.appendChild(pipLink);
    }
  });

  // Copy the main SpicyLyrics style element
  // Find any <style> element in the DOM that includes '#SpicyLyricsPage' in its textContent
  // Find all <style> elements in the DOM that include '#SpicyLyricsPage' in their textContent
  const spicyLyricsStyleElement = document.querySelector("#slstyles");
  let spicyLyricsStyleContent: string | null = null;

  if (spicyLyricsStyleElement) {
    if (spicyLyricsStyleElement.tagName.toLowerCase() === "link") {
      // @ts-ignore
      const href = spicyLyricsStyleElement.getAttribute("href");
      if (href) {
        try {
          const res = await fetch(href);
          if (res.ok) {
            spicyLyricsStyleContent = await res.text();
          }
        } catch (e) {
          spicyLyricsStyleContent = null;
        }
      }
    } else if (spicyLyricsStyleElement.tagName.toLowerCase() === "style") {
      spicyLyricsStyleContent = spicyLyricsStyleElement.textContent;
    }
  }

  if (spicyLyricsStyleContent) {
    const newStyleElement = document.createElement("style");
    newStyleElement.textContent = spicyLyricsStyleContent;
    currentPipWindow.document.head.appendChild(newStyleElement);
  }

  // Additionally, copy the styles element with the id 'spicyLyrics-additionalStyling'
  const additionalStyling = document.getElementById("spicyLyrics-additionalStyling");
  if (additionalStyling) {
    const newAdditionalStyling = document.createElement("style");
    newAdditionalStyling.id = "spicyLyrics-additionalStyling";
    newAdditionalStyling.textContent = additionalStyling.textContent;
    currentPipWindow.document.head.appendChild(newAdditionalStyling);
  }

  const additionalStylingElement = document.createElement("style");
  additionalStylingElement.textContent = `
    .app-drag-region {
      -webkit-app-region: drag;
      app-region: drag;
      position: fixed;
      height: 40px;
      inset: 0;
      width: 100cqw;
    }
  `.replace(/\s+/g, ' ').replace(/;\s*/g, ';').replace(/{\s*/g, '{').replace(/\s*}/g, '}').trim();

  currentPipWindow.document.head.appendChild(additionalStylingElement);

  // The awaits above (requestWindow, the style fetch) leave room for the main
  // page to open, or for the user to close the still-empty window. Either way
  // PiP can no longer take the page over; bail and drop the window.
  if (PageView.IsOpened || currentPipWindow.closed) {
    StopPipGrowthGuard(currentPipWindow);
    if (!currentPipWindow.closed) currentPipWindow.close();
    currentPipWindow = null;
    return;
  }

  currentPipWindow.document.body.innerHTML = `<div class="app-drag-region"></div><div class="spicy-pip-wrapper"></div>`;

  const pipWrapper = currentPipWindow.document.body.querySelector(".spicy-pip-wrapper") as HTMLElement;

  IsPIP = true;

  await PageView.Open(pipWrapper);
  if (!PageView.IsOpened || !pipWrapper.contains(PageContainer)) {
    // The open was refused or raced; don't leave a blank window claiming PiP.
    IsPIP = false;
    StopPipGrowthGuard(currentPipWindow);
    currentPipWindow.close();
    currentPipWindow = null;
    return;
  }

  Fullscreen.Open(true, false);

  pipPageHideHandler = () => {
    // deno-lint-ignore no-window
    window.location.reload();
  };

  currentPipWindow.addEventListener("pagehide", pipPageHideHandler);

  // Chrome reopens the popup at the last size the user dragged it to, which may
  // be below the minimum.
  EnforcePipMinSize(currentPipWindow);
  currentPipWindow.addEventListener("resize", pipResizeHandler);

  _IsPIP_after = true;
};

export const ClosePopupLyrics = async () => {
  if (!IsPIP || !currentPipWindow) return;
  _IsPIP_after = false;

  await Fullscreen.Close(true)
  await PageView.Destroy();

  // Remove the event listener before closing the window
  if (pipPageHideHandler) {
    currentPipWindow.removeEventListener("pagehide", pipPageHideHandler);
    pipPageHideHandler = null;
  }
  currentPipWindow.removeEventListener("resize", pipResizeHandler);
  StopPipGrowthGuard(currentPipWindow);
  if (pipMinSizeTimer) {
    clearTimeout(pipMinSizeTimer);
    pipMinSizeTimer = null;
  }

  currentPipWindow.close()

  currentPipWindow = null;

  IsPIP = false
}
