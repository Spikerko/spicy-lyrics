import fetchLyrics from "../../utils/Lyrics/fetchLyrics.ts";
import storage from "../../utils/storage.ts";
import "../../css/Loaders/DotLoader.css";
import { Spicetify } from "@spicetify/bundler";
import Whentil from "@spikerko/tools/Whentil";
import { DestroyAllLyricsContainers } from "../../utils/Lyrics/Applyer/CreateLyricsContainer.ts";
import ApplyLyrics, {
  cleanupApplyLyricsAbortController,
  resetLyricsPlayer,
} from "../../utils/Lyrics/Global/Applyer.ts";
import {
  addLinesEvListener,
  isRomanized,
  removeLinesEvListener,
  setRomanizedStatus,
} from "../../utils/Lyrics/lyrics.ts";
import {
  CleanupScrollEvents,
  InitializeScrollEvents,
  ResetLastLine,
} from "../../utils/Scrolling/ScrollToActiveLine.ts";
import { ScrollSimplebar } from "../../utils/Scrolling/Simplebar/ScrollSimplebar.ts";
import ApplyDynamicBackground, {
  CleanupDynamicBGLets,
} from "../DynamicBG/dynamicBackground.ts";
import Defaults from "../Global/Defaults.ts";
import Global from "../Global/Global.ts";
import Session from "../Global/Session.ts";
import { SpotifyPlayer } from "../Global/SpotifyPlayer.ts";
import { Icons } from "../Styling/Icons.ts";
import {
  DisableCompactMode,
  EnableCompactMode,
  IsCompactMode,
} from "../Utils/CompactMode.ts";
import Fullscreen, {
  EnterSpicyLyricsFullscreen,
  ExitFullscreenElement,
} from "../Utils/Fullscreen.ts";
import {
  NowBarObj,
  NowBar_SwapSides,
  Session_NowBar_SetSide,
  Session_OpenNowBar,
  ToggleNowBar,
  OpenNowBar,
} from "../Utils/NowBar.ts";
import {
  CloseSidebarLyrics,
  OpenSidebarLyrics,
  isSpicySidebarMode,
  cleanupSidebarLyricsObservers
} from "../Utils/SidebarLyrics.ts";
import TransferElement from "../Utils/TransferElement.ts";
import { IsPIP, _IsPIP_after, ClosePopupLyrics } from "../Utils/PopupLyrics.ts";
import { CleanUpIsByCommunity } from "../../utils/Lyrics/Applyer/Credits/ApplyIsByCommunity.tsx";

interface TippyInstance {
  destroy: () => void;
  [key: string]: any;
}

export const Tooltips: {
  Close: TippyInstance | null;
  NowBarToggle: TippyInstance | null;
  FullscreenToggle: TippyInstance | null;
  CinemaView: TippyInstance | null;
  NowBarSideToggle: TippyInstance | null;
  DevTools: TippyInstance | null;
} = {
  Close: null,
  NowBarToggle: null,
  FullscreenToggle: null,
  CinemaView: null,
  NowBarSideToggle: null,
  DevTools: null,
};

const PageView = {
  Open: OpenPage,
  Destroy: DestroyPage,
  AppendViewControls,
  IsOpened: false,
  IsTippyCapable: true,
};

export const GetPageRoot = () =>
  /* document.querySelector<HTMLElement>(".QdB2YtfEq0ks5O4QbtwX .WRGTOibB8qNEkgPNtMxq") ?? */
  document.querySelector<HTMLElement>(
    ".Root__main-view .main-view-container div[data-overlayscrollbars-viewport]"
  ) ??
  (() => {
    const child = document.querySelector<HTMLElement>(
      ".Root__main-view .main-view-container .main-view-container__scroll-node-child"
    );
    return child?.parentElement as HTMLElement | null;
  })() ??
  document.querySelector<HTMLElement>(
    ".Root__main-view .main-view-container .uGZUPBPcDpzSYqKcQT8r > div"
  ) ??
  document.querySelector<HTMLElement>(
    ".Root__main-view .main-view-container .os-host"
  );

let PageResizeListener: ResizeObserver | null = null;
export let PageContainer: HTMLElement | null = null;

