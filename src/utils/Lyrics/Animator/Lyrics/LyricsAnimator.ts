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
import { setOnNewElementMounted } from "../../LyricsVirtualizer.ts";
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

// Refreshed Simple Lyrics (experiment): the letters of a held word come up in
// a curve, as in Apple Music. They start rising one after another, a little
// ahead of the fill, and each one peaks as it is reached. Letters the curve has
// left behind settle a little lower and hold there, and letters still ahead
// are on their way up, so the word bows around its newest peak. Heights are
// measured from where the word rests unsung, so the word's own lift doesn't add
// to them. Once the word is done the letters settle back into it together on a
// spring. The glow is a flame that travels with the fill: it lights at the
// start of the word and burns brightest on the letter being lit, the letters it
// has passed keep glowing, and the whole word dies down together at the end.
const RefreshedFlame = {
  // The letters start rising across this share of the word, the first with
  // it, and each takes RiseShare of the word to come up, within limits.
  Stagger: 0.5,
  RiseShare: 0.27,
  RiseMinMs: 600,
  RiseMaxMs: 1000,
  // Behind the newest peak a letter settles to Settle of its height, over
  // about SettleTrail letters. Scale settles further than lift.
  Settle: 0.78,
  ScaleSettle: 0.4,
  SettleTrail: 2,
  HoldMs: 100,
  // The way back down is a lightly underdamped spring: it overshoots rest a
  // little and settles, and is cut off at ReleaseMs.
  ReleaseMs: 1500,
  ReleaseFreq: 0.9, // Hz
  ReleaseDamping: 0.7,
  // The lift and glow run ahead of the song by this much, so they read as on
  // the beat rather than after it.
  LeadMs: 150,
  // At a letter's peak. Lift is × --DefaultLyricsSize from where the word
  // rests unsung; Apple's letters peak about 0.09 em up and settle at 0.07
  // (on a line's last word, where Motion comes out near 1.2). Kept a touch
  // lower than that by request.
  Scale: 0.055,
  Lift: 0.0738,
  // The glow flame, in letters from its head. It reaches less far ahead than
  // it trails, and the letters it has passed keep Sustain of it.
  // Wide enough that each letter warms up before the fill reaches it and
  // cools slowly after, so the flame flows instead of letters switching on.
  GlowLead: 0.82,
  GlowTrail: 0.5,
  Sustain: 0.6,
  IgniteMs: 800,
  FadeMs: 700,
  Radius: 0.1, // em, at the edges of the glow
  HeadRadius: 0.185, // em, at its head
  Alpha: 0.8,
  LastWordBoost: 1.25,
};

type RefreshedWaveStrength = { Motion: number; Glow: number };

const smoothstep = (x: number) => {
  const t = Clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

// The motion barely depends on how long the word is held, as in Apple Music:
// nearly full on the shortest split word (~1 s), full from about three
// seconds. The glow starts at half, so short words still light up. The line's
// last word gets a little extra.
function getRefreshedWaveStrength(duration: number, isLastWord: boolean): RefreshedWaveStrength {
  const boost = isLastWord ? RefreshedFlame.LastWordBoost : 1;
  return {
    Motion: (0.92 + 0.08 * smoothstep((duration - 1000) / 2000)) * boost,
    Glow: (0.5 + 0.5 * smoothstep((duration - 1000) / 2500)) * boost,
  };
}

const easeInOutCos = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * Clamp(x, 0, 1));

type SplitLetter = NonNullable<SyllableLead["Letters"]>[number];

type RefreshedFlameState = {
  Letters: SplitLetter[];
  Position: number;
  // Where the flame's head is, in letters from the word's start, and how hot it
  // burns.
  Head: number;
  Heat: number;
  // The same for every letter of the word, so worked out once per word: the
  // release (getRefreshedRelease), how far the word itself has lifted
  // (getRefreshedWordLift), and the curve's clock and timing (getRefreshedCurve).
  Release: number;
  WordLift: number;
  CurveAt: number;
  Spacing: number;
  RiseMs: number;
};

