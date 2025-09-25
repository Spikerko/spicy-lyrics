import Spline from "npm:cubic-spline";
import { easeSinOut } from "npm:d3-ease";
import Spring from "@socali/modules/Spring";
import Defaults from "../../../../components/Global/Defaults.ts";
import { SpotifyPlayer } from "../../../../components/Global/SpotifyPlayer.ts";
import { isSpicySidebarMode } from "../../../../components/Utils/SidebarLyrics.ts";
import storage from "../../../storage.ts";
import { currentLyricsPlayer } from "../../Global/Applyer.ts";
import { LyricsObject, SimpleLyricsMode_LetterEffectsStrengthConfig } from "../../lyrics.ts";
import { BlurMultiplier, SidebarBlurMultiplier, timeOffset } from "../Shared.ts";

/* import { CurveInterpolator } from "curve-interpolator"; */

const getSLMAnimation = (duration: number) => {
  return `SLM_Animation ${duration}ms linear forwards`;
};

const getPreSLMAnimation = (duration: number) => {
  return `Pre_SLM_GradientAnimation ${duration}ms linear forwards`;
};

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
  { Time: 0.7, Value: 1.025 },
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
  { Time: 1, Value: -0.04 },
];

const ScaleSpline = GetSpline(ScaleRange);
const YOffsetSpline = GetSpline(
  storage.get("simpleLyricsMode") === "true" ? SimpleYOffsetRange : YOffsetRange
);

const LetterYOffsetSpline = GetSpline(YOffsetRange);

const GlowSpline = GetSpline(GlowRange);

const YOffsetDamping = 0.4;
const YOffsetFrequency = 1.25;
const ScaleDamping = 0.6;
const ScaleFrequency = 0.7;
const GlowDamping = 0.5;
const GlowFrequency = 1;

