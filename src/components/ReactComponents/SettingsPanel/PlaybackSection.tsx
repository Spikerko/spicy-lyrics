import { useStore } from "@nanostores/react";
import {
  $playbackOffset,
  $scrollLeadEnabled,
  $scrollLeadMs,
  $seekFadeCompensation,
  $simpleLyricsMode,
  $smoothScrolling,
} from "../../../utils/stores.ts";
import { $experiment, getExperiment } from "../../../utils/experiments.ts";
import { Slider, Toggle } from "./components.tsx";
import { PlaybackIcon } from "./icons.tsx";
import type { GroupDef, SectionDef } from "./model.ts";

// Built once: the Control components must keep their identity across renders.
const groups: GroupDef[] = [
  {
    title: "Timing",
    settings: [
      {
        id: "playbackOffset",
        label: "Playback Offset",
        description: "Shift the lyrics in time. Negative shows them earlier, positive later.",
        keywords: "sync delay latency milliseconds",
        stacked: true,
        Control: ({ label }) => (
          <Slider
            label={label}
            value={useStore($playbackOffset)}
            min={-5000}
            max={5000}
            step={10}
            defaultValue={0}
            unit="ms"
            onChange={(v) => $playbackOffset.set(v)}
          />
        ),
      },
      {
        id: "seekFadeCompensation",
        label: "Seek Fade-in Compensation",
        description:
          "Clicking a line starts 300 ms before it, so Spotify's fade-in doesn't clip the first word. Best for rap and fast songs.",
        keywords: "click jump",
        Control: ({ label }) => (
          <Toggle
            label={label}
            checked={useStore($seekFadeCompensation)}
            onChange={(v) => $seekFadeCompensation.set(v)}
          />
        ),
      },
    ],
  },
  {
    title: "Scrolling",
    settings: [
      {
        id: "smoothScrolling",
        label: "Smooth Scrolling",
        description: "Glide from line to line instead of jumping.",
        // The refreshed Simple Lyrics look brings its own scroll, whatever this is set to.
        useDisabled: () => {
          const simple = useStore($simpleLyricsMode);
          const refreshed = useStore($experiment("refreshedSimpleLyrics"));
          return (
            simple &&
            refreshed &&
            `${getExperiment("refreshedSimpleLyrics").label} scrolls the lyrics its own way while Simple Lyrics Mode is on.`
          );
        },
        Control: ({ disabled, label }) => (
          <Toggle
            label={label}
            checked={useStore($smoothScrolling)}
            onChange={(v) => $smoothScrolling.set(v)}
            disabled={disabled}
          />
        ),
      },
      {
        id: "scrollLeadEnabled",
        label: "Early Scroll",
        description: "Start scrolling to the next line just before it's sung.",
        keywords: "lead ahead",
        Control: ({ label }) => (
          <Toggle
            label={label}
            checked={useStore($scrollLeadEnabled)}
            onChange={(v) => $scrollLeadEnabled.set(v)}
          />
        ),
      },
      {
        id: "scrollLeadMs",
        label: "Early Scroll Time",
        description: "How far ahead of the line the scroll starts.",
        keywords: "lead ahead",
        stacked: true,
        useDisabled: () => !useStore($scrollLeadEnabled) && "Turn on Early Scroll to change this.",
        Control: ({ disabled, label }) => (
          <Slider
            label={label}
            value={useStore($scrollLeadMs)}
            min={0}
            max={800}
            step={10}
            defaultValue={250}
            unit="ms"
            onChange={(v) => $scrollLeadMs.set(v)}
            disabled={disabled}
          />
        ),
      },
    ],
  },
];

export const playbackSection: SectionDef = {
  id: "playback",
  title: "Playback",
  icon: PlaybackIcon,
  groups: () => groups,
};
