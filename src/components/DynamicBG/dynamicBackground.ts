import { Timeout } from "@socali/modules/Scheduler";
import { Signal } from "@socali/modules/Signal";
import { Spicetify } from "@spicetify/bundler";
import {
  //type CoverArtCache,
  DynamicBackground,
  type DynamicBackgroundOptions,
} from "@spikerko/tools/DynamicBackground";
import Defaults from "../Global/Defaults.ts";
import Global from "../Global/Global.ts";
//import Platform from "../Global/Platform.ts";
import { SpotifyPlayer } from "../Global/SpotifyPlayer.ts";
import ArtistVisuals from "./ArtistVisuals/Main.ts";
import { PageContainer } from "../Pages/PageView.ts";

const SongChangeSignal = new Signal();

export const DynamicBackgroundConfig: DynamicBackgroundOptions = {
  transition: Defaults.PrefersReducedMotion ? 0 : 1.5,
  blur: 45,
  speed: 0.25,
  /* plugins: [
    TempoPlugin({
      SongChangeSignal,
      getSongId: () => SpotifyPlayer.GetId() ?? "",
      getPaused: () => !SpotifyPlayer.IsPlaying,
      getSongPosition: () => (SpotifyPlayer.GetPosition() ?? 1000) / 1000 - 505,
      getAccessToken: async () => {
        const token = await Platform.GetSpotifyAccessToken();
        return `Bearer ${token}`;
      },
      minSpeed: 0.25,
      maxSpeed: 1.85,
    }),
  ], */
  cacheLimit: 5,
};
// Store the DynamicBackground instance and element for reuse
export let currentBgInstance: DynamicBackground | null = null;

// Add a document visibilitychange event to refocus the dynamic background when the tab regains focus
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && currentBgInstance) {
    // Optionally, you could re-apply the current image or update the background
    currentBgInstance.Update({
      image: SpotifyPlayer.GetCover("large") ?? "",
    });
  }
});

export const SetPageBGBlur = async (blur: number) => {
  if (currentBgInstance) {
    await currentBgInstance.Update({
      blur,
    });
  }
};

const prefetchCovers = async () => {
  if (currentBgInstance) {
    for (let i = 0; i <= 1; i++) {
      const nextSongCovers = Spicetify?.Player?.data?.nextItems?.[i]?.images;
      if (!nextSongCovers) return;
      const largeCover = SpotifyPlayer.GetCoverFrom("large", nextSongCovers);
      if (!largeCover) return;
      if (largeCover === "https://images.spikerko.org/SongPlaceholderFull.png") return;
      await currentBgInstance.PrefetchImage(largeCover);
    }
  }
};

Global.Event.listen("playback:songchange", async () => {
  //setTimeout(() => SongChangeSignal.Fire(), 1000)
  SongChangeSignal.Fire();

  await prefetchCovers();

  setTimeout(() => {
    if (currentBgInstance && SpotifyPlayer.GetCover("large")) {
      currentBgInstance.Update({
        image: SpotifyPlayer.GetCover("large") ?? "",
      });
    }
  }, 2250);
});

export const CleanupDynamicBGLets = () => {
  if (currentBgInstance) {
    currentBgInstance.Destroy();
    currentBgInstance = null;
  }
};

Global.Event.listen("compact-mode:enable", () => {
  // console.log("CompactMode: Enabled")
  if (currentBgInstance) {
    currentBgInstance.Update({
      blur: 70,
    });
  }
});

Global.Event.listen("compact-mode:disable", () => {
  // console.log("CompactMode: Disabled")
  if (currentBgInstance) {
    currentBgInstance.Update({
      blur: DynamicBackgroundConfig.blur,
    });
  }
});

