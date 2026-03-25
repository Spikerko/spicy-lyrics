import { Timeout } from "@spikerko/web-modules/Scheduler";
import { Signal } from "@spikerko/web-modules/Signal";
import Defaults from "../Global/Defaults.ts";
import Global from "../Global/Global.ts";
import { SpotifyPlayer } from "../Global/SpotifyPlayer.ts";
import ArtistVisuals from "./ArtistVisuals/Main.ts";
import { PageContainer } from "../Pages/PageView.ts";
import Kawarp, { type KawarpOptions } from "@kawarp/core";
import { BackgroundAnimationController, type AudioAnalysisData } from "./BackgroundAnimationController.ts";
import { getDynamicAudioAnalysis } from "../../utils/audioAnalysis.ts";

export const KawarpOptionsStatic: KawarpOptions = {
  warpIntensity: 1,
  blurPasses: 8,
  animationSpeed: 0.1,
  saturation: 1.5,
  dithering: 0.008,
  transitionDuration: 1000,
  // tintColor: [0.16, 0.16, 0.24],
  tintIntensity: 0, // 0.15
  scale: 1,
}

const COLOR_BG_FALLBACK_RGB = "18, 18, 18, 1";
let cachedColorBackgroundEl: HTMLElement | null = null;

export const KawarpMap = new Map<HTMLElement | string, Kawarp>();
const animSpeedController = new BackgroundAnimationController();

export default async function ApplyDynamicBackground(element: HTMLElement, tag?: string) {
  if (!element) return;
  const preCurrentImgCover = SpotifyPlayer.GetCover("large") ?? "";
  const currentImgCover = preCurrentImgCover?.replace("spotify:image:", "https://i.scdn.co/image/");
  const IsEpisode = SpotifyPlayer.GetContentType() === "episode";

  const artists = SpotifyPlayer.GetArtists() ?? [];
  const TrackArtist =
    artists.length > 0 && artists[0]?.uri
      ? artists[0].uri.replace("spotify:artist:", "")
      : undefined;

  const TrackId = SpotifyPlayer.GetId() ?? undefined;
  
  if (Defaults.StaticBackground) {
    if (Defaults.StaticBackgroundType === "Color") {
      // First, create/init the background with black as a fallback
      let dynamicBg = element.querySelector<HTMLElement>(".spicy-dynamic-bg.ColorBackground");
      if (!dynamicBg) {
        dynamicBg = document.createElement("div");
        dynamicBg.classList.add("spicy-dynamic-bg", "ColorBackground");
        // Set initial fallback colors to black
        dynamicBg.style.setProperty("--MinContrastColor", COLOR_BG_FALLBACK_RGB);
        dynamicBg.style.setProperty("--HighContrastColor", COLOR_BG_FALLBACK_RGB);
        dynamicBg.style.setProperty("--OverlayColor", COLOR_BG_FALLBACK_RGB);
        element.appendChild(dynamicBg);
      }
      cachedColorBackgroundEl = dynamicBg;

      // Now fetch the real colors and apply them
      try {
        const colorQuery = await Spicetify.GraphQL.Request(
          Spicetify.GraphQL.Definitions.getDynamicColorsByUris,
          {
            imageUris: [SpotifyPlayer.GetCover("large") ?? ""]
          }
        );

        const colorResponse = colorQuery.data.dynamicColors[0];
        const colorBestFit = colorResponse.bestFit === "DARK" ? "dark" : colorResponse.bestFit === "LIGHT" ? "light" : "dark";

        const colors = colorResponse[colorBestFit];
        const fromColorObj = colors.minContrast;
        const toColorObj = colors.highContrast;
        const overlayColorObj = colors.higherContrast;

        const fromColorBgObj = fromColorObj.backgroundBase;
        const toColorBgObj = toColorObj.backgroundBase;
        const overlayColorBgObj = overlayColorObj.backgroundBase;

        const fromColor = `${fromColorBgObj.red}, ${fromColorBgObj.green}, ${fromColorBgObj.blue}, ${fromColorBgObj.alpha}`;
        const toColor = `${toColorBgObj.red}, ${toColorBgObj.green}, ${toColorBgObj.blue}, ${toColorBgObj.alpha}`;
        const overlayColor = `${overlayColorBgObj.red}, ${overlayColorBgObj.green}, ${overlayColorBgObj.blue}, ${overlayColorBgObj.alpha}`;

        dynamicBg.style.setProperty("--MinContrastColor", fromColor);
        dynamicBg.style.setProperty("--HighContrastColor", toColor);
        dynamicBg.style.setProperty("--OverlayColor", overlayColor);
      } catch (err) {
        // If the color fetch fails, just keep the black fallback
        console.error("Failed to fetch dynamic colors, using fallback black background.", err);
      }
      return;
    }
    const currentImgCover = await GetStaticBackground(TrackArtist, TrackId);

    if (IsEpisode || !currentImgCover) return;
    const prevBg = element.querySelector<HTMLElement>(".spicy-dynamic-bg.StaticBackground");

    if (prevBg && prevBg.getAttribute("data-cover-id") === currentImgCover) {
      return;
    }
    const dynamicBg = document.createElement("div");

    dynamicBg.classList.add("spicy-dynamic-bg", "StaticBackground", "Hidden");

    //const processedCover = `https://i.scdn.co/image/${currentImgCover.replace("spotify:image:", "")}`;

    dynamicBg.style.backgroundImage = `url("${currentImgCover}")`;
    dynamicBg.setAttribute("data-cover-id", currentImgCover);
    element.appendChild(dynamicBg);

    Timeout(0.08, () => {
      if (prevBg) {
        prevBg.classList.add("Hidden");
        Timeout(0.5, () => prevBg?.remove());
      }
      dynamicBg.classList.remove("Hidden");
    });
  } else {
    const existingElement = element.querySelector<HTMLElement>(".spicy-dynamic-bg");
  
    if (existingElement) {
      const existingBgData = existingElement.getAttribute("data-cover-id") ?? null;

      if (existingBgData === currentImgCover) {
        return;
      }
      const kawarpInstance = KawarpMap.get(
        tag ?
          tag :
          existingElement
      )

      if (kawarpInstance) {
        existingElement.setAttribute("data-cover-id", currentImgCover ?? "");
        await kawarpInstance.loadImage(currentImgCover);
        kawarpInstance.start();
        return;
      }
    }

    const canvas = document.createElement("canvas");
    canvas.classList.add("spicy-dynamic-bg");
    canvas.setAttribute("data-cover-id", currentImgCover ?? "");

    const kawarpInstance = new Kawarp(canvas, KawarpOptionsStatic)
    KawarpMap.set(
      tag ?
        tag :
        canvas,
      kawarpInstance
    )
    element.appendChild(canvas);
    await kawarpInstance.loadImage(currentImgCover);
    kawarpInstance.start();
  }
}