async function OpenPage(
  AppendTo: HTMLElement | undefined = undefined,
  isSidebarMode: boolean = false
) {

  if (_IsPIP_after) {
    ClosePopupLyrics();
    // After closing, open again with the same arguments
    return OpenPage(AppendTo, isSidebarMode);
  }

  if (PageView.IsOpened) return;
  /* if (!HoverMode) {
        PageView.IsTippyCapable = false;
    } */
  const elem = document.createElement("div");
  elem.id = "SpicyLyricsPage";

  if (Defaults.LyricsRenderer === "Spicy") {
    elem.classList.add("SpicyRenderer");
  }

  if (isSidebarMode) {
    elem.classList.add("SidebarMode");
  }

  /* if (HoverMode) {
        elem.classList.add("TippyMode");
    } */
  //const extractedColors = ((await Spicetify.colorExtractor(SpotifyPlayer.GetUri() ?? "spotify:track:31CsSZ9KlQmEu0JvWSkM3j")) as any) ?? { VIBRANT_NON_ALARMING: "#999999" };
  //const vibrantNonAlarmingColor = extractedColors?.VIBRANT_NON_ALARMING ?? "#999999";
  elem.innerHTML = `
        <div class="NotificationContainer">
            <div class="NotificationIcon"></div>
            <div class="NotificationText">
                <div class="NotificationTitle"></div>
                <div class="NotificationDescription"></div>
            </div>
            <div class="NotificationCloseButton">X</div>
        </div>
        <div class="SpicyLoader">
            <div id="DotLoader"></div>
        </div>
        <div class="ContentBox WaitingForHeight">
            <div class="NowBar">
                <div class="CenteredView">
                    <div class="Header">
                        <div class="MediaBox">
                            <div class="MediaContent"></div>
                            <div class="MediaImage"></div>
                        </div>
                        <div class="Metadata">
                            <div class="SongName">
                                <span></span>
                            </div>
                            <div class="Artists">
                                <span></span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="LyricsContainer">
                <div class="loaderContainer">
                    <div id="DotLoader"></div>
                </div>
                <div class="LyricsContent ScrollbarScrollable"></div>
            </div>
            <div class="ViewControls"></div>
        </div>
    `;

  const waitingForHeightEvent = Global.Event.listen(
    `policy:waiting-for-height`,
    (value: boolean) => {
      if (value === false) {
        elem
          .querySelector<HTMLElement>(".ContentBox")
          ?.classList.remove("WaitingForHeight");
        Global.Event.unListen(waitingForHeightEvent);
      }
    }
  );

  if (Defaults.ViewControlsPosition === "Top") {
    elem.classList.add("ViewControlsPosition_Top")
  } else if (Defaults.ViewControlsPosition === "Bottom") {
    elem.classList.add("ViewControlsPosition_Bottom")
  }

  /* 
        <div class="SongMoreInfo">
            <div class="Content">
                <div class="SongMetadata">
                    <img src="" class="SongArtwork">
                    <div class="SongMetadataTextContent">
                        <p class="SongName">
                            <span></span>
                        </p>
                        <p class="ArtistsNames">
                            <span></span>
                        </p>
                    </div>
                </div>
                <div class="SongAnnotation">
                    <div class="BackgroundVisualizer">    
                        <p class="Annotation">
                            <span></span>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    */
  PageContainer = elem;

  const SkipSpicyFont = storage.get("skip-spicy-font");
  if (SkipSpicyFont !== "true") {
    elem.classList.add("UseSpicyFont");
  }

  if (Defaults.SimpleLyricsMode) {
    elem.classList.add("SimpleLyricsMode");
  }

  if (Defaults.MinimalLyricsMode) {
    elem.classList.add("MinimalLyricsMode");
  }

  if (AppendTo !== undefined) {
    AppendTo?.appendChild(elem);
  } else {
    GetPageRoot()?.appendChild(elem);
  }

  const contentBox = elem.querySelector<HTMLElement>(
    ".ContentBox"
  );
  if (contentBox) {
    ApplyDynamicBackground(contentBox);
  }

  addLinesEvListener();

  {
    if (!Spicetify.Player.data?.item?.uri) return; // Exit if `uri` is not available
    const currentUri = Spicetify.Player.data.item.uri;

    fetchLyrics(currentUri).then(ApplyLyrics);
  }

  Session_OpenNowBar();

  /* const ArtworkButton = document.querySelector<HTMLElement>("#SpicyLyricsPage .ContentBox .NowBar .Header .Artwork");

    ArtworkButton.addEventListener("click", () => {
        NowBar_SwapSides();
    }) */

  Session_NowBar_SetSide();

  AppendViewControls();

  DisableCompactMode();

  PageResizeListener = new ResizeObserver(() => {
    if (!Fullscreen.IsOpen || !Fullscreen.CinemaViewOpen) return;
    Compactify(elem);
  });

  PageResizeListener.observe(elem);

  if (AppendTo === undefined) {
    const legacyPage = document.querySelector<HTMLElement>(
      ".Root__main-view .main-view-container .os-host"
    );
    if (legacyPage) {
      legacyPage.style.containerType = "inline-size";
    }
  }

  // UpdateSongMoreInfo()

  Defaults.LyricsContainerExists = true;
  PageView.IsOpened = true;

  if (IsPIP) {
    elem?.classList.add("ForcedCompactMode");
    OpenNowBar(true);
    EnableCompactMode();
  }

  PageContainer = elem;

  const contentType = SpotifyPlayer.GetContentType();
  if (contentType === "episode") {
    elem?.classList.add("episode-content-type");
  } else {
    elem?.classList.remove("episode-content-type");
  }
}

