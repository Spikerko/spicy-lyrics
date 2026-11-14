// @ts-ignore pkg has no @types on npm
import Spline from "cubic-spline";
import { easeSinOut } from "d3-ease";
import { $currentLyricsType, $rendererVisualStyle, isBloomRenderer } from "../../../../utils/stores.ts";
import {
  EarlySungBefore,
  LyricsObject,
  SimpleLyricsMode_LetterEffectsStrengthConfig,
  type SyllableLead,
  preHiddenDotLineMs,
} from "../../lyrics.ts";
import { BlurMultiplier, timeOffset } from "../Shared.ts";
import {
  isBgPopActive,
  isLyricsListMoving,
  setOnNewElementMounted,
  syncDetachedBackgroundLines,
} from "../../LyricsVirtualizer.ts";
import { Spring } from "../../../../modules/Spring.ts";
import { isExperimentEnabled } from "../../../experiments.ts";
import { GetRomanizedPieces, ROMANIZED_ROW_SIZE, UpdateRomanizedRow } from "../../Applyer/Utils/RomanizedRow.ts";
import { cubicBezier } from "../CubicBezier.ts";
/* import { CurveInterpolator } from "curve-interpolator"; */

// Define types for animation ranges
export interface AnimationPoint {
  Time: number;
  Value: number;
}

// Methods
export const GetSpline = (range: AnimationPoint[]) => {
  const times = range.map((value) => value.Time);
  const values = range.map((value) => value.Value);

  return new Spline(times, values);
};

export const Clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(value, max));
};

const LetterGlowMultiplier_Opacity = 185;

const ScaleRange = [
  { Time: 0, Value: 0.95 },
  { Time: 0.7, Value: 1.0505 /* 1.025 */ },
  { Time: 1, Value: 1 },
];

const LetterScaleRange = [
  { Time: 0, Value: 0.95 },
  { Time: 0.7, Value: 1.175 /* 1.025 */ },
  { Time: 1, Value: 1 },
];

const SimpleLetterScaleRange = [
  { Time: 0, Value: 0.95 },
  { Time: 0.7, Value: 1.07 },
  { Time: 1, Value: 1 },
];

const YOffsetRange = [
  { Time: 0, Value: 1 / 100 },
  { Time: 0.9, Value: -(1 / 60) },
  { Time: 1, Value: 0 },
];

const GlowRange = [
  { Time: 0, Value: 0 },
  { Time: 0.15, Value: 1 },
  { Time: 0.6, Value: 1 },
  { Time: 1, Value: 0 },
];

const SimpleYOffsetRange = [
  { Time: 0, Value: 1 / 100 },
  { Time: 1, Value: -0.033 },
];

const ScaleSpline = GetSpline(ScaleRange);
let LetterScaleSpline = GetSpline(
  isBloomRenderer() ? SimpleLetterScaleRange : LetterScaleRange
);
let YOffsetSpline = GetSpline(
  isBloomRenderer() ? SimpleYOffsetRange : YOffsetRange
);

const LetterYOffsetRange = [
  { Time: 0, Value: 1 / 100 },
  { Time: 0.9, Value: -(1 / 56) },
  { Time: 1, Value: 0 },
];


const SimpleLetterYOffsetRange = [
  { Time: 0, Value: 1 / 100 },
  { Time: 0.9, Value: -(1 / 62) },
  { Time: 1, Value: 0 },
];


let LetterYOffsetSpline = GetSpline(
  isBloomRenderer() ? SimpleLetterYOffsetRange : LetterYOffsetRange
);

const GlowSpline = GetSpline(GlowRange);

const YOffsetDamping = 0.4;
// const YOffsetFrequency = 1.25;
// const ScaleDamping = 0.6;
// const ScaleFrequency = 0.7;
// const GlowDamping = 0.5;
// const GlowFrequency = 1;
const YOffsetFrequency = 1.45;
const ScaleDamping = 0.64;
const ScaleFrequency = 0.88;
const GlowDamping = 0.56;
const GlowFrequency = 1.18;

const getDotOpacityRange = (simpleLyricsMode: boolean) => [
  // Controls element opacity
  { Time: 0, Value: simpleLyricsMode ? 0.27 : 0.35 }, // Resting (NotSung)
  { Time: 0.6, Value: 1 }, // Peak animation
  { Time: 1, Value: 1 }, // End (Sung)
];

// NEW Dot Animation Constants
const DotAnimations = {
  YOffsetDamping: 0.4,
  YOffsetFrequency: 1.25,
  ScaleDamping: 0.6,
  ScaleFrequency: 0.7,
  GlowDamping: 0.5,
  GlowFrequency: 1,
  OpacityDamping: 0.5,
  OpacityFrequency: 1,

  ScaleRange: [
    { Time: 0, Value: 0.75 }, // Resting (NotSung)
    { Time: 0.7, Value: 1.05 }, // Peak animation
    { Time: 1, Value: 1 }, // End (Sung)
  ],
  YOffsetRange: [
    // Relative to font-size
    { Time: 0, Value: 0 }, // Resting (NotSung)
    { Time: 0.9, Value: -0.12 }, // Peak animation
    { Time: 1, Value: 0 }, // End (Sung)
  ],
  GlowRange: [
    // Controls --text-shadow-opacity and --text-shadow-blur-radius indirectly
    { Time: 0, Value: 0 }, // Resting (NotSung)
    { Time: 0.6, Value: 1 }, // Peak animation
    { Time: 1, Value: 1 }, // End (Sung) - Note: Inspiration code ends at 1, might need adjustment based on visual needs
  ],
};

// DotGroup Animation Constants
const DotGroupAnimations = {
  YOffsetDamping: 0.4,
  YOffsetFrequency: 1.25,
  ScaleDamping: 0.7, // 0.6
  ScaleFrequency: 5, // 4

  ScaleRange: [
    // Time is actually real-time (so in seconds)
    {
      Time: 0,
      Value: 0,
    },
    {
      Time: 0.2,
      Value: 1.05,
    },
    {
      Time: -0.075,
      Value: 1.15,
    },
    {
      Time: -0,
      Value: 0,
    }, // Rest
  ],
  OpacityRange: [
    {
      Time: 0,
      Value: 0,
    },
    {
      Time: 0.5,
      Value: 1,
    },
    {
      Time: -0.075,
      Value: 1,
    },
    {
      Time: -0,
      Value: 0,
    }, // Rest
  ],
  YOffsetRange: [
    // This is relative to the font-size
    {
      Time: 0,
      Value: 1 / 100,
    }, // Lowest
    {
      Time: 0.9,
      Value: -(1 / 60),
    }, // Highest
    {
      Time: 1,
      Value: 0,
    }, // Rest
  ],
};

const DotScaleSpline = GetSpline(DotAnimations.ScaleRange);
const DotYOffsetSpline = GetSpline(DotAnimations.YOffsetRange);
const DotGlowSpline = GetSpline(DotAnimations.GlowRange);
let DotOpacitySpline = GetSpline(getDotOpacityRange(isBloomRenderer()));

const createLetterSprings = () => {
  return {
    Scale: new Spring(LetterScaleSpline.at(0), ScaleFrequency, ScaleDamping),
    YOffset: new Spring(LetterYOffsetSpline.at(0), YOffsetFrequency, YOffsetDamping),
    Glow: new Spring(GlowSpline.at(0), GlowFrequency, GlowDamping),
  };
};

$rendererVisualStyle.subscribe((style) => {
  const simpleLyricsMode = style === "bloom";
  YOffsetSpline = GetSpline(simpleLyricsMode ? SimpleYOffsetRange : YOffsetRange);
  DotOpacitySpline = GetSpline(getDotOpacityRange(simpleLyricsMode));
  LetterYOffsetSpline = GetSpline(simpleLyricsMode? SimpleLetterYOffsetRange : LetterYOffsetRange);
  LetterScaleSpline = GetSpline(simpleLyricsMode ? SimpleLetterScaleRange : LetterScaleRange);
});

// DotGroup splines
//const DotGroupScaleSpline = GetSpline(DotGroupAnimations.ScaleRange);
/* const DotGroupYOffsetSpline = new CurveInterpolator(
	DotGroupAnimations.YOffsetRange.map((metadata) => [metadata.Time, metadata.Value])
); */
//const DotGroupOpacitySpline = GetSpline(DotGroupAnimations.OpacityRange);

const SungLetterGlow = 0.2;

// Bloom: the letters of a short held word are
// emphasised. Each letter in turn swells from its baseline and glows, pushing
// its neighbours away from the middle of the word, then eases back. Letters set
// off min(40% of the word / letters, 400 ms) apart; each one swells for
// 2 × the word / letters before easing back, and both phases last as long as
// the word (at most 3 s), so a short word's letters let go before they are full
// and a long word's letters hold. A one-second word only glows; it reaches full
// size at two seconds. As it sets off, each letter lifts like a word does.
const RefreshedEmphasis = {
  // How much bigger a letter gets, at full strength.
  Scale: 0.14,
  // Strength grows from nothing at FromMs to full at ToMs.
  FromMs: 1000,
  ToMs: 2000,
  // Letters set off across this share of the word, at most MaxStaggerMs apart.
  Stagger: 0.4,
  MaxStaggerMs: 400,
  // Neither the swell nor the ease back takes longer than this.
  MaxPhaseMs: 3000,
  // The glow: white, at most this alpha, blurred by BlurEm + BlurPx.
  GlowAlpha: 0.5,
  BlurEm: 0.17,
  BlurPx: 1,
};

// Bloom: a word (or a split letter) lifts the moment it is
// sung, on a stiff, barely underdamped spring, and stays up. Lift is in em.
const RefreshedLift = {
  Em: 0.0588,
  // Angular frequency (rad/s) and damping ratio.
  Omega: 5,
  Damping: 0.93,
};

type RefreshedWaveStrength = { Duration: number };

function getRefreshedWaveStrength(duration: number): RefreshedWaveStrength {
  return { Duration: Math.max(1, duration) };
}

const emphasisEase = cubicBezier(0.25, 0.1, 0.25, 1);

type SplitLetter = NonNullable<SyllableLead["Letters"]>[number];
// What the wave needs of a letter: a line's split letters, or a romanized row's.
type FlameLetter = { HTMLElement: HTMLElement; StartTime: number };

// 0 to 1: how far a lift `elapsed` ms old has come.
function getRefreshedLift(elapsed: number): number {
  if (elapsed <= 0) return 0;
  const { Omega: w, Damping: z } = RefreshedLift;
  const t = elapsed / 1000;
  const decay = Math.exp(-z * w * t);
  if (decay < 1e-4) return 1;
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - decay * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
}

// Split letters' widths in em, measured once.
const _letterWidthsEm = new WeakMap<HTMLElement, number>();

function getLetterWidthsEm(letters: readonly FlameLetter[]): number[] {
  const first = letters[0]?.HTMLElement;
  if (first && !_letterWidthsEm.has(first)) {
    const fontPx = parseFloat(getComputedStyle(first).fontSize) || 0;
    // Not laid out yet: measure on a later frame instead of keeping zeros.
    if (fontPx > 0 && first.offsetWidth > 0) {
      for (const letter of letters) {
        _letterWidthsEm.set(letter.HTMLElement, letter.HTMLElement.offsetWidth / fontPx);
      }
    }
  }
  return letters.map((letter) => _letterWidthsEm.get(letter.HTMLElement) ?? 0);
}

// Every letter of the word this frame, worked out together since each letter's
// push depends on the ones between it and the middle.
type RefreshedFlameState = {
  // Set when every letter is at rest, not started (0) or settled and lifted
  // (1); the arrays are then empty.
  Rest?: 0 | 1;
  Scale: number[];
  // Sideways push and lift, in em.
  X: number[];
  Y: number[];
  Glow: number[];
  Moving: boolean[];
};

const restingFlame = (rest: 0 | 1): RefreshedFlameState => ({
  Rest: rest,
  Scale: [],
  X: [],
  Y: [],
  Glow: [],
  Moving: [],
});
const FlameBefore = restingFlame(0);
const FlameAfter = restingFlame(1);

function getRefreshedFlame(
  letters: readonly FlameLetter[],
  position: number,
  strength: RefreshedWaveStrength
): RefreshedFlameState {
  const E = RefreshedEmphasis;
  const n = Math.max(1, letters.length);
  const duration = strength.Duration;
  const phase = Math.min(duration, E.MaxPhaseMs);
  const stagger = Math.min((E.Stagger * duration) / n, E.MaxStaggerMs);
  const holdMs = (2 * duration) / n;
  const peak = E.Scale * (Clamp(duration / E.FromMs, 1, E.ToMs / E.FromMs) - 1);
  const held = emphasisEase(Math.min(1, holdMs / phase));
  const elapsed = position - (letters[0]?.StartTime ?? 0);
  if (elapsed <= 0) return FlameBefore;
  const lastAt = elapsed - (n - 1) * stagger;
  if (lastAt >= holdMs + phase && getRefreshedLift(lastAt) === 1) return FlameAfter;

  const scale: number[] = [];
  const glow: number[] = [];
  const y: number[] = [];
  const moving: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const at = elapsed - i * stagger;
    let amount = 0;
    if (at > 0 && at < holdMs) amount = emphasisEase(Math.min(1, at / phase));
    else if (at >= holdMs) amount = held * (1 - emphasisEase(Math.min(1, (at - holdMs) / phase)));
    const lift = getRefreshedLift(at);
    scale.push(1 + peak * amount);
    glow.push(E.GlowAlpha * amount);
    y.push(-RefreshedLift.Em * lift);
    moving.push(at < holdMs + phase || lift < 1);
  }

  // Each letter grows about its middle, so it is moved out by half its own
  // growth on the side away from the middle of the word, plus half of the push
  // the letter inside it got.
  const widths = getLetterWidthsEm(letters);
  const half = scale.map((s, i) => ((s - 1) * (widths[i] ?? 0)) / 2);
  const x: number[] = Array.from({ length: n }, () => 0);
  const middle = n % 2 === 0 ? n / 2 - 0.5 : Math.floor(n / 2);
  const leftStart = Number.isInteger(middle) ? middle - 1 : Math.floor(middle);
  const rightStart = Number.isInteger(middle) ? middle + 1 : Math.ceil(middle);
  for (let i = leftStart; i >= 0; i--) {
    let push = half[i];
    if (i + 1 <= middle) push += half[i + 1];
    if (i + 1 < middle) push += Math.abs(x[i + 1]);
    x[i] = -push / 2;
  }
  for (let i = rightStart; i < n; i++) {
    let push = half[i];
    if (i - 1 >= middle) push += half[i - 1];
    if (i - 1 > middle) push += Math.abs(x[i - 1]);
    x[i] = push / 2;
  }

  return { Scale: scale, X: x, Y: y, Glow: glow, Moving: moving };
}

// A word sung in several split syllables swells as one: the flame is worked out
// once a frame over all its letters and each syllable takes its own slice.
let _groupFlames = new Map<object, RefreshedFlameState>();
let _groupFlamesAt = NaN;

