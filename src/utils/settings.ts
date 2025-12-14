import { Component, Spicetify } from "@spicetify/bundler";
import Defaults from "../components/Global/Defaults.ts";
import storage from "./storage.ts";
import { RemoveCurrentLyrics_AllCaches, RemoveCurrentLyrics_StateCache, RemoveLyricsCache } from "./LyricsCacheTools.ts";
import { t, AVAILABLE_LANGUAGES, getSpotifyLanguage, setLanguage } from "./i18n.ts";

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
    t("settings.devSettings.title"),
    "spicy-lyrics-dev-settings"
  );

  settings.addButton(
    "remove-current-lyrics-all-caches",
    t("settings.devSettings.clearCurrentAllCaches"),
    t("settings.devSettings.clearButton"),
    async () => await RemoveCurrentLyrics_AllCaches(true)
  );

  settings.addButton(
    "remove-cached-lyrics",
    t("settings.devSettings.clearCachedLyrics"),
    t("settings.devSettings.clearCachedLyricsButton"),
    async () => await RemoveLyricsCache(true)
  );

  settings.addButton(
    "remove-current-song-lyrics-from-localStorage",
    t("settings.devSettings.clearCurrentInternal"),
    t("settings.devSettings.clearCurrentLyricsButton"),
    () => RemoveCurrentLyrics_StateCache(true)
  );

  settings.addToggle("dev-mode", t("settings.devSettings.devMode"), Defaults.DevMode, () => {
    storage.set("devMode", settings.getFieldValue("dev-mode") as string);
    window.location.reload();
  });

  settings.pushSettings();
}

