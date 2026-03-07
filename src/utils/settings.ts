import { Component, Spicetify } from "@spicetify/bundler";
import Defaults from "../components/Global/Defaults.ts";
import storage from "./storage.ts";
import { RemoveCurrentLyrics_AllCaches, RemoveCurrentLyrics_StateCache, RemoveLyricsCache, ReloadCurrentLyrics } from "./LyricsCacheTools.ts";

Component.AddRootComponent("lCache", {
  RemoveCurrentLyrics_AllCaches,
  RemoveLyricsCache,
  RemoveCurrentLyrics_StateCache,
})

export function showSettingsPanel() {
  if (document.querySelector(".SpicyLyricsSettingsOverlay")) return;

  const maxWidth = 1000;
  const page = document.querySelector("#SpicyLyricsPage");

  const backdrop = document.createElement("div");
  backdrop.className = "SpicyLyricsSettingsOverlay";
  backdrop.addEventListener("click", () => backdrop.remove());

  const container = document.createElement("div");
  container.className = "SpicyLyricsSettingsContainer";

  function updatePosition() {
    const ref = page ?? document.documentElement;
    const rect = ref.getBoundingClientRect();
    const availW = page ? rect.width : window.innerWidth;
    const availH = page ? rect.height : window.innerHeight;
    const originX = page ? rect.left : 0;
    const originY = page ? rect.top : 0;
    const panelWidth = Math.min(maxWidth, availW - 80);
    const panelHeight = availH * 0.7;
    container.style.width  = `${panelWidth}px`;
    container.style.height = `${panelHeight}px`;
    container.style.left   = `${originX + (availW - panelWidth) / 2}px`;
    container.style.top    = `${originY + (availH - panelHeight) / 2}px`;
  }

  updatePosition();
  window.addEventListener("resize", updatePosition);

  const removalObserver = new MutationObserver(() => {
    if (!document.contains(backdrop)) {
      window.removeEventListener("resize", updatePosition);
      removalObserver.disconnect();
    }
  });
  removalObserver.observe(document.body, { childList: true });

  container.addEventListener("click", (e) => e.stopPropagation());

  const header = document.createElement("div");
  header.className = "SpicyLyricsSettingsHeader";
  const title = document.createElement("span");
  title.textContent = "Spicy Lyrics Settings";
  const closeBtn = document.createElement("button");
  closeBtn.className = "SpicyLyricsSettingsHeaderClose";
  closeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  closeBtn.addEventListener("click", () => backdrop.remove());
  header.appendChild(title);
  header.appendChild(closeBtn);

  const scroll = document.createElement("div");
  scroll.className = "SpicyLyricsSettingsScroll";

  function group(name: string) {
    const h = document.createElement("h3");
    h.className = "sl-settings-group";
    h.textContent = name;
    scroll.appendChild(h);
  }

  function makeRow(label: string, control: HTMLElement) {
    const div = document.createElement("div");
    div.className = "sl-settings-row";
    const lbl = document.createElement("span");
    lbl.className = "sl-settings-label";
    lbl.textContent = label;
    div.appendChild(lbl);
    div.appendChild(control);
    scroll.appendChild(div);
  }

  function toggle(label: string, value: boolean, onChange: (v: boolean) => void) {
    const wrap = document.createElement("label");
    wrap.className = "sl-toggle";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = value;
    input.addEventListener("change", () => onChange(input.checked));
    const knob = document.createElement("span");
    wrap.appendChild(input);
    wrap.appendChild(knob);
    makeRow(label, wrap);
  }

  function dropdown(label: string, options: string[], selectedIndex: number, onChange: (v: string) => void) {
    const sel = document.createElement("select");
    sel.className = "sl-select";
    options.forEach((opt, i) => {
      const o = document.createElement("option");
      o.value = opt;
      o.textContent = opt;
      if (i === selectedIndex) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener("change", () => onChange(sel.value));
    makeRow(label, sel);
  }

  function button(label: string, btnText: string, onClick: () => void | Promise<void>) {
    const btn = document.createElement("button");
    btn.className = "sl-btn";
    btn.textContent = btnText;
    btn.addEventListener("click", () => onClick());
    makeRow(label, btn);
  }

  // --- Appearance ---
  group("Appearance");

  toggle("Skip Spicy Font*", Defaults.SkipSpicyFont, (v) => {
    storage.set("skip-spicy-font", v.toString());
    Defaults.SkipSpicyFont = v;
  });

  toggle("Old Style Font (Overridden by previous option)", Defaults.OldStyleFont, (v) => {
    storage.set("old-style-font", v.toString());
    Defaults.OldStyleFont = v;
  });

  toggle("Simple Lyrics Mode", Defaults.SimpleLyricsMode, (v) => {
    storage.set("simpleLyricsMode", v.toString());
    Defaults.SimpleLyricsMode = v;
    ReloadCurrentLyrics();
  });

  dropdown(
    "Simple Lyrics Mode - Rendering Type",
    ["Calculate (More performant)", "Animate (Legacy, More laggier)"],
    Defaults.SimpleLyricsMode_RenderingType_Default,
    (v) => {
      const processed = v === "Animate (Legacy, More laggier)" ? "animate" : "calculate";
      storage.set("simpleLyricsModeRenderingType", processed);
      Defaults.SimpleLyricsMode_RenderingType = processed;
      ReloadCurrentLyrics();
    }
  );

  toggle("Right Align Lyrics", Defaults.RightAlignLyrics, (v) => {
    storage.set("rightAlignLyrics", v.toString());
    Defaults.RightAlignLyrics = v;
  });

  dropdown(
    "Syllable Rendering",
    ["Default", "Merge Words", "Reduce Splits"],
    Defaults.SyllableRendering === "Reduce Splits" ? 2 : Defaults.SyllableRendering === "Merge Words" ? 1 : 0,
    (v) => {
      storage.set("syllableRendering", v);
      Defaults.SyllableRendering = v;
    }
  );

  toggle("Minimal Lyrics Mode (Only in Fullscreen/Cinema View)", Defaults.MinimalLyricsMode, (v) => {
    storage.set("minimalLyricsMode", v.toString());
    Defaults.MinimalLyricsMode = v;
    ReloadCurrentLyrics();
  });

  // --- Background ---
  group("Background");

  toggle("Static Background", Defaults.StaticBackground_Preset, (v) => {
    storage.set("staticBackground", v.toString());
    Defaults.StaticBackground = v;
  });

  dropdown(
    "Static Background Type (Only works when Static Background is Enabled)",
    ["Auto", "Artist Header Visual", "Cover Art", "Color"],
    Defaults.StaticBackgroundType_Preset,
    (v) => {
      storage.set("staticBackgroundType", v);
      Defaults.StaticBackgroundType = v;
    }
  );

  toggle("Hide Now Playing View Dynamic Background", Defaults.hide_npv_bg, (v) => {
    storage.set("hide_npv_bg", v.toString());
    Defaults.hide_npv_bg = v;
  });

  // --- Playback & Controls ---
  group("Playback & Controls");

  dropdown(
    "View Controls Position",
    ["Top", "Bottom"],
    Defaults.ViewControlsPosition === "Bottom" ? 1 : 0,
    (v) => {
      storage.set("viewControlsPosition", v);
      Defaults.ViewControlsPosition = v;
    }
  );

  toggle("Disable Popup Lyrics", !Defaults.PopupLyricsAllowed, (v) => {
    storage.set("disablePopupLyrics", v.toString());
    Defaults.PopupLyricsAllowed = !v;
    window.location.reload();
  });

  toggle("Show Topbar Notifications", Defaults.show_topbar_notifications, (v) => {
    storage.set("show_topbar_notifications", v.toString());
    Defaults.show_topbar_notifications = v;
  });

  dropdown(
    "Escape Key Function",
    ["Default", "Exit Fullscreen", "Exit Fully"],
    Defaults.EscapeKeyFunction === "Exit Fully" ? 2 : Defaults.EscapeKeyFunction === "Exit Fullscreen" ? 1 : 0,
    (v) => {
      storage.set("escapeKeyFunction", v);
      Defaults.EscapeKeyFunction = v;
    }
  );

  dropdown(
    "Always show in Fullscreen/Cinema",
    ["None", "Time", "Controls", "Both"],
    Defaults.AlwaysShowInFullscreen === "Both" ? 3 : Defaults.AlwaysShowInFullscreen === "Controls" ? 2 : Defaults.AlwaysShowInFullscreen === "Time" ? 1 : 0,
    (v) => {
      storage.set("alwaysShowInFullscreen", v);
      Defaults.AlwaysShowInFullscreen = v;
    }
  );

  dropdown(
    "Volume Slider in Fullscreen/Cinema",
    ["Off", "Left Side", "Right Side", "Below"],
    Defaults.ShowVolumeSliderFullscreen === "Below" ? 3
      : Defaults.ShowVolumeSliderFullscreen === "Right Side" ? 2
      : Defaults.ShowVolumeSliderFullscreen === "Left Side" ? 1
      : 0,
    (v) => {
      storage.set("showVolumeSliderFullscreen", v);
      Defaults.ShowVolumeSliderFullscreen = v;
    }
  );

  toggle("Replace Spotify Playbar with NowBar (performance gain workaround)", Defaults.ReplaceSpotifyPlaybar, (v) => {
    storage.set("replaceSpotifyPlaybar", v.toString());
    Defaults.ReplaceSpotifyPlaybar = v;
  });

  // --- Layout ---
  group("Layout");

  toggle("Lock the MediaBox size while in Forced Compact Mode", Defaults.CompactMode_LockedMediaBox, (v) => {
    storage.set("lockedMediaBox", v.toString());
    Defaults.CompactMode_LockedMediaBox = v;
  });

  // --- Cache ---
  group("Cache");

  button("Clear All Cache", "Clear All Cache", async () => {
    await RemoveCurrentLyrics_AllCaches(false);
    await RemoveLyricsCache(false);
    RemoveCurrentLyrics_StateCache(true);
  });

  button("Clear Lyrics for the current song from all caches", "Clear Current Song", async () => {
    await RemoveCurrentLyrics_AllCaches(true);
  });

  button("Clear Cached Lyrics (Lyrics Stay in Cache for 3 days)", "Clear Cached Lyrics", async () => {
    await RemoveLyricsCache(true);
  });

  button("Clear Current Song Lyrics from internal state", "Clear Current Lyrics", () => {
    RemoveCurrentLyrics_StateCache(true);
  });

  // --- Advanced ---
  group("Advanced");

  button("Browse Local TTML Database", "Browse", () => {
    (window as any).__spicy_ttml_explore_db?.();
  });

  toggle("Developer Mode", Defaults.DeveloperMode, (v) => {
    storage.set("developerMode", v.toString());
    window.location.reload();
  });

  {
    const [maj, min] = Defaults.SpicyLyricsVersion.split(".").map(Number);
    const isLegacyBuild = !isNaN(maj) && (maj < 5 || (maj === 5 && min <= 20));
    const isDevChannel = !isNaN(maj) && maj >= 100;
    if (isLegacyBuild || isDevChannel) {
      button(`Build Channel (Current: ${Defaults.BuildChannel})`, "Manage", () => {
        (window as any)._spicy_lyrics_channels?.showSwitcher?.();
      });
    }
  }

  container.appendChild(header);
  container.appendChild(scroll);
  backdrop.appendChild(container);
  document.body.appendChild(backdrop);
}

export async function setSettingsMenu() {
  while (!Spicetify.React || !Spicetify.ReactDOM) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  const { SettingsSection } = await import("../edited_packages/spcr-settings/settingsSection.tsx");
  const settings = new SettingsSection("Spicy Lyrics", "spicy-lyrics-settings");

  settings.addButton(
    "open-spicy-settings",
    "Open the Spicy Lyrics settings panel",
    "Open Settings",
    () => showSettingsPanel()
  );

  settings.pushSettings();
}
