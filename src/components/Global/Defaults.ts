export const isDev = false;

const Defaults = {
  lyrics: {
    api: {
      url: isDev ? "http://localhost:3000" : "https://api.spicylyrics.org",
    },
  },
  CurrentLyricsType: "None",
  LyricsContainerExists: false,
  SkipSpicyFont: false,
  OldStyleFont: false,
  SpicyLyricsVersion: "0.0.0",
  show_topbar_notifications: true,
  PrefersReducedMotion: false,
  StaticBackground_Preset: false,
  StaticBackground: false,
  StaticBackgroundType_Preset: 0,
  StaticBackgroundType: "Auto",
  DevMode: false,
  SimpleLyricsMode: false,
  SimpleLyricsMode_RenderingType: "calculate", // the css one would be 'animate',
  SimpleLyricsMode_RenderingType_Default: 0,
  MinimalLyricsMode: false,
  hide_npv_bg: false,
  CompactMode_LockedMediaBox: false,
  LyricsRenderer: "Spicy",
  LyricsRenderer_Default: 0,
  CanvasBackground: false,
  PopupLyricsAllowed: true,
  ViewControlsPosition: "Top",
  SettingsOnTop: true,
  DeveloperMode: false,
};

export default Defaults;
