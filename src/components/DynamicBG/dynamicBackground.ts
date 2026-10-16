import {
  $backgroundBlur,
  $backgroundStyle,
  BACKGROUND_STYLES,
  type BackgroundStyle,
} from "../../utils/stores.ts";
import { isExperimentEnabled } from "../../utils/experiments.ts";
import BlobURLMaker from "../../utils/BlobURLMaker.ts";
import Global from "../Global/Global.ts";
import { COVER_PLACEHOLDER_URL, SpotifyPlayer } from "../Global/SpotifyPlayer.ts";
import ArtistVisuals from "./ArtistVisuals/Main.ts";
import { PageContainer } from "../Pages/PageView.ts";
import Kawarp, { type KawarpOptions } from "@kawarp/core";
import { BackgroundAnimationController, type AudioAnalysisData } from "./BackgroundAnimationController.ts";
import { getDynamicAudioAnalysis } from "../../utils/audioAnalysis.ts";
import Logger from "../../utils/Logger.ts";
import { onAnimationFrame } from "../../utils/AnimationFrameLoop.ts";

const dynamicBgLogger = new Logger("Dynamic Background");

/** KawarpMap key of the lyrics page background. Only this one follows `$backgroundStyle`. */
export const PAGE_BACKGROUND_KEY = "lpagebg";

const KawarpTransitionDuration = 1000;
export const KawarpOptionsStatic: KawarpOptions = {
  warpIntensity: 1,
  blurPasses: 8,
  animationSpeed: 0.1,
  saturation: 1.5,
  dithering: 0.008,
  transitionDuration: 500,
  tintIntensity: 0,
  scale: 1,
}

const PAUSED_SPEED = 0.1;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

export const KawarpMap = new Map<HTMLElement | string, Kawarp>();
const animSpeedController = new BackgroundAnimationController();

const isRefined = () => isExperimentEnabled("refinedBackground");

export function getBackgroundStyle(): BackgroundStyle {
  const style = $backgroundStyle.get();
  return BACKGROUND_STYLES.includes(style) ? style : "dynamic";
}

// Kawarp's own start() runs an uncapped requestAnimationFrame loop. We render the
// instances from the shared, frame-capped loop instead, on the same frames as the
// lyrics, so $animationFpsCap bounds how often the page repaints.
// Only instances still in KawarpMap render: every dispose() site also removes the
// instance from the map, synchronously.
const runningKawarps = new WeakSet<Kawarp>();

// start() seeds Kawarp's frame clock so the first renderFrame() doesn't see a delta
// since page load (or since it was suspended), and marks the instance playing: a
// stopped one skips the frames of a playing video source (see NpvCanvasBackground.ts).
// The loop it queues is cancelled before its first frame; `animationId` is private
// but a plain field.
function playKawarp(kawarp: Kawarp) {
  kawarp.start();
  const loop = kawarp as unknown as { animationId: number | null };
  if (loop.animationId != null) cancelAnimationFrame(loop.animationId);
  loop.animationId = null;
}

function startKawarp(kawarp: Kawarp) {
  if (runningKawarps.has(kawarp)) return;
  playKawarp(kawarp);
  runningKawarps.add(kawarp);
  // Loaded while its key was suspended: stay stopped until SetKawarpSuspended lifts it.
  for (const key of suspendedKawarpKeys) {
    if (KawarpMap.get(key) === kawarp) kawarp.stop();
  }
}

// Keys whose instance is fully covered by something else (the canvas backdrop, or
// fullscreen over the NPV) and needn't render. They're also stopped, which halts the
// video-frame callbacks Kawarp runs on its own for a video source.
const suspendedKawarpKeys = new Set<HTMLElement | string>();

export function SetKawarpSuspended(key: HTMLElement | string, suspended: boolean) {
  if (suspended) suspendedKawarpKeys.add(key);
  else suspendedKawarpKeys.delete(key);
  const kawarp = KawarpMap.get(key);
  // Speed changes skip a suspended instance; it catches up here.
  if (kawarp && !suspended) applyAnimationSpeed(kawarp);
  if (!kawarp || !runningKawarps.has(kawarp)) return;
  if (suspended) kawarp.stop();
  else playKawarp(kawarp);
}

