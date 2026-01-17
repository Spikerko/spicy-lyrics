import { Maid } from "@socali/modules/Maid";
import { OnPreRender } from "@socali/modules/Scheduler";
import Defaults from "../../components/Global/Defaults.ts";
import Global from "../../components/Global/Global.ts";
import { SpotifyPlayer } from "../../components/Global/SpotifyPlayer.ts";
import storage from "../storage.ts";
import { Lyrics } from "./Animator/Main.ts";
import { PageContainer } from "../../components/Pages/PageView.ts";

export const ScrollingIntervalTime = Infinity;

export const lyricsBetweenShow = storage.get("minimalLyricsMode") === "true" ? 5 : 3;

export const endInterludeEarlierBy = 0;

export const SimpleLyricsMode_LetterEffectsStrengthConfig = {
  LongerThan: 1500,
  Longer: {
    Glow: 0.4,
    YOffset: 0.45,
    Scale: 1.103,
  },
  Shorter: {
    Glow: 0.285,
    YOffset: 0.1,
    Scale: 1.09,
  },
};

// Define types for lyrics objects
// Define the AnimatorStore interface for syllables
export interface SyllableAnimatorStore {
  Scale: any;
  YOffset: any;
  Glow: any;
  Opacity?: any;
  [key: string]: any;
}

// Define the AnimatorStore interface for letters
export interface LetterAnimatorStore {
  Scale: any;
  YOffset: any;
  Glow: any;
  [key: string]: any;
}

// Define the AnimatorStore interface for lines
export interface LineAnimatorStore {
  Glow: any;
  [key: string]: any;
}

// Define the Lead item interface for syllables
export interface SyllableLead {
  HTMLElement: HTMLElement;
  StartTime: number;
  EndTime: number;
  TotalTime: number;
  LetterGroup?: boolean;
  Letters?: Array<{
    HTMLElement: HTMLElement;
    StartTime: number;
    EndTime: number;
    AnimatorStore?: LetterAnimatorStore;
    SLMAnimated?: boolean;
    PreSLMAnimated?: boolean;
  }>;
  BGWord?: boolean;
  Dot?: boolean;
  AnimatorStore?: SyllableAnimatorStore;
  SLMAnimated?: boolean;
  PreSLMAnimated?: boolean;
}

export interface LyricsSyllable {
  HTMLElement: HTMLElement;
  StartTime: number;
  EndTime: number;
  TotalTime?: number;
  Status?: string;
  Syllables?: {
    Lead: SyllableLead[];
  };
  DotLine?: boolean;
  BGLine?: boolean;
  AnimatorStore?: LineAnimatorStore;
  SLMAnimated?: boolean;
  PreSLMAnimated?: boolean;
}

export interface LyricsLine {
  HTMLElement: HTMLElement;
  StartTime: number;
  EndTime: number;
  TotalTime?: number;
  Status?: string;
  DotLine?: boolean;
  Syllables?: {
    Lead: SyllableLead[];
  };
  AnimatorStore?: LineAnimatorStore;
}

export interface LyricsStatic {
  HTMLElement: HTMLElement;
}

export type LyricsType = "Syllable" | "Line" | "Static";

export const LyricsObject = {
  Types: {
    Syllable: {
      Lines: [] as LyricsSyllable[],
    },
    Line: {
      Lines: [] as LyricsLine[],
    },
    Static: {
      Lines: [] as LyricsStatic[],
    },
  },
};

export let CurrentLineLyricsObject = LyricsObject.Types.Syllable.Lines.length - 1;
export let LINE_SYNCED_CurrentLineLyricsObject = LyricsObject.Types.Line.Lines.length - 1;

export function SetWordArrayInAllLines() {
  LyricsObject.Types.Syllable.Lines.forEach((_, i) => {
    LyricsObject.Types.Syllable.Lines[i].Syllables = {
      Lead: [],
    };
  });
}

export function SetWordArrayInCurentLine() {
  CurrentLineLyricsObject = LyricsObject.Types.Syllable.Lines.length - 1;

  if (CurrentLineLyricsObject >= 0) {
    LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject].Syllables = {
      Lead: [],
    };
  }
}

export function SetWordArrayInCurentLine_LINE_SYNCED() {
  LINE_SYNCED_CurrentLineLyricsObject = LyricsObject.Types.Line.Lines.length - 1;

  if (LINE_SYNCED_CurrentLineLyricsObject >= 0) {
    LyricsObject.Types.Line.Lines[LINE_SYNCED_CurrentLineLyricsObject].Syllables = {
      Lead: [],
    };
  }
}

export function ClearLyricsContentArrays() {
  LyricsObject.Types.Syllable.Lines = [];
  LyricsObject.Types.Line.Lines = [];
  LyricsObject.Types.Static.Lines = [];
}

// const THROTTLE_TIME = 0;

// Using underscore prefix to indicate it's intentionally unused but kept for future use
// eslint-disable-next-line @typescript-eslint/no-unused-vars
/* const _LyricsInterval = new IntervalManager(THROTTLE_TIME, () => {
  if (!Defaults.LyricsContainerExists) return;
  const progress = SpotifyPlayer.GetPosition();
  Lyrics.TimeSetter(progress);
  Lyrics.Animate(progress);
}).Start(); */
/* 
let lastLyric = "";

const logLyric = (lyric: string) => {
  if (lyric !== lastLyric) {
    console.log(lyric)
  }
  lastLyric = lyric;
}
 */
