import "./components/Utils/GlobalExecute.ts";
import fetchLyrics from "./utils/Lyrics/fetchLyrics.ts";
import { ScrollingIntervalTime } from "./utils/Lyrics/lyrics.ts";
import storage from "./utils/storage.ts";
import { setSettingsMenu } from "./utils/settings.ts";
import PageView, { GetPageRoot } from "./components/Pages/PageView.ts";
import { Icons } from "./components/Styling/Icons.ts";
import ApplyDynamicBackground, { DynamicBackgroundConfig, GetStaticBackground } from "./components/DynamicBG/dynamicBackground.ts";
import LoadFonts, { ApplyFontPixel } from "./components/Styling/Fonts.ts";
import { IntervalManager } from "./utils/IntervalManager.ts";
import { SpotifyPlayer } from "./components/Global/SpotifyPlayer.ts";
import { IsPlaying } from "./utils/Addons.ts";
import { ScrollToActiveLine } from "./utils/Scrolling/ScrollToActiveLine.ts";
import { ScrollSimplebar } from "./utils/Scrolling/Simplebar/ScrollSimplebar.ts";
import ApplyLyrics from "./utils/Lyrics/Global/Applyer.ts";
import { UpdateNowBar } from "./components/Utils/NowBar.ts";
import { requestPositionSync } from "./utils/Gets/GetProgress.ts";
// CSS Imports
import "./css/default.css";
import "./css/Simplebar.css";
import "./css/ContentBox.css";
// import "./css/SongMoreInfo.css";
import "./css/DynamicBG/spicy-dynamic-bg.css"
import "./css/Lyrics/main.css"
import "./css/Lyrics/Mixed.css"
import "./css/Loaders/LoaderContainer.css"
import Global from "./components/Global/Global.ts";
import Platform from "./components/Global/Platform.ts";
import Whentil from "@spikerko/tools/Whentil";
import Session from "./components/Global/Session.ts";
import Defaults from "./components/Global/Defaults.ts";
import { CheckForUpdates } from "./utils/version/CheckForUpdates.ts";
// Unused import removed: import sleep from "./utils/sleep";
import Sockets from "./utils/Sockets/main.ts";
import Fullscreen from "./components/Utils/Fullscreen.ts";
import { Defer } from "@socali/modules/Scheduler";
import { DynamicBackground } from "@spikerko/tools/DynamicBackground";
// In development: import "./components/Utils/Annotations";
import App from "./ready.ts";
import { CloseSidebarLyrics, getQueueContainer, isSpicySidebarMode, OpenSidebarLyrics, RegisterSidebarLyrics } from "./components/Utils/SidebarLyrics.ts";
import { Spicetify } from "@spicetify/bundler"