onAnimationFrame(() => {
  if (KawarpMap.size === 0) return;
  KawarpMap.forEach((kawarp, key) => {
    if (runningKawarps.has(kawarp) && !suspendedKawarpKeys.has(key)) kawarp.renderFrame();
  });
});

// ─── Layers ──────────────────────────────────────────────────────────────────
//
// Every background is a `.spicy-dynamic-bg` layer appended to its host. A new layer
// goes on top with `.transition_In`; the ones under it get `.transition_Out` and are
// removed once the CSS transition has finished, so rapid skips never stack up layers.

/** Only the kinds created here, so a theme's own `.spicy-dynamic-bg` element is never swept away. */
const OWN_LAYERS = ":scope > :is(canvas, .StaticBackground, .ColorBackground).spicy-dynamic-bg";

/** The longest layer transition in spicy-dynamic-bg.css, for each look. */
const layerSettleMs = () => (isRefined() ? 1500 : 1000);

/** Kawarp instances by their canvas, so a retired canvas disposes its own. */
const canvasKawarps = new WeakMap<Element, Kawarp>();

/** The host's current layer of one kind, ignoring layers on their way out. */
function liveLayer(host: HTMLElement, kind: string): HTMLElement | null {
  return host.querySelector<HTMLElement>(`:scope > ${kind}.spicy-dynamic-bg:not(.transition_Out)`);
}

/** Send every layer but `keep` out. Returns whether there was anything to replace. */
function retireLayers(host: HTMLElement, keep: Element | null): boolean {
  let replaced = false;
  for (const layer of host.querySelectorAll<HTMLElement>(OWN_LAYERS)) {
    if (layer === keep) continue;
    replaced = true;
    if (layer.classList.contains("transition_Out")) continue;
    // Frozen as it looks now: the canvas stage hides Kawarp, and losing that class
    // would otherwise fade the retired canvas back in.
    layer.style.opacity = getComputedStyle(layer).opacity;
    layer.classList.remove("transition_In");
    layer.classList.add("transition_Out");
    // Nothing goes on top (None), so it fades out rather than holding and then popping.
    if (!keep) layer.classList.add("transition_Away");

    // Out of the map now, so it stops rendering and nothing loads into it; it keeps
    // its last frame until removed.
    const kawarp = canvasKawarps.get(layer);
    if (kawarp) {
      for (const [key, instance] of KawarpMap) {
        if (instance === kawarp) KawarpMap.delete(key);
      }
    }
    // A timer, not transitionend: that never fires in a hidden window.
    setTimeout(() => {
      layer.remove();
      kawarp?.dispose();
    }, layerSettleMs());
  }
  return replaced;
}

/** Show `layer` over whatever the host had, and retire the rest. */
function revealLayer(host: HTMLElement, layer: HTMLElement) {
  layer.classList.remove("is-pending");
  const replaced = retireLayers(host, layer);
  // The original look only animates a replacement; the refined one also fades in the first layer.
  if (!replaced && !isRefined()) return;
  layer.classList.add("transition_In");
  setTimeout(() => layer.classList.remove("transition_In"), layerSettleMs());
}

// ─── Track ───────────────────────────────────────────────────────────────────

interface TrackSnapshot {
  /** The large cover as Spotify reports it: `spotify:image:…`, `spotify:local:…` or a URL. */
  coverUri: string;
  /** Local-file art, which can't be fetched; see rasterizeLocalCover. */
  isLocalCover: boolean;
  /** The small cover, shown first when the large one is slow to arrive. */
  previewUrl: string | null;
  artistId?: string;
  trackId?: string;
  /**
   * True once the track changed, the host left the page, or the style this apply paints
   * is no longer the selected one, so results must not be painted.
   */
  isStale: () => boolean;
}

const styleForKey = (key: string): BackgroundStyle =>
  key === PAGE_BACKGROUND_KEY ? getBackgroundStyle() : "dynamic";

const toImageUrl = (uri: string) =>
  uri.startsWith("spotify:image:") ? uri.replace("spotify:image:", "https://i.scdn.co/image/") : uri;

