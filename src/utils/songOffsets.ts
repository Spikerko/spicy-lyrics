import { atom } from "nanostores";
import { $playbackOffset } from "./stores.ts";
import { $ttmlReviewer } from "./ttmlReviewer.ts";

/** Kept apart from `SL:settings`, which is rewritten whole on every change, as this map grows per song. */
const SONG_OFFSETS_KEY = "SL:songOffsets";
export const OFFSET_LIMIT_MS = 5000;

function readSongOffsets(): Record<string, number> {
  const raw = Spicetify.LocalStorage.get(SONG_OFFSETS_KEY);
  if (raw === null || raw === undefined) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    // A bad entry would turn the lyrics clock into NaN for that song.
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([, v]) => typeof v === "number" && Number.isFinite(v) && v !== 0
      )
    ) as Record<string, number>;
  } catch {
    return {};
  }
}

/** Offsets in ms keyed by track URI. Only songs with a non-zero offset are stored. */
export const $songOffsets = atom<Record<string, number>>(readSongOffsets());

$songOffsets.listen((offsets) => {
  Spicetify.LocalStorage.set(SONG_OFFSETS_KEY, JSON.stringify(offsets));
});

export function getSongOffset(uri: string | null | undefined): number {
  return (uri && $songOffsets.get()[uri]) || 0;
}

export function setSongOffset(uri: string, offsetMs: number) {
  const clamped = Math.round(
    Math.min(OFFSET_LIMIT_MS, Math.max(-OFFSET_LIMIT_MS, offsetMs))
  );
  const next = { ...$songOffsets.get() };
  if (clamped === 0) delete next[uri];
  else next[uri] = clamped;
  $songOffsets.set(next);
}

/** The Playback Offset plus the song's own, in ms. Positive values hold the lyrics back. */
export function lyricsOffsetMs(uri: string | null | undefined): number {
  // TTML Reviewer judges the file alone, so a song's own offset sits out while it's on.
  // The saved offsets aren't touched and apply again once it's off.
  return $playbackOffset.get() + ($ttmlReviewer.get() ? 0 : getSongOffset(uri));
}

/** Which offset the Playback Offset row edits. Not persisted. */
export const $offsetScope = atom<"all" | "song">("all");