/* Global.Event.listen("playback:songchange", () => {
    if (!PageView.IsOpened) return;
    UpdateSongMoreInfo();
}) */

export const isSizeReadyToBeCompacted = () =>
  window.matchMedia("(max-width: 70.812rem)").matches;

export function Compactify(Element: HTMLElement | undefined = undefined) {
  if (!Fullscreen.IsOpen) return;
  const elem = Element ?? PageContainer;
  if (!elem) return;
  if (isSizeReadyToBeCompacted()) {
    elem.classList.add("CompactifyEnabledCompactMode");
    EnableCompactMode();
  } else {
    if (!elem.classList.contains("CompactifyEnabledCompactMode")) return;
    elem.classList.remove("CompactifyEnabledCompactMode");
    if (elem.classList.contains("ForcedCompactMode")) return;
    DisableCompactMode();
  }
}

function DestroyPage() {
  if (!PageView.IsOpened) return;

  cleanupApplyLyricsAbortController();

  if (isSpicySidebarMode) {
    cleanupSidebarLyricsObservers();
  }

  if (Fullscreen.IsOpen) Fullscreen.Close();
  if (!PageContainer) return;

  resetLyricsPlayer();

  CleanupDynamicBGLets();
  ResetLastLine();
  CleanupScrollEvents();
  PageResizeListener?.disconnect(); // Disconnect the observer
  PageView.IsOpened = false;
  Defaults.LyricsContainerExists = false;
  DestroyAllLyricsContainers();
  CleanUpIsByCommunity();

  const legacyPage = document.querySelector<HTMLElement>(
    ".Root__main-view .main-view-container .os-host"
  );
  if (legacyPage) {
    legacyPage.style.containerType = "";
  }

  PageContainer?.remove();
  removeLinesEvListener();
  Object.values(Tooltips).forEach((a) => {
    a?.destroy();
  });
  ScrollSimplebar?.unMount();
  Global.Event.evoke("page:destroy", null);
  PageView.IsTippyCapable = true;
  PageContainer = null;
}

export let LyricsApplied = false;

Global.Event.listen("lyrics:not-apply", () => {
  CleanupScrollEvents();
  LyricsApplied = false;
  CleanUpIsByCommunity();
});

Global.Event.listen("lyrics:apply", ({ Type }: { Type: string }) => {
  CleanupScrollEvents();

  if (!Type || Type === "Static") return;
  if (ScrollSimplebar) {
    InitializeScrollEvents(ScrollSimplebar);
    //QueueForceScroll(); // Queue a force scroll instead of directly calling with true
    LyricsApplied = true;
  }
});

