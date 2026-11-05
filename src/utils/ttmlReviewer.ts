import { atom } from "nanostores";
import { type ExperimentId, EXPERIMENTS } from "./experiments.ts";
import { PersistedSettings } from "./stores.ts";

/**
 * TTML Reviewer mode: saves the user's settings and strips the lyrics back to
 * basics, so a sync is judged on the file and not on someone's setup. Turning it
 * off puts every value back as it was.
 *
 * The backup lives under a key of its own, and having one is what "on" means. An
 * older copy of the extension rewrites the whole settings blob from the snapshot it
 * loaded, which would drop anything kept inside it.
 */
const BACKUP_KEY = "SL:ttmlReviewer";

/** What the mode sets. Each `key` is both the persisted key and its settings row's id. */
export const REVIEWER_SETTINGS: readonly { key: string; value: unknown; shown: string }[] = [
  // Timing: anything that moves when a line appears, or where a click lands.
  { key: "playbackOffset", value: 0, shown: "0 ms" },
  { key: "seekFadeCompensation", value: false, shown: "Off" },
  { key: "scrollLeadEnabled", value: false, shown: "Off" },
  { key: "smoothScrolling", value: false, shown: "Off" },
  { key: "animationFpsCapEnabled", value: false, shown: "Off" },
  // Lyrics: anything that hides lines or changes how they're split or animated.
  { key: "simpleLyricsMode", value: false, shown: "Off" },
  { key: "minimalLyricsMode", value: false, shown: "Off" },
  { key: "joinSplitWords", value: false, shown: "Off" },
  { key: "lineHoverBackground", value: true, shown: "On" },
  { key: "duetLinePadding", value: true, shown: "On" },
  { key: "creditsFollowLastLine", value: false, shown: "Off" },
  { key: "skipSpicyFont", value: false, shown: "Off" },
  // Background: still, so nothing competes with the lyrics for attention or frames.
  { key: "backgroundStyle", value: "color", shown: "Cover Colors" },
  { key: "backgroundBlur", value: 0, shown: "0 px" },
  { key: "showNpvDynamicBg", value: false, shown: "Off" },
];

/** Switched off outright. Every other experiment follows its default. */
export const REVIEWER_EXPERIMENTS_OFF: readonly ExperimentId[] = [
  "canvasImmersive",
  "npvCanvasBackground",
  "nextUpCard",
];

export const REVIEWER_LOCK_REASON = "Locked while TTML Reviewer is on.";

const experimentKey = (id: ExperimentId) => `experiment:${id}`;
const offExperiments = new Set<string>(REVIEWER_EXPERIMENTS_OFF.map(experimentKey));

// `undefined` for an experiment means "no choice made", so its default (local or
// remote) keeps applying.
const profile = new Map<string, unknown>([
  ...REVIEWER_SETTINGS.map(({ key, value }) => [key, value] as [string, unknown]),
  ...EXPERIMENTS.map(({ id }): [string, unknown] => [
    experimentKey(id),
    offExperiments.has(experimentKey(id)) ? false : undefined,
  ]),
]);

function readBackup(): Record<string, unknown> | null {
  const raw = Spicetify.LocalStorage.get(BACKUP_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function applyProfile() {
  for (const [key, value] of profile) PersistedSettings.get(key)?.set(value);
}

export const $ttmlReviewer = atom<boolean>(readBackup() !== null);

/** Whether the mode holds this settings row (by id) still. */
export function isHeldByReviewer(id: string): boolean {
  return profile.has(id);
}

export function setTtmlReviewer(on: boolean) {
  const backup = readBackup();
  if (on) {
    // Already on: a new backup would save the stripped values over the real ones.
    if (backup) return;
    // Only what's actually stored: anything never set has to stay that way, or the
    // user is pinned to today's default (for experiments, cut off from remote ones).
    const saved: Record<string, unknown> = {};
    for (const key of profile.keys()) {
      const entry = PersistedSettings.get(key);
      if (entry?.isStored()) saved[key] = entry.get();
    }
    // Saved before anything changes, so a crash partway can't lose the real values.
    Spicetify.LocalStorage.set(BACKUP_KEY, JSON.stringify(saved));
    applyProfile();
  } else if (backup) {
    for (const key of profile.keys()) {
      const entry = PersistedSettings.get(key);
      if (Object.hasOwn(backup, key)) entry?.set(backup[key]);
      else entry?.unset();
    }
    // Removed last: a crash partway leaves the mode on, with the backup still there.
    Spicetify.LocalStorage.remove(BACKUP_KEY);
  }
  $ttmlReviewer.set(on);
}

/**
 * Other extensions restyling or rewriting the lyrics right now. They aren't ours to
 * turn off, so the tab names them. Their globals could change: read them defensively.
 */
export function getOtherLyricsExtensions(): string[] {
  const active: string[] = [];
  try {
    if ((window as any).SpicyThemes?.getState?.()?.isEnabled === true) active.push("Spicy Themes");
  } catch {
    // Not a reason to break the tab.
  }
  if (
    (window as any).SpicyLyricTranslater &&
    Spicetify.LocalStorage.get("spicy-lyric-translator:translation-enabled") === "true"
  ) {
    active.push("Spicy Lyric Translator");
  }
  return active;
}

// An older copy can rewrite the blob while the mode is on, and an update can add to
// the profile, so a session that starts in the mode lays it over again.
if ($ttmlReviewer.get()) applyProfile();