async function main() {
  await Platform.OnSpotifyReady;

  Global.SetScope("fullscreen.open", false);

  Global.SetScope("fullscreen.onopen", (cb: any) => {
    Global.Event.listen("fullscreen:open", () => {
      Global.SetScope("fullscreen.open", true);
      cb()
    })
  })

  Global.SetScope("fullscreen.onclose", (cb: any) => {
    Global.Event.listen("fullscreen:exit", () => {
      Global.SetScope("fullscreen.open", false);
      cb()
    })
  })

  
  if (!storage.get("show_topbar_notifications")) {
    storage.set("show_topbar_notifications", "true")
  }

  if (!storage.get("lockedMediaBox")) {
    storage.set("lockedMediaBox", "false")
  }

  if (storage.get("lockedMediaBox")) {
    Defaults.CompactMode_LockedMediaBox = storage.get("lockedMediaBox") === "true";
  }

 /*  if (!storage.get("lyrics_spacing")) {
    storage.set("lyrics_spacing", "Medium");
  } */

  /* if (!storage.get("prefers_reduced_motion")) {
    storage.set("prefers_reduced_motion", "false");
  } */

  /* if (storage.get("prefers_reduced_motion")) {
    const prefersReducedMotion = storage.get("prefers_reduced_motion") === "true";
    Defaults.PrefersReducedMotion = prefersReducedMotion;
  } */

  if (!storage.get("staticBackgroundType")) {
    storage.set("staticBackgroundType", "Auto");
  }

  if (storage.get("staticBackgroundType")) {
    Defaults.StaticBackgroundType = storage.get("staticBackgroundType") as string;
  }

  if (!storage.get("staticBackground")) {
    storage.set("staticBackground", "false");
  }

  if (storage.get("staticBackground")) {
    Defaults.StaticBackground = storage.get("staticBackground") === "true";
  }

  if (!storage.get("simpleLyricsMode")) {
    storage.set("simpleLyricsMode", "false");
  }
  
  if (storage.get("simpleLyricsMode")) {
    Defaults.SimpleLyricsMode = storage.get("simpleLyricsMode") === "true";
  }

  if (!storage.get("minimalLyricsMode")) {
    storage.set("minimalLyricsMode", "false");
  }

  if (storage.get("minimalLyricsMode")) {
    Defaults.MinimalLyricsMode = storage.get("minimalLyricsMode") === "true";
  }

  if (!storage.get("hide_npv_bg")) {
    storage.set("hide_npv_bg", "false");
  }

  if (storage.get("hide_npv_bg")) {
    Defaults.hide_npv_bg = storage.get("hide_npv_bg") === "true";
  }


  Defaults.SpicyLyricsVersion = window._spicy_lyrics_metadata?.LoadedVersion ?? "5.10.7";
  

  /* if (storage.get("lyrics_spacing")) {
    if (storage.get("lyrics_spacing") === "None") {
      document.querySelector("html").style.setProperty("--SpicyLyrics-LineSpacing", "0");
    }
    if (storage.get("lyrics_spacing") === "Small") {
      document.querySelector("html").style.setProperty("--SpicyLyrics-LineSpacing", "0.5cqw 0");
    }
    if (storage.get("lyrics_spacing") === "Medium") {
      document.querySelector("html").style.setProperty("--SpicyLyrics-LineSpacing", "1cqw 0");
    }
    if (storage.get("lyrics_spacing") === "Large") {
      document.querySelector("html").style.setProperty("--SpicyLyrics-LineSpacing", "1.5cqw 0");
    }
    if (storage.get("lyrics_spacing") === "Extra Large") {
      document.querySelector("html").style.setProperty("--SpicyLyrics-LineSpacing", "2cqw 0");
    }
  } */

  // Lets set out the Settings Menu
  setSettingsMenu();

  const OldStyleFont = storage.get("old-style-font");
  if (OldStyleFont != "true") {
    LoadFonts();
    ApplyFontPixel();
  }

 

  const skeletonStyle = document.createElement("style");
  skeletonStyle.innerHTML = `
        /* This style is here to prevent the @keyframes removal in the CSS. I still don't know why that's happening. */
        /* This is a part of Spicy Lyrics */
        @keyframes skeleton {
            to {
                background-position-x: 0
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

        @keyframes SpicyLoader_FadeIn {
          0% {
            opacity: 0;
          }
          100% {
            opacity: 1;
          }
        }

        @keyframes SpicyLoader_FadeOut {
          0% {
            opacity: 1;
          }
          100% {
            opacity: 0;
          }
        }
  `
  document.head.appendChild(skeletonStyle);

  App.SetReady();

  let ButtonList: any = undefined;
  if (Spicetify.Playbar && Spicetify.Playbar.Button) {
    ButtonList = [
      {
        Registered: false,
        Button: new Spicetify.Playbar.Button(
          "Spicy Lyrics",
          Icons.LyricsPage,
          (self) => {
              if (!self.active) {
                /* const isNewFullscreen = document.querySelector<HTMLElement>(".QdB2YtfEq0ks5O4QbtwX .WRGTOibB8qNEkgPNtMxq");
                if (isNewFullscreen) {
                  PageView.Open();
                  self.active = true;
                } else { */
                  Session.Navigate({ pathname: "/SpicyLyrics" });
                  if (Global.Saves.shift_key_pressed) {
                    const pageWhentil = Whentil.When(() => document.querySelector<HTMLElement>(".Root__main-view #SpicyLyricsPage"), () => {
                      Fullscreen.Open(true);
                      pageWhentil?.Cancel();
                    });
                  } 
                //}
              } else {
                /* const isNewFullscreen = document.querySelector<HTMLElement>(".QdB2YtfEq0ks5O4QbtwX .WRGTOibB8qNEkgPNtMxq");
                if (isNewFullscreen) {
                  PageView.Destroy();
                  self.active = false;
                } else { */
                  Session.GoBack();
                //}
              }
          },
          false,
          false,
        )
      },
      {
        Registered: false,
        Button: new Spicetify.Playbar.Button(
          "Enter Fullscreen",
          Icons.Fullscreen,
          async (self) => {
              if (isSpicySidebarMode) {
                CloseSidebarLyrics();
              }
              Whentil.When(() => !isSpicySidebarMode, async () => {
                if (!self.active) {
                  Session.Navigate({ pathname: "/SpicyLyrics" });
                  const pageWhentil = Whentil.When(() => document.querySelector<HTMLElement>(".Root__main-view #SpicyLyricsPage"), () => {
                    Fullscreen.Open(Global.Saves.shift_key_pressed ?? false);
                    pageWhentil?.Cancel();
                  })
                } else {
                  Session.GoBack();
                }
              })
          },
          false,
          false,
        )
      }
    ]
  }
  
  RegisterSidebarLyrics();

  // console.log("[Spicy Lyrics Debug] Setting up initial sidebar status check");
  //Whentil.When(() => document.querySelector<HTMLElement>(".Root__right-sidebar .XOawmCGZcQx4cesyNfVO:not(:has(.h0XG5HZ9x0lYV7JNwhoA.JHlPg4iOkqbXmXjXwVdo)):has(.jD_TVjbjclUwewP7P9e8)") && getQueuePlaybarButton(), () => { 
  {
    if (!isSpicySidebarMode && getQueueContainer()) {
      // console.log("[Spicy Lyrics Debug] Got now playing view parent container");
      const sidebarStatus = storage.get("sidebar-status") ?? "";
      // console.log("[Spicy Lyrics Debug] Sidebar status from storage:", sidebarStatus);
      if (sidebarStatus === "open") {
        // console.log("[Spicy Lyrics Debug] Sidebar status is 'open', checking current path");
        if (Spicetify.Platform.History.location.pathname === "/SpicyLyrics") {
          // console.log("[Spicy Lyrics Debug] Currently on /SpicyLyrics, going back");
          Session.GoBack();
          // console.log("[Spicy Lyrics Debug] Setting up Whentil to open sidebar after navigation");
          Whentil.When(() => !PageView.IsOpened && Spicetify.Platform.History.location.pathname !== "/SpicyLyrics", () => {
            // console.log("[Spicy Lyrics Debug] Page closed and navigated away, opening sidebar");
            OpenSidebarLyrics(getQueueContainer() ? false : true);
          })
        } else {
          // console.log("[Spicy Lyrics Debug] Not on /SpicyLyrics, setting up Whentil to open sidebar");
          Whentil.When(() => !PageView.IsOpened && Spicetify.Platform.History.location.pathname !== "/SpicyLyrics", () => {
            // console.log("[Spicy Lyrics Debug] Conditions met, opening sidebar");
            OpenSidebarLyrics(getQueueContainer() ? false : true);
          })
        }
      }
    }
    
  }
 // })

  // Add shift key tracking
  Global.Saves.shift_key_pressed = false;

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Shift') {
      Global.Saves.shift_key_pressed = true;
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') {
      Global.Saves.shift_key_pressed = false;
    }
  });

  Global.Event.listen("pagecontainer:available", () => {
    if (!ButtonList) return;
    for (const button of ButtonList) {
      if (!button.Registered) {
        button.Button.register();
        button.Registered = true;
      }
    }
  })

  {
    if (!ButtonList) return;
    const fullscreenButton = ButtonList[1].Button;
    fullscreenButton.element.style.order = "100000"
		fullscreenButton.element.id = "SpicyLyrics_FullscreenButton"

    const SearchDOMForFullscreenButtons = () => {
			const controlsContainer = document.querySelector<HTMLButtonElement>(".main-nowPlayingBar-extraControls")
			if (controlsContainer === null) {
				Defer(SearchDOMForFullscreenButtons)
			} else {
        // @ts-expect-error 123
				for (const element of controlsContainer.children) {
					if (
						(
              element.attributes.getNamedItem("data-testid")?.value === "fullscreen-mode-button" ||
              (element.classList.contains("control-button") && !element.classList.contains("volume-bar__icon-button") && !element.classList.contains("main-devicePicker-controlButton"))
            )
						&& (element.id !== "SpicyLyrics_FullscreenButton")
					) {
						(element as HTMLElement).style.display = "none"
					}
				}
			}
		}
		SearchDOMForFullscreenButtons()
  }

  {
    const whentil = Whentil.When(() => document.querySelector<HTMLElement>("style#dynamic-font-style"), (element) => {
      if (!element) {
        whentil.Cancel();
        return;
      }

      element.innerHTML = `
        * :not(#SpicyLyricsPage.UseSpicyFont *) {
          font-family: Inter, sans-serif;
        }
        :root {
          --font-family: Inter, sans-serif;
          --encore-title-font-stack: Inter,CircularSp-Arab,CircularSp-Hebr,CircularSp-Cyrl,CircularSp-Grek,CircularSp-Deva,var(--fallback-fonts,sans-serif) !important;
          --encore-variable-font-stack: Inter,CircularSp-Arab,CircularSp-Hebr,CircularSp-Cyrl,CircularSp-Grek,CircularSp-Deva,var(--fallback-fonts,sans-serif) !important;
          --encore-body-font-stack: Inter,CircularSp-Arab,CircularSp-Hebr,CircularSp-Cyrl,CircularSp-Grek,CircularSp-Deva,var(--fallback-fonts,sans-serif) !important;
        }
      `.trim();
    })

    setTimeout(() => {
      whentil.Cancel();
    }, 50000);
  }

  let button: any = undefined;
  if (ButtonList) {
    button = ButtonList[0];
  }

  const Hometinue = async () => {
    await Sockets.all.ConnectSockets();

    Whentil.When(() => Spicetify.Platform.PlaybackAPI, () => {
      requestPositionSync();
    });

    const previousVersion = storage.get("previous-version");
    if (previousVersion && previousVersion !== Defaults.SpicyLyricsVersion) {
      Spicetify.PopupModal.display({
        title: "Updated - Spicy Lyrics",
        content: `
        <div style="font-size: 1.5rem;">
          Your Spicy Lyrics version has been successfully updated!
          <br>
          Version: From: ${previousVersion} -> To: ${Defaults.SpicyLyricsVersion}
          <br>
          <br>
          <p>
            What's new: <a href="https://github.com/Spikerko/spicy-lyrics/releases/tag/${Defaults.SpicyLyricsVersion}" target="_blank" style="text-decoration: underline;">Open on Github -></a>
          </p>
          <br>
          <p style="font-size: 1.85rem; font-weight: bold; text-align: center;">
            Check out our Discord Server!
            <br>
            <a href="https://discord.com/invite/uqgXU5wh8j" target="_blank" style="font-size: 2.25rem; text-decoration: underline; color: #7a86ff;">Join Discord -></a>
          </p>
        </div>`,
        isLarge: true
      })
    }

    storage.set("previous-version", Defaults.SpicyLyricsVersion);

    // Lets set out Dynamic Background (spicy-dynamic-bg) to the now playing bar
    let lastImgUrl: string | null;
    // Store the DynamicBackground instance for reuse
    let nowPlayingBarDynamicBg: DynamicBackground | null = null;

    const CleanupNowBarDynamicBgLets = () => {
      if (nowPlayingBarDynamicBg != null) {
        nowPlayingBarDynamicBg.Destroy();
        nowPlayingBarDynamicBg = null;
      }
    }

    async function applyDynamicBackgroundToNowPlayingBar(coverUrl: string | undefined) {
      if (Defaults.hide_npv_bg) return;
      if (SpotifyPlayer.GetContentType() === "unknown" || SpotifyPlayer.IsDJ()) return;
      if (Defaults.StaticBackground || coverUrl === undefined) return;
      const nowPlayingBar =
        document.querySelector<HTMLElement>(".Root__right-sidebar aside.NowPlayingView") ??
        document.querySelector<HTMLElement>(`.Root__right-sidebar aside#Desktop_PanelContainer_Id:has(.main-nowPlayingView-coverArtContainer)`);

      try {
        if (!nowPlayingBar || isSpicySidebarMode) {
          lastImgUrl = null;
          CleanupNowBarDynamicBgLets();
          return;
        };
        if (coverUrl === lastImgUrl) return;

        const existingElement = nowPlayingBar.querySelector<HTMLElement>(".spicy-dynamic-bg");
        nowPlayingBar.classList.add("spicy-dynamic-bg-in-this");

        // Process the cover URL
        const processedCover = coverUrl;

        // Check if we already have a DynamicBackground instance
        if (nowPlayingBarDynamicBg && existingElement) {
          // Update the data-cover-id attribute
          existingElement.setAttribute("data-cover-id", coverUrl);

          // Update with the current image
          await nowPlayingBarDynamicBg.Update({
            image: processedCover
          });
        } else {
          // Create new DynamicBackground instance
          nowPlayingBarDynamicBg = new DynamicBackground(DynamicBackgroundConfig);

          // Get the canvas element
          const container = nowPlayingBarDynamicBg.GetCanvasElement();

          // Add the spicy-dynamic-bg class
          container.classList.add("spicy-dynamic-bg");

          // Set the data-cover-id attribute
          container.setAttribute("data-cover-id", coverUrl);

          // Apply the background to the element
          nowPlayingBarDynamicBg.AppendToElement(nowPlayingBar);

          // Update with the current image
          await nowPlayingBarDynamicBg.Update({
            image: processedCover
          });
        }

        lastImgUrl = coverUrl;
      } catch (error) {
        console.error("Error Applying the Dynamic BG to the NowPlayingBar:", error);
      }
    }

    Global.Event.listen("cleanup:npvbg", () => {
      CleanupNowBarDynamicBgLets();
    })

    new IntervalManager(1, async () => {
      await applyDynamicBackgroundToNowPlayingBar(SpotifyPlayer.GetCover("large"));
    }).Start();

    async function onSongChange(event: any) {
      const IsSomethingElseThanTrack = SpotifyPlayer.GetContentType() !== "track";

      if (IsSomethingElseThanTrack || SpotifyPlayer.IsDJ()) {
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

      if (!IsSomethingElseThanTrack && !SpotifyPlayer.IsDJ()) {
        if (document.querySelector("#SpicyLyricsPage .ContentBox .NowBar")) {
          Fullscreen.IsOpen ? UpdateNowBar(true) : UpdateNowBar();
        }
      }

      fetchLyrics(event?.data?.item?.uri).then(ApplyLyrics);


      if (Defaults.StaticBackground && !SpotifyPlayer.IsDJ() && (Defaults.StaticBackgroundType === "Auto" || Defaults.StaticBackgroundType === "Artist Header Visual")) {
        const Artists = SpotifyPlayer.GetArtists();
        const Artist = Artists?.map(artist => artist.uri?.replace("spotify:artist:", ""))[0] ?? undefined;
        try {
          await GetStaticBackground(Artist, SpotifyPlayer.GetId());
        } catch (error) {
          console.error("Unable to prefetch Static Background");
        }
      }

      await applyDynamicBackgroundToNowPlayingBar(SpotifyPlayer.GetCover("large"));

      const contentBox = document.querySelector<HTMLElement>("#SpicyLyricsPage .ContentBox");
      if (!contentBox) return;
      ApplyDynamicBackground(contentBox);
    }
    Global.Event.listen("playback:songchange", onSongChange);

    {
      fetchLyrics(SpotifyPlayer.GetUri() ?? "").then(ApplyLyrics);

      if (Defaults.StaticBackground && !SpotifyPlayer.IsDJ() && (Defaults.StaticBackgroundType === "Auto" || Defaults.StaticBackgroundType === "Artist Header Visual")) {
        const Artists = SpotifyPlayer.GetArtists();
        const Artist = Artists?.map(artist => artist.uri?.replace("spotify:artist:", ""))[0] ?? undefined;
        try {
          await GetStaticBackground(Artist, SpotifyPlayer.GetId());
        } catch (error) {
          console.error("Unable to prefetch Static Background");
        }
      }
    }


    window.addEventListener("online", async () => {

      storage.set("lastFetchedUri", null);

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
      if (location.pathname === "/SpicyLyrics") {
        if (isSpicySidebarMode) {
          CloseSidebarLyrics();
        }
        Whentil.When(() => !isSpicySidebarMode, () => {
          PageView.Open();
          if (!button) return;
          button.Button.active = true;
        })
      } else {
        if (lastLocation?.pathname === "/SpicyLyrics") {
          PageView.Destroy();
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
      })
    }


    if (button) {
      button.Button.tippy.setContent("Spicy Lyrics")
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
        const ShuffleType: ShuffleType = ((Spicetify.Player as any).origin._state.smartShuffle ? "smart" : ((Spicetify.Player as any).origin._state.shuffle ? "normal" : "none"));
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

    {
      let lastTimeout: any;
      Global.Event.listen("lyrics:apply", () => {
        if (lastTimeout !== undefined) {
          clearTimeout(lastTimeout);
          lastTimeout = undefined;
        }
        lastTimeout = setTimeout(async () => {
          const currentSongLyrics = storage.get("currentLyricsData");
          if (currentSongLyrics && currentSongLyrics.toString() !== `NO_LYRICS:${SpotifyPlayer.GetId()}`) {
            const parsedLyrics = JSON.parse(currentSongLyrics.toString());
            if (parsedLyrics && parsedLyrics.id && parsedLyrics.id !== SpotifyPlayer.GetId()) {
              fetchLyrics(SpotifyPlayer.GetUri() ?? "").then(ApplyLyrics);
            }
          }
        }, 1000)
      })
    }

    SpotifyPlayer.IsPlaying = IsPlaying();

    // Events
    {
      Spicetify.Player.addEventListener("onplaypause", (e) => {
        SpotifyPlayer.IsPlaying = !e?.data?.isPaused;
        Global.Event.evoke("playback:playpause", e)
      });
      Spicetify.Player.addEventListener("onprogress", (e) => Global.Event.evoke("playback:progress", e));
      Spicetify.Player.addEventListener("songchange", (e) => Global.Event.evoke("playback:songchange", e));

      Whentil.When(GetPageRoot, () => {
        Global.Event.evoke("pagecontainer:available", GetPageRoot())
      })

      Spicetify.Platform.History.listen((e: Location) => {
        Global.Event.evoke("platform:history", e);
      });
      Spicetify.Platform.History.listen(Session.RecordNavigation);
      Session.RecordNavigation(Spicetify.Platform.History.location);

      Global.Event.listen("session:navigation", (data: Location) => {
        if (data.pathname === "/SpicyLyrics/Update") {
          storage.set("previous-version", Defaults.SpicyLyricsVersion);
          window._spicy_lyrics_metadata = {}
          Session.GoBack();
          window.location.reload();
        }
      })

      async function CheckForUpdates_Intervaled() {
        await CheckForUpdates();
        setTimeout(CheckForUpdates_Intervaled, 300 * 1000);
      }
      setTimeout(async () => await CheckForUpdates_Intervaled(), 300 * 1000);
    }
  }

  Whentil.When(() => SpotifyPlayer.GetContentType(), () => {
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
  })


  Hometinue();
}

main();