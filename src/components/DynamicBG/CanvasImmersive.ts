import "../../css/CanvasImmersive.css";
import { $backgroundStyle, $motionArtworkOnStage, $motionArtworkPriority, $motionArtwork } from "../../utils/stores.ts";
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
import { AttachCanvasMedia, GetPlayingCanvasInfo, LoadCanvasMedia, type CanvasInfo } from "./CanvasVideo.ts";
import { DecideArtworkPlacement, NeedsMotionVerdict, type MotionVerdict, type Placement } from "./ArtworkPlacement.ts";
import {
  ForgetArtworkUrl,
  GetArtworkUrl,
  IsMotionArtworkEnabled,
  KnownAlbumUpc,
  PlayingAlbumId,
  RequestMotionVerdict,
} from "./MotionArtworkSource.ts";

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
  // What the layer plays: "canvas:<fileId>" or "motion:<upc>".
  key: string | null;
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
// The canvas that ran out of retries or failed to play. The cover is left to others for it.
let failedFileId: string | null = null;

// Motion artwork that failed to play on the stage, left to the cover from then on (until
// another one fails).
let failedMotionUpc: string | null = null;
// The stage holds what it shows while the motion check runs. Past `stageHoldMs` a waiting Canvas
// plays, and a late answer can't swap it out for the rest of that track.
let holdTimer: ReturnType<typeof setTimeout> | null = null;
let holdTrack: string | null = null;
let holdExpiredFor: string | null = null;

const playingTrackUri = (): string | null => Spicetify?.Player?.data?.item?.uri ?? null;

/** Where the song's Canvas or motion artwork goes; `canvas-stage:change` fires when it may change.
 * While the stage still shows, nothing draws over its cover, which dissolves into it. */
export function GetArtworkPlacement(): Placement {
  const stageEligible = !!mount && isEligible();
  const info = stageEligible ? GetPlayingCanvasInfo() : null;
  const input = {
    stageEligible,
    canvas: !!info && info.fileId !== failedFileId,
    motionEnabled: IsMotionArtworkEnabled(),
    priority: $motionArtworkPriority.get(),
    motionOnStage: $motionArtworkOnStage.get(),
  };
  let motion: MotionVerdict = "unknown";
  if (NeedsMotionVerdict(input)) {
    const albumId = PlayingAlbumId();
    const upc = albumId ? KnownAlbumUpc(albumId) : null;
    motion = albumId ? RequestMotionVerdict(albumId) : "none";
    if (input.canvas && holdExpiredFor !== null && holdExpiredFor === playingTrackUri()) motion = "unknown";
    else if (motion === "available" && upc && upc === failedMotionUpc) motion = "unknown";
  }
  const placement = DecideArtworkPlacement({ ...input, motion });
  return active ? { ...placement, cover: false } : placement;
}

function clearHoldTimer() {
  if (holdTimer) clearTimeout(holdTimer);
  holdTimer = null;
}

function armHold() {
  const uri = playingTrackUri();
  if (holdTrack === uri && (holdTimer || holdExpiredFor === uri)) return;
  clearHoldTimer();
  holdTrack = uri;
  holdTimer = setTimeout(() => {
    holdTimer = null;
    holdExpiredFor = uri;
    void Refresh();
  }, getRemoteConfig().animatedArtwork.stageHoldMs);
}

type StageSource =
  | { kind: "canvas"; key: string; info: CanvasInfo }
  | { kind: "motion"; key: string; upc: string };

function stageSource(placement: Placement): StageSource | null {
  if (placement.stage === "canvas") {
    const info = GetPlayingCanvasInfo();
    return info ? { kind: "canvas", key: `canvas:${info.fileId}`, info } : null;
  }
  if (placement.stage === "motion") {
    const albumId = PlayingAlbumId();
    const upc = albumId ? KnownAlbumUpc(albumId) : null;
    return upc ? { kind: "motion", key: `motion:${upc}`, upc } : null;
  }
  return null;
}

function onMotionFailed(upc: string) {
  immersiveLogger.warn("Motion artwork failed on the stage", upc);
  failedMotionUpc = upc;
  void Refresh();
}

