import { GetExpireStore } from "@spikerko/tools/Cache";
import Defaults, { isDev } from "../../components/Global/Defaults.ts";
import Platform from "../../components/Global/Platform.ts";
import { SpotifyPlayer } from "../../components/Global/SpotifyPlayer.ts";
import PageView, { PageContainer } from "../../components/Pages/PageView.ts";
import { IsCompactMode } from "../../components/Utils/CompactMode.ts";
import Fullscreen from "../../components/Utils/Fullscreen.ts";
import { Query } from "../API/Query.ts";
import { SetWaitingForHeight } from "../Scrolling/ScrollToActiveLine.ts";
import storage from "../storage.ts";
import { ProcessLyrics } from "./ProcessLyrics.ts";

export const LyricsStore = GetExpireStore<any>("SpicyLyrics_LyricsStore", 12, {
  Unit: "Days",
  Duration: 3,
}, isDev as true);

export default async function fetchLyrics(uri: string): Promise<[object | string, number] | null> {
  const IsSpicyRenderer = Defaults.LyricsRenderer === "Spicy";

  //if (!PageContainer) return;
  const LyricsContent =
    PageContainer?.querySelector(".LyricsContainer .LyricsContent") ?? undefined;
  if (LyricsContent?.classList.contains("offline")) {
    LyricsContent.classList.remove("offline");
  }

  //if (!Fullscreen.IsOpen) PageView.AppendViewControls(true);

  if (SpotifyPlayer.IsDJ()) {
    storage.set("currentlyFetching", "false");
    return ["dj", 400];
  }

  const mediaType = SpotifyPlayer.GetMediaType();

  if (
    mediaType &&
    mediaType !== "audio"
  ) {
    storage.set("currentlyFetching", "false");
    if (mediaType === "video") {
      return ["video-track", 400];
    } else if (mediaType === "mixed") {
      return ["mixed-track", 400];
    }
    return ["unknown-track", 400];
  }

  const contentType = SpotifyPlayer.GetContentType();
  if (contentType !== "track") {
    storage.set("currentlyFetching", "false");
    if (contentType === "episode") {
      return ["episode-track", 400];
    }
    return ["unknown-track", 400];
  }

  const currFetching = storage.get("currentlyFetching");
  if (currFetching === "true") {
    storage.set("currentlyFetching", "false");
    return null;
  }

  storage.set("currentlyFetching", "true");

  if (LyricsContent) {
    LyricsContent.classList.add("HiddenTransitioned");
  }

  const trackId = uri.split(":")[2];

  // Check if there's already data in localStorage
  const savedLyricsData = storage.get("currentLyricsData")?.toString();

  if (savedLyricsData && !isDev) {
    try {
      if (savedLyricsData.includes("NO_LYRICS")) {
        const split = savedLyricsData.split(":");
        const id = split[1];
        if (id === trackId) {
          storage.set("currentlyFetching", "false");
          return ["lyrics-not-found", 404];
        }
      } else {
        const lyricsData = JSON.parse(savedLyricsData);
        // Return the stored lyrics if the ID matches the track ID
        if (lyricsData?.id === trackId) {
          if (lyricsData?.IncludesRomanization) {
            PageContainer?.classList.add("Lyrics_RomanizationAvailable");
          } else {
            PageContainer?.classList.remove("Lyrics_RomanizationAvailable");
          }

          storage.set("currentlyFetching", "false");
          HideLoaderContainer();
          Defaults.CurrentLyricsType = lyricsData.Type;
          PageContainer?.querySelector<HTMLElement>(".ContentBox")?.classList.remove("LyricsHidden");
          PageContainer?.querySelector(".ContentBox .LyricsContainer")?.classList.remove("Hidden");
          PageView.AppendViewControls(true);
          storage.set("currentlyFetching", "false");
          return [lyricsData, 200];
        }
      }
    } catch (error) {
      console.error("Error parsing saved lyrics data:", error);
      storage.set("currentlyFetching", "false");
      HideLoaderContainer();
    }
  }

  if (LyricsStore) {
    try {
      const lyricsFromCacheRes = await LyricsStore.GetItem(trackId);
      if (lyricsFromCacheRes) {
        if (lyricsFromCacheRes?.Value === "NO_LYRICS") {
          storage.set("currentlyFetching", "false");
          return ["lyrics-not-found", 404];
        }
        const lyricsFromCache = lyricsFromCacheRes ?? {};

        if (lyricsFromCache?.IncludesRomanization) {
          PageContainer?.classList.add("Lyrics_RomanizationAvailable");
        } else {
          PageContainer?.classList.remove("Lyrics_RomanizationAvailable");
        }

        storage.set("currentLyricsData", JSON.stringify(lyricsFromCache));
        storage.set("currentlyFetching", "false");
        Defaults.CurrentLyricsType = lyricsFromCache.Type;
        PageContainer?.querySelector<HTMLElement>(".ContentBox")?.classList.remove("LyricsHidden");
        PageContainer?.querySelector(".ContentBox .LyricsContainer")?.classList.remove("Hidden");
        PageView.AppendViewControls(true);
        storage.set("currentlyFetching", "false");
        return [{ ...lyricsFromCache, fromCache: true }, 200];
      }
    } catch (error) {
      console.error("Error parsing saved lyrics data:", error);
      storage.set("currentlyFetching", "false");
      return ["unknown-error", 0];
    }
  }

  SetWaitingForHeight(false);

  if (!navigator.onLine) {
    storage.set("currentlyFetching", "false");
    return ["offline", 400];
  }

  ShowLoaderContainer();

  // Fetch new lyrics if no match in localStorage
  /* const lyricsApi = storage.get("customLyricsApi") ?? Defaults.LyricsContent.api.url;
    const lyricsAccessToken = storage.get("lyricsApiAccessToken") ?? Defaults.LyricsContent.api.accessToken; */

  try {
    const Token = await Platform.GetSpotifyAccessToken();

    let lyricsText = "";
    let status = 0;

    const queries = await Query(
      [
        {
          operation: "lyrics",
          variables: {
            id: trackId,
            auth: "SpicyLyrics-WebAuth",
          },
        },
      ],
      {
        "SpicyLyrics-WebAuth": `Bearer ${Token}`,
      }
    );

    const lyricsQuery = queries.get("0");
    if (!lyricsQuery) {
      console.error("[Spicy Lyrics] Lyrics query not found");
      HideLoaderContainer();
      storage.set("currentlyFetching", "false");
      return ["lyrics-not-found", 404];
    }

    status = lyricsQuery.httpStatus;

    if (lyricsQuery.format !== "json") {
      lyricsText = "";
    }

    lyricsText = JSON.stringify(lyricsQuery.data);

    if (status !== 200) {
      if (status === 404) {
        HideLoaderContainer();
        storage.set("currentlyFetching", "false");
        return ["lyrics-not-found", 404];
      }
      HideLoaderContainer();
      storage.set("currentlyFetching", "false");
      return ["status-not-200", status];
    }

    if (lyricsText === null) {
      HideLoaderContainer();
      storage.set("currentlyFetching", "false");
      return ["lyrics-not-found", 404];
    }
    if (lyricsText === "") {
      HideLoaderContainer();
      storage.set("currentlyFetching", "false");
      return ["lyrics-not-found", 404];
    }

    // const providerLyrics = JSON.parse(lyricsText);
    const lyrics = JSON.parse(lyricsText);

    IsSpicyRenderer ? await ProcessLyrics(lyrics) : null;

    storage.set("currentLyricsData", JSON.stringify(lyrics));
    storage.set("currentlyFetching", "false");

    HideLoaderContainer();

    if (LyricsStore) {
      try {
        await LyricsStore.SetItem(trackId, lyrics);
      } catch (error) {
        console.error("Error saving lyrics to cache:", error);
      }
    }

    Defaults.CurrentLyricsType = lyrics.Type;
    PageContainer?.querySelector<HTMLElement>(".ContentBox")?.classList.remove("LyricsHidden");
    PageContainer?.querySelector(".ContentBox .LyricsContainer")?.classList.remove("Hidden");
    PageView.AppendViewControls(true);
    HideLoaderContainer();
    storage.set("currentlyFetching", "false");
    return [{ ...lyrics, fromCache: false }, 200];
  } catch (error) {
    console.error("Error fetching lyrics:", error);
    storage.set("currentlyFetching", "false");
    HideLoaderContainer();
    return ["unknown-error", 0];
  }
}

