import { atom } from "nanostores";
import { ProjectVersion } from "../../project/config.ts";

export const SETTINGS_KEY = "SL:settings";

function readSettingsBlob(): Record<string, any> {
  const raw = Spicetify.LocalStorage.get(SETTINGS_KEY);
  if (raw === null || raw === undefined) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveSettingsBlob(obj: Record<string, any>) {
  Spicetify.LocalStorage.set(SETTINGS_KEY, JSON.stringify(obj));
}

function migrateSettingsKeys(blob: Record<string, any>): Record<string, any> {
  const renames: Record<string, string> = {
    "skip-spicy-font": "skipSpicyFont",
    show_npv_dynamic_bg: "showNpvDynamicBg",
  };
  let changed = false;
  for (const [oldKey, newKey] of Object.entries(renames)) {
    if (oldKey in blob) {
      blob[newKey] = blob[oldKey];
      delete blob[oldKey];
      changed = true;
    }
  }
  if (changed) saveSettingsBlob(blob);
  return blob;
}

const _settings: Record<string, any> = migrateSettingsKeys(readSettingsBlob());

function persistAtom<T>(key: string, defaultValue: T) {
  const store = atom<T>(_settings[key] !== undefined ? _settings[key] : defaultValue);
  store.listen((v) => {
    _settings[key] = v;
    saveSettingsBlob(_settings);
  });
  return store;
}

// Setting atoms (persisted)
export const $staticBackgroundMode = persistAtom<string>("staticBackgroundMode", "off");
export const $simpleLyricsMode = persistAtom<boolean>("simpleLyricsMode", false);
export const $simpleLyricsModeRenderingType = persistAtom<string>(
  "simpleLyricsModeRenderingType",
  "calculate"
);
export const $minimalLyricsMode = persistAtom<boolean>("minimalLyricsMode", false);
export const $skipSpicyFont = persistAtom<boolean>("skipSpicyFont", false);
export const $showNpvDynamicBg = persistAtom<boolean>("showNpvDynamicBg", true);
export const $lockedMediaBox = persistAtom<boolean>("lockedMediaBox", false);
// $popupLyricsAllowed: stored as actual boolean "popupLyricsAllowed" in the settings blob.
export const $popupLyricsAllowed = (() => {
  const initial: boolean =
    _settings["popupLyricsAllowed"] !== undefined ? _settings["popupLyricsAllowed"] : true;
  const store = atom<boolean>(initial);
  store.listen((v) => {
    _settings["popupLyricsAllowed"] = v;
    saveSettingsBlob(_settings);
  });
  return store;
})();
export const $viewControlsPosition = persistAtom<string>("viewControlsPosition", "Top");
export const $ttmlMakerMode = persistAtom<boolean>("ttmlMakerMode", true);
export const $developerMode = persistAtom<boolean>("developerMode", false);
export const $timelineOutsideMediaContent = persistAtom<boolean>(
  "timelineOutsideMediaContent",
  true
);
// Playback timing offset in milliseconds (bipolar: negative = earlier, positive = later)
export const $playbackOffset = persistAtom<number>("playbackOffset", 0);

// Version atom — NOT persisted, set once at startup
export const $spicyLyricsVersion = atom<string>(
  (window as any)._spicy_lyrics_metadata?.LoadedVersion ?? ProjectVersion
);

// Runtime (ephemeral) atoms
export const $currentLyricsType = atom<string>("None");
export const $lyricsContainerExists = atom<boolean>(false);
export const $currentlyFetching = atom<boolean>(false);
export const $currentLyricsData = atom<string>("");
