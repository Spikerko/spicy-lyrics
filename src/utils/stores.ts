import { atom, type WritableAtom } from "nanostores";
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
    // Was an experiment; carry over the choice of anyone who toggled it.
    "experiment:duetLinePadding": "duetLinePadding",
    staticBackgroundBlur: "backgroundBlur",
  };
  let changed = false;
  for (const [oldKey, newKey] of Object.entries(renames)) {
    if (oldKey in blob) {
      blob[newKey] = blob[oldKey];
      delete blob[oldKey];
      changed = true;
    }
  }
  // The old "Static Background" select. Its "auto" did exactly what "artistHeader" did.
  if ("staticBackgroundMode" in blob) {
    const styles: Record<string, BackgroundStyle> = {
      off: "dynamic",
      auto: "artist",
      artistHeader: "artist",
      coverArt: "cover",
      color: "color",
    };
    blob.backgroundStyle ??= styles[blob.staticBackgroundMode] ?? "dynamic";
    delete blob.staticBackgroundMode;
    changed = true;
  }
  // Simple Lyrics Mode lost its "Animate" style; everyone gets the one that was the default.
  if ("simpleLyricsModeRenderingType" in blob) {
    delete blob.simpleLyricsModeRenderingType;
    changed = true;
  }
  // The old "Join Split Words" toggle joined only evenly sung words, which is "steady".
  if ("joinSplitWords" in blob) {
    blob.syllableMerge ??= blob.joinSplitWords ? "steady" : "off";
    delete blob.joinSplitWords;
    changed = true;
  }
  if (migrateRendererStyle(blob)) changed = true;
  if (changed) saveSettingsBlob(blob);
  return blob;
}

// The old Simple Lyrics Mode toggle became the Bloom style. Its refreshed look
// was an experiment; Bloom is that look, so whoever had Simple Lyrics Mode on
// gets Bloom whatever the experiment was set to. Exported for the migration test.
export function migrateRendererStyle(blob: Record<string, any>): boolean {
  let changed = false;
  if ("simpleLyricsMode" in blob) {
    blob.rendererVisualStyle ??= blob.simpleLyricsMode === true ? "bloom" : "spring";
    delete blob.simpleLyricsMode;
    changed = true;
  }
  if ("experiment:refreshedSimpleLyrics" in blob) {
    delete blob["experiment:refreshedSimpleLyrics"];
    changed = true;
  }
  if ("rendererVisualStyle" in blob && !RENDERER_VISUAL_STYLES.includes(blob.rendererVisualStyle)) {
    delete blob.rendererVisualStyle;
    changed = true;
  }
  return changed;
}

// How the synced lyrics move. "spring" is the original renderer; "bloom" fills
// each line behind one soft edge, swells held words letter by letter, and
// follows the song with a staggered scroll.
export type RendererVisualStyle = "spring" | "bloom";
export const RENDERER_VISUAL_STYLES: readonly RendererVisualStyle[] = ["spring", "bloom"];
export const RENDERER_VISUAL_STYLE_LABELS: Record<RendererVisualStyle, string> = {
  spring: "Spring (Default)",
  bloom: "Bloom",
};

const _settings: Record<string, any> = migrateSettingsKeys(readSettingsBlob());

/**
 * Every persisted atom and its default, so the bug report can list what someone
 * changed and TTML Reviewer mode can put values back through the atoms. Writing the
 * blob instead wouldn't do: the atoms keep their values in memory and would save
 * theirs over it on their next change.
 */
export const PersistedSettings = new Map<
  string,
  {
    get: () => unknown;
    set: (value: any) => void;
    /** Whether the blob holds a value, as opposed to it never having been set. */
    isStored: () => boolean;
    /** Back to never having been set, so a later change of default still reaches it. */
    unset: () => void;
    defaultValue: unknown;
  }
>();

function registerPersisted<T>(key: string, store: WritableAtom<T>, defaultValue: T) {
  PersistedSettings.set(key, {
    get: () => store.get(),
    set: (value) => store.set(value),
    isStored: () => _settings[key] !== undefined,
    unset: () => {
      store.set(defaultValue);
      delete _settings[key];
      saveSettingsBlob(_settings);
    },
    defaultValue,
  });
}

/**
 * An atom backed by the settings blob. Exported so feature modules (e.g.
 * `experiments.ts`) can register their own persisted settings without having to
 * add a line here for every one.
 */
export function persistAtom<T>(key: string, defaultValue: T) {
  const store = atom<T>(_settings[key] !== undefined ? _settings[key] : defaultValue);
  store.listen((v) => {
    _settings[key] = v;
    saveSettingsBlob(_settings);
  });
  registerPersisted(key, store, defaultValue);
  return store;
}

