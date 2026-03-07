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

  const margin = 80;
  const page = document.querySelector("#SpicyLyricsPage");

  const backdrop = document.createElement("div");
  backdrop.className = "SpicyLyricsSettingsOverlay";
  backdrop.addEventListener("click", () => backdrop.remove());

  const container = document.createElement("div");
  container.className = "SpicyLyricsSettingsContainer";
  if (page) {
    const rect = page.getBoundingClientRect();
    container.style.left   = `${rect.left   + margin}px`;
    container.style.right  = `${window.innerWidth  - rect.right  + margin}px`;
    container.style.top    = `${rect.top    + margin}px`;
    container.style.bottom = `${window.innerHeight - rect.bottom + margin}px`;
  } else {
    container.style.left   = `${margin}px`;
    container.style.right  = `${margin}px`;
    container.style.top    = `${margin}px`;
    container.style.bottom = `${margin}px`;
  }
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

  {
    const row = document.createElement("div");
    row.className = "sl-settings-row";
    const lbl = document.createElement("span");
    lbl.className = "sl-settings-label";
    lbl.textContent = "Custom Font";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "sl-input";
    input.placeholder = "Spotify Mix";
    input.value = Defaults.CustomFont;
    input.addEventListener("input", () => {
      const val = input.value.trim();
      storage.set("customFont", val);
      Defaults.CustomFont = val;
      const page = document.querySelector<HTMLElement>("#SpicyLyricsPage");
      if (val) {
        document.documentElement.style.setProperty("--spicy-custom-font", val);
        page?.classList.remove("UseSpicyFont");
      } else {
        document.documentElement.style.removeProperty("--spicy-custom-font");
        page?.classList.add("UseSpicyFont");
        (window as any).__spicy_load_fonts?.();
      }
    });
    row.appendChild(lbl);
    row.appendChild(input);
    scroll.appendChild(row);
  }

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

  // --- Layout ---
  group("Layout");

  toggle("Lock the MediaBox size while in Forced Compact Mode", Defaults.CompactMode_LockedMediaBox, (v) => {
    storage.set("lockedMediaBox", v.toString());
    Defaults.CompactMode_LockedMediaBox = v;
  });

  // --- Cache ---
  group("Cache");

  button("Clear Lyrics for the current song from all caches", "Clear Current Song", async () => {
    if (!confirm("Clear all cached data for the current song?")) return;
    await RemoveCurrentLyrics_AllCaches(true);
  });

  button("Clear Cached Lyrics (Lyrics Stay in Cache for 3 days)", "Clear Cached Lyrics", async () => {
    if (!confirm("Clear all cached lyrics? This cannot be undone.")) return;
    await RemoveLyricsCache(true);
  });

  button("Clear Current Song Lyrics from internal state", "Clear Current Lyrics", () => {
    if (!confirm("Clear the current song's lyrics from internal state?")) return;
    RemoveCurrentLyrics_StateCache(true);
  });

  // --- Advanced ---
  group("Advanced");

  dropdown(
    "Lyrics Renderer (Deprecated - will not work)",
    ["Spicy Lyrics (Default) (Stable)", "AML Lyrics (Experimental) (Unstable)"],
    Defaults.LyricsRenderer_Default,
    (v) => {
      const processed = v === "AML Lyrics (Experimental) (Unstable)" ? "aml-lyrics" : "Spicy";
      storage.set("lyricsRenderer", processed);
      Defaults.LyricsRenderer = processed;
      ReloadCurrentLyrics();
    }
  );

  toggle("Developer Mode", Defaults.DeveloperMode, (v) => {
    storage.set("developerMode", v.toString());
    window.location.reload();
  });

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
