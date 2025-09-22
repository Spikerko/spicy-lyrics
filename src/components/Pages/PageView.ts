import fetchLyrics from "../../utils/Lyrics/fetchLyrics.ts";
import storage from "../../utils/storage.ts";
import "../../css/Loaders/DotLoader.css";
import { Spicetify } from "@spicetify/bundler";
import Whentil from "@spikerko/tools/Whentil";
import { DestroyAllLyricsContainers } from "../../utils/Lyrics/Applyer/CreateLyricsContainer.ts";
import ApplyLyrics, { resetLyricsPlayer } from "../../utils/Lyrics/Global/Applyer.ts";
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
import ApplyDynamicBackground, { CleanupDynamicBGLets } from "../DynamicBG/dynamicBackground.ts";
import Defaults from "../Global/Defaults.ts";
import Global from "../Global/Global.ts";
import Session from "../Global/Session.ts";
import { SpotifyPlayer } from "../Global/SpotifyPlayer.ts";
import { Icons } from "../Styling/Icons.ts";
import { DisableCompactMode, EnableCompactMode, IsCompactMode } from "../Utils/CompactMode.ts";
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
} from "../Utils/NowBar.ts";
import {
  CloseSidebarLyrics,
  OpenSidebarLyrics,
  isSpicySidebarMode,
} from "../Utils/SidebarLyrics.ts";
import TransferElement from "../Utils/TransferElement.ts";

// import { UpdateSongMoreInfo } from "../Utils/Annotations";

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
  document.querySelector<HTMLElement>(
    ".Root__main-view .main-view-container .uGZUPBPcDpzSYqKcQT8r > div"
  ) ??
  document.querySelector<HTMLElement>(".Root__main-view .main-view-container .os-host");

let PageResizeListener: ResizeObserver | null = null;

async function OpenPage(
  AppendTo: HTMLElement | undefined = undefined,
  isSidebarMode: boolean = false
) {
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
        elem.querySelector<HTMLElement>(".ContentBox")?.classList.remove("WaitingForHeight");
        Global.Event.unListen(waitingForHeightEvent);
      }
    }
  );
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

  const contentBox = document.querySelector<HTMLElement>("#SpicyLyricsPage .ContentBox");
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

  {
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
}

/* Global.Event.listen("playback:songchange", () => {
    if (!PageView.IsOpened) return;
    UpdateSongMoreInfo();
}) */

export const isSizeReadyToBeCompacted = () => window.matchMedia("(max-width: 70.812rem)").matches;

export function Compactify(Element: HTMLElement | undefined = undefined) {
  if (!Fullscreen.IsOpen) return;
  const elem = Element ?? document.querySelector<HTMLElement>("#SpicyLyricsPage");
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
  if (Fullscreen.IsOpen) Fullscreen.Close();
  if (!document.querySelector("#SpicyLyricsPage")) return;

  resetLyricsPlayer();

  CleanupDynamicBGLets();
  ResetLastLine();
  CleanupScrollEvents();
  PageResizeListener?.disconnect(); // Disconnect the observer
  PageView.IsOpened = false;
  Defaults.LyricsContainerExists = false;
  DestroyAllLyricsContainers();

  const legacyPage = document.querySelector<HTMLElement>(
    ".Root__main-view .main-view-container .os-host"
  );
  if (legacyPage) {
    legacyPage.style.containerType = "";
  }

  document.querySelector("#SpicyLyricsPage")?.remove();
  removeLinesEvListener();
  Object.values(Tooltips).forEach((a) => {
    a?.destroy();
  });
  ScrollSimplebar?.unMount();
  Global.Event.evoke("page:destroy", null);
  PageView.IsTippyCapable = true;
}

export let LyricsApplied = false;

