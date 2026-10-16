// `canvas.fileId` is a video manifest id; we play its VP9 WebM segments through MSE.
// The canvaz `canvas.url` .mp4 is H.264, which this Chromium build can't decode.
import Logger from "../../utils/Logger.ts";
import { getRemoteConfig } from "../../utils/remoteConfig.ts";

const canvasLogger = new Logger("Canvas Video");

const MANIFEST_URL = (fileId: string) =>
  `https://spclient.wg.spotify.com/manifests/v9/json/sources/${fileId}/options/supports_drm`;

const VIDEO_CANVAS_TYPES = new Set(["VIDEO", "VIDEO_LOOPING", "VIDEO_LOOPING_RANDOM"]);

export type CanvasInfo = {
  fileId: string;
  type: string;
};

type ManifestProfile = {
  id: number;
  file_type: string;
  mime_type: string;
  video_codec: string;
  video_width: number;
  video_height: number;
  video_bitrate: number;
};

type Manifest = {
  contents: {
    segment_length: number;
    start_time_millis: number;
    end_time_millis: number;
    profiles: ManifestProfile[];
  }[];
  base_urls: string[];
  initialization_template: string;
  segment_template: string;
};

export type CanvasMedia = {
  fileId: string;
  type: string;
  mime: string;
  width: number;
  height: number;
  durationMs: number;
  init: ArrayBuffer;
  segments: ArrayBuffer[];
};

function toCanvasInfo(fileId: unknown, type: unknown): CanvasInfo | null {
  if (typeof fileId !== "string" || !fileId) return null;
  const canvasType = typeof type === "string" ? type : "VIDEO_LOOPING";
  if (!VIDEO_CANVAS_TYPES.has(canvasType)) return null;
  return { fileId, type: canvasType };
}

/** The playing track's canvas, straight from the player state. No request. */
export function GetPlayingCanvasInfo(): CanvasInfo | null {
  const item = Spicetify?.Player?.data?.item as { type?: string; metadata?: Record<string, string> } | undefined;
  if (!item || (item.type && item.type !== "track")) return null;
  const meta = item.metadata;
  return toCanvasInfo(meta?.["canvas.fileId"], meta?.["canvas.type"]);
}

const canvasInfoCache = new Map<string, Promise<CanvasInfo | null>>();

/** Any track's canvas, via the same GraphQL query Spotify's NPV uses. */
export function GetCanvasInfo(trackUri: string): Promise<CanvasInfo | null> {
  if (Spicetify?.Player?.data?.item?.uri === trackUri) {
    const playing = GetPlayingCanvasInfo();
    if (playing) return Promise.resolve(playing);
  }

  const cached = canvasInfoCache.get(trackUri);
  if (cached) return cached;

  const request = (async () => {
    const definition = Spicetify?.GraphQL?.Definitions?.canvas;
    if (!definition) return null;
    const res = await Spicetify.GraphQL.Request(definition, { trackUri });
    // An error response has no trackUnion; throwing keeps it out of the cache.
    if (!res?.data?.trackUnion) throw new Error(res?.errors?.[0]?.message ?? "No trackUnion");
    const canvas = res.data.trackUnion.canvas;
    return toCanvasInfo(canvas?.fileId, canvas?.type);
  })().catch((err) => {
    canvasLogger.warn("Canvas lookup failed", trackUri, err);
    canvasInfoCache.delete(trackUri);
    return null;
  });

  canvasInfoCache.set(trackUri, request);
  trimCache(canvasInfoCache, 50);
  return request;
}

function trimCache<K, V>(cache: Map<K, V>, max: number) {
  while (cache.size > max) {
    const oldest = cache.keys().next().value as K;
    cache.delete(oldest);
  }
}

/**
 * The best playable WebM profile: highest resolution, then highest bitrate.
 */
function pickProfile(profiles: ManifestProfile[]): ManifestProfile | null {
  const webm = profiles
    .filter((p) => p.file_type === "webm" && MediaSource.isTypeSupported(mimeFor(p)))
    .sort(
      (a, b) =>
        b.video_width * b.video_height - a.video_width * a.video_height ||
        b.video_bitrate - a.video_bitrate
    );
  return webm[0] ?? null;
}

const mimeFor = (p: ManifestProfile) => `video/webm; codecs="${p.video_codec}"`;

function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    promise.then(resolve, reject);
  });
}

async function fetchBuffer(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const res = await fetch(url, { signal, priority: "low" } as RequestInit);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.arrayBuffer();
}