function intToHexColor(colorInt: number): string {
  // Convert to unsigned 32-bit integer
  const uint = colorInt >>> 0;

  // Extract RGB (ignore alpha)
  const r = (uint >> 16) & 0xff;
  const g = (uint >> 8) & 0xff;
  const b = uint & 0xff;

  // Format as hex
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export default async function ApplyDynamicBackground(element: HTMLElement) {
  if (!element) return;
  const currentImgCover = SpotifyPlayer.GetCover("large") ?? "";
  const IsEpisode = SpotifyPlayer.GetContentType() === "episode";

  const artists = SpotifyPlayer.GetArtists() ?? [];
  const TrackArtist =
    artists.length > 0 && artists[0]?.uri
      ? artists[0].uri.replace("spotify:artist:", "")
      : undefined;

  const TrackId = SpotifyPlayer.GetId() ?? undefined;

  // TODO: Finish
  /* if (Defaults.CanvasBackground && isSpicySidebarMode) { // Canvas Mode
        try {
            const response = await Spicetify.GraphQL.Request(
                Spicetify.GraphQL.Definitions.canvas,
                {
                    uri: `spotify:track:${TrackId}`
                }
            )

            if (!response.errors) {
                const canvasObject = response?.data?.trackUnion?.canvas;
                if (canvasObject && canvasObject != null) {
                    const canvasUrl = canvasObject?.url;
                    if (canvasUrl) {
                        const prevBg = element.querySelector<HTMLElement>(".spicy-dynamic-bg.CanvasBackground");

                        const processVideo = async (img: HTMLImageElement, canvasUrl: string) => {
                            try {
                                // Fetch the video file
                                const response = await fetch(canvasUrl);
                                if (!response.ok) throw new Error(`Failed to fetch video: ${response.status}`);

                                const arrayBuffer = await response.arrayBuffer();
                                const videoBlob = new Blob([arrayBuffer], { type: "video/mp4" });
                                const videoUrl = URL.createObjectURL(videoBlob);

                                // Create temporary video to extract frames
                                const tempVideo = document.createElement("video");
                                tempVideo.src = videoUrl;
                                tempVideo.muted = true;
                                tempVideo.playsInline = true;
                                tempVideo.autoplay = false;
                                tempVideo.crossOrigin = "anonymous";

                                await new Promise<void>(resolve => {
                                    tempVideo.addEventListener("loadeddata", () => resolve(), { once: true });
                                });

                                // Prepare GIF
                                const gif = new GIF({
                                    workers: 2,
                                    quality: 10,
                                    width: tempVideo.videoWidth,
                                    height: tempVideo.videoHeight
                                });

                                const canvas = document.createElement("canvas");
                                canvas.width = tempVideo.videoWidth;
                                canvas.height = tempVideo.videoHeight;
                                const ctx = canvas.getContext("2d");

                                // Capture frames every 100ms
                                const duration = tempVideo.duration;
                                for (let t = 0; t < duration; t += 0.1) {
                                    tempVideo.currentTime = t;
                                    await new Promise(r => tempVideo.addEventListener("seeked", r, { once: true }));
                                    ctx?.drawImage(tempVideo, 0, 0, canvas.width, canvas.height);
                                    gif.addFrame(ctx!, { copy: true, delay: 100 });
                                }

                                // Render GIF to blob
                                const gifBlob: Blob = await new Promise(resolve => {
                                    gif.on("finished", (blob: Blob) => resolve(blob));
                                    gif.render();
                                });

                                const gifBlobUrl = URL.createObjectURL(gifBlob);

                                // Set the image source to the GIF blob
                                img.src = gifBlobUrl;
                            } catch (err) {
                                console.error("Error in processVideo:", err);
                            }
                        };

                        if (prevBg) {
                            const prevBgImg = prevBg.querySelector<HTMLImageElement>("img");
                            if (prevBgImg) {
                                await processVideo(prevBgImg, canvasUrl);
                            } else {
                                prevBg.innerHTML = `<img />`;
                                await processVideo(prevBg.querySelector<HTMLImageElement>("img"), canvasUrl);
                            }
                        } else {
                            const bgContainer = document.createElement("div");
                            bgContainer.classList.add("spicy-dynamic-bg", "CanvasBackground");

                            bgContainer.innerHTML = `<img />`;

                            await processVideo(bgContainer.querySelector<HTMLImageElement>("img"), canvasUrl);

                            element.appendChild(bgContainer);
                        }


                    }
                }
                
            } else {
                throw new Error(`Failed to fetch canvas: ${status}`);
            }
        } catch (error) {
            console.error("Error while getting canvas video", error)
        }
    } else  */ if (Defaults.StaticBackground) {
    if (Defaults.StaticBackgroundType === "Color") {
      // First, create/init the background with black as a fallback
      let dynamicBg = element.querySelector<HTMLElement>(".spicy-dynamic-bg.ColorBackground");
      if (!dynamicBg) {
        dynamicBg = document.createElement("div");
        dynamicBg.classList.add("spicy-dynamic-bg", "ColorBackground");
        // Set initial fallback colors to black
        dynamicBg.style.setProperty("--MinContrastColor", "18, 18, 18, 1");
        dynamicBg.style.setProperty("--HighContrastColor", "18, 18, 18, 1");
        dynamicBg.style.setProperty("--OverlayColor", "18, 18, 18, 1");
        element.appendChild(dynamicBg);
      }

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
    // Get existing DynamicBackground instance if it exists
    const existingBgData = existingElement?.getAttribute("data-cover-id") ?? null;

    // If same song, do nothing
    if (existingBgData === currentImgCover) {
      return;
    }

    // Check if we already have a DynamicBackground instance
    if (existingElement && currentBgInstance) {
      // If we have an instance, just update it with the new image
      const processedCover = currentImgCover;

      // Update the data-cover-id attribute
      existingElement.setAttribute("data-cover-id", currentImgCover ?? "");

      // Update with the current image
      await currentBgInstance.Update({
        image: processedCover ?? "",
      });

      return;
    }

    if (currentBgInstance) {
      // Get the canvas element
      const container = currentBgInstance.GetCanvasElement();

      // Add the spicy-dynamic-bg class
      container.classList.add("spicy-dynamic-bg");

      // Set the data-cover-id attribute to match the existing code
      container.setAttribute("data-cover-id", currentImgCover ?? "");

      // Apply the background to the element
      currentBgInstance.AppendToElement(element);

      // Update with the current image
      await currentBgInstance.Update({
        image: currentImgCover ?? "",
      });

      await prefetchCovers();

      return;
    }

    // Create new DynamicBackground instance
    currentBgInstance = new DynamicBackground(DynamicBackgroundConfig);

    // Get the canvas element
    const container = currentBgInstance.GetCanvasElement();

    // Add the spicy-dynamic-bg class
    container.classList.add("spicy-dynamic-bg");

    // Set the data-cover-id attribute to match the existing code
    container.setAttribute("data-cover-id", currentImgCover ?? "");

    // Apply the background to the element
    currentBgInstance.AppendToElement(element);

    // Update with the current image
    await currentBgInstance.Update({
      image: currentImgCover ?? "",
    });

    await prefetchCovers();
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

/* const GetCoverArtURL = (): string | null => {
    const images = Spicetify.Player.data?.item?.album?.images;
    if (!images || images.length === 0) return null;

    for (const image of images) {
      const url = image.url;
      if (url) return url;
    }
    return null;
};

const BlurredCoverArts = new Map<string, OffscreenCanvas>();
export async function GetBlurredCoverArt() {
    const coverArt = GetCoverArtURL();

    if (BlurredCoverArts.has(coverArt)) {
        return BlurredCoverArts.get(coverArt);
    }

    const image = new Image();
    image.src = coverArt;
    await image.decode();

    const originalSize = Math.min(image.width, image.height); // Crop to a square
    const blurExtent = Math.ceil(3 * 40); // Blur spread extent

    // Create a square canvas to crop the image into a circle
    const circleCanvas = new OffscreenCanvas(originalSize, originalSize);
    const circleCtx = circleCanvas.getContext('2d')!;

    // Create circular clipping mask
    circleCtx.beginPath();
    circleCtx.arc(originalSize / 2, originalSize / 2, originalSize / 2, 0, Math.PI * 2);
    circleCtx.closePath();
    circleCtx.clip();

    // Draw the original image inside the circular clip
    circleCtx.drawImage(
        image,
        ((image.width - originalSize) / 2), ((image.height - originalSize) / 2),
        originalSize, originalSize,
        0, 0,
        originalSize, originalSize
    );

    // Expand canvas to accommodate blur effect
    const padding = (blurExtent * 1.5);
    const expandedSize = originalSize + padding;
    const blurredCanvas = new OffscreenCanvas(expandedSize, expandedSize);
    const blurredCtx = blurredCanvas.getContext('2d')!;

    blurredCtx.filter = `blur(${22}px)`;

    // Draw the cropped circular image in the center of the expanded canvas
    blurredCtx.drawImage(circleCanvas, (padding / 2), (padding / 2));

    BlurredCoverArts.set(coverArt, blurredCanvas);
    return blurredCanvas;
}

Global.Event.listen("playback:songchange", async () => {
    if (Defaults.LyricsContainerExists) return;
    setTimeout(async () => {
        await GetBlurredCoverArt();
    }, 500)
}) */

/* const prefetchBlurredCoverArt = async () =>{
    if (!Defaults.LyricsContainerExists) {
        await GetBlurredCoverArt();
    };
}

Platform.OnSpotifyReady
.then(() => {
    prefetchBlurredCoverArt();
}) */

let staticColorBgTransitionTimeout = null;

Global.Event.listen("playback:songchange", () => {
  if (Defaults.StaticBackground && Defaults.StaticBackgroundType === "Color" && PageContainer) {
    if (staticColorBgTransitionTimeout) {
      clearTimeout(staticColorBgTransitionTimeout);
      staticColorBgTransitionTimeout = null;

      const dynamicBg = PageContainer.querySelector<HTMLElement>(".spicy-dynamic-bg.ColorBackground");
      if (dynamicBg) {
        dynamicBg.classList.add("spicy-dynamic-bg", "ColorBackground");
        // Set initial fallback colors to black
        dynamicBg.style.setProperty("--MinContrastColor", "18, 18, 18, 1");
        dynamicBg.style.setProperty("--HighContrastColor", "18, 18, 18, 1");
        dynamicBg.style.setProperty("--OverlayColor", "18, 18, 18, 1");
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