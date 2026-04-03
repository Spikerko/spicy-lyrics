# Spicy Lyrics — Feature Ideas

Grouped by area. Marked with rough effort estimates: S = small, M = medium, L = large.

---

## Lyrics Experience

- **Multi-language translation overlay** [M]  
  Show a translated line beneath each lyric line (e.g. via DeepL/LibreTranslate). Opt-in per language pair.

- **Kanji/Furigana toggle for Japanese lyrics** [M]  
  Currently Kuroshiro converts to romaji. Add a third mode that renders furigana above each kanji instead of replacing the text.

- **Offline lyrics cache warm-up** [S]  
  Prefetch and cache lyrics for the next few queued tracks while the current one plays, so there is no fetch delay on track change.

- **Custom lyrics offset/sync adjustment** [S]  
  Allow users to manually shift timing +/- N milliseconds per song and persist it in LocalStorage, for tracks where lyrics are slightly out of sync.

- **Line repeat indicator** [S]  
  Visually mark chorus/repeated lines so users can quickly see structure at a glance.

- **Lyrics search / jump-to-line** [M]  
  Text search bar inside the lyrics panel that scrolls to the first matching line.

---

## Visual / Themes

- **Per-track custom background color override** [S]  
  Let users pin a specific background color for a song instead of using the auto-extracted vibrant color.

- **Lyrics text size slider** [S]  
  Runtime font-size adjustment, separate from compact/minimal mode.

- **High-contrast / accessibility mode** [S]  
  Pure black/white color scheme with no dynamic background for accessibility or OLED screens.

- **Animated gradient background option** [M]  
  Instead of static color extraction, continuously animate a multi-stop gradient derived from the album art palette.

- **Custom CSS injection for lyrics container** [M]  
  A text area in settings where power users can paste additional CSS scoped to `#SpicyLyricsPage`.

---

## Settings & Configuration

- **Settings export / import** [S]  
  Serialise all `storage` keys to a JSON file and allow re-importing on a fresh install.

- **Per-profile preset switching** [M]  
  Named setting presets (e.g. "Theatre Mode", "Minimal", "Party") that can be switched from a single button.

- **Keyboard shortcuts panel** [M]  
  Customisable hotkeys for toggle-fullscreen, toggle-nowbar, toggle-romanization, etc.

---

## NowBar / Player Panel

- **Waveform / audio analysis visualizer** [L]  
  Use existing `audioAnalysis.ts` call to drive a real-time waveform or beat-pulse animation on the NowBar artwork.

- **Lyrics excerpt in Discord Rich Presence** [M]  
  Hook into Spicetify's Discord bridge to show the current lyric line as the Rich Presence detail string.

- **Upcoming lyrics preview on hover** [S]  
  When user hovers over the next few lines, preview them in a tooltip without disrupting scroll state.

---

## Community / TTML Profiles

- **Lyric rating / reaction system** [M]  
  Let users react to community-uploaded TTML lyrics (accuracy rating, thumbs up/down) to surface better submissions.

- **TTML submission from within the extension** [M]  
  Instead of requiring external tooling, add an in-app editor or upload flow for creating/submitting TTML directly.

- **Profile bio/links on TTML profile cards** [S]  
  Allow contributors to add a short bio and optional social link displayed in the in-app profile modal.

---

## Developer / Technical

- **Bundle remote packages at build time** [L]  
  Move `pkgs.spikerko.org` dynamic imports (pinyin, aromanize, Kuromoji, etc.) to build-time bundled modules, eliminating runtime remote code execution risk.

- **Structured error reporting** [S]  
  Surface fetch/parse errors in a small in-app error panel for users instead of silent console-only failures.

- **Extension health dashboard** [S]  
  A dev-tools or settings sub-page showing API latency, cache hit rate, last fetch status, and extension version info in one place.

- **E2E test harness for lyric rendering** [L]  
  Headless test suite that loads sample TTML/Line/Static payloads and asserts correct DOM output and scroll behaviour.
