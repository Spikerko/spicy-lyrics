import "../../css/CanvasImmersive.css";
import { $backgroundStyle } from "../../utils/stores.ts";
import { isExperimentEnabled, onExperimentChange } from "../../utils/experiments.ts";
import { onAnimationFrame } from "../../utils/AnimationFrameLoop.ts";
import Logger from "../../utils/Logger.ts";
import { getRemoteConfig } from "../../utils/remoteConfig.ts";
import Global from "../Global/Global.ts";
import { SpotifyPlayer } from "../Global/SpotifyPlayer.ts";
import { IsCardMode, PageContainer } from "../Pages/PageView.ts";
import { IsPIP } from "../Utils/PopupLyrics.ts";
import { IsCompactMode } from "../Utils/CompactMode.ts";
import { SetSideSwapTransition } from "../Utils/NowBar.ts";
import { getBackgroundStyle, PAGE_BACKGROUND_KEY, SetKawarpSuspended } from "./dynamicBackground.ts";
import { AttachCanvasMedia, GetPlayingCanvasInfo, LoadCanvasMedia } from "./CanvasVideo.ts";

const immersiveLogger = new Logger("Canvas Immersive");

const ACTIVE_CLASS = "CanvasImmersive";
// Matches --CanvasFade in CanvasImmersive.css.
const FADE_MS = 900;
const AMBIENT_WIDTH = 80;
// Canvases run at 24 to 30 fps, so redrawing the backdrop faster buys nothing.
const AMBIENT_INTERVAL_MS = 1000 / 30;
// Same grade as the Kawarp background (spicy-dynamic-bg.css), so lyrics contrast is unchanged.
const AMBIENT_FILTER = "blur(5px) saturate(2.5) brightness(0.65)";
const DOCK_GLIDE_MS = 600;
// The rows that change place when the dock layout turns on or off.
const DOCK_ROWS = ".Header > .Metadata .SongName, .Header > .Metadata .Artists, .Header .Timeline";
// Side swap: the stage and the dock slide out toward the new side, the layout flips while
// they're hidden, then they slide in from the old side. Opacity and translate only, so it runs on the compositor.
const SWAP_OUT_MS = 160;
const SWAP_IN_MS = 420;
// How far each layer drifts, as a fraction of the page width.
const SWAP_DRIFT = 0.025;

// Spicy Themes sets these on the page when its own background replaces ours (an image, a
// solid animated background, a music video). The stage would cover it, so it steps aside.
const THEME_BACKGROUND_CLASSES = ["st-bgimg-active", "st-animbg-solid", "st-mv-active"];

const themeOwnsBackground = (page: HTMLElement): boolean =>
  THEME_BACKGROUND_CLASSES.some((cls) => page.classList.contains(cls));

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

type Layer = {
  // Holds the video and its dimming veil, and carries the crossfade (CanvasImmersive.css).
  box: HTMLElement;
  video: HTMLVideoElement;
  detach: (() => void) | null;
  fileId: string | null;
  // Clears the layer once it has faded out. Releasing the layer (which reusing it does)
  // cancels it, so a late timer can't clear a canvas loaded into it since.
  releaseTimer: ReturnType<typeof setTimeout> | null;
};

type Mount = {
  page: HTMLElement;
  nowBar: HTMLElement;
  header: HTMLElement;
  stage: HTMLElement;
  ambient: HTMLCanvasElement;
  ambientCtx: CanvasRenderingContext2D;
  layers: [Layer, Layer];
  current: 0 | 1;
  resizeObserver: ResizeObserver;
  themeObserver: MutationObserver;
};

let mount: Mount | null = null;
let active = false;
// Bumped by every refresh; async work from an older one drops its result.
let generation = 0;
let suspendTimer: ReturnType<typeof setTimeout> | null = null;
// A failed download isn't cached, so a retry fetches again. Counted per canvas.
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryFileId: string | null = null;
let retryAttempt = 0;

type SideSwap = {
  animations: Animation[];
  // The class flip, until the slide-out has played.
  apply: (() => void) | null;
  nowBar: HTMLElement;
};
let sideSwap: SideSwap | null = null;

let lastAmbientDraw = 0;
let lastAmbientTime = -1;
// False until the backdrop holds a real frame; the first draw replaces instead of blending.
let ambientPrimed = false;

function createVideo(): HTMLVideoElement {
  const video = document.createElement("video");
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "auto";
  video.disablePictureInPicture = true;
  video.setAttribute("aria-hidden", "true");
  return video;
}