const sliceFlame = (flame: RefreshedFlameState, from: number, count: number): RefreshedFlameState =>
  flame.Rest !== undefined
    ? flame
    : {
        Scale: flame.Scale.slice(from, from + count),
        X: flame.X.slice(from, from + count),
        Y: flame.Y.slice(from, from + count),
        Glow: flame.Glow.slice(from, from + count),
        Moving: flame.Moving.slice(from, from + count),
      };

function getWordFlame(word: SyllableLead, position: number): RefreshedFlameState {
  const group = word.FlameGroup;
  if (!group) {
    return getRefreshedFlame(
      word.Letters!,
      position,
      getRefreshedWaveStrength(word.EndTime - word.StartTime)
    );
  }
  if (position !== _groupFlamesAt) {
    _groupFlames = new Map();
    _groupFlamesAt = position;
  }
  let flame = _groupFlames.get(group);
  if (!flame) {
    flame = getRefreshedFlame(
      group.Letters,
      position,
      getRefreshedWaveStrength(group.EndTime - group.StartTime)
    );
    _groupFlames.set(group, flame);
  }
  return sliceFlame(flame, word.FlameOffset ?? 0, word.Letters?.length ?? 0);
}

// Bloom: how far a word has lifted, 0 to 1. Split words lift
// letter by letter instead (getRefreshedFlame).
function getRefreshedFloat(startTime: number, position: number): number {
  return getRefreshedLift(position - startTime);
}

const refreshedLiftOffset = (lift: number) => -RefreshedLift.Em * lift;

// Bloom: the fill runs along the whole line as one soft
// edge. Each word used to sweep a gradient across its own box
// only, so the edge went out of sight at the end of every word (and of every
// split letter) and came back in at the start of the next: the light stopped
// at each one. Here the words are laid end to end on one strip (each box
// already holds the space after it), the edge crosses each word in that
// word's time and waits where the last one ended through a gap, and every word
// and letter reads its --SLM_GradientPosition off it. The fade so spills into
// the next word while the one before is finishing.
//
// The fade trails the light: as a word is sung, the far end of the fade runs
// from where the light already is to a little past the word, by a share of the
// fade width (Reach). So a finished word is lit up to most of its length and
// the rest of it waits, dimming, for the next word to carry the light on. The
// last word of each wrapped row takes the fade past its end; a split word
// keeps it close, and once a row's last word is done the rest of the row
// lights up in RushMs. Each row starts dim again.
const RefreshedSweep = {
  // Mixed.css --SLR_FadeWidth, in em.
  FadeEm: 0.882,
  Reach: {
    RowEnd: 1,
    // Words of two letters or fewer, then longer ones.
    Short: 0.5,
    Word: 0.25,
    // Split (emphasized) words, short and longer.
    ShortSplit: 0.25,
    Split: 0.12,
  },
  RushMs: 500,
};

type SweepSpan = {
  X: number;
  W: number;
  // Split letters: where each one starts in the word, and how wide it is.
  LetterX: number[] | null;
  LetterW: number[] | null;
  // How far past the word the fade's far end goes, as a share of the fade.
  Reach: number;
  // First and last word on its wrapped row.
  RowStart: boolean;
  RowEnd: boolean;
};

function getSweepReach(word: SyllableLead, rowEnd: boolean): number {
  const R = RefreshedSweep.Reach;
  const letters = word.WordLetters ?? word.Letters?.length ?? (word.HTMLElement.textContent ?? "").trim().length;
  if (word.LetterGroup) return letters <= 2 ? R.ShortSplit : R.Split;
  if (rowEnd) return R.RowEnd;
  return letters <= 2 ? R.Short : R.Word;
}

type LineSweep = {
  // One per word of the line; null for an interlude dot.
  Spans: (SweepSpan | null)[];
  Fade: number;
  // Where the edge is for each word this frame, in px along the strip;
  // -Infinity while no light has reached it.
  Edges: number[];
};

const _lineSweeps = new WeakMap<HTMLElement, LineSweep>();
const _sweepLineSizes = new WeakMap<Element, { W: number; H: number }>();
let _sweepResize: ResizeObserver | null = null;
// The line list the sweeps were measured for. Every apply makes a new one, and
// the observer then lets go of the old lines, whatever state they were left in.
let _sweptLines: unknown[] | null = null;

function resetLineSweeps(lines: unknown[]): void {
  if (lines === _sweptLines) return;
  _sweptLines = lines;
  _sweepResize?.disconnect();
}

// Measured once a line is being sung, and again when its size changes, since
// the type is sized to the window. Height counts too: in Popup Lyrics the type
// also follows the window's height, which changes the font without changing
// the line's width.
function getLineSweep(lineEl: HTMLElement, words: SyllableLead[]): LineSweep | null {
  const kept = _lineSweeps.get(lineEl);
  if (kept && kept.Spans.length === words.length) return kept;
  const spans: (SweepSpan | null)[] = [];
  const tops: number[] = [];
  let x = 0;
  let fontPx = 0;
  for (const word of words) {
    if (word.Dot) {
      spans.push(null);
      tops.push(0);
      continue;
    }
    const width = word.HTMLElement.offsetWidth;
    tops.push(word.HTMLElement.offsetTop);
    let letterX: number[] | null = null;
    let letterW: number[] | null = null;
    if (word.LetterGroup && word.Letters) {
      letterX = [];
      letterW = [];
      let lx = 0;
      for (const letter of word.Letters) {
        const lw = letter.HTMLElement.offsetWidth;
        letterX.push(lx);
        letterW.push(lw);
        lx += lw;
      }
    }
    if (!fontPx) fontPx = parseFloat(getComputedStyle(word.HTMLElement).fontSize) || 0;
    spans.push({
      X: x,
      W: width,
      LetterX: letterX,
      LetterW: letterW,
      Reach: 0,
      RowStart: false,
      RowEnd: false,
    });
    x += width;
  }
  // Not laid out: nothing to sweep, and nothing kept.
  if (x <= 0 || fontPx <= 0) return null;
  // Rows: a word sitting lower than the one before it starts a new one.
  let prev = -1;
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    if (!span) continue;
    if (prev < 0 || tops[i] > tops[prev] + 1) {
      span.RowStart = true;
      if (prev >= 0) spans[prev]!.RowEnd = true;
    }
    prev = i;
  }
  if (prev >= 0) spans[prev]!.RowEnd = true;
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    if (span) span.Reach = getSweepReach(words[i], span.RowEnd);
  }
  const sweep: LineSweep = {
    Spans: spans,
    Fade: fontPx * RefreshedSweep.FadeEm,
    Edges: Array.from({ length: words.length }, () => -Infinity),
  };
  _lineSweeps.set(lineEl, sweep);
  _sweepResize ??= new ResizeObserver((entries) => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      const prev = _sweepLineSizes.get(entry.target);
      if (prev !== undefined && (prev.W !== width || prev.H !== height)) {
        _lineSweeps.delete(entry.target as HTMLElement);
      }
      _sweepLineSizes.set(entry.target, { W: width, H: height });
    }
  });
  _sweepResize.observe(lineEl);
  return sweep;
}

function dropLineSweep(lineEl: HTMLElement): void {
  if (!_lineSweeps.delete(lineEl)) return;
  _sweepLineSizes.delete(lineEl);
  _sweepResize?.unobserve(lineEl);
}

// With Keep Syllable Pace, how far across a joined word the light is, from 0 to 1. Each letter
// fills over its own time, so a long syllable takes longer to cross than a quick one.
function getPacedShare(word: SyllableLead, span: SweepSpan, position: number): number | null {
  const letters = word.Letters;
  const { LetterX: lx, LetterW: lw } = span;
  if (!letters?.length || !lx || !lw || letters.length !== lx.length) return null;
  const width = lx[lx.length - 1] + lw[lw.length - 1];
  if (width <= 0) return null;
  let x = 0;
  for (let j = 0; j < letters.length; j++) {
    const letter = letters[j];
    if (position < letter.StartTime) break;
    const length = letter.EndTime - letter.StartTime;
    const filled = length > 0 ? Math.min(1, (position - letter.StartTime) / length) : 1;
    x = lx[j] + lw[j] * filled;
    if (filled < 1) break;
  }
  return Math.min(1, x / width);
}

function updateLineSweep(sweep: LineSweep, words: SyllableLead[], position: number): void {
  const { Spans: spans, Edges: edges } = sweep;
  const half = sweep.Fade / 2;
  // Where each word has carried the light to, as the middle of the fade. A
  // word starts the fade wholly before it (each row starts dim), or where the
  // word before it left it, and takes its far end Reach past the word.
  let reached = -Infinity;
  let carried = -Infinity;
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    if (!span) continue;
    const word = words[i];
    const start = span.X - half;
    const from = span.RowStart ? start : Math.max(start, carried);
    const to = Math.max(from, span.X + span.W + sweep.Fade * span.Reach - half);
    carried = to;
    let at = -Infinity;
    if (position >= word.EndTime) {
      at = to;
      // The end of a row lights up the rest of it.
      const lit = span.X + span.W + half;
      if (span.RowEnd && to < lit) {
        at = to + (lit - to) * Math.min(1, (position - word.EndTime) / RefreshedSweep.RushMs);
      }
    } else if (position > word.StartTime) {
      const paced = word.Paced ? getPacedShare(word, span, position) : null;
      const share = paced ?? (position - word.StartTime) / (word.EndTime - word.StartTime);
      at = from + (to - from) * share;
    }
    edges[i] = at;
    if (at > reached) reached = at;
  }
  // A word being sung shows its own edge, so two words sung across each other
  // both fill. One still to come is lit only by the words before it on its row,
  // never by a later one sung early. One already sung follows the light
  // wherever it is.
  let before = -Infinity;
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    if (!span) continue;
    if (span.RowStart) before = -Infinity;
    const word = words[i];
    const at = edges[i];
    if (position >= word.EndTime) edges[i] = reached;
    else if (position <= word.StartTime) edges[i] = before;
    if (at > before) before = at;
  }
}

// --SLM_GradientPosition for a box at `x`, `width` wide, with the edge at
// `edge`: -50 is fully dim and 100 fully lit (see Mixed.css).
function getSweepGradientPosition(edge: number, x: number, width: number, fade: number): number {
  if (edge === -Infinity) return -50;
  const rest = (width + fade / 2 - (edge - x)) / (width + fade);
  return Clamp(100 - 150 * rest, -50, 100);
}

function getSweepLetterPosition(sweep: LineSweep, wordIndex: number, letterIndex: number): number | null {
  const span = sweep.Spans[wordIndex];
  if (!span?.LetterX || !span.LetterW || letterIndex >= span.LetterX.length) return null;
  return getSweepGradientPosition(
    sweep.Edges[wordIndex],
    span.X + span.LetterX[letterIndex],
    span.LetterW[letterIndex],
    sweep.Fade
  );
}

// The tone a split letter is drawn at, from its --SLM_GradientPosition (-50 dim,
// 100 lit), as --SLR_LetterLit; its glow is dimmed by it (Mixed.css). The
// tones are Mixed.css --SLR_Unlit and --SLR_Lit.
const LetterTone = { Unlit: 0.18, Lit: 0.94 };
function setLetterLit(letter: FlameLetter, gradient: number): void {
  const lit = Clamp((gradient + 50) / 150, 0, 1);
  const tone = LetterTone.Unlit + (LetterTone.Lit - LetterTone.Unlit) * lit;
  setStyleIfChanged(letter.HTMLElement, "--SLR_LetterLit", tone.toFixed(3), 0.005);
}

// Writes everything about one split letter but its gradient. Returns whether
// the letter is still moving.
function stepRefreshedLetter(
  letter: FlameLetter,
  index: number,
  flame: RefreshedFlameState,
  liftScale = 1
): boolean {
  const E = RefreshedEmphasis;
  const scale = flame.Scale[index] ?? 1;
  const x = flame.X[index] ?? 0;
  const y = (flame.Y[index] ?? -RefreshedLift.Em * (flame.Rest ?? 0)) * liftScale;
  const glow = flame.Glow[index] ?? 0;
  const moving = flame.Moving[index] ?? false;
  // Rounded first: a letter resting a hair off zero would otherwise keep a
  // translate3d(0em, 0em, 0), and its compositor layer, for good. Only at rest, so
  // a moving letter passing zero doesn't drop its layer and take it back.
  const tx = x.toFixed(4);
  const ty = y.toFixed(4);
  const still = (x === 0 && y === 0) || (!moving && Number(tx) === 0 && Number(ty) === 0);
  setStyleIfChanged(letter.HTMLElement, "transform", still ? "none" : `translate3d(${tx}em, ${ty}em, 0)`);
  setStyleIfChanged(letter.HTMLElement, "scale", `${scale}`, moving ? 0.0005 : 0);
  setStyleIfChanged(
    letter.HTMLElement,
    "--text-shadow-blur-radius",
    `calc(${E.BlurEm}em + ${E.BlurPx}px)`
  );
  setStyleIfChanged(letter.HTMLElement, "--text-shadow-opacity", `${glow * 100}%`, moving ? 0.5 : 0);
  return moving;
}

// Promote an element to its own compositor layer for GPU-accelerated animations.
// Only lines go through here. Words, letters and dots get their layer from CSS
// (Mixed.css) while their line is Active: an inline will-change on every word
// kept a few hundred layers alive, and the compositor paid for each of them on
// every frame even though only the active line's words move.
function promoteToGPU(el: HTMLElement): void {
  // Hint to the browser that transform and opacity will change frequently
  el.style.willChange = "transform, opacity, text-shadow, scale";
  // Avoid costly repaints due to backface rendering
  el.style.backfaceVisibility = "hidden";
}

const _gpuPromotedLines = new WeakSet<HTMLElement>();

// The largest rest offset (in --DefaultLyricsSize) a settled word's transform is cleared at.
const PARK_OFFSET = 0.0005;

// A settled line's words rest a few thousandths of a pixel off zero, and a
// translate3d() keeps each of them on its own compositor layer until the line
// unmounts. Clearing a transform that close to zero drops the layer and moves
// nothing. The cache keeps the resting value, so only real movement writes it again.
function parkSettledLine(lineEl: HTMLElement): void {
  for (const el of lineEl.querySelectorAll<HTMLElement>(".word, .letterGroup")) {
    const offset = _styleCache.get(el)?.get("transform");
    if (typeof offset !== "number" || Math.abs(offset) > PARK_OFFSET || !el.style.transform) continue;
    queueStyle(el, "transform", "");
  }
}

// Lines blur through text-shadow, never `filter`: hinting filter only bought
// each line an extra offscreen render pass.
function promoteLineToGPU(el: HTMLElement): void {
  if (_gpuPromotedLines.has(el)) return;
  promoteToGPU(el);
  _gpuPromotedLines.add(el);
}

// Last written value per property: a number when comparable, else the raw string.
const _styleCache = new WeakMap<HTMLElement, Map<string, number | string>>();
// Queue for batched style writes
const _styleQueue = new Map<HTMLElement, Map<string, string>>();

function queueStyle(el: HTMLElement, prop: string, value: string): void {
  let props = _styleQueue.get(el);
  if (!props) {
    props = new Map<string, string>();
    _styleQueue.set(el, props);
  }
  props.set(prop, value);
}

