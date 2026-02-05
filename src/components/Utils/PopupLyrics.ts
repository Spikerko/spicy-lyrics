// deno-lint-ignore-file no-explicit-any
import Session from "../Global/Session.ts";
import PageView from "../Pages/PageView.ts";
import Fullscreen from "./Fullscreen.ts";
import { isSpicySidebarMode, CloseSidebarLyrics } from "./SidebarLyrics.ts";
import { Component } from "@spicetify/bundler";

export let IsPIP = false;
export let _IsPIP_after = false;

let currentPipWindow: Window | null = null;
let pipPageHideHandler: ((event: Event) => void) | null = null;

// Save original RAF so we can restore it later
let originalRAF: typeof window.requestAnimationFrame | null = null;
let originalCAF: typeof window.cancelAnimationFrame | null = null;

function enablePipRAF() {
  if (!currentPipWindow) return;
  if (originalRAF) return;

  originalRAF = window.requestAnimationFrame.bind(window);
  originalCAF = window.cancelAnimationFrame.bind(window);
  const pipWindow = currentPipWindow;

  window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    // Run RAF off the PiP window (stays active when Spotify is minimized)
    if (!pipWindow || pipWindow.closed) return originalRAF!(cb);
    return (pipWindow as any).requestAnimationFrame((ts: number) => cb(ts));
  }) as any;

  window.cancelAnimationFrame = ((id: number) => {
    if (!pipWindow || pipWindow.closed) return originalCAF!(id);
    return (pipWindow as any).cancelAnimationFrame(id);
  }) as any;
}

function disablePipRAF() {
  if (originalRAF) window.requestAnimationFrame = originalRAF;
  if (originalCAF) window.cancelAnimationFrame = originalCAF;
  originalRAF = null;
  originalCAF = null;
}

export const OpenPopupLyrics = async () => {
  if (PageView.IsOpened && !IsPIP) {
    if (Fullscreen.IsOpen) {
      // If in any fullscreen mode, close it first
      Fullscreen.Close();
      Session.GoBack();
    } else if (isSpicySidebarMode) {
      CloseSidebarLyrics();
    } else {
      PageView.Destroy();
      Session.GoBack();
    }
    await OpenPopupLyrics();
    return;
  }

  if (PageView.IsOpened) return;

  // Check for the Picture-in-Picture API
  // @ts-ignore: documentPictureInPicture is not yet standard
  const docPiP = globalThis.documentPictureInPicture;
  if (!docPiP || typeof docPiP.requestWindow !== "function")
    throw new Error(
      "documentPictureInPicture API is not available in this browser.",
    );

  // Open a Picture-in-Picture window.
  // @ts-ignore: requestWindow is not yet standard
  currentPipWindow = await docPiP.requestWindow({
    disallowReturnToOpener: true,
    preferInitialWindowPlacement: false,
    width: 390,
    height: 379,
  });

  // Copy style sheets over from the initial document
  // so that the player looks the same.
  // Only copy <link> elements with href starting with "https://fonts.spikerko.org" to the PiP window
  Array.from(document.querySelectorAll('link[rel="stylesheet"]')).forEach(
    (link: HTMLLinkElement) => {
      const href = link.getAttribute("href") || "";
      const classList = Array.from(link.classList || []);
      const isFont = href.startsWith("https://fonts.spikerko.org");
      const isLocalCss = /^\/[a-zA-Z]{2}.*\.css$/.test(href);
      const isUserCss =
        (href.endsWith("colors.css") || href.endsWith("user.css")) &&
        classList.length === 1 &&
        classList[0] === "userCSS";

      if (link.href && (isFont || isLocalCss || isUserCss)) {
        const pipLink = document.createElement("link");
        pipLink.rel = "stylesheet";
        pipLink.type = link.type || "text/css";
        pipLink.media = link.media || "";
        pipLink.href = link.href;
        // Copy classes if it's a userCSS link
        if (isUserCss) pipLink.className = link.className;
        currentPipWindow!.document.head.appendChild(pipLink);
      }
    },
  );

  // Copy the main SpicyLyrics style element
  const spicyLyricsStyleElement =
    Component.GetRootComponent("styleElement") ??
    (globalThis as any)?._sB_devLoader?.[
      (globalThis as any)._sB_devLoader.name_hash_map?.["spicy-lyrics"]
    ]?.styleElement;

  if (spicyLyricsStyleElement) {
    // console.log("SpicyLyricsStyleElement", spicyLyricsStyleElement)
    const newStyleElement = document.createElement("style");
    newStyleElement.textContent = spicyLyricsStyleElement.textContent;
    currentPipWindow.document.head.appendChild(newStyleElement);
  }

  // Additionally, copy the styles element with the id 'spicyLyrics-additionalStyling'
  const additionalStyling = document.getElementById(
    "spicyLyrics-additionalStyling",
  );
  if (additionalStyling) {
    const newAdditionalStyling = document.createElement("style");
    newAdditionalStyling.id = "spicyLyrics-additionalStyling";
    newAdditionalStyling.textContent = additionalStyling.textContent;
    currentPipWindow.document.head.appendChild(newAdditionalStyling);
  }

  const additionalStylingElement = document.createElement("style");

  // Keep MediaBox square without changing its natural size.
  // Fixes flex/grid stretching that turned it rectangular in PiP.
  // We let width behave as before, force height to follow width (aspect-ratio),
  // and prevent parent layouts from stretching it or pushing it out of bounds.
  additionalStylingElement.textContent = `
    .app-drag-region{
      -webkit-app-region:drag;
      app-region:drag;
      position:fixed;
      height:40px;
      inset:0;
      width:100cqw;
    }
    .spicy-pip-wrapper .Header .MediaBox{
      aspect-ratio:1/1!important;
      height:auto!important;
    }
  `
    .replace(/\s+/g, " ")
    .replace(/;\s*/g, ";")
    .replace(/{\s*/g, "{")
    .replace(/\s*}/g, "}")
    .trim();

  currentPipWindow.document.head.appendChild(additionalStylingElement);

  currentPipWindow.document.body.innerHTML = `<div class="app-drag-region"></div><div class="spicy-pip-wrapper"></div>`;

  const pipWrapper = currentPipWindow.document.body.querySelector(
    ".spicy-pip-wrapper",
  ) as HTMLElement;

  IsPIP = true;

  // Route RAF to PiP so lyric sync keeps running when Spotify is minimized
  enablePipRAF();

  PageView.Open(pipWrapper);

  Fullscreen.Open(true, false);

  pipPageHideHandler = () => {
    // deno-lint-ignore no-window
    window.location.reload();
  };
  currentPipWindow.addEventListener("pagehide", pipPageHideHandler);

  _IsPIP_after = true;
};

export const ClosePopupLyrics = () => {
  if (!IsPIP || !currentPipWindow) return;
  _IsPIP_after = false;

  Fullscreen.Close(true);
  PageView.Destroy();

  // Remove the event listener before closing the window
  if (pipPageHideHandler) {
    currentPipWindow.removeEventListener("pagehide", pipPageHideHandler);
    pipPageHideHandler = null;
  }

  currentPipWindow.close();

  currentPipWindow = null;

  IsPIP = false;

  disablePipRAF();
};