function createLayer(): Layer {
  const box = document.createElement("div");
  box.className = "CanvasLayer";
  const video = createVideo();
  box.append(video);
  return { box, video, detach: null, fileId: null, releaseTimer: null };
}

// Resizing a canvas resets its context, the filter included.
function applyAmbientFilter(ctx: CanvasRenderingContext2D) {
  ctx.filter = AMBIENT_FILTER;
}

function MountOnPage(page: HTMLElement) {
  if (mount?.page === page) return;
  Unmount();

  const contentBox = page.querySelector<HTMLElement>(".ContentBox");
  const nowBar = contentBox?.querySelector<HTMLElement>(".NowBar");
  const header = nowBar?.querySelector<HTMLElement>(".CenteredView .Header");
  if (!contentBox || !nowBar || !header) return;

  const ambient = document.createElement("canvas");
  ambient.className = "CanvasAmbient";
  ambient.width = AMBIENT_WIDTH;
  ambient.height = Math.round(AMBIENT_WIDTH * 9 / 16);
  const ambientCtx = ambient.getContext("2d", { alpha: false });
  if (!ambientCtx) return;
  applyAmbientFilter(ambientCtx);
  contentBox.prepend(ambient);

  const stage = document.createElement("div");
  stage.className = "CanvasStage";
  const layers: [Layer, Layer] = [createLayer(), createLayer()];
  // The stage masks the side; the frame cuts and fades the top (one mask per element).
  const frame = document.createElement("div");
  frame.className = "CanvasStageFrame";
  frame.append(layers[0].box, layers[1].box);
  stage.append(frame);
  // Above the backgrounds, below the lyrics and the NowBar.
  nowBar.before(stage);

  const resizeObserver = new ResizeObserver(() => {
    if (!mount) return;
    resizeAmbient(mount, contentBox);
    if (active) updateSquareTop(mount);
  });
  resizeObserver.observe(contentBox);
  resizeObserver.observe(nowBar);

  // The page's classes change all the time (our own toggle included); only a change in
  // whether the theme owns the background is worth a refresh.
  let themeOwned = themeOwnsBackground(page);
  const themeObserver = new MutationObserver(() => {
    const owned = themeOwnsBackground(page);
    if (owned === themeOwned) return;
    themeOwned = owned;
    void Refresh();
  });
  themeObserver.observe(page, { attributes: true, attributeFilter: ["class"] });

  mount = {
    page,
    nowBar,
    header,
    stage,
    ambient,
    ambientCtx,
    layers,
    current: 0,
    resizeObserver,
    themeObserver,
  };
}

function Unmount() {
  if (!mount) return;
  finishSideSwap();
  generation++;
  active = false;
  clearSuspendTimer();
  clearRetryTimer();
  SetKawarpSuspended(PAGE_BACKGROUND_KEY, false);
  mount.resizeObserver.disconnect();
  mount.themeObserver.disconnect();
  for (const layer of mount.layers) releaseLayer(layer);
  mount.page.classList.remove(ACTIVE_CLASS);
  mount.ambient.remove();
  mount.stage.remove();
  mount.nowBar.style.removeProperty("--CanvasSquareTop");
  mount = null;
}

function releaseLayer(layer: Layer) {
  if (layer.releaseTimer) clearTimeout(layer.releaseTimer);
  layer.releaseTimer = null;
  layer.video.pause();
  layer.box.classList.remove("Current", "Leaving");
  if (layer.detach) {
    layer.detach();
    // Chromium keeps currentSrc after the source is gone, so the element still looks like a
    // loaded video to anything scanning the page for one (Spicy Themes does). A new one doesn't.
    const fresh = createVideo();
    layer.video.replaceWith(fresh);
    layer.video = fresh;
  }
  layer.detach = null;
  layer.fileId = null;
}

function clearSuspendTimer() {
  if (suspendTimer) clearTimeout(suspendTimer);
  suspendTimer = null;
}

function clearRetryTimer() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}

function scheduleRetry(fileId: string) {
  if (retryFileId !== fileId) {
    retryFileId = fileId;
    retryAttempt = 0;
  }
  const delay = getRemoteConfig().canvas.retryDelaysMs[retryAttempt];
  if (delay === undefined) return;
  retryAttempt++;
  const gen = generation;
  clearRetryTimer();
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (gen === generation) void Refresh(true);
  }, delay);
}

