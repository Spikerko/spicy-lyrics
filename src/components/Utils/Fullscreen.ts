import { Maid } from "@socali/modules/Maid";
import { OnPreRender } from "@socali/modules/Scheduler";
import Spring from "@socali/modules/Spring";
import { GetCurrentLyricsContainerInstance } from "../../utils/Lyrics/Applyer/CreateLyricsContainer.ts";
import { ResetLastLine } from "../../utils/Scrolling/ScrollToActiveLine.ts";
import storage from "../../utils/storage.ts";
import Defaults from "../Global/Defaults.ts";
import Global from "../Global/Global.ts";
import Session from "../Global/Session.ts";
import PageView, { Compactify, GetPageRoot, PageContainer, Tooltips } from "../Pages/PageView.ts";
import { EnableCompactMode, IsCompactMode } from "./CompactMode.ts";
import { CleanUpNowBarComponents, CloseNowBar, DeregisterNowBarBtn, OpenNowBar } from "./NowBar.ts";
import { IsPIP } from "./PopupLyrics.ts";
import { CloseSidebarLyrics, isSpicySidebarMode } from "./SidebarLyrics.ts";
import TransferElement from "./TransferElement.ts";

const Fullscreen = {
  Open,
  Close,
  Toggle,
  IsOpen: false,
  CinemaViewOpen: false,
};

document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement && Fullscreen.IsOpen && !Fullscreen.CinemaViewOpen) {
    if (Defaults.EscapeKeyFunction === "Exit Fully") {
      Close();
      if (isSpicySidebarMode) {
        CloseSidebarLyrics();
      } else {
        Session.GoBack();
      }
    } else if (Defaults.EscapeKeyFunction === "Exit Fullscreen") {
      Close();
    } else {
      Fullscreen.CinemaViewOpen = true;
    }
  }
});

const ControlsMaid = new Maid();

const controlsOpacitySpring = new Spring(0, 2, 2, 0); // Goal: 0.65
const artworkBrightnessSpring = new Spring(0, 2, 2, 0); // Goal: 0.78

let animationLastTimestamp: number | undefined;

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
  ControlsMaid.Give(OnPreRender(MouseMoveChecker), "MouseMoveChecker");
};

const RunMediaBoxAnimation = () => {
  const timestampNow = performance.now();

  if (animationLastTimestamp !== undefined) {
    const deltaTime = (timestampNow - animationLastTimestamp) / 1000;
    const controlsOpacity = controlsOpacitySpring.Step(deltaTime);
    const artworkBrightness = artworkBrightnessSpring.Step(deltaTime);

    const MediaBox = PageContainer?.querySelector<HTMLElement>(
      ".ContentBox .NowBar .Header .MediaBox"
    );

    if (MediaBox) {
      MediaBox.style.setProperty("--ArtworkBrightness", artworkBrightness.toString());
      MediaBox.style.setProperty("--ControlsOpacity", controlsOpacity.toString());
    }

    if (controlsOpacitySpring.CanSleep() && artworkBrightnessSpring.CanSleep()) {
      animationLastTimestamp = undefined;
      visualsApplied = false;
      return;
    }
  }

  animationLastTimestamp = timestampNow;

  ControlsMaid.Give(OnPreRender(RunMediaBoxAnimation), "MediaBoxAnimation");
};

const ToggleControls = (force: boolean = false) => {
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

export const ExitFullscreenElement = async () => {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
  }
  setTimeout(Compactify, 1000);
};

export const EnterSpicyLyricsFullscreen = async () => {
  const mainElement = document.querySelector<HTMLElement>("#main");
  if (mainElement) {
    mainElement.style.display = "none";
  }

  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`Fullscreen error: ${errorMessage}`);
  }
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
}

function Open(skipDocumentFullscreen: boolean = false, moveElement: boolean = true) {
  const SpicyPage = PageContainer;
  const Root = document.body as HTMLElement;
  const mainElement = document.querySelector<HTMLElement>("#main");

  if (SpicyPage) {
    // Set state first
    Fullscreen.IsOpen = true;
    Fullscreen.CinemaViewOpen = skipDocumentFullscreen;

    // Handle DOM changes
    if (moveElement) TransferElement(SpicyPage, Root);
    SpicyPage.classList.add("Fullscreen");

    // Hide the main element
    if (mainElement && moveElement) {
      mainElement.style.display = "none";
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
        console.error(`Fullscreen error: ${errorMessage}`);
      }
    };

    handleFullscreen();
    ResetLastLine();

    // Setup media box interactions
    const MediaBox = SpicyPage.querySelector<HTMLElement>(
      ".ContentBox .NowBar .Header .MediaBox"
    );
    const MediaImage = SpicyPage.querySelector<HTMLElement>(
      ".ContentBox .NowBar .Header .MediaBox .MediaImage"
    );

    if (MediaBox && MediaImage) {
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
    }

    Global.Event.evoke("fullscreen:open", null);
  }
  setTimeout(() => {
    if (IsPIP) return;

    Compactify();

    if (storage.get("ForceCompactMode") === "true" && !IsCompactMode()) {
      SpicyPage?.classList.add("ForcedCompactMode");
      EnableCompactMode();
    }
  }, 750);

  setTimeout(() => {
    PageView.AppendViewControls(true);

    const NoLyrics = storage.get("currentLyricsData")?.toString()?.includes("NO_LYRICS");
    if (NoLyrics && !IsCompactMode()) {
      SpicyPage
        ?.querySelector(".ContentBox .LyricsContainer")
        ?.classList.add("Hidden");
      SpicyPage
        ?.querySelector<HTMLElement>(".ContentBox")
        ?.classList.add("LyricsHidden");
    }
  }, 75);

  GetCurrentLyricsContainerInstance()?.Resize();
}

function Close(isPip: boolean = false) {
  const SpicyPage = PageContainer;
  const mainElement = document.querySelector<HTMLElement>("#main");

  if (SpicyPage) {
    // Set state first
    Fullscreen.IsOpen = false;
    Fullscreen.CinemaViewOpen = false;

    // Handle DOM changes
    if (!isPip) TransferElement(SpicyPage, GetPageRoot() as HTMLElement);
    SpicyPage.classList.remove("Fullscreen");

    // Show the main element again
    if (mainElement && !isPip) {
      mainElement.style.removeProperty("display");
    }

    // Handle fullscreen exit
    const handleFullscreenExit = async () => {
      await ExitFullscreenElement();

      setTimeout(() => PageView.AppendViewControls(true), 50);
    };

    if (!isPip) handleFullscreenExit();

    const NoLyrics = storage.get("currentLyricsData")?.toString()?.includes("NO_LYRICS");
    if (NoLyrics && !isPip) {
      SpicyPage
        ?.querySelector(".ContentBox .LyricsContainer")
        ?.classList.remove("Hidden");
      SpicyPage
        ?.querySelector<HTMLElement>(".ContentBox")
        ?.classList.remove("LyricsHidden");
      DeregisterNowBarBtn();
    }

    ResetLastLine();

    if (storage.get("IsNowBarOpen") !== "true") {
      CloseNowBar();
    }

    CleanupMediaBox();
    CleanUpNowBarComponents();

    Global.Event.evoke("fullscreen:exit", null);
  }
  if (!isPip) setTimeout(Compactify, 1000);
  GetCurrentLyricsContainerInstance()?.Resize();
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