// A 1080p loop is about 2 MB; keeping the last few (`cache.canvasMediaCacheSize`)
// saves a re-download on reopen or skip-back.
const mediaCache = new Map<string, Promise<CanvasMedia | null>>();

/**
 * Download a canvas loop: the init segment plus every media segment of the
 * best WebM profile.
 */
export function LoadCanvasMedia(info: CanvasInfo): Promise<CanvasMedia | null> {
  const key = info.fileId;
  const cached = mediaCache.get(key);
  if (cached) {
    // Refresh its LRU position.
    mediaCache.delete(key);
    mediaCache.set(key, cached);
    return cached;
  }

  const signal = AbortSignal.timeout(getRemoteConfig().canvas.loadTimeoutMs);
  const request = (async (): Promise<CanvasMedia | null> => {
    // CosmosAsync resolves an HTTP error as `{ code, message }` instead of rejecting, and its
    // `timeout` option does nothing, so both have to surface here as a throw. A resolved null
    // would stay cached and block every later attempt at this canvas until a reload.
    const manifest = (await untilAborted(
      Spicetify.CosmosAsync.get(MANIFEST_URL(info.fileId)),
      signal
    )) as Partial<Manifest> & { code?: number; message?: string };
    const content = manifest?.contents?.[0];
    const base = manifest?.base_urls?.[0];
    if (!content || !base || !manifest.initialization_template || !manifest.segment_template) {
      throw new Error(`Bad manifest: ${manifest?.code ?? "no code"} ${manifest?.message ?? ""}`.trim());
    }
    const { initialization_template, segment_template } = manifest;

    const profile = pickProfile(content.profiles ?? []);
    if (!profile) return null;

    const fill = (template: string, timestamp?: number) =>
      base +
      template
        .replace("{{profile_id}}", String(profile.id))
        .replace("{{file_type}}", profile.file_type)
        .replace("{{segment_timestamp}}", String(timestamp ?? 0));

    const segmentUrls: string[] = [];
    const stepMs = Math.max(1, content.segment_length) * 1000;
    for (let t = content.start_time_millis; t < content.end_time_millis; t += stepMs) {
      segmentUrls.push(fill(segment_template, Math.round(t / 1000)));
    }

    const [init, ...segments] = await Promise.all([
      fetchBuffer(fill(initialization_template), signal),
      ...segmentUrls.map((url) => fetchBuffer(url, signal)),
    ]);

    return {
      fileId: info.fileId,
      type: info.type,
      mime: mimeFor(profile),
      width: profile.video_width,
      height: profile.video_height,
      durationMs: content.end_time_millis - content.start_time_millis,
      init,
      segments,
    };
  })().catch((err) => {
    canvasLogger.warn("Canvas download failed", info.fileId, err);
    if (mediaCache.get(key) === request) mediaCache.delete(key);
    return null;
  });

  mediaCache.set(key, request);
  trimCache(mediaCache, getRemoteConfig().cache.canvasMediaCacheSize);
  return request;
}

/**
 * Feed a downloaded loop into `video` through Media Source Extensions. Resolves
 * once every segment is buffered. The returned function detaches it again.
 */
export async function AttachCanvasMedia(video: HTMLVideoElement, media: CanvasMedia): Promise<() => void> {
  const mediaSource = new MediaSource();
  const objectUrl = URL.createObjectURL(mediaSource);
  const detach = () => {
    URL.revokeObjectURL(objectUrl);
    // A newer attach may own the element by now; clearing its source would leave it blank.
    if (video.src !== objectUrl) return;
    video.removeAttribute("src");
    video.load();
  };

  video.src = objectUrl;
  try {
    await new Promise<void>((resolve, reject) => {
      mediaSource.addEventListener("sourceopen", () => resolve(), { once: true });
      video.addEventListener("error", () => reject(video.error), { once: true });
    });

    const buffer = mediaSource.addSourceBuffer(media.mime);
    const append = (data: ArrayBuffer) =>
      new Promise<void>((resolve, reject) => {
        buffer.addEventListener("updateend", () => resolve(), { once: true });
        buffer.addEventListener("error", () => reject(new Error("SourceBuffer append failed")), { once: true });
        // appendBuffer copies, so the cached buffers stay reusable for the next attach.
        buffer.appendBuffer(data);
      });

    await append(media.init);
    for (const segment of media.segments) await append(segment);
    if (mediaSource.readyState === "open") mediaSource.endOfStream();
  } catch (err) {
    detach();
    throw err;
  }

  return detach;
}