function resizeAmbient(m: Mount, contentBox: HTMLElement) {
  const { clientWidth: w, clientHeight: h } = contentBox;
  if (!w || !h) return;
  const height = Math.max(1, Math.round(AMBIENT_WIDTH * h / w));
  if (m.ambient.height !== height) {
    // Resizing clears the canvas.
    m.ambient.height = height;
    applyAmbientFilter(m.ambientCtx);
    ambientPrimed = false;
    lastAmbientTime = -1;
  }
}

// The hover overlay is positioned inside the square MediaBox; this lets it reach the top of the screen.
function updateSquareTop(m: Mount) {
  const mediaBox = m.header.querySelector<HTMLElement>(":scope > .MediaBox");
  if (!mediaBox) return;
  const top = mediaBox.getBoundingClientRect().top - m.nowBar.getBoundingClientRect().top;
  m.nowBar.style.setProperty("--CanvasSquareTop", `${Math.round(top)}px`);
}

// FLIP: the dock layout snaps in, then each row glides from where it was.
function toggleDockLayout(m: Mount, on: boolean) {
  const rows = [...m.nowBar.querySelectorAll<HTMLElement>(DOCK_ROWS)];
  const before = rows.map((row) => row.getBoundingClientRect());
  m.page.classList.toggle(ACTIVE_CLASS, on);
  if (on) updateSquareTop(m);
  if (reducedMotion.matches) return;
  rows.forEach((row, i) => {
    const after = row.getBoundingClientRect();
    const dx = before[i].left - after.left;
    const dy = before[i].top - after.top;
    if (!before[i].width || (Math.abs(dx) < 1 && Math.abs(dy) < 1)) return;
    row.animate([{ translate: `${dx}px ${dy}px` }, { translate: "0 0" }], {
      duration: DOCK_GLIDE_MS,
      easing: "cubic-bezier(0.77, 0, 0.175, 1)",
    });
  });
}

type SwapLayer = { el: HTMLElement; fade: boolean; drift: boolean };

// The lyrics are left out: they already glide to their new place once the swap resizes them.
function swapLayers(m: Mount, nowBar: HTMLElement): SwapLayer[] {
  return [
    // The stage's own opacity belongs to the on/off fade, so its frame takes this one.
    { el: m.stage, fade: false, drift: true },
    { el: m.stage.firstElementChild as HTMLElement, fade: true, drift: false },
    { el: nowBar, fade: true, drift: true },
  ];
}

// One leg of the swap on every layer. With no `from`, each layer starts where it is right now
// (mid-animation included), so a swap that is interrupted doesn't jump.
function playSwapLeg(
  layers: SwapLayer[],
  from: { opacity: number; x: number } | null,
  to: { opacity: number; x: number },
  options: KeyframeAnimationOptions,
): Animation[] {
  const starts = layers.map(({ el }) => {
    if (from) return { opacity: String(from.opacity), translate: `${from.x}px 0` };
    const style = getComputedStyle(el);
    return { opacity: style.opacity, translate: style.translate === "none" ? "0 0" : style.translate };
  });
  for (const animation of sideSwap?.animations ?? []) animation.cancel();
  return layers.map(({ el, fade, drift }, i) => {
    const start: Keyframe = {};
    const end: Keyframe = {};
    if (fade) {
      start.opacity = starts[i].opacity;
      end.opacity = to.opacity;
    }
    if (drift) {
      start.translate = starts[i].translate;
      end.translate = `${to.x}px 0`;
    }
    return el.animate([start, end], options);
  });
}

function finishSideSwap() {
  const swap = sideSwap;
  if (!swap) return;
  sideSwap = null;
  for (const animation of swap.animations) animation.cancel();
  swap.apply?.();
  swap.nowBar.style.removeProperty("transition");
}