// `compareValue` is the number behind values parseFloat can't read, like
// translate3d(); without it those fall back to exact string equality and a
// spring's endless sub-pixel decay rewrites the style every frame.
function setStyleIfChanged(
  el: HTMLElement,
  prop: string,
  value: string,
  epsilon = 0,
  compareValue?: number
): void {
  let map = _styleCache.get(el);
  if (!map) {
    map = new Map();
    _styleCache.set(el, map);
  }
  let next: number | string = compareValue ?? parseFloat(value);
  if (Number.isNaN(next)) next = value;
  const prev = map.get(prop);
  if (prev !== undefined) {
    if (typeof prev === "number" && typeof next === "number") {
      if (Math.abs(prev - next) <= epsilon) return;
    } else if (prev === next) {
      return;
    }
  }
  queueStyle(el, prop, value);
  map.set(prop, next);
}

// classList.add/remove queue a MutationObserver record even when nothing changes.
// True when the class changed.
function setClass(el: HTMLElement, cls: string, on: boolean): boolean {
  if (el.classList.contains(cls) === on) return false;
  el.classList.toggle(cls, on);
  return true;
}

// Flags the sung lines that come after an active one (overlapping lines,
// background vocals), so Minimal Lyrics Mode can keep them visible instead of
// fading every sung line out. Done here rather than with a :has() selector so
// a line change doesn't make Blink re-check the page's ancestors. `first` is
// the first active line index from the frame's main loop (-1 when none), so
// only the lines after it are looked at. Last frame's marks are cleared by
// element, so a line the virtualizer has since unmounted doesn't keep its
// class.
//
// Spicy Lyric Translator puts its rows right after the line they translate and
// hides the row of every sung line. A line followed by one isn't flagged, so it
// stays hidden along with its translation rather than showing without it.
const TRANSLATION_ROW_CLASSES = ["slt-interleaved-translation", "slt-replace-line", "slt-romanization-line"];
const hasTranslationRow = (line: HTMLElement): boolean => {
  const next = line.nextElementSibling;
  return !!next && TRANSLATION_ROW_CLASSES.some((cls) => next.classList.contains(cls));
};
// Two lists swapped each frame, so the frame loop doesn't allocate one.
let sungAfterMarked: HTMLElement[] = [];
let sungAfterSpare: HTMLElement[] = [];
function markSungAfterActive(
  lines: { HTMLElement: HTMLElement; StartTime: number; EndTime: number }[],
  position: number,
  first: number
): void {
  if (first === -1 && sungAfterMarked.length === 0) return;
  const marked = sungAfterSpare;
  marked.length = 0;
  if (first !== -1) {
    for (let i = first + 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.HTMLElement.isConnected) continue;
      if (getElementState(position, line.StartTime, line.EndTime) !== "Sung") continue;
      if (hasTranslationRow(line.HTMLElement)) continue;
      setClass(line.HTMLElement, "SungAfterActive", true);
      marked.push(line.HTMLElement);
    }
  }
  for (const el of sungAfterMarked) {
    if (!marked.includes(el)) setClass(el, "SungAfterActive", false);
  }
  sungAfterSpare = sungAfterMarked;
  sungAfterMarked = marked;
}

// Background Vocal Pop-Out (experiment): flags a background line with
// GroupActive while it or its lead line (the nearest line above that isn't a
// background line) is Active. Mixed.css collapses the line without it and the
// virtualizer sizes the row from it. Kept on every line, mounted or not, so a
// row that mounts mid-song is sized right from its first measure.
//
// Once both have been sung the line only folds while the list is scrolling
// itself. A fold moves every row below it, and the virtualizer can only keep
// the line being followed in place by re-aiming a scroll that is still moving;
// on a list at rest it would leave that line off centre. Until then it stays
// open as a sung line, and folds with the next scroll.
//
// Off, it makes one pass to clear the marks left from when it was on, then
// returns at once.
//
// The virtualizer only sees class changes on mounted rows, so lines flipped
// while unmounted are handed to it after the pass, to resize their rows.
let bgGroupsMarked = false;
const bgDetachedFlips: HTMLElement[] = [];
function markBackgroundGroups(
  lines: { HTMLElement: HTMLElement; StartTime: number; EndTime: number; BGLine?: boolean }[],
  position: number,
  enabled: boolean
): void {
  if (!enabled && !bgGroupsMarked) return;
  bgGroupsMarked = enabled;
  let leadState: "NotSung" | "Active" | "Sung" = "NotSung";
  let moving: boolean | null = null;
  for (const line of lines) {
    const state = getElementState(position, line.StartTime, line.EndTime);
    if (!line.BGLine) {
      leadState = state;
      continue;
    }
    let open = enabled && (leadState === "Active" || state === "Active");
    if (
      enabled &&
      !open &&
      leadState === "Sung" &&
      state === "Sung" &&
      line.HTMLElement.classList.contains("GroupActive")
    ) {
      moving ??= isLyricsListMoving();
      open = !moving;
    }
    if (setClass(line.HTMLElement, "GroupActive", open) && !line.HTMLElement.isConnected) {
      bgDetachedFlips.push(line.HTMLElement);
    }
  }
  if (bgDetachedFlips.length > 0) {
    syncDetachedBackgroundLines(bgDetachedFlips);
    bgDetachedFlips.length = 0;
  }
}

// Bloom interlude. The dots fade in one after another, then
// fill from dim to lit in turn, each over its own share of the interlude; the
// last one finishes as the group leaves. The group breathes in whole cycles of
// at least four seconds about its middle. To leave it swells, then shrinks
// and fades away, finishing as the pre-hidden collapse (Mixed.css) closes the
// line.
const RefreshedDots = {
  Dim: 0.18,
  Lit: 0.94,
  EnterMs: 750, // one dot's fade-in, accelerating
  EnterStaggerMs: 50,
  BreathMs: 4000, // the shortest breath
  BreathScale: 0.2,
  // Leaving: the swell, then the shrink and fade.
  ExitGrowMs: 750,
  ExitShrinkMs: 250,
  ExitScale: 0.5,
};

const dotFillEase = cubicBezier(0, 0.25, 1, 0.58);
const dotExitEase = cubicBezier(0.25, 0, 1, 0.2);

// Each half of a breath: a slow start and a slower settle.
const dotBreathEase = cubicBezier(0.5, 0.02, 0.42, 0.98);

// The group's scale over one breath, x from 0 to 1: up to the top, then back.
function dotBreath(x: number): number {
  const extra = RefreshedDots.BreathScale;
  return x < 0.5
    ? 1 + extra * dotBreathEase(x * 2)
    : 1 + extra - extra * dotBreathEase((x - 0.5) * 2);
}

type TimedElement = { HTMLElement: HTMLElement; StartTime: number; EndTime: number };

function animateRefreshedDot(
  line: { StartTime: number; EndTime: number },
  dot: TimedElement,
  index: number,
  position: number
): void {
  const D = RefreshedDots;
  const el = dot.HTMLElement;
  const group = el.parentElement;
  const count = Math.max(1, group?.children.length ?? 3);
  const elapsed = position - line.StartTime;
  // When the group starts to leave.
  const exitAt = Math.max(0, line.EndTime - line.StartTime - preHiddenDotLineMs - D.ExitGrowMs);
  const share = (exitAt + D.ExitGrowMs) / count;

  let fill: number;
  if (index < count - 1) {
    fill = dotFillEase(Clamp((elapsed - index * share) / share, 0, 1));
  } else {
    // The last dot gets what's left before the exit, then fills the rest
    // evenly while the group swells.
    const from = index * share;
    const room = Math.max(1, exitAt - from);
    const reached = Math.min(1, room / share);
    fill =
      elapsed < exitAt
        ? reached * dotFillEase(Clamp((elapsed - from) / room, 0, 1))
        : reached + (1 - reached) * Clamp((elapsed - exitAt) / D.ExitGrowMs, 0, 1);
  }
  const enter = Clamp((elapsed - index * D.EnterStaggerMs) / D.EnterMs, 0, 1) ** 2;
  const opacity = (D.Dim + (D.Lit - D.Dim) * fill) * enter;
  setStyleIfChanged(el, "opacity", `${opacity}`, 0.001);
  setStyleIfChanged(el, "scale", "1", 0.001);
  setStyleIfChanged(el, "transform", "translate3d(0, calc(var(--DefaultLyricsSize) * 0), 0)", 0.0001, 0);
  setStyleIfChanged(el, "--text-shadow-opacity", "0%", 1);

  // The group, once per line. On `transform`, since the collapse animates the
  // group's `scale`.
  if (index !== 0 || !group) return;
  const breathScale = (at: number) => {
    const cycles = Math.floor(exitAt / D.BreathMs);
    if (cycles < 1) return 1;
    const length = exitAt / cycles;
    return dotBreath((Clamp(at, 0, exitAt) % length) / length);
  };
  let scale: number;
  let groupOpacity = 1;
  if (elapsed < exitAt) {
    scale = breathScale(elapsed);
  } else if (elapsed < exitAt + D.ExitGrowMs) {
    const from = breathScale(exitAt);
    const top = 1 + D.BreathScale;
    scale = from + (top - from) * emphasisEase((elapsed - exitAt) / D.ExitGrowMs);
  } else {
    const x = dotExitEase(Clamp((elapsed - exitAt - D.ExitGrowMs) / D.ExitShrinkMs, 0, 1));
    scale = 1 + D.BreathScale + (D.ExitScale - 1 - D.BreathScale) * x;
    groupOpacity = 1 - x;
  }
  setStyleIfChanged(group, "transform", `scale(${scale})`, 0.0005, scale);
  setStyleIfChanged(group, "opacity", `${groupOpacity}`, 0.001);
}

// Takes the breath back off a group the previous look is animating.
function resetDotGroupBreath(dot: TimedElement): void {
  const group = dot.HTMLElement.parentElement;
  if (!group) return;
  const cache = _styleCache.get(group);
  const prev = cache?.get("transform");
  if (prev !== undefined && prev !== 1) setStyleIfChanged(group, "transform", "scale(1)", 0, 1);
  const prevOpacity = cache?.get("opacity");
  if (prevOpacity !== undefined && prevOpacity !== 1) setStyleIfChanged(group, "opacity", "1", 0);
}

function flushStyleBatch(): void {
  if (_styleQueue.size === 0) return;
  for (const [el, props] of _styleQueue) {
    for (const [prop, value] of props) {
      el.style.setProperty(prop, value);
    }
  }
  _styleQueue.clear();
}

const createWordSprings = () => {
  if (isBloomRenderer()) {
    return {
      Scale: {
        Step: () => {},
        SetGoal: () => {},
      },
      /* YOffset: {
        Step: () => {},
        SetGoal: () => {},
      }, */
      // Refreshed: critically damped, so the word comes up and stops with no overshoot.
      YOffset: new Spring(
        YOffsetSpline.at(0),
        YOffsetFrequency,
        1
      ),
      Glow: {
        Step: () => {},
        SetGoal: () => {},
      },
    };
  }
  return {
    Scale: new Spring(ScaleSpline.at(0), ScaleFrequency, ScaleDamping),
    YOffset: new Spring(YOffsetSpline.at(0), YOffsetFrequency, YOffsetDamping),
    Glow: new Spring(GlowSpline.at(0), GlowFrequency, GlowDamping),
  };
};

// NEW Dot Springs Function
const createDotSprings = () => {
  if (isBloomRenderer()) {
    return {
      Scale: {
        Step: () => {},
        SetGoal: () => {},
      },
      YOffset: {
        Step: () => {},
        SetGoal: () => {},
      },
      Glow: {
        Step: () => {},
        SetGoal: () => {},
      },
      Opacity: new Spring(
        DotOpacitySpline.at(0),
        DotAnimations.OpacityFrequency,
        DotAnimations.OpacityDamping
      ),
    };
  }
  return {
    Scale: new Spring(
      DotScaleSpline.at(0),
      DotAnimations.ScaleFrequency,
      DotAnimations.ScaleDamping
    ),
    YOffset: new Spring(
      DotYOffsetSpline.at(0),
      DotAnimations.YOffsetFrequency,
      DotAnimations.YOffsetDamping
    ),
    Glow: new Spring(DotGlowSpline.at(0), DotAnimations.GlowFrequency, DotAnimations.GlowDamping),
    Opacity: new Spring(
      DotOpacitySpline.at(0),
      DotAnimations.OpacityFrequency,
      DotAnimations.OpacityDamping
    ),
  };
};

// DotGroup Springs Function - for animating the entire dotGroup element
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _createDotGroupSprings = () => {
  /*   if (isBloomRenderer()) {
    return {
      Scale: {
        Step: () => {},
        SetGoal: () => {},
      },
      YOffset: {
        Step: () => {},
        SetGoal: () => {},
      },
      Opacity: {
        Step: () => {},
        SetGoal: () => {},
      },
    }
  } */
  return {
    Scale: new Spring(0, DotGroupAnimations.ScaleFrequency, DotGroupAnimations.ScaleDamping),
    YOffset: new Spring(0, DotGroupAnimations.YOffsetFrequency, DotGroupAnimations.YOffsetDamping),
    Opacity: new Spring(0, DotGroupAnimations.YOffsetFrequency, DotGroupAnimations.YOffsetDamping),
  };
};

// Visual Constants
const LineGlowRange = [
  {
    Time: 0,
    Value: 0,
  },
  {
    Time: 0.5,
    Value: 1,
  },
  {
    Time: 1,
    Value: 0,
  },
];
const LineGlowSpline = GetSpline(LineGlowRange);

const LineGlowDamping = 0.5;
const LineGlowFrequency = 1;

const createLineSprings = () => {
  if (isBloomRenderer()) {
    return {
      Glow: {
        Step: () => {},
        SetGoal: () => {},
      },
    };
  }
  return {
    Glow: new Spring(LineGlowSpline.at(0), LineGlowFrequency, LineGlowDamping),
  };
};

// Animated Romanization and Translation (experiment): the rows under an active
// line move like the lyrics. A syllable row's pieces get a word's springs and
// targets (the sweep itself is written by UpdateRomanizedRow, on the word's
// scale); a translation row or plain romanization row gets a line-synced
// line's sweep and glow, through variables on the line that its rows read
// (Mixed.css). The rows sit at 0.65 opacity, so their glow is a word's or a
// line's divided by that, to read as strongly. Real springs whatever the mode,
// so it moves in Simple Lyrics Mode too.
const ROW_OPACITY = 0.65;
type RowSprings = { Scale: Spring; YOffset: Spring; Glow: Spring };
const pieceSprings = new WeakMap<HTMLElement, RowSprings>();
const underLineGlow = new WeakMap<HTMLElement, Spring>();