function snapshotTrack(host: HTMLElement, key: string, style: BackgroundStyle): TrackSnapshot {
  const coverUri = SpotifyPlayer.GetCover("large") ?? "";
  const trackUri = SpotifyPlayer.GetUri();
  // GetCover falls back to the placeholder when there is no small size; never preview that.
  const smallCover = SpotifyPlayer.GetCover("small") ?? "";
  const previewUrl = smallCover.startsWith("spotify:image:")
    ? toImageUrl(smallCover)
    : smallCover.startsWith("https://") && smallCover !== COVER_PLACEHOLDER_URL
      ? smallCover
      : null;

  return {
    coverUri,
    isLocalCover: coverUri.startsWith("spotify:local"),
    previewUrl,
    artistId: SpotifyPlayer.GetArtists()?.[0]?.uri?.replace("spotify:artist:", "") || undefined,
    trackId: SpotifyPlayer.GetId() ?? undefined,
    isStale: () =>
      !host.isConnected ||
      SpotifyPlayer.GetUri() !== trackUri ||
      (SpotifyPlayer.GetCover("large") ?? "") !== coverUri ||
      // Switched to another style (None included) while this one was loading.
      styleForKey(key) !== style,
  };
}

// ─── Image loading ───────────────────────────────────────────────────────────

/** How long to wait for an image to decode before giving up on it. */
const IMAGE_DECODE_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error("timed out")), ms);
    }),
  ]).finally(() => clearTimeout(timeoutId));
}

/**
 * A source Kawarp can ingest: a fetchable URL (remote covers) or a decoded Blob
 * (local-file art, which can't be fetched).
 */
type KawarpSource =
  | { kind: "url"; value: string }
  | { kind: "blob"; value: Blob };

/**
 * Rasterize Spotify local-file artwork into a Blob.
 *
 * Local covers are served through the client's `spotify:local:` scheme: they
 * render in `<img>`/CSS but can't be `fetch()`ed (which is how `Kawarp.loadImage`
 * resolves a URL), and WebGL can't sample a raw cross-scheme `<img>` either. We
 * draw the decoded image to a canvas and export it as a same-origin Blob, which
 * `Kawarp.loadBlob` can then sample cleanly.
 *
 * Returns `null` if the art can't be decoded or the canvas is tainted.
 */
async function rasterizeLocalCover(coverUrl: string): Promise<Blob | null> {
  if (!coverUrl) return null;

  const img = new Image();
  img.decoding = "async";
  img.src = coverUrl;

  try {
    await withTimeout(img.decode(), IMAGE_DECODE_TIMEOUT_MS);
  } catch (err) {
    dynamicBgLogger.error("Local cover failed to decode for dynamic background", err);
    return null;
  }

  const width = img.naturalWidth;
  const height = img.naturalHeight;
  if (!width || !height) return null;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);

  try {
    return await new Promise<Blob | null>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("toBlob produced no data"))),
        "image/png"
      );
    });
  } catch (err) {
    // Thrown when the canvas is tainted (cross-origin art served without CORS).
    dynamicBgLogger.error("Local cover could not be exported to a blob", err);
    return null;
  }
}

/**
 * Resolve a cover into something Kawarp can load. Remote covers pass through as a
 * URL; local-file covers are rasterized to a Blob (see {@link rasterizeLocalCover}).
 */
async function resolveKawarpSource(track: TrackSnapshot): Promise<KawarpSource | null> {
  if (!track.isLocalCover) {
    return { kind: "url", value: toImageUrl(track.coverUri) };
  }
  const blob = await rasterizeLocalCover(track.coverUri);
  return blob ? { kind: "blob", value: blob } : null;
}

/** Load a previously-resolved source into a Kawarp instance. */
async function loadKawarpSource(kawarp: Kawarp, source: KawarpSource): Promise<void> {
  if (source.kind === "blob") {
    await kawarp.loadBlob(source.value);
  } else {
    await kawarp.loadImage(source.value);
  }
}

/** How long the full-size cover gets before a small preview is shown instead. */
const COVER_PREVIEW_AFTER_MS = 250;

/**
 * The cover as a Blob, requested at high priority. Handing Kawarp a URL leaves
 * the download to the browser at image priority, and on a slow link it then
 * loses to the lyrics request: the background stayed blank until the lyrics
 * had finished downloading. Resolves null if the fetch fails.
 */
async function fetchCoverBlob(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url, { priority: "high" } as RequestInit);
    return res.ok ? await res.blob() : null;
  } catch {
    return null;
  }
}

