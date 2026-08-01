// deno-lint-ignore-file no-explicit-any
import Session from "../Global/Session.ts";
import PageView from "../Pages/PageView.ts";
import Fullscreen from "./Fullscreen.ts";
import { NPVCardOwnsPage, DeRenderNPVCard, RequestNPVCardEvaluate } from "./NPVLyrics.ts";
import {
  IsPIP,
  IsPIPOpening,
  _IsPIP_after,
  SetIsPIP,
  SetIsPIPOpening,
  SetIsPIPAfter,
  SetPipWindow,
  GetPipWindow,
  RequestPipAnimationFrame,
  CancelPipAnimationFrame,
  GetActiveDocument,
  GetActiveWindow,
} from "../../utils/PipRuntime.ts";

// Re-exported for backward compatibility: everything actually lives in PipRuntime.ts
// (a dependency-free leaf module) so low-level shared modules can use the PiP-aware
// helpers without pulling in this file's much heavier import chain.
export {
  IsPIP,
  IsPIPOpening,
  _IsPIP_after,
  RequestPipAnimationFrame,
  CancelPipAnimationFrame,
  GetActiveDocument,
  GetActiveWindow,
};

let pipPageHideHandler: ((event: Event) => void) | null = null;

export const OpenPopupLyrics = async () => {
  SetIsPIPOpening(true);
  try {
    await OpenPopupLyricsFlow();
  } finally {
    SetIsPIPOpening(false);
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
    if (Fullscreen.IsOpen) {
      // If in any fullscreen mode, close it first
      await Fullscreen.Close();
      Session.GoBack();
    } else {
      await PageView.Destroy();
      Session.GoBack();
    }

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

  // Open a Picture-in-Picture window.
  // @ts-ignore: requestWindow is not yet standard
  const pipWindow = await docPiP.requestWindow({
    disallowReturnToOpener: true,
    preferInitialWindowPlacement: false,
    width: 390,
    height: 379,
  });

  try {
    await SetUpPipWindow(pipWindow);
  } catch (e) {
    // SetUpPipWindow can throw after already publishing PiP state (it needs
    // IsPIP true before calling PageView.Open/Fullscreen.Open, since those
    // read it to target the popup). If PageView.Open/Fullscreen.Open then
    // throw before the pagehide listener is registered, neither
    // ClosePopupLyrics (gated on IsPIP) nor that listener (never attached)
    // could clean up, so undo any partial publish here unconditionally,
    // whether or not it happened.
    if (!pipWindow.closed) pipWindow.close();
    SetPipWindow(null);
    SetIsPIP(false);
    throw e;
  }
};

const SetUpPipWindow = async (pipWindow: Window) => {
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
      pipWindow.document.head.appendChild(pipLink);
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
    pipWindow.document.head.appendChild(newStyleElement);
  }

  // Additionally, copy the styles element with the id 'spicyLyrics-additionalStyling'
  const additionalStyling = document.getElementById("spicyLyrics-additionalStyling");
  if (additionalStyling) {
    const newAdditionalStyling = document.createElement("style");
    newAdditionalStyling.id = "spicyLyrics-additionalStyling";
    newAdditionalStyling.textContent = additionalStyling.textContent;
    pipWindow.document.head.appendChild(newAdditionalStyling);
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

  pipWindow.document.head.appendChild(additionalStylingElement);

  pipWindow.document.body.innerHTML = `<div class="app-drag-region"></div><div class="spicy-pip-wrapper"></div>`;

  const pipWrapper = pipWindow.document.body.querySelector(".spicy-pip-wrapper") as HTMLElement;

  SetPipWindow(pipWindow);
  SetIsPIP(true);

  await PageView.Open(pipWrapper);

  Fullscreen.Open(true, false);

  // The window can also be closed by means other than ClosePopupLyrics (e.g.
  // the user closing the pip window's own native chrome), so we need to tear
  // down our state either way, otherwise IsPIP stays stuck true and the
  // popup can never be reopened.
  pipPageHideHandler = () => {
    CleanupPipState();
  };

  pipWindow.addEventListener("pagehide", pipPageHideHandler);

  SetIsPIPAfter(true);
};

const CleanupPipState = async () => {
  SetIsPIPAfter(false);

  await Fullscreen.Close(true);
  await PageView.Destroy();

  pipPageHideHandler = null;
  SetPipWindow(null);
  SetIsPIP(false);
};

export const ClosePopupLyrics = async () => {
  const pipWindow = GetPipWindow();
  if (!IsPIP || !pipWindow) return;

  // Remove the event listener before closing the window so CleanupPipState
  // doesn't run twice (once here, once from the pagehide it would otherwise trigger)
  if (pipPageHideHandler) {
    pipWindow.removeEventListener("pagehide", pipPageHideHandler);
  }

  await CleanupPipState();

  pipWindow.close();
}
