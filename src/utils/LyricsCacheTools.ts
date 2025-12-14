import { SpotifyPlayer } from "../components/Global/SpotifyPlayer.ts";
import PageView, { ShowNotification } from "../components/Pages/PageView.ts";
import fetchLyrics, { LyricsStore } from "./Lyrics/fetchLyrics.ts";
import ApplyLyrics from "./Lyrics/Global/Applyer.ts";
import storage from "./storage.ts";
import { t } from "./i18n.ts";

export const RemoveCurrentLyrics_AllCaches = async (ui: boolean = false) => {
  const currentSongId = SpotifyPlayer.GetId();
  if (!currentSongId || currentSongId === undefined) {
    ui
      ? ShowNotification(t("notifications.currentSongIdNotRetrieved"), "error")
      : null;
  }
  try {
    await LyricsStore.RemoveItem(currentSongId ?? "");
    storage.set("currentLyricsData", null);
    ui
      ? ShowNotification(
          t("notifications.lyricsRemovedAllCaches"),
          "success"
        )
      : null;
    if (PageView.IsOpened) {
      const uri = SpotifyPlayer.GetUri();
      if (uri && uri !== undefined) {
        fetchLyrics(uri).then(ApplyLyrics);
      }
    }
  } catch (error) {
    ui
      ? ShowNotification(
          `
            <p>${t("notifications.lyricsRemovalFailed")}</p>
            <p style="opacity: 0.75;">${t("notifications.checkConsole")}</p>
        `,
          "error"
        )
      : null;
    console.error("SpicyLyrics:", error);
  }
};

export const RemoveLyricsCache = async (ui: boolean = false) => {
  try {
    await LyricsStore.Destroy();
    ui
      ? ShowNotification(
          t("notifications.lyricsCacheDestroyed"),
          "success"
        )
      : null;
    if (PageView.IsOpened) {
      const uri = SpotifyPlayer.GetUri();
      if (uri && uri !== undefined) {
        fetchLyrics(uri).then(ApplyLyrics);
      }
    }
  } catch (error) {
    ui
      ? ShowNotification(
          `
                <p>${t("notifications.lyricsCacheRemovalFailed")}</p>
                <p style="opacity: 0.75;">${t("notifications.checkConsole")}</p>
            `,
          "error"
        )
      : null;
    console.error("SpicyLyrics:", error);
  }
};

export const RemoveCurrentLyrics_StateCache = (ui: boolean = false) => {
  try {
    storage.set("currentLyricsData", null);
    ui
      ? ShowNotification(
          t("notifications.lyricsRemovedInternalState"),
          "success"
        )
      : null;
    if (PageView.IsOpened) {
      const uri = SpotifyPlayer.GetUri();
      if (uri && uri !== undefined) {
        fetchLyrics(uri).then(ApplyLyrics);
      }
    }
  } catch (error) {
    ui
      ? ShowNotification(
          `
                <p>${t("notifications.lyricsRemovalInternalStateFailed")}</p>
                <p style="opacity: 0.75;">${t("notifications.checkConsole")}</p>
            `,
          "error"
        )
      : null;
    console.error("SpicyLyrics:", error);
  }
};