// NEW Dot Animation Constants
const DotAnimations = {
  YOffsetDamping: 0.4,
  YOffsetFrequency: 1.25,
  ScaleDamping: 0.6,
  ScaleFrequency: 0.7,
  GlowDamping: 0.5,
  GlowFrequency: 1,
  OpacityDamping: 0.5, // Assuming same as Glow
  OpacityFrequency: 1, // Assuming same as Glow

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
  OpacityRange: [
    // Controls element opacity
    { Time: 0, Value: storage.get("simpleLyricsMode") === "true" ? 0.27 : 0.35 }, // Resting (NotSung)
    { Time: 0.6, Value: 1 }, // Peak animation
    { Time: 1, Value: 1 }, // End (Sung)
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
const DotOpacitySpline = GetSpline(DotAnimations.OpacityRange);

// DotGroup splines
//const DotGroupScaleSpline = GetSpline(DotGroupAnimations.ScaleRange);
/* const DotGroupYOffsetSpline = new CurveInterpolator(
	DotGroupAnimations.YOffsetRange.map((metadata) => [metadata.Time, metadata.Value])
); */
//const DotGroupOpacitySpline = GetSpline(DotGroupAnimations.OpacityRange);

const SungLetterGlow = 0.2;

const createWordSprings = () => {
  if (Defaults.SimpleLyricsMode) {
    return {
      Scale: {
        Step: () => {},
        SetGoal: () => {},
      },
      /* YOffset: {
        Step: () => {},
        SetGoal: () => {},
      }, */
      YOffset: new Spring(YOffsetSpline.at(0), YOffsetFrequency, YOffsetDamping),
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
  if (Defaults.SimpleLyricsMode) {
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
  /*   if (Defaults.SimpleLyricsMode) {
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

const createLetterSprings = () => {
  return {
    Scale: new Spring(ScaleSpline.at(0), ScaleFrequency, ScaleDamping),
    YOffset: new Spring(LetterYOffsetSpline.at(0), YOffsetFrequency, YOffsetDamping),
    Glow: new Spring(GlowSpline.at(0), GlowFrequency, GlowDamping),
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
  if (Defaults.SimpleLyricsMode) {
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

export function findActiveElement(currentTime: number): any {
  const ProcessedPosition = currentTime + timeOffset;
  const CurrentLyricsType = Defaults.CurrentLyricsType;

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
  if (currentTime > endTime) return "Sung";
  return "Active";
}

function getProgressPercentage(currentTime: number, startTime: number, endTime: number): number {
  if (currentTime <= startTime) return 0;
  if (currentTime >= endTime) return 1;
  return (currentTime - startTime) / (endTime - startTime);
}

let lastAnimateFrameTime = 0;

/* Global.SetScope("lyrics.animator.set_frame_interval", (input: number) => {
  FRAME_INTERVAL = input;
}) */

let clpStatus: "playing" | "paused" | null = null;

export function Animate(position: number): void {
  const ProcessedPosition = position + timeOffset - (Defaults.SimpleLyricsMode ? 33.5 : 0);

  if (Defaults.LyricsRenderer === "aml-lyrics") {
    if (clpStatus === null) {
      if (!currentLyricsPlayer) return;
      if (SpotifyPlayer.IsPlaying) {
        currentLyricsPlayer.resume();
        clpStatus = "playing";
      } else {
        currentLyricsPlayer.pause();
        clpStatus = "paused";
      }
    }
    if (SpotifyPlayer.IsPlaying && clpStatus === "playing") {
      if (!currentLyricsPlayer) return;
      currentLyricsPlayer.pause();
      clpStatus = "paused";
    } else if (!SpotifyPlayer.IsPlaying && clpStatus === "paused") {
      if (!currentLyricsPlayer) return;
      currentLyricsPlayer.resume();
      clpStatus = "playing";
    }
    if (currentLyricsPlayer) {
      currentLyricsPlayer.setCurrentTime(ProcessedPosition);
      currentLyricsPlayer.update(ProcessedPosition);
    }
    return;
  }

  const now = performance.now();

  const LIMIT_FRAMES = (isSpicySidebarMode ? (Defaults.SimpleLyricsMode ? false : true) : false);
  const FRAME_INTERVAL = 1000 / 50;

  //const isLetterElementActive = (findActiveElement(position)?.[1] === "letter" || findActiveElement(position)?.[1] === "letterGroup");
  //const shouldLimitFrame = ((LIMIT_FRAMES && !isLetterElementActive) && now - lastAnimateFrameTime < FRAME_INTERVAL);

  const shouldLimitFrame = LIMIT_FRAMES && now - lastAnimateFrameTime < FRAME_INTERVAL;
  if (shouldLimitFrame) {
    return;
  }
  const deltaTime = (now - lastFrameTime) / 1000;
  lastFrameTime = now;
  lastAnimateFrameTime = now;

  const CurrentLyricsType = Defaults.CurrentLyricsType;

  if (!CurrentLyricsType || CurrentLyricsType === "None") return;

  /* const Credits =
    document.querySelector<HTMLElement>(
      "#SpicyLyricsPage .LyricsContainer .LyricsContent .Credits"
    ) ?? undefined; */

  // Define proper types for the arrays and indices
  const applyBlur = (
    arr: Array<{ HTMLElement: HTMLElement; StartTime: number; EndTime: number }>,
    activeIndex: number,
    blurMultiplierValue: number
  ): void => {
    if (!arr[activeIndex]) return;

    arr[activeIndex].HTMLElement.style.setProperty("--BlurAmount", "0px");

    const max = BlurMultiplier * 5 + BlurMultiplier * 0.465;
    for (let i = activeIndex + 1; i < arr.length; i++) {
      const blurAmount = blurMultiplierValue * (i - activeIndex);
      if (getElementState(ProcessedPosition, arr[i].StartTime, arr[i].EndTime) === "Active") {
        arr[i].HTMLElement.style.setProperty("--BlurAmount", "0px");
      } else {
        arr[i].HTMLElement.style.setProperty(
          "--BlurAmount",
          `${blurAmount >= max ? max : blurAmount}px`
        );
      }
    }

    for (let i = activeIndex - 1; i >= 0; i--) {
      const blurAmount = blurMultiplierValue * (activeIndex - i);
      if (getElementState(ProcessedPosition, arr[i].StartTime, arr[i].EndTime) === "Active") {
        arr[i].HTMLElement.style.setProperty("--BlurAmount", `0px`);
      } else {
        arr[i].HTMLElement.style.setProperty(
          "--BlurAmount",
          `${blurAmount >= max ? max : blurAmount}px`
        );
      }
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

  // These utility functions are not used but kept for future reference
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _calculateOpacity = (percentage: number): number => {
    if (percentage <= 0.65) {
      return percentage * 100;
    } else {
      return (1 - percentage) * 100;
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _calculateLineGlowOpacity = (percentage: number): number => {
    if (percentage <= 0.5) {
      return percentage * 200;
    } else if (percentage <= 0.8 && percentage > 0.5) {
      return 100;
    } else {
      return (1 - (percentage - 0.8) / 0.2) * 100;
    }
  };

  if (CurrentLyricsType === "Syllable") {
    const arr = LyricsObject.Types.Syllable.Lines;

    // Find the active line index
    let _activeLineIndex = -1;
    for (let i = 0; i < arr.length; i++) {
      if (getElementState(ProcessedPosition, arr[i].StartTime, arr[i].EndTime) === "Active") {
        _activeLineIndex = i;
        break;
      }
    }

    for (let index = 0; index < arr.length; index++) {
      const line = arr[index];
      const lineState = getElementState(ProcessedPosition, line.StartTime, line.EndTime);

      if (lineState === "Active") {
        if (Blurring_LastLine !== index) {
          applyBlur(arr, index, isSpicySidebarMode ? SidebarBlurMultiplier : BlurMultiplier);
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

            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const totalDuration = word.EndTime - word.StartTime; // Kept for future reference

            if (wordState === "Active") {
              targetScale = ScaleSpline.at(percentage);
              targetYOffset = YOffsetSpline.at(percentage);
              targetGlow = GlowSpline.at(percentage);
              if (Defaults.SimpleLyricsMode) {
                targetGradientPos = -50 + 120 * percentage;
              } else {
                targetGradientPos = -20 + 120 * percentage;
              }
            } else if (wordState === "NotSung") {
              targetScale = ScaleSpline.at(0);
              targetYOffset = YOffsetSpline.at(0);
              targetGlow = GlowSpline.at(0);
              if (Defaults.SimpleLyricsMode) {
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

            word.HTMLElement.style.scale = `${currentScale}`;
            word.HTMLElement.style.transform = `translateY(calc(var(--DefaultLyricsSize) * ${currentYOffset}))`;
            if (isLetterGroup) {
              if (Defaults.SimpleLyricsMode) {
                if (wordState === "Active") {
                  if (Defaults.SimpleLyricsMode_RenderingType === "animate") {
                    const nextWord = words[wordIndex + 1];
                    if (nextWord && !nextWord?.LetterGroup) {
                      if (!nextWord.PreSLMAnimated) {
                        nextWord.PreSLMAnimated = true;
                        nextWord.HTMLElement.style.removeProperty("--SLM_GradientPosition");
                        setTimeout(
                          () => {
                            nextWord.HTMLElement.style.animation = getPreSLMAnimation(250);
                          },
                          Number(totalDuration * 0.845 - 130) ?? totalDuration
                        );
                      }
                    }
                  }
                }
              }
            }
            if (!isLetterGroup) {
              if (Defaults.SimpleLyricsMode) {
                if (wordState === "Active" && !word.SLMAnimated) {
                  if (Defaults.SimpleLyricsMode_RenderingType === "calculate") {
                    word.HTMLElement.style.setProperty(
                      "--SLM_GradientPosition",
                      `${targetGradientPos}%`
                    );
                  } else {
                    word.HTMLElement.style.removeProperty("--SLM_GradientPosition");
                    //word.HTMLElement.style.removeProperty("--SLM_TranslateY");
                    word.HTMLElement.style.animation = getSLMAnimation(totalDuration);
                    word.SLMAnimated = true;
                    word.PreSLMAnimated = false;
                    const nextWord = words[wordIndex + 1];
                    if (nextWord) {
                      if (!nextWord.PreSLMAnimated) {
                        nextWord.PreSLMAnimated = true;
                        nextWord.HTMLElement.style.removeProperty("--SLM_GradientPosition");
                        setTimeout(
                          () => {
                            nextWord.HTMLElement.style.animation = getPreSLMAnimation(125);
                          },
                          Number(totalDuration * 0.6 - 22) ?? totalDuration
                        );
                      }
                    }
                  }
                }
                if (wordState === "NotSung") {
                  if (Defaults.SimpleLyricsMode_RenderingType === "calculate") {
                    word.HTMLElement.style.setProperty(
                      "--SLM_GradientPosition",
                      `${targetGradientPos}%`
                    );
                  } else {
                    if (!word.PreSLMAnimated) {
                      word.HTMLElement.style.animation = "none";
                      word.HTMLElement.style.setProperty("--SLM_GradientPosition", "-50%");
                      //word.HTMLElement.style.setProperty("--SLM_TranslateY", "0.01");
                    }
                    word.SLMAnimated = false;
                    /* word.PreSLMAnimated = false; */
                  }
                }
                if (wordState === "Sung") {
                  if (Defaults.SimpleLyricsMode_RenderingType === "calculate") {
                    word.HTMLElement.style.setProperty(
                      "--SLM_GradientPosition",
                      `${targetGradientPos}%`
                    );
                  } else {
                    word.HTMLElement.style.animation = "none";
                    word.HTMLElement.style.setProperty("--SLM_GradientPosition", "100%");
                    //word.HTMLElement.style.setProperty("--SLM_TranslateY", "-0.03");
                    //word.HTMLElement.style.animation = getSLMAnimation(0);
                    word.SLMAnimated = false;
                    word.PreSLMAnimated = false;
                  }
                }
              } else {
                word.HTMLElement.style.setProperty("--gradient-position", `${targetGradientPos}%`);
              }
              word.HTMLElement.style.setProperty(
                "--text-shadow-blur-radius",
                `${4 + 2 * currentGlow * 1}px`
              );
              word.HTMLElement.style.setProperty(
                "--text-shadow-opacity",
                `${Math.min(currentGlow * 35, 100)}%`
              );
            }
          } else if (isDot && !isLetterGroup) {
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

            word.HTMLElement.style.transform = `translateY(calc(var(--DefaultLyricsSize) * ${currentYOffset ?? 0}))`; // Use --DefaultLyricsSize
            word.HTMLElement.style.scale = `${currentScale}`;
            word.HTMLElement.style.opacity = `${currentOpacity}`;
            word.HTMLElement.style.setProperty(
              "--text-shadow-blur-radius",
              `${4 + 6 * currentGlow}px`
            ); // Match inspiration
            word.HTMLElement.style.setProperty("--text-shadow-opacity", `${currentGlow * 90}%`); // Match inspiration
          }

          if (isLetterGroup && word.Letters) {
            if (wordState === "Active") {
              for (let k = 0; k < word.Letters.length; k++) {
                const letter = word.Letters[k];

                if (!letter.AnimatorStore) {
                  letter.AnimatorStore = createLetterSprings();
                  letter.AnimatorStore.Scale.SetGoal(ScaleSpline.at(0), true);
                  letter.AnimatorStore.YOffset.SetGoal(LetterYOffsetSpline.at(0), true);
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
                targetScale = ScaleSpline.at(0); // Default active state target is resting
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
                  const percentageCount = Defaults.SimpleLyricsMode
                    ? getProgressPercentage(ProcessedPosition, word.StartTime, word.EndTime)
                    : activeLetterPercentage;

                  const config = SimpleLyricsMode_LetterEffectsStrengthConfig;
                  const baseScale =
                    ScaleSpline.at(percentageCount) *
                    (Defaults.SimpleLyricsMode
                      ? word.TotalTime > config.LongerThan
                        ? config.Longer.Scale
                        : config.Shorter.Scale
                      : 1);
                  const baseYOffset =
                    LetterYOffsetSpline.at(percentageCount) *
                    (Defaults.SimpleLyricsMode
                      ? word.TotalTime > config.LongerThan
                        ? config.Longer.YOffset
                        : config.Shorter.YOffset
                      : 1);
                  const baseGlow =
                    GlowSpline.at(percentageCount) *
                    (Defaults.SimpleLyricsMode
                      ? word.TotalTime > config.LongerThan
                        ? config.Longer.Glow
                        : config.Shorter.Glow
                      : 1);

                  // Get the resting values
                  const restingScale = ScaleSpline.at(0);
                  const restingYOffset = LetterYOffsetSpline.at(0);
                  const restingGlow = GlowSpline.at(0);

                  // Calculate distance from active letter and apply smooth falloff
                  const distance = Math.abs(k - activeLetterIndex);

                  // Use a steeper falloff curve for proximity effect
                  // This creates a more pronounced difference between the active letter and others
                  const falloff = Math.max(0, 1 / (1 + distance * 0.9));

                  // Apply the proximity-based animation values
                  targetScale = restingScale + (baseScale - restingScale) * falloff;
                  targetYOffset = restingYOffset + (baseYOffset - restingYOffset) * falloff;
                  targetGlow = restingGlow + (baseGlow - restingGlow) * falloff;
                } // else - if no active letter, targets remain at resting state set above

                // Only override values for NotSung letters or for letters in a non-Active word
                if (letterState === "NotSung" && !Defaults.SimpleLyricsMode) {
                  // NotSung letters always use resting values
                  targetScale = ScaleSpline.at(0);
                  targetYOffset = LetterYOffsetSpline.at(0);
                  targetGlow = GlowSpline.at(0);
                } else if (letterState === "Sung" && activeLetterIndex === -1) {
                  // Only apply SungLetterGlow to letters in words that don't have an active letter
                  // This preserves our proximity-based animation for active words
                  targetGlow = GlowSpline.at(SungLetterGlow);
                }

                // --- Determine Gradient based on individual letter state ---
                if (letterState === "NotSung") {
                  if (Defaults.SimpleLyricsMode) {
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
                  if (Defaults.SimpleLyricsMode) {
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

                // Set spring goals (smooth animation)
                letter.AnimatorStore.Scale.SetGoal(targetScale);
                letter.AnimatorStore.YOffset.SetGoal(targetYOffset);
                letter.AnimatorStore.Glow.SetGoal(targetGlow);

                // Step springs
                const currentScale = letter.AnimatorStore.Scale.Step(deltaTime);
                const currentYOffset = letter.AnimatorStore.YOffset.Step(deltaTime);
                const currentGlow = letter.AnimatorStore.Glow.Step(deltaTime);

                const totalDuration = letter.EndTime - letter.StartTime;
                // Apply styles from springs and calculated gradient
                if (Defaults.SimpleLyricsMode) {
                  if (Defaults.SimpleLyricsMode_RenderingType === "calculate") {
                    letter.HTMLElement.style.setProperty(
                      "--SLM_GradientPosition",
                      `${targetGradient}%`
                    );
                  } else {
                    if (letterState === "Active" && !letter.SLMAnimated) {
                      letter.HTMLElement.style.removeProperty("--SLM_GradientPosition");
                      letter.HTMLElement.style.animation = getSLMAnimation(totalDuration);
                      letter.SLMAnimated = true;
                    }
                    if (letterState === "NotSung") {
                      if (!letter.PreSLMAnimated) {
                        letter.HTMLElement.style.animation = "none";
                        letter.HTMLElement.style.setProperty("--SLM_GradientPosition", "-50%");
                      }
                      letter.SLMAnimated = false;
                    }
                    if (letterState === "Sung") {
                      letter.HTMLElement.style.animation = "none";
                      letter.HTMLElement.style.setProperty("--SLM_GradientPosition", "100%");
                      // letter.HTMLElement.style.animation = getSLMAnimation(0);
                      letter.SLMAnimated = false;
                    }
                  }
                } else {
                  letter.HTMLElement.style.setProperty("--gradient-position", `${targetGradient}%`);
                }
                letter.HTMLElement.style.transform = `translateY(calc(var(--DefaultLyricsSize) * ${currentYOffset * 2}))`;
                letter.HTMLElement.style.scale = `${currentScale}`;
                letter.HTMLElement.style.setProperty(
                  "--text-shadow-blur-radius",
                  `${4 + 12 * currentGlow}px`
                );
                letter.HTMLElement.style.setProperty(
                  "--text-shadow-opacity",
                  `${currentGlow * LetterGlowMultiplier_Opacity}%`
                );
              }
            } else if (wordState === "NotSung" && word.Letters) {
              for (let k = 0; k < word.Letters.length; k++) {
                const letter = word.Letters[k];

                if (!letter.AnimatorStore) {
                  letter.AnimatorStore = createLetterSprings();
                  letter.AnimatorStore.Scale.SetGoal(ScaleSpline.at(0), true);
                  letter.AnimatorStore.YOffset.SetGoal(LetterYOffsetSpline.at(0), true);
                  letter.AnimatorStore.Glow.SetGoal(GlowSpline.at(0), true);
                }

                letter.AnimatorStore.Scale.SetGoal(ScaleSpline.at(0));
                letter.AnimatorStore.YOffset.SetGoal(LetterYOffsetSpline.at(0));
                letter.AnimatorStore.Glow.SetGoal(GlowSpline.at(0));

                const currentScale = letter.AnimatorStore.Scale.Step(deltaTime);
                const currentYOffset = letter.AnimatorStore.YOffset.Step(deltaTime);
                const currentGlow = letter.AnimatorStore.Glow.Step(deltaTime);

                if (Defaults.SimpleLyricsMode) {
                  letter.HTMLElement.style.animation = "none";
                  letter.HTMLElement.style.setProperty("--SLM_GradientPosition", "-50%");
                } else {
                  letter.HTMLElement.style.setProperty("--gradient-position", `-20%`);
                }

                letter.HTMLElement.style.transform = `translateY(calc(var(--DefaultLyricsSize) * ${currentYOffset * 2}))`;
                letter.HTMLElement.style.scale = `${currentScale}`;
                letter.HTMLElement.style.setProperty(
                  "--text-shadow-blur-radius",
                  `${4 + 12 * currentGlow}px`
                );
                letter.HTMLElement.style.setProperty(
                  "--text-shadow-opacity",
                  `${currentGlow * LetterGlowMultiplier_Opacity}%`
                );
              }
            } else if (wordState === "Sung" && word.Letters) {
              for (let k = 0; k < word.Letters.length; k++) {
                const letter = word.Letters[k];

                if (!letter.AnimatorStore) {
                  letter.AnimatorStore = createLetterSprings();
                  letter.AnimatorStore.Scale.SetGoal(ScaleSpline.at(0), true);
                  letter.AnimatorStore.YOffset.SetGoal(LetterYOffsetSpline.at(0), true);
                  letter.AnimatorStore.Glow.SetGoal(GlowSpline.at(0), true);
                }

                letter.AnimatorStore.Scale.SetGoal(ScaleSpline.at(1));
                letter.AnimatorStore.YOffset.SetGoal(LetterYOffsetSpline.at(1));
                letter.AnimatorStore.Glow.SetGoal(GlowSpline.at(1));

                const currentScale = letter.AnimatorStore.Scale.Step(deltaTime);
                const currentYOffset = letter.AnimatorStore.YOffset.Step(deltaTime);
                const currentGlow = letter.AnimatorStore.Glow.Step(deltaTime);

                if (Defaults.SimpleLyricsMode) {
                  letter.HTMLElement.style.animation = "none";
                  letter.HTMLElement.style.setProperty("--SLM_GradientPosition", "100%");
                } else {
                  letter.HTMLElement.style.setProperty("--gradient-position", `100%`);
                }
                letter.HTMLElement.style.transform = `translateY(calc(var(--DefaultLyricsSize) * ${currentYOffset * 2}))`;
                letter.HTMLElement.style.scale = `${currentScale}`;
                letter.HTMLElement.style.setProperty(
                  "--text-shadow-blur-radius",
                  `${4 + 12 * currentGlow}px`
                );
                letter.HTMLElement.style.setProperty(
                  "--text-shadow-opacity",
                  `${currentGlow * LetterGlowMultiplier_Opacity}%`
                );
              }
            }
          }
        }
      } else if (lineState === "NotSung") {
        line.HTMLElement.classList.add("NotSung");
        line.HTMLElement.classList.remove("Sung");
        if (line.HTMLElement.classList.contains("Active")) {
          line.HTMLElement.classList.remove("Active");
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
        line.HTMLElement.classList.add("Sung");
        line.HTMLElement.classList.remove("Active", "NotSung");

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

        const checkNextLine = () => {
          const words = line.Syllables?.Lead;
          if (!words) return;
          for (let i = 0; i < words.length; i++) {
            const word = words[i];
            if (word.AnimatorStore && !word.Dot) {
              word.AnimatorStore.Scale.SetGoal(ScaleSpline.at(1));
              word.AnimatorStore.YOffset.SetGoal(YOffsetSpline.at(1));
              word.AnimatorStore.Glow.SetGoal(GlowSpline.at(1));
              const currentScale = word.AnimatorStore.Scale.Step(deltaTime);
              const currentYOffset = word.AnimatorStore.YOffset.Step(deltaTime);
              const currentGlow = word.AnimatorStore.Glow.Step(deltaTime);
              //if (!Defaults.SimpleLyricsMode) {
              word.HTMLElement.style.transform = `translateY(calc(var(--DefaultLyricsSize) * ${currentYOffset}))`;
              word.HTMLElement.style.scale = `${currentScale}`;
              //}
              if (!word.LetterGroup) {
                if (Defaults.SimpleLyricsMode) {
                  word.HTMLElement.style.animation = "none";
                  word.HTMLElement.style.setProperty("--SLM_GradientPosition", "100%");
                } else {
                  word.HTMLElement.style.setProperty("--gradient-position", "100%");
                }
                word.HTMLElement.style.setProperty(
                  "--text-shadow-blur-radius",
                  `${4 + 2 * currentGlow * 1}px`
                );
                word.HTMLElement.style.setProperty(
                  "--text-shadow-opacity",
                  `${Math.min(currentGlow * 35, 100)}%`
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

              word.HTMLElement.style.transform = `translateY(calc(var(--DefaultLyricsSize) * ${currentYOffset ?? 0}))`;
              word.HTMLElement.style.scale = `${currentScale}`;
              word.HTMLElement.style.opacity = `${currentOpacity}`;
              word.HTMLElement.style.setProperty(
                "--text-shadow-blur-radius",
                `${4 + 6 * currentGlow}px`
              );
              word.HTMLElement.style.setProperty("--text-shadow-opacity", `${currentGlow * 90}%`);
            }
            if (word.LetterGroup && word.Letters) {
              for (let k = 0; k < word.Letters.length; k++) {
                const letter = word.Letters[k];

                if (!letter.AnimatorStore) {
                  letter.AnimatorStore = createLetterSprings();
                  letter.AnimatorStore.Scale.SetGoal(ScaleSpline.at(0), true);
                  letter.AnimatorStore.YOffset.SetGoal(LetterYOffsetSpline.at(0), true);
                  letter.AnimatorStore.Glow.SetGoal(GlowSpline.at(0), true);
                }

                letter.AnimatorStore.Scale.SetGoal(ScaleSpline.at(1));
                letter.AnimatorStore.YOffset.SetGoal(LetterYOffsetSpline.at(1));
                letter.AnimatorStore.Glow.SetGoal(GlowSpline.at(1));

                const currentScale = letter.AnimatorStore.Scale.Step(deltaTime);
                const currentYOffset = letter.AnimatorStore.YOffset.Step(deltaTime);
                const currentGlow = letter.AnimatorStore.Glow.Step(deltaTime);

                if (Defaults.SimpleLyricsMode) {
                  letter.HTMLElement.style.animation = "none";
                  letter.HTMLElement.style.setProperty("--SLM_GradientPosition", "100%");
                } else {
                  letter.HTMLElement.style.setProperty("--gradient-position", `100%`);
                }
                letter.HTMLElement.style.transform = `translateY(calc(var(--DefaultLyricsSize) * ${currentYOffset * 2}))`;
                letter.HTMLElement.style.scale = `${currentScale}`;
                letter.HTMLElement.style.setProperty(
                  "--text-shadow-blur-radius",
                  `${4 + 12 * currentGlow}px`
                );
                letter.HTMLElement.style.setProperty(
                  "--text-shadow-opacity",
                  `${currentGlow * LetterGlowMultiplier_Opacity}%`
                );
              }
            }
          }
        };

        {
          const NextLine = arr[index + 1];
          if (NextLine) {
            const nextLineStatus = getElementState(
              ProcessedPosition,
              NextLine.StartTime,
              NextLine.EndTime
            );
            if (nextLineStatus === "NotSung" || nextLineStatus === "Active") {
              checkNextLine();
            }
          } else if (!NextLine) {
            checkNextLine();
          }
        }
      }
    }
  } else if (CurrentLyricsType === "Line") {
    const arr = LyricsObject.Types.Line.Lines;

    for (let index = 0; index < arr.length; index++) {
      const line = arr[index];
      const lineState = getElementState(ProcessedPosition, line.StartTime, line.EndTime);

      if (lineState === "Active") {
        if (Blurring_LastLine !== index) {
          applyBlur(arr, index, isSpicySidebarMode ? SidebarBlurMultiplier : BlurMultiplier);
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

            dot.HTMLElement.style.transform = `translateY(calc(var(--DefaultLyricsSize) * ${currentYOffset ?? 0}))`; // Use --DefaultLyricsSize?
            dot.HTMLElement.style.scale = `${currentScale}`;
            dot.HTMLElement.style.opacity = `${currentOpacity}`;
            dot.HTMLElement.style.setProperty(
              "--text-shadow-blur-radius",
              `${4 + 6 * currentGlow}px`
            );
            dot.HTMLElement.style.setProperty("--text-shadow-opacity", `${currentGlow * 90}%`);
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
          if (!Defaults.SimpleLyricsMode) {
            line.HTMLElement.style.setProperty("--gradient-position", `${targetGradientPos}%`);
            line.HTMLElement.style.setProperty(
              "--text-shadow-blur-radius",
              `${4 + 8 * currentGlow}px`
            );
            line.HTMLElement.style.setProperty("--text-shadow-opacity", `${currentGlow * 50}%`);
          }
        }
        /* if (Credits?.classList.contains("Active")) {
          Credits.classList.remove("Active");
        } */
      } else if (lineState === "NotSung") {
        if (!line.HTMLElement.classList.contains("NotSung")) {
          line.HTMLElement.classList.add("NotSung");
        }
        line.HTMLElement.classList.remove("Sung");
        if (line.HTMLElement.classList.contains("Active")) {
          line.HTMLElement.classList.remove("Active");
        }
      } else if (lineState === "Sung") {
        if (!line.HTMLElement.classList.contains("Sung")) {
          line.HTMLElement.classList.add("Sung");
        }
        line.HTMLElement.classList.remove("Active", "NotSung");

        if (arr.length === index + 1) {
          /* if (Credits && !Credits.classList.contains("Active")) {
            Credits.classList.add("Active");
          } */
        }
      }
    }
  }
}
