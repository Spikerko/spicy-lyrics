// @ts-ignore pkg has no @types on npm
import Spline from "cubic-spline";
import { easeSinOut } from "d3-ease";
import { $currentLyricsType, $simpleLyricsMode } from "../../../../utils/stores.ts";
import {
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
  $simpleLyricsMode.get() ? SimpleLetterScaleRange : LetterScaleRange
);
let YOffsetSpline = GetSpline(
  $simpleLyricsMode.get() ? SimpleYOffsetRange : YOffsetRange
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
  $simpleLyricsMode.get() ? SimpleLetterYOffsetRange : LetterYOffsetRange
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
let DotOpacitySpline = GetSpline(getDotOpacityRange($simpleLyricsMode.get()));

const createLetterSprings = () => {
  return {
    Scale: new Spring(LetterScaleSpline.at(0), ScaleFrequency, ScaleDamping),
    YOffset: new Spring(LetterYOffsetSpline.at(0), YOffsetFrequency, YOffsetDamping),
    Glow: new Spring(GlowSpline.at(0), GlowFrequency, GlowDamping),
  };
};

$simpleLyricsMode.subscribe((simpleLyricsMode) => {
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

// Refreshed Simple Lyrics (experiment): the letters of a short held word are
// emphasised. One after another across the first 40% of the word,
// each letter swells, spreads away from the middle of the word, lifts and
// glows, then eases back, over the word's length but never under a second.
// Under that a gentle float carries each letter up and back down, setting off a
// little earlier and running a little longer. The longer the word is held the
// stronger it is, and the line's last word gets more still. The letters ride on
// the word, which floats up like any other.
const RefreshedEmphasis = {
  MinMs: 1000,
  // The letters set off across this share of the word.
  Stagger: 1 / 2.5,
  // × Amount: how much a letter grows, and how far it moves out (em, per
  // letter from the middle) and up (em).
  Scale: 0.1,
  Spread: 0.03,
  Lift: 0.025,
  MaxAmount: 1.2,
  // The glow: its radius is em × Blur, up to MaxRadius.
  Radius: 0.3,
  MaxRadius: 0.3,
  MaxBlur: 0.8,
  // The float: how high it goes (em; twice that on a background line), how
  // far ahead of its letter it starts, and how much longer it runs.
  Float: 0.05,
  FloatLeadMs: 400,
  FloatStretch: 1.4,
  // Dim text is drawn at this alpha (Mixed.css --gradient-alpha-end), and its
  // glow with it.
  DimAlpha: 0.4,
  LastWord: { Amount: 1.6, Blur: 1.5, Duration: 1.2 },
};

type RefreshedWaveStrength = { Amount: number; Blur: number; Duration: number };

function getRefreshedWaveStrength(duration: number, isLastWord: boolean): RefreshedWaveStrength {
  const E = RefreshedEmphasis;
  // Faint below two seconds (three for the glow), then growing slowly.
  const grow = (x: number) => (x > 1 ? Math.sqrt(x) : x ** 3);
  let du = Math.max(E.MinMs, duration);
  let amount = grow(du / 2000) * 0.6;
  let blur = grow(du / 3000) * 0.5;
  if (isLastWord) {
    amount *= E.LastWord.Amount;
    blur *= E.LastWord.Blur;
    du *= E.LastWord.Duration;
  }
  return {
    Amount: Math.min(E.MaxAmount, amount),
    Blur: Math.min(E.MaxBlur, blur),
    Duration: du,
  };
}

// CSS cubic-bezier(x1, y1, x2, y2), as a function of x.
function cubicBezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const curveX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const curveY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const error = curveX(t) - x;
      if (Math.abs(error) < 1e-6) return curveY(t);
      const slope = slopeX(t);
      if (Math.abs(slope) < 1e-6) break;
      t = Clamp(t - error / slope, 0, 1);
    }
    let lo = 0;
    let hi = 1;
    t = x;
    while (hi - lo > 1e-6) {
      if (curveX(t) < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return curveY(t);
  };
}

const emphasisIn = cubicBezier(0.2, 0.4, 0.58, 1);
const emphasisOut = cubicBezier(0.3, 0, 0.58, 1);

// 0 to 1 and back over x from 0 to 1: up over the first half, down over the
// second.
function getEmphasis(x: number): number {
  if (x <= 0 || x >= 1) return 0;
  return x < 0.5 ? emphasisIn(x / 0.5) : 1 - emphasisOut((x - 0.5) / 0.5);
}

type SplitLetter = NonNullable<SyllableLead["Letters"]>[number];

// The same for every letter of the word, so worked out once per word.
type RefreshedFlameState = {
  Count: number;
  Start: number;
  Position: number;
  Float: number;
};

function getRefreshedFlame(
  letters: SplitLetter[],
  position: number,
  isBG: boolean
): RefreshedFlameState {
  return {
    Count: Math.max(1, letters.length),
    Start: letters[0]?.StartTime ?? 0,
    Position: position,
    Float: RefreshedEmphasis.Float * (isBG ? 2 : 1),
  };
}

// Refreshed Simple Lyrics: a word floats up from the moment it starts, over
// its own length but never quicker than a letter's emphasis
// (RefreshedEmphasis.MinMs), easing out. Short
// words are still rising as the next ones set off, so the line drifts up as
// one instead of a step at a time. 0 to 1 along YOffsetSpline.
function getRefreshedFloat(startTime: number, endTime: number, position: number): number {
  const x = Clamp(
    (position - startTime) / Math.max(RefreshedEmphasis.MinMs, endTime - startTime),
    0,
    1
  );
  return 1 - (1 - x) * (1 - x);
}

// Refreshed Simple Lyrics: the fill runs along the whole line as one soft
// edge. Each word used to sweep a gradient across its own box
// only, so the edge went out of sight at the end of every word (and of every
// split letter) and came back in at the start of the next: the light stopped
// at each one. Here the words are laid end to end on one strip (each box
// already holds the space after it), the edge crosses each word in that
// word's time and waits where the last one ended through a gap, and every word
// and letter reads its --SLM_GradientPosition off it. The fade so spills into
// the next word while the one before is finishing.
const RefreshedSweep = {
  // Mixed.css --SLR_FadeWidth, in em.
  FadeEm: 0.55,
};

type SweepSpan = {
  X: number;
  W: number;
  // Split letters: where each one starts in the word, and how wide it is.
  LetterX: number[] | null;
  LetterW: number[] | null;
};

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
  let x = 0;
  let fontPx = 0;
  for (const word of words) {
    if (word.Dot) {
      spans.push(null);
      continue;
    }
    const width = word.HTMLElement.offsetWidth;
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
    spans.push({ X: x, W: width, LetterX: letterX, LetterW: letterW });
    x += width;
  }
  // Not laid out: nothing to sweep, and nothing kept.
  if (x <= 0 || fontPx <= 0) return null;
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

function updateLineSweep(sweep: LineSweep, words: SyllableLead[], position: number): void {
  const { Spans: spans, Edges: edges } = sweep;
  const half = sweep.Fade / 2;
  let first = -1;
  let last = -1;
  for (let i = 0; i < spans.length; i++) {
    if (!spans[i]) continue;
    if (first < 0) first = i;
    last = i;
  }
  // Where each word has carried the light to. The first word brings the fade
  // in from before the line and the last takes it out past the end, so the
  // line starts fully dim and ends fully lit.
  let reached = -Infinity;
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    if (!span) continue;
    const word = words[i];
    const from = i === first ? span.X - half : span.X;
    const to = span.X + span.W + (i === last ? half : 0);
    let at = -Infinity;
    if (position >= word.EndTime) at = to;
    else if (position > word.StartTime) {
      at = from + ((to - from) * (position - word.StartTime)) / (word.EndTime - word.StartTime);
    }
    edges[i] = at;
    if (at > reached) reached = at;
  }
  // A word being sung shows its own edge, so two words sung across each other
  // both fill. One still to come is lit only by the words before it, never by
  // a later one sung early. One already sung follows the light wherever it is.
  let before = -Infinity;
  for (let i = 0; i < spans.length; i++) {
    if (!spans[i]) continue;
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

// Writes everything about one split letter but its gradient, which is passed
// in: the glow dims with the letter, as the text does. Returns
// whether the letter is still moving.
function stepRefreshedLetter(
  letter: SplitLetter,
  index: number,
  strength: RefreshedWaveStrength,
  flame: RefreshedFlameState,
  gradient: number
): boolean {
  const E = RefreshedEmphasis;
  const du = strength.Duration;
  const at = flame.Position - flame.Start - ((du * E.Stagger) / flame.Count) * index;
  const swell = getEmphasis(at / du);
  const floatAt = (at + E.FloatLeadMs) / (du * E.FloatStretch);
  const float = floatAt > 0 && floatAt < 1 ? Math.sin(floatAt * Math.PI) * flame.Float : 0;
  const settled = swell === 0 && float === 0;

  const x = -swell * E.Spread * strength.Amount * (flame.Count / 2 - index);
  const y = -swell * E.Lift * strength.Amount - float;
  setStyleIfChanged(
    letter.HTMLElement,
    "transform",
    settled ? "none" : `translate3d(${x.toFixed(4)}em, ${y.toFixed(4)}em, 0)`
  );
  setStyleIfChanged(
    letter.HTMLElement,
    "scale",
    `${1 + swell * E.Scale * strength.Amount}`,
    settled ? 0 : 0.0005
  );
  setStyleIfChanged(
    letter.HTMLElement,
    "--text-shadow-blur-radius",
    `${Math.min(E.MaxRadius, strength.Blur * E.Radius)}em`
  );
  const lit = Clamp((gradient + 50) / 150, 0, 1);
  const alpha = swell * strength.Blur * (E.DimAlpha + (1 - E.DimAlpha) * lit);
  setStyleIfChanged(
    letter.HTMLElement,
    "--text-shadow-opacity",
    `${alpha * 100}%`,
    settled ? 0 : 0.5
  );
  return !settled;
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

const smoothstep = (x: number) => {
  const t = Clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

const easeInOutCos = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * Clamp(x, 0, 1));

// Refreshed Simple Lyrics interlude. The dots stop bouncing: each one fills
// from dim to lit over its own third of the interlude, and the group breathes,
// swelling and easing back in slow whole cycles fitted to the interlude so the
// last breath has ended by the time it closes. On opening, the dots fade in
// one after another. The pre-hidden collapse (Mixed.css) still closes it.
const RefreshedDots = {
  Dim: 0.22,
  Lit: 0.92,
  EnterMs: 650, // one dot's fade-in
  EnterStaggerMs: 120,
  BreathMs: 4200, // aimed-for length of one breath
  MinBreathMs: 2600, // interludes with less room than this don't breathe
  BreathScale: 0.16,
};

type TimedElement = { HTMLElement: HTMLElement; StartTime: number; EndTime: number };

function animateRefreshedDot(
  line: { StartTime: number; EndTime: number },
  dot: TimedElement,
  index: number,
  position: number
): void {
  const el = dot.HTMLElement;
  const elapsed = position - line.StartTime;
  const fill = easeInOutCos(getProgressPercentage(position, dot.StartTime, dot.EndTime));
  const enter = smoothstep((elapsed - index * RefreshedDots.EnterStaggerMs) / RefreshedDots.EnterMs);
  const opacity = (RefreshedDots.Dim + (RefreshedDots.Lit - RefreshedDots.Dim) * fill) * enter;
  setStyleIfChanged(el, "opacity", `${opacity}`, 0.001);
  setStyleIfChanged(el, "scale", "1", 0.001);
  setStyleIfChanged(el, "transform", "translate3d(0, calc(var(--DefaultLyricsSize) * 0), 0)", 0.0001, 0);
  setStyleIfChanged(el, "--text-shadow-opacity", "0%", 1);

  // The group's breath, once per line. On `transform`, since the collapse
  // animates the group's `scale`.
  const group = el.parentElement;
  if (index !== 0 || !group) return;
  const room = line.EndTime - line.StartTime - preHiddenDotLineMs;
  let scale = 1;
  if (room >= RefreshedDots.MinBreathMs) {
    const cycles = Math.max(1, Math.round(room / RefreshedDots.BreathMs));
    const phase = Clamp(elapsed / (room / cycles), 0, cycles);
    scale = 1 + RefreshedDots.BreathScale * (0.5 - 0.5 * Math.cos(2 * Math.PI * phase));
  }
  setStyleIfChanged(group, "transform", `scale(${scale})`, 0.0005, scale);
}

// Takes the breath back off a group the previous look is animating.
function resetDotGroupBreath(dot: TimedElement): void {
  const group = dot.HTMLElement.parentElement;
  const prev = group && _styleCache.get(group)?.get("transform");
  if (group && prev !== undefined && prev !== 1) setStyleIfChanged(group, "transform", "scale(1)", 0, 1);
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
  if ($simpleLyricsMode.get()) {
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
        isExperimentEnabled("refreshedSimpleLyrics") ? 1 : YOffsetDamping
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
  if ($simpleLyricsMode.get()) {
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
  /*   if ($simpleLyricsMode.get()) {
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
  if ($simpleLyricsMode.get()) {
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
  const ProcessedPosition = position + timeOffset - ($simpleLyricsMode.get() ? 33.5 : 0);
  const refreshedSimple =
    $simpleLyricsMode.get() && isExperimentEnabled("refreshedSimpleLyrics");
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
    // The pop-out belongs to the refreshed layout; anywhere else every background line stays open.
    markBackgroundGroups(arr, ProcessedPosition, isBgPopActive());

    // Sweeps are measured here, before this frame changes any class, so the
    // reads don't force a layout. A line's words are as wide before it turns
    // Active as after.
    if (refreshedSimple) {
      for (const line of arr) {
        if (!line.HTMLElement.isConnected || !line.Syllables?.Lead) continue;
        if (getElementState(ProcessedPosition, line.StartTime, line.EndTime) === "Active") {
          getLineSweep(line.HTMLElement, line.Syllables.Lead);
        }
      }
    }

    for (let index = 0; index < arr.length; index++) {
      const line = arr[index];
      if (!line.HTMLElement.isConnected) continue;
      const lineState = getElementState(ProcessedPosition, line.StartTime, line.EndTime);
      mountedLine ??= line.HTMLElement;
      if (lineState !== "Sung") anyLineUnsung = true;
      if (lineState === "Active") noteActiveLine(index);
      if (line.AnimatedState !== lineState) {
        // Kept while the line is Active only: the one measured above for a
        // line turning Active this frame stays.
        if (line.AnimatedState === "Active") dropLineSweep(line.HTMLElement);
        line.Settling = lineState === "Sung";
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
              if ($simpleLyricsMode.get()) {
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
              if ($simpleLyricsMode.get()) {
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
              floatCap = Math.min(
                floatCap,
                getRefreshedFloat(word.StartTime, word.EndTime, ProcessedPosition)
              );
              targetYOffset = YOffsetSpline.at(floatCap);
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
              if ($simpleLyricsMode.get()) {
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
                ? getRefreshedWaveStrength(
                    word.EndTime - word.StartTime,
                    word.HTMLElement.classList.contains("LastWordInLine")
                  )
                : null;
              const waveFlame = waveStrength
                ? getRefreshedFlame(word.Letters, ProcessedPosition, !!word.BGWord)
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
                  const percentageCount = $simpleLyricsMode.get()
                    ? getProgressPercentage(ProcessedPosition, word.StartTime, word.EndTime)
                    : activeLetterPercentage;

                  const config = SimpleLyricsMode_LetterEffectsStrengthConfig;
                  const baseScale =
                  LetterScaleSpline.at(percentageCount) *
                    ($simpleLyricsMode.get()
                      ? word.TotalTime > config.LongerThan
                        ? config.Longer.Scale
                        : config.Shorter.Scale
                      : 1);
                  const baseYOffset =
                    LetterYOffsetSpline.at(percentageCount) *
                    ($simpleLyricsMode.get()
                      ? word.TotalTime > config.LongerThan
                        ? config.Longer.YOffset
                        : config.Shorter.YOffset
                      : 1);
                  const baseGlow =
                    GlowSpline.at(percentageCount) *
                    ($simpleLyricsMode.get()
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
                if (letterState === "NotSung" && !$simpleLyricsMode.get()) {
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
                  if ($simpleLyricsMode.get()) {
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
                  if ($simpleLyricsMode.get()) {
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
                if ($simpleLyricsMode.get()) {
                  setStyleIfChanged(letter.HTMLElement, "--SLM_GradientPosition", `${targetGradient}%`);
                } else {
                  setStyleIfChanged(letter.HTMLElement, "--gradient-position", `${targetGradient}%`);
                }
                if (waveStrength) {
                  stepRefreshedLetter(letter, k, waveStrength, waveFlame!, targetGradient);
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
                ? getRefreshedWaveStrength(
                    word.EndTime - word.StartTime,
                    word.HTMLElement.classList.contains("LastWordInLine")
                  )
                : null;
              const restFlame = restStrength
                ? getRefreshedFlame(word.Letters, ProcessedPosition, !!word.BGWord)
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
                  stepRefreshedLetter(letter, k, restStrength, restFlame!, gradient);
                  continue;
                }

                letter.AnimatorStore.Scale.SetGoal(LetterScaleSpline.at(letterRest));
                letter.AnimatorStore.YOffset.SetGoal(LetterYOffsetSpline.at(letterRest));
                letter.AnimatorStore.Glow.SetGoal(GlowSpline.at(0));

                const currentScale = letter.AnimatorStore.Scale.Step(deltaTime);
                const currentYOffset = letter.AnimatorStore.YOffset.Step(deltaTime);
                const currentGlow = letter.AnimatorStore.Glow.Step(deltaTime);

                if ($simpleLyricsMode.get()) {
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
                ? getRefreshedWaveStrength(
                    word.EndTime - word.StartTime,
                    word.HTMLElement.classList.contains("LastWordInLine")
                  )
                : null;
              const sungFlame = sungStrength
                ? getRefreshedFlame(word.Letters, ProcessedPosition, !!word.BGWord)
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
                  stepRefreshedLetter(letter, k, sungStrength, sungFlame!, gradient);
                  continue;
                }

                letter.AnimatorStore.Scale.SetGoal(LetterScaleSpline.at(1));
                letter.AnimatorStore.YOffset.SetGoal(LetterYOffsetSpline.at(1));
                letter.AnimatorStore.Glow.SetGoal(GlowSpline.at(1));

                const currentScale = letter.AnimatorStore.Scale.Step(deltaTime);
                const currentYOffset = letter.AnimatorStore.YOffset.Step(deltaTime);
                const currentGlow = letter.AnimatorStore.Glow.Step(deltaTime);

                if ($simpleLyricsMode.get()) {
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
          for (let i = 0; i < words.length; i++) {
            const word = words[i];
            if (word.AnimatorStore && !word.Dot) {
              word.AnimatorStore.Scale.SetGoal(ScaleSpline.at(1));
              if (refreshedSimple) {
                // The last words of a line are still floating up after it ends.
                floatCap = Math.min(
                  floatCap,
                  getRefreshedFloat(word.StartTime, word.EndTime, ProcessedPosition)
                );
                if (floatCap < 1) settled = false;
                word.AnimatorStore.YOffset.SetGoal(YOffsetSpline.at(floatCap), true);
              } else {
                word.AnimatorStore.YOffset.SetGoal(YOffsetSpline.at(1));
              }
              word.AnimatorStore.Glow.SetGoal(GlowSpline.at(1));
              const currentScale = word.AnimatorStore.Scale.Step(deltaTime);
              const currentYOffset = word.AnimatorStore.YOffset.Step(deltaTime);
              const currentGlow = word.AnimatorStore.Glow.Step(deltaTime);
              track(word.AnimatorStore);
              //if (!$simpleLyricsMode.get()) {
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
                if ($simpleLyricsMode.get()) {
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
                ? getRefreshedWaveStrength(
                    word.EndTime - word.StartTime,
                    word.HTMLElement.classList.contains("LastWordInLine")
                  )
                : null;
              const sungFlame = sungStrength
                ? getRefreshedFlame(word.Letters, ProcessedPosition, !!word.BGWord)
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
                  setStyleIfChanged(letter.HTMLElement, "--SLM_GradientPosition", "100%");
                  // A letter still up keeps the line settling until it's back at rest.
                  if (stepRefreshedLetter(letter, k, sungStrength, sungFlame!, 100)) {
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

                if ($simpleLyricsMode.get()) {
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
            if (checkNextLine()) line.Settling = false;
          }
        }
      }
    }
  } else if (CurrentLyricsType === "Line") {
    const arr = LyricsObject.Types.Line.Lines;

    for (let index = 0; index < arr.length; index++) {
      const line = arr[index];
      if (!line.HTMLElement.isConnected) continue;
      const lineState = getElementState(ProcessedPosition, line.StartTime, line.EndTime);
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
          if (!$simpleLyricsMode.get()) {
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