/**
 * Load a remote cover so something shows quickly on a slow connection: if the
 * full-size image isn't in within COVER_PREVIEW_AFTER_MS, the small cover (a
 * few KB, and usually cached already by the playbar) goes in first and the
 * full one crossfades over it once it arrives. `onLoaded` runs after each load
 * that went through, so the caller can start the instance.
 */
async function loadCoverProgressively(
  kawarp: Kawarp,
  source: KawarpSource,
  previewUrl: string | null,
  isStale: () => boolean,
  onLoaded: () => void
): Promise<void> {
  if (source.kind !== "url") {
    if (await queueKawarpLoad(kawarp, source, isStale)) onLoaded();
    return;
  }

  const full = fetchCoverBlob(source.value);
  const timedOut = Symbol("timedOut");
  const early = await Promise.race([
    full,
    new Promise<typeof timedOut>((r) => setTimeout(() => r(timedOut), COVER_PREVIEW_AFTER_MS)),
  ]);

  if (early === timedOut && previewUrl && previewUrl !== source.value) {
    if (await queueKawarpLoad(kawarp, { kind: "url", value: previewUrl }, isStale)) onLoaded();
  }

  const blob = early === timedOut ? await full : early;
  const finalSource: KawarpSource = blob ? { kind: "blob", value: blob } : source;
  if (await queueKawarpLoad(kawarp, finalSource, isStale)) onLoaded();
}

const kawarpLoadChains = new WeakMap<Kawarp, Promise<unknown>>();

/**
 * Load into `kawarp` after any load already running on it. Unserialized, a slow
 * load for the previous track could finish after the current track's and leave
 * the wrong art showing. Each queued load re-checks `isStale` when its turn
 * comes, so skipped-past tracks are dropped. Resolves true if it loaded and is
 * still current: a skip during the load itself must not start the instance on
 * the old art, since the newer track's load is already queued behind this one.
 */
function queueKawarpLoad(
  kawarp: Kawarp,
  source: KawarpSource,
  isStale: () => boolean
): Promise<boolean> {
  const previous = kawarpLoadChains.get(kawarp) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      if (isStale()) return false;
      await loadKawarpSource(kawarp, source);
      return !isStale();
    });
  kawarpLoadChains.set(kawarp, next.catch(() => undefined));
  return next;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

/**
 * Paint `host`'s background for the playing track. `key` names its Kawarp instance;
 * the lyrics page (PAGE_BACKGROUND_KEY) takes the style picked in Settings, every
 * other host (the NPV) always animates.
 */
export default async function ApplyDynamicBackground(host: HTMLElement, key: string) {
  if (!host) return;
  // The NPV lyrics card must stay transparent: the NPV's own background shows through.
  if (host.closest("#SpicyLyricsPage.CardMode")) return;
  const style = styleForKey(key);
  dynamicBgLogger.debug("Applying background", { key, style });
  if (key === PAGE_BACKGROUND_KEY) host.closest("#SpicyLyricsPage")?.classList.toggle("NoBackground", style === "none");
  if (style === "none") {
    retireLayers(host, null);
    return;
  }

  const track = snapshotTrack(host, key, style);
  // Nothing to paint, and a fetch of "" would load the app page itself.
  if (!track.coverUri) return;
  if (style === "color") return applyColorBackground(host, track);
  if (style === "artist" || style === "cover") return applyImageBackground(host, track, style);
  return applyKawarpBackground(host, key, track);
}

/** The page's refined CSS fades a new canvas in; the NPV leaves that to Kawarp's own blend. */
const fadesInWithCss = (key: string) => key === PAGE_BACKGROUND_KEY && isRefined();

/** Runs after each image that went into `kawarp`; the first one reveals its canvas. */
function onCanvasLoaded(host: HTMLElement, key: string, canvas: HTMLElement, kawarp: Kawarp) {
  // Disposed or replaced (page closed, NPV cleanup, style switch) while loading.
  if (KawarpMap.get(key) !== kawarp) return;
  startKawarp(kawarp);
  if (!canvas.classList.contains("is-pending")) return;
  revealLayer(host, canvas);
  if (fadesInWithCss(key)) kawarp.setOptions({ transitionDuration: KawarpTransitionDuration });
}

