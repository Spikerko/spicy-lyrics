// deno-lint-ignore-file no-explicit-any
import Session from "../Global/Session.ts";
import PageView from "../Pages/PageView.ts";
import Fullscreen from "./Fullscreen.ts";
import { isSpicySidebarMode, CloseSidebarLyrics } from "./SidebarLyrics.ts"

export let IsPIP = false;
export let _IsPIP_after = false;

let currentPipWindow = null;
let pipPageHideHandler: ((event: Event) => void) | null = null;

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

    OpenPopupLyrics();
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
  currentPipWindow = await docPiP.requestWindow({
    disallowReturnToOpener: true,
    preferInitialWindowPlacement: false,
    width: 390,
    height: 379,
  });

  // Copy style sheets over from the initial document
  // so that the player looks the same.
  Array.from(document.styleSheets).forEach((styleSheet: any) => {
    try {
      // Some styleSheets may not be accessible due to CORS
      if (styleSheet.cssRules) {
        const cssRules = Array.from(styleSheet.cssRules).map((rule: any) => rule.cssText).join('');
        const style = document.createElement('style');
        style.textContent = cssRules;
        currentPipWindow.document.head.appendChild(style);
      } else {
        throw new Error("No cssRules");
      }
    } catch (_) {
      // Fallback: try to copy the <link> if possible
      if (styleSheet.href) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.type = styleSheet.type || 'text/css';
        link.media = styleSheet.media?.mediaText || '';
        link.href = styleSheet.href;
        currentPipWindow.document.head.appendChild(link);
      }
    }
  });

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

  currentPipWindow.document.body.innerHTML = `<div class="app-drag-region"></div><div class="spicy-pip-wrapper"></div>`;

  const pipWrapper = currentPipWindow.document.body.querySelector(".spicy-pip-wrapper") as HTMLElement;

  IsPIP = true;

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

  Fullscreen.Close(true)
  PageView.Destroy();

  // Remove the event listener before closing the window
  if (pipPageHideHandler) {
    currentPipWindow.removeEventListener("pagehide", pipPageHideHandler);
    pipPageHideHandler = null;
  }

  currentPipWindow.close()

  currentPipWindow = null;

  IsPIP = false
}