// Setting atoms (persisted)
// "none" paints nothing, so a theme's own background (an image, say) shows through.
export type BackgroundStyle = "dynamic" | "artist" | "cover" | "color" | "none";
export const BACKGROUND_STYLES: readonly BackgroundStyle[] = ["dynamic", "artist", "cover", "color", "none"];
export const $backgroundStyle = persistAtom<BackgroundStyle>("backgroundStyle", "dynamic");
// Blur radius (px) for the two image styles, "artist" and "cover".
export const $backgroundBlur = persistAtom<number>("backgroundBlur", 0);
// Lyrics text size as a percentage of what each view uses by default.
export const $lyricsSize = persistAtom<number>("lyricsSize", 100);
// CSS font-weight of the lyrics text; 700 is the look it has always had. Background vocals and
// the unsynced lyrics sit a step or two lighter than this, as they do at 700.
export const $lyricsWeight = persistAtom<number>("lyricsWeight", 700);
export const $rendererVisualStyle = persistAtom<RendererVisualStyle>("rendererVisualStyle", "spring");
export const isBloomRenderer = (): boolean => $rendererVisualStyle.get() === "bloom";
// Shown as "Fade Away Previous Lines"; the key keeps its old name.
export const $minimalLyricsMode = persistAtom<boolean>("minimalLyricsMode", false);
// Which words sung in syllables are shown as one word: none, all, those whose
// parts line up evenly, or those long enough to be drawn letter by letter.
export type SyllableMerge = "off" | "full" | "steady" | "held";
export const $syllableMerge = persistAtom<SyllableMerge>("syllableMerge", "off");
// A joined word drawn letter by letter times its letters by the syllables it
// was joined from, instead of spreading them evenly over the whole word.
export const $syllablePace = persistAtom<boolean>("syllablePace", false);
// With romanization on, whether it replaces the line's text or shows as a
// smaller row under each line.
export type RomanizationDisplay = "replace" | "underLine";
export const $romanizationDisplay = persistAtom<RomanizationDisplay>("romanizationDisplay", "underLine");
// How a syllable romanization row under the line lights up: a gradient sweeping
// along each syllable, or each syllable lighting whole while it's sung.
export type RomanizationHighlight = "sweep" | "word";
export const $romanizationHighlight = persistAtom<RomanizationHighlight>("romanizationHighlight", "sweep");
if (!["sweep", "word"].includes($romanizationHighlight.get())) $romanizationHighlight.set("sweep");
// Whether the translation the lyrics file carries is shown (the view control,
// which only appears for lyrics that have one), and whether it shows as a
// smaller row under each line or in place of the line.
export const $lyricsTranslation = persistAtom<boolean>("lyricsTranslation", false);
export type TranslationDisplay = "underLine" | "replace";
export const $translationDisplay = persistAtom<TranslationDisplay>("translationDisplay", "underLine");
// Tinted box drawn behind a lyrics line while the pointer is over it.
export const $lineHoverBackground = persistAtom<boolean>("lineHoverBackground", true);
// Wide inset on the side a duet line leans away from, so the two voices read as
// separate columns. Off gives duet lines the same slight padding as every line.
export const $duetLinePadding = persistAtom<boolean>("duetLinePadding", true);
// When a song ends on a duet line sung from the right, the credits under it
// (writers, provider, community info) move to the right with it.
export const $creditsFollowLastLine = persistAtom<boolean>("creditsFollowLastLine", false);
// Credits held at the bottom of the lyrics instead of scrolling after the last line:
// the source and community line only, or the songwriters too.
export type PinnedCredits = "off" | "noWriters" | "full";
export const $pinnedCredits = persistAtom<PinnedCredits>("pinnedCredits", "off");
export const $skipSpicyFont = persistAtom<boolean>("skipSpicyFont", false);
// File name of the font the user picked (the font itself is in IndexedDB, see
// utils/CustomFont.ts). Empty means no custom font.
export const $customFont = persistAtom<string>("customFont", "");
// Family name of a font that is already installed, typed or picked from the list.
// Only one of this and $customFont is set at a time.
export const $customFontFamily = persistAtom<string>("customFontFamily", "");
export const $showNpvDynamicBg = persistAtom<boolean>("showNpvDynamicBg", true);
// Never inject the lyrics card into the Now Playing sidebar at all.
export const $disableNpvLyrics = persistAtom<boolean>("disableNpvLyrics", false);
// Pull the whole NPV lyrics card out of the sidebar while the current track has
// no lyrics, instead of leaving it up showing the "no lyrics" notice.
export const $hideNpvLyricsWhenUnavailable = persistAtom<boolean>(
  "hideNpvLyricsWhenUnavailable",
  true
);
// Off: a song that simply has no lyrics (not found, local file, DJ, podcast...) shows
// only the song info instead of the notice. Errors still show theirs. The NPV card
// has its own switch above.
export const $showNoLyricsNotice = persistAtom<boolean>("showNoLyricsNotice", true);
// In Fullscreen and Cinema View, a song with no lyrics opens the queue in the lyrics column,
// and the next song with lyrics closes it again.
export const $showQueueWhenNoLyrics = persistAtom<boolean>("showQueueWhenNoLyrics", false);
// Hide Spotify's own lyrics button in the playback bar (ours is left alone).
export const $removeSpotifyLyricsButton = persistAtom<boolean>("removeSpotifyLyricsButton", false);
export const $lockedMediaBox =persistAtom<boolean>("lockedMediaBox", false);
// $popupLyricsAllowed: stored as actual boolean "popupLyricsAllowed" in the settings blob.
export const $popupLyricsAllowed = (() => {
  const initial: boolean =
    _settings["popupLyricsAllowed"] !== undefined ? _settings["popupLyricsAllowed"] : true;
  const store = atom<boolean>(initial);
  store.listen((v) => {
    _settings["popupLyricsAllowed"] = v;
    saveSettingsBlob(_settings);
  });
  registerPersisted("popupLyricsAllowed", store, true);
  return store;
})();
export const $viewControlsPosition = persistAtom<string>("viewControlsPosition", "Top");
export const $ttmlMakerMode = persistAtom<boolean>("ttmlMakerMode", true);
// Last upload mode picked in the Local DB upload screen: "persistent" | "temporary".
export const $ttmlUploadMode = persistAtom<string>("ttmlUploadMode", "persistent");
export const $developerMode = persistAtom<boolean>("developerMode", false);
export const $timelineOutsideMediaContent = persistAtom<boolean>(
  "timelineOutsideMediaContent",
  true
);
// The album's animated cover, played over the still one when it has one.
export const $motionArtwork = persistAtom<boolean>("motionArtwork", true);
// With Canvas Stage on, what plays when a song has both a Canvas and motion artwork.
export type MotionArtworkPriority = "motion" | "canvas";
export const $motionArtworkPriority = persistAtom<MotionArtworkPriority>("motionArtworkPriority", "motion");
// Motion artwork may fill the Canvas Stage (while Canvas Stage is on); off keeps it on the NowBar cover.
export const $motionArtworkOnStage = persistAtom<boolean>("motionArtworkOnStage", true);
// Volume band below the playback controls in Fullscreen / Cinema View / Popup Lyrics.
export const $showVolumeSlider = persistAtom<boolean>("showVolumeSlider", true);
// Unsynced lyrics scroll through at the song's pace: "basic" follows loudness, "advanced" the voice.
export type StaticAutoScroll = "off" | "basic" | "advanced";
export const $staticAutoScroll = persistAtom<StaticAutoScroll>("staticAutoScroll", "off");
// Where the song's release year sits in the NowBar's artists row.
export type ReleaseYearPosition = "off" | "left" | "right";
export const $releaseYearPosition = persistAtom<ReleaseYearPosition>("releaseYearPosition", "off");
// Playback timing offset in milliseconds (bipolar: negative = earlier, positive = later)
export const $playbackOffset = persistAtom<number>("playbackOffset", 0);
// Clicking a line seeks this much earlier, so Spotify's ~300ms fade-in on seek
// doesn't swallow the start of the line.
export const $seekFadeCompensation = persistAtom<boolean>("seekFadeCompensation", true);
// Start auto-scrolling to a line this many ms before it becomes active.
export const $scrollLeadEnabled = persistAtom<boolean>("scrollLeadEnabled", false);
export const $scrollLeadMs = persistAtom<number>("scrollLeadMs", 250);
// Spring-driven auto-scroll instead of the browser's native smooth scroll.
export const $smoothScrolling = persistAtom<boolean>("smoothScrolling", false);
// A button back to the line being sung while a hand scroll has left it out of view.
export const $showScrollToActive = persistAtom<boolean>("showScrollToActive", true);
// Frame rate cap for everything that redraws every frame (lyrics animation,
// animated background, smooth-scroll glide). On high refresh rate displays every
// extra frame is another repaint of the whole page, so this bounds the per-second
// work. Off by default, which draws on every display refresh as before; the
// slider value only applies once the cap is turned on.
export const $animationFpsCapEnabled = persistAtom<boolean>("animationFpsCapEnabled", false);
export const $animationFpsCap = persistAtom<number>("animationFpsCap", 60);

// Version atom — NOT persisted, set once at startup
export const $spicyLyricsVersion = atom<string>(
  (window as any)._spicy_lyrics_metadata?.LoadedVersion ?? ProjectVersion
);

// Runtime (ephemeral) atoms
export const $currentLyricsType = atom<string>("None");
export const $lyricsContainerExists = atom<boolean>(false);
export const $currentlyFetching = atom<boolean>(false);
export const $currentLyricsData = atom<string>("");
