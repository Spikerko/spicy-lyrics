import { useStore } from "@nanostores/react";
import {
  $disableNpvLyrics,
  $hideNpvLyricsWhenUnavailable,
  $lockedMediaBox,
  $popupLyricsAllowed,
  $removeSpotifyLyricsButton,
  $showNoLyricsNotice,
  $showVolumeSlider,
  $timelineOutsideMediaContent,
  $viewControlsPosition,
} from "../../../utils/stores.ts";
import { $isGlobalNav } from "../../../utils/uiState.ts";
import { Select, Toggle } from "./components.tsx";
import { InterfaceIcon } from "./icons.tsx";
import type { GroupDef, SectionDef } from "./model.ts";

// Built once: the Control components must keep their identity across renders.
const groups: GroupDef[] = [
  {
    title: "Lyrics View",
    settings: [
      {
        id: "viewControlsPosition",
        label: "View Controls Position",
        description: "Where the view controls (play, scroll and so on) sit.",
        keywords: "lyrics controls top bottom",
        useDisabled: () =>
          !useStore($isGlobalNav) && "Only available with Spotify's new navigation layout.",
        Control: ({ disabled, label }) => (
          <Select
            label={label}
            value={useStore($viewControlsPosition)}
            options={["Top", "Bottom"]}
            onChange={(v) => $viewControlsPosition.set(v)}
            disabled={disabled}
          />
        ),
      },
      {
        id: "timelineOutsideMediaContent",
        label: "Timeline Outside Media Box",
        description:
          "Show the playback timeline in the NowBar header instead of inside the media box. Compact Mode and PiP keep it inside.",
        keywords: "progress bar seek",
        Control: ({ label }) => (
          <Toggle
            label={label}
            checked={useStore($timelineOutsideMediaContent)}
            onChange={(v) => $timelineOutsideMediaContent.set(v)}
          />
        ),
      },
      {
        id: "lockedMediaBox",
        label: "Lock Media Box in Compact Mode",
        description: "Keep the media box from resizing while Forced Compact Mode is on.",
        keywords: "size artwork",
        Control: ({ label }) => (
          <Toggle
            label={label}
            checked={useStore($lockedMediaBox)}
            onChange={(v) => $lockedMediaBox.set(v)}
          />
        ),
      },
      {
        id: "showNoLyricsNotice",
        label: "No Lyrics Notice",
        description:
          "Explain why a song has no lyrics. Off hides it in the lyrics page, Fullscreen and Popup Lyrics, leaving just the song info. Errors still show their notice.",
        keywords: "unavailable missing message hide popup pip page",
        Control: ({ label }) => (
          <Toggle
            label={label}
            checked={useStore($showNoLyricsNotice)}
            onChange={(v) => $showNoLyricsNotice.set(v)}
          />
        ),
      },
      {
        id: "showVolumeSlider",
        label: "Volume Slider",
        description:
          "Show a volume control on the artwork in Fullscreen, Cinema View and Popup Lyrics.",
        Control: ({ label }) => (
          <Toggle
            label={label}
            checked={useStore($showVolumeSlider)}
            onChange={(v) => $showVolumeSlider.set(v)}
          />
        ),
      },
    ],
  },
  {
    title: "Now Playing Sidebar",
    settings: [
      {
        id: "npvLyrics",
        label: "Lyrics Card",
        description: "Show lyrics in the Now Playing sidebar.",
        keywords: "disable npv lyrics now playing view",
        Control: ({ label }) => (
          <Toggle
            label={label}
            checked={!useStore($disableNpvLyrics)}
            onChange={(v) => $disableNpvLyrics.set(!v)}
          />
        ),
      },
      {
        id: "hideNpvLyricsWhenUnavailable",
        label: "Hide When a Song Has No Lyrics",
        description:
          "Remove the card instead of showing a notice. It comes back on the next song with lyrics.",
        keywords: "npv lyrics unavailable",
        useDisabled: () => useStore($disableNpvLyrics) && "Turn on Lyrics Card to change this.",
        Control: ({ disabled, label }) => (
          <Toggle
            label={label}
            checked={useStore($hideNpvLyricsWhenUnavailable)}
            onChange={(v) => $hideNpvLyricsWhenUnavailable.set(v)}
            disabled={disabled}
          />
        ),
      },
    ],
  },
  {
    title: "Windows and Buttons",
    settings: [
      {
        id: "popupLyricsAllowed",
        label: "Popup Lyrics",
        description: "Let lyrics open in a floating window.",
        keywords: "disable popup lyrics window pip picture in picture",
        Control: ({ label }) => (
          <Toggle
            label={label}
            checked={useStore($popupLyricsAllowed)}
            onChange={(v) => $popupLyricsAllowed.set(v)}
          />
        ),
      },
      {
        id: "removeSpotifyLyricsButton",
        label: "Hide Spotify's Lyrics Button",
        description:
          "Remove Spotify's own lyrics button from the playback bar. The Spicy Lyrics button stays.",
        keywords: "remove playbar",
        Control: ({ label }) => (
          <Toggle
            label={label}
            checked={useStore($removeSpotifyLyricsButton)}
            onChange={(v) => $removeSpotifyLyricsButton.set(v)}
          />
        ),
      },
    ],
  },
];

export const interfaceSection: SectionDef = {
  id: "interface",
  title: "Interface",
  icon: InterfaceIcon,
  groups: () => groups,
};
