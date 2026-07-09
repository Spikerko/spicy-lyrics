import Global from "../../components/Global/Global.ts";
import { SpotifyPlayer } from "../../components/Global/SpotifyPlayer.ts";
import { PageContainer } from "../../components/Pages/PageView.ts";
import Logger from "../logger.ts";
import { LyricsObject, type LyricsType } from "../Lyrics/lyrics.ts";
import {
  $annotationDebug,
  $annotationMarkersEnabled,
  $annotationOpen,
  $annotationsEnabled,
  $annotationState,
  $currentAnnotations,
} from "./AnnotationState.ts";
import {
  annotationCacheKey,
  getCachedAnnotations,
  setCachedAnnotations,
} from "./AnnotationCache.ts";
import { matchLineAnnotations, normalizeLyricLine } from "./AnnotationMatcher.ts";
import { clearAllMarkers, renderMarkers, setMarkersVisible } from "./markers/AnnotationMarkers.ts";
import { getActiveProvider } from "./providers/AnnotationProvider.ts";
import { GeniusRequestError } from "./providers/GeniusAnnotationProvider.ts";
import type {
  AnchoredLyricAnnotation,
  AnnotationTrackMatch,
  RawLyricAnnotation,
  TrackMetadata,
} from "./types.ts";

type LyricsApplyPayload = {
  Type: LyricsType | "None" | string;
  Content: any;
};

const logger = new Logger("Annotations");
let initialized = false;
let currentAbortController: AbortController | null = null;
let sessionDisabled = false;
let failureCount = 0;
let lastApplyPayload: LyricsApplyPayload | null = null;

function abortCurrentRequest() {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
}

function getTrackMetadata(): TrackMetadata | null {
  const uri = SpotifyPlayer.GetUri();
  const title = SpotifyPlayer.GetName();
  if (!uri || !title || SpotifyPlayer.IsDJ()) return null;

  return {
    uri,
    spotifyTrackId: uri.split(":")[2],
    title,
    artists:
      SpotifyPlayer.GetArtists()
        ?.map((artist) => artist.name)
        .filter(Boolean) ?? [],
    album: SpotifyPlayer.GetAlbumName(),
    durationMs: SpotifyPlayer.GetDuration(),
  };
}

function extractOriginalLineTexts(
  type: string,
  content: any
): Array<{ index: number; text: string }> {
  if (!content) return [];

  if (type === "Static") {
    const sourceLines = Array.isArray(content) ? content : [];
    return LyricsObject.Types.Static.Lines.map((line, index) => ({
      index,
      text: line.HTMLElement.classList.contains("musical-line")
        ? ""
        : (sourceLines[index]?.Text ?? ""),
    }));
  }

  if (type === "Line") {
    const sourceLines = Array.isArray(content) ? content : [];
    let sourceIndex = 0;
    return LyricsObject.Types.Line.Lines.map((line, index) => {
      if (line.DotLine) return { index, text: "" };
      const text = sourceLines[sourceIndex]?.Text ?? "";
      sourceIndex++;
      return { index, text };
    });
  }

  if (type === "Syllable") {
    const sourceLines = Array.isArray(content) ? content : [];
    let sourceIndex = 0;
    return LyricsObject.Types.Syllable.Lines.map((line, index) => {
      if (line.DotLine || line.BGLine) return { index, text: "" };
      const syllables = sourceLines[sourceIndex]?.Lead?.Syllables ?? [];
      let text = "";
      for (let i = 0; i < syllables.length; i++) {
        const syllable = syllables[i];
        text += syllable.Text;
        if (i < syllables.length - 1 && !syllable.IsPartOfWord) {
          text += " ";
        }
      }
      sourceIndex++;
      return { index, text };
    });
  }

  return [];
}

async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (err) {
    const status = err instanceof GeniusRequestError ? err.status : undefined;
    if (status === 401 || status === 403 || (status !== undefined && status < 500)) throw err;
    await new Promise((resolve) => setTimeout(resolve, 400));
    return operation();
  }
}

function joinAnchors(
  annotations: RawLyricAnnotation[],
  anchors: ReturnType<typeof matchLineAnnotations>
): AnchoredLyricAnnotation[] {
  const rawById = new Map(annotations.map((annotation) => [annotation.id, annotation]));
  return anchors
    .map((anchor) => {
      const annotation = rawById.get(anchor.annotationId);
      if (!annotation) return null;
      return { ...annotation, anchor };
    })
    .filter((annotation): annotation is AnchoredLyricAnnotation => annotation !== null);
}

async function fetchRawAnnotations(
  track: TrackMetadata,
  signal: AbortSignal
): Promise<{ match: AnnotationTrackMatch | null; raw: RawLyricAnnotation[] }> {
  const provider = getActiveProvider();
  if (!provider) return { match: null, raw: [] };

  const cacheKey = annotationCacheKey(track.spotifyTrackId ?? track.uri, provider.id);
  const cached = await getCachedAnnotations(cacheKey);
  if (cached) return cached;

  const match = await withRetry(() => provider.searchTrack(track, signal));
  if (!match) return { match: null, raw: [] };

  const raw = await withRetry(() => provider.getAnnotations(match, signal));
  await setCachedAnnotations(cacheKey, { match, raw });
  return { match, raw };
}

