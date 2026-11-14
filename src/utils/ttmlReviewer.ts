import { atom } from "nanostores";
import { toast } from "sonner";
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
const BACKUP_FORMAT_KEY = "$format";
const BACKUP_FORMAT = 2;

/** What the mode sets. Each `key` is both the persisted key and its settings row's id. */
export const REVIEWER_SETTINGS: readonly { key: string; value: unknown; shown: string }[] = [
  // Timing: anything that moves when a line appears, or where a click lands.
  { key: "playbackOffset", value: 0, shown: "0 ms" },
  { key: "seekFadeCompensation", value: false, shown: "Off" },
  { key: "scrollLeadEnabled", value: false, shown: "Off" },
  { key: "smoothScrolling", value: false, shown: "Off" },
  { key: "animationFpsCapEnabled", value: false, shown: "Off" },
  // Lyrics: anything that hides lines or changes how they're split or animated.
  { key: "rendererVisualStyle", value: "spring", shown: "Spring" },
  { key: "minimalLyricsMode", value: false, shown: "Off" },
  { key: "syllableMerge", value: "off", shown: "Off" },
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

function writeBackup(value: string): boolean {
  try {
    Spicetify.LocalStorage.set(BACKUP_KEY, value);
    return Spicetify.LocalStorage.get(BACKUP_KEY) === value;
  } catch {
    return false;
  }
}

function applyProfile() {
  for (const [key, value] of profile) PersistedSettings.get(key)?.set(value);
}

/** What to put back for a key. `null` means it was never set, and restoring unsets it. */
function backupValue(key: string): unknown {
  const entry = PersistedSettings.get(key);
  return entry?.isStored() ? entry.get() : null;
}

/**
 * A session starting in the mode lays the profile over again: an older copy can rewrite
 * the blob meanwhile. An update can also have added keys, whose real values are saved
 * first. If that can't be saved, those keys are left alone rather than lost.
 */
function resumeProfile() {
  const backup = readBackup();
  if (!backup) return;
  // A backup with no format predates `null` entries: what it leaves out was never set, and
  // the blob now holds the profile's value for it, not a real one.
  const unversioned = !Object.hasOwn(backup, BACKUP_FORMAT_KEY);
  const added = [...profile.keys()].filter((key) => !Object.hasOwn(backup, key));
  for (const key of added) backup[key] = unversioned ? null : backupValue(key);
  backup[BACKUP_FORMAT_KEY] = BACKUP_FORMAT;
  const saved = (added.length === 0 && !unversioned) || writeBackup(JSON.stringify(backup));
  for (const [key, value] of profile) {
    if (saved || !added.includes(key)) PersistedSettings.get(key)?.set(value);
  }
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
    // Anything never set has to stay that way, or the user is pinned to today's default
    // (for experiments, cut off from remote ones).
    const saved: Record<string, unknown> = { [BACKUP_FORMAT_KEY]: BACKUP_FORMAT };
    for (const key of profile.keys()) saved[key] = backupValue(key);
    // Saved before anything changes, so a crash partway can't lose the real values.
    // Read back too: with no backup to restore from, stripping would lose them for good.
    if (!writeBackup(JSON.stringify(saved))) {
      toast.error("Couldn't save your settings, so TTML Reviewer stayed off.", { duration: 5000 });
      return;
    }
    applyProfile();
  } else if (backup) {
    // Everything in the backup, not just today's profile: an update can have taken a key
    // off the list, and it still has to come back.
    for (const key of Object.keys(backup)) {
      if (key === BACKUP_FORMAT_KEY) continue;
      const entry = PersistedSettings.get(key);
      if (backup[key] === null) entry?.unset();
      else entry?.set(backup[key]);
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

if ($ttmlReviewer.get()) resumeProfile();