function generalSettings(SettingsSection: any) {
  const settings = new SettingsSection(t("settings.general.title"), "spicy-lyrics-settings");

  settings.addToggle(
    "static-background",
    t("settings.general.staticBackground"),
    Defaults.StaticBackground_Preset,
    () => {
      storage.set("staticBackground", settings.getFieldValue("static-background") as string);
    }
  );

  settings.addDropDown(
    "static-background-type",
    t("settings.general.staticBackgroundType"),
    [t("settings.general.staticBackgroundTypes.auto"), t("settings.general.staticBackgroundTypes.artistHeader"), t("settings.general.staticBackgroundTypes.coverArt"), t("settings.general.staticBackgroundTypes.color")],
    Defaults.StaticBackgroundType_Preset,
    () => {
      storage.set(
        "staticBackgroundType",
        settings.getFieldValue("static-background-type") as string
      );
    }
  );

  settings.addToggle("simple-lyrics-mode", t("settings.general.simpleLyricsMode"), Defaults.SimpleLyricsMode, () => {
    storage.set("simpleLyricsMode", settings.getFieldValue("simple-lyrics-mode") as string);
  });

  settings.addDropDown(
    "simple-lyrics-mode-rendering-type",
    t("settings.general.simpleLyricsModeRenderingType"),
    [t("settings.general.simpleLyricsModeRenderingTypes.calculate"), t("settings.general.simpleLyricsModeRenderingTypes.animate")],
    Defaults.SimpleLyricsMode_RenderingType_Default,
    () => {
      const value = settings.getFieldValue("simple-lyrics-mode-rendering-type") as string;
      const processedValue =
        value === t("settings.general.simpleLyricsModeRenderingTypes.calculate")
          ? "calculate"
          : value === t("settings.general.simpleLyricsModeRenderingTypes.animate")
            ? "animate"
            : "calculate";
      storage.set("simpleLyricsModeRenderingType", processedValue);
    }
  );

  settings.addToggle(
    "minimal-lyrics-mode",
    t("settings.general.minimalLyricsMode"),
    Defaults.MinimalLyricsMode,
    () => {
      storage.set("minimalLyricsMode", settings.getFieldValue("minimal-lyrics-mode") as string);
    }
  );

  settings.addToggle("skip-spicy-font", t("settings.general.skipSpicyFont"), Defaults.SkipSpicyFont, () => {
    storage.set("skip-spicy-font", settings.getFieldValue("skip-spicy-font") as string);
  });

  settings.addToggle(
    "old-style-font",
    t("settings.general.oldStyleFont"),
    Defaults.OldStyleFont,
    () => {
      storage.set("old-style-font", settings.getFieldValue("old-style-font") as string);
    }
  );

  settings.addToggle(
    "show_topbar_notifications",
    t("settings.general.showTopbarNotifications"),
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
    t("settings.general.hideNPVBg"),
    Defaults.hide_npv_bg,
    () => {
      storage.set("hide_npv_bg", settings.getFieldValue("hide_npv_bg") as string);
    }
  );

  settings.addToggle(
    "lock_mediabox",
    t("settings.general.lockMediaBox"),
    Defaults.CompactMode_LockedMediaBox,
    () => {
      storage.set("lockedMediaBox", settings.getFieldValue("lock_mediabox") as string);
    }
  );

  settings.addDropDown(
    "lyrics-renderer",
    t("settings.general.lyricsRenderer"),
    [t("settings.general.lyricsRendererTypes.spicy"), t("settings.general.lyricsRendererTypes.aml")],
    Defaults.LyricsRenderer_Default,
    () => {
      const value = settings.getFieldValue("lyrics-renderer") as string;
      const processedValue =
        value === t("settings.general.lyricsRendererTypes.spicy")
          ? "Spicy"
          : value === t("settings.general.lyricsRendererTypes.aml")
            ? "aml-lyrics"
            : "Spicy";
      storage.set("lyricsRenderer", processedValue);
    }
  );

  settings.addToggle(
    "disable-popup-lyrics",
    t("settings.general.disablePopupLyrics"),
    !Defaults.PopupLyricsAllowed,
    () => {
      storage.set("disablePopupLyrics", settings.getFieldValue("disable-popup-lyrics") as string);
    }
  );

  settings.addDropDown(
    "viewcontrols-position",
    t("settings.general.viewControlsPosition"),
    [t("settings.general.viewControlsPositions.top"), t("settings.general.viewControlsPositions.bottom")],
    Defaults.ViewControlsPosition,
    () => {
      storage.set(
        "viewControlsPosition",
        settings.getFieldValue("viewcontrols-position") as string
      );
    }
  );

  settings.addToggle("settings-on-top", t("settings.general.settingsOnTop"), Defaults.SettingsOnTop, () => {
    storage.set("settingsOnTop", settings.getFieldValue("settings-on-top") as string);
  });

  // Language Settings
  settings.addToggle(
    "auto-language",
    t("settings.language.autoLanguage"),
    storage.get("autoLanguage") !== "false",
    () => {
      const isAuto = settings.getFieldValue("auto-language") as boolean;
      storage.set("autoLanguage", String(isAuto));
      if (isAuto) {
        const spotifyLang = getSpotifyLanguage();
        setLanguage(spotifyLang).then(() => {
          window.location.reload();
        });
      }
    }
  );

  const languageOptions = Object.entries(AVAILABLE_LANGUAGES).map(([code, name]) => name);
  const currentLangCode = storage.get("language") || "en";
  const currentLangName = AVAILABLE_LANGUAGES[currentLangCode as keyof typeof AVAILABLE_LANGUAGES] || "English";

  settings.addDropDown(
    "manual-language",
    t("settings.language.selectLanguage"),
    languageOptions,
    currentLangName,
    () => {
      const selectedName = settings.getFieldValue("manual-language") as string;
      const selectedCode = Object.entries(AVAILABLE_LANGUAGES).find(([_, name]) => name === selectedName)?.[0];
      if (selectedCode) {
        storage.set("autoLanguage", "false");
        setLanguage(selectedCode).then(() => {
          window.location.reload();
        });
      }
    }
  );

  settings.addButton(
    "save-n-reload",
    t("settings.general.saveAndReload"),
    t("settings.general.saveAndReloadButton"),
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
