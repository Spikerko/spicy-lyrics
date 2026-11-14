import type { AudioAnalysisData } from "./BackgroundAnimationController.ts";

/**
 * The music-driven clock behind the Kawarp backgrounds (the `musicReactiveBackground`
 * experiment). Kawarp's own clock eases toward a speed at a fixed share per frame, and the
 * speed itself was only updated ten times a second, so the flow barely followed the song.
 * Here the time handed to `renderFrame(time)` is integrated every frame from the playback
 * position:
 *
 * - **Energy:** the loudness envelope of the analysis segments, measured against the
 *   track's own quiet and loud parts (not absolute dB, which puts every modern master at
 *   the top) and smoothed over a couple of seconds. It sets the flow rate, so a chorus
 *   visibly moves faster than its verse.
 * - **Breathing:** energy also zooms the warp field in slightly, so loud passages swell.
 *
 * This file only does the arithmetic: no DOM, no player, nothing allocated per frame.
 */

// ─── Tuning ──────────────────────────────────────────────────────────────────

/**
 * One dial for how strongly the background moves while playing: it multiplies the flow
 * rate and the zoom. 1 is the baseline the constants below were tuned at. The paused
 * drift is never scaled.
 */
export const MOTION_INTENSITY = 1.5;

/** Flow rate (Kawarp time per second) at the track's quietest and loudest. */
const RATE_QUIET = 0.66;
const RATE_LOUD = 2.76;
/** Flow rate while paused, and the most reduced motion ever allows. */
export const PAUSED_RATE = 0.1;
/** Flow rate with no analysis to follow (local files, podcasts, a failed fetch). */
const RATE_UNANALYZED = 1.44;
/** Energy assumed with no analysis, which the real one eases away from once it arrives. */
const NEUTRAL_ENERGY = 0.35;

/** Energy smoothing: rises over about a second, falls over about three. */
const ENERGY_ATTACK = 1.1;
const ENERGY_RELEASE = 2.8;
/**
 * How far ahead of the playback position the envelope is read (seconds). The smoothing
 * above lags the music, so without a lead a loud part only visibly speeds the flow up a
 * beat or two after it starts; reading ahead lands the ramp on the change itself.
 */
const ENERGY_LEAD = 0.6;
/** Percentiles of segment loudness that map to energy 0 and 1. */
const ENERGY_LOW_PERCENTILE = 0.1;
const ENERGY_HIGH_PERCENTILE = 0.95;
/** Narrowest loudness window used for that mapping, so a flat track doesn't turn noise into motion (dB). */
const MIN_ENERGY_RANGE_DB = 6;

/** Zoom added at full energy. */
const SCALE_PER_ENERGY = 0.025;

/** Easing between playing and paused (time constant, seconds). */
const PLAY_EASE = 0.6;
/**
 * Easing of the music's hold on the motion, when it comes and goes: the gap between a
 * song change and its analysis, a track without one (time constant, seconds).
 */
const FOLLOW_EASE = 0.8;

/** Longest frame step integrated at once, so a stalled or hidden window doesn't jump the field (seconds). */
const MAX_FRAME_STEP = 0.1;

// ─── Track model ─────────────────────────────────────────────────────────────

/** One track's analysis, flattened into typed arrays for per-frame lookups. */
export class TrackMotion {
  /** Segment loudness envelope: three points per segment (start, peak, end). */
  private readonly envTime: Float64Array;
  private readonly envLoudness: Float32Array;
  private readonly sectionStart: Float64Array;
  private readonly sectionLoudness: Float32Array;
  private readonly quietDb: number;
  private readonly loudDb: number;

  private envCursor = 0;
  private sectionCursor = 0;

  constructor(data: AudioAnalysisData) {
    const segments = Array.isArray(data.segments) ? data.segments : [];
    const sections = Array.isArray(data.sections) ? data.sections : [];

    this.envTime = new Float64Array(segments.length * 3);
    this.envLoudness = new Float32Array(segments.length * 3);
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      const next = segments[i + 1];
      const peakAt = s.start + Math.min(Math.max(s.loudness_max_time, 0), s.duration);
      // loudness_end is 0 (not silence) on all but the last segment; the next one's start is the real value.
      const endDb = next ? next.loudness_start : (s.loudness_end ?? s.loudness_start);
      this.envTime[i * 3] = s.start;
      this.envLoudness[i * 3] = s.loudness_start;
      this.envTime[i * 3 + 1] = peakAt;
      this.envLoudness[i * 3 + 1] = s.loudness_max;
      this.envTime[i * 3 + 2] = s.start + s.duration;
      this.envLoudness[i * 3 + 2] = endDb;
    }

    this.sectionStart = Float64Array.from(sections, (s) => s.start);
    this.sectionLoudness = Float32Array.from(sections, (s) => s.loudness);