export async function GetStaticBackground(
  TrackArtist: string | undefined,
  TrackId: string | undefined
): Promise<string | undefined> {
  if (!TrackArtist || !TrackId) return undefined;

  try {
    return await ArtistVisuals.ApplyContent(TrackArtist, TrackId);
  } catch (error) {
    console.error(
      "Error happened while trying to set the Low Quality Mode Dynamic Background",
      error
    );
    return undefined;
  }
}

let staticColorBgTransitionTimeout = null;

const getColorBackgroundElement = (): HTMLElement | null => {
  if (cachedColorBackgroundEl?.isConnected) {
    return cachedColorBackgroundEl;
  }
  const el = PageContainer?.querySelector<HTMLElement>(".spicy-dynamic-bg.ColorBackground") ?? null;
  cachedColorBackgroundEl = el;
  return el;
};

Global.Event.listen("playback:songchange", () => {
  if (Defaults.StaticBackground && Defaults.StaticBackgroundType === "Color" && PageContainer) {
    if (staticColorBgTransitionTimeout) {
      clearTimeout(staticColorBgTransitionTimeout);
      staticColorBgTransitionTimeout = null;

      const dynamicBg = getColorBackgroundElement();
      if (dynamicBg) {
        const min = dynamicBg.style.getPropertyValue("--MinContrastColor").trim();
        const high = dynamicBg.style.getPropertyValue("--HighContrastColor").trim();
        const overlay = dynamicBg.style.getPropertyValue("--OverlayColor").trim();
        if (
          min !== COLOR_BG_FALLBACK_RGB ||
          high !== COLOR_BG_FALLBACK_RGB ||
          overlay !== COLOR_BG_FALLBACK_RGB
        ) {
          dynamicBg.style.setProperty("--MinContrastColor", COLOR_BG_FALLBACK_RGB);
          dynamicBg.style.setProperty("--HighContrastColor", COLOR_BG_FALLBACK_RGB);
          dynamicBg.style.setProperty("--OverlayColor", COLOR_BG_FALLBACK_RGB);
        }
      }
    }

    staticColorBgTransitionTimeout = setTimeout(() => {
      const contentBox = PageContainer.querySelector<HTMLElement>(".ContentBox");
      if (contentBox) ApplyDynamicBackground(contentBox);

      clearTimeout(staticColorBgTransitionTimeout);
      staticColorBgTransitionTimeout = null;
    }, 1000);
  }
})