function animateUnderRows(
  lineElem: HTMLElement,
  startTime: number,
  endTime: number,
  position: number,
  deltaTime: number
): void {
  const lineProgress = getProgressPercentage(position, startTime, endTime);
  let lineGlow = underLineGlow.get(lineElem);
  if (!lineGlow) {
    lineGlow = new Spring(LineGlowSpline.at(0), LineGlowFrequency, LineGlowDamping);
    underLineGlow.set(lineElem, lineGlow);
  }
  lineGlow.SetGoal(LineGlowSpline.at(lineProgress));
  const glow = lineGlow.Step(deltaTime);
  setStyleIfChanged(lineElem, "--UnderLinePosition", `${(lineProgress * 100).toFixed(1)}%`);
  setStyleIfChanged(lineElem, "--UnderLineGlowBlur", `${4 + 8 * glow}px`, 0.5);
  setStyleIfChanged(lineElem, "--UnderLineGlowOpacity", `${(glow * 0.5) / ROW_OPACITY}`, 0.01);

  stepRomanizedWords(lineElem, position, deltaTime, false);
  romanizedRowsSettling.add(lineElem);
}

// A syllable row's pieces, animated as the line's words are: the same states,
// splines, springs and properties (scale, transform, --gradient-position,
// --text-shadow-*), and the same CSS (Mixed.css). Lift and glow blur are scaled
// to the row's size, so it moves like a smaller line. They start from the
// word's resting style (set when the row is built) and, once the line has
// been sung, settle to rest the way its words do. Returns whether every spring
// has come to rest.
//
// Under Bloom they move as Bloom's words do instead (stepBloomRomanizedRow):
// the fill is one soft edge along the whole row, a piece lifts the moment it
// is sung and stays up, a held piece's letters swell and glow in turn, and
// once the line has been sung they come back down with its words (`liftLeft`
// is how much of the lift is still left, 1 while the line is being sung).
// Fade, lift, push and glow blur are in em, so they follow the row's size.

const romanizedRowsSettling = new WeakSet<HTMLElement>();

function stepRomanizedWords(
  lineElem: HTMLElement,
  position: number,
  deltaTime: number,
  sung: boolean,
  liftLeft = 1
): boolean {
  const pieces = GetRomanizedPieces(lineElem);
  if (!pieces) return true;
  if (isBloomRenderer()) return stepBloomRomanizedRow(pieces, position, sung, liftLeft);
  let settled = true;
  for (const piece of pieces) {
    const el = piece.HTMLElement;
    // A held piece is timed by its letters' window, as a letter group is.
    const start = piece.Letters ? piece.LettersStart! : piece.StartTime;
    const end = piece.Letters ? piece.LettersEnd! : piece.EndTime;
    const state = sung ? "Sung" : getElementState(position, start, end);
    const percentage = getProgressPercentage(position, start, end);
    const at = state === "Active" ? percentage : state === "Sung" ? 1 : 0;
    if (piece.Letters) {
      if (!stepRomanizedLetters(piece.Letters, state, position, deltaTime, sung)) settled = false;
    } else {
      const gradient = state === "Active" ? -20 + 120 * percentage : state === "Sung" ? 100 : -20;
      setStyleIfChanged(el, "--gradient-position", `${gradient}%`);
    }

    let springs = pieceSprings.get(el);
    if (!springs) {
      springs = {
        Scale: new Spring(ScaleSpline.at(0), ScaleFrequency, ScaleDamping),
        YOffset: new Spring(YOffsetSpline.at(0), YOffsetFrequency, YOffsetDamping),
        Glow: new Spring(GlowSpline.at(0), GlowFrequency, GlowDamping),
      };
      pieceSprings.set(el, springs);
    }
    springs.Scale.SetGoal(ScaleSpline.at(at));
    springs.YOffset.SetGoal(YOffsetSpline.at(at));
    springs.Glow.SetGoal(GlowSpline.at(at));
    const scale = springs.Scale.Step(deltaTime);
    const lift = springs.YOffset.Step(deltaTime) * ROMANIZED_ROW_SIZE;
    const glow = springs.Glow.Step(deltaTime);
    setStyleIfChanged(el, "scale", `${scale}`, 0.001);
    setStyleIfChanged(el, "transform", `translate3d(0, calc(var(--DefaultLyricsSize) * ${lift}), 0)`, 0.0001, lift);
    setStyleIfChanged(el, "--text-shadow-blur-radius", `${(4 + 2 * glow) * ROMANIZED_ROW_SIZE}px`, 0.3);
    setStyleIfChanged(el, "--text-shadow-opacity", `${Math.min(glow * 35, 100)}%`, 1);
    if (sung && settled) {
      settled = springs.Scale.CanSleep() && springs.YOffset.CanSleep() && springs.Glow.CanSleep();
    }
  }
  return settled;
}

// A held piece's letters, as a letter group's: the letter being sung swells and
// lifts with its neighbours falling off around it, each letter fills on its own
// eased sweep, and sung letters keep a faint glow while none is active.
const letterSprings = new WeakMap<HTMLElement, RowSprings>();

function stepRomanizedLetters(
  letters: readonly { HTMLElement: HTMLElement; StartTime: number; EndTime: number }[],
  wordState: "NotSung" | "Active" | "Sung",
  position: number,
  deltaTime: number,
  sung: boolean
): boolean {
  let activeIndex = -1;
  let activePercentage = 0;
  if (wordState === "Active") {
    for (let i = 0; i < letters.length; i++) {
      if (getElementState(position, letters[i].StartTime, letters[i].EndTime) === "Active") {
        activeIndex = i;
        activePercentage = getProgressPercentage(position, letters[i].StartTime, letters[i].EndTime);
        break;
      }
    }
  }

  let settled = true;
  for (let k = 0; k < letters.length; k++) {
    const letter = letters[k];
    const letterState = sung ? "Sung" : getElementState(position, letter.StartTime, letter.EndTime);
    const gradient =
      letterState === "NotSung"
        ? -20
        : letterState === "Sung"
          ? 100
          : k === activeIndex
            ? -20 + 120 * easeSinOut(activePercentage)
            : -20;
    setStyleIfChanged(letter.HTMLElement, "--gradient-position", `${gradient}%`);

    let springs = letterSprings.get(letter.HTMLElement);
    if (!springs) {
      springs = createLetterSprings();
      letterSprings.set(letter.HTMLElement, springs);
    }
    const restScale = LetterScaleSpline.at(0);
    const restY = LetterYOffsetSpline.at(0);
    const restGlow = GlowSpline.at(0);
    let targetScale = restScale;
    let targetY = restY;
    let targetGlow = restGlow;
    if (activeIndex !== -1) {
      const distance = Math.abs(k - activeIndex);
      const falloff = Math.max(0, 1 / (1 + Math.pow(distance, 2.8)));
      const glowFalloff = Math.max(0, 1 / (1 + distance * 0.9));
      targetScale = restScale + (LetterScaleSpline.at(activePercentage) - restScale) * falloff;
      targetY = restY + (LetterYOffsetSpline.at(activePercentage) - restY) * falloff;
      targetGlow = restGlow + (GlowSpline.at(activePercentage) - restGlow) * glowFalloff;
    }
    if (wordState === "Sung") {
      // The word is over: its letters settle to the sung pose, glow gone.
      targetScale = LetterScaleSpline.at(1);
      targetY = LetterYOffsetSpline.at(1);
      targetGlow = GlowSpline.at(1);
    } else if (wordState === "NotSung" || letterState === "NotSung") {
      targetScale = restScale;
      targetY = restY;
      targetGlow = restGlow;
    } else if (letterState === "Sung" && activeIndex === -1) {
      // Between letters of a word still being sung, the sung ones keep a faint glow.
      targetGlow = GlowSpline.at(SungLetterGlow);
    }
    springs.Scale.SetGoal(targetScale);
    springs.YOffset.SetGoal(targetY);
    springs.Glow.SetGoal(targetGlow);
    const scale = springs.Scale.Step(deltaTime);
    const lift = springs.YOffset.Step(deltaTime) * 2 * ROMANIZED_ROW_SIZE;
    const glow = springs.Glow.Step(deltaTime);
    setStyleIfChanged(
      letter.HTMLElement,
      "transform",
      `translate3d(0, calc(var(--DefaultLyricsSize) * ${lift}), 0)`,
      0.0001,
      lift
    );
    setStyleIfChanged(letter.HTMLElement, "scale", `${scale}`, 0.001);
    setStyleIfChanged(letter.HTMLElement, "--text-shadow-blur-radius", `${(4 + 12 * glow) * ROMANIZED_ROW_SIZE}px`, 0.3);
    setStyleIfChanged(letter.HTMLElement, "--text-shadow-opacity", `${glow * LetterGlowMultiplier_Opacity}%`, 1);
    if (sung && settled) {
      settled = springs.Scale.CanSleep() && springs.YOffset.CanSleep() && springs.Glow.CanSleep();
    }
  }
  return settled;
}

type RomanizedPieces = NonNullable<ReturnType<typeof GetRomanizedPieces>>;

// The row's own sweep, measured like the line's: its pieces stand in for words
// (a held piece for a split word), on the row element.
function getRowSweep(pieces: RomanizedPieces): LineSweep | null {
  const row = pieces[0]?.HTMLElement.closest<HTMLElement>(".RomanizedRow");
  return row ? getLineSweep(row, pieces as unknown as SyllableLead[]) : null;
}

function stepBloomRomanizedRow(
  pieces: RomanizedPieces,
  position: number,
  sung: boolean,
  liftLeft: number
): boolean {
  // A sung row is one flat tone (Mixed.css), so only a row being sung sweeps.
  const sweep = sung ? null : getRowSweep(pieces);
  if (sweep) updateLineSweep(sweep, pieces as unknown as SyllableLead[], position);
  let settled = !(sung && liftLeft > 0);
  // No piece stands higher than the one before it, as with the line's words.
  let floatCap = 1;
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    const el = piece.HTMLElement;
    const span = sweep?.Spans[i];
    // Not measured yet: each piece fills over its own time.
    const own = sung ? 100 : -50 + 150 * getProgressPercentage(position, piece.StartTime, piece.EndTime);
    setStyleIfChanged(el, "scale", "1");
    if (piece.Letters) {
      // Its letters lift one by one instead.
      setStyleIfChanged(el, "transform", "none");
      const flame = getRefreshedFlame(
        piece.Letters,
        position,
        getRefreshedWaveStrength(piece.EndTime - piece.StartTime)
      );
      for (let k = 0; k < piece.Letters.length; k++) {
        const letter = piece.Letters[k];
        const gradient = (sweep && getSweepLetterPosition(sweep, i, k)) ?? own;
        setStyleIfChanged(letter.HTMLElement, "--SLM_GradientPosition", `${gradient}%`);
        setLetterLit(letter, gradient);
        if (stepRefreshedLetter(letter, k, flame, liftLeft)) settled = false;
      }
      continue;
    }
    const gradient = span ? getSweepGradientPosition(sweep!.Edges[i], span.X, span.W, sweep!.Fade) : own;
    setStyleIfChanged(el, "--SLM_GradientPosition", `${gradient}%`);
    floatCap = Math.min(floatCap, getRefreshedLift(position - piece.StartTime));
    const y = (refreshedLiftOffset(floatCap) * liftLeft).toFixed(4);
    setStyleIfChanged(el, "transform", Number(y) === 0 ? "none" : `translate3d(0, ${y}em, 0)`);
    setStyleIfChanged(el, "--text-shadow-opacity", "0%");
  }
  return settled;
}

// Steps a sung line's syllable row to rest; called until it gets there.
function settleRomanizedWords(lineElem: HTMLElement, position: number, sungAt: number, deltaTime: number): void {
  if (!romanizedRowsSettling.has(lineElem)) return;
  const liftLeft = isBloomRenderer() ? 1 - getRefreshedLift(position - sungAt) : 1;
  if (stepRomanizedWords(lineElem, position, deltaTime, true, liftLeft)) romanizedRowsSettling.delete(lineElem);
}

export let Blurring_LastLine: number | null = null;
//const SKIP_ANIMATING_ACTIVE_WORD_DURATION = 235;
let lastFrameTime = performance.now();

// When the virtualizer mounts a previously off-screen element, reset
// Blurring_LastLine so that applyBlur runs on the next animation frame and
// writes the correct --BlurAmount to the freshly connected element.
setOnNewElementMounted(() => {
  Blurring_LastLine = null;
});

export function findActiveElement(currentTime: number): any {
  const ProcessedPosition = currentTime + timeOffset;
  const CurrentLyricsType = $currentLyricsType.get();

  if (!CurrentLyricsType || CurrentLyricsType === "None") return null;

  if (CurrentLyricsType === "Syllable") {
    const lines = LyricsObject.Types.Syllable.Lines;
    for (const line of lines) {
      if (getElementState(ProcessedPosition, line.StartTime, line.EndTime) === "Active") {
        if (line.DotLine && line.Syllables?.Lead) {
          const dotArray = line.Syllables.Lead;
          for (const dot of dotArray) {
            if (getElementState(ProcessedPosition, dot.StartTime, dot.EndTime) === "Active") {
              return [dot, "dot"];
            }
          }
        } else if (line.Syllables?.Lead) {
          const words = line.Syllables.Lead;
          for (const word of words) {
            if (word.Dot) continue;
            if (getElementState(ProcessedPosition, word.StartTime, word.EndTime) === "Active") {
              if (word.LetterGroup && word.Letters) {
                for (const letter of word.Letters) {
                  if (
                    getElementState(ProcessedPosition, letter.StartTime, letter.EndTime) ===
                    "Active"
                  ) {
                    return [letter, "letter"];
                  }
                }
              }
              return [word, word.LetterGroup ? "letterGroup" : "word"];
            }
          }
        }
        return [line, "line"];
      }
    }
  } else if (CurrentLyricsType === "Line") {
    const lines = LyricsObject.Types.Line.Lines;
    for (const line of lines) {
      if (getElementState(ProcessedPosition, line.StartTime, line.EndTime) === "Active") {
        if (line.DotLine && line.Syllables?.Lead) {
          const dotArray = line.Syllables.Lead;
          for (const dot of dotArray) {
            if (getElementState(ProcessedPosition, dot.StartTime, dot.EndTime) === "Active") {
              return [dot, "dot"];
            }
          }
        }
        return [line, "line"];
      }
    }
  }

  return null;
}

export function setBlurringLastLine(c: number | null) {
  Blurring_LastLine = c;
}

// Bloom's early scroll (Popup Lyrics, Now Playing card) moves on to a line
// before it starts; a line above it that has finished singing is shown as
// sung from then on, even while its time runs on to the next line.
function getBloomLineState(
  state: "NotSung" | "Active" | "Sung",
  line: { EndTime: number; LeadEndTime?: number },
  index: number,
  position: number
): "NotSung" | "Active" | "Sung" {
  if (state !== "Active" || index >= EarlySungBefore) return state;
  return position >= (line.LeadEndTime ?? line.EndTime) ? "Sung" : state;
}

function getElementState(
  currentTime: number,
  startTime: number,
  endTime: number
): "NotSung" | "Active" | "Sung" {
  if (currentTime < startTime) return "NotSung";
  if (currentTime >= endTime) return "Sung";
  return "Active";
}

function getProgressPercentage(currentTime: number, startTime: number, endTime: number): number {
  if (currentTime <= startTime) return 0;
  if (currentTime >= endTime) return 1;
  return (currentTime - startTime) / (endTime - startTime);
}