// Plays motion artwork in a stage layer. A cached URL may have outlived its 5-minute signature,
// and so may a range fetched mid-loop: either is signed again and picks up from the same frame.
// A pending layer keeps its element, so a newer Refresh may attach to the same video while this
// one waits on the signer: a superseded attach leaves the element alone, and detach only clears a
// source this attach set.
async function attachMotion(video: HTMLVideoElement, upc: string, gen: number): Promise<(() => void) | null> {
  let source = await GetArtworkUrl(upc);
  if (gen !== generation) return () => {};
  if (!source) return null;
  let ownSrc = "";
  const setSource = (url: string) => {
    video.src = url;
    ownSrc = video.src;
  };
  const cleanup = new AbortController();
  const { signal } = cleanup;
  let played = false;
  video.addEventListener("playing", () => (played = true), { signal });
  video.addEventListener(
    "error",
    async () => {
      if (!source) return;
      ForgetArtworkUrl(upc, source.url);
      if (!played && !source.reused) return onMotionFailed(upc);
      played = false;
      const at = video.currentTime;
      source = await GetArtworkUrl(upc, true);
      if (signal.aborted) return;
      if (!source) return onMotionFailed(upc);
      setSource(source.url);
      video.currentTime = at;
      syncPlayback();
    },
    { signal },
  );
  setSource(source.url);
  return () => {
    cleanup.abort();
    if (video.src !== ownSrc) return;
    video.removeAttribute("src");
    video.load();
  };
}

function notifyCoverClaim() {
  Global.Event.evoke("canvas-stage:change", null);
}

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
  return { box, video, detach: null, key: null, releaseTimer: null };
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
  clearHoldTimer();
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
  layer.key = null;
  delete layer.box.dataset.source;
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
  if (delay === undefined) {
    failedFileId = fileId;
    notifyCoverClaim();
    return;
  }
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

// A row's own CSS translate in px (the dock's lift), which the glide has to end on.
function cssTranslate(row: HTMLElement): [number, number] {
  const value = getComputedStyle(row).translate;
  if (value === "none") return [0, 0];
  const [x = "0", y = "0"] = value.split(" ");
  return [parseFloat(x) || 0, parseFloat(y) || 0];
}

let dockGlides: Animation[] = [];

// Where a row's text starts. The title and artist spans carry start padding in one layout and
// none in the other (Player Below the Cover), so the box's own edge would make the text step.
function rowPlace(row: HTMLElement): { left: number; top: number; width: number } {
  const rect = row.getBoundingClientRect();
  const track = row.matches(".SongName, .Artists") ? (row.firstElementChild as HTMLElement | null) : null;
  const scale = rect.width / row.offsetWidth || 1;
  const view = row.ownerDocument.defaultView ?? window;
  const inset = track ? (parseFloat(view.getComputedStyle(track).paddingLeft) || 0) * scale : 0;
  return { left: rect.left + inset, top: rect.top, width: rect.width };
}