const audioAnalysisCache = new Map<string, AudioAnalysisData>();
const audioAnalysisInflightRequests = new Map<string, Promise<AudioAnalysisData | null>>();
let latestPlaybackTrackId: string | null = null;

const pruneAudioAnalysisCache = (activeTrackId: string) => {
  for (const cachedTrackId of audioAnalysisCache.keys()) {
    if (cachedTrackId !== activeTrackId) {
      audioAnalysisCache.delete(cachedTrackId);
    }
  }
};

const getAudioAnalysisForTrack = async (trackId: string): Promise<AudioAnalysisData | null> => {
  const cached = audioAnalysisCache.get(trackId);
  if (cached) {
    return cached;
  }

  const inflight = audioAnalysisInflightRequests.get(trackId);
  if (inflight) {
    return inflight;
  }

  const request = getDynamicAudioAnalysis(trackId)
    .then((analysis) => {
      if (analysis) {
        audioAnalysisCache.set(trackId, analysis);
      }
      return analysis;
    })
    .finally(() => {
      audioAnalysisInflightRequests.delete(trackId);
    });

  audioAnalysisInflightRequests.set(trackId, request);
  return request;
};

const setDynamicBackgroundAnimationSpeed = (speed: number) => {
  KawarpMap.forEach((kawarpInstance) => {
    void kawarpInstance.setOptions({
      animationSpeed: speed
    })
  })
};

const resetDynamicBackgroundAnimationSpeed = () => {
  setDynamicBackgroundAnimationSpeed(1);
};

Global.Event.listen("playback:songchange", () => {
  latestPlaybackTrackId = SpotifyPlayer.GetId();

  if (latestPlaybackTrackId) {
    pruneAudioAnalysisCache(latestPlaybackTrackId);
  } else {
    audioAnalysisCache.clear();
  }
});

const applyPlayPauseAnimationSpeed = (isPaused: boolean) => {
  setDynamicBackgroundAnimationSpeed(isPaused ? 0.1 : 1);
};

Global.Event.listen("playback:playpause", (e: { data?: { isPaused?: boolean } }) => {
  applyPlayPauseAnimationSpeed(!!e?.data?.isPaused);
});

Global.Event.listen("playback:progress", async (e) => {
  const songId = SpotifyPlayer.GetId();
  if (!songId) {
    resetDynamicBackgroundAnimationSpeed();
    return;
  }

  latestPlaybackTrackId = songId;
  const requestTrackId = songId;

  const audioAnalysisData = await getAudioAnalysisForTrack(requestTrackId);
  if (!audioAnalysisData) {
    resetDynamicBackgroundAnimationSpeed();
    return;
  }

  // Prevent stale async results from old tracks applying after rapid song switches.
  const currentTrackId = SpotifyPlayer.GetId();
  if (!currentTrackId || currentTrackId !== requestTrackId || latestPlaybackTrackId !== requestTrackId) {
    return;
  }

  pruneAudioAnalysisCache(requestTrackId);

  const currentTimeMs = SpotifyPlayer.GetPosition();
  const currentTime = currentTimeMs / 1000;

  const speedMultiplier = animSpeedController.getSpeedMultiplier(currentTime, audioAnalysisData);

  KawarpMap.forEach((kawarpInstance) => {
    void kawarpInstance.setOptions({
      animationSpeed: speedMultiplier
    })
  })
})