async function noLyricsMessage(Cache = true, LocalStorage = true) {
  /* const totalTime = Spicetify.Player.getDuration() / 1000;
    const segmentDuration = totalTime / 3;

    const noLyricsMessage = {
        "Type": "Syllable",
        "alternative_api": false,
        "Content": [
            {
                "Type": "Vocal",
                "OppositeAligned": false,
                "Lead": {
                    "Syllables": [
                        {
                            "Text": "We're working on the Lyrics...",
                            "StartTime": 0,
                            "EndTime": 10,
                            "IsPartOfWord": false
                        }
                    ],
                    "StartTime": 0,
                    "EndTime": 10
                }
            },
            {
                "Type": "Vocal",
                "OppositeAligned": false,
                "Lead": {
                    "Syllables": [
                        {
                            "Text": "♪",
                            "StartTime": 0,
                            "EndTime": segmentDuration,
                            "IsPartOfWord": true
                        },
                        {
                            "Text": "♪",
                            "StartTime": segmentDuration,
                            "EndTime": 2 * segmentDuration,
                            "IsPartOfWord": true
                        },
                        {
                            "Text": "♪",
                            "StartTime": 2 * segmentDuration,
                            "EndTime": totalTime,
                            "IsPartOfWord": false
                        }
                    ],
                    "StartTime": 0,
                    "EndTime": totalTime
                }
            }
        ]
    }; */

  /* const noLyricsMessage = {
        Type: "Static",
        alternative_api: false,
        offline: false,
        id: Spicetify.Player.data.item.uri.split(":")[2],
        styles: {
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
            "flex-direction": "column"
        },
        Lines: [
            {
                Text: "No Lyrics Found"
            }
        ]
    } */

  SetWaitingForHeight(false);
  const trackId = SpotifyPlayer.GetId() ?? "";

  if (LocalStorage) {
    storage.set("currentLyricsData", `NO_LYRICS:${trackId}`);
  }

  if (LyricsStore && Cache && trackId) {
    //const expiresAt = new Date().getTime() + 1000 * 60 * 60 * 24 * 7; // Expire after 7 days

    try {
      await LyricsStore.SetItem(trackId, { Value: "NO_LYRICS" });
    } catch (error) {
      console.error("Error saving lyrics to cache:", error);
    }
  }

  storage.set("currentlyFetching", "false");

  HideLoaderContainer();

  Defaults.CurrentLyricsType = "Static";

  if (!IsCompactMode() && (Fullscreen.IsOpen || Fullscreen.CinemaViewOpen)) {
    PageContainer?.querySelector<HTMLElement>(".ContentBox .LyricsContainer")?.classList.add("Hidden");
    PageContainer?.querySelector<HTMLElement>(".ContentBox")?.classList.add("LyricsHidden");
  }

  ClearLyricsPageContainer();
  PageView.AppendViewControls(true);

  return {
    Type: "Static",
    id: SpotifyPlayer.GetId() ?? "",
    noLyrics: true,
    Lines: [
      {
        Text: "No Lyrics Found",
      },
    ],
  };
}