let lastAnimateFrameTime = 0;

export function Animate(position: number): void {
  const ProcessedPosition = position + timeOffset - (isBloomRenderer() ? 33.5 : 0);
  const refreshedSimple =
    isBloomRenderer();
  const animatedRows = isExperimentEnabled("animatedUnderRows");
  // Spline point split letters wait at before they're sung: shrunk and low
  // normally, plain text under the refreshed wave (which starts from rest).
  const letterRest = refreshedSimple ? 1 : 0;

  const now = performance.now();

  const deltaTime = (now - lastFrameTime) / 1000;
  lastFrameTime = now;
  lastAnimateFrameTime = now;

  const CurrentLyricsType = $currentLyricsType.get();

  resetLineSweeps(LyricsObject.Types.Syllable.Lines);

  if (!CurrentLyricsType || CurrentLyricsType === "None") return;

  // Define proper types for the arrays and indices
  const applyBlur = (
    arr: Array<{ HTMLElement: HTMLElement; StartTime: number; EndTime: number }>,
    activeIndex: number,
    blurMultiplierValue: number
  ): void => {
    if (!arr[activeIndex]) return;

    // Promote line elements for filter changes
    promoteLineToGPU(arr[activeIndex].HTMLElement);

    const max = BlurMultiplier * 5 + BlurMultiplier * 0.465;

    for (let i = 0; i < arr.length; i++) {
      const el = arr[i].HTMLElement;
      // The virtualizer only mounts a small window of elements at a time.
      // Skip elements that are not in the DOM — writing styles to detached
      // elements is wasteful: it populates _styleQueue with hundreds of entries
      // that flushStyleBatch() then has to flush (style.setProperty on each),
      // creating a large burst of DOM work every time the active line changes.
      // When an off-screen element is later mounted, the next active-line change
      // will call applyBlur again and catch it with the correct values.
      if (!el.isConnected) continue;
      const state = getElementState(ProcessedPosition, arr[i].StartTime, arr[i].EndTime);
      const distance = Math.abs(i - activeIndex);
      const blurAmount = distance === 0 ? 0 : Math.min(blurMultiplierValue * distance, max);

      // Active elements and the active line get zero blur
      const value = state === "Active" || distance === 0 ? "0px" : `${blurAmount}px`;

      // Cache + batch style writes to avoid thrash
      setStyleIfChanged(el, "--BlurAmount", value, 0.25);

      // Hint filter changes to the compositor
      promoteLineToGPU(el);
    }
  };

  /* const applyDistance = (arr: Array<{HTMLElement: HTMLElement; StartTime: number; EndTime: number}>,
                     activeIndex: number): void => {
      if (!arr[activeIndex]) return;

      arr[activeIndex].HTMLElement.style.setProperty("--active-line-distance", "0");

      for (let i = activeIndex + 1; i < arr.length; i++) {
          if (getElementState(ProcessedPosition, arr[i].StartTime, arr[i].EndTime) === "Active") {
            arr[i].HTMLElement.style.setProperty("--active-line-distance", "0");
          } else {
            const maxDist = arr.length - 1 - activeIndex;
            const dist = i - activeIndex;
            const newDist = maxDist - dist + 1;
            arr[i].HTMLElement.style.setProperty("--active-line-distance", `${newDist}`);
          }
      }

      for (let i = activeIndex - 1; i >= 0; i--) {
          if (getElementState(ProcessedPosition, arr[i].StartTime, arr[i].EndTime) === "Active") {
            arr[i].HTMLElement.style.setProperty("--active-line-distance", "0");
          } else {
            const maxDist = activeIndex;
            const dist = activeIndex - i;
            const newDist = maxDist - dist + 1;
            arr[i].HTMLElement.style.setProperty("--active-line-distance", `${newDist}`);
          }
      }
  }; */

  /* const applyScale = (arr: Array<{HTMLElement: HTMLElement; StartTime: number; EndTime: number}>,
                     activeIndex: number): void => {
      if (!arr[activeIndex]) return;

      arr[activeIndex].HTMLElement.style.setProperty("--scale-amount", "0");

      const baseScale = 0.95;
      const falloff = 0.018;

      for (let i = activeIndex + 1; i < arr.length; i++) {
          const distance = i - activeIndex;
          const amount = Math.max(0, baseScale - (falloff * distance));
          if (getElementState(ProcessedPosition, arr[i].StartTime, arr[i].EndTime) === "Active") {
              arr[i].HTMLElement.style.setProperty("--scale-amount", "0");
          } else {
              arr[i].HTMLElement.style.setProperty("--scale-amount", `${amount}`);
          }
      }

      for (let i = activeIndex - 1; i >= 0; i--) {
          const distance = activeIndex - i;
          const amount = Math.max(0, baseScale - (falloff * distance));
          if (getElementState(ProcessedPosition, arr[i].StartTime, arr[i].EndTime) === "Active") {
            arr[i].HTMLElement.style.setProperty("--scale-amount", `0`);
          } else {
            arr[i].HTMLElement.style.setProperty("--scale-amount", `${amount}`);
          }
      }
  }; */

  // Whether every mounted line has been sung, for LinesAllSung below.
  let mountedLine: HTMLElement | null = null;
  let anyLineUnsung = false;
  // First active line index, for markSungAfterActive below.
  let firstActive = -1;
  const noteActiveLine = (index: number) => {
    if (firstActive === -1) firstActive = index;
  };

  if (CurrentLyricsType === "Syllable") {
    const arr = LyricsObject.Types.Syllable.Lines;
    markBackgroundGroups(arr, ProcessedPosition, isBgPopActive());

    // Sweeps are measured here, before this frame changes any class, so the
    // reads don't force a layout. A line's words are as wide before it turns
    // Active as after.
    if (refreshedSimple) {
      for (const line of arr) {
        if (!line.HTMLElement.isConnected || !line.Syllables?.Lead) continue;
        if (getElementState(ProcessedPosition, line.StartTime, line.EndTime) === "Active") {
          getLineSweep(line.HTMLElement, line.Syllables.Lead);
          const rowPieces = animatedRows ? GetRomanizedPieces(line.HTMLElement) : undefined;
          if (rowPieces) getRowSweep(rowPieces);
        }
      }
    }

    for (let index = 0; index < arr.length; index++) {
      const line = arr[index];
      if (!line.HTMLElement.isConnected) continue;
      const lineState = getBloomLineState(
        getElementState(ProcessedPosition, line.StartTime, line.EndTime),
        line,
        index,
        ProcessedPosition
      );
      mountedLine ??= line.HTMLElement;
      if (lineState !== "Sung") anyLineUnsung = true;
      if (lineState === "Active") noteActiveLine(index);
      if (line.AnimatedState !== lineState) {
        // Kept while the line is Active only: the one measured above for a
        // line turning Active this frame stays.
        // A line turning Sung keeps it while it settles: the fill runs on there.
        if (line.AnimatedState === "Active" && lineState !== "Sung") dropLineSweep(line.HTMLElement);
        if (line.Settling && lineState !== "Sung") dropLineSweep(line.HTMLElement);
        line.Settling = lineState === "Sung";
        setClass(line.HTMLElement, "Settling", line.Settling);
        // Only a line seen turning Sung; one that was already past keeps its own end.
        line.SungAt = lineState === "Sung" && line.AnimatedState === "Active" ? ProcessedPosition : undefined;
        line.AnimatedState = lineState;
      }

      if (lineState === "Active") {
        if (Blurring_LastLine !== index) {
          applyBlur(arr, index, BlurMultiplier);
          //applyScale(arr, index);
          Blurring_LastLine = index;
        }

        if (!line.HTMLElement.classList.contains("Active")) {
          line.HTMLElement.classList.add("Active");
        }

        if (line.HTMLElement.classList.contains("NotSung")) {
          line.HTMLElement.classList.remove("NotSung");
        }

        if (line.HTMLElement.classList.contains("Sung")) {
          line.HTMLElement.classList.remove("Sung");
        }

        if (line.DotLine) {
          if (ProcessedPosition > line.EndTime - preHiddenDotLineMs) {
            if (!line.HTMLElement.classList.contains("pre-hidden")) {
              line.HTMLElement.classList.add("pre-hidden");
            }
          } else {
            if (line.HTMLElement.classList.contains("pre-hidden")) {
              line.HTMLElement.classList.remove("pre-hidden");
            }
          }
        }

        /* if (line.HTMLElement.classList.contains("FeelSung")) {
                  line.HTMLElement.classList.remove("FeelSung");
              } */

        // Check if Syllables exists and has Lead property
        if (!line.Syllables?.Lead) {
          console.warn("Line has no Syllables.Lead array");
          continue;
        }

        UpdateRomanizedRow(line.HTMLElement, ProcessedPosition);
        if (animatedRows) {
          animateUnderRows(line.HTMLElement, line.StartTime, line.EndTime, ProcessedPosition, deltaTime);
        }

        const words = line.Syllables.Lead;
        const sweep = refreshedSimple ? getLineSweep(line.HTMLElement, words) : null;
        if (sweep) updateLineSweep(sweep, words, ProcessedPosition);
        // Refreshed: no word floats higher than the one before it, so a word
        // timed out of order never stands up ahead of the line.
        let floatCap = 1;
        for (let wordIndex = 0; wordIndex < words.length; wordIndex++) {
          const word = words[wordIndex];
          const wordState = getElementState(ProcessedPosition, word.StartTime, word.EndTime);
          const percentage = getProgressPercentage(ProcessedPosition, word.StartTime, word.EndTime);
          const sweepSpan = sweep?.Spans[wordIndex];

          const isLetterGroup = word?.LetterGroup;
          const isDot = word?.Dot;

          if (!isDot) {
            if (!word.AnimatorStore) {
              word.AnimatorStore = createWordSprings();
              word.AnimatorStore.Scale.SetGoal(ScaleSpline.at(0), true);
              word.AnimatorStore.YOffset.SetGoal(YOffsetSpline.at(0), true);
              word.AnimatorStore.Glow.SetGoal(GlowSpline.at(0), true);
            }

            let targetScale: number;
            let targetYOffset: number;
            let targetGlow: number;
            let targetGradientPos: number;

            if (wordState === "Active") {
              targetScale = ScaleSpline.at(percentage);
              targetYOffset = YOffsetSpline.at(percentage);
              targetGlow = GlowSpline.at(percentage);
              if (isBloomRenderer()) {
                // The refreshed look runs on to fully lit, so the step to Sung
                // at the end of the word changes nothing.
                targetGradientPos = -50 + (refreshedSimple ? 150 : 120) * percentage;
              } else {
                targetGradientPos = -20 + 120 * percentage;
              }
            } else if (wordState === "NotSung") {
              targetScale = ScaleSpline.at(0);
              targetYOffset = YOffsetSpline.at(0);
              targetGlow = GlowSpline.at(0);
              if (isBloomRenderer()) {
                targetGradientPos = -50;
              } else {
                targetGradientPos = -20;
              }
            } else {
              // Sung
              targetScale = ScaleSpline.at(1);
              targetYOffset = YOffsetSpline.at(1);
              targetGlow = GlowSpline.at(1);
              targetGradientPos = 100;
            }

            if (refreshedSimple) {
              // A split word's letters lift one by one instead.
              if (isLetterGroup) {
                targetYOffset = 0;
              } else {
                floatCap = Math.min(floatCap, getRefreshedFloat(word.StartTime, ProcessedPosition));
                targetYOffset = refreshedLiftOffset(floatCap);
              }
              if (sweepSpan) {
                targetGradientPos = getSweepGradientPosition(
                  sweep!.Edges[wordIndex],
                  sweepSpan.X,
                  sweepSpan.W,
                  sweep!.Fade
                );
              }
            }

            word.AnimatorStore.Scale.SetGoal(targetScale);
            // Refreshed: the float already eases, so the spring is pinned to it.
            word.AnimatorStore.YOffset.SetGoal(targetYOffset, refreshedSimple);
            word.AnimatorStore.Glow.SetGoal(targetGlow);

            const currentScale = word.AnimatorStore.Scale.Step(deltaTime);
            const currentYOffset = word.AnimatorStore.YOffset.Step(deltaTime);
            const currentGlow = word.AnimatorStore.Glow.Step(deltaTime);

            setStyleIfChanged(word.HTMLElement, "scale", `${currentScale}`, 0.001);
            // Use translate3d to ensure GPU-accelerated transforms
            setStyleIfChanged(
              word.HTMLElement,
              "transform",
              `translate3d(0, calc(var(--DefaultLyricsSize) * ${currentYOffset}), 0)`,
              0.0001,
              currentYOffset
            );
            if (!isLetterGroup) {
              if (isBloomRenderer()) {
                setStyleIfChanged(word.HTMLElement, "--SLM_GradientPosition", `${targetGradientPos}%`);
              } else {
                setStyleIfChanged(word.HTMLElement, "--gradient-position", `${targetGradientPos}%`);
              }
              // Reduce redundant writes using thresholds for smoother performance
              setStyleIfChanged(
                word.HTMLElement,
                "--text-shadow-blur-radius",
                `${4 + 2 * currentGlow * 1}px`,
                0.5
              );
              setStyleIfChanged(
                word.HTMLElement,
                "--text-shadow-opacity",
                `${Math.min(currentGlow * 35, 100)}%`,
                1
              );
            }
          } else if (isDot && !isLetterGroup && refreshedSimple) {
            animateRefreshedDot(line, word, wordIndex, ProcessedPosition);
          } else if (isDot && !isLetterGroup) {
            if (wordIndex === 0) resetDotGroupBreath(word);
            // DotGroup
            // (still undone)
            /* {

                        // const dotGroupPercentage = getProgressPercentage(ProcessedPosition, dotGroup.StartTime, dotGroup.EndTime);

                        const relativeTime = ((ProcessedPosition / 1000) - dotGroup.StartTime)
		                    const timeScale = Clamp((relativeTime / dotGroup.TotalTime), 0, 1)

                        let yOffset: number;
                        if (dotGroupState === 'Sung') {
                          yOffset = DotGroupYOffsetSpline.getPointAt(1)[1]
                        } else {
                          yOffset = DotGroupYOffsetSpline.getPointAt(timeScale)[1]
                        }

                        // Find our scale/opacity points
                        const scaleIntersections = ((line as any).MainScaleSpline.getIntersects(timeScale) as number[][])
                        const opacityIntersections = ((line as any).MainOpacitySpline.getIntersects(timeScale) as number[][])
                        const scale = (
                          (scaleIntersections.length === 0) ? 1
                          : scaleIntersections[scaleIntersections.length - 1][1]
                        );
                        
                        const opacity = (
                          (opacityIntersections.length === 0) ? 1
                          : opacityIntersections[opacityIntersections.length - 1][1]
                        ) as any;

                        (line.AnimatorStore as any).Scale.SetGoal(scale);
                        (line.AnimatorStore as any).YOffset.SetGoal(yOffset);
                        (line.AnimatorStore as any).Opacity.SetGoal(opacity);

                        const currentScale = (line.AnimatorStore as any).Scale.Step(deltaTime);
                        const currentYOffset = (line.AnimatorStore as any).YOffset.Step(deltaTime);
                        const currentOpacity = (line.AnimatorStore as any).Opacity.Step(deltaTime);

                        dotGroup.HTMLElement.style.transform = `translateY(calc(var(--DefaultLyricsSize) * ${currentYOffset}))`;
                        dotGroup.HTMLElement.style.scale = currentScale.toString();
                        dotGroup.HTMLElement.style.opacity = currentOpacity.toString();
                      } */

            // Refactored Dot Animation using Springs
            if (!word.AnimatorStore) {
              word.AnimatorStore = createDotSprings();
              word.AnimatorStore.Scale.SetGoal(DotScaleSpline.at(0), true);
              word.AnimatorStore.YOffset.SetGoal(DotYOffsetSpline.at(0), true);
              word.AnimatorStore.Glow.SetGoal(DotGlowSpline.at(0), true);
              word.AnimatorStore.Opacity.SetGoal(DotOpacitySpline.at(0), true);
            }

            let targetScale: number;
            let targetYOffset: number;
            let targetGlow: number;
            let targetOpacity: number;

            if (wordState === "Active") {
              targetScale = DotScaleSpline.at(percentage);
              targetYOffset = DotYOffsetSpline.at(percentage);
              targetGlow = DotGlowSpline.at(percentage);
              targetOpacity = DotOpacitySpline.at(percentage);
            } else if (wordState === "NotSung") {
              targetScale = DotScaleSpline.at(0);
              targetYOffset = DotYOffsetSpline.at(0);
              targetGlow = DotGlowSpline.at(0);
              targetOpacity = DotOpacitySpline.at(0);
            } else {
              // Sung
              targetScale = DotScaleSpline.at(1);
              targetYOffset = DotYOffsetSpline.at(1);
              targetGlow = DotGlowSpline.at(1);
              targetOpacity = DotOpacitySpline.at(1);
            }

            word.AnimatorStore.Scale.SetGoal(targetScale);
            word.AnimatorStore.YOffset.SetGoal(targetYOffset);
            word.AnimatorStore.Glow.SetGoal(targetGlow);
            word.AnimatorStore.Opacity.SetGoal(targetOpacity);

            const currentScale = word.AnimatorStore.Scale.Step(deltaTime);
            const currentYOffset = word.AnimatorStore.YOffset.Step(deltaTime);
            const currentGlow = word.AnimatorStore.Glow.Step(deltaTime);
            const currentOpacity = word.AnimatorStore.Opacity.Step(deltaTime);

            // Use translate3d to ensure GPU-accelerated transforms
            setStyleIfChanged(
              word.HTMLElement,
              "transform",
              `translate3d(0, calc(var(--DefaultLyricsSize) * ${currentYOffset ?? 0}), 0)`,
              0.0001,
              currentYOffset ?? 0
            ); // Use --DefaultLyricsSize
            setStyleIfChanged(word.HTMLElement, "scale", `${currentScale}`, 0.001);
            setStyleIfChanged(word.HTMLElement, "opacity", `${currentOpacity}`, 0.001);
            setStyleIfChanged(
              word.HTMLElement,
              "--text-shadow-blur-radius",
              `${4 + 6 * currentGlow}px`,
              0.5
            ); // Match inspiration
            setStyleIfChanged(
              word.HTMLElement,
              "--text-shadow-opacity",
              `${currentGlow * 90}%`,
              1
            ); // Match inspiration
          }

          if (isLetterGroup && word.Letters) {
            if (wordState === "Active") {
              const waveStrength = refreshedSimple
                ? getRefreshedWaveStrength(word.EndTime - word.StartTime)
                : null;
              const waveFlame = waveStrength
                ? getWordFlame(word, ProcessedPosition)
                : null;
              for (let k = 0; k < word.Letters.length; k++) {
                const letter = word.Letters[k];

                if (!letter.AnimatorStore) {
                  letter.AnimatorStore = createLetterSprings();
                  letter.AnimatorStore.Scale.SetGoal(LetterScaleSpline.at(letterRest), true);
                  letter.AnimatorStore.YOffset.SetGoal(LetterYOffsetSpline.at(letterRest), true);
                  letter.AnimatorStore.Glow.SetGoal(GlowSpline.at(0), true);
                }

                let targetScale: number,
                  targetYOffset: number,
                  targetGlow: number,
                  targetGradient: number;

                // Find active letter info (needed only for Active state calculation)
                let activeLetterIndex = -1;
                let activeLetterPercentage = 0;
                if (wordState === "Active" && word.Letters) {
                  for (let i = 0; i < word.Letters.length; i++) {
                    if (
                      getElementState(
                        ProcessedPosition,
                        word.Letters[i].StartTime,
                        word.Letters[i].EndTime
                      ) === "Active"
                    ) {
                      activeLetterIndex = i;
                      activeLetterPercentage = getProgressPercentage(
                        ProcessedPosition,
                        word.Letters[i].StartTime,
                        word.Letters[i].EndTime
                      );
                      break;
                    }
                  }
                }

                // Determine initial targets based on word state
                // wordState is Active - Default to resting, then apply proximity-based animation
                targetScale = LetterScaleSpline.at(0); // Default active state target is resting
                targetYOffset = LetterYOffsetSpline.at(0);
                targetGlow = GlowSpline.at(0);

                // --- Handle individual letter states ---
                const letterState = getElementState(
                  ProcessedPosition,
                  letter.StartTime,
                  letter.EndTime
                );

                // Apply proximity-based animation if an active letter is found
                if (activeLetterIndex !== -1) {
                  // Get the base animation values for the active letter
                  const percentageCount = isBloomRenderer()
                    ? getProgressPercentage(ProcessedPosition, word.StartTime, word.EndTime)
                    : activeLetterPercentage;

                  const config = SimpleLyricsMode_LetterEffectsStrengthConfig;
                  const baseScale =
                  LetterScaleSpline.at(percentageCount) *
                    (isBloomRenderer()
                      ? word.TotalTime > config.LongerThan
                        ? config.Longer.Scale
                        : config.Shorter.Scale
                      : 1);
                  const baseYOffset =
                    LetterYOffsetSpline.at(percentageCount) *
                    (isBloomRenderer()
                      ? word.TotalTime > config.LongerThan
                        ? config.Longer.YOffset
                        : config.Shorter.YOffset
                      : 1);
                  const baseGlow =
                    GlowSpline.at(percentageCount) *
                    (isBloomRenderer()
                      ? word.TotalTime > config.LongerThan
                        ? config.Longer.Glow
                        : config.Shorter.Glow
                      : 1);

                  // Get the resting values
                  const restingScale = LetterScaleSpline.at(0);
                  const restingYOffset = LetterYOffsetSpline.at(0);
                  const restingGlow = GlowSpline.at(0);

                  // Calculate distance from active letter and apply smooth falloff
                  const distance = Math.abs(k - activeLetterIndex);

                  // Use a steeper falloff curve for proximity effect
                  // This creates a more pronounced difference between the active letter and others
                  // Make the falloff much steeper for a bolder active letter scaling
                  const falloff = Math.max(0, 1 / (1 + Math.pow(distance, 2.8)));
                  const glowFalloff = Math.max(0, 1 / (1 + distance * 0.9));
          
                  // Apply the proximity-based animation values
                  targetScale = restingScale + (baseScale - restingScale) * falloff;
                  targetYOffset = restingYOffset + (baseYOffset - restingYOffset) * falloff;
                  targetGlow = restingGlow + (baseGlow - restingGlow) * glowFalloff;
                } // else - if no active letter, targets remain at resting state set above

                // Only override values for NotSung letters or for letters in a non-Active word
                if (letterState === "NotSung" && !isBloomRenderer()) {
                  // NotSung letters always use resting values
                  targetScale = LetterScaleSpline.at(0);
                  targetYOffset = LetterYOffsetSpline.at(0);
                  targetGlow = GlowSpline.at(0);
                } else if (letterState === "Sung" && activeLetterIndex === -1) {
                  // Only apply SungLetterGlow to letters in words that don't have an active letter
                  // This preserves our proximity-based animation for active words
                  targetGlow = GlowSpline.at(SungLetterGlow);
                }

                // --- Determine Gradient based on individual letter state ---
                if (letterState === "NotSung") {
                  if (isBloomRenderer()) {
                    targetGradient = -50;
                  } else {
                    targetGradient = -20;
                  }
                } else if (letterState === "Sung") {
                  targetGradient = 100;
                } else {
                  // Active
                  // Only the *actual* active letter gets the animated gradient
                  targetGradient =
                    k === activeLetterIndex ? -20 + 120 * easeSinOut(activeLetterPercentage) : -20;
                  if (isBloomRenderer()) {
                    targetGradient =
                      k === activeLetterIndex
                        ? -50 + 120 * easeSinOut(activeLetterPercentage)
                        : -50;
                  } else {
                    targetGradient =
                      k === activeLetterIndex
                        ? -20 + 120 * easeSinOut(activeLetterPercentage)
                        : -20;
                  }
                }

                if (waveFlame) {
                  // The line's edge where it can be measured. Otherwise the
                  // fill goes one letter after another: a letter starts when
                  // the one before it is lit, and ends fully lit.
                  targetGradient =
                    (sweep && getSweepLetterPosition(sweep, wordIndex, k)) ??
                    (k === activeLetterIndex ? -50 + 150 * activeLetterPercentage : targetGradient);
                }

                // Apply the calculated gradient
                if (isBloomRenderer()) {
                  setStyleIfChanged(letter.HTMLElement, "--SLM_GradientPosition", `${targetGradient}%`);
                } else {
                  setStyleIfChanged(letter.HTMLElement, "--gradient-position", `${targetGradient}%`);
                }
                if (waveStrength) {
                  setLetterLit(letter, targetGradient);
                  stepRefreshedLetter(letter, k, waveFlame!);
                  continue;
                }

                // Set spring goals (smooth animation)
                letter.AnimatorStore.Scale.SetGoal(targetScale);
                letter.AnimatorStore.YOffset.SetGoal(targetYOffset);
                letter.AnimatorStore.Glow.SetGoal(targetGlow);

                // Step springs
                const currentScale = letter.AnimatorStore.Scale.Step(deltaTime);
                const currentYOffset = letter.AnimatorStore.YOffset.Step(deltaTime);
                const currentGlow = letter.AnimatorStore.Glow.Step(deltaTime);

                // Use translate3d to ensure GPU-accelerated transforms
                setStyleIfChanged(
                  letter.HTMLElement,
                  "transform",
                  `translate3d(0, calc(var(--DefaultLyricsSize) * ${currentYOffset * 2}), 0)`,
                  0.0001,
                  currentYOffset * 2
                );
                setStyleIfChanged(letter.HTMLElement, "scale", `${currentScale}`, 0.001);
                setStyleIfChanged(
                  letter.HTMLElement,
                  "--text-shadow-blur-radius",
                  `${4 + 12 * currentGlow}px`,
                  0.5
                );
                setStyleIfChanged(
                  letter.HTMLElement,
                  "--text-shadow-opacity",
                  `${currentGlow * LetterGlowMultiplier_Opacity}%`,
                  1
                );
              }
            } else if (wordState === "NotSung" && word.Letters) {
              // Pinned to rest, not eased there: a word left raised by an
              // earlier pass (seeking back) would otherwise spring down and
              // wobble before it starts.
              const restStrength = refreshedSimple
                ? getRefreshedWaveStrength(word.EndTime - word.StartTime)
                : null;
              const restFlame = restStrength
                ? getWordFlame(word, ProcessedPosition)
                : null;
              for (let k = 0; k < word.Letters.length; k++) {
                const letter = word.Letters[k];

                if (!letter.AnimatorStore) {
                  letter.AnimatorStore = createLetterSprings();
                  letter.AnimatorStore.Scale.SetGoal(LetterScaleSpline.at(letterRest), true);
                  letter.AnimatorStore.YOffset.SetGoal(LetterYOffsetSpline.at(letterRest), true);
                  letter.AnimatorStore.Glow.SetGoal(GlowSpline.at(0), true);
                }

                if (restStrength) {
                  // The edge of the word before can already reach in.
                  const gradient = (sweep && getSweepLetterPosition(sweep, wordIndex, k)) ?? -50;
                  setStyleIfChanged(letter.HTMLElement, "--SLM_GradientPosition", `${gradient}%`);
                  setLetterLit(letter, gradient);
                  stepRefreshedLetter(letter, k, restFlame!);
                  continue;
                }

                letter.AnimatorStore.Scale.SetGoal(LetterScaleSpline.at(letterRest));
                letter.AnimatorStore.YOffset.SetGoal(LetterYOffsetSpline.at(letterRest));
                letter.AnimatorStore.Glow.SetGoal(GlowSpline.at(0));

                const currentScale = letter.AnimatorStore.Scale.Step(deltaTime);
                const currentYOffset = letter.AnimatorStore.YOffset.Step(deltaTime);
                const currentGlow = letter.AnimatorStore.Glow.Step(deltaTime);

                if (isBloomRenderer()) {
                  setStyleIfChanged(letter.HTMLElement, "--SLM_GradientPosition", "-50%");
                } else {
                  setStyleIfChanged(letter.HTMLElement, "--gradient-position", `-20%`);
                }

                setStyleIfChanged(
                  letter.HTMLElement,
                  "transform",
                  `translate3d(0, calc(var(--DefaultLyricsSize) * ${currentYOffset * 2}), 0)`,
                  0.0001,
                  currentYOffset * 2
                );
                setStyleIfChanged(letter.HTMLElement, "scale", `${currentScale}`, 0.001);
                setStyleIfChanged(
                  letter.HTMLElement,
                  "--text-shadow-blur-radius",
                  `${4 + 12 * currentGlow}px`,
                  0.5
                );
                setStyleIfChanged(
                  letter.HTMLElement,
                  "--text-shadow-opacity",
                  `${currentGlow * LetterGlowMultiplier_Opacity}%`,
                  1
                );
              }
            } else if (wordState === "Sung" && word.Letters) {
              // The letters settle after the word, where it ended.
              const sungStrength = refreshedSimple
                ? getRefreshedWaveStrength(word.EndTime - word.StartTime)
                : null;
              const sungFlame = sungStrength
                ? getWordFlame(word, ProcessedPosition)
                : null;
              for (let k = 0; k < word.Letters.length; k++) {
                const letter = word.Letters[k];

                if (!letter.AnimatorStore) {
                  letter.AnimatorStore = createLetterSprings();
                  letter.AnimatorStore.Scale.SetGoal(LetterScaleSpline.at(letterRest), true);
                  letter.AnimatorStore.YOffset.SetGoal(LetterYOffsetSpline.at(letterRest), true);
                  letter.AnimatorStore.Glow.SetGoal(GlowSpline.at(0), true);
                }

                if (sungStrength) {
                  // The last letters finish lighting as the edge moves on.
                  const gradient = (sweep && getSweepLetterPosition(sweep, wordIndex, k)) ?? 100;
                  setStyleIfChanged(letter.HTMLElement, "--SLM_GradientPosition", `${gradient}%`);
                  setLetterLit(letter, gradient);
                  stepRefreshedLetter(letter, k, sungFlame!);
                  continue;
                }

                letter.AnimatorStore.Scale.SetGoal(LetterScaleSpline.at(1));
                letter.AnimatorStore.YOffset.SetGoal(LetterYOffsetSpline.at(1));
                letter.AnimatorStore.Glow.SetGoal(GlowSpline.at(1));

                const currentScale = letter.AnimatorStore.Scale.Step(deltaTime);
                const currentYOffset = letter.AnimatorStore.YOffset.Step(deltaTime);
                const currentGlow = letter.AnimatorStore.Glow.Step(deltaTime);

                if (isBloomRenderer()) {
                  setStyleIfChanged(letter.HTMLElement, "--SLM_GradientPosition", "100%");
                } else {
                  setStyleIfChanged(letter.HTMLElement, "--gradient-position", `100%`);
                }
                setStyleIfChanged(
                  letter.HTMLElement,
                  "transform",
                  `translate3d(0, calc(var(--DefaultLyricsSize) * ${currentYOffset * 2}), 0)`,
                  0.0001,
                  currentYOffset * 2
                );
                setStyleIfChanged(letter.HTMLElement, "scale", `${currentScale}`, 0.001);
                setStyleIfChanged(
                  letter.HTMLElement,
                  "--text-shadow-blur-radius",
                  `${4 + 12 * currentGlow}px`,
                  0.5
                );
                setStyleIfChanged(
                  letter.HTMLElement,
                  "--text-shadow-opacity",
                  `${currentGlow * LetterGlowMultiplier_Opacity}%`,
                  1
                );
              }
            }
          }
        }
      } else if (lineState === "NotSung") {
        setClass(line.HTMLElement, "NotSung", true);
        setClass(line.HTMLElement, "Sung", false);
        if (line.HTMLElement.classList.contains("Active")) {
          line.HTMLElement.classList.remove("Active");
        }
        if (line.DotLine && !line.HTMLElement.classList.contains("pre-hidden")) {
          line.HTMLElement.classList.add("pre-hidden");
        }
        /* const words = line.Syllables.Lead;
              for (const word of words) {
                  if (word.AnimatorStore && !word.Dot) {
                       word.AnimatorStore.Scale.SetGoal(ScaleSpline.at(0));
                       word.AnimatorStore.YOffset.SetGoal(YOffsetSpline.at(0));
                       word.AnimatorStore.Glow.SetGoal(GlowSpline.at(0));
                        const currentScale = word.AnimatorStore.Scale.Step(deltaTime);
                        const currentYOffset = word.AnimatorStore.YOffset.Step(deltaTime);
                        const currentGlow = word.AnimatorStore.Glow.Step(deltaTime);
                        word.HTMLElement.style.transform = `translateY(calc(var(--DefaultLyricsSize) * ${currentYOffset}))`;
                        word.HTMLElement.style.scale = `${currentScale}`;
                        if (!word.LetterGroup) {
                          word.HTMLElement.style.setProperty("--gradient-position", `-20%`);
                          word.HTMLElement.style.setProperty("--text-shadow-blur-radius", `${4 + (2 * currentGlow * 1)}px`);
                          word.HTMLElement.style.setProperty("--text-shadow-opacity", `${Math.min(currentGlow * 35, 100)}%`);
                        }
                  } else if (word.AnimatorStore && word.Dot && !word.LetterGroup) { // Handle dot reset
                      word.AnimatorStore.Scale.SetGoal(DotScaleSpline.at(0));
                      word.AnimatorStore.YOffset.SetGoal(DotYOffsetSpline.at(0));
                      word.AnimatorStore.Glow.SetGoal(DotGlowSpline.at(0));
                      word.AnimatorStore.Opacity.SetGoal(DotOpacitySpline.at(0));

                      const currentScale = word.AnimatorStore.Scale.Step(deltaTime);
                      const currentYOffset = word.AnimatorStore.YOffset.Step(deltaTime);
                      const currentGlow = word.AnimatorStore.Glow.Step(deltaTime);
                      const currentOpacity = word.AnimatorStore.Opacity.Step(deltaTime);

                      word.HTMLElement.style.transform = `translateY(calc(var(--DefaultLyricsSize) * ${currentYOffset}))`;
                      word.HTMLElement.style.scale = `${currentScale}`;
                      word.HTMLElement.style.opacity = `${currentOpacity}`;
                      word.HTMLElement.style.setProperty("--text-shadow-blur-radius", `${4 + (6 * currentGlow)}px`);
                      word.HTMLElement.style.setProperty("--text-shadow-opacity", `${currentGlow * 90}%`);
                  } else if (word.LetterGroup) {
                     for (let k = 0; k < word.Letters.length; k++) {
                      const letter = word.Letters[k];

                      if (!letter.AnimatorStore) {
                        letter.AnimatorStore = createLetterSprings();
                        letter.AnimatorStore.Scale.SetGoal(ScaleSpline.at(0), true);
                        letter.AnimatorStore.YOffset.SetGoal(YOffsetSpline.at(0), true);
                        letter.AnimatorStore.Glow.SetGoal(GlowSpline.at(0), true);
                      }

                      letter.AnimatorStore.Scale.SetGoal(ScaleSpline.at(0));
                      letter.AnimatorStore.YOffset.SetGoal(YOffsetSpline.at(0));
                      letter.AnimatorStore.Glow.SetGoal(GlowSpline.at(0));

                      const currentScale = letter.AnimatorStore.Scale.Step(deltaTime);
                      const currentYOffset = letter.AnimatorStore.YOffset.Step(deltaTime);
                      const currentGlow = letter.AnimatorStore.Glow.Step(deltaTime);

                      letter.HTMLElement.style.setProperty("--gradient-position", `-20%`);
                      letter.HTMLElement.style.transform = `translateY(calc(var(--DefaultLyricsSize) * ${currentYOffset * 2}))`;
                      letter.HTMLElement.style.scale = `${currentScale}`;
                      letter.HTMLElement.style.setProperty("--text-shadow-blur-radius", `${4 + (8 * currentGlow)}px`);
                      letter.HTMLElement.style.setProperty("--text-shadow-opacity", `${currentGlow * LetterGlowMultiplier_Opacity}%`);
                    }
                  }
              } */
      } else if (lineState === "Sung") {
        setClass(line.HTMLElement, "Sung", true);
        setClass(line.HTMLElement, "Active", false);
        setClass(line.HTMLElement, "NotSung", false);
        if (line.DotLine && line.HTMLElement.classList.contains("pre-hidden")) {
          line.HTMLElement.classList.remove("pre-hidden");
        }

        /* // Apply FeelSung class to lines that are at a distance of 2 or more from the active line
              // Only for non-dot lines (regular lyrics lines)
              if (activeLineIndex !== -1) {
                  // Calculate distance from active line
                  const distance = activeLineIndex - index;

                  // If this is a Sung line that comes before the active line
                  // and is not the line directly before the active line
                  if (distance >= 2) {
                      line.HTMLElement.classList.add("FeelSung");
                  } else {
                      line.HTMLElement.classList.remove("FeelSung");
                  }
              } else {
                  line.HTMLElement.classList.remove("FeelSung");
              } */

        if (arr.length === index + 1) {
          /* if (Credits && !Credits.classList.contains("Active")) {
            Credits.classList.add("Active");
          } */
        }

        // Steps the line's words to their sung values. Returns whether every
        // spring has come to rest.
        const checkNextLine = (): boolean => {
          const words = line.Syllables?.Lead;
          if (!words) return true;
          let settled = true;
          const track = (springs: Record<string, any>) => {
            if (!settled) return;
            for (const key in springs) {
              if (springs[key].CanSleep && !springs[key].CanSleep()) {
                settled = false;
                return;
              }
            }
          };
          let floatCap = 1;
          // Bloom: once the line ends its words settle back down on the same
          // spring they lifted on.
          // From when it turned Sung: the early scroll can end a line before its time.
          const sungAt = Math.min(line.SungAt ?? line.EndTime, line.EndTime);
          const liftLeft = refreshedSimple ? 1 - getRefreshedLift(ProcessedPosition - sungAt) : 1;
          if (liftLeft > 0 && refreshedSimple) settled = false;
          // The fill runs on past the end of the line: a split word at the end
          // of a row is only partly lit when it ends, and the rush to the end of
          // the row finishes it. Only a sweep kept from the line's Active frames.
          const sweep = refreshedSimple && line.Settling ? (_lineSweeps.get(line.HTMLElement) ?? null) : null;
          if (sweep) {
            updateLineSweep(sweep, words, ProcessedPosition);
            let lastEnd = -Infinity;
            for (const word of words) if (!word.Dot && word.EndTime > lastEnd) lastEnd = word.EndTime;
            if (ProcessedPosition < lastEnd + RefreshedSweep.RushMs) settled = false;
          }
          for (let i = 0; i < words.length; i++) {
            const word = words[i];
            if (word.AnimatorStore && !word.Dot) {
              word.AnimatorStore.Scale.SetGoal(ScaleSpline.at(1));
              if (refreshedSimple) {
                // The last words of a line are still lifting after it ends.
                if (word.LetterGroup) {
                  word.AnimatorStore.YOffset.SetGoal(0, true);
                } else {
                  floatCap = Math.min(floatCap, getRefreshedFloat(word.StartTime, ProcessedPosition));
                  word.AnimatorStore.YOffset.SetGoal(refreshedLiftOffset(floatCap * liftLeft), true);
                }
              } else {
                word.AnimatorStore.YOffset.SetGoal(YOffsetSpline.at(1));
              }
              word.AnimatorStore.Glow.SetGoal(GlowSpline.at(1));
              const currentScale = word.AnimatorStore.Scale.Step(deltaTime);
              const currentYOffset = word.AnimatorStore.YOffset.Step(deltaTime);
              const currentGlow = word.AnimatorStore.Glow.Step(deltaTime);
              track(word.AnimatorStore);
              //if (!isBloomRenderer()) {
              // Use translate3d to ensure GPU-accelerated transforms
              setStyleIfChanged(
                word.HTMLElement,
                "transform",
                `translate3d(0, calc(var(--DefaultLyricsSize) * ${currentYOffset}), 0)`,
                0.0001,
                currentYOffset
              );
              setStyleIfChanged(word.HTMLElement, "scale", `${currentScale}`, 0.001);
              //}
              if (!word.LetterGroup) {
                if (isBloomRenderer()) {
                  setStyleIfChanged(word.HTMLElement, "--SLM_GradientPosition", "100%");
                } else {
                  setStyleIfChanged(word.HTMLElement, "--gradient-position", "100%");
                }
                setStyleIfChanged(
                  word.HTMLElement,
                  "--text-shadow-blur-radius",
                  `${4 + 2 * currentGlow * 1}px`,
                  0.5
                );
                setStyleIfChanged(
                  word.HTMLElement,
                  "--text-shadow-opacity",
                  `${Math.min(currentGlow * 35, 100)}%`,
                  1
                );
              }
            } else if (word.AnimatorStore && word.Dot && !word.LetterGroup) {
              // Handle dot sung state

              // Again - undone
              /* {
                        const dotGroup = {
                          HTMLElement: word.HTMLElement.parentElement,
                          StartTime: words[0].StartTime,
                          EndTime: words[words.length - 1].EndTime,
                          TotalTime: words[words.length - 1].EndTime - words[0].StartTime,
                        }
                        if (!dotGroup.HTMLElement) return;

                        const dotGroupState = getElementState(ProcessedPosition, words[0].StartTime, words[words.length - 1].EndTime);
                        const percentage = getProgressPercentage(ProcessedPosition, words[0].StartTime, words[words.length - 1].EndTime);

                        if (!line.AnimatorStore) {
                          if (!(line as any).MainScaleRange) {
                            (line as any).MainScaleRange = DotGroupAnimations.ScaleRange.map(
                              (point) => {
                                return {
                                  Time: point.Time,
                                  Value: point.Value
                                }
                              }
                            );

                            (line as any).MainScaleRange[2].Time += dotGroup.TotalTime;
                            (line as any).MainScaleRange[3].Time = dotGroup.TotalTime;

                            {
                              const startPoint = (line as any).MainScaleRange[1]
                              const endPoint = (line as any).MainScaleRange[2]
                          
                              const deltaTime = (endPoint.Time - startPoint.Time)

                              const PulseInterval = 2.25;
                              const DownPulse = 0.95;
                              const UpPulse = 1.05;
                          
                              for (let iteration = Math.floor(deltaTime / PulseInterval); iteration > 0; iteration -= 1) {
                                const time = (startPoint.Time + (iteration * PulseInterval))
                                const value = ((iteration % 2 === 0) ? UpPulse : DownPulse) as any;
                          
                                (line as any).MainScaleRange.splice(
                                  2, 0,
                                  {
                                    Time: time,
                                    Value: value
                                  }
                                )
                              }
                            }

                            for (const range of (line as any).MainScaleRange) {
                              range.Time /= dotGroup.TotalTime
                            }

                            (line as any).MainScaleSpline = new CurveInterpolator(
                              (line as any).MainScaleRange.map((metadata: any) => [metadata.Time, metadata.Value])
                            )
                          }

                          if (!(line as any).MainOpacityRange) {
                            (line as any).MainOpacityRange = DotGroupAnimations.OpacityRange.map(
                              (point) => {
                                return {
                                  Time: point.Time,
                                  Value: point.Value
                                }
                              }
                            );

                            (line as any).MainOpacityRange[2].Time += dotGroup.TotalTime;
                            (line as any).MainOpacityRange[3].Time = dotGroup.TotalTime;

                            for (const range of (line as any).MainOpacityRange) {
                              range.Time /= dotGroup.TotalTime
                            }

                            (line as any).MainOpacitySpline = new CurveInterpolator(
                              (line as any).MainOpacityRange.map((metadata: any) => [metadata.Time, metadata.Value])
                            )
                          }

                          (line.AnimatorStore as any) = createDotGroupSprings();
                          if (!line.AnimatorStore) return;
                          (line.AnimatorStore as any).Scale.SetGoal(0, true);
                          (line.AnimatorStore as any).YOffset.SetGoal(0, true);
                          (line.AnimatorStore as any).Opacity.SetGoal(0, true);
                        }
                        const relativeTime = ((ProcessedPosition * 1000) - dotGroup.StartTime)
		                    const timeScale = Clamp((relativeTime / dotGroup.TotalTime), 0, 1)

                        let yOffset: number;
                        if (dotGroupState === 'Sung') {
                          yOffset = DotGroupYOffsetSpline.getPointAt(1)[1]
                        } else {
                          yOffset = DotGroupYOffsetSpline.getPointAt(timeScale)[1]
                        }

                        // Find our scale/opacity points
                        const scaleIntersections = ((line as any).MainScaleSpline.getIntersects(timeScale) as number[][])
                        const opacityIntersections = ((line as any).MainOpacitySpline.getIntersects(timeScale) as number[][])
                        const scale = (
                          (scaleIntersections.length === 0) ? 1
                          : scaleIntersections[scaleIntersections.length - 1][1]
                        )
                        const opacity = (
                          (opacityIntersections.length === 0) ? 1
                          : opacityIntersections[opacityIntersections.length - 1][1]
                        ) as any;

                        (line.AnimatorStore as any).Scale.SetGoal(scale);
                        (line.AnimatorStore as any).YOffset.SetGoal(yOffset);
                        (line.AnimatorStore as any).Opacity.SetGoal(opacity);

                        const currentScale = (line.AnimatorStore as any).Scale.Step(deltaTime);
                        const currentYOffset = (line.AnimatorStore as any).YOffset.Step(deltaTime);
                        const currentOpacity = (line.AnimatorStore as any).Opacity.Step(deltaTime);

                        dotGroup.HTMLElement.style.transform = `translateY(calc(var(--DefaultLyricsSize) * ${currentYOffset}))`;
                        dotGroup.HTMLElement.style.scale = `${currentScale}`;
                        dotGroup.HTMLElement.style.opacity = easeSinOut(currentOpacity).toString();
                      } */

              word.AnimatorStore.Scale.SetGoal(DotScaleSpline.at(1));
              word.AnimatorStore.YOffset.SetGoal(DotYOffsetSpline.at(1));
              word.AnimatorStore.Glow.SetGoal(DotGlowSpline.at(1));
              word.AnimatorStore.Opacity.SetGoal(DotOpacitySpline.at(1));

              const currentScale = word.AnimatorStore.Scale.Step(deltaTime);
              const currentYOffset = word.AnimatorStore.YOffset.Step(deltaTime);
              const currentGlow = word.AnimatorStore.Glow.Step(deltaTime);
              const currentOpacity = word.AnimatorStore.Opacity.Step(deltaTime);
              track(word.AnimatorStore);

              setStyleIfChanged(
                word.HTMLElement,
                "transform",
                `translate3d(0, calc(var(--DefaultLyricsSize) * ${currentYOffset ?? 0}), 0)`,
                0.0001,
                currentYOffset ?? 0
              );
              setStyleIfChanged(word.HTMLElement, "scale", `${currentScale}`, 0.001);
              setStyleIfChanged(word.HTMLElement, "opacity", `${currentOpacity}`, 0.001);
              setStyleIfChanged(
                word.HTMLElement,
                "--text-shadow-blur-radius",
                `${4 + 6 * currentGlow}px`,
                0.5
              );
              setStyleIfChanged(
                word.HTMLElement,
                "--text-shadow-opacity",
                `${currentGlow * 90}%`,
                1
              );
            }
            if (word.LetterGroup && word.Letters) {
              const sungStrength = refreshedSimple
                ? getRefreshedWaveStrength(word.EndTime - word.StartTime)
                : null;
              const sungFlame = sungStrength
                ? getWordFlame(word, ProcessedPosition)
                : null;
              for (let k = 0; k < word.Letters.length; k++) {
                const letter = word.Letters[k];

                if (!letter.AnimatorStore) {
                  letter.AnimatorStore = createLetterSprings();
                  letter.AnimatorStore.Scale.SetGoal(LetterScaleSpline.at(letterRest), true);
                  letter.AnimatorStore.YOffset.SetGoal(LetterYOffsetSpline.at(letterRest), true);
                  letter.AnimatorStore.Glow.SetGoal(GlowSpline.at(0), true);
                }

                if (sungStrength) {
                  const gradient = (sweep && getSweepLetterPosition(sweep, i, k)) ?? 100;
                  setStyleIfChanged(letter.HTMLElement, "--SLM_GradientPosition", `${gradient}%`);
                  setLetterLit(letter, gradient);
                  // A letter still up keeps the line settling until it's back at rest.
                  if (stepRefreshedLetter(letter, k, sungFlame!, liftLeft)) {
                    settled = false;
                  }
                  continue;
                }

                letter.AnimatorStore.Scale.SetGoal(LetterScaleSpline.at(1));
                letter.AnimatorStore.YOffset.SetGoal(LetterYOffsetSpline.at(1));
                letter.AnimatorStore.Glow.SetGoal(GlowSpline.at(1));

                const currentScale = letter.AnimatorStore.Scale.Step(deltaTime);
                const currentYOffset = letter.AnimatorStore.YOffset.Step(deltaTime);
                const currentGlow = letter.AnimatorStore.Glow.Step(deltaTime);
                track(letter.AnimatorStore);

                if (isBloomRenderer()) {
                  setStyleIfChanged(letter.HTMLElement, "--SLM_GradientPosition", "100%");
                } else {
                  setStyleIfChanged(letter.HTMLElement, "--gradient-position", `100%`);
                }
                setStyleIfChanged(
                  letter.HTMLElement,
                  "transform",
                  `translate3d(0, calc(var(--DefaultLyricsSize) * ${currentYOffset * 2}), 0)`,
                  0.0001,
                  currentYOffset * 2
                );
                setStyleIfChanged(letter.HTMLElement, "scale", `${currentScale}`, 0.001);
                setStyleIfChanged(
                  letter.HTMLElement,
                  "--text-shadow-blur-radius",
                  `${4 + 12 * currentGlow}px`,
                  0.5
                );
                setStyleIfChanged(
                  letter.HTMLElement,
                  "--text-shadow-opacity",
                  `${currentGlow * LetterGlowMultiplier_Opacity}%`,
                  1
                );
              }
            }
          }
          return settled;
        };

        if (animatedRows) {
          settleRomanizedWords(
            line.HTMLElement,
            ProcessedPosition,
            Math.min(line.SungAt ?? line.EndTime, line.EndTime),
            deltaTime
          );
        }

        {
          const NextLine = arr[index + 1];
          const nextLineStatus = NextLine
            ? getElementState(ProcessedPosition, NextLine.StartTime, NextLine.EndTime)
            : null;
          // A line keeps settling until its springs rest, even when the line
          // after it has already ended: with overlapping lines that one can end
          // first, and the late line would otherwise freeze mid-animation.
          if (
            line.Settling ||
            !NextLine ||
            nextLineStatus === "NotSung" ||
            nextLineStatus === "Active"
          ) {
            if (checkNextLine()) {
              if (line.Settling) parkSettledLine(line.HTMLElement);
              line.Settling = false;
              dropLineSweep(line.HTMLElement);
            }
          }
          setClass(line.HTMLElement, "Settling", line.Settling === true);
        }
      }
    }
  } else if (CurrentLyricsType === "Line") {
    const arr = LyricsObject.Types.Line.Lines;

    for (let index = 0; index < arr.length; index++) {
      const line = arr[index];
      if (!line.HTMLElement.isConnected) continue;
      const lineState = getBloomLineState(
        getElementState(ProcessedPosition, line.StartTime, line.EndTime),
        line,
        index,
        ProcessedPosition
      );
      mountedLine ??= line.HTMLElement;
      if (lineState !== "Sung") anyLineUnsung = true;
      if (lineState === "Active") noteActiveLine(index);

      if (lineState === "Active") {
        if (Blurring_LastLine !== index) {
          applyBlur(arr, index, BlurMultiplier);
          //applyScale(arr, index);
          Blurring_LastLine = index;
        }

        if (!line.HTMLElement.classList.contains("Active")) {
          line.HTMLElement.classList.add("Active");
        }

        if (line.HTMLElement.classList.contains("NotSung")) {
          line.HTMLElement.classList.remove("NotSung");
        }

        if (line.HTMLElement.classList.contains("Sung")) {
          line.HTMLElement.classList.remove("Sung");
        }

        if (line.DotLine) {
          if (ProcessedPosition > line.EndTime - preHiddenDotLineMs) {
            if (!line.HTMLElement.classList.contains("pre-hidden")) {
              line.HTMLElement.classList.add("pre-hidden");
            }
          } else {
            if (line.HTMLElement.classList.contains("pre-hidden")) {
              line.HTMLElement.classList.remove("pre-hidden");
            }
          }
        }

        if (animatedRows && !line.DotLine) {
          animateUnderRows(line.HTMLElement, line.StartTime, line.EndTime, ProcessedPosition, deltaTime);
        }

        const percentage = getProgressPercentage(ProcessedPosition, line.StartTime, line.EndTime);

        if (line.DotLine && line.Syllables?.Lead) {
          const dotArray = line.Syllables.Lead; // Assuming Syllables.Lead holds the dots for DotLine
          for (let i = 0; i < dotArray.length; i++) {
            const dot = dotArray[i];
            const dotState = getElementState(ProcessedPosition, dot.StartTime, dot.EndTime);
            const dotPercentage = getProgressPercentage(
              ProcessedPosition,
              dot.StartTime,
              dot.EndTime
            );

            if (refreshedSimple) {
              animateRefreshedDot(line, dot, i, ProcessedPosition);
              continue;
            }
            if (i === 0) resetDotGroupBreath(dot);

            // Refactored Dot Animation using Springs for Line Type
            if (!dot.AnimatorStore) {
              dot.AnimatorStore = createDotSprings();
              dot.AnimatorStore.Scale.SetGoal(DotScaleSpline.at(0), true);
              dot.AnimatorStore.YOffset.SetGoal(DotYOffsetSpline.at(0), true);
              dot.AnimatorStore.Glow.SetGoal(DotGlowSpline.at(0), true);
              dot.AnimatorStore.Opacity.SetGoal(DotOpacitySpline.at(0), true);
            }

            let targetScale: number;
            let targetYOffset: number;
            let targetGlow: number;
            let targetOpacity: number;

            if (dotState === "Active") {
              targetScale = DotScaleSpline.at(dotPercentage);
              targetYOffset = DotYOffsetSpline.at(dotPercentage);
              targetGlow = DotGlowSpline.at(dotPercentage);
              targetOpacity = DotOpacitySpline.at(dotPercentage);
            } else if (dotState === "NotSung") {
              targetScale = DotScaleSpline.at(0);
              targetYOffset = DotYOffsetSpline.at(0);
              targetGlow = DotGlowSpline.at(0);
              targetOpacity = DotOpacitySpline.at(0);
            } else {
              // Sung
              targetScale = DotScaleSpline.at(1);
              targetYOffset = DotYOffsetSpline.at(1);
              targetGlow = DotGlowSpline.at(1);
              targetOpacity = DotOpacitySpline.at(1);
            }

            dot.AnimatorStore.Scale.SetGoal(targetScale);
            dot.AnimatorStore.YOffset.SetGoal(targetYOffset);
            dot.AnimatorStore.Glow.SetGoal(targetGlow);
            dot.AnimatorStore.Opacity.SetGoal(targetOpacity);

            const currentScale = dot.AnimatorStore.Scale.Step(deltaTime);
            const currentYOffset = dot.AnimatorStore.YOffset.Step(deltaTime);
            const currentGlow = dot.AnimatorStore.Glow.Step(deltaTime);
            const currentOpacity = dot.AnimatorStore.Opacity.Step(deltaTime);

            // Use translate3d to ensure GPU-accelerated transforms
            setStyleIfChanged(
              dot.HTMLElement,
              "transform",
              `translate3d(0, calc(var(--DefaultLyricsSize) * ${currentYOffset ?? 0}), 0)`,
              0.0001,
              currentYOffset ?? 0
            ); // Use --DefaultLyricsSize?
            setStyleIfChanged(dot.HTMLElement, "scale", `${currentScale}`, 0.001);
            setStyleIfChanged(dot.HTMLElement, "opacity", `${currentOpacity}`, 0.001);
            setStyleIfChanged(
              dot.HTMLElement,
              "--text-shadow-blur-radius",
              `${4 + 6 * currentGlow}px`,
              0.5
            );
            setStyleIfChanged(
              dot.HTMLElement,
              "--text-shadow-opacity",
              `${currentGlow * 90}%`,
              1
            );
          }
        } else {
          // Existing Line animation (non-dot) -> Refactored to use Spring
          if (!line.AnimatorStore) {
            line.AnimatorStore = createLineSprings();
            line.AnimatorStore.Glow.SetGoal(LineGlowSpline.at(0), true);
          }

          let targetGlow: number;
          let targetGradientPos: number;

          if (lineState === "Active") {
            targetGlow = LineGlowSpline.at(percentage);
            targetGradientPos = percentage * 100; // Keep gradient separate from spring for now
          } else if (lineState === "NotSung") {
            targetGlow = LineGlowSpline.at(0);
            targetGradientPos = -20;
          } else {
            // Sung
            targetGlow = LineGlowSpline.at(1);
            targetGradientPos = 100;
          }

          line.AnimatorStore.Glow.SetGoal(targetGlow);
          const currentGlow = line.AnimatorStore.Glow.Step(deltaTime);

          // Apply styles using spring value for glow, keep direct calculation for gradient
          if (!isBloomRenderer()) {
            setStyleIfChanged(line.HTMLElement, "--gradient-position", `${targetGradientPos}%`);
            setStyleIfChanged(
              line.HTMLElement,
              "--text-shadow-blur-radius",
              `${4 + 8 * currentGlow}px`,
              0.5
            );
            setStyleIfChanged(
              line.HTMLElement,
              "--text-shadow-opacity",
              `${currentGlow * 50}%`,
              1
            );
          }
        }
        /* if (Credits?.classList.contains("Active")) {
          Credits.classList.remove("Active");
        } */
      } else if (lineState === "NotSung") {
        if (!line.HTMLElement.classList.contains("NotSung")) {
          line.HTMLElement.classList.add("NotSung");
        }
        setClass(line.HTMLElement, "Sung", false);
        if (line.HTMLElement.classList.contains("Active")) {
          line.HTMLElement.classList.remove("Active");
        }
        if (line.DotLine && !line.HTMLElement.classList.contains("pre-hidden")) {
          line.HTMLElement.classList.add("pre-hidden");
        }
      } else if (lineState === "Sung") {
        if (!line.HTMLElement.classList.contains("Sung")) {
          line.HTMLElement.classList.add("Sung");
        }
        setClass(line.HTMLElement, "Active", false);
        setClass(line.HTMLElement, "NotSung", false);
        if (line.DotLine && line.HTMLElement.classList.contains("pre-hidden")) {
          line.HTMLElement.classList.remove("pre-hidden");
        }

        if (arr.length === index + 1) {
          /* if (Credits && !Credits.classList.contains("Active")) {
            Credits.classList.add("Active");
          } */
        }
      }
    }
  }
  if (CurrentLyricsType === "Syllable" || CurrentLyricsType === "Line") {
    // Off, -1 clears the marks left from when it was on.
    markSungAfterActive(
      LyricsObject.Types[CurrentLyricsType].Lines,
      ProcessedPosition,
      isExperimentEnabled("keepOverlappingLines") ? firstActive : -1
    );
  }
  // Stands in for `.LyricsContent:not(:has(.line.Active)):not(:has(.line.NotSung))`
  // in Mixed.css: with line classes inside a :has(), every line change made
  // Blink re-check the page's ancestors, up to <html>.
  const lyricsContent = mountedLine?.closest<HTMLElement>(".LyricsContent");
  if (lyricsContent) setClass(lyricsContent, "LinesAllSung", !anyLineUnsung);

  // Commit any queued style changes after completing the animation computations
  flushStyleBatch();
}