// Registered with NowBar.ts. Returns false to let the swap happen without the transition.
function transitionSideSwap(applySwap: () => void, to: "left" | "right"): boolean {
  const m = mount;
  if (!m || !active || reducedMotion.matches || !m.page.classList.contains("NowBarStatus__Open")) {
    finishSideSwap();
    return false;
  }
  const nowBar = m.page.querySelector<HTMLElement>(".ContentBox > .NowBar");
  if (!nowBar) return false;
  const layers = swapLayers(m, nowBar);

  // Pressed again before the layout flipped: call the swap off and settle back where it was.
  if (sideSwap?.apply) {
    const swap = sideSwap;
    swap.apply = null;
    swap.animations = playSwapLeg(layers, null, { opacity: 1, x: 0 }, {
      duration: SWAP_IN_MS,
      easing: "cubic-bezier(0.23, 1, 0.32, 1)",
    });
    swap.animations[0].finished.then(() => sideSwap === swap && finishSideSwap(), () => undefined);
    return true;
  }

  const direction = to === "left" ? -1 : 1;
  const drift = m.page.clientWidth * SWAP_DRIFT * direction;
  const swap: SideSwap = { animations: sideSwap?.animations ?? [], apply: applySwap, nowBar };
  sideSwap = swap;

  swap.animations = playSwapLeg(layers, null, { opacity: 0, x: drift }, {
    duration: SWAP_OUT_MS,
    easing: "cubic-bezier(0.4, 0, 1, 1)",
    fill: "forwards",
  });
  swap.animations[0].finished.then(() => {
    if (sideSwap !== swap || !swap.apply) return;
    // Nothing is visible, so the NowBar lands on its new side at once instead of sliding across.
    nowBar.style.transition = "none";
    swap.apply();
    swap.apply = null;
    swap.animations = playSwapLeg(layers, { opacity: 0, x: -drift }, { opacity: 1, x: 0 }, {
      duration: SWAP_IN_MS,
      easing: "cubic-bezier(0.23, 1, 0.32, 1)",
    });
    swap.animations[0].finished.then(() => sideSwap === swap && finishSideSwap(), () => undefined);
  }, () => undefined);
  return true;
}

function isEligible(): boolean {
  return (
    isExperimentEnabled("canvasImmersive") &&
    !!PageContainer &&
    // With the NowBar away the stage is hidden, so the page goes back to the cover background.
    PageContainer.classList.contains("NowBarStatus__Open") &&
    !IsCardMode &&
    !IsPIP &&
    !IsCompactMode() &&
    getBackgroundStyle() === "dynamic" &&
    !themeOwnsBackground(PageContainer)
  );
}

function syncPlayback() {
  if (!mount) return;
  // A minimized window keeps decoding a playing video even though none of it is drawn.
  const shouldPlay =
    active && SpotifyPlayer.IsPlaying && !reducedMotion.matches && !mount.page.ownerDocument.hidden;
  for (const [index, layer] of mount.layers.entries()) {
    if (!layer.fileId) continue;
    if (shouldPlay && index === mount.current) {
      layer.video.play().catch(() => undefined);
    } else {
      layer.video.pause();
    }
  }
  // A paused frame still has to reach the backdrop once.
  lastAmbientTime = -1;
}

function activate() {
  if (!mount || active) return;
  active = true;
  ambientPrimed = false;
  toggleDockLayout(mount, true);
  // The cover background is hidden under the backdrop once the fade ends; stop rendering it.
  clearSuspendTimer();
  suspendTimer = setTimeout(() => {
    suspendTimer = null;
    if (active) SetKawarpSuspended(PAGE_BACKGROUND_KEY, true);
  }, FADE_MS);
}

function deactivate() {
  if (!mount || !active) return;
  finishSideSwap();
  active = false;
  clearSuspendTimer();
  SetKawarpSuspended(PAGE_BACKGROUND_KEY, false);
  toggleDockLayout(mount, false);

  const gen = generation;
  const m = mount;
  setTimeout(() => {
    if (gen !== generation || active || mount !== m) return;
    for (const layer of m.layers) releaseLayer(layer);
  }, FADE_MS);
}

function waitForFrame(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !video.seeking) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener("loadeddata", check);
      video.removeEventListener("seeked", check);
      resolve();
    };
    const check = () => {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !video.seeking) done();
    };
    video.addEventListener("loadeddata", check);
    video.addEventListener("seeked", check);
    setTimeout(done, 3000);
  });
}