function getRefreshedFlame(letters: SplitLetter[], position: number): RefreshedFlameState {
  const F = RefreshedFlame;
  const count = letters.length;
  const first = letters[0];
  const last = letters[count - 1];
  const state: RefreshedFlameState = {
    Letters: letters,
    Position: position,
    Head: 0,
    Heat: 0,
    Release: 0,
    WordLift: 0,
    CurveAt: 0,
    Spacing: 0,
    RiseMs: 0,
  };
  if (!first || !last) return state;
  state.Release = getRefreshedRelease(last, position);
  state.WordLift = getRefreshedWordLift(first, last, position);
  const duration = last.EndTime - first.StartTime || 1;
  state.Spacing = (duration * F.Stagger) / count;
  state.RiseMs = Clamp(duration * F.RiseShare, F.RiseMinMs, F.RiseMaxMs);
  state.CurveAt = position + F.LeadMs - first.StartTime;
  // No lead here: the head sits on the letter being lit.
  const at = position;
  if (at <= first.StartTime) return state;
  if (at >= last.EndTime) {
    state.Head = count;
    state.Heat = 1 - easeInOutCos((at - last.EndTime) / F.FadeMs);
    return state;
  }
  let head = count;
  for (let i = 0; i < count; i++) {
    const letter = letters[i];
    if (at < letter.EndTime) {
      head = i + Math.max(0, at - letter.StartTime) / (letter.EndTime - letter.StartTime || 1);
      break;
    }
  }
  const ignite = Clamp((at - first.StartTime) / F.IgniteMs, 0, 1);
  state.Head = head;
  state.Heat = 1 - (1 - ignite) * (1 - ignite);
  return state;
}

// How much of the flame reaches letter `index`: 1 under the head, falling off
// over GlowLead letters ahead of it. Behind the head it settles to Sustain
// over GlowTrail letters, so lit letters stay lit and the word ends glowing
// evenly before it fades together.
function getRefreshedGlow(flame: RefreshedFlameState, index: number): number {
  if (flame.Heat <= 0) return 0;
  const d = index + 0.5 - flame.Head;
  const F = RefreshedFlame;
  if (d > 0) return flame.Heat * Math.exp(-((d / F.GlowLead) ** 2));
  return flame.Heat * (F.Sustain + (1 - F.Sustain) * Math.exp(-((d / F.GlowTrail) ** 2)));
}

// 0 to 1: the way back down, the step response of an underdamped spring.
function getRefreshedRelease(last: SplitLetter, position: number): number {
  const F = RefreshedFlame;
  const t = position - last.EndTime - F.HoldMs;
  if (t <= 0) return 0;
  if (t >= F.ReleaseMs) return 1;
  const w = 2 * Math.PI * F.ReleaseFreq;
  const z = F.ReleaseDamping;
  const wd = w * Math.sqrt(1 - z * z);
  const s = t / 1000;
  return 1 - Math.exp(-z * w * s) * (Math.cos(wd * s) + ((z * w) / wd) * Math.sin(wd * s));
}

type RefreshedCurve = { Rise: number; Lift: number; Scale: number };

// Where letter `index` sits on the word's curve. Rise is how far it has come
// up (0 to 1, one way only); Lift and Scale are that, less what it has settled
// since the curve's peak moved past it. Once per letter per frame.
function getRefreshedCurve(flame: RefreshedFlameState, index: number): RefreshedCurve {
  const count = flame.Letters.length;
  if (count === 0) return { Rise: 0, Lift: 0, Scale: 0 };
  const F = RefreshedFlame;
  const spacing = flame.Spacing;
  const rise = flame.RiseMs;
  const at = flame.CurveAt;
  // Nearly linear, as Apple's are, only softened at either end.
  const x = Clamp((at - index * spacing) / rise, 0, 1);
  const up = 0.5 * x + 0.5 * easeInOutCos(x);
  // The peak is on the letter that has just finished coming up. It stops at
  // the last letter, so a short word's letters stay near their peak.
  const peak = Math.min((at - rise) / spacing, count - 1);
  const behind = Math.max(0, peak - index) / F.SettleTrail;
  const near = Math.exp(-(behind * behind));
  return {
    Rise: up,
    Lift: up * (F.Settle + (1 - F.Settle) * near),
    Scale: up * (F.ScaleSettle + (1 - F.ScaleSettle) * near),
  };
}

// How far the word itself has lifted (× --DefaultLyricsSize, up is positive).
// The letters ride on it, so their own offset makes up the rest.
function getRefreshedWordLift(first: SplitLetter, last: SplitLetter, position: number): number {
  const progress = Clamp(
    (position - first.StartTime) / (last.EndTime - first.StartTime || 1),
    0,
    1
  );
  return YOffsetSpline.at(0) - YOffsetSpline.at(progress);
}

