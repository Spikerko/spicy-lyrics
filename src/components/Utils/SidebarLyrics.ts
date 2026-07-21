import { $isGlobalNav, $sidebarStatus } from "../../utils/uiState.ts";

import PageView from "../Pages/PageView.ts";
import Logger from "../../utils/logger.ts";
import Whentil, { type CancelableTask } from "../../modules/Whentil.ts";

const sidebarLogger = new Logger("Sidebar Lyrics");

// Query selector functions
const getSpicySidebarActiveBody = () => document.body;
// const getRootRightSidebar = () => document.querySelector<HTMLElement>('.Root__right-sidebar');
const getNowPlayingViewElement = () =>
  document.querySelector<HTMLElement>(".Root__right-sidebar aside.NowPlayingView");
const getDesktopPanelContainer = () =>
  document.querySelector<HTMLElement>(
    `.Root__right-sidebar aside#Desktop_PanelContainer_Id:has(.main-nowPlayingView-coverArtContainer)`
  );
const getRightSidebarParentContainer = () => {
  const container =
    document.querySelector<HTMLElement>(".Root__right-sidebar > div:first-of-type") ??
    document.querySelector<HTMLElement>(".Root__right-sidebar .XOawmCGZcQx4cesyNfVO") ??
    document.querySelector<HTMLElement>(".Root__right-sidebar .oXO9_yYs6JyOwkBn8E4a") ??
    document.querySelector<HTMLElement>(".Root__right-sidebar");
  // Fallback lands on .Root__right-sidebar itself which lacks position: relative,
  // so absolute-positioned #SpicyLyricsPage would escape the sidebar bounds.
  if (container?.classList.contains("Root__right-sidebar")) {
    container.style.position = "relative";
  }
  return container;
};
const getQueueContainerElement = () =>
  document.querySelector<HTMLElement>(
    ".Root__right-sidebar > div:first-of-type:has(.v5CVyjR4gInbbJpm, .RSJZvcFNF4XzkvK4S1F9)"
  ) ??
  document.querySelector<HTMLElement>(
    ".Root__right-sidebar .XOawmCGZcQx4cesyNfVO:not(:has(.h0XG5HZ9x0lYV7JNwhoA.JHlPg4iOkqbXmXjXwVdo)):has(.jD_TVjbjclUwewP7P9e8)"
  ) ??
  document.querySelector<HTMLElement>(
    ".Root__right-sidebar .oXO9_yYs6JyOwkBn8E4a:not(:has(.Ot1yAtVbjD2owYqmw6BK)):has(.ZWs_BNtabE4F1v34pU93.mpdgC9UTkN5_fMm1pFiz)"
  ) ??
  document.querySelector<HTMLElement>(
    ".Root__right-sidebar .oXO9_yYs6JyOwkBn8E4a:not(:has(.Ot1yAtVbjD2owYqmw6BK)):has(.main-nowPlayingView-mainContainer.main-actionBar-ActionBarContainer)"
  ) ??
  document.querySelector<HTMLElement>(".Root__right-sidebar > div:first-of-type") ??
  document.querySelector<HTMLElement>(".Root__right-sidebar");
const getDevicesContainerElement = () =>
  document.querySelector<HTMLElement>(
    ".Root__right-sidebar > div:first-of-type:has(.OINH5zA0pQyzffwo, .FNi2RAtuzIc9THq8HYIW):not(:has(.main-nowPlayingView-coverArtContainer))"
  );
// const getSpicyLyricsPageElement = () => document.querySelector<HTMLElement>('#SpicyLyricsPage');
const getParentContainerChildren = (parentContainer: HTMLElement) =>
  parentContainer.querySelector<HTMLElement>(":scope > *:not(#SpicyLyricsPage)");

export const getNowPlayingViewPlaybarButton = () => {
  // console.log("[Spicy Lyrics Debug] getNowPlayingViewPlaybarButton");
  return document.querySelector<HTMLElement>('[data-testid="control-button-npv"]');
};
export const getNowPlayingViewContainer = () => {
  // console.log("[Spicy Lyrics Debug] getNowPlayingViewContainer");
  return getNowPlayingViewElement() ?? getDesktopPanelContainer();
};
export const getNowPlayingViewParentContainer = () => {
  // console.log("[Spicy Lyrics Debug] getNowPlayingViewParentContainer");
  return getRightSidebarParentContainer();
};
const appendOpen = () => {
  // console.log("[Spicy Lyrics Debug] appendOpen");
  getSpicySidebarActiveBody().classList.add("SpicySidebarLyrics__Active");
};
const appendClosed = () => {
  // console.log("[Spicy Lyrics Debug] appendClosed");
  getSpicySidebarActiveBody().classList.remove("SpicySidebarLyrics__Active");
};