function AppendViewControls(ReAppend: boolean = false) {
  if (!PageContainer) return;
  const elem = PageContainer.querySelector<HTMLElement>(
    ".ContentBox .ViewControls"
  );
  if (!elem) return;

  // Safely destroy existing tooltips first
  Object.keys(Tooltips).forEach((key) => {
    const tippy = Tooltips[key as keyof typeof Tooltips];
    if (tippy?.destroy && typeof tippy.destroy === "function") {
      tippy.destroy();
      Tooltips[key as keyof typeof Tooltips] = null;
    }
  });

  if (ReAppend) elem.innerHTML = "";
  const isNoLyrics =
    storage.get("currentLyricsData")?.toString() ===
    `NO_LYRICS:${SpotifyPlayer.GetId()}`;
  const isDevMode = storage.get("devMode") === "true";
  elem.innerHTML = `
        ${
          Fullscreen.IsOpen || Fullscreen.CinemaViewOpen
            ? ""
            : IsPIP ? "" : `<button id="CinemaView" class="ViewControl">${Icons.CinemaView}</button>`
        }
        ${
          Fullscreen.IsOpen || Fullscreen.CinemaViewOpen
            ? IsPIP ? "" : `<button id="CompactModeToggle" class="ViewControl">${
                IsCompactMode()
                  ? Icons.DisableCompactModeIcon
                  : Icons.EnableCompactModeIcon
              }</button>`
            : ""
        }
        ${
          Defaults.LyricsRenderer === "Spicy"
            ? `<button id="RomanizationToggle" class="ViewControl">${
                isRomanized
                  ? Icons.DisableRomanization
                  : Icons.EnableRomanization
              }</button>`
            : ""
        }
        ${
          !Fullscreen.IsOpen &&
          !Fullscreen.CinemaViewOpen &&
          !isSpicySidebarMode
            ? IsPIP ? "" : `<button id="NowBarToggle" class="ViewControl">${Icons.NowBar}</button>`
            : ""
        }
        ${
          NowBarObj.Open &&
          !isSpicySidebarMode
            ? IsPIP ? "" : `<button id="NowBarSideToggle" class="ViewControl">${Icons.Fullscreen}</button>`
            : ""
        }
        ${
          Fullscreen.IsOpen
            ? (IsPIP ? "" : `<button id="FullscreenToggle" class="ViewControl">${
                Fullscreen.CinemaViewOpen
                  ? Icons.Fullscreen
                  : Icons.CloseFullscreen
              }</button>`)
            : ""
        }
        ${
          !Fullscreen.IsOpen && !Fullscreen.CinemaViewOpen
            ? IsPIP ? "" : `<button id="SidebarModeToggle" class="ViewControl">${
                isSpicySidebarMode
                  ? Icons["panel-right-open"]
                  : Icons["panel-right-close"]
              }</button>`
            : ""
        }
        ${
          isDevMode
            ? `<button id="DevTools" class="ViewControl">${Icons.DevTools}</button>`
            : ""
        }
        <button id="Close" class="ViewControl">${Icons.Close}</button>
    `;

  let targetElem: HTMLElement | null = elem;
  if (Fullscreen.IsOpen) {
    const mediaContent = PageContainer?.querySelector<HTMLElement>(
      ".ContentBox .NowBar .Header .MediaBox .MediaContent"
    );
    if (mediaContent) {
      TransferElement(elem, mediaContent);
      const viewControls =
        mediaContent.querySelector<HTMLElement>(".ViewControls");
      if (viewControls) {
        targetElem = viewControls;
      }
    }
  } else {
    const contentBox = PageContainer?.querySelector<HTMLElement>(".ContentBox");
    if (
      PageContainer?.querySelector<HTMLElement>(
        ".ContentBox .NowBar .Header .ViewControls"
      ) &&
      contentBox
    ) {
      TransferElement(elem, contentBox);
    }
  }

  if (targetElem) {
    SetupTippy(targetElem);
  }

  function SetupTippy(elem: HTMLElement) {
    // If in PIP mode, do not create any Tippy tooltips, but still wire up click handlers
    const isPip = IsPIP;

    const closeButton = elem.querySelector("#Close");
    if (closeButton) {
      try {
        if (!isPip) {
          Tooltips.Close = Spicetify.Tippy(closeButton, {
            ...Spicetify.TippyProps,
            content: `Close Page`,
          });
        }
        closeButton.addEventListener("click", () => {
          if (IsPIP) {
            ClosePopupLyrics();
            globalThis.focus();
            return;
          }

          if (Fullscreen.IsOpen) {
            // If in any fullscreen mode, close it first
            Fullscreen.Close();
          }

          if (isSpicySidebarMode) {
            CloseSidebarLyrics();
            return;
          }

          Session.GoBack();
        });
      } catch (err) {
        console.warn("Failed to setup Close tooltip:", err);
      }
    }

    const compactModeToggle = elem.querySelector("#CompactModeToggle");
    if (compactModeToggle) {
      try {
        if (!isPip) {
          Tooltips.Close = Spicetify.Tippy(compactModeToggle, {
            ...Spicetify.TippyProps,
            content: `${
              IsCompactMode() ? "Disable Compact Mode" : "Enable Compact Mode"
            }`,
          });
        }
        compactModeToggle.addEventListener("click", () => {
          // Use PageContainer instead of document.querySelector
          const SpicyLyricsPage = PageContainer;
          if (Fullscreen.IsOpen || Fullscreen.CinemaViewOpen) {
            if (IsCompactMode()) {
              SpicyLyricsPage?.classList.remove("ForcedCompactMode");
              DisableCompactMode();
              storage.set("ForceCompactMode", "false");
            } else {
              SpicyLyricsPage?.classList.add("ForcedCompactMode");
              EnableCompactMode();
              storage.set("ForceCompactMode", "true");
            }

            setTimeout(() => {
              AppendViewControls(true);
            }, 65);
          }
        });
      } catch (err) {
        console.warn("Failed to setup Close tooltip:", err);
      }
    }

    const romanizationToggle = elem.querySelector("#RomanizationToggle");
    if (romanizationToggle) {
      try {
        if (!isPip) {
          Tooltips.Close = Spicetify.Tippy(romanizationToggle, {
            ...Spicetify.TippyProps,
            content: isRomanized ? `Disable Romanization` : `Enable Romanization`,
          });
        }
        romanizationToggle.addEventListener("click", async () => {
          const songUri = SpotifyPlayer.GetUri();
          if (!songUri) return;
          PageContainer?.querySelector(
            ".LyricsContainer .LyricsContent"
          )?.classList.add("HiddenTransitioned");
          const lyrics = await fetchLyrics(songUri);

          setRomanizedStatus(!isRomanized);

          ApplyLyrics(lyrics);

          setTimeout(() => {
            AppendViewControls();
            PageContainer?.querySelector(
              ".LyricsContainer .LyricsContent"
            )?.classList.remove("HiddenTransitioned");
          }, 45);
        });
      } catch (err) {
        console.warn("Failed to setup Close tooltip:", err);
      }
    }

    if (!Fullscreen.IsOpen && !Fullscreen.CinemaViewOpen) {
      const nowBarButton = elem.querySelector("#NowBarToggle");
      if (nowBarButton) {
        try {
          if (!isPip) {
            Tooltips.NowBarToggle = Spicetify.Tippy(nowBarButton, {
              ...Spicetify.TippyProps,
              content: `NowBar`,
            });
          }
          nowBarButton.addEventListener("click", () => ToggleNowBar());
        } catch (err) {
          console.warn("Failed to setup NowBar tooltip:", err);
        }
      }

      const sidebarModeToggle = elem.querySelector("#SidebarModeToggle");
      if (sidebarModeToggle) {
        try {
          if (!isPip) {
            Tooltips.NowBarToggle = Spicetify.Tippy(sidebarModeToggle, {
              ...Spicetify.TippyProps,
              content: isSpicySidebarMode
                ? `Switch to normal mode`
                : `Switch to Sidebar Mode`,
            });
          }
          sidebarModeToggle.addEventListener("click", () => {
            (sidebarModeToggle as HTMLElement).style.pointerEvents = "none";
            (sidebarModeToggle as HTMLElement).style.cursor = "not-allowed";
            const page = PageContainer;
            if (isSpicySidebarMode) {
              page?.classList.add("SidebarTransition__Closing");
              setTimeout(() => {
                CloseSidebarLyrics();
                Whentil.When(
                  () => !isSpicySidebarMode,
                  () => {
                    Session.Navigate({ pathname: "/SpicyLyrics" });
                  }
                );
              }, 495);
            } else {
              page?.classList.add("SidebarTransition__Opening");
              setTimeout(() => {
                Session.GoBack();
                Whentil.When(
                  () => !PageView.IsOpened,
                  () => {
                    OpenSidebarLyrics();
                  }
                );
              }, 350);
            }
          });
        } catch (err) {
          console.warn("Failed to setup sidebarModeToggle tooltip:", err);
        }
      }
    }

    const fullscreenBtn = elem.querySelector("#FullscreenToggle");
    if (fullscreenBtn) {
      try {
        if (!isPip) {
          Tooltips.FullscreenToggle = Spicetify.Tippy(fullscreenBtn, {
            ...Spicetify.TippyProps,
            content: `${
              Fullscreen.CinemaViewOpen ? "Fullscreen" : "Cinema View"
            }`,
          });
        }
        fullscreenBtn.addEventListener("click", async () => {
          // If we're in cinema view, go to full fullscreen
          if (Fullscreen.CinemaViewOpen) {
            Fullscreen.CinemaViewOpen = false;
            await EnterSpicyLyricsFullscreen();
            PageView.AppendViewControls(true);
          } else {
            Fullscreen.CinemaViewOpen = true;
            await ExitFullscreenElement();
            PageView.AppendViewControls(true);
          }
          setTimeout(Compactify, 250);
        });
      } catch (err) {
        console.warn("Failed to setup Fullscreen tooltip:", err);
      }
    }

    const cinemaViewBtn = elem.querySelector("#CinemaView");
    if (cinemaViewBtn && !Fullscreen.IsOpen) {
      try {
        if (!isPip) {
          Tooltips.CinemaView = Spicetify.Tippy(cinemaViewBtn, {
            ...Spicetify.TippyProps,
            content: `Cinema View`,
          });
        }
        cinemaViewBtn.addEventListener("click", async () => {
          if (isSpicySidebarMode) {
            CloseSidebarLyrics();
            Whentil.When(
              () => !isSpicySidebarMode,
              () => {
                Session.Navigate({ pathname: "/SpicyLyrics" });
                Whentil.When(
                  () => !!PageContainer,
                  () => {
                    setTimeout(() => {
                      Fullscreen.Open(true);
                    }, 100);
                  }
                );
              }
            );
          } else {
            Fullscreen.Open(true);
          }
        });
      } catch (err) {
        console.warn("Failed to setup CinemaView tooltip:", err);
      }
    }

    const nowBarSideToggleBtn = elem.querySelector("#NowBarSideToggle");
    if (
      nowBarSideToggleBtn &&
      NowBarObj.Open &&
      !(isNoLyrics && (Fullscreen.IsOpen || Fullscreen.CinemaViewOpen))
    ) {
      try {
        if (!isPip) {
          Tooltips.NowBarSideToggle = Spicetify.Tippy(nowBarSideToggleBtn, {
            ...Spicetify.TippyProps,
            content: `Swap NowBar Side`,
          });
        }
        nowBarSideToggleBtn.addEventListener("click", () => NowBar_SwapSides());
      } catch (err) {
        console.warn("Failed to setup NowBarSideToggle tooltip:", err);
      }
    }

    const devToolsButton = elem.querySelector("#DevTools");
    if (devToolsButton && isDevMode) {
      try {
        if (!isPip) {
          Tooltips.DevTools = Spicetify.Tippy(devToolsButton, {
            ...Spicetify.TippyProps,
            content: `DevTools`,
          });
        }
        devToolsButton.addEventListener("click", () => {
          if (IsPIP) {
            globalThis.focus();
          }

          Spicetify.PopupModal.display({
            title: "Spicy Lyrics DevTools",
            isLarge: true,
            content: `
                            <div class="SpicyLyricsDevToolsContainer">
                                <div class="Setting">
                                    <div class="SettingName"><span>Load TTML (for the current song)</span></div>
                                    <div class="SettingValue">
                                        <button onclick="window._spicy_lyrics.execute('upload-ttml')">Load TTML</button>
                                    </div>
                                </div>
                                <div class="Setting">
                                    <div class="SettingName"><span>Reset TTML (for the current song)</span></div>
                                    <div class="SettingValue">
                                        <button onclick="window._spicy_lyrics.execute('reset-ttml')">Reset TTML</button>
                                    </div>
                                </div>
                            </div>
                        `,
          });
        });
      } catch (err) {
        console.warn("Failed to setup DevTools tooltip:", err);
      }
    }
  }
}

