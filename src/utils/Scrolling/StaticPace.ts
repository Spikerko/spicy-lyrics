import { getDynamicAudioAnalysis } from "../audioAnalysis.ts";
import {
  DecodeVocalActivity,
  FetchMetadataExtension,
  MetadataExtension,
} from "../API/SpotifyMetadata.ts";
import type { StaticAutoScroll } from "../stores.ts";
import Logger from "../Logger.ts";

const logger = new Logger("Static Pace");

/**
 * How far through a song's lyrics the playback position is, 0 to 1. Built from a weight
 * curve over time: the lyrics move while the weight is 1 and hold while it is 0.
 */
export type StaticPace = (positionMs: number) => number;

// Below this the voice detector is reading instruments (they sit around 15).
const VOCAL_FLOOR = 30;
const VOCAL_FULL = 70;
// A song with less detected singing than this is treated as having no vocal data.
const MIN_SUNG_SECONDS = 10;
// Quieter than this counts as silence.
const SILENCE_DB = -35;
// Quiet stretches shorter than this are pauses inside the music, not breaks.
const MIN_BREAK_SECONDS = 3;

/** A pace from per-step weights: `weights[k]` covers `[start + k / rate, start + (k + 1) / rate)`. */
function paceFromWeights(
  start: number,
  rate: number,
  weights: ArrayLike<number>
): StaticPace | null {
  const sums = new Float64Array(weights.length + 1);
  for (let k = 0; k < weights.length; k++) sums[k + 1] = sums[k] + weights[k];
  const total = sums[weights.length];
  if (total <= 0) return null;
  return (positionMs) => {
    const x = (positionMs / 1000 - start) * rate;
    if (x <= 0) return 0;
    if (x >= weights.length) return 1;
    const k = Math.floor(x);
    return (sums[k] + weights[k] * (x - k)) / total;
  };
}

/** Moves while someone is singing, by the client's voice detection. */
async function vocalPace(uri: string): Promise<StaticPace | null> {
  if (!uri.startsWith("spotify:track:")) return null;
  const bytes = await FetchMetadataExtension(uri, MetadataExtension.VocalActivity);
  const vocals = bytes && DecodeVocalActivity(bytes);
  if (!vocals) return null;
  const weights = vocals.probabilities.map((p) =>
    Math.min(Math.max((p - VOCAL_FLOOR) / (VOCAL_FULL - VOCAL_FLOOR), 0), 1)
  );
  const sung = weights.reduce((a, b) => a + b, 0) / vocals.rate;
  if (sung < MIN_SUNG_SECONDS) return null;
  return paceFromWeights(vocals.offset, vocals.rate, weights);
}

/** Moves while the song isn't silent: skips quiet intros, outros and breaks of a few seconds. */
async function loudnessPace(uri: string): Promise<StaticPace | null> {
  const analysis = await getDynamicAudioAnalysis(uri);
  const segments = analysis?.segments;
  if (!segments?.length) return null;

  // Segments vary in length, so weigh them on a fixed 10 Hz grid.
  const rate = 10;
  const end = segments[segments.length - 1].start + segments[segments.length - 1].duration;
  const loud = new Uint8Array(Math.ceil(end * rate));
  for (const s of segments) {
    if (s.loudness_max <= SILENCE_DB) continue;
    loud.fill(1, Math.floor(s.start * rate), Math.ceil((s.start + s.duration) * rate));
  }
  // Short gaps between loud stretches are filled in; quiet ends never are.
  const first = loud.indexOf(1);
  const last = loud.lastIndexOf(1);
  if (first < 0) return null;
  let gapStart = -1;
  for (let k = first; k <= last; k++) {
    if (!loud[k] && gapStart < 0) gapStart = k;
    if (loud[k] && gapStart >= 0) {
      if (k - gapStart < MIN_BREAK_SECONDS * rate) loud.fill(1, gapStart, k);
      gapStart = -1;
    }
  }
  return paceFromWeights(0, rate, loud);
}

/** Even pace over the whole song. */
function linearPace(durationMs: number): StaticPace {
  return (positionMs) => (durationMs > 0 ? Math.min(Math.max(positionMs / durationMs, 0), 1) : 0);
}

const paces = new Map<string, Promise<StaticPace>>();

/**
 * The pace for a song in the given mode. Advanced falls back to Basic when a song has no voice
 * data, and Basic to an even pace when it has no audio analysis.
 */
export function GetStaticPace(
  uri: string,
  durationMs: number,
  mode: Exclude<StaticAutoScroll, "off">
): Promise<StaticPace> {
  const key = `${mode}:${uri}`;
  const cached = paces.get(key);
  if (cached) return cached;
  const pace = (async () => {
    // Off the frame that asked: the first vocal lookup scans the client's modules.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const vocal = mode === "advanced" ? await vocalPace(uri).catch(() => null) : null;
    const loudness = vocal ? null : await loudnessPace(uri).catch(() => null);
    logger.debug(`${mode}: pacing by ${vocal ? "vocals" : loudness ? "loudness" : "even pace"}`, uri);
    return vocal ?? loudness ?? linearPace(durationMs);
  })();
  paces.set(key, pace);
  while (paces.size > 20) paces.delete(paces.keys().next().value as string);
  return pace;
}