function clearAnnotationsUI() {
  abortCurrentRequest();
  clearAllMarkers();
  $annotationOpen.set(null);
  $currentAnnotations.set([]);
}

async function applyAnnotations(payload: LyricsApplyPayload) {
  if (!$annotationsEnabled.get()) {
    clearAnnotationsUI();
    $annotationState.set({ status: "idle" });
    return;
  }

  clearAllMarkers();
  $annotationOpen.set(null);
  $currentAnnotations.set([]);

  const provider = getActiveProvider();
  if (!provider?.isConfigured()) {
    $annotationState.set({
      status: "unconfigured",
      uri: SpotifyPlayer.GetUri(),
      message: "Add a Genius token in Settings",
    });
    return;
  }

  if (sessionDisabled) {
    $annotationState.set({
      status: "disabled",
      uri: SpotifyPlayer.GetUri(),
      message: "Annotations paused after repeated errors - click to retry",
    });
    return;
  }

  const track = getTrackMetadata();
  if (!track || payload.Type === "None") {
    $annotationState.set({ status: "idle", uri: SpotifyPlayer.GetUri() });
    return;
  }

  abortCurrentRequest();
  const controller = new AbortController();
  currentAbortController = controller;
  $annotationState.set({ status: "loading", uri: track.uri });

  try {
    const { raw } = await fetchRawAnnotations(track, controller.signal);
    if (controller.signal.aborted || SpotifyPlayer.GetUri() !== track.uri) return;
    if (!$annotationsEnabled.get()) return;

    const lines = extractOriginalLineTexts(payload.Type, payload.Content);
    const anchors = matchLineAnnotations(lines, raw);
    const anchored = joinAnchors(raw, anchors);

    if (controller.signal.aborted || !$annotationsEnabled.get()) return;

    if ($annotationDebug.get()) {
      logger.debug(
        "Matched annotations",
        raw.map((annotation) => ({
          id: annotation.id,
          fragment: annotation.fragment,
          normalized: normalizeLyricLine(annotation.fragment),
          anchor: anchors.find((anchor) => anchor.annotationId === annotation.id) ?? null,
        }))
      );
    }

    failureCount = 0;
    $currentAnnotations.set(anchored);
    setMarkersVisible($annotationMarkersEnabled.get());
    if ($annotationMarkersEnabled.get()) {
      renderMarkers(payload.Type as LyricsType, anchored);
    }
    $annotationState.set({
      status: anchored.length > 0 ? "ready" : "empty",
      uri: track.uri,
      count: anchored.length,
    });
  } catch (err) {
    if (controller.signal.aborted) return;

    const status = err instanceof GeniusRequestError ? err.status : undefined;
    const message =
      status === 401 || status === 403
        ? "Invalid Genius token"
        : err instanceof Error
          ? err.message
          : "Could not load annotations";

    if (status !== 401 && status !== 403) {
      failureCount++;
    }

    if (failureCount >= 3) {
      sessionDisabled = true;
      $annotationState.set({
        status: "disabled",
        uri: track.uri,
        message: "Annotations paused after repeated errors - click to retry",
      });
      return;
    }

    $annotationState.set({ status: "error", uri: track.uri, message });
    logger.warn("Annotation load failed", message);
  } finally {
    if (currentAbortController === controller) {
      currentAbortController = null;
    }
  }
}

export function retryAnnotations() {
  sessionDisabled = false;
  failureCount = 0;
  if (lastApplyPayload) {
    queueMicrotask(() => {
      void applyAnnotations(lastApplyPayload!);
    });
  }
}

export function initAnnotations() {
  if (initialized) return;
  initialized = true;

  const applyId = Global.Event.listen("lyrics:apply", (payload: LyricsApplyPayload) => {
    lastApplyPayload = payload;
    queueMicrotask(() => {
      void applyAnnotations(payload);
    });
  });
  const notApplyId = Global.Event.listen("lyrics:not-apply", () => {
    abortCurrentRequest();
    clearAllMarkers();
    $currentAnnotations.set([]);
    $annotationOpen.set(null);
    if (!$annotationsEnabled.get()) {
      $annotationState.set({ status: "idle" });
    }
  });
  const songChangeId = Global.Event.listen("playback:songchange", () => {
    abortCurrentRequest();
    clearAllMarkers();
    $annotationOpen.set(null);
  });
  const markerPrefUnlisten = $annotationMarkersEnabled.listen((enabled) => {
    setMarkersVisible(enabled);
    PageContainer?.querySelector(".LyricsContainer .LyricsContent")?.classList.toggle(
      "annotations-markers-off",
      !enabled
    );
  });
  const enabledUnlisten = $annotationsEnabled.listen((enabled) => {
    if (!enabled) {
      clearAnnotationsUI();
      $annotationState.set({ status: "idle" });
    }
  });

  window.addEventListener(
    "beforeunload",
    () => {
      Global.Event.unListen(applyId);
      Global.Event.unListen(notApplyId);
      Global.Event.unListen(songChangeId);
      markerPrefUnlisten();
      enabledUnlisten();
      abortCurrentRequest();
      clearAllMarkers();
    },
    { once: true }
  );
}