// FLIP: the dock layout snaps in, then each row glides from where it was.
function toggleDockLayout(m: Mount, on: boolean) {
  const rows = [...m.nowBar.querySelectorAll<HTMLElement>(DOCK_ROWS)];
  const before = rows.map(rowPlace);
  // An unfinished glide is picked up from where it is now (measured above), not from its end.
  for (const glide of dockGlides) glide.cancel();
  dockGlides = [];
  // The NowBar lands in its new place at once. Where the two layouts place it differently (Player
  // Below the Cover), its `left` transition would otherwise slide it under the glide on another
  // curve, on the main thread, and from a place the rows were measured against before it moved:
  // the title swung out past the screen edge and back. Opening or closing the NowBar keeps its
  // slide.
  const sliding = m.nowBar
    .getAnimations()
    .some((a) => a instanceof CSSTransition && a.transitionProperty === "left");
  if (!sliding) m.nowBar.style.transition = "none";
  m.page.classList.toggle(ACTIVE_CLASS, on);
  if (on) updateSquareTop(m);
  const afterRects = rows.map(rowPlace);
  if (!sliding) {
    // Style has to resolve with the transition off before it comes back.
    void m.nowBar.offsetLeft;
    m.nowBar.style.removeProperty("transition");
  }
  if (reducedMotion.matches) return;
  rows.forEach((row, i) => {
    const after = afterRects[i];
    const dx = before[i].left - after.left;
    const dy = before[i].top - after.top;
    if (!before[i].width || (Math.abs(dx) < 1 && Math.abs(dy) < 1)) return;
    const [tx, ty] = cssTranslate(row);
    dockGlides.push(
      row.animate([{ translate: `${tx + dx}px ${ty + dy}px` }, { translate: `${tx}px ${ty}px` }], {
        duration: DOCK_GLIDE_MS,
        easing: "cubic-bezier(0.77, 0, 0.175, 1)",
      }),
    );
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
  // Reduced motion doesn't pause it: the canvas is the song's artwork, and a still frame
  // in its place reads as a broken player.
  const shouldPlay = active && SpotifyPlayer.IsPlaying && !mount.page.ownerDocument.hidden;
  for (const [index, layer] of mount.layers.entries()) {
    if (!layer.key) continue;
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
  notifyCoverClaim();
}

function deactivate() {
  if (!mount || !active) return;
  finishSideSwap();
  active = false;
  clearSuspendTimer();
  SetKawarpSuspended(PAGE_BACKGROUND_KEY, false);
  toggleDockLayout(mount, false);
  notifyCoverClaim();

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
    notifyCoverClaim();
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

  if (holdExpiredFor !== playingTrackUri()) holdExpiredFor = null;
  const placement = GetArtworkPlacement();
  // Eligibility or the track changed; whoever draws over the cover re-checks the claim.
  notifyCoverClaim();
  if (placement.pending) {
    armHold();
    // The Canvas loads meanwhile, so either answer shows without a further wait.
    const info = GetPlayingCanvasInfo();
    if (info) void LoadCanvasMedia(info);
    return;
  }
  clearHoldTimer();
  const source = stageSource(placement);
  if (!source) {
    deactivate();
    return;
  }

  const m = mount;
  const currentLayer = m.layers[m.current];
  if (currentLayer.key === source.key) {
    activate();
    syncPlayback();
    return;
  }

  const nextIndex: 0 | 1 = m.current === 0 ? 1 : 0;
  const next = m.layers[nextIndex];
  let detach: (() => void) | null;
  if (source.kind === "canvas") {
    const media = await LoadCanvasMedia(source.info);
    if (gen !== generation || mount !== m) return;
    if (!media) {
      deactivate();
      scheduleRetry(source.info.fileId);
      return;
    }
    retryFileId = null;
    if (failedFileId === media.fileId) failedFileId = null;
    releaseLayer(next);
    try {
      detach = await AttachCanvasMedia(next.video, media);
    } catch (err) {
      // A newer load may have taken the element over; that isn't this canvas failing.
      if (gen !== generation || mount !== m) return;
      immersiveLogger.warn("Canvas playback failed", media.fileId, err);
      failedFileId = media.fileId;
      if (gen === generation) deactivate();
      notifyCoverClaim();
      return;
    }
    // Spotify starts random-loop canvases at a random point; doing the same keeps them in step with the NPV.
    if (media.type === "VIDEO_LOOPING_RANDOM" && media.durationMs > 0) {
      next.video.currentTime = Math.random() * (media.durationMs / 1000);
    }
  } else {
    releaseLayer(next);
    detach = await attachMotion(next.video, source.upc, gen);
    if (!detach) {
      // The signer is unreachable; the cover gets its chance instead.
      if (gen === generation && mount === m) onMotionFailed(source.upc);
      return;
    }
  }
  // Superseded or unmounted while attaching: the layer was already released, so revoke here.
  if (gen !== generation || mount !== m) {
    detach();
    return;
  }
  next.detach = detach;
  next.key = source.key;
  next.box.dataset.source = source.kind;
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
Global.Event.listen("motion-artwork:verdict", () => void Refresh());
for (const store of [$motionArtwork, $motionArtworkPriority, $motionArtworkOnStage]) store.listen(() => void Refresh());
SetSideSwapTransition(transitionSideSwap);
document.addEventListener("visibilitychange", syncPlayback);
