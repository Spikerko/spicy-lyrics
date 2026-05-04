// CSS Imports
import "./css/default.css";
import "./css/default.scss";
import "./css/Simplebar.css";
import "./css/ContentBox.css";
// import "./css/SongMoreInfo.css";
import "./css/DynamicBG/spicy-dynamic-bg.css";
import "./css/Lyrics/main.css";
import "./css/Lyrics/Mixed.css";
import "./css/Loaders/LoaderContainer.css";
import "./css/font-pack/font-pack.css";
import "./css/ttml-profile/profile.css";

import "./components/Utils/GlobalExecute.ts";

import Whentil from "@spikerko/tools/Whentil";
import ApplyDynamicBackground, {
  GetStaticBackground,
  KawarpMap,
} from "./components/DynamicBG/dynamicBackground.ts";
import {
  $currentLyricsData,
  $showNpvDynamicBg,
  $popupLyricsAllowed,
  $spicyLyricsVersion,
  $staticBackgroundMode,
} from "./utils/stores.ts";
import Global from "./components/Global/Global.ts";
import Platform from "./components/Global/Platform.ts";
import Session from "./components/Global/Session.ts";
import { SpotifyPlayer } from "./components/Global/SpotifyPlayer.ts";
import PageView, { GetPageRoot, PageContainer } from "./components/Pages/PageView.ts";
import LoadFonts, { ApplyFontPixel } from "./components/Styling/Fonts.ts";
import { Icons } from "./components/Styling/Icons.ts";
import Fullscreen, { EnterSpicyLyricsFullscreen, ExitFullscreenElement } from "./components/Utils/Fullscreen.ts";
import { UpdateNowBar } from "./components/Utils/NowBar.ts";
import {
  CloseSidebarLyrics,
  OpenSidebarLyrics,
  RegisterSidebarLyrics,
  getQueueContainer,
  isSpicySidebarMode,
} from "./components/Utils/SidebarLyrics.ts";
import { IsPlaying } from "./utils/Addons.ts";
import { requestPositionSync } from "./utils/Gets/GetProgress.ts";
import { IntervalManager } from "./utils/IntervalManager.ts";
import fetchLyrics from "./utils/Lyrics/fetchLyrics.ts";
import ApplyLyrics from "./utils/Lyrics/Global/Applyer.ts";
import { ScrollingIntervalTime } from "./utils/Lyrics/lyrics.ts";
import { ScrollToActiveLine } from "./utils/Scrolling/ScrollToActiveLine.ts";
import { ScrollSimplebar } from "./utils/Scrolling/Simplebar/ScrollSimplebar.ts";
import { $fromVersion, $lastFetchedUri, $previousVersion, $sidebarStatus } from "./utils/uiState.ts";
import { CheckForUpdates } from "./utils/version/CheckForUpdates.tsx";
import { needsMigration, showMigrationModal } from "./utils/migration/DataMigration.tsx";
import "./css/polyfills/tippy-polyfill.css";
import "./css/settings-panel.css";
import "./css/polyfills/generic-modal-polyfill.css";
import "./css/polyfills/sonner-polyfill.css";
import UpdateDialog from "./components/ReactComponents/UpdateDialog.tsx";
import { IsPIP, OpenPopupLyrics, ClosePopupLyrics } from "./components/Utils/PopupLyrics.ts";
import ReactDOM from "react-dom/client";
import { PopupModal } from "./components/Modal.ts";
import { runThemeMatcher } from "./utils/themeMatcher.ts";
import { toast } from "sonner";
import "./utils/settings.ts";
import SLToaster from "./components/ReactComponents/SLToaster.tsx";
import { openSettingsPanel } from "./utils/settings.ts";
import { exposeToWindow } from "./utils/expose.ts";
import Logger from "./utils/logger.ts";

/* 
  upcoming feature leak..?

  import { initCliSocket } from "./components/cli-sync/index.ts";
  import "./components/cli-sync/socket/manager.ts";
*/