async function applyKawarpBackground(host: HTMLElement, key: string, track: TrackSnapshot) {
  if (liveLayer(host, "canvas")?.getAttribute("data-cover-id") === track.coverUri) return;

  // Resolve a Kawarp-loadable source up front (rasterizing local art if needed)
  // so we can bail before touching any instance when there's nothing to show.
  const source = await resolveKawarpSource(track);
  if (!source) {
    dynamicBgLogger.warn("No loadable cover for dynamic background; skipping", { cover: track.coverUri });
    return;
  }

  // Resolving can block for seconds (rasterizing a local cover waits up to
  // IMAGE_DECODE_TIMEOUT_MS). A newer call, or the teardown, owns this key's
  // instance by then: loading our stale cover would flash the previous track's
  // art, and building a new one on a detached host would leak its render loop.
  if (track.isStale()) {
    dynamicBgLogger.debug("Track or host changed while resolving dynamic background; skipping stale apply", { key });
    return;
  }

  // Re-queried rather than trusting the pre-await snapshot: a concurrent call may
  // have replaced this key's canvas while we were resolving.
  const liveCanvas = liveLayer(host, "canvas");
  const liveKawarp = liveCanvas ? KawarpMap.get(key) : undefined;
  if (liveCanvas && liveKawarp) {
    liveCanvas.setAttribute("data-cover-id", track.coverUri);
    try {
      await loadCoverProgressively(liveKawarp, source, track.previewUrl, track.isStale, () =>
        onCanvasLoaded(host, key, liveCanvas, liveKawarp)
      );
    } catch (err) {
      dynamicBgLogger.warn("Dynamic background load failed", err);
    }
    return;
  }

  const cssFade = fadesInWithCss(key);
  const canvas = document.createElement("canvas");
  canvas.classList.add("spicy-dynamic-bg", "is-pending");
  canvas.setAttribute("data-cover-id", track.coverUri);

  // An instance whose canvas is gone would otherwise be overwritten here and
  // keep rendering forever.
  KawarpMap.get(key)?.dispose();

  const kawarp = new Kawarp(canvas, {
    ...KawarpOptionsStatic,
    animationSpeed: currentSpeed,
    // When CSS fades the canvas in, the first image goes in at once.
    transitionDuration: cssFade ? 0 : KawarpOptionsStatic.transitionDuration,
  });
  appliedSpeeds.set(kawarp, currentSpeed);
  KawarpMap.set(key, kawarp);
  canvasKawarps.set(canvas, kawarp);
  host.appendChild(canvas);

  try {
    await loadCoverProgressively(kawarp, source, track.previewUrl, track.isStale, () =>
      onCanvasLoaded(host, key, canvas, kawarp)
    );
  } catch (err) {
    dynamicBgLogger.warn("Dynamic background load failed", err);
    return;
  }
  if (!cssFade) {
    setTimeout(
      () => kawarp.setOptions({ transitionDuration: KawarpTransitionDuration }),
      KawarpOptionsStatic.transitionDuration * 2
    );
  }
}

/** The artist's header image when `style` asks for it, else the cover. */
async function resolveBackgroundImage(track: TrackSnapshot, style: "artist" | "cover"): Promise<string> {
  if (style === "cover" || !track.artistId || !track.trackId) return track.coverUri;
  try {
    return (await ArtistVisuals.ApplyContent(track.artistId, track.trackId)) || track.coverUri;
  } catch (error) {
    dynamicBgLogger.error("Artist image lookup failed; using the cover", error);
    return track.coverUri;
  }
}

/** Fetch the playing artist's image ahead of time, so the Artist Image style paints without waiting on it. */
export async function PrefetchArtistImage(): Promise<void> {
  if (getBackgroundStyle() !== "artist" || SpotifyPlayer.IsDJ()) return;
  const artistId = SpotifyPlayer.GetArtists()?.[0]?.uri?.replace("spotify:artist:", "");
  const trackId = SpotifyPlayer.GetId();
  if (!artistId || !trackId) return;
  await ArtistVisuals.ApplyContent(artistId, trackId).catch((error) =>
    dynamicBgLogger.warn("Unable to prefetch the artist image", error)
  );
}