// Steps one split letter and writes everything but its gradient. The springs
// are pinned to the envelope, which already eases in and out: a spring left to
// settle on its own would be stranded once the line stops animating. Returns
// whether the letter is still up.
function stepRefreshedLetter(
  letter: SplitLetter,
  index: number,
  strength: RefreshedWaveStrength,
  flame: RefreshedFlameState,
  deltaTime: number
): boolean {
  const store = letter.AnimatorStore!;
  const F = RefreshedFlame;
  const curve = getRefreshedCurve(flame, index);
  const rise = curve.Rise;
  const held = 1 - flame.Release;
  store.Scale.SetGoal(1 + F.Scale * strength.Motion * curve.Scale * held, true);
  // Up from where the word rests unsung, less what the word has already
  // lifted; the release brings the letter back into the word. Halved: letter
  // offsets are written doubled below.
  const lift = (F.Lift * strength.Motion * curve.Lift - flame.WordLift) * held;
  store.YOffset.SetGoal(-lift / 2, true);
  store.Glow.SetGoal(Math.min(strength.Glow * getRefreshedGlow(flame, index), 1), true);
  const currentScale = store.Scale.Step(deltaTime);
  const currentYOffset = store.YOffset.Step(deltaTime);
  const currentGlow = store.Glow.Step(deltaTime);

  // Exact once the letter is back at rest, so nothing is left a hair off.
  const settled = flame.Heat <= 0 && (rise <= 0 || flame.Release >= 1);
  setStyleIfChanged(
    letter.HTMLElement,
    "transform",
    `translate3d(0, calc(var(--DefaultLyricsSize) * ${currentYOffset * 2}), 0)`,
    settled ? 0 : 0.0001,
    currentYOffset * 2
  );
  setStyleIfChanged(letter.HTMLElement, "scale", `${currentScale}`, settled ? 0 : 0.001);
  setStyleIfChanged(
    letter.HTMLElement,
    "--text-shadow-blur-radius",
    `${F.Radius + (F.HeadRadius - F.Radius) * Math.min(currentGlow, 1)}em`,
    0.005
  );
  setStyleIfChanged(
    letter.HTMLElement,
    "--text-shadow-opacity",
    `${Math.min(currentGlow * F.Alpha * 100, 100)}%`,
    settled ? 0 : 1
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
function setClass(el: HTMLElement, cls: string, on: boolean): void {
  if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on);
}

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

  if (CurrentLyricsType === "Syllable") {
    const arr = LyricsObject.Types.Syllable.Lines;

    for (let index = 0; index < arr.length; index++) {
      const line = arr[index];
      if (!line.HTMLElement.isConnected) continue;
      const lineState = getElementState(ProcessedPosition, line.StartTime, line.EndTime);
      mountedLine ??= line.HTMLElement;
      if (lineState !== "Sung") anyLineUnsung = true;
      if (line.AnimatedState !== lineState) {
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
        for (let wordIndex = 0; wordIndex < words.length; wordIndex++) {
          const word = words[wordIndex];
          const wordState = getElementState(ProcessedPosition, word.StartTime, word.EndTime);
          const percentage = getProgressPercentage(ProcessedPosition, word.StartTime, word.EndTime);

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

            word.AnimatorStore.Scale.SetGoal(targetScale);
            word.AnimatorStore.YOffset.SetGoal(targetYOffset);
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
                ? getRefreshedFlame(word.Letters, ProcessedPosition)
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
                  // The fill goes one letter after another: a letter starts
                  // when the one before it is lit, and ends fully lit.
                  targetGradient =
                    k === activeLetterIndex ? -50 + 150 * activeLetterPercentage : targetGradient;
                }

                // Apply the calculated gradient
                if ($simpleLyricsMode.get()) {
                  setStyleIfChanged(letter.HTMLElement, "--SLM_GradientPosition", `${targetGradient}%`);
                } else {
                  setStyleIfChanged(letter.HTMLElement, "--gradient-position", `${targetGradient}%`);
                }
                if (waveStrength) {
                  stepRefreshedLetter(letter, k, waveStrength, waveFlame!, deltaTime);
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
                ? getRefreshedFlame(word.Letters, ProcessedPosition)
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
                  setStyleIfChanged(letter.HTMLElement, "--SLM_GradientPosition", "-50%");
                  stepRefreshedLetter(letter, k, restStrength, restFlame!, deltaTime);
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
                ? getRefreshedFlame(word.Letters, ProcessedPosition)
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
                  stepRefreshedLetter(letter, k, sungStrength, sungFlame!, deltaTime);
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
          for (let i = 0; i < words.length; i++) {
            const word = words[i];
            if (word.AnimatorStore && !word.Dot) {
              word.AnimatorStore.Scale.SetGoal(ScaleSpline.at(1));
              word.AnimatorStore.YOffset.SetGoal(YOffsetSpline.at(1));
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
                ? getRefreshedFlame(word.Letters, ProcessedPosition)
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
                  if (stepRefreshedLetter(letter, k, sungStrength, sungFlame!, deltaTime)) {
                    settled = false;
                  }
                  track(letter.AnimatorStore);
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
  // Stands in for `.LyricsContent:not(:has(.line.Active)):not(:has(.line.NotSung))`
  // in Mixed.css: with line classes inside a :has(), every line change made
  // Blink re-check the page's ancestors, up to <html>.
  const lyricsContent = mountedLine?.closest<HTMLElement>(".LyricsContent");
  if (lyricsContent) setClass(lyricsContent, "LinesAllSung", !anyLineUnsung);

  // Commit any queued style changes after completing the animation computations
  flushStyleBatch();
}
