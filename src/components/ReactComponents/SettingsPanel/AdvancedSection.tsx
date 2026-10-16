import { useStore } from "@nanostores/react";
import {
  RemoveCurrentLyrics_AllCaches,
  RemoveCurrentLyrics_StateCache,
  RemoveLyricsCache,
} from "../../../utils/LyricsCacheTools.ts";
import { $developerMode } from "../../../utils/stores.ts";
import { Toggle } from "./components.tsx";
import { AdvancedIcon } from "./icons.tsx";
import type { GroupDef, SectionDef } from "./model.ts";

// Built once: the Control components must keep their identity across renders.
const groups: GroupDef[] = [
  {
    title: "Lyrics Cache",
    settings: [
      {
        id: "clearCurrentSongCaches",
        label: "Clear This Song's Cache",
        description: "Remove everything cached for the song that's playing now.",
        keywords: "clear all caches current song",
        Control: () => (
          <button
            type="button"
            className="sl-sp-btn"
            onClick={() => RemoveCurrentLyrics_AllCaches(true)}
          >
            Clear
          </button>
        ),
      },
      {
        id: "clearStoredLyricsCache",
        label: "Clear Stored Lyrics",
        description: "Delete all saved lyrics. They are normally kept for up to 3 days.",
        keywords: "clear lyrics cache",
        Control: () => (
          <button type="button" className="sl-sp-btn" onClick={() => RemoveLyricsCache(true)}>
            Clear
          </button>
        ),
      },
      {
        id: "clearCurrentSongState",
        label: "Reset This Song's Lyrics",
        description: "Drop the playing song's lyrics from memory only, so they load again.",
        keywords: "clear current song internal state cache",
        Control: () => (
          <button
            type="button"
            className="sl-sp-btn"
            onClick={() => RemoveCurrentLyrics_StateCache(true)}
          >
            Reset
          </button>
        ),
      },
    ],
  },
  {
    title: "Developer",
    settings: [
      {
        id: "developerMode",
        label: "Developer Mode",
        description: "Extra logging and debug tools.",
        keywords: "debug logs",
        Control: ({ label }) => (
          <Toggle
            label={label}
            checked={useStore($developerMode)}
            onChange={(v) => $developerMode.set(v)}
          />
        ),
      },
    ],
  },
];

export const advancedSection: SectionDef = {
  id: "advanced",
  title: "Advanced",
  icon: AdvancedIcon,
  secondary: true,
  groups: () => groups,
};