async function applyImageBackground(host: HTMLElement, track: TrackSnapshot, style: "artist" | "cover") {
  const imageUri = await resolveBackgroundImage(track, style);
  if (!imageUri || track.isStale()) return;

  const isCurrent = () => liveLayer(host, ".StaticBackground")?.getAttribute("data-cover-id") === imageUri;
  if (isCurrent()) {
    // Same image under a different style (no artist header): just clear anything else.
    retireLayers(host, liveLayer(host, ".StaticBackground")!);
    return;
  }

  const url = toImageUrl(imageUri);
  const src = imageUri.startsWith("spotify:local")
    ? url
    : ((await BlobURLMaker(url).catch(() => null)) ?? url);
  // Decoded before it goes in, so the transition starts on a painted image.
  const preload = new Image();
  preload.src = src;
  await withTimeout(preload.decode(), IMAGE_DECODE_TIMEOUT_MS).catch(() => undefined);

  // Another apply for this same track may have painted it while we awaited.
  if (track.isStale() || isCurrent()) return;

  const layer = document.createElement("div");
  layer.classList.add("spicy-dynamic-bg", "StaticBackground");
  layer.style.setProperty("--BackgroundImage", `url("${src}")`);
  layer.setAttribute("data-cover-id", imageUri);
  host.appendChild(layer);
  revealLayer(host, layer);
}

/**
 * `r, g, b, a` triplets for the Cover Colors layer, read by spicy-dynamic-bg.css.
 * The original look paints `min` under a `high` wash from Spotify's best-fit set;
 * the refined one always uses the dark set's two deepest tones, so white lyrics stay legible.
 */
interface Palette {
  min: string;
  high: string;
  deep: string;
  wash: string;
}

const FALLBACK_COLOR = "18, 18, 18, 1";
const FALLBACK_PALETTE: Palette = { min: FALLBACK_COLOR, high: FALLBACK_COLOR, deep: FALLBACK_COLOR, wash: FALLBACK_COLOR };
const paletteCache = new Map<string, Palette>();
const PALETTE_CACHE_SIZE = 32;

type RgbaColor = { red: number; green: number; blue: number; alpha: number };
const rgba = (c: RgbaColor) => `${c.red}, ${c.green}, ${c.blue}, ${c.alpha}`;

async function fetchSpotifyPalette(coverUri: string): Promise<Palette | null> {
  try {
    const query = await Spicetify.GraphQL.Request(Spicetify.GraphQL.Definitions.getDynamicColorsByUris, {
      imageUris: [coverUri],
    });
    const colors = query.data.dynamicColors[0];
    const bestFit = colors[colors.bestFit === "LIGHT" ? "light" : "dark"];
    return {
      min: rgba(bestFit.minContrast.backgroundBase),
      high: rgba(bestFit.highContrast.backgroundBase),
      deep: rgba(colors.dark.higherContrast.backgroundBase),
      wash: rgba(colors.dark.highContrast.backgroundBase),
    };
  } catch (err) {
    dynamicBgLogger.warn("Spotify has no colors for this cover; averaging it instead", err);
    return null;
  }
}

/** For covers Spotify can't analyze (local files): the cover's average color, darkened. */
async function averagePalette(track: TrackSnapshot): Promise<Palette | null> {
  const blob = track.isLocalCover
    ? await rasterizeLocalCover(track.coverUri)
    : await fetchCoverBlob(toImageUrl(track.coverUri));
  if (!blob) return null;
  try {
    const bitmap = await createImageBitmap(blob, { resizeWidth: 8, resizeHeight: 8, resizeQuality: "medium" });
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 8;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const pixels = ctx.getImageData(0, 0, 8, 8).data;
    const sum = [0, 0, 0];
    for (let i = 0; i < pixels.length; i += 4) {
      sum[0] += pixels[i];
      sum[1] += pixels[i + 1];
      sum[2] += pixels[i + 2];
    }
    const shade = (factor: number) =>
      `${sum.map((channel) => Math.round((channel / 64) * factor)).join(", ")}, 1`;
    return { min: shade(0.6), high: shade(0.35), deep: shade(0.3), wash: shade(0.55) };
  } catch (err) {
    dynamicBgLogger.warn("Cover couldn't be averaged for Cover Colors", err);
    return null;
  }
}