function urOfflineMessage() {
  const Message = {
    Type: "Static",
    offline: true,
    Lines: [
      {
        Text: "You're offline",
      },
      {
        Text: "This extension works only if you're online.",
      },
    ],
  };

  SetWaitingForHeight(false);

  storage.set("currentlyFetching", "false");

  HideLoaderContainer();

  ClearLyricsPageContainer();

  Defaults.CurrentLyricsType = Message.Type;

  /* if (storage.get("IsNowBarOpen")) {
        PageContainer?.querySelector(".ContentBox .LyricsContainer").classList.add("Hidden");
    } */
  PageView.AppendViewControls(true);
  return Message;
}

function DJMessage() {
  const Message = {
    Type: "Static",
    Lines: [
      {
        Text: "DJ Mode is On",
      },
      {
        Text: "If you want to load lyrics, please select a Song.",
      },
    ],
  };

  SetWaitingForHeight(false);

  storage.set("currentlyFetching", "false");

  HideLoaderContainer();

  ClearLyricsPageContainer();

  Defaults.CurrentLyricsType = Message.Type;
  PageView.AppendViewControls(true);
  return Message;
}

function NotTrackMessage() {
  const Message = {
    Type: "Static",
    Lines: [
      {
        Text: "[DEF=font_size:small]You're playing an unsupported Content Type",
      },
    ],
  };

  SetWaitingForHeight(false);

  storage.set("currentlyFetching", "false");

  HideLoaderContainer();

  ClearLyricsPageContainer();
  // CloseNowBar()

  Defaults.CurrentLyricsType = Message.Type;
  PageView.AppendViewControls(true);
  return Message;
}

let ContainerShowLoaderTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Show the loader container after a delay
 */
function ShowLoaderContainer(): void {
  const loaderContainer = PageContainer?.querySelector<HTMLElement>(
    ".LyricsContainer .loaderContainer"
  );
  if (loaderContainer) {
    ContainerShowLoaderTimeout = setTimeout(() => {
      loaderContainer.classList.add("active");
    }, 2000);
  }
}

/**
 * Hide the loader container and clear any pending timeout
 */
function HideLoaderContainer(): void {
  const loaderContainer = PageContainer?.querySelector<HTMLElement>(
    ".LyricsContainer .loaderContainer"
  );
  if (loaderContainer) {
    if (ContainerShowLoaderTimeout) {
      clearTimeout(ContainerShowLoaderTimeout);
      ContainerShowLoaderTimeout = null;
    }
    loaderContainer.classList.remove("active");
  }
}

/**
 * Clear the lyrics container content
 */
export function ClearLyricsPageContainer(): void {
  const lyricsContent = PageContainer?.querySelector<HTMLElement>(
    ".LyricsContainer .LyricsContent"
  );
  if (lyricsContent) {
    lyricsContent.innerHTML = "";
  }
}
