import { SpotifyPlayer } from "../components/Global/SpotifyPlayer.ts";
import PageView from "../components/Pages/PageView.ts";
import { toast } from "sonner";
import fetchLyrics, { LyricsStore } from "./Lyrics/fetchLyrics.ts";
import ApplyLyrics from "./Lyrics/Global/Applyer.ts";
import { $currentLyricsData } from "./stores.ts";

export const RemoveCurrentLyrics_AllCaches = async (ui: boolean = false) => {
  const currentSongId = SpotifyPlayer.GetId();
  if (!currentSongId || currentSongId === undefined) {
    ui
      ? toast.error(`The current song id could not be retrieved`)
      : null;
  }
  try {
    await LyricsStore.RemoveItem(currentSongId ?? "");
    $currentLyricsData.set("");
    ui
      ? toast.success(`Lyrics for the current song, have been removed from available all caches`)
      : null;
    if (PageView.IsOpened) {
      const uri = SpotifyPlayer.GetUri();
      if (uri && uri !== undefined) {
        fetchLyrics(uri).then(ApplyLyrics);
      }
    }
  } catch (error) {
    ui
      ? toast.error(`Lyrics for the current song, couldn't be removed from all available caches. Check the console for more info.`)
      : null;
    console.error("SpicyLyrics:", error);
  }
};

export const RemoveLyricsCache = async (ui: boolean = false) => {
  try {
    await LyricsStore.Destroy();
    ui
      ? toast.success("The Lyrics Cache has been destroyed successfully")
      : null;
    if (PageView.IsOpened) {
      const uri = SpotifyPlayer.GetUri();
      if (uri && uri !== undefined) {
        fetchLyrics(uri).then(ApplyLyrics);
      }
    }
  } catch (error) {
    ui
      ? toast.error(`The Lyrics cache, couldn't be removed. Check the console for more info.`)
      : null;
    console.error("SpicyLyrics:", error);
  }
};


export const RemoveCurrentLyrics_StateCache = (ui: boolean = false) => {
  try {
    $currentLyricsData.set("");
    ui
      ? toast.success("Lyrics for the current song, have been removed from the internal state successfully")
      : null;
    if (PageView.IsOpened) {
      const uri = SpotifyPlayer.GetUri();
      if (uri && uri !== undefined) {
        fetchLyrics(uri).then(ApplyLyrics);
      }
    }
  } catch (error) {
    ui
      ? toast.error(`Lyrics for the current song, couldn't be removed from the internal state. Check the console for more info.`)
      : null;
    console.error("SpicyLyrics:", error);
  }
};
