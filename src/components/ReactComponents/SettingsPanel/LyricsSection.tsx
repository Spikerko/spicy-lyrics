import { useStore } from "@nanostores/react";
import {
  $creditsFollowLastLine,
  $duetLinePadding,
  $lineHoverBackground,
  $lyricsSize,
  $minimalLyricsMode,
  $pinnedCredits,
  $rendererVisualStyle,
  $romanizationDisplay,
  $romanizationHighlight,
  $syllableMerge,
  $syllablePace,
  $translationDisplay,
  RENDERER_VISUAL_STYLES,
  RENDERER_VISUAL_STYLE_LABELS,
  type PinnedCredits,
  type RendererVisualStyle,
  type RomanizationDisplay,
  type RomanizationHighlight,
  type SyllableMerge,
  type TranslationDisplay,
} from "../../../utils/stores.ts";
import { $experiment } from "../../../utils/experiments.ts";
import { Select, Slider, Toggle } from "./components.tsx";
import { LyricsIcon } from "./icons.tsx";
import type { GroupDef, SectionDef } from "./model.ts";

// Built once: the Control components must keep their identity across renders.
const groups: GroupDef[] = [
  {
    title: "Text",
    settings: [
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
    ],
  },
  {
    title: "Style",
    settings: [
      {
        id: "rendererVisualStyle",
        label: "Renderer Visual Style",
        description:
          "Visual design of rendered lyrics. \"Spring\" is the default Spicy Lyrics renderer you know.",
        keywords: "simple lyrics mode refreshed renderer animation effects plain spring bloom",
        Control: ({ label }) => (
          <Select
            label={label}
            value={useStore($rendererVisualStyle)}
            options={[...RENDERER_VISUAL_STYLES]}
            labels={RENDERER_VISUAL_STYLES.map((style) => RENDERER_VISUAL_STYLE_LABELS[style])}
            onChange={(v) => $rendererVisualStyle.set(v as RendererVisualStyle)}
          />
        ),
      },
      {
        id: "minimalLyricsMode",
        label: "Fade Away Previous Lines",
        description: "Hide lines that have already been sung in Fullscreen and Cinema View.",
        keywords: "minimal lyrics mode hide sung",
        Control: ({ label }) => (
          <Toggle
            label={label}
            checked={useStore($minimalLyricsMode)}
            onChange={(v) => $minimalLyricsMode.set(v)}
          />
        ),
      },
      {
        id: "syllableMerge",
        label: "Join Split Words",
        description:
          "Show a word sung in syllables as one word. Steadily Sung keeps only words with no gap and an even pace between parts; Held Words only those long enough to light up letter by letter.",
        keywords: "syllables merge held steady",
        Control: ({ label }) => (
          <Select
            label={label}
            value={useStore($syllableMerge)}
            options={["off", "full", "steady", "held"]}
            labels={["Off", "All Words", "Steadily Sung", "Held Words"]}
            onChange={(v) => $syllableMerge.set(v as SyllableMerge)}
          />
        ),
      },
      {
        id: "syllablePace",
        label: "Keep Syllable Pace",
        description:
          "A joined word that lights up letter by letter follows each syllable's timing, slow on a long syllable and quick on a short one.",
        keywords: "syllables merge held letters timing",
        useDisabled: () => useStore($syllableMerge) === "off" && "Pick a Join Split Words mode to change this.",
        Control: ({ disabled, label }) => (
          <Toggle
            label={label}
            checked={useStore($syllablePace)}
            onChange={(v) => $syllablePace.set(v)}
            disabled={disabled}
          />
        ),
      },
    ],
  },
  {
    title: "Lines",
    settings: [
      {
        id: "romanizationDisplay",
        label: "Romanization",
        description:
          "With romanization on, show it in place of the original lyrics, or as a smaller row under each line.",
        keywords: "romaji romanized romanize pronunciation under below replace",
        Control: ({ label }) => (
          <Select
            label={label}
            value={useStore($romanizationDisplay)}
            options={["replace", "underLine"]}
            labels={["Replace the line", "Under each line"]}
            onChange={(v) => $romanizationDisplay.set(v as RomanizationDisplay)}
          />
        ),
      },
      {
        id: "romanizationHighlight",
        label: "Romanization Highlight",
        description:
          "How the romanization row under a word-synced line lights up: a gradient sweeping along each syllable, or each syllable lighting up whole while it's sung.",
        keywords: "romaji romanized row sweep glow highlight word syllable",
        useDisabled: () => {
          const underLine = useStore($romanizationDisplay) === "underLine";
          const animated = useStore($experiment("animatedUnderRows"));
          if (!underLine) return "Show romanization under each line to change this.";
          return animated && "The Animated Romanization and Translation experiment lights the row instead.";
        },
        Control: ({ disabled, label }) => (
          <Select
            label={label}
            value={useStore($romanizationHighlight)}
            options={["sweep", "word"]}
            labels={["Sweep", "Word by word"]}
            onChange={(v) => $romanizationHighlight.set(v as RomanizationHighlight)}
            disabled={disabled}
          />
        ),
      },
      {
        id: "translationDisplay",
        label: "Translation",
        description:
          "For lyrics that come with a translation, show it as a smaller row under each line, or in place of the line. Turn it on with the translation button above the lyrics.",
        keywords: "translate translated translation under below replace language",
        Control: ({ label }) => (
          <Select
            label={label}
            value={useStore($translationDisplay)}
            options={["underLine", "replace"]}
            labels={["Under each line", "Replace the line"]}
            onChange={(v) => $translationDisplay.set(v as TranslationDisplay)}
          />
        ),
      },
      {
        id: "lineHoverBackground",
        label: "Highlight on Hover",
        description: "Show a soft box behind a line when you point at it.",
        keywords: "line hover background",
        Control: ({ label }) => (
          <Toggle
            label={label}
            checked={useStore($lineHoverBackground)}
            onChange={(v) => $lineHoverBackground.set(v)}
          />
        ),
      },
      {
        id: "duetLinePadding",
        label: "Duet Line Padding",
        description: "Indent each singer's lines toward their side, so duets read as two columns.",
        keywords: "indent voices",
        Control: ({ label }) => (
          <Toggle
            label={label}
            checked={useStore($duetLinePadding)}
            onChange={(v) => $duetLinePadding.set(v)}
          />
        ),
      },
      {
        id: "creditsFollowLastLine",
        label: "Credits Follow the Last Singer",
        description:
          "When a song ends on a duet line on the right, show the songwriter and provider lines on the right too.",
        keywords: "duet credits written by songwriters provided by provider align side",
        Control: ({ label }) => (
          <Toggle
            label={label}
            checked={useStore($creditsFollowLastLine)}
            onChange={(v) => $creditsFollowLastLine.set(v)}
          />
        ),
      },
      {
        id: "pinnedCredits",
        label: "Pinned Credits",
        description:
          "Keep the credits at the bottom of the lyrics while they scroll. No Writers pins the lyrics source and community line, Full pins the songwriters too.",
        keywords: "credits footer pin sticky written by songwriters provided by source community bottom",
        Control: ({ label }) => (
          <Select
            label={label}
            value={useStore($pinnedCredits)}
            options={["off", "noWriters", "full"]}
            labels={["Off", "No Writers", "Full"]}
            onChange={(v) => $pinnedCredits.set(v as PinnedCredits)}
          />
        ),
      },
    ],
  },
];

export const lyricsSection: SectionDef = {
  id: "lyrics",
  title: "Lyrics",
  icon: LyricsIcon,
  groups: () => groups,
};