interface SpicyLyricsNotificationReturnObject {
  cleanup: () => void;
  close: () => void;
  open: () => void;
}

const showTopbarNotifications =
  storage.get("show_topbar_notifications") === "true";

export function SpicyLyrics_Notification({
  icon,
  metadata: { title, description },
  type,
  closeBtn,
}: {
  icon: string;
  metadata: {
    title: string;
    description: string;
  };
  type?: "Danger" | "Information" | "Success" | "Warning";
  closeBtn?: boolean;
}): SpicyLyricsNotificationReturnObject {
  const nonFunctionalReturnObject = {
    cleanup: () => {},
    close: () => {},
    open: () => {},
  };
  if (!showTopbarNotifications) return nonFunctionalReturnObject;
  if (!PageView.IsOpened) return nonFunctionalReturnObject;
  const NotificationContainer = PageContainer?.querySelector(
    ".NotificationContainer"
  );
  if (!NotificationContainer) return nonFunctionalReturnObject;
  const Title = NotificationContainer.querySelector(
    ".NotificationText .NotificationTitle"
  );
  const Description = NotificationContainer.querySelector(
    ".NotificationText .NotificationDescription"
  );
  const Icon = NotificationContainer.querySelector(".NotificationIcon");
  const CloseButton = NotificationContainer.querySelector(
    ".NotificationCloseButton"
  );

  if (Title && title) {
    Title.textContent = title;
  }
  if (Description && description) {
    Description.textContent = description;
  }
  if (Icon && icon) {
    Icon.innerHTML = icon;
  }

  const closeBtnHandler = () => {
    NotificationContainer.classList.remove("Visible");
    if (Title) {
      Title.textContent = "";
    }
    if (Description) {
      Description.textContent = "";
    }
    if (Icon) {
      Icon.innerHTML = "";
    }
    if (CloseButton) {
      CloseButton.classList.remove("Disabled");
    }
  };

  NotificationContainer.classList.add(type ?? "Information");

  const closeBtnA = closeBtn ?? true;

  if (CloseButton) {
    if (!closeBtnA) {
      CloseButton.classList.add("Disabled");
    } else {
      CloseButton.addEventListener("click", closeBtnHandler);
    }
  }

  return {
    cleanup: () => {
      if (closeBtnA && CloseButton) {
        CloseButton.removeEventListener("click", closeBtnHandler);
      }
      NotificationContainer.classList.remove("Visible");
      NotificationContainer.classList.remove(type ?? "Information");
      if (Title) {
        Title.textContent = "";
      }
      if (Description) {
        Description.textContent = "";
      }
      if (Icon) {
        Icon.innerHTML = "";
      }
      if (CloseButton) {
        CloseButton.classList.remove("Disabled");
      }
    },
    close: () => {
      NotificationContainer.classList.remove("Visible");
    },
    open: () => {
      NotificationContainer.classList.add("Visible");
    },
  };
}

/* function SocketStatusChange(status: boolean) {
    if (!PageView.IsOpened) return;
    if (!document.querySelector("#SpicyLyricsPage")) return;
    const notif = SpicyLyrics_Notification({
        icon: Icons.LyricsPage,
        metadata: {
            title: "Connection Error",
            description: "We're recconecting you back to Spicy Lyrics. Be patient."
        },
        type: "Warning",
        closeBtn: false
    })
    if (status) {
        notif.close();
        notif.cleanup();
    } else {
        notif.open();
    }
}

SocketStatusChange(isWsConnected); */

type NotificationVariant = "info" | "success" | "warning" | "error";

export const ShowNotification = (
  content: string,
  variant: NotificationVariant = "info",
  autoHideDuration: number = 5000
) => {
  const AnySpicetify = Spicetify as any;
  AnySpicetify.Snackbar.enqueueSnackbar(
    Spicetify.React.createElement("div", null, content),
    {
      variant,
      autoHideDuration,
    }
  );
};

export default PageView;