export const getQueuePlaybarButton = () => {
  // console.log("[Spicy Lyrics Debug] getNowPlayingViewPlaybarButton");
  return document.querySelector<HTMLElement>('[data-testid="control-button-queue"]');
};

const getDevicesPlaybarButton = () => {
  // console.log("[Spicy Lyrics Debug] getNowPlayingViewPlaybarButton");
  return document.querySelector<HTMLElement>('[data-restore-focus-key="device_picker"]') ?? document.querySelector<HTMLElement>('[aria-describedby="connect-message-nudge"]');
};

export const getQueueContainer = () => {
  return getQueueContainerElement();
};

export let isSpicySidebarMode = false;

/* const playbarButton = new Spicetify.Playbar.Button(
    "Spicy Sidebar Lyrics",
    "lyrics",
    () => {
        // console.log("[Spicy Lyrics Debug] playbarButton clicked", { isSpicySidebarMode });
        if (isSpicySidebarMode) {
            CloseSidebarLyrics();
        } else {
            OpenSidebarLyrics();
        }
    },
    false,
    false
);
 */
export function RegisterSidebarLyrics() {
  // console.log("[Spicy Lyrics Debug] RegisterSidebarLyrics");
  //playbarButton.register();
}

let currentNPVWhentil: CancelableTask | null = null;
let onOpen_wasThingOpen: string | undefined;

// --- Helper to observe removal of #SpicyLyricsPage ---
let spicyLyricsPageObserver: MutationObserver | null = null;
let spicySidebarAsideObserver: MutationObserver | null = null;

export function cleanupSidebarLyricsObservers() {
  if (spicyLyricsPageObserver) {
    try {
      spicyLyricsPageObserver.disconnect();
    } catch (_e) {}
    spicyLyricsPageObserver = null;
  }
  if (spicySidebarAsideObserver) {
    try {
      spicySidebarAsideObserver.disconnect();
    } catch (_e) {}
    spicySidebarAsideObserver = null;
  }
}

/**
 * Observes removal of #SpicyLyricsPage and also addition of a new <aside> 
 * into the parent container. Cleanup occurs if either event happens.
 */
function observeSpicyLyricsPageRemoval(cleanupFn: () => void) {
  cleanupSidebarLyricsObservers();

  const spicyLyricsEl = document.querySelector("#SpicyLyricsPage");
  if (!spicyLyricsEl) return;
  const parent = spicyLyricsEl.parentElement;
  if (!parent) return;

  const openTime = Date.now();

  // Observe for removal of #SpicyLyricsPage
  spicyLyricsPageObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const n of Array.from(mutation.removedNodes)) {
        if (n === spicyLyricsEl) {
          cleanupSidebarLyricsObservers();
          cleanupFn();
          return;
        }
      }
    }
  });
  spicyLyricsPageObserver.observe(parent, { childList: true });

  // Observe for new <aside> being added to the parent container
  let graceTimer: ReturnType<typeof setTimeout> | null = null;
  spicySidebarAsideObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const n of Array.from(mutation.addedNodes)) {
        if (n instanceof HTMLElement && n.tagName === "ASIDE") {
          if (n.id === "SpicyLyricsPage" || n.querySelector("#SpicyLyricsPage")) continue;
          const elapsed = Date.now() - openTime;
          if (elapsed < 500) {
            // Defer cleanup until grace window expires instead of dropping the event
            if (graceTimer !== null) clearTimeout(graceTimer);
            graceTimer = setTimeout(() => {
              graceTimer = null;
              cleanupSidebarLyricsObservers();
              cleanupFn();
            }, 500 - elapsed);
            continue;
          }
          if (graceTimer !== null) { clearTimeout(graceTimer); graceTimer = null; }
          cleanupSidebarLyricsObservers();
          cleanupFn();
          return;
        }
      }
    }
  });
  spicySidebarAsideObserver.observe(parent, { childList: true });
}