async function getPalette(track: TrackSnapshot): Promise<Palette | null> {
  const cached = paletteCache.get(track.coverUri);
  if (cached) return cached;
  const palette =
    (track.isLocalCover ? null : await fetchSpotifyPalette(track.coverUri)) ?? (await averagePalette(track));
  if (!palette) return null;
  if (paletteCache.size >= PALETTE_CACHE_SIZE) paletteCache.delete(paletteCache.keys().next().value!);
  paletteCache.set(track.coverUri, palette);
  return palette;
}

function setPalette(layer: HTMLElement, palette: Palette) {
  layer.style.setProperty("--MinContrastColor", palette.min);
  layer.style.setProperty("--HighContrastColor", palette.high);
  layer.style.setProperty("--DeepColor", palette.deep);
  layer.style.setProperty("--WashColor", palette.wash);
}

async function applyColorBackground(host: HTMLElement, track: TrackSnapshot) {
  const palette = (await getPalette(track)) ?? FALLBACK_PALETTE;
  if (track.isStale()) return;

  const live = liveLayer(host, ".ColorBackground");
  if (live) {
    // CSS transitions the colors from the old palette to this one.
    setPalette(live, palette);
    return;
  }
  const layer = document.createElement("div");
  layer.classList.add("spicy-dynamic-bg", "ColorBackground");
  setPalette(layer, palette);
  host.appendChild(layer);
  revealLayer(host, layer);
}

// The original look drops Cover Colors to black on every song change and paints the
// new palette a second later. The refined one goes through the normal songchange apply.
let colorFadeTimeout: ReturnType<typeof setTimeout> | null = null;

Global.Event.listen("playback:songchange", () => {
  if (isRefined() || getBackgroundStyle() !== "color" || !PageContainer) return;
  const contentBox = PageContainer.querySelector<HTMLElement>(".ContentBox");
  const layer = contentBox && liveLayer(contentBox, ".ColorBackground");
  if (colorFadeTimeout && layer) setPalette(layer, FALLBACK_PALETTE);
  if (colorFadeTimeout) clearTimeout(colorFadeTimeout);

  colorFadeTimeout = setTimeout(() => {
    colorFadeTimeout = null;
    const box = PageContainer?.querySelector<HTMLElement>(".ContentBox");
    if (box) void ApplyDynamicBackground(box, PAGE_BACKGROUND_KEY);
  }, 1000);
});

/** Switching styles: the refined look crossfades, the original swaps at once. */
function reapplyPageBackground() {
  const contentBox = PageContainer?.querySelector<HTMLElement>(".ContentBox");
  if (!contentBox) return;
  if (!isRefined()) {
    KawarpMap.get(PAGE_BACKGROUND_KEY)?.dispose();
    KawarpMap.delete(PAGE_BACKGROUND_KEY);
    contentBox.querySelectorAll(OWN_LAYERS).forEach((el) => el.remove());
  } else {
    // A canvas still loading belongs to the style being left: its apply is stale now and
    // won't reveal it, and switching back would otherwise find it and skip building one.
    for (const pending of contentBox.querySelectorAll(":scope > canvas.spicy-dynamic-bg.is-pending")) {
      const kawarp = canvasKawarps.get(pending);
      if (kawarp && KawarpMap.get(PAGE_BACKGROUND_KEY) === kawarp) KawarpMap.delete(PAGE_BACKGROUND_KEY);
      kawarp?.dispose();
      pending.remove();
    }
  }
  void ApplyDynamicBackground(contentBox, PAGE_BACKGROUND_KEY);
}

$backgroundStyle.listen(reapplyPageBackground);

// ─── Image blur ──────────────────────────────────────────────────────────────

const MAX_BACKGROUND_BLUR = 48;

// Blur is a pure paint change on the existing layer, so it goes straight into a CSS
// var rather than rebuilding the background. Only on the page: a var on <html>
// restyles all of Spotify, about 75 ms per slider step.
function applyBackgroundBlur(blur: number) {
  const px = Math.min(Math.max(Number(blur) || 0, 0), MAX_BACKGROUND_BLUR);
  PageContainer?.style.setProperty("--BackgroundImageBlur", `${px}px`);
}

applyBackgroundBlur($backgroundBlur.get());
$backgroundBlur.listen(applyBackgroundBlur);