async function Refresh(isRetry = false) {
  const gen = ++generation;
  clearRetryTimer();
  // Anything but a scheduled retry (a new song, reopening the page) earns a fresh set of retries.
  if (!isRetry) retryAttempt = 0;
  // Nothing is built while the experiment is off. Turned off while showing, the stage fades out
  // first and is taken down once the fade is over.
  if (!isExperimentEnabled("canvasImmersive")) {
    if (!mount) return;
    deactivate();
    const m = mount;
    setTimeout(() => {
      if (gen === generation && mount === m && !active) Unmount();
    }, FADE_MS);
    return;
  }
  if (PageContainer && PageContainer !== mount?.page && !IsCardMode && !IsPIP) MountOnPage(PageContainer);
  if (!mount) return;

  const info = isEligible() ? GetPlayingCanvasInfo() : null;
  if (!info) {
    deactivate();
    return;
  }

  const m = mount;
  const currentLayer = m.layers[m.current];
  if (currentLayer.fileId === info.fileId) {
    activate();
    syncPlayback();
    return;
  }

  const media = await LoadCanvasMedia(info);
  if (gen !== generation || mount !== m) return;
  if (!media) {
    deactivate();
    scheduleRetry(info.fileId);
    return;
  }
  retryFileId = null;

  const nextIndex: 0 | 1 = m.current === 0 ? 1 : 0;
  const next = m.layers[nextIndex];
  releaseLayer(next);
  let detach: () => void;
  try {
    detach = await AttachCanvasMedia(next.video, media);
  } catch (err) {
    immersiveLogger.warn("Canvas playback failed", media.fileId, err);
    if (gen === generation) deactivate();
    return;
  }
  // Superseded or unmounted while attaching: the layer was already released, so revoke here.
  if (gen !== generation || mount !== m) {
    detach();
    return;
  }
  next.detach = detach;

  next.fileId = media.fileId;
  // Spotify starts random-loop canvases at a random point; doing the same keeps them in step with the NPV.
  if (media.type === "VIDEO_LOOPING_RANDOM" && media.durationMs > 0) {
    next.video.currentTime = Math.random() * (media.durationMs / 1000);
  }
  await waitForFrame(next.video);
  if (gen !== generation || mount !== m) return;

  const previous = m.layers[m.current];
  m.current = nextIndex;
  next.box.classList.add("Current");
  previous.box.classList.replace("Current", "Leaving");
  activate();
  syncPlayback();

  if (previous.releaseTimer) clearTimeout(previous.releaseTimer);
  previous.releaseTimer = setTimeout(() => {
    previous.releaseTimer = null;
    if (mount === m && m.layers[m.current] !== previous) releaseLayer(previous);
  }, FADE_MS);
}

// The backdrop is the current canvas frame drawn into a tiny canvas and blurred there, so the
// blur costs a few thousand pixels instead of a full-screen filter. CSS scales it up.
onAnimationFrame((timestamp) => {
  if (!mount || !active) return;
  if (timestamp - lastAmbientDraw < AMBIENT_INTERVAL_MS) return;
  const video = mount.layers[mount.current].video;
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.currentTime === lastAmbientTime) return;
  lastAmbientDraw = timestamp;
  lastAmbientTime = video.currentTime;

  const { ambient, ambientCtx: ctx } = mount;
  const w = ambient.width;
  const h = ambient.height;
  const scale = Math.max(w / video.videoWidth, h / video.videoHeight) * 1.3;
  const dw = video.videoWidth * scale;
  const dh = video.videoHeight * scale;

  // Blending into the previous frame keeps the glow from flickering with fast cuts.
  ctx.globalAlpha = ambientPrimed ? 0.3 : 1;
  ctx.drawImage(video, (w - dw) / 2, (h - dh) / 2, dw, dh);
  ambientPrimed = true;
});

Global.Event.listen("page:open", () => void Refresh());
Global.Event.listen("page:destroy", Unmount);
Global.Event.listen("playback:songchange", () => void Refresh());
Global.Event.listen("playback:playpause", syncPlayback);
// Moving the page into or out of fullscreen re-parents it, which can pause the videos, and
// rebuilds the NowBar, which moves the square.
const onFullscreenChange = () =>
  setTimeout(() => {
    syncPlayback();
    if (mount && active) updateSquareTop(mount);
  }, 0);
Global.Event.listen("fullscreen:open", onFullscreenChange);
Global.Event.listen("fullscreen:exit", onFullscreenChange);
// Compact mode keeps the cover background; switching back brings the canvas back.
Global.Event.listen("compact-mode:enable", () => void Refresh());
Global.Event.listen("compact-mode:disable", () => void Refresh());
Global.Event.listen("nowbar:open", () => void Refresh());
Global.Event.listen("nowbar:close", () => void Refresh());
onExperimentChange((experiment) => {
  if (experiment.id === "canvasImmersive") void Refresh();
});
$backgroundStyle.listen(() => void Refresh());
SetSideSwapTransition(transitionSideSwap);
reducedMotion.addEventListener("change", syncPlayback);
document.addEventListener("visibilitychange", syncPlayback);
