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
  //infos(SettingsSection);
}

Component.AddRootComponent("lCache", {
  RemoveCurrentLyrics_AllCaches,
  RemoveLyricsCache,
  RemoveCurrentLyrics_StateCache,
})

function generalSettings(SettingsSection: any) {
  const settings = new SettingsSection("Spicy Lyrics", "spicy-lyrics-settings");

  // --- Appearance ---
  settings.addGroup("Appearance");

  settings.addToggle("skip-spicy-font", "Skip Spicy Font*", Defaults.SkipSpicyFont, () => {
    const value = settings.getFieldValue("skip-spicy-font") as string;
    storage.set("skip-spicy-font", value);
    Defaults.SkipSpicyFont = value === "true" || value === true;
  });

  settings.addToggle(
    "old-style-font",
    "Old Style Font (Gets Overriden by the previous option)",
    Defaults.OldStyleFont,
    () => {
      const value = settings.getFieldValue("old-style-font") as string;
      storage.set("old-style-font", value);
      Defaults.OldStyleFont = value === "true" || value === true;
    }
  );

  settings.addToggle("simple-lyrics-mode", "Simple Lyrics Mode", Defaults.SimpleLyricsMode, () => {
    const value = settings.getFieldValue("simple-lyrics-mode") as string;
    storage.set("simpleLyricsMode", value);
    Defaults.SimpleLyricsMode = value === "true" || value === true;
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
      Defaults.SimpleLyricsMode_RenderingType = processedValue;
    }
  );

  settings.addToggle(
    "minimal-lyrics-mode",
    "Minimal Lyrics Mode (Only in Fullscreen/Cinema View)",
    Defaults.MinimalLyricsMode,
    () => {
      const value = settings.getFieldValue("minimal-lyrics-mode") as string;
      storage.set("minimalLyricsMode", value);
      Defaults.MinimalLyricsMode = value === "true" || value === true;
    }
  );

  // --- Background ---
  settings.addGroup("Background");

  settings.addToggle(
    "static-background",
    "Static Background",
    Defaults.StaticBackground_Preset,
    () => {
      const value = settings.getFieldValue("static-background") as string;
      storage.set("staticBackground", value);
      Defaults.StaticBackground = value === "true" || value === true;
    }
  );

  settings.addDropDown(
    "static-background-type",
    "Static Background Type (Only works when Static Background is Enabled)",
    ["Auto", "Artist Header Visual", "Cover Art", "Color"],
    Defaults.StaticBackgroundType_Preset,
    () => {
      const value = settings.getFieldValue("static-background-type") as string;
      storage.set("staticBackgroundType", value);
      Defaults.StaticBackgroundType = value;
    }
  );

  settings.addToggle(
    "hide_npv_bg",
    "Hide Now Playing View Dynamic Background",
    Defaults.hide_npv_bg,
    () => {
      const value = settings.getFieldValue("hide_npv_bg") as string;
      storage.set("hide_npv_bg", value);
      Defaults.hide_npv_bg = value === "true" || value === true;
    }
  );

  // --- Playback & Controls ---
  settings.addGroup("Playback & Controls");

  settings.addToggle(
    "always-display-playback-controls",
    "Always display Playback Bar and Controls",
    Defaults.AlwaysDisplayPlaybackControls,
    () => {
      const value = settings.getFieldValue("always-display-playback-controls") as string;
      storage.set("alwaysDisplayPlaybackControls", value);
      Defaults.AlwaysDisplayPlaybackControls = value === "true" || value === true;
    }
  );

  settings.addDropDown(
    "viewcontrols-position",
    "View Controls Position",
    ["Top", "Bottom"],
    Defaults.ViewControlsPosition === "Bottom" ? 1 : 0,
    () => {
      const value = settings.getFieldValue("viewcontrols-position") as string;
      storage.set("viewControlsPosition", value);
      Defaults.ViewControlsPosition = value;
    }
  );

  settings.addToggle(
    "disable-popup-lyrics",
    "Disable Popup Lyrics",
    !Defaults.PopupLyricsAllowed,
    () => {
      const value = settings.getFieldValue("disable-popup-lyrics") as string;
      storage.set("disablePopupLyrics", value);
      Defaults.PopupLyricsAllowed = !(value === "true" || value === true);
    }
  );

  settings.addToggle(
    "show_topbar_notifications",
    "Show Topbar Notifications",
    Defaults.show_topbar_notifications,
    () => {
      const value = settings.getFieldValue("show_topbar_notifications") as string;
      storage.set("show_topbar_notifications", value);
      Defaults.show_topbar_notifications = value === "true" || value === true;
    }
  );

  // --- Layout ---
  settings.addGroup("Layout");

  settings.addToggle(
    "lock_mediabox",
    "Lock the MediaBox size while in Forced Compact Mode",
    Defaults.CompactMode_LockedMediaBox,
    () => {
      const value = settings.getFieldValue("lock_mediabox") as string;
      storage.set("lockedMediaBox", value);
      Defaults.CompactMode_LockedMediaBox = value === "true" || value === true;
    }
  );

  settings.addToggle("settings-on-top", "Display the settings panels on top of the settings page?", Defaults.SettingsOnTop, () => {
    const value = settings.getFieldValue("settings-on-top") as string;
    storage.set("settingsOnTop", value);
    const isOn = value === "true" || value === true;
    Defaults.SettingsOnTop = isOn;
    document.body.classList.toggle("sl_settings_top", isOn);
  });

  // --- Cache ---
  settings.addGroup("Cache");

  settings.addButton(
    "clear-all-caches",
    "Clear all lyrics caches at once",
    "Clear All",
    async () => {
      await RemoveCurrentLyrics_AllCaches(true);
      await RemoveLyricsCache(true);
      RemoveCurrentLyrics_StateCache(true);
    }
  );

  settings.addButton(
    "remove-current-lyrics-all-caches",
    "Clear Lyrics for the current song from all caches",
    "Clear Current Song",
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

  // --- Advanced ---
  settings.addGroup("Advanced");

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
      Defaults.LyricsRenderer = processedValue;
    }
  );

  settings.addToggle("developer-mode", "Developer Mode", Defaults.DeveloperMode, () => {
    storage.set("developerMode", settings.getFieldValue("developer-mode") as string);
    window.location.reload();
  });

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