    // The track's own quiet and loud, weighted by how long each level lasts.
    const levels: [number, number][] = segments.length
      ? segments.map((s) => [s.loudness_max, s.duration])
      : sections.map((s) => [s.loudness, s.duration]);
    const quiet = weightedPercentile(levels, ENERGY_LOW_PERCENTILE);
    const loud = weightedPercentile(levels, ENERGY_HIGH_PERCENTILE);
    const mid = (quiet + loud) / 2;
    const half = Math.max(loud - quiet, MIN_ENERGY_RANGE_DB) / 2;
    this.quietDb = mid - half;
    this.loudDb = mid + half;
  }

  /** Energy 0..1 at `t`, unsmoothed. */
  energyAt(t: number): number {
    const db = this.envTime.length ? this.envelopeAt(t) : this.sectionLoudnessAt(t);
    if (db === null) return 0;
    return Math.min(1, Math.max(0, (db - this.quietDb) / (this.loudDb - this.quietDb)));
  }

  private envelopeAt(t: number): number | null {
    const times = this.envTime;
    if (t < times[0] || t >= times[times.length - 1]) return null;
    let i = this.envCursor;
    // Forward playback walks the cursor; anything else (a seek, a track restart) searches.
    if (i >= times.length - 1 || times[i] > t || t - times[i] > 2) {
      i = Math.max(0, upperBound(times, t) - 1);
    } else {
      while (i < times.length - 2 && times[i + 1] <= t) i++;
    }
    this.envCursor = i;
    const span = times[i + 1] - times[i];
    const f = span > 0 ? (t - times[i]) / span : 0;
    return this.envLoudness[i] + (this.envLoudness[i + 1] - this.envLoudness[i]) * f;
  }

  private sectionLoudnessAt(t: number): number | null {
    const starts = this.sectionStart;
    if (!starts.length || t < starts[0]) return null;
    let i = this.sectionCursor;
    if (i >= starts.length || starts[i] > t) i = 0;
    while (i < starts.length - 1 && starts[i + 1] <= t) i++;
    this.sectionCursor = i;
    return this.sectionLoudness[i];
  }
}

function weightedPercentile(values: [number, number][], p: number): number {
  const finite = values.filter(([v, w]) => Number.isFinite(v) && w > 0);
  if (!finite.length) return -20;
  finite.sort((a, b) => a[0] - b[0]);
  const total = finite.reduce((sum, [, w]) => sum + w, 0);
  let acc = 0;
  for (const [v, w] of finite) {
    acc += w;
    if (acc >= total * p) return v;
  }
  return finite[finite.length - 1][0];
}

/** Index of the first element greater than `t`. */
function upperBound(arr: Float64Array, t: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// ─── Clock ───────────────────────────────────────────────────────────────────

export interface MotionInput {
  /** Seconds since the previous step. */
  dt: number;
  /** Playback position in seconds. */
  position: number;
  playing: boolean;
  reducedMotion: boolean;
  /** The playing track's model, or null when there's no analysis to follow. */
  track: TrackMotion | null;
}

const ease = (dt: number, tau: number) => 1 - Math.exp(-dt / tau);

export class MotionClock {
  /** The time handed to Kawarp's renderFrame. */
  time = 0;
  /** Zoom handed to Kawarp, 1 at rest. */
  scale = 1;
  /** Current flow rate. The rest of the state below is public for probes only. */
  rate = RATE_UNANALYZED;

  energy = NEUTRAL_ENERGY;
  /** 1 while playing with motion allowed, 0 paused or under reduced motion; eased. */
  play = 0;
  /** 1 while an analysis drives the motion, 0 without one; eased. */
  follow = 0;

  /** Continue from `time`, e.g. Kawarp's own clock when this one takes over. */
  seed(time: number) {
    if (Number.isFinite(time)) this.time = time;
  }

  step({ dt: rawDt, position, playing, reducedMotion, track }: MotionInput) {
    const dt = Math.min(Math.max(rawDt, 0), MAX_FRAME_STEP);
    // Reduced motion holds the background at the paused drift, as Kawarp's own clock did.
    this.play += ((playing && !reducedMotion ? 1 : 0) - this.play) * ease(dt, PLAY_EASE);
    this.follow += ((track ? 1 : 0) - this.follow) * ease(dt, FOLLOW_EASE);

    const target = track ? track.energyAt(position + ENERGY_LEAD) : NEUTRAL_ENERGY;
    if (dt > 0) {
      const tau = target > this.energy ? ENERGY_ATTACK : ENERGY_RELEASE;
      this.energy += (target - this.energy) * ease(dt, tau);
    }

    const musicRate = RATE_QUIET + (RATE_LOUD - RATE_QUIET) * this.energy;
    const playingRate = (RATE_UNANALYZED + (musicRate - RATE_UNANALYZED) * this.follow) * MOTION_INTENSITY;
    this.rate = PAUSED_RATE + (playingRate - PAUSED_RATE) * this.play;
    this.time += dt * this.rate;

    this.scale = 1 + SCALE_PER_ENERGY * this.energy * MOTION_INTENSITY * this.play * this.follow;
    return this;
  }
}