async function main() {
  const appLogger = new Logger("App");
  const sidebarLogger = new Logger("Sidebar");
  const dynamicBgLogger = new Logger("Dynamic Background");
  const playbackLogger = new Logger("Playback");

  //if (App.isDev()) {
  appLogger.debug("Boot sequence");
  exposeToWindow();
  appLogger.debug("Window helpers exposed");
  //}

  await Platform.OnSpotifyReady;

  if (needsMigration()) {
    showMigrationModal();
    return;
  }

  Global.SetScope("fullscreen.open", false);

  Global.SetScope("fullscreen.onopen", (cb: any) => {
    const id = Global.Event.listen("fullscreen:open", () => {
      Global.SetScope("fullscreen.open", true);
      cb();
    });
    return () => Global.Event.unListen(id);
  });

  Global.SetScope("fullscreen.onclose", (cb: any) => {
    const id = Global.Event.listen("fullscreen:exit", () => {
      Global.SetScope("fullscreen.open", false);
      cb();
    });
    return () => Global.Event.unListen(id);
  });

  if ($previousVersion.get()) {
    $previousVersion.set("");
  }

  $spicyLyricsVersion.set(window._spicy_lyrics_metadata?.LoadedVersion ?? $spicyLyricsVersion.get());
  window._spicy_lyrics_metadata = {};

  LoadFonts();
  ApplyFontPixel();

  const skeletonStyle = document.createElement("style");
  skeletonStyle.innerHTML = `
        /* This style is here to prevent the @keyframes removal in the CSS. I still don't know why that's happening. */
        /* This is a part of Spicy Lyrics */
        @keyframes skeleton {
            to {
                background-position-x: 0;
            }
        }

        @keyframes Marquee_SongName {
          0% {
            transform: translateX(calc(0px + min(-100% + 86cqw, 0px) * 0));
          }
          10% {
            transform: translateX(calc(0px + min(-100% + 86cqw, 0px) * 0));
          }
          90% {
            transform: translateX(calc(0px + min(-100% + 86cqw, 0px) * 1));
          }
          100% {
            transform: translateX(calc(0px + min(-100% + 86cqw, 0px) * 1));
          }
        }

        @keyframes Marquee_SongName_SongMoreInfo {
          0% {
            transform: translateX(calc(0px + min(-100% + 98cqw, 0px) * 0));
          }
          10% {
            transform: translateX(calc(0px + min(-100% + 98cqw, 0px) * 0));
          }
          90% {
            transform: translateX(calc(0px + min(-100% + 98cqw, 0px) * 1));
          }
          100% {
            transform: translateX(calc(0px + min(-100% + 98cqw, 0px) * 1));
          }
        }

        @keyframes Marquee_Artists {
          0% {
            transform: translateX(calc(0px + min(-100% + 81cqw, 0px) * 0));
          }
          10% {
            transform: translateX(calc(0px + min(-100% + 81cqw, 0px) * 0));
          }
          90% {
            transform: translateX(calc(0px + min(-100% + 81cqw, 0px) * 1));
          }
          100% {
            transform: translateX(calc(0px + min(-100% + 81cqw, 0px) * 1));
          }
        }

        @keyframes Marquee_Artists_SongMoreInfo {
          0% {
            transform: translateX(calc(0px + min(-100% + 98cqw, 0px) * 0));
          }
          10% {
            transform: translateX(calc(0px + min(-100% + 98cqw, 0px) * 0));
          }
          90% {
            transform: translateX(calc(0px + min(-100% + 98cqw, 0px) * 1));
          }
          100% {
            transform: translateX(calc(0px + min(-100% + 98cqw, 0px) * 1));
          }
        }

        @keyframes Marquee_SongName_Compact {
          0% {
            transform: translateX(calc(0px + min(-100% + 100cqw, 0px) * 0));
          }
          10% {
            transform: translateX(calc(0px + min(-100% + 100cqw, 0px) * 0));
          }
          90% {
            transform: translateX(calc(0px + min(-100% + 100cqw, 0px) * 1));
          }
          100% {
            transform: translateX(calc(0px + min(-100% + 100cqw, 0px) * 1));
          }
        }

        @keyframes Marquee_Artists_Compact {
          0% {
            transform: translateX(calc(0px + min(-100% + 100cqw, 0px) * 0));
          }
          10% {
            transform: translateX(calc(0px + min(-100% + 100cqw, 0px) * 0));
          }
          90% {
            transform: translateX(calc(0px + min(-100% + 100cqw, 0px) * 1));
          }
          100% {
            transform: translateX(calc(0px + min(-100% + 100cqw, 0px) * 1));
          }
        }

        @keyframes SLM_Animation {
          0% {
            --SLM_GradientPosition: -27.5%;
          }
          100% {
            --SLM_GradientPosition: 100%;
          }
        }

        @keyframes Pre_SLM_GradientAnimation {
          0% {
            --SLM_GradientPosition: -50%;
          }
          100% {
            --SLM_GradientPosition: -27.5%;
          }
        }

        @keyframes MB_anim_enter {
          0% {
            transform: translate(100%, 0);
          }
          100% {
            transform: translate(0, 0);
          }
        }
  `;

  skeletonStyle.id = "spicyLyrics-additionalStyling";
  document.head.appendChild(skeletonStyle);

  let ButtonList: any;
  if (SpotifyPlayer.Playbar?.Button) {
    ButtonList = [
      {
        Registered: false,
        Button: new SpotifyPlayer.Playbar.Button(
          "Spicy Lyrics",
          Icons.LyricsPage,
          (self) => {
            if (!self.active) {
              /* const isNewFullscreen = document.querySelector<HTMLElement>(".QdB2YtfEq0ks5O4QbtwX .WRGTOibB8qNEkgPNtMxq");
                if (isNewFullscreen) {
                  PageView.Open();
                  self.active = true;
                } else  */
              Session.Navigate({ pathname: "/SpicyLyrics" });
              if (Global.Saves.shift_key_pressed) {
                const pageWhentil = Whentil.When(
                  () => document.querySelector<HTMLElement>(".Root__main-view #SpicyLyricsPage"),
                  () => {
                    Fullscreen.Open(true);
                    pageWhentil?.Cancel();
                  }
                );
              }
              //}
            } else {
              Session.GoBack();
              //}
            }
          },
          false,
          false
        ),
      },
      {
        Registered: false,
        Button: new SpotifyPlayer.Playbar.Button(
          "Enter Fullscreen",
          Icons.Fullscreen,
          async (self) => {
            if (isSpicySidebarMode) {
              await CloseSidebarLyrics();
            }
            Whentil.When(
              () => !isSpicySidebarMode,
              async () => {
                if (!self.active) {
                  Session.Navigate({ pathname: "/SpicyLyrics" });
                  const pageWhentil = Whentil.When(
                    () => document.querySelector<HTMLElement>(".Root__main-view #SpicyLyricsPage"),
                    () => {
                      Fullscreen.Open(Global.Saves.shift_key_pressed ?? false);
                      pageWhentil?.Cancel();
                    }
                  );
                } else {
                  Session.GoBack();
                }
              }
            );
          },
          false,
          false
        ),
      },
      {
        Registered: false,
        Button: (
          (('documentPictureInPicture' in window) && ($popupLyricsAllowed.get()))
            ? new SpotifyPlayer.Playbar.Button(
              "Spicy Popup Lyrics",
              Icons.PiPMode,
              () => {
                if (IsPIP) {
                  ClosePopupLyrics();
                } else {
                  OpenPopupLyrics();
                }
              },
              false,
              false
            )
            : undefined
        )
      }
    ];
  }

  RegisterSidebarLyrics();

  // console.log("[Spicy Lyrics Debug] Setting up initial sidebar status check");
  //Whentil.When(() => document.querySelector<HTMLElement>(".Root__right-sidebar .XOawmCGZcQx4cesyNfVO:not(:has(.h0XG5HZ9x0lYV7JNwhoA.JHlPg4iOkqbXmXjXwVdo)):has(.jD_TVjbjclUwewP7P9e8)") && getQueuePlaybarButton(), () => {

  if (!isSpicySidebarMode && getQueueContainer()) {
    // console.log("[Spicy Lyrics Debug] Got now playing view parent container");
    const sidebarStatus = $sidebarStatus.get();
    sidebarLogger.debug("Restoring sidebar state", sidebarStatus);
    // console.log("[Spicy Lyrics Debug] Sidebar status from storage:", sidebarStatus);
    if (sidebarStatus === "open") {
      // console.log("[Spicy Lyrics Debug] Sidebar status is 'open', checking current path");
      if (Spicetify.Platform.History.location.pathname === "/SpicyLyrics") {
        // console.log("[Spicy Lyrics Debug] Currently on /SpicyLyrics, going back");
        Session.GoBack();
        // console.log("[Spicy Lyrics Debug] Setting up Whentil to open sidebar after navigation");
        Whentil.When(
          () =>
            !PageView.IsOpened && Spicetify.Platform.History.location.pathname !== "/SpicyLyrics",
          () => {
            // console.log("[Spicy Lyrics Debug] Page closed and navigated away, opening sidebar");
            OpenSidebarLyrics(!!getQueueContainer());
          }
        );
      } else {
        // console.log("[Spicy Lyrics Debug] Not on /SpicyLyrics, setting up Whentil to open sidebar");
        Whentil.When(
          () =>
            !PageView.IsOpened && Spicetify.Platform.History.location.pathname !== "/SpicyLyrics",
          () => {
            // console.log("[Spicy Lyrics Debug] Conditions met, opening sidebar");
            OpenSidebarLyrics(!!getQueueContainer());
          }
        );
      }
    }
  }
  // })

  // Add shift key tracking
  Global.Saves.shift_key_pressed = false;

  window.addEventListener("keydown", (e) => {
    if (e.key === "Shift") {
      Global.Saves.shift_key_pressed = true;
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.key === "Shift") {
      Global.Saves.shift_key_pressed = false;
    }
  });

  window.addEventListener("blur", () => {
    Global.Saves.shift_key_pressed = false;
  });

  Global.Event.listen("pagecontainer:available", () => {
    if (!ButtonList) return;
    for (const button of ButtonList) {
      if (!button.Registered) {
        if (button.Button) button.Button.register();
        button.Registered = true;
      }
    }
  });

  {
    if (!ButtonList) return;

    const fullscreenButton = ButtonList[1].Button;
    fullscreenButton.element.style.order = "100001";
    fullscreenButton.element.id = "SpicyLyrics_FullscreenButton";

    const popupLyricsButton = ButtonList[2].Button;
    if (popupLyricsButton && ('documentPictureInPicture' in window) && $popupLyricsAllowed.get()) {
      popupLyricsButton.element.style.order = "100000";
      popupLyricsButton.element.id = "SpicyLyrics_PopupLyricsButton";
    }

    const hideUnwantedButtons = (container: Element) => {
      for (const element of container.children) {
        const testId = element.attributes.getNamedItem("data-testid")?.value;

        const isFullscreen = testId === "fullscreen-mode-button";
        const isPip = ('documentPictureInPicture' in window) && $popupLyricsAllowed.get() && testId === "pip-toggle-button";
        const isGenericControl =
          element.classList.contains("control-button") &&
          !element.classList.contains("volume-bar__icon-button") &&
          !element.classList.contains("main-devicePicker-controlButton");

        if (
          (isFullscreen || isPip || isGenericControl) &&
          element.id !== "SpicyLyrics_FullscreenButton" &&
          element.id !== "SpicyLyrics_PopupLyricsButton"
        ) {
          (element as HTMLElement).style.display = "none";
        }
      }
    };

    let observer: MutationObserver | null = null;

    const startObservingDOM = () => {
      const controlsContainer = document.querySelector<HTMLElement>(
        ".main-nowPlayingBar-extraControls"
      );

      if (!controlsContainer) {
        setTimeout(startObservingDOM, 100);
        return;
      }

      hideUnwantedButtons(controlsContainer);

      const MAX_MUTATION_BATCHES = 100;
      const MAX_OBSERVE_MS = 60_000;
      let mutationBatches = 0;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      const stopObserving = (obs: MutationObserver, _reason: "ready" | "timeout" | "max_mutations") => {
        try {
          obs.disconnect();
        } finally {
          if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
            timeoutId = undefined;
          }
          if (observer === obs) observer = null;
        }
      };

      observer = new MutationObserver((mutations, obs) => {
        mutationBatches += 1;
        if (mutationBatches >= MAX_MUTATION_BATCHES) {
          stopObserving(obs, "max_mutations");
          return;
        }

        const hasNewChildren = mutations.some((mutation) => mutation.addedNodes.length > 0);
        if (!hasNewChildren) return;

        const hasFullscreen = !!controlsContainer.querySelector('[data-testid="fullscreen-mode-button"]');
        const needsPip = $popupLyricsAllowed.get();
        const hasPip = !!controlsContainer.querySelector('[data-testid="pip-toggle-button"]');

        const isReady = hasFullscreen && (!needsPip || hasPip);
        if (!isReady) return;

        hideUnwantedButtons(controlsContainer);
        stopObserving(obs, "ready");
      });

      observer.observe(controlsContainer, { childList: true });
      timeoutId = setTimeout(() => {
        if (observer) stopObserving(observer, "timeout");
      }, MAX_OBSERVE_MS);
    };

    startObservingDOM();
  }

  let button: any;
  if (ButtonList) {
    button = ButtonList[0];
  }

  const Hometinue = async () => {
    Whentil.When(
      () => Spicetify.Platform.PlaybackAPI,
      () => {
        requestPositionSync();
      }
    );

    const fromVersion = $fromVersion.get();
    if (fromVersion !== $spicyLyricsVersion.get()) {
      const div = document.createElement("div");
      const reactRoot = ReactDOM.createRoot(div);
      reactRoot.render(
        <UpdateDialog fromVersion={fromVersion} spicyLyricsVersion={$spicyLyricsVersion.get()} />
      );

      PopupModal.display({
        title: "Spicy Lyrics",
        content: div,
        isLarge: true,
        onClose: () => {
          reactRoot.unmount();
        }
      });
    }

    $fromVersion.set($spicyLyricsVersion.get());

    {
      const div = document.createElement("div");
      div.classList.add("sltoaster");
      const reactRoot = ReactDOM.createRoot(div);

      reactRoot.render(
        <SLToaster />
      )

      document.body.appendChild(div);
    }

    (window as any)._toaster = toast;

    // Lets set out Dynamic Background (spicy-dynamic-bg) to the now playing bar
    let lastImgUrl: string | null;
    let lastNowPlayingBarElement: HTMLElement | null = null;
    let nowPlayingBarObserver: MutationObserver | null = null;
    let nowPlayingBarMutationTimeout: ReturnType<typeof setTimeout> | null = null;

    const getNowPlayingBarElement = () =>
      document.querySelector<HTMLElement>(".Root__right-sidebar aside.NowPlayingView") ??
      document.querySelector<HTMLElement>(
        `.Root__right-sidebar aside#Desktop_PanelContainer_Id:has(.main-nowPlayingView-coverArtContainer)`
      );

    const scheduleNowPlayingBarDynamicBackgroundApply = () => {
      if (nowPlayingBarMutationTimeout) {
        clearTimeout(nowPlayingBarMutationTimeout);
      }
      nowPlayingBarMutationTimeout = setTimeout(() => {
        nowPlayingBarMutationTimeout = null;
        void applyDynamicBackgroundToNowPlayingBar(SpotifyPlayer.GetCover("large"));
      }, 50);
    };

    const startNowPlayingBarObserver = () => {
      if (nowPlayingBarObserver) return;

      const sidebar = document.querySelector(".Root__right-sidebar");
      if (!sidebar) return;

      nowPlayingBarObserver = new MutationObserver((mutations) => {
        const shouldReapply = mutations.some((mutation) => {
          if (mutation.type === "childList") return true;
          if (mutation.type !== "attributes") return false;
          return (
            mutation.attributeName === "src" ||
            mutation.attributeName === "style" ||
            mutation.attributeName === "class"
          );
        });

        if (!shouldReapply) return;
        scheduleNowPlayingBarDynamicBackgroundApply();
      });

      nowPlayingBarObserver.observe(sidebar, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["src", "style", "class"],
      });
    };

    const CleanupNowBarDynamicBgLets = () => {
      const nowPlayingBar = getNowPlayingBarElement() ?? lastNowPlayingBarElement;

      const kawarpInstance = KawarpMap.get("npvbg");
      if (kawarpInstance) {
        kawarpInstance.dispose();
        KawarpMap.delete("npvbg");
      }
      nowPlayingBar?.querySelector<HTMLElement>(".spicy-dynamic-bg")?.remove();
      nowPlayingBar?.classList.remove("spicy-dynamic-bg-in-this");
      lastNowPlayingBarElement = null;
      lastImgUrl = null;
    };

    // Some Spotify views (e.g. cinema) swap the right sidebar layout.
    // When that happens, NPV dynamic background needs to be cleaned up,
    // but page backgrounds (e.g. lpagebg) must remain intact.
    let cinemaViewObserver: MutationObserver | null = null;
    let cinemaViewActive = false;

    const getTopContainerElement = () => {
      const rightSidebar = document.querySelector<HTMLElement>(".Root__right-sidebar");
      // `.Root__top-container` is expected to be the parent of `.Root__right-sidebar`.
      const parent = rightSidebar?.parentElement;
      if (parent?.classList.contains("Root__top-container")) return parent;
      return document.querySelector<HTMLElement>(".Root__top-container");
    };

    const checkCinemaViewAndMaybeCleanup = (topContainer: HTMLElement) => {
      const cinemaViewExists = Boolean(topContainer.querySelector(".Root__cinema-view"));

      if (cinemaViewExists && !cinemaViewActive) {
        cinemaViewActive = true;
        CleanupNowBarDynamicBgLets();
        return;
      }

      if (!cinemaViewExists && cinemaViewActive) {
        cinemaViewActive = false;
        // Restore NPV dynamic background after leaving cinema view.
        scheduleNowPlayingBarDynamicBackgroundApply();
      }
    };

    const startCinemaViewObserver = () => {
      if (cinemaViewObserver) return;

      const topContainer = getTopContainerElement();
      if (!topContainer) return;

      // Initial check (covers late observer start scenarios).
      checkCinemaViewAndMaybeCleanup(topContainer);

      cinemaViewObserver = new MutationObserver(() => {
        if (!topContainer.isConnected) {
          cinemaViewObserver?.disconnect();
          cinemaViewObserver = null;
          cinemaViewActive = false;
          return;
        }

        checkCinemaViewAndMaybeCleanup(topContainer);
      });

      cinemaViewObserver.observe(topContainer, {
        subtree: true,
        childList: true,
      });
    };

    Whentil.When(
      () => Boolean(getTopContainerElement()),
      () => {
        startCinemaViewObserver();
      }
    );

    async function applyDynamicBackgroundToNowPlayingBar(coverUrl: string | undefined) {
      if (!$showNpvDynamicBg.get()) return;
      if (SpotifyPlayer.GetContentType() === "unknown" || SpotifyPlayer.IsDJ()) return;
      if (!coverUrl) return;
      const nowPlayingBar = getNowPlayingBarElement();
      const topContainer = getTopContainerElement();
      const cinemaViewExists = Boolean(topContainer?.querySelector(".Root__cinema-view"));

      try {
        if (!nowPlayingBar || cinemaViewExists || isSpicySidebarMode) {
          lastImgUrl = null;
          CleanupNowBarDynamicBgLets();
          return;
        }
        lastNowPlayingBarElement = nowPlayingBar;
        if (coverUrl === lastImgUrl) return;

        nowPlayingBar.classList.add("spicy-dynamic-bg-in-this");

        await ApplyDynamicBackground(nowPlayingBar, "npvbg");

        lastImgUrl = coverUrl;
      } catch (error) {
        dynamicBgLogger.error("Failed applying dynamic background to now playing bar", error);
      }
    }

    $showNpvDynamicBg.listen((v) => {
      if (!v) {
        CleanupNowBarDynamicBgLets();
      } else {
        scheduleNowPlayingBarDynamicBackgroundApply();
      }
    });

    startNowPlayingBarObserver();
    scheduleNowPlayingBarDynamicBackgroundApply();

    Global.Event.listen("fullscreen:open", () => {
      CleanupNowBarDynamicBgLets()
    });

    Global.Event.listen("fullscreen:exit", () => {
      scheduleNowPlayingBarDynamicBackgroundApply()
    });

    async function onSongChange(event: any) {
      playbackLogger.debug("Song change pipeline");
      const contentType = SpotifyPlayer.GetContentType();
      playbackLogger.debug("Detected content type", contentType);

      if (contentType === "episode") {
        PageContainer?.classList.add("episode-content-type");
      } else {
        PageContainer?.classList.remove("episode-content-type");
      }

      if (!button.Registered) {
        button.Button.register();
        button.Registered = true;
      }

      if (PageContainer?.querySelector(".ContentBox .NowBar")) {
        if (Fullscreen.IsOpen) {
          UpdateNowBar(true);
        } else {
          UpdateNowBar();
        }
      }

      const songUri = event?.data?.item?.uri;
      if (songUri) {
        fetchLyrics(songUri).then(ApplyLyrics);
      }

      const _staticBgMode = $staticBackgroundMode.get();
      if (
        _staticBgMode !== "off" &&
        !SpotifyPlayer.IsDJ() &&
        (_staticBgMode === "auto" || _staticBgMode === "artistHeader")
      ) {
        const Artists = SpotifyPlayer.GetArtists();
        const Artist =
          Artists?.map((artist) => artist.uri?.replace("spotify:artist:", ""))[0] ?? undefined;
        try {
          void GetStaticBackground(Artist, SpotifyPlayer.GetId());
        } catch {
          dynamicBgLogger.error("Unable to prefetch static background");
        }
      }

      try {
        void scheduleNowPlayingBarDynamicBackgroundApply();
      } catch (err) {
        dynamicBgLogger.error("Failed applying dynamic background to now playing bar", err);
      }

      const contentBox = PageContainer?.querySelector<HTMLElement>(".ContentBox");
      if (!contentBox || $staticBackgroundMode.get() === "color") return;
      try {
        void ApplyDynamicBackground(contentBox, "lpagebg");
      } catch (err) {
        dynamicBgLogger.error("Failed applying dynamic background to page", err);
      }
    }
    Global.Event.listen("playback:songchange", onSongChange);

    const initUri = SpotifyPlayer.GetUri();
    if (initUri) {
      fetchLyrics(initUri).then(ApplyLyrics);
    }

    const _initStaticBgMode = $staticBackgroundMode.get();
    if (
      _initStaticBgMode !== "off" &&
      !SpotifyPlayer.IsDJ() &&
      (_initStaticBgMode === "auto" || _initStaticBgMode === "artistHeader")
    ) {
      const Artists = SpotifyPlayer.GetArtists();
      const Artist =
        Artists?.map((artist) => artist.uri?.replace("spotify:artist:", ""))[0] ?? undefined;
      try {
        await GetStaticBackground(Artist, SpotifyPlayer.GetId());
      } catch {
        dynamicBgLogger.error("Unable to prefetch static background");
      }
    }

    window.addEventListener("online", () => {
      $lastFetchedUri.set(null);

      fetchLyrics(Spicetify.Player.data?.item?.uri).then(ApplyLyrics);
    });

    new IntervalManager(ScrollingIntervalTime, () => {
      if (ScrollSimplebar) {
        ScrollToActiveLine(ScrollSimplebar);
      }
    }).Start();

    interface Location {
      pathname: string;
      [key: string]: any;
    }

    let lastLocation: Location | null = null;

    async function loadPage(location: Location) {
      appLogger.debug("Handling route change", location.pathname);
      if (location.pathname === "/SpicyLyrics") {
        if (isSpicySidebarMode) {
          await CloseSidebarLyrics();
        }
        Whentil.When(
          () => !isSpicySidebarMode,
          () => {
            PageView.Open();
            if (!button) return;
            button.Button.active = true;
          }
        );
      } else {
        if (lastLocation?.pathname === "/SpicyLyrics") {
          await PageView.Destroy();
          if (!button) return;
          button.Button.active = false;
        }
      }
      lastLocation = location;
    }

    Global.Event.listen("platform:history", loadPage);

    if (Spicetify.Platform.History.location.pathname === "/SpicyLyrics") {
      Global.Event.listen("pagecontainer:available", () => {
        loadPage(Spicetify.Platform.History.location);
        if (!button) return;
        button.Button.active = true;
      });
    }

    if (button) {
      button.Button.tippy.setContent("Spicy Lyrics");
    }

    /*
    // This probably won't be added

    let wasPageViewTippyShown = false;
    button.Button.tippy.setProps({
      ...Spicetify.TippyProps,
      content: `Spicy Lyrics`,
      allowHTML: true,
      onShow(instance: any) {
        // Spotify's Code
        instance.popper.firstChild.classList.add("main-contextMenu-tippyEnter");
      },
      onMount(instance: any) {
          // Spotify's Code
          requestAnimationFrame(() => {
            instance.popper.firstChild.classList.remove("main-contextMenu-tippyEnter");
            instance.popper.firstChild.classList.add("main-contextMenu-tippyEnterActive");
          });

          const TippyElement = instance.popper;

          //TippyElement.style.removeProperty("pointer-events");

          const TippyElementContent = TippyElement.querySelector(".main-contextMenu-tippy");
          

          if (!PageView.IsTippyCapable) {
            TippyElementContent.style.width = "";
            TippyElementContent.style.height = "";
            TippyElementContent.style.maxWidth = "";
            TippyElementContent.style.maxHeight = "";

            TippyElement.style.setProperty("--section-border-radius", "");
            TippyElement.style.borderRadius = "";
            TippyElementContent.style.borderRadius = "";

            TippyElementContent.innerHTML = ""
            instance.setContent("Spicy Lyrics");

            return;
          };

          TippyElementContent.innerHTML = "";
          TippyElementContent.style.width = "470px";
          TippyElementContent.style.height = "540px";
          TippyElementContent.style.maxWidth = "none";
          TippyElementContent.style.maxHeight = "none";

          TippyElement.style.setProperty("--section-border-radius", "8px");
          TippyElement.style.borderRadius = "var(--section-border-radius, 8px)";
          TippyElementContent.style.borderRadius = "var(--section-border-radius, 8px)";

          if (!wasPageViewTippyShown) {
            PageView.Destroy();
            instance.unmount();
            wasPageViewTippyShown = true;
            setTimeout(() => instance.show(), 75);
            return;
          }

          PageView.Open(TippyElementContent, true);
      },
      onHide(instance: any) {
          if (PageView.IsTippyCapable) {
            PageView.Destroy();
          };
          // Spotify's Code
          requestAnimationFrame(() => {
              instance.popper.firstChild.classList.remove("main-contextMenu-tippyEnterActive");
              instance.unmount();
          });
      },
    }); */

    {
      type LoopType = "context" | "track" | "none";
      let lastLoopType: LoopType | null = null;
      // These interval managers are intentionally not stored in variables that are used elsewhere
      // They are self-running background processes that continue to run throughout the app lifecycle
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      new IntervalManager(Infinity, () => {
        const LoopState = Spicetify.Player.getRepeat();
        const LoopType: LoopType = LoopState === 1 ? "context" : LoopState === 2 ? "track" : "none";
        SpotifyPlayer.LoopType = LoopType;
        if (lastLoopType !== LoopType) {
          Global.Event.evoke("playback:loop", LoopType);
        }
        lastLoopType = LoopType;
      }).Start();
    }

    {
      type ShuffleType = "smart" | "normal" | "none";
      let lastShuffleType: ShuffleType | null = null;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      new IntervalManager(Infinity, () => {
        const ShuffleType: ShuffleType = (Spicetify.Player as any).origin._state.smartShuffle
          ? "smart"
          : (Spicetify.Player as any).origin._state.shuffle
            ? "normal"
            : "none";
        SpotifyPlayer.ShuffleType = ShuffleType;
        if (lastShuffleType !== ShuffleType) {
          Global.Event.evoke("playback:shuffle", ShuffleType);
        }
        lastShuffleType = ShuffleType;
      }).Start();
    }

    {
      let lastPosition = 0;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      new IntervalManager(0.5, () => {
        const pos = SpotifyPlayer.GetPosition();
        if (pos !== lastPosition) {
          Global.Event.evoke("playback:position", pos);
        }
        lastPosition = pos;
      }).Start();
    }

    /* {
      let lastPosition = 0;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      new IntervalManager(Infinity, () => {
        const pos = SpotifyPlayer.GetPosition();
        if (pos !== lastPosition) {
          Global.Event.evoke("playback:position_smooth", pos);
        }
        lastPosition = pos;
      }).Start();
    } */

    {
      let lastTimeout: any;
      Global.Event.listen("lyrics:apply", () => {
        if (lastTimeout !== undefined) {
          clearTimeout(lastTimeout);
          lastTimeout = undefined;
        }
        lastTimeout = setTimeout(async () => {
          const currentSongLyrics = $currentLyricsData.get();
          if (
            currentSongLyrics &&
            currentSongLyrics !== `NO_LYRICS:${SpotifyPlayer.GetId()}`
          ) {
            const parsedLyrics = JSON.parse(currentSongLyrics);
            if (parsedLyrics?.id !== SpotifyPlayer.GetId()) {
              const refetchUri = SpotifyPlayer.GetUri();
              if (refetchUri) {
                fetchLyrics(refetchUri).then(ApplyLyrics);
              }
            }
          }
        }, 1000);
      });
    }

    SpotifyPlayer.IsPlaying = IsPlaying();

    // Events
    {
      Spicetify.Player.addEventListener("onplaypause", (e) => {
        SpotifyPlayer.IsPlaying = !e?.data?.isPaused;
        Global.Event.evoke("playback:playpause", e);
      });
      Spicetify.Player.addEventListener("onprogress", (e) =>
        Global.Event.evoke("playback:progress", e)
      );
      Spicetify.Player.addEventListener("songchange", (e) =>
        Global.Event.evoke("playback:songchange", e)
      );

      Whentil.When(GetPageRoot, () => {
        Global.Event.evoke("pagecontainer:available", GetPageRoot());
      });

      Spicetify.Platform.History.listen((e: Location) => {
        Global.Event.evoke("platform:history", e);
      });
      Spicetify.Platform.History.listen(Session.RecordNavigation);
      Session.RecordNavigation(Spicetify.Platform.History.location);

      Global.Event.listen("session:navigation", (data: Location) => {
        if (data.pathname === "/SpicyLyrics/Update") {
          $fromVersion.set($spicyLyricsVersion.get());
          window._spicy_lyrics_metadata = {};
          Session.GoBack();
          window.location.reload();
        }
      });

      const CheckForUpdates_Intervaled = async () => {
        await CheckForUpdates();
        setTimeout(CheckForUpdates_Intervaled, 300 * 1000);
      };
      setTimeout(async () => await CheckForUpdates_Intervaled(), 1000);
    }
  };

  Whentil.When(
    () => SpotifyPlayer.GetContentType(),
    () => {
      const IsSomethingElseThanTrack = SpotifyPlayer.GetContentType() !== "track";

      if (IsSomethingElseThanTrack) {
        if (!button) return;
        button.Button.deregister();
        button.Registered = false;
      } else {
        if (!button) return;
        if (!button.Registered) {
          button.Button.register();
          button.Registered = true;
        }
      }
    }
  );

  Hometinue();

  runThemeMatcher();

  Spicetify.Keyboard.registerImportantShortcut(Spicetify.Keyboard.KEYS.ESCAPE, async () => {
    if (IsPIP) return;
    if (Fullscreen.CinemaViewOpen) {
      await Fullscreen.Close();
      Session.GoBack();
    }
  });

  document.addEventListener("fullscreenchange", async () => {
    if (!document.fullscreenElement && Fullscreen.IsOpen && !Fullscreen.CinemaViewOpen) {
      Fullscreen.CinemaViewOpen = true;
      await ExitFullscreenElement();
      PageView.AppendViewControls(true);
    }
  });

  Spicetify.Keyboard.registerImportantShortcut(Spicetify.Keyboard.KEYS.F11, async () => {
    if (IsPIP) return;
    if (Fullscreen.IsOpen) {
      if (!Fullscreen.CinemaViewOpen) {
        Fullscreen.CinemaViewOpen = true;
        await ExitFullscreenElement();
        PageView.AppendViewControls(true);
      } else {
        Fullscreen.CinemaViewOpen = false;
        await EnterSpicyLyricsFullscreen();
        PageView.AppendViewControls(true);
      }
    }
  });

  new Spicetify.Menu.Item(
		"Spicy Lyrics Settings",
		false,
		() => {
			openSettingsPanel();
		},
		`<svg version="1.0" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentcolor" viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet"><path d="M18.9962 5.00357C18.5208 4.52802 17.9233 4.19298 17.2696 4.03541C16.6159 3.87784 15.9313 3.90387 15.2915 4.11061C14.6516 4.31735 14.0813 4.69678 13.6433 5.20705C13.2054 5.71733 12.9169 6.33862 12.8097 7.00242L16.9973 11.1897C17.6611 11.0825 18.2824 10.794 18.7927 10.3561C19.303 9.91824 19.6825 9.34793 19.8893 8.7081C20.096 8.06827 20.122 7.38377 19.9645 6.73009C19.8069 6.07641 19.4718 5.47894 18.9962 5.00357ZM15.2227 12.153L11.845 8.77431C10.4947 10.3119 9.14443 11.8495 7.79421 13.3871L4.34436 17.3139C4.06732 17.6308 3.92106 18.0412 3.93518 18.4618C3.94929 18.8825 4.12273 19.2821 4.42039 19.5798C4.71804 19.8774 5.11767 20.0508 5.53838 20.0649C5.9591 20.0791 6.36945 19.9328 6.68639 19.6558L10.6328 16.1894L15.224 12.1543L15.2227 12.153ZM10.8636 6.96374C10.9806 5.9186 11.3904 4.92775 12.0457 4.10518C12.701 3.28261 13.5752 2.66176 14.5678 2.31407C15.5604 1.96638 16.631 1.90598 17.6564 2.13981C18.6818 2.37365 19.6203 2.89222 20.364 3.63586C21.1077 4.3795 21.6263 5.31798 21.8602 6.34331C22.094 7.36865 22.0336 8.43917 21.6859 9.43169C21.3382 10.4242 20.7173 11.2984 19.8947 11.9537C19.0721 12.6089 18.0811 13.0187 17.0359 13.1357L11.9108 17.6402L7.96445 21.1079C7.27835 21.7096 6.38902 22.0279 5.47687 21.9981C4.56473 21.9683 3.69808 21.5926 3.05275 20.9473C2.40742 20.302 2.03174 19.4354 2.00192 18.5234C1.97211 17.6113 2.29039 16.722 2.8922 16.0359L6.34334 12.1092L10.8636 6.96374Z"/><path d="M8.35932 0.380176C8.40765 0.249583 8.59235 0.249583 8.64068 0.380176L9.15129 1.76009C9.16648 1.80114 9.19886 1.83352 9.23991 1.84871L10.6198 2.35932C10.7504 2.40765 10.7504 2.59235 10.6198 2.64068L9.23991 3.15129C9.19886 3.16648 9.16648 3.19886 9.15129 3.23991L8.64068 4.61982C8.59235 4.75042 8.40765 4.75042 8.35932 4.61982L7.84871 3.23991C7.83352 3.19886 7.80114 3.16648 7.76009 3.15129L6.38018 2.64068C6.24958 2.59235 6.24958 2.40765 6.38018 2.35932L7.76009 1.84871C7.80114 1.83352 7.83352 1.80114 7.84871 1.76009L8.35932 0.380176Z"/><path d="M19.8593 14.3802C19.9076 14.2496 20.0924 14.2496 20.1407 14.3802L21.0564 16.855C21.0716 16.896 21.104 16.9284 21.145 16.9436L23.6198 17.8593C23.7504 17.9076 23.7504 18.0924 23.6198 18.1407L21.145 19.0564C21.104 19.0716 21.0716 19.104 21.0564 19.145L20.1407 21.6198C20.0924 21.7504 19.9076 21.7504 19.8593 21.6198L18.9436 19.145C18.9284 19.104 18.896 19.0716 18.855 19.0564L16.3802 18.1407C16.2496 18.0924 16.2496 17.9076 16.3802 17.8593L18.855 16.9436C18.896 16.9284 18.9284 16.896 18.9436 16.855L19.8593 14.3802Z"/><path d="M13.3593 18.3802C13.4076 18.2496 13.5924 18.2496 13.6407 18.3802L14.1513 19.7601C14.1665 19.8011 14.1989 19.8335 14.2399 19.8487L15.6198 20.3593C15.7504 20.4076 15.7504 20.5924 15.6198 20.6407L14.2399 21.1513C14.1989 21.1665 14.1665 21.1989 14.1513 21.2399L13.6407 22.6198C13.5924 22.7504 13.4076 22.7504 13.3593 22.6198L12.8487 21.2399C12.8335 21.1989 12.8011 21.1665 12.7601 21.1513L11.3802 20.6407C11.2496 20.5924 11.2496 20.4076 11.3802 20.3593L12.7601 19.8487C12.8011 19.8335 12.8335 19.8011 12.8487 19.7601L13.3593 18.3802Z"/><path d="M3.85932 3.38018C3.90765 3.24958 4.09235 3.24958 4.14068 3.38018L5.05643 5.85495C5.07162 5.89601 5.10399 5.92838 5.14505 5.94357L7.61982 6.85932C7.75042 6.90765 7.75042 7.09235 7.61982 7.14068L5.14505 8.05643C5.10399 8.07162 5.07162 8.10399 5.05643 8.14505L4.14068 10.6198C4.09235 10.7504 3.90765 10.7504 3.85932 10.6198L2.94357 8.14505C2.92838 8.10399 2.89601 8.07162 2.85495 8.05643L0.380176 7.14068C0.249583 7.09235 0.249583 6.90765 0.380176 6.85932L2.85495 5.94357C2.89601 5.92838 2.92838 5.89601 2.94357 5.85495L3.85932 3.38018Z"/></svg>`
	).register();
}

main();