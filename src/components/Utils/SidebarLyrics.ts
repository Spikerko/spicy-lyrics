import { Spicetify } from "@spicetify/bundler";
import Whentil, { type CancelableTask } from "@spikerko/tools/Whentil";
import storage from "../../utils/storage.ts";
import {
  SetPageBGBlur,
  currentBgInstance as currentPageBgInstance,
} from "../DynamicBG/dynamicBackground.ts";
import PageView from "../Pages/PageView.ts";

// Query selector functions
const getSpicySidebarActiveBody = () => document.body;
// const getRootRightSidebar = () => document.querySelector<HTMLElement>('.Root__right-sidebar');
const getNowPlayingViewElement = () =>
  document.querySelector<HTMLElement>(".Root__right-sidebar aside.NowPlayingView");
const getDesktopPanelContainer = () =>
  document.querySelector<HTMLElement>(
    `.Root__right-sidebar aside#Desktop_PanelContainer_Id:has(.main-nowPlayingView-coverArtContainer)`
  );
const getRightSidebarParentContainer = () =>
  document.querySelector<HTMLElement>(".Root__right-sidebar .XOawmCGZcQx4cesyNfVO") ??
  document.querySelector<HTMLElement>(".Root__right-sidebar .oXO9_yYs6JyOwkBn8E4a");
const getQueueContainerElement = () =>
  document.querySelector<HTMLElement>(
    ".Root__right-sidebar .XOawmCGZcQx4cesyNfVO:not(:has(.h0XG5HZ9x0lYV7JNwhoA.JHlPg4iOkqbXmXjXwVdo)):has(.jD_TVjbjclUwewP7P9e8)"
  ) ??
  document.querySelector<HTMLElement>(
    ".Root__right-sidebar .oXO9_yYs6JyOwkBn8E4a:not(:has(.Ot1yAtVbjD2owYqmw6BK)):has(.ZWs_BNtabE4F1v34pU93.mpdgC9UTkN5_fMm1pFiz)"
  );
const getDevicesContainerElement = () =>
  document.querySelector<HTMLElement>(
    ".Root__right-sidebar .oXO9_yYs6JyOwkBn8E4a:has(.Ot1yAtVbjD2owYqmw6BK)"
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
  return document.querySelector<HTMLElement>('[data-restore-focus-key="device_picker"]');
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
  spicySidebarAsideObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const n of Array.from(mutation.addedNodes)) {
        if (n instanceof HTMLElement && n.tagName === "ASIDE") {
          cleanupSidebarLyricsObservers();
          cleanupFn();
          return;
        }
      }
    }
  });
  spicySidebarAsideObserver.observe(parent, { childList: true });
}


function runPageOpenWithCleanup(parentContainer: HTMLElement) {
  PageView.Open(parentContainer, true);
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
  onOpen_wasThingOpen = undefined;
  // console.log("[Spicy Lyrics Debug] OpenSidebarLyrics");
  if (isSpicySidebarMode) {
    // console.log("[Spicy Lyrics Debug] already in sidebar mode, returning");
    return;
  }
  const playbarButton = getQueuePlaybarButton();
  if (!playbarButton) {
    console.error("[Spicy Lyrics] Playbar button is missing");
    return;
  }
  const parentContainer = getNowPlayingViewParentContainer();
  if (!parentContainer) {
    console.error("[Spicy Lyrics] Now Playing View parent container is missing");
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
  if (!finalContainer) {
    // console.log("[Spicy Lyrics Debug] finalContainer not found, clicking button and waiting");
    playbarButton.click();
    currentNPVWhentil = Whentil.When(
      () => getQueueContainer() && !PageView.IsOpened,
      () => {
        // console.log("[Spicy Lyrics Debug] finalContainer appeared after click");
        runPageOpenWithCleanup(parentContainer);
        Whentil.When(
          () => currentPageBgInstance,
          () => {
            SetPageBGBlur(100);
          }
        );
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
        Whentil.When(
          () => currentPageBgInstance,
          () => {
            SetPageBGBlur(100);
          }
        );
        currentNPVWhentil?.Cancel();
        currentNPVWhentil = null;
        SetupQueueButtonListener();
      }
    );
  }

  isSpicySidebarMode = true;
  storage.set("sidebar-status", "open");

  // console.log("[Spicy Lyrics Debug] isSpicySidebarMode set to true");
}

export function CloseSidebarLyrics(auto: boolean = false) {
  // console.log("[Spicy Lyrics Debug] CloseSidebarLyrics");
  if (!isSpicySidebarMode) {
    // console.log("[Spicy Lyrics Debug] not in sidebar mode, returning");
    return;
  }

  currentNPVWhentil?.Cancel();
  currentNPVWhentil = null;
  
  cleanupSidebarLyricsObservers();

  // console.log("[Spicy Lyrics Debug] PageView.Destroy()");
  PageView.Destroy();
  appendClosed();
  CleanupQueueButtonListener();
  isSpicySidebarMode = false;
  storage.set("sidebar-status", "closed");

  if (!auto) {
    if (onOpen_wasThingOpen === undefined) {
      const queuePlaybarButton = getQueuePlaybarButton();
      if (!queuePlaybarButton) {
        console.error("[Spicy Lyrics] Queue playbar button is missing");
        return;
      }
      queuePlaybarButton.click();
    } else if (onOpen_wasThingOpen === "npv") {
      const playbarButton = getNowPlayingViewPlaybarButton();
      if (!playbarButton) {
        console.error("[Spicy Lyrics] Now Playing View playbar button is missing");
        return;
      }
      playbarButton.click();
    } else if (onOpen_wasThingOpen === "queue") {
      const queuePlaybarButton = getQueuePlaybarButton();
      if (!queuePlaybarButton) {
        console.error("[Spicy Lyrics] Queue playbar button is missing");
        return;
      }
      queuePlaybarButton.click();
    } else if (onOpen_wasThingOpen === "devices") {
      const devicesPlaybarButton = getDevicesPlaybarButton();
      if (!devicesPlaybarButton) {
        console.error("[Spicy Lyrics] Devices playbar button is missing");
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
    () => {
      if (!isSpicySidebarMode) return;
      currentNPVWhentil?.Cancel();
      currentNPVWhentil = null;
      if (spicyLyricsPageObserver) {
        try { spicyLyricsPageObserver.disconnect(); } catch(_e){}
        spicyLyricsPageObserver = null;
      }
      PageView.Destroy();
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
