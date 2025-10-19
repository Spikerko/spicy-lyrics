import { SpotifyPlayer } from "../components/Global/SpotifyPlayer.ts";
import PageView, { ShowNotification } from "../components/Pages/PageView.ts";
import fetchLyrics, { LyricsStore } from "./Lyrics/fetchLyrics.ts";
import ApplyLyrics from "./Lyrics/Global/Applyer.ts";
import storage from "./storage.ts";

export const RemoveCurrentLyrics_AllCaches = async (ui: boolean = false) => {
  const currentSongId = SpotifyPlayer.GetId();
  if (!currentSongId || currentSongId === undefined) {
    ui
      ? ShowNotification(`The current song id could not be retrieved`, "error")
      : null;
  }
  try {
    await LyricsStore.RemoveItem(currentSongId ?? "");
    storage.set("currentLyricsData", null);
    ui
      ? ShowNotification(
          `Lyrics for the current song, have been removed from available all caches`,
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
            <p>Lyrics for the current song, couldn't be removed from all available caches</p>
            <p style="opacity: 0.75;">Check the console for more info</p>
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
          "The Lyrics Cache has been destroyed successfully",
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
                <p>The Lyrics cache, couldn't be removed</p>
                <p style="opacity: 0.75;">Check the console for more info</p>
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
          "Lyrics for the current song, have been removed from the internal state successfully",
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
                <p>Lyrics for the current song, couldn't be removed from the internal state</p>
                <p style="opacity: 0.75;">Check the console for more info</p>
            `,
          "error"
        )
      : null;
    console.error("SpicyLyrics:", error);
  }
};