Global.Event.listen("lyrics:not-apply", () => {
  CleanupScrollEvents();
  LyricsApplied = false;
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
  const elem = document.querySelector<HTMLElement>("#SpicyLyricsPage .ContentBox .ViewControls");
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
    storage.get("currentLyricsData")?.toString() === `NO_LYRICS:${SpotifyPlayer.GetId()}`;
  const isDevMode = storage.get("devMode") === "true";
  elem.innerHTML = `
        ${Fullscreen.IsOpen || Fullscreen.CinemaViewOpen ? "" : `<button id="CinemaView" class="ViewControl">${Icons.CinemaView}</button>`}
        ${Fullscreen.IsOpen || Fullscreen.CinemaViewOpen ? `<button id="CompactModeToggle" class="ViewControl">${IsCompactMode() ? Icons.DisableCompactModeIcon : Icons.EnableCompactModeIcon}</button>` : ""}
        ${Defaults.LyricsRenderer === "Spicy" ? `<button id="RomanizationToggle" class="ViewControl">${isRomanized ? Icons.DisableRomanization : Icons.EnableRomanization}</button>` : ""}
        ${!Fullscreen.IsOpen && !Fullscreen.CinemaViewOpen && !isSpicySidebarMode ? `<button id="NowBarToggle" class="ViewControl">${Icons.NowBar}</button>` : ""}
        ${NowBarObj.Open && !(isNoLyrics && (Fullscreen.IsOpen || Fullscreen.CinemaViewOpen)) && !isSpicySidebarMode ? `<button id="NowBarSideToggle" class="ViewControl">${Icons.Fullscreen}</button>` : ""}
        ${Fullscreen.IsOpen ? `<button id="FullscreenToggle" class="ViewControl">${Fullscreen.CinemaViewOpen ? Icons.Fullscreen : Icons.CloseFullscreen}</button>` : ""}
        ${!Fullscreen.IsOpen && !Fullscreen.CinemaViewOpen ? `<button id="SidebarModeToggle" class="ViewControl">${isSpicySidebarMode ? Icons["panel-right-open"] : Icons["panel-right-close"]}</button>` : ""}
        ${isDevMode ? `<button id="DevTools" class="ViewControl">${Icons.DevTools}</button>` : ""}
        <button id="Close" class="ViewControl">${Icons.Close}</button>
    `;

  let targetElem: HTMLElement | null = elem;
  let mediaContentElem: HTMLElement | null = null;
  if (Fullscreen.IsOpen) {
    const mediaContent = document.querySelector<HTMLElement>(
      "#SpicyLyricsPage .ContentBox .NowBar .Header .MediaBox .MediaContent"
    );
    if (mediaContent) {
      TransferElement(elem, mediaContent);
      const viewControls = document.querySelector<HTMLElement>(
        "#SpicyLyricsPage .ContentBox .NowBar .Header .MediaBox .MediaContent .ViewControls"
      );
      if (viewControls) {
        targetElem = viewControls;
      }
      mediaContentElem = mediaContent;
    }
  } else {
    const contentBox = document.querySelector<HTMLElement>("#SpicyLyricsPage .ContentBox");
    if (
      document.querySelector<HTMLElement>(
        "#SpicyLyricsPage .ContentBox .NowBar .Header .ViewControls"
      ) &&
      contentBox
    ) {
      TransferElement(elem, contentBox);
    }
  }

  if (targetElem) {
    SetupTippy(targetElem);
  }

  // Volume control is now provided by NowBar VolumeTimeline in fullscreen – ensure any legacy control is removed
  removeFullscreenVolumeControl();

  function SetupTippy(elem: HTMLElement) {
    // Let's set up our TippyProps
    const closeButton = elem.querySelector("#Close");
    if (closeButton) {
      try {
        Tooltips.Close = Spicetify.Tippy(closeButton, {
          ...Spicetify.TippyProps,
          content: `Close Page`,
        });
        closeButton.addEventListener("click", () => {
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
        Tooltips.Close = Spicetify.Tippy(compactModeToggle, {
          ...Spicetify.TippyProps,
          content: `${IsCompactMode() ? "Disable Compact Mode" : "Enable Compact Mode"}`,
        });
        compactModeToggle.addEventListener("click", () => {
          const SpicyLyricsPage = document.querySelector<HTMLElement>("#SpicyLyricsPage");
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
        Tooltips.Close = Spicetify.Tippy(romanizationToggle, {
          ...Spicetify.TippyProps,
          content: isRomanized ? `Disable Romanization` : `Enable Romanization`,
        });
        romanizationToggle.addEventListener("click", async () => {
          const songUri = SpotifyPlayer.GetUri();
          if (!songUri) return;
          document
            .querySelector("#SpicyLyricsPage .LyricsContainer .LyricsContent")
            ?.classList.add("HiddenTransitioned");
          const lyrics = await fetchLyrics(songUri);
          //if (lyrics === undefined) return;
          //if (lyrics?.Type === "Static" && lyrics?.Lines?.[0]?.Text === "No Lyrics Found") return;

          setRomanizedStatus(!isRomanized);

          ApplyLyrics(lyrics);

          setTimeout(() => {
            AppendViewControls();
            document
              .querySelector("#SpicyLyricsPage .LyricsContainer .LyricsContent")
              ?.classList.remove("HiddenTransitioned");
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
          Tooltips.NowBarToggle = Spicetify.Tippy(nowBarButton, {
            ...Spicetify.TippyProps,
            content: `NowBar`,
          });
          nowBarButton.addEventListener("click", () => ToggleNowBar());
        } catch (err) {
          console.warn("Failed to setup NowBar tooltip:", err);
        }
      }

      const sidebarModeToggle = elem.querySelector("#SidebarModeToggle");
      if (sidebarModeToggle) {
        try {
          Tooltips.NowBarToggle = Spicetify.Tippy(sidebarModeToggle, {
            ...Spicetify.TippyProps,
            content: isSpicySidebarMode ? `Switch to normal mode` : `Switch to Sidebar Mode`,
          });
          sidebarModeToggle.addEventListener("click", () => {
            (sidebarModeToggle as HTMLElement).style.pointerEvents = "none";
            (sidebarModeToggle as HTMLElement).style.cursor = "not-allowed";
            const page = document.querySelector<HTMLElement>("#SpicyLyricsPage");
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
        Tooltips.FullscreenToggle = Spicetify.Tippy(fullscreenBtn, {
          ...Spicetify.TippyProps,
          content: `${Fullscreen.CinemaViewOpen ? "Fullscreen" : "Cinema View"}`,
        });
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
        Tooltips.CinemaView = Spicetify.Tippy(cinemaViewBtn, {
          ...Spicetify.TippyProps,
          content: `Cinema View`,
        });
        cinemaViewBtn.addEventListener("click", async () => {
          if (isSpicySidebarMode) {
            CloseSidebarLyrics();
            Whentil.When(
              () => !isSpicySidebarMode,
              () => {
                Session.Navigate({ pathname: "/SpicyLyrics" });
                Whentil.When(
                  () => document.querySelector("#SpicyLyricsPage"),
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
        Tooltips.NowBarSideToggle = Spicetify.Tippy(nowBarSideToggleBtn, {
          ...Spicetify.TippyProps,
          content: `Swap NowBar Side`,
        });
        nowBarSideToggleBtn.addEventListener("click", () => NowBar_SwapSides());
      } catch (err) {
        console.warn("Failed to setup NowBarSideToggle tooltip:", err);
      }
    }

    const devToolsButton = elem.querySelector("#DevTools");
    if (devToolsButton && isDevMode) {
      try {
        Tooltips.DevTools = Spicetify.Tippy(devToolsButton, {
          ...Spicetify.TippyProps,
          content: `DevTools`,
        });
        devToolsButton.addEventListener("click", () => {
          Spicetify.PopupModal.display({
            title: "Spicy Lyrics DevTools",
            isLarge: true,
            content: `
                            <div class="SpicyLyricsDevToolsContainer">
                                <div class="Setting">
                                    <div class="SettingName"><span>Upload TTML (for the current song)</span></div>
                                    <div class="SettingValue">
                                        <button onclick="window._spicy_lyrics.execute('upload-ttml')">Upload</button>
                                    </div>
                                </div>
                                <div class="Setting">
                                    <div class="SettingName"><span>Reset TTML (for the current song)</span></div>
                                    <div class="SettingValue">
                                        <button onclick="window._spicy_lyrics.execute('reset-ttml')">Reset</button>
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

// Legacy fullscreen volume slider removed – keep a small helper to cleanup any remnants
function removeFullscreenVolumeControl() {
  const existing = document.querySelector<HTMLElement>("#SpicyLyricsPage #SpicyVolumeControl");
  existing?.remove();
}

interface SpicyLyricsNotificationReturnObject {
  cleanup: () => void;
  close: () => void;
  open: () => void;
}

const showTopbarNotifications = storage.get("show_topbar_notifications") === "true";

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
  const NotificationContainer = document.querySelector("#SpicyLyricsPage .NotificationContainer");
  if (!NotificationContainer) return nonFunctionalReturnObject;
  const Title = NotificationContainer.querySelector(".NotificationText .NotificationTitle");
  const Description = NotificationContainer.querySelector(
    ".NotificationText .NotificationDescription"
  );
  const Icon = NotificationContainer.querySelector(".NotificationIcon");
  const CloseButton = NotificationContainer.querySelector(".NotificationCloseButton");

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
    Spicetify.React.createElement("div", {
      dangerouslySetInnerHTML: {
        __html: content,
      },
    }),
    {
      variant,
      autoHideDuration,
    }
  );
};

export default PageView;
