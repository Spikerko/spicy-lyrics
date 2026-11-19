import { useStore } from "@nanostores/react";
import {
  $animationFpsCap,
  $animationFpsCapEnabled,
  $lyricsSize,
  $lyricsWeight,
} from "../../../utils/stores.ts";
import { FontPicker } from "./FontPicker.tsx";
import { Slider, Toggle } from "./components.tsx";
import { AppearanceIcon } from "./icons.tsx";
import type { GroupDef, SectionDef } from "./model.ts";

// Built once: the Control components must keep their identity across renders.
const groups: GroupDef[] = [
  {
    title: "Text",
    settings: [
      {
        id: "customFont",
        label: "Lyrics Font",
        description:
          "The Spicy Lyrics font, your system's, an installed font, or a font file (.ttf, .otf, .woff, .woff2). Listing installed fonts asks Spotify for permission.",
        keywords: "font typeface system default custom file upload ttf otf woff",
        Control: FontPicker,
      },
      {
        id: "lyricsSize",
        label: "Lyrics Size",
        description:
          "Makes the lyrics bigger or smaller in every view, including romanization and background vocals. 100% is each view's usual size.",
        keywords: "font text scale bigger smaller zoom",
        stacked: true,
        Control: ({ label }) => (
          <Slider
            label={label}
            value={useStore($lyricsSize)}
            min={60}
            max={200}
            step={5}
            defaultValue={100}
            unit="%"
            onChange={(v) => $lyricsSize.set(v)}
          />
        ),
      },
      {
        id: "lyricsWeight",
        label: "Lyrics Weight",
        description:
          "How bold the lyrics are, from thin (100) to black (900). 700 is the usual look. A font without that weight uses its nearest one.",
        keywords: "font bold boldness thickness thin heavy",
        stacked: true,
        Control: ({ label }) => (
          <Slider
            label={label}
            value={useStore($lyricsWeight)}
            min={100}
            max={900}
            step={100}
            defaultValue={700}
            onChange={(v) => $lyricsWeight.set(v)}
          />
        ),
      },
    ],
  },
  {
    title: "Performance",
    settings: [
      {
        id: "animationFpsCapEnabled",
        label: "Limit Frame Rate",
        description:
          "Redraw the lyrics, background and scroll less often to save CPU, especially on high refresh rate displays.",
        keywords: "fps cap animation",
        Control: ({ label }) => (
          <Toggle
            label={label}
            checked={useStore($animationFpsCapEnabled)}
            onChange={(v) => $animationFpsCapEnabled.set(v)}
          />
        ),
        useShowChildren: () => useStore($animationFpsCapEnabled),
        children: [
          {
            id: "animationFpsCap",
            label: "Frame Rate",
            description: "Frames per second while the limit is on.",
            keywords: "fps cap animation",
            stacked: true,
            useDisabled: () =>
              !useStore($animationFpsCapEnabled) && "Turn on Limit Frame Rate to change this.",
            Control: ({ disabled, label }) => (
              <Slider
                label={label}
                value={useStore($animationFpsCap)}
                min={15}
                max={240}
                step={5}
                defaultValue={60}
                unit="FPS"
                onChange={(v) => $animationFpsCap.set(v)}
                disabled={disabled}
              />
            ),
          },
        ],
      },
    ],
  },
];

export const appearanceSection: SectionDef = {
  id: "appearance",
  title: "Appearance",
  icon: AppearanceIcon,
  groups: () => groups,
};
