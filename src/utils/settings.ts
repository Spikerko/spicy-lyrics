import { Component, Spicetify } from "@spicetify/bundler";
import Defaults from "../components/Global/Defaults.ts";
import storage from "./storage.ts";
import { RemoveCurrentLyrics_AllCaches, RemoveCurrentLyrics_StateCache, RemoveLyricsCache } from "./LyricsCacheTools.ts";

export async function setSettingsMenu() {
  while (!Spicetify.React || !Spicetify.ReactDOM) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  const { SettingsSection } = await import("../edited_packages/spcr-settings/settingsSection.tsx");

  generalSettings(SettingsSection);
  devSettings(SettingsSection);
  //infos(SettingsSection);
}

Component.AddRootComponent("lCache", {
  RemoveCurrentLyrics_AllCaches,
  RemoveLyricsCache,
  RemoveCurrentLyrics_StateCache,
})

function devSettings(SettingsSection: any) {
  const settings = new SettingsSection(
    "Spicy Lyrics - Developer Settings",
    "spicy-lyrics-dev-settings"
  );

  settings.addButton(
    "remove-current-lyrics-all-caches",
    "Clear Lyrics for the current song from all caches",
    "Clear",
    async () => await RemoveCurrentLyrics_AllCaches(true)
  );

  settings.addButton(
    "remove-cached-lyrics",
    "Clear Cached Lyrics (Lyrics Stay in Cache for 3 days)",
    "Clear Cached Lyrics",
    async () => await RemoveLyricsCache(true)
  );

  settings.addButton(
    "remove-current-song-lyrics-from-localStorage",
    "Clear Current Song Lyrics from internal state",
    "Clear Current Lyrics",
    () => RemoveCurrentLyrics_StateCache(true)
  );

  settings.addToggle("dev-mode", "TTML Maker mode (previously Dev Mode)", Defaults.DevMode, () => {
    storage.set("devMode", settings.getFieldValue("dev-mode") as string);
    window.location.reload();
  });

  settings.addToggle("developer-mode", "Developer Mode", Defaults.DeveloperMode, () => {
    storage.set("developerMode", settings.getFieldValue("developer-mode") as string);
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
    "Lyrics Renderer (Deprecated - will not work)",
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

  settings.addToggle("settings-on-top", "Display the settings panels on top of the settings page?", Defaults.SettingsOnTop, () => {
    storage.set("settingsOnTop", settings.getFieldValue("settings-on-top") as string);
  });

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

/* function infos(SettingsSection: any) {
  const settings = new SettingsSection("Spicy Lyrics - Info", "spicy-lyrics-settings-info");

  settings.addButton(
    "more-info",
    "*If you're using a custom font modification, turn that on",
    "",
    () => {}
  );

  settings.pushSettings();
} */