const LyricsInterval = () => {
/* 
  { // Logging Line part
    const currentLyrics = storage.get("currentLyricsData") as string;
    if (currentLyrics != null && currentLyrics != "" && !currentLyrics?.includes("NO_LYRICS")) {
      const parsedLyricsData = JSON.parse(currentLyrics);
      const staticLyricsData = convertToStaticLyrics(parsedLyricsData);

      if (parsedLyricsData.Type !== "Static") {
        // Find the currently active line based on progress (ms) and Content's StartTime/EndTime (s)
        const currentTimeSec = progress / 1000;
        let activeLineIndex = -1;
        if (parsedLyricsData.Type === "Syllable") {
          // For Syllable type, StartTime and EndTime are in line.Lead
          activeLineIndex = parsedLyricsData.Content.findIndex(
            (line: { Lead?: { StartTime: number; EndTime: number } }) =>
              line.Lead &&
              currentTimeSec >= line.Lead.StartTime &&
              currentTimeSec <= line.Lead.EndTime
          );
        } else if (parsedLyricsData.Type === "Line") {
          // For Line type, StartTime and EndTime are directly on the line
          activeLineIndex = parsedLyricsData.Content.findIndex(
            (line: { StartTime: number; EndTime: number }) =>
              currentTimeSec >= line.StartTime && currentTimeSec <= line.EndTime
          );
        }
        /* console.log("active line index", activeLineIndex);
        console.log("currentTimeSec", currentTimeSec);
        console.log("static lyrics data", staticLyricsData);
        console.log("source lyrics data", parsedLyricsData); *
        if (
          activeLineIndex !== -1 &&
          activeLineIndex < staticLyricsData.Lines.length
        ) {
          const activeLine = staticLyricsData.Lines[activeLineIndex];
          logLyric(activeLine.Text);
        }
      }
    }
  } */

  if (Defaults.LyricsContainerExists) {
    const progress = SpotifyPlayer.GetPosition();
    Lyrics.TimeSetter(progress);
    Lyrics.Animate(progress);
  }
  OnPreRender(LyricsInterval);
};

LyricsInterval();

// Define proper types for event listener variables
let LinesEvListenerMaid: Maid | null = null;
let LinesEvListenerExists: boolean = false;

// Define proper type for event parameter
function LinesEvListener(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (target.classList.contains("line")) {
    let startTime: number | undefined;

    LyricsObject.Types.Line.Lines.forEach((line) => {
      if (line.HTMLElement === target) {
        startTime = line.StartTime;
        if (line.Syllables?.Lead && line.Syllables.Lead.length > 0) {
          startTime = line.Syllables.Lead[0].StartTime;
        }
      }
    });

    if (startTime !== undefined) {
      SpotifyPlayer.Seek(startTime);
      Global.Event.evoke("song:seek", startTime);
    }
  } else if (target.classList.contains("word")) {
    let startTime: number | undefined;

    LyricsObject.Types.Syllable.Lines.forEach((line) => {
      if (line.Syllables?.Lead) {
        line.Syllables.Lead.forEach((word, _, array) => {
          if (word.HTMLElement === target) {
            startTime = line.StartTime;
            if (array.length > 0) {
              startTime = array[0].StartTime;
            }
          }
        });
      }
    });

    if (startTime !== undefined) {
      SpotifyPlayer.Seek(startTime);
      Global.Event.evoke("song:seek", startTime);
    }
  } else if (target.classList.contains("Emphasis")) {
    let startTime: number | undefined;

    LyricsObject.Types.Syllable.Lines.forEach((line) => {
      if (line.Syllables?.Lead) {
        line.Syllables.Lead.forEach((word, _, array) => {
          if (word?.Letters) {
            word.Letters.forEach((letter) => {
              if (letter.HTMLElement === target) {
                startTime = line.StartTime;
                if (array.length > 0) {
                  startTime = array[0].StartTime;
                }
              }
            });
          }
        });
      }
    });

    if (startTime !== undefined) {
      SpotifyPlayer.Seek(startTime);
      Global.Event.evoke("song:seek", startTime);
    }
  }
}

export function addLinesEvListener() {
  if (LinesEvListenerExists) return;
  LinesEvListenerExists = true;

  LinesEvListenerMaid = new Maid();

  const el = PageContainer?.querySelector<HTMLElement>(
    ".LyricsContainer .LyricsContent"
  );
  if (!el) return;

  // Add event listener and store a reference to the handler function
  el.addEventListener("click", LinesEvListener);

  // Store a cleanup function in the Maid instead of the event listener result
  LinesEvListenerMaid.Give(() => {
    el.removeEventListener("click", LinesEvListener);
  });
}

export function removeLinesEvListener() {
  if (!LinesEvListenerExists) return;
  LinesEvListenerExists = false;

  const el = PageContainer?.querySelector<HTMLElement>(
    ".LyricsContainer .LyricsContent"
  );
  if (!el) return;

  el.removeEventListener("click", LinesEvListener);

  if (LinesEvListenerMaid) {
    LinesEvListenerMaid.Destroy();
    LinesEvListenerMaid = null;
  }
}

export let isRomanized = storage.get("romanization") === "true";

export const setRomanizedStatus = (val: boolean) => {
  isRomanized = val;
  storage.set("romanization", val.toString());
};

export const SimpleLyricsMode_InterludeAddonTime = 2000;
