import type Kawarp from "@kawarp/core";
import type { KawarpVideoOptions } from "@kawarp/core";
import { isExperimentEnabled } from "../../utils/experiments.ts";
import { onAnimationFrame } from "../../utils/AnimationFrameLoop.ts";
import Logger from "../../utils/Logger.ts";
import ApplyDynamicBackground, { KawarpMap } from "./dynamicBackground.ts";

const npvCanvasLogger = new Logger("NPV Canvas Background");

const NPV_KAWARP_KEY = "npvbg";
// The canvas Spotify itself plays in the NPV. Following that element (rather than playing our
// own copy) keeps the background on the exact frame shown above it, with no extra download.
const NPV_CANVAS_VIDEO = ".canvasVideoContainerNPV video";
const NPV_BACKGROUND_CANVAS = "aside.spicy-dynamic-bg-in-this canvas.spicy-dynamic-bg";
// Set by NPVLyrics.ts while its card fills the NPV.
const NPV_CARD_EXPANDED_CLASS = "SpicyLyrics_NPVCardExpanded";
// How often to look for the video while there is none.
const LOOKUP_INTERVAL_MS = 500;

const VIDEO_OPTIONS = {
  // Canvases are 9:16; keep that shape in the color map.
  sampleWidth: 72,
  sampleHeight: 128,
  // Same easing as the Canvas Stage backdrop (CanvasImmersive.ts), so fast cuts ease in
  // instead of flashing across the whole panel.
  smoothing: 100,
};

let video: HTMLVideoElement | null = null;
let lastLookup = -Infinity;
// The instance being driven by the video, and the options it was given.
let followedKawarp: Kawarp | null = null;
let followOptions: KawarpVideoOptions | null = null;
let followOptionsFor: HTMLVideoElement | null = null;
// An element Kawarp couldn't read; not retried until Spotify swaps it.
let failedVideo: HTMLVideoElement | null = null;

// `canvas` is private in Kawarp's types but is a plain field; the DOM lookup covers a rename.
function canvasOf(kawarp: Kawarp): HTMLCanvasElement | null {
  const canvas = (kawarp as unknown as { canvas?: unknown }).canvas;
  if (canvas instanceof HTMLCanvasElement) return canvas;
  return document.querySelector<HTMLCanvasElement>(NPV_BACKGROUND_CANVAS);
}

function findVideo(host: HTMLElement, timestamp: number): HTMLVideoElement | null {
  if (video?.isConnected && host.contains(video)) return video;
  video = null;
  if (timestamp - lastLookup < LOOKUP_INTERVAL_MS) return null;
  lastLookup = timestamp;
  video = host.querySelector<HTMLVideoElement>(NPV_CANVAS_VIDEO);
  return video;
}

// The last video frame stays in Kawarp until something replaces it, and a track with the same
// cover (or the experiment being turned off) won't reload it on its own.
function stopFollowing() {
  const kawarp = followedKawarp;
  followedKawarp = null;
  if (!kawarp || KawarpMap.get(NPV_KAWARP_KEY) !== kawarp) return;
  kawarp.unloadVideo();
  const canvas = canvasOf(kawarp);
  const host = canvas?.parentElement;
  if (!canvas || !host) return;
  canvas.removeAttribute("data-cover-id");
  void ApplyDynamicBackground(host, NPV_KAWARP_KEY);
}

function optionsFor(source: HTMLVideoElement): KawarpVideoOptions {
  if (followOptions && followOptionsFor === source) return followOptions;
  followOptionsFor = source;
  followOptions = {
    ...VIDEO_OPTIONS,
    onError: (err) => {
      npvCanvasLogger.warn("Canvas frame unreadable; keeping the cover", err);
      failedVideo = source;
      stopFollowing();
    },
  };
  return followOptions;
}

// Spotify leaves its NPV canvas playing in a minimized window, where nothing of it (or of the
// background that follows it) is drawn. Only a video paused here is resumed, so a pause of
// Spotify's own is left alone.
let pausedWhileHidden: HTMLVideoElement | null = null;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    const playing = document.querySelector<HTMLVideoElement>(NPV_CANVAS_VIDEO);
    if (!playing || playing.paused) return;
    playing.pause();
    pausedWhileHidden = playing;
    return;
  }
  const paused = pausedWhileHidden;
  pausedWhileHidden = null;
  // Music paused meanwhile (media keys): Spotify would have stopped the canvas too.
  if (paused?.isConnected && paused.paused && Spicetify.Player.isPlaying()) {
    paused.play().catch(() => undefined);
  }
});

onAnimationFrame((timestamp) => {
  const kawarp = KawarpMap.get(NPV_KAWARP_KEY);
  // While the lyrics card is expanded to full height the background shows the cover, and
  // follows the canvas again once it's collapsed.
  if (
    !kawarp ||
    !isExperimentEnabled("npvCanvasBackground") ||
    document.body.classList.contains(NPV_CARD_EXPANDED_CLASS)
  ) {
    if (followedKawarp) stopFollowing();
    return;
  }

  const host = canvasOf(kawarp)?.parentElement;
  const source = host ? findVideo(host, timestamp) : null;
  // No canvas for this track (or Spotify's canvas setting is off).
  if (!source || source === failedVideo) {
    if (followedKawarp) stopFollowing();
    return;
  }

  // Re-asserted every frame: a cover load (a song change) replaces the video, and loadVideo
  // with the element Kawarp already follows only compares options, so it costs nothing.
  try {
    kawarp.loadVideo(source, optionsFor(source));
  } catch (err) {
    npvCanvasLogger.warn("Kawarp can't follow the canvas", err);
    failedVideo = source;
    return;
  }
  followedKawarp = kawarp;
});
