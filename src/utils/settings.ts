import { Spicetify } from "@spicetify/bundler";
import Defaults from "../components/Global/Defaults.ts";
import { SpotifyPlayer } from "../components/Global/SpotifyPlayer.ts";
import PageView, { ShowNotification } from "../components/Pages/PageView.ts";
import fetchLyrics, { LyricsStore } from "./Lyrics/fetchLyrics.ts";
import ApplyLyrics from "./Lyrics/Global/Applyer.ts";
import storage from "./storage.ts";

export async function setSettingsMenu() {
  while (!Spicetify.React || !Spicetify.ReactDOM) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  const { SettingsSection } = await import("../edited_packages/spcr-settings/settingsSection.tsx");

  generalSettings(SettingsSection);
  devSettings(SettingsSection);
  infos(SettingsSection);
}

function devSettings(SettingsSection: any) {
  const settings = new SettingsSection(
    "Spicy Lyrics - Developer Settings",
    "spicy-lyrics-dev-settings"
  );

  settings.addButton(
    "remove-current-lyrics-all-caches",
    "Remove Lyrics for the current song from all caches",
    "Remove",
    async () => {
      const currentSongId = SpotifyPlayer.GetId();
      if (!currentSongId || currentSongId === undefined) {
        ShowNotification(`The current song id could not be retrieved`, "error");
      }
      try {
        await LyricsStore.RemoveItem(currentSongId ?? "");
        storage.set("currentLyricsData", null);
        ShowNotification(
          `Lyrics for the current song, have been removed from available all caches`,
          "success"
        );
        if (PageView.IsOpened) {
          const uri = SpotifyPlayer.GetUri();
          if (uri && uri !== undefined) {
            fetchLyrics(uri).then(ApplyLyrics);
          }
        }
      } catch (error) {
        ShowNotification(
          `
                <p>Lyrics for the current song, couldn't be removed from all available caches</p>
                <p style="opacity: 0.75;">Check the console for more info</p>
            `,
          "error"
        );
        console.error("SpicyLyrics:", error);
      }
    }
  );

  settings.addButton(
    "remove-cached-lyrics",
    "Remove Cached Lyrics (Lyrics Stay in Cache for 3 days)",
    "Remove Cached Lyrics",
    async () => {
      try {
        await LyricsStore.Destroy();
        ShowNotification("The Lyrics Cache has been destroyed successfully", "success");
        if (PageView.IsOpened) {
          const uri = SpotifyPlayer.GetUri();
          if (uri && uri !== undefined) {
            fetchLyrics(uri).then(ApplyLyrics);
          }
        }
      } catch (error) {
        ShowNotification(
          `
                <p>The Lyrics cache, couldn't be removed</p>
                <p style="opacity: 0.75;">Check the console for more info</p>
            `,
          "error"
        );
        console.error("SpicyLyrics:", error);
      }
    }
  );

  settings.addButton(
    "remove-current-song-lyrics-from-localStorage",
    "Remove Current Song Lyrics from internal state",
    "Remove Current Lyrics",
    () => {
      try {
        storage.set("currentLyricsData", null);
        ShowNotification(
          "Lyrics for the current song, have been removed from the internal state successfully",
          "success"
        );
        if (PageView.IsOpened) {
          const uri = SpotifyPlayer.GetUri();
          if (uri && uri !== undefined) {
            fetchLyrics(uri).then(ApplyLyrics);
          }
        }
      } catch (error) {
        ShowNotification(
          `
                <p>Lyrics for the current song, couldn't be removed from the internal state</p>
                <p style="opacity: 0.75;">Check the console for more info</p>
            `,
          "error"
        );
        console.error("SpicyLyrics:", error);
      }
    }
  );

  settings.addToggle("dev-mode", "Dev Mode", Defaults.DevMode, () => {
    storage.set("devMode", settings.getFieldValue("dev-mode") as string);
    window.location.reload();
  });

  settings.pushSettings();
}

function generalSettings(SettingsSection: any) {
  const settings = new SettingsSection("Spicy Lyrics", "spicy-lyrics-settings");

  settings.addToggle(
    "static-background",
    "Static Background",
    Defaults.StaticBackground_Preset,
    () => {
      storage.set("staticBackground", settings.getFieldValue("static-background") as string);
    }
  );

  settings.addDropDown(
    "static-background-type",
    "Static Background Type (Only works when Static Background is Enabled)",
    ["Auto", "Artist Header Visual", "Cover Art", "Color"],
    Defaults.StaticBackgroundType_Preset,
    () => {
      storage.set(
        "staticBackgroundType",
        settings.getFieldValue("static-background-type") as string
      );
    }
  );

  settings.addToggle("simple-lyrics-mode", "Simple Lyrics Mode", Defaults.SimpleLyricsMode, () => {
    storage.set("simpleLyricsMode", settings.getFieldValue("simple-lyrics-mode") as string);
  });

  settings.addDropDown(
    "simple-lyrics-mode-rendering-type",
    "Simple Lyrics Mode - Rendering Type",
    ["Calculate (More performant)", "Animate (Legacy, More laggier)"],
    Defaults.SimpleLyricsMode_RenderingType_Default,
    () => {
      const value = settings.getFieldValue("simple-lyrics-mode-rendering-type") as string;
      const processedValue =
        value === "Calculate (More performant)"
          ? "calculate"
          : value === "Animate (Legacy, More laggier)"
            ? "animate"
            : "calculate";
      storage.set("simpleLyricsModeRenderingType", processedValue);
    }
  );

  settings.addToggle(
    "minimal-lyrics-mode",
    "Minimal Lyrics Mode (Only in Fullscreen/Cinema View)",
    Defaults.MinimalLyricsMode,
    () => {
      storage.set("minimalLyricsMode", settings.getFieldValue("minimal-lyrics-mode") as string);
    }
  );

  settings.addToggle("skip-spicy-font", "Skip Spicy Font*", Defaults.SkipSpicyFont, () => {
    storage.set("skip-spicy-font", settings.getFieldValue("skip-spicy-font") as string);
  });

  settings.addToggle(
    "old-style-font",
    "Old Style Font (Gets Overriden by the previous option)",
    Defaults.OldStyleFont,
    () => {
      storage.set("old-style-font", settings.getFieldValue("old-style-font") as string);
    }
  );

  settings.addToggle(
    "show_topbar_notifications",
    "Show Topbar Notifications",
    Defaults.show_topbar_notifications,
    () => {
      storage.set(
        "show_topbar_notifications",
        settings.getFieldValue("show_topbar_notifications") as string
      );
    }
  );

  settings.addToggle(
    "hide_npv_bg",
    "Hide Now Playing View Dynamic Background",
    Defaults.hide_npv_bg,
    () => {
      storage.set("hide_npv_bg", settings.getFieldValue("hide_npv_bg") as string);
    }
  );

  settings.addToggle(
    "lock_mediabox",
    "Lock the MediaBox size while in Forced Compact Mode",
    Defaults.CompactMode_LockedMediaBox,
    () => {
      storage.set("lockedMediaBox", settings.getFieldValue("lock_mediabox") as string);
    }
  );

  settings.addDropDown(
    "lyrics-renderer",
    "Lyrics Renderer",
    ["Spicy Lyrics (Default) (Stable)", "AML Lyrics (Experimental) (Unstable)"],
    Defaults.LyricsRenderer_Default,
    () => {
      const value = settings.getFieldValue("lyrics-renderer") as string;
      const processedValue =
        value === "Spicy Lyrics (Default) (Stable)"
          ? "Spicy"
          : value === "AML Lyrics (Experimental) (Unstable)"
            ? "aml-lyrics"
            : "Spicy";
      storage.set("lyricsRenderer", processedValue);
    }
  );

  settings.addToggle(
    "disable-popup-lyrics",
    "Disable Popup Lyrics",
    !Defaults.PopupLyricsAllowed,
    () => {
      storage.set("disablePopupLyrics", settings.getFieldValue("disable-popup-lyrics") as string);
    }
  );

  settings.addDropDown(
    "viewcontrols-position",
    "View Controls Position",
    ["Top", "Bottom"],
    Defaults.ViewControlsPosition,
    () => {
      storage.set(
        "viewControlsPosition",
        settings.getFieldValue("viewcontrols-position") as string
      );
    }
  );

  settings.addButton(
    "save-n-reload",
    "Save your current settings and reload.",
    "Save & Reload",
    () => {
      window.location.reload();
    }
  );

  settings.pushSettings();
}

function infos(SettingsSection: any) {
  const settings = new SettingsSection("Spicy Lyrics - Info", "spicy-lyrics-settings-info");

  settings.addButton(
    "more-info",
    "*If you're using a custom font modification, turn that on",
    "",
    () => {}
  );

  settings.pushSettings();
}