// A freshly opened page (PiP or otherwise) is a brand new element with no inline var.
Global.Event.listen("page:open", () => applyBackgroundBlur($backgroundBlur.get()));

// ─── Animation speed ─────────────────────────────────────────────────────────

/** Last speed handed to the instances; new ones start at it. Kawarp eases between values itself. */
let currentSpeed = KawarpOptionsStatic.animationSpeed ?? PAUSED_SPEED;

/** The speed each instance was last handed, so an unchanged one isn't sent again on every tick. */
const appliedSpeeds = new WeakMap<Kawarp, number>();

function applyAnimationSpeed(kawarp: Kawarp) {
  if (appliedSpeeds.get(kawarp) === currentSpeed) return;
  appliedSpeeds.set(kawarp, currentSpeed);
  kawarp.setOptions({ animationSpeed: currentSpeed });
}

function setAnimationSpeed(speed: number) {
  // Reduced motion keeps the full-page background at its slow paused drift.
  currentSpeed = reducedMotion.matches ? Math.min(speed, PAUSED_SPEED) : speed;
  // A suspended instance isn't drawn; SetKawarpSuspended brings it up to speed when it resumes.
  KawarpMap.forEach((kawarp, key) => {
    if (!suspendedKawarpKeys.has(key)) applyAnimationSpeed(kawarp);
  });
}

/** Successful analysis, or `null` once we know the track has no analysis (stops progress-handler spam). */
const audioAnalysisCache = new Map<string, AudioAnalysisData | null>();
const audioAnalysisInflightRequests = new Map<string, Promise<AudioAnalysisData | null>>();
let latestPlaybackTrackUri: string | null = null;

const pruneAudioAnalysisCache = (activeTrackUri: string) => {
  for (const cachedTrackUri of audioAnalysisCache.keys()) {
    if (cachedTrackUri !== activeTrackUri) {
      audioAnalysisCache.delete(cachedTrackUri);
    }
  }
};

const getAudioAnalysisForTrack = async (uri: string): Promise<AudioAnalysisData | null> => {
  if (audioAnalysisCache.has(uri)) {
    return audioAnalysisCache.get(uri)!;
  }

  const inflight = audioAnalysisInflightRequests.get(uri);
  if (inflight) {
    return inflight;
  }

  const request = getDynamicAudioAnalysis(uri)
    .then((analysis) => {
      audioAnalysisCache.set(uri, analysis);
      return analysis;
    })
    .finally(() => {
      audioAnalysisInflightRequests.delete(uri);
    });

  audioAnalysisInflightRequests.set(uri, request);
  return request;
};

Global.Event.listen("playback:songchange", () => {
  latestPlaybackTrackUri = SpotifyPlayer.GetUri() ?? null;

  if (latestPlaybackTrackUri) {
    pruneAudioAnalysisCache(latestPlaybackTrackUri);
  } else {
    audioAnalysisCache.clear();
  }
});

Global.Event.listen("playback:playpause", (e: { data?: { isPaused?: boolean } }) => {
  setAnimationSpeed(e?.data?.isPaused ? PAUSED_SPEED : 1);
});

reducedMotion.addEventListener("change", () => setAnimationSpeed(SpotifyPlayer.IsPlaying ? 1 : PAUSED_SPEED));

Global.Event.listen("playback:progress", async () => {
  // Speed only matters to live backgrounds; a new one picks it up on the next tick.
  if (KawarpMap.size === 0) return;
  const songUri = SpotifyPlayer.GetUri();
  // Local tracks have no Spotify audio analysis.
  if (!songUri || songUri.startsWith("spotify:local:")) {
    setAnimationSpeed(1);
    return;
  }

  latestPlaybackTrackUri = songUri;
  const audioAnalysisData = await getAudioAnalysisForTrack(songUri);
  if (!audioAnalysisData) {
    setAnimationSpeed(1);
    return;
  }

  // Prevent stale async results from old tracks applying after rapid song switches.
  if (SpotifyPlayer.GetUri() !== songUri || latestPlaybackTrackUri !== songUri) return;

  pruneAudioAnalysisCache(songUri);
  setAnimationSpeed(animSpeedController.getSpeedMultiplier(SpotifyPlayer.GetPosition() / 1000, audioAnalysisData));
});
