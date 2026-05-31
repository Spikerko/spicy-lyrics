import { PageContainer } from "./../Pages/PageView.ts";
import { GetCurrentLyricsContainerInstance } from "../../utils/Lyrics/Applyer/CreateLyricsContainer.ts";
import { $currentLyricsData, $lockedMediaBox } from "../../utils/stores.ts";
import Global from "../Global/Global.ts";
import { SpotifyPlayer } from "../Global/SpotifyPlayer.ts";
import Fullscreen from "./Fullscreen.ts";
import { Session_NowBar_SetSide } from "./NowBar.ts";
import { IsPIP } from "./PopupLyrics.ts";

let CompactMode = false;

export const EnableCompactMode = () => {
  const SpicyLyricsPage = PageContainer;
  if (!SpicyLyricsPage) return;

  const isNoLyrics =
    $currentLyricsData.get() === `NO_LYRICS:${SpotifyPlayer.GetId()}`;
  if (isNoLyrics && (Fullscreen.IsOpen || Fullscreen.CinemaViewOpen || IsPIP)) {
    SpicyLyricsPage.querySelector<HTMLElement>(".ContentBox .LyricsContainer")?.classList.remove(
      "Hidden"
    );
    SpicyLyricsPage.querySelector<HTMLElement>(".ContentBox")?.classList.remove("LyricsHidden");
  }

  SpicyLyricsPage.classList.add("CompactMode", "NowBarSide__Left");
  SpicyLyricsPage.classList.remove("NowBarSide__Right");
  const NowBar = SpicyLyricsPage.querySelector<HTMLElement>(".ContentBox .NowBar");
  if (!NowBar) return;
  NowBar.classList.add("LeftSide");
  NowBar.classList.remove("RightSide");

  if (!IsPIP) {
    if ($lockedMediaBox.get()) {
      NowBar.classList.add("LockedMediaBox");
    } else {
      NowBar.classList.remove("LockedMediaBox");
    }
  }

  CompactMode = true;
  GetCurrentLyricsContainerInstance()?.Resize();
  Global.Event.evoke("compact-mode:enable");
};

export const DisableCompactMode = () => {
  const SpicyLyricsPage = PageContainer;
  if (!SpicyLyricsPage) return;

  const isNoLyrics =
    $currentLyricsData.get() === `NO_LYRICS:${SpotifyPlayer.GetId()}`;
  if (isNoLyrics && (Fullscreen.IsOpen || Fullscreen.CinemaViewOpen || IsPIP)) {
    SpicyLyricsPage.querySelector<HTMLElement>(".ContentBox .LyricsContainer")?.classList.add(
      "Hidden"
    );
    SpicyLyricsPage.querySelector<HTMLElement>(".ContentBox")?.classList.add("LyricsHidden");
  }

  SpicyLyricsPage.classList.remove("CompactMode");
  Session_NowBar_SetSide();
  CompactMode = false;
  GetCurrentLyricsContainerInstance()?.Resize();

  Global.Event.evoke("compact-mode:disable");
};

export const IsCompactMode = () => {
  return CompactMode;
};

export const ToggleCompactMode = () => {
  if (CompactMode) DisableCompactMode();
  else EnableCompactMode();
};

$lockedMediaBox.listen((v) => {
  if (!CompactMode) return;
  const SpicyLyricsPage = PageContainer;
  if (!SpicyLyricsPage) return;
  if (IsPIP) return;
  const NowBar = SpicyLyricsPage.querySelector<HTMLElement>(".ContentBox .NowBar");
  if (!NowBar) return;
  if (v) {
    NowBar.classList.add("LockedMediaBox");
  } else {
    NowBar.classList.remove("LockedMediaBox");
  }
});
