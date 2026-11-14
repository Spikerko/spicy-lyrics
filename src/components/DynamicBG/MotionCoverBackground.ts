import type Kawarp from "@kawarp/core";
import type { KawarpVideoOptions } from "@kawarp/core";
import { isExperimentEnabled } from "../../utils/experiments.ts";
import { onAnimationFrame } from "../../utils/AnimationFrameLoop.ts";
import Logger from "../../utils/Logger.ts";
import { PageContainer } from "../Pages/PageView.ts";
import ApplyDynamicBackground, { KawarpMap, PAGE_BACKGROUND_KEY } from "./dynamicBackground.ts";

const motionBgLogger = new Logger("Motion Cover Background");

// The page background follows the motion cover playing on the NowBar (AnimatedArtwork.ts), the
// element already on screen, so it shows the exact frame above it and downloads nothing extra.
// While the Canvas Stage holds the artwork, its own backdrop does this and Kawarp is suspended.
const COVER_VIDEO = ".NowBar video.AnimatedArtwork.Visible";
// How often to look for the video while there is none.
const LOOKUP_INTERVAL_MS = 500;

const VIDEO_OPTIONS = {
  // Covers are square; keep that shape in the color map.
  sampleWidth: 64,
  sampleHeight: 64,
  smoothing: 100,
};

let video: HTMLVideoElement | null = null;
let lastLookup = -Infinity;
let followedKawarp: Kawarp | null = null;
let followOptions: KawarpVideoOptions | null = null;
let followOptionsFor: HTMLVideoElement | null = null;
// An element Kawarp couldn't read; not retried until the cover swaps it.
let failedVideo: HTMLVideoElement | null = null;

// `canvas` is private in Kawarp's types but is a plain field.
function canvasOf(kawarp: Kawarp): HTMLCanvasElement | null {
  const canvas = (kawarp as unknown as { canvas?: unknown }).canvas;
  return canvas instanceof HTMLCanvasElement ? canvas : null;
}

function findVideo(timestamp: number): HTMLVideoElement | null {
  if (video?.isConnected && PageContainer?.contains(video) && video.classList.contains("Visible")) return video;
  video = null;
  if (timestamp - lastLookup < LOOKUP_INTERVAL_MS) return null;
  lastLookup = timestamp;
  video = PageContainer?.querySelector<HTMLVideoElement>(COVER_VIDEO) ?? null;
  return video;
}

// The last video frame stays in Kawarp until something replaces it, so the still cover is
// loaded back in.
function stopFollowing() {
  const kawarp = followedKawarp;
  followedKawarp = null;
  if (!kawarp || KawarpMap.get(PAGE_BACKGROUND_KEY) !== kawarp) return;
  kawarp.unloadVideo();
  const canvas = canvasOf(kawarp);
  const host = canvas?.parentElement;
  if (!canvas || !host) return;
  canvas.removeAttribute("data-cover-id");
  void ApplyDynamicBackground(host, PAGE_BACKGROUND_KEY);
}

function optionsFor(source: HTMLVideoElement): KawarpVideoOptions {
  if (followOptions && followOptionsFor === source) return followOptions;
  followOptionsFor = source;
  followOptions = {
    ...VIDEO_OPTIONS,
    onError: (err) => {
      motionBgLogger.warn("Cover frame unreadable; keeping the still cover", err);
      failedVideo = source;
      stopFollowing();
    },
  };
  return followOptions;
}

onAnimationFrame((timestamp) => {
  const kawarp = KawarpMap.get(PAGE_BACKGROUND_KEY);
  if (!kawarp || !isExperimentEnabled("motionCoverBackground")) {
    if (followedKawarp) stopFollowing();
    return;
  }

  const source = findVideo(timestamp);
  // A paused cover (NowBar closed, window hidden) would freeze the background on one frame.
  if (!source || source === failedVideo || source.paused) {
    if (followedKawarp) stopFollowing();
    return;
  }

  // Re-asserted every frame: with the element Kawarp already follows, loadVideo only compares
  // options, so it costs nothing.
  try {
    kawarp.loadVideo(source, optionsFor(source));
  } catch (err) {
    motionBgLogger.warn("Kawarp can't follow the cover", err);
    failedVideo = source;
    return;
  }
  followedKawarp = kawarp;
});