function cleanupGridOverride() {
  const top = document.querySelector<HTMLElement>(".Root__top-container");
  if (top) {
    top.style.removeProperty("--right-sidebar-width");
    top.style.removeProperty("grid-template-columns");
  }
  // Remove the inline position: relative set by the fallback in getRightSidebarParentContainer
  const sidebar = document.querySelector<HTMLElement>(".Root__right-sidebar");
  if (sidebar) {
    sidebar.style.removeProperty("position");
  }
}

let resizerAbortController: AbortController | null = null;

function teardownResizerDragListener() {
  if (resizerAbortController) {
    resizerAbortController.abort();
    resizerAbortController = null;
  }
}

export function SetupResizerDragListener() {
  if (resizerAbortController) {
    resizerAbortController.abort();
    resizerAbortController = null;
  }

  const resizer = document.querySelector<HTMLElement>(".LayoutResizer__resize-bar.LayoutResizer__inline-start");
  const top = document.querySelector<HTMLElement>(".Root__top-container");
  const right = document.querySelector<HTMLElement>(".Root__right-sidebar");
  if (!resizer || !top || !right) return;

  const controller = new AbortController();
  resizerAbortController = controller;
  const { signal } = controller;

  let isDragging = false;
  let startX = 0;
  let startWidth = 0;

  resizer.addEventListener("pointerdown", (e: PointerEvent) => {
    if (!isSpicySidebarMode) return;
    isDragging = true;
    startX = e.clientX;
    startWidth = right.getBoundingClientRect().width;
    try { resizer.setPointerCapture(e.pointerId); } catch (_err) {}
    e.stopPropagation();
    e.preventDefault();
  }, { capture: true, signal });

  resizer.addEventListener("pointermove", (e: PointerEvent) => {
    if (!isDragging || !isSpicySidebarMode) return;
    const deltaX = startX - e.clientX;
    const newWidth = Math.max(280, Math.min(850, startWidth + deltaX));
    top.style.setProperty("--right-sidebar-width", `${newWidth}px`, "important");
    top.style.setProperty("grid-template-columns", `auto 1fr ${newWidth}px`, "important");
  }, { capture: true, signal });

  const stopDrag = (e: PointerEvent) => {
    if (isDragging) {
      isDragging = false;
      try { resizer.releasePointerCapture(e.pointerId); } catch (_err) {}
    }
  };

  resizer.addEventListener("pointerup", stopDrag, { capture: true, signal });
  resizer.addEventListener("pointercancel", stopDrag, { capture: true, signal });
}

function runPageOpenWithCleanup(parentContainer: HTMLElement) {
  PageView.Open(parentContainer, true);
  SetupResizerDragListener();
  // After opening, observe #SpicyLyricsPage for removal and cleanup
  // Use setTimeout to wait for DOM update
  setTimeout(() => {
    observeSpicyLyricsPageRemoval(() => {
      // Only run cleanup if we're still in sidebar mode
      if (isSpicySidebarMode) {
        // Do the main close, but suppress playbar button restoration
        CloseSidebarLyrics(true);
      }
    });
  }, 1);
}

export function OpenSidebarLyrics(wasOpenForceUndefined: boolean = false) {
  if (!$isGlobalNav.get()) return;
  onOpen_wasThingOpen = undefined;
  // console.log("[Spicy Lyrics Debug] OpenSidebarLyrics");
  if (isSpicySidebarMode) {
    // console.log("[Spicy Lyrics Debug] already in sidebar mode, returning");
    return;
  }
  const playbarButton = getQueuePlaybarButton();
  if (!playbarButton) {
    sidebarLogger.error("Queue playbar button is missing");
    return;
  }
  const parentContainer = getNowPlayingViewParentContainer();
  if (!parentContainer) {
    sidebarLogger.error("Now Playing View parent container is missing");
    return;
  }
  const finalContainer = getQueueContainer();
  if (getParentContainerChildren(parentContainer)) {
    onOpen_wasThingOpen = wasOpenForceUndefined
      ? undefined
      : getNowPlayingViewContainer()
        ? "npv"
        : getDevicesContainerElement()
          ? "devices"
          : finalContainer
            ? "queue"
            : undefined;
  }
  appendOpen();
  sidebarLogger.debug("Opening sidebar mode", {
    source: onOpen_wasThingOpen ?? "unknown",
  });
  if (!finalContainer) {
    // console.log("[Spicy Lyrics Debug] finalContainer not found, clicking button and waiting");
    playbarButton.click();
    currentNPVWhentil = Whentil.When(
      () => getQueueContainer() && !PageView.IsOpened,
      () => {
        // console.log("[Spicy Lyrics Debug] finalContainer appeared after click");
        runPageOpenWithCleanup(parentContainer);
        currentNPVWhentil?.Cancel();
        currentNPVWhentil = null;
        SetupQueueButtonListener();
      }
    );
  } else {
    // console.log("[Spicy Lyrics Debug] finalContainer found, opening page view");
    currentNPVWhentil = Whentil.When(
      () => finalContainer && !PageView.IsOpened,
      () => {
        // console.log("[Spicy Lyrics Debug] Whentil with existing container");
        runPageOpenWithCleanup(parentContainer);

        currentNPVWhentil?.Cancel();
        currentNPVWhentil = null;
        SetupQueueButtonListener();
      }
    );
  }

  isSpicySidebarMode = true;
  $sidebarStatus.set("open");

  // console.log("[Spicy Lyrics Debug] isSpicySidebarMode set to true");
}

export async function CloseSidebarLyrics(auto: boolean = false) {
  // console.log("[Spicy Lyrics Debug] CloseSidebarLyrics");
  if (!isSpicySidebarMode) {
    // console.log("[Spicy Lyrics Debug] not in sidebar mode, returning");
    return;
  }

  currentNPVWhentil?.Cancel();
  currentNPVWhentil = null;
  
  cleanupSidebarLyricsObservers();
  cleanupGridOverride();
  teardownResizerDragListener();

  // console.log("[Spicy Lyrics Debug] PageView.Destroy()");
  await PageView.Destroy();
  appendClosed();
  CleanupQueueButtonListener();
  isSpicySidebarMode = false;
  $sidebarStatus.set("closed");

  if (!auto) {
    if (onOpen_wasThingOpen === undefined) {
      const queuePlaybarButton = getQueuePlaybarButton();
      if (!queuePlaybarButton) {
        sidebarLogger.error("Queue playbar button is missing");
        return;
      }
      queuePlaybarButton.click();
    } else if (onOpen_wasThingOpen === "npv") {
      const playbarButton = getNowPlayingViewPlaybarButton();
      if (!playbarButton) {
        sidebarLogger.error("Now Playing View playbar button is missing");
        return;
      }
      playbarButton.click();
    } else if (onOpen_wasThingOpen === "queue") {
      const queuePlaybarButton = getQueuePlaybarButton();
      if (!queuePlaybarButton) {
        sidebarLogger.error("Queue playbar button is missing");
        return;
      }
      queuePlaybarButton.click();
    } else if (onOpen_wasThingOpen === "devices") {
      const devicesPlaybarButton = getDevicesPlaybarButton();
      if (!devicesPlaybarButton) {
        sidebarLogger.error("Devices playbar button is missing");
        return;
      }
      devicesPlaybarButton.click();
    }
  }

  onOpen_wasThingOpen = undefined;
}

let QBClickELController: AbortController | undefined = undefined;

export function SetupQueueButtonListener() {
  const button = getQueuePlaybarButton();

  if (!button) return;

  const abortController = new AbortController();
  QBClickELController = abortController;
  button.addEventListener(
    "click",
    async () => {
      if (!isSpicySidebarMode) return;
      currentNPVWhentil?.Cancel();
      currentNPVWhentil = null;
      if (spicyLyricsPageObserver) {
        try { spicyLyricsPageObserver.disconnect(); } catch(_e){}
        spicyLyricsPageObserver = null;
      }
      await PageView.Destroy();
      cleanupGridOverride();
      teardownResizerDragListener();
      appendClosed();
      isSpicySidebarMode = false;
      button.click();
    },
    { signal: abortController.signal }
  );
}

export function CleanupQueueButtonListener() {
  if (!QBClickELController) return;
  QBClickELController?.abort();
  QBClickELController = undefined;
}

Spicetify.Player.addEventListener("songchange", (e: any) => {
  if (e.data === null) {
    CloseSidebarLyrics();
  }
});
