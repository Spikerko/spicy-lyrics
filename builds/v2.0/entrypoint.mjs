// Built-in channel → [apiHost, storageHost, fixedVersion?] map
const CHANNEL_MAP = {
  Stable: ["api.spicylyrics.org", "public.storage.spicylyrics.org"],
  Beta:   ["api.spicylyrics.org", "public.storage.spicylyrics.org"],
};

const BUILT_IN_CHANNELS = Object.keys(CHANNEL_MAP);
const DEFAULT_API_HOST = CHANNEL_MAP.Stable[0];
const DEFAULT_STORAGE_HOST = CHANNEL_MAP.Stable[1];
const CUSTOM_CHANNELS_ENABLED_KEY = "customChannelsEnabled";
const SECRET_ENABLE_RIGHT_CLICKS = 7;
const SECRET_DISABLE_LEFT_CLICKS = 6;

const LS_PREFIX = "SpicyLyrics-";
const lsGet = (key) => Spicetify.LocalStorage.get(`${LS_PREFIX}${key}`);
const lsSet = (key, value) => Spicetify.LocalStorage.set(`${LS_PREFIX}${key}`, value);

// ─── Version Helpers ───

const parseVersion = (str) => {
  const parts = (str || "").split(".").map(Number);
  return { Major: parts[0] || 0, Minor: parts[1] || 0, Patch: parts[2] || 0 };
};

const compareVersions = (a, b) => {
  const av = parseVersion(a);
  const bv = parseVersion(b);
  if (av.Major !== bv.Major) return av.Major - bv.Major;
  if (av.Minor !== bv.Minor) return av.Minor - bv.Minor;
  return av.Patch - bv.Patch;
};

const isVersionAtLeast = (version, minimum) => compareVersions(version, minimum) >= 0;

// Plugin version that handles its own settings button placement
const PLUGIN_HANDLES_SETTINGS = "5.20.0";
let pluginLoadedVersion = null;

// ─── Channel Storage Helpers ───

const getCustomChannels = () => {
  try {
    const raw = lsGet("customChannels");
    if (raw) {
      const parsed = JSON.parse(raw);
      const clean = {};
      for (const [name, hosts] of Object.entries(parsed)) {
        if (Array.isArray(hosts) && (hosts.length === 2 || hosts.length === 3)) {
          clean[name] = hosts;
        }
      }
      return clean;
    }
  } catch (e) {
    console.warn("[Spicy Lyrics] [Entry] Failed to parse custom channels:", e);
  }
  return {};
};

const saveCustomChannels = (channels) => lsSet("customChannels", JSON.stringify(channels));

const getFullChannelMap = () => ({ ...CHANNEL_MAP, ...getCustomChannels() });

const getCurrentChannel = () => lsGet("buildChannel") ?? "Stable";

const setCurrentChannel = (name) => lsSet("buildChannel", name);

const getCustomChannelAccessEnabled = () => {
  const saved = lsGet(CUSTOM_CHANNELS_ENABLED_KEY);
  if (saved != null) return saved === "true";

  const enabled = Object.keys(getCustomChannels()).length > 0;
  lsSet(CUSTOM_CHANNELS_ENABLED_KEY, enabled ? "true" : "false");
  return enabled;
};

const setCustomChannelAccessEnabled = (enabled) => {
  lsSet(CUSTOM_CHANNELS_ENABLED_KEY, enabled ? "true" : "false");

  if (!enabled && !BUILT_IN_CHANNELS.includes(getCurrentChannel())) {
    setCurrentChannel("Stable");
    return { switchedToStable: true };
  }

  return { switchedToStable: false };
};

const showCustomChannelAccessNotification = (enabled, switchedToStable = false) => {
  const suffix = !enabled && switchedToStable ? " Switched back to Stable." : "";
  Spicetify.showNotification(`Custom build channels ${enabled ? "enabled" : "disabled"}.${suffix}`);
};

const attachSecretToggleGesture = (element, onStateChange) => {
  if (!element || element.__spicy_custom_channel_gesture) return;
  element.__spicy_custom_channel_gesture = true;

  let rightClickCount = 0;
  let leftClickCount = 0;
  let clickTimeout = null;

  const resetCounts = () => {
    rightClickCount = 0;
    leftClickCount = 0;
  };

  const queueReset = () => {
    if (clickTimeout) clearTimeout(clickTimeout);
    clickTimeout = setTimeout(resetCounts, 3000);
  };

  element.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    rightClickCount++;
    leftClickCount = 0;
    queueReset();

    if (rightClickCount < SECRET_ENABLE_RIGHT_CLICKS) return;

    resetCounts();
    const result = setCustomChannelAccessEnabled(true);
    showCustomChannelAccessNotification(true, result.switchedToStable);
    onStateChange?.(true, result);
  });

  element.addEventListener("click", (e) => {
    if (e.button !== 0) return;

    leftClickCount++;
    rightClickCount = 0;
    queueReset();

    if (leftClickCount < SECRET_DISABLE_LEFT_CLICKS) return;

    resetCounts();
    const result = setCustomChannelAccessEnabled(false);
    showCustomChannelAccessNotification(false, result.switchedToStable);
    onStateChange?.(false, result);
  });
};

const registerSettingsPageUnlockGesture = () => {
  const selectors = [
    'label[for="spicy-lyrics-settings.build-channel"]',
    "#sl-entry-channel-label",
  ];

  const waitAndAttach = () => {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;

      let attachedCount = 0;
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (!element) continue;
        attachedCount++;
        attachSecretToggleGesture(element);
      }

      if (attachedCount === selectors.length || attempts > 100) {
        clearInterval(interval);
      }
    }, 50);
  };

  Spicetify.Platform.History.listen((e) => {
    if (e.pathname === "/preferences") {
      waitAndAttach();
    }
  });

  if (Spicetify.Platform.History.location.pathname === "/preferences") {
    waitAndAttach();
  }
};

// ─── Style injection ───
// The entrypoint runs independently of the plugin bundle, so it injects its
// own stylesheet to ensure the panel and sl-* components are always styled.

const injectStyles = () => {
  if (document.getElementById("spicy-lyrics-entry-styles")) return;
  const style = document.createElement("style");
  style.id = "spicy-lyrics-entry-styles";
  style.textContent = `
    .SpicyLyricsSettingsOverlay{position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.55);}
    .SpicyLyricsSettingsContainer{position:fixed;z-index:9999;background:#0e0e0e;border:1px solid rgba(255,255,255,.14);border-radius:12px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.7);}
    .SpicyLyricsSettingsHeader{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid rgba(255,255,255,.1);flex-shrink:0;}
    .SpicyLyricsSettingsHeader span{font-size:.95rem;font-weight:600;color:#fff;letter-spacing:.01em;}
    .SpicyLyricsSettingsHeaderClose{background:none;border:none;color:rgba(255,255,255,.5);cursor:pointer;padding:4px;display:flex;align-items:center;justify-content:center;border-radius:6px;transition:color .15s,background .15s;}
    .SpicyLyricsSettingsHeaderClose:hover{color:#fff;background:rgba(255,255,255,.1);}
    .SpicyLyricsSettingsScroll{flex:1;overflow-y:auto;padding:8px 16px 16px;}
    .SpicyLyricsSettingsScroll::-webkit-scrollbar{width:4px;}
    .SpicyLyricsSettingsScroll::-webkit-scrollbar-track{background:transparent;}
    .SpicyLyricsSettingsScroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,.15);border-radius:4px;}
    .sl-settings-group{font-size:.72rem;font-weight:700;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.1em;margin-top:20px;margin-bottom:4px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,.08);}
    .sl-settings-group:first-child{margin-top:8px;}
    .sl-settings-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:8px 6px;border-radius:6px;}
    .sl-settings-row:hover{background:rgba(255,255,255,.06);}
    .sl-settings-label{font-size:.875rem;color:rgba(255,255,255,.85);flex:1;}
    .sl-toggle{position:relative;display:inline-flex;width:40px;height:22px;flex-shrink:0;cursor:pointer;}
    .sl-toggle input{opacity:0;width:0;height:0;position:absolute;}
    .sl-toggle span{position:absolute;inset:0;background:rgba(255,255,255,.15);border-radius:100px;transition:background .2s;}
    .sl-toggle span::after{content:"";position:absolute;width:16px;height:16px;left:3px;top:3px;background:white;border-radius:50%;transition:transform .2s;}
    .sl-toggle input:checked+span{background:var(--spice-button,#1ed760);}
    .sl-toggle input:checked+span::after{transform:translateX(18px);}
    .sl-select{appearance:none;background-color:rgba(255,255,255,.07);background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.5)' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 8px center;color:rgba(255,255,255,.85);border:1px solid rgba(255,255,255,.12);border-radius:6px;padding:6px 28px 6px 10px;font-size:.8rem;cursor:pointer;flex-shrink:0;max-width:220px;}
    .sl-select option{background:#1a1a1a;color:rgba(255,255,255,.85);}
    .sl-select:focus{outline:none;border-color:var(--spice-button,#1ed760);}
    .sl-input{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:6px;color:rgba(255,255,255,.85);padding:6px 10px;font-size:.8rem;flex-shrink:0;width:200px;outline:none;transition:border-color .15s;}
    .sl-input::placeholder{color:rgba(255,255,255,.3);}
    .sl-input:focus{border-color:var(--spice-button,#1ed760);}
    .sl-btn{background:rgba(255,255,255,.07);color:rgba(255,255,255,.85);border:1px solid rgba(255,255,255,.12);border-radius:6px;padding:6px 14px;font-size:.8rem;cursor:pointer;flex-shrink:0;transition:background .15s,border-color .15s;}
    .sl-btn:hover{background:rgba(255,255,255,.13);border-color:rgba(255,255,255,.25);}
    .sl-btn.sl-btn-primary{background:rgba(255,255,255,.9);color:#111;border-color:transparent;font-weight:600;}
    .sl-btn.sl-btn-primary:hover{background:#fff;border-color:transparent;}
    .sl-btn.sl-btn-danger{color:rgba(220,80,60,.9);border-color:rgba(220,80,60,.3);}
    .sl-btn.sl-btn-danger:hover{background:rgba(220,80,60,.1);border-color:rgba(220,80,60,.5);}
    .GenericModal__overlay .main-trackCreditsModal-container:has(.update-card-wrapper){width:min(35rem,calc(100vw - 48px));background:#0e0e0e;border:1px solid rgba(255,255,255,.14);border-bottom-color:transparent;border-radius:12px;box-shadow:0 8px 40px rgba(0,0,0,.7);overflow:hidden;position:relative;}
    .GenericModal__overlay .main-trackCreditsModal-container:has(.update-card-wrapper) .main-trackCreditsModal-header{background:transparent;border-bottom:none;justify-content:flex-end;padding:10px 10px 0;position:absolute;right:0;top:0;z-index:2;}
    .GenericModal__overlay .main-trackCreditsModal-container:has(.update-card-wrapper) .main-trackCreditsModal-header h1{display:none;}
    .GenericModal__overlay .main-trackCreditsModal-container:has(.update-card-wrapper) .main-trackCreditsModal-mainSection{overflow:hidden;padding-top:0;}
    .GenericModal__overlay .main-trackCreditsModal-container:has(.update-card-wrapper) .main-trackCreditsModal-originalCredits{background:transparent;border:none;box-shadow:none;-ms-overflow-style:none;overflow:hidden;padding:0;scrollbar-width:none;}
    .GenericModal__overlay .main-trackCreditsModal-container:has(.update-card-wrapper) .main-trackCreditsModal-originalCredits::-webkit-scrollbar{display:none;}
    .GenericModal__overlay .update-card-wrapper{display:flex;flex-direction:column;gap:14px;color:#fff;padding:20px 0 18px;}
    .GenericModal__overlay .update-card-wrapper .sl-update-hero{display:flex;flex-direction:column;gap:10px;text-align:center;}
    .GenericModal__overlay .update-card-wrapper .sl-update-status{align-self:center;border:1px solid rgba(255,255,255,.2);border-radius:999px;color:rgba(255,255,255,.82);cursor:default;font-size:.72rem;font-weight:700;letter-spacing:.1em;padding:6px 10px;pointer-events:none;text-align:center;text-transform:uppercase;}
    .GenericModal__overlay .update-card-wrapper .sl-update-status.is-success{background:rgba(29,185,84,.14);border-color:rgba(29,185,84,.28);color:#74e39d;}
    .GenericModal__overlay .update-card-wrapper .sl-update-status.is-warning{background:rgba(237,190,78,.14);border-color:rgba(237,190,78,.28);color:#f1d47b;}
    .GenericModal__overlay .update-card-wrapper .sl-update-title{color:#fff;font-size:1.15rem;font-weight:700;line-height:1.3;text-align:center;}
    .GenericModal__overlay .update-card-wrapper .sl-update-copy{color:rgba(255,255,255,.66);font-size:.92rem;line-height:1.55;margin:0;text-align:center;}
    .GenericModal__overlay .update-card-wrapper .sl-update-section{align-self:center;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08);border-radius:10px;display:flex;flex-direction:column;gap:8px;padding:12px 14px;text-align:center;width:min(100%,18.5rem);}
    .GenericModal__overlay .update-card-wrapper .sl-update-section-label{color:rgba(255,255,255,.42);font-size:.72rem;font-weight:700;letter-spacing:.1em;text-align:center;text-transform:uppercase;}
    .GenericModal__overlay .update-card-wrapper .sl-update-version{color:rgba(255,255,255,.9);font-size:1rem;font-weight:600;line-height:1.4;text-align:center;}
    .GenericModal__overlay .update-card-wrapper .sl-update-actions{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(156px,1fr));}
    .GenericModal__overlay .update-card-wrapper .sl-update-action{align-items:center;display:flex;justify-content:center;min-height:42px;padding:8px 16px;width:100%;}
    .GenericModal:has(.slm),.GenericModal:has(.slm) .main-trackCreditsModal-container{border-radius:16px;}
    .main-trackCreditsModal-mainSection:has(.slm.scroll-x-hidden){overflow-x:hidden;}
  `;
  document.head.appendChild(style);
};

// ─── Panel helper ───
// Creates an overlay matching the SpicyLyricsSettingsContainer style,
// centered within #SpicyLyricsPage (falls back to viewport).

const showPanel = (title, buildContent) => {
  const existing = document.querySelector(".SpicyLyricsChannelOverlay");
  if (existing) existing.remove();

  const backdrop = document.createElement("div");
  backdrop.className = "SpicyLyricsSettingsOverlay SpicyLyricsChannelOverlay";

  const container = document.createElement("div");
  container.className = "SpicyLyricsSettingsContainer";

  const panelWidth = 500;

  function updatePosition() {
    const page = document.querySelector("#SpicyLyricsPage");
    const ref = page ?? document.documentElement;
    const rect = ref.getBoundingClientRect();
    const availW = page ? rect.width : window.innerWidth;
    const availH = page ? rect.height : window.innerHeight;
    const originX = page ? rect.left : 0;
    const originY = page ? rect.top : 0;
    const w = Math.min(panelWidth, availW - 48);
    container.style.width     = `${w}px`;
    container.style.left      = `${originX + (availW - w) / 2}px`;
    container.style.top       = `${originY + availH / 2}px`;
    container.style.transform = "translateY(-50%)";
    container.style.maxHeight = `${availH * 0.7}px`;
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

  const header = document.createElement("div");
  header.className = "SpicyLyricsSettingsHeader";
  const titleEl = document.createElement("span");
  titleEl.textContent = title;
  const closeBtn = document.createElement("button");
  closeBtn.className = "SpicyLyricsSettingsHeaderClose";
  closeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

  const close = () => backdrop.remove();
  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", close);
  container.addEventListener("click", (e) => e.stopPropagation());

  header.appendChild(titleEl);
  header.appendChild(closeBtn);

  const scroll = document.createElement("div");
  scroll.className = "SpicyLyricsSettingsScroll";

  buildContent(scroll, close);

  container.appendChild(header);
  container.appendChild(scroll);
  backdrop.appendChild(container);
  document.body.appendChild(backdrop);

  return close;
};

// ─── UI helpers ───

const makeRow = (labelText, control) => {
  const row = document.createElement("div");
  row.className = "sl-settings-row";
  const lbl = document.createElement("span");
  lbl.className = "sl-settings-label";
  lbl.textContent = labelText;
  row.appendChild(lbl);
  row.appendChild(control);
  return row;
};

const makeToggle = () => {
  const wrap = document.createElement("label");
  wrap.className = "sl-toggle";
  const input = document.createElement("input");
  input.type = "checkbox";
  const knob = document.createElement("span");
  wrap.appendChild(input);
  wrap.appendChild(knob);
  return { wrap, input };
};

const makeInput = (placeholder) => {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "sl-input";
  input.placeholder = placeholder;
  return input;
};

const makeBtn = (text, modifiers = "") => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "sl-btn" + (modifiers ? " " + modifiers : "");
  btn.textContent = text;
  return btn;
};

const makeGroup = (text) => {
  const h = document.createElement("h3");
  h.className = "sl-settings-group";
  h.textContent = text;
  return h;
};

const makeBtnRow = () => {
  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:8px;justify-content:flex-end;padding:8px 6px 2px;";
  return row;
};

const reopenPanel = (close, next) => {
  close();
  setTimeout(next, 100);
};

// ─── Channel Management UI ───

const showChannelSwitcher = () => {
  showPanel("Build Channel", (scroll, close) => {
    const map = getCustomChannelAccessEnabled() ? getFullChannelMap() : CHANNEL_MAP;
    const allNames = Object.keys(map);
    const current = getCurrentChannel();

    const select = document.createElement("select");
    select.className = "sl-select";
    for (const name of allNames) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      opt.selected = name === current;
      select.appendChild(opt);
    }

    const buildChannelRow = makeRow("Build Channel", select);
    const buildChannelLabel = buildChannelRow.querySelector(".sl-settings-label");
    scroll.appendChild(buildChannelRow);

    attachSecretToggleGesture(buildChannelLabel, () => reopenPanel(close, showChannelSwitcher));

    const info = document.createElement("p");
    info.style.cssText = "margin:2px 8px 10px;font-size:0.72rem;color:rgba(255,255,255,0.35);line-height:1.5;";
    const updateInfo = () => {
      const hosts = map[select.value];
      if (!hosts) return (info.textContent = "");
      info.innerHTML = "";
      const h0 = document.createElement("strong"); h0.textContent = hosts[0];
      const h1 = document.createElement("strong"); h1.textContent = hosts[1];
      info.append(h0, " / ", h1);
      if (hosts[2]) {
        const fx = document.createElement("strong"); fx.textContent = hosts[2];
        info.append(" \u00b7 fixed: ", fx);
      }
    };
    updateInfo();
    select.addEventListener("change", updateInfo);
    scroll.appendChild(info);

    const btnRow = makeBtnRow();

    if (getCustomChannelAccessEnabled()) {
      const addBtn = makeBtn("Add Custom");
      addBtn.addEventListener("click", () => reopenPanel(close, showAddCustomChannel));
      btnRow.appendChild(addBtn);

      const removeBtn = makeBtn("Remove Custom", "sl-btn-danger");
      removeBtn.addEventListener("click", () => reopenPanel(close, showRemoveCustomChannel));
      btnRow.appendChild(removeBtn);
    }

    const applyBtn = makeBtn("Apply & Reload", "sl-btn-primary");
    applyBtn.addEventListener("click", () => { setCurrentChannel(select.value); close(); window.location.reload(); });
    btnRow.appendChild(applyBtn);

    scroll.appendChild(btnRow);
  });
};

const showAddCustomChannel = () => {
  showPanel("Add Channel", (scroll, close) => {
    scroll.appendChild(makeGroup("Channel Details"));

    const nameInput = makeInput("e.g. My-Test-Server");
    scroll.appendChild(makeRow("Channel Name", nameInput));

    const apiInput = makeInput(`Default: ${DEFAULT_API_HOST}`);
    scroll.appendChild(makeRow("API Host", apiInput));

    const storageInput = makeInput(`Default: ${DEFAULT_STORAGE_HOST}`);
    const storageRow = makeRow("Storage Host", storageInput);
    scroll.appendChild(storageRow);

    const { wrap: sameWrap, input: sameCb } = makeToggle();
    scroll.appendChild(makeRow("Use the same host for both API and Storage", sameWrap));
    sameCb.addEventListener("change", () => {
      storageRow.style.display = sameCb.checked ? "none" : "";
    });

    const { wrap: fixedToggleWrap, input: fixedCb } = makeToggle();
    scroll.appendChild(makeRow("Use a fixed version instead of fetching from /version", fixedToggleWrap));

    const fixedInput = makeInput("e.g. 5.19.11");
    const fixedRow = makeRow("Fixed Version", fixedInput);
    fixedRow.style.display = "none";
    scroll.appendChild(fixedRow);
    fixedCb.addEventListener("change", () => {
      fixedRow.style.display = fixedCb.checked ? "" : "none";
    });

    const note = document.createElement("p");
    note.style.cssText = "margin:4px 8px 10px;font-size:0.7rem;color:rgba(255,255,255,0.35);line-height:1.5;";
    note.innerHTML = `Leave API Host and Storage Host empty to use the defaults. To pull an older version, set a channel name, enable fixed version, and enter the version number.<br><br>The API host must serve <strong>/version</strong> as plain text. The Storage host must serve the bundle at <strong>/spicy-lyrics@{version}.mjs</strong> with CORS and <code>application/javascript</code>.`;
    scroll.appendChild(note);

    const btnRow = makeBtnRow();

    const cancelBtn = makeBtn("Cancel");
    cancelBtn.addEventListener("click", () => reopenPanel(close, showChannelSwitcher));
    btnRow.appendChild(cancelBtn);

    const saveBtn = makeBtn("Save Channel", "sl-btn-primary");
    saveBtn.addEventListener("click", () => {
      const name = nameInput.value.trim();
      const apiHostRaw = apiInput.value.trim();
      const storageHostRaw = sameCb.checked ? apiHostRaw : storageInput.value.trim();
      const fixedVersion = fixedCb.checked ? fixedInput.value.trim() : "";
      const apiHost = apiHostRaw || DEFAULT_API_HOST;
      const storageHost = storageHostRaw || DEFAULT_STORAGE_HOST;

      if (!name) { Spicetify.showNotification("Channel name is required", true); return; }
      if (fixedCb.checked && !fixedVersion) { Spicetify.showNotification("Fixed version is required when enabled", true); return; }
      if (BUILT_IN_CHANNELS.includes(name)) { Spicetify.showNotification("Cannot override built-in channels", true); return; }

      const channels = getCustomChannels();
      channels[name] = fixedVersion ? [apiHost, storageHost, fixedVersion] : [apiHost, storageHost];
      saveCustomChannels(channels);

      close();
      Spicetify.showNotification(`Channel "${name}" added`);
      setTimeout(showChannelSwitcher, 100);
    });
    btnRow.appendChild(saveBtn);

    scroll.appendChild(btnRow);
  });
};

const showRemoveCustomChannel = () => {
  const channels = getCustomChannels();
  const names = Object.keys(channels);

  if (names.length === 0) {
    Spicetify.showNotification("No custom channels to remove", true);
    setTimeout(showChannelSwitcher, 100);
    return;
  }

  showPanel("Manage Channels", (scroll, close) => {
    scroll.appendChild(makeGroup("Custom Channels"));

    for (const name of names) {
      const row = document.createElement("div");
      row.className = "sl-settings-row";

      const info = document.createElement("div");
      const nameEl = document.createElement("div");
      nameEl.style.cssText = "font-weight:600;font-size:0.875rem;color:rgba(255,255,255,0.85);";
      nameEl.textContent = name;
      const hostEl = document.createElement("div");
      hostEl.style.cssText = "font-size:0.72rem;color:rgba(255,255,255,0.4);margin-top:2px;";
      hostEl.textContent = `${channels[name][0]} / ${channels[name][1]}${channels[name][2] ? ` \u00b7 fixed: ${channels[name][2]}` : ""}`;
      info.appendChild(nameEl);
      info.appendChild(hostEl);

      const removeBtn = makeBtn("Remove", "sl-btn-danger");
      removeBtn.addEventListener("click", () => {
        delete channels[name];
        saveCustomChannels(channels);
        if (getCurrentChannel() === name) setCurrentChannel("Stable");
        close();
        Spicetify.showNotification(`Channel "${name}" removed`);
        setTimeout(showChannelSwitcher, 100);
      });

      row.appendChild(info);
      row.appendChild(removeBtn);
      scroll.appendChild(row);
    }

    const btnRow = makeBtnRow();
    const backBtn = makeBtn("Back");
    backBtn.addEventListener("click", () => reopenPanel(close, showChannelSwitcher));
    btnRow.appendChild(backBtn);
    scroll.appendChild(btnRow);
  });
};

// ─── Expose channel manager globally for the plugin to use ───

window._spicy_lyrics_channels = {
  showSwitcher: showChannelSwitcher,
  showAdd: showAddCustomChannel,
  showRemove: showRemoveCustomChannel,
  getCurrent: getCurrentChannel,
  getMap: getFullChannelMap,
};

// ─── Settings Page Injection ───
// Injects a "Build Channel" button at the top of the Spicetify settings page.
// Only active when the plugin failed to load or the loaded version is older
// than 5.20.0 (newer versions handle their own settings button placement).

const SETTINGS_SECTION_ID = "spicy-lyrics-entry-channel-settings";

const renderChannelSettings = () => {
  if (Spicetify.Platform.History.location.pathname !== "/preferences") return;
  if (pluginLoadedVersion && isVersionAtLeast(pluginLoadedVersion, PLUGIN_HANDLES_SETTINGS)) return;

  const tryInject = setInterval(() => {
    const sentinel = document.getElementById("desktop.settings.selectLanguage");
    if (!sentinel) return;
    clearInterval(tryInject);

    const container = document.querySelector(".main-view-container__scroll-node-child main div");
    if (!container || document.getElementById(SETTINGS_SECTION_ID)) return;

    const section = document.createElement("div");
    section.id = SETTINGS_SECTION_ID;
    section.className = "x-settings-section";
    section.style.cssText = "border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:12px 16px;margin-bottom:8px;";
    section.innerHTML = `
      <h2 class="x-settings-title main-shelf-title TypeElement-cello-textBase-type encore-text-body-medium-bold" style="color:#fff;padding-bottom:4px;">
        Spicy Lyrics - Build
      </h2>
      <div class="x-settings-row" style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;">
        <div class="x-settings-firstColumn">
          <label id="sl-entry-channel-label" class="x-settings-label" style="font-size:0.875rem;">Build Channel (Current: ${getCurrentChannel()})</label>
        </div>
        <div class="x-settings-secondColumn">
          <button id="sl-entry-manage-btn" type="button" class="sl-btn">Manage</button>
        </div>
      </div>
    `;
    container.insertBefore(section, container.firstChild);
    attachSecretToggleGesture(document.getElementById("sl-entry-channel-label"));
    document.getElementById("sl-entry-manage-btn").addEventListener("click", showChannelSwitcher);
  }, 100);
};

const registerChannelSettings = () => {
  const waitForHistory = setInterval(() => {
    if (Spicetify?.Platform?.History?.listen) {
      clearInterval(waitForHistory);
      Spicetify.Platform.History.listen(renderChannelSettings);
      renderChannelSettings();
    }
  }, 100);
};

// ─── Loading Logic ───

const getVersionFromHost = (host) =>
  fetch(`https://${host}/version`).then((response) => {
    if (!response.ok) throw new Error("Bad response");
    return response.text();
  });

const loadExtension = async (storageHost, version) => {
  window._spicy_lyrics_metadata = { LoadedVersion: version };
  return await import(`https://${storageHost}/spicy-lyrics@${encodeURIComponent(version)}.mjs`);
};

const createVersionChangeContent = (fromVersion, toVersion) => {
  const wrap = document.createElement("div");
  wrap.className = "update-card-wrapper slm sl-update-modal";
  wrap.style.fontFamily = "var(--encore-body-font-stack), SpicyLyrics, sans-serif";

  const isDowngrade = fromVersion ? compareVersions(toVersion, fromVersion) < 0 : false;

  const hero = document.createElement("div");
  hero.className = "sl-update-hero";

  const status = document.createElement("span");
  status.className = `sl-update-status ${isDowngrade ? "is-warning" : "is-success"}`;
  status.textContent = isDowngrade ? "Downgraded" : "Updated";
  hero.appendChild(status);

  const title = document.createElement("div");
  title.className = "sl-update-title";
  title.textContent = isDowngrade
    ? "Spicy Lyrics has been rolled back."
    : "Spicy Lyrics has been updated.";
  hero.appendChild(title);

  const copy = document.createElement("p");
  copy.className = "sl-update-copy";
  copy.textContent = isDowngrade
    ? "You are now running an older build. Check the release notes if you downgraded on purpose."
    : "Your install now includes the latest fixes and interface changes for this build.";
  hero.appendChild(copy);
  wrap.appendChild(hero);

  const section = document.createElement("div");
  section.className = "sl-update-section";

  const sectionLabel = document.createElement("span");
  sectionLabel.className = "sl-update-section-label";
  sectionLabel.textContent = "Version";
  section.appendChild(sectionLabel);

  const versionText = document.createElement("div");
  versionText.className = "sl-update-version";
  versionText.textContent = `${fromVersion ? `${fromVersion} → ` : ""}${toVersion || "Unknown"}`;
  section.appendChild(versionText);
  wrap.appendChild(section);

  const actions = document.createElement("div");
  actions.className = "sl-update-actions";
  actions.style.cssText = "display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(156px,1fr));";

  const releaseNotes = document.createElement("button");
  releaseNotes.type = "button";
  releaseNotes.className = "sl-btn sl-btn-primary sl-update-action";
  releaseNotes.style.cssText = "align-items:center;display:flex;font-family:var(--encore-body-font-stack), SpicyLyrics, sans-serif;font-size:.875rem;font-weight:600;justify-content:center;line-height:1.2;min-height:42px;padding:8px 16px;width:100%;";
  releaseNotes.textContent = "Release Notes";
  releaseNotes.addEventListener("click", () => {
    window.open(`https://github.com/Spikerko/spicy-lyrics/releases/tag/${toVersion}`, "_blank");
  });
  actions.appendChild(releaseNotes);

  const discord = document.createElement("button");
  discord.type = "button";
  discord.className = "sl-btn sl-update-action";
  discord.style.cssText = "align-items:center;display:flex;font-family:var(--encore-body-font-stack), SpicyLyrics, sans-serif;font-size:.875rem;font-weight:600;justify-content:center;line-height:1.2;min-height:42px;padding:8px 16px;width:100%;";
  discord.textContent = "Join Discord";
  discord.addEventListener("click", () => {
    window.open("https://discord.com/invite/uqgXU5wh8j", "_blank");
  });
  actions.appendChild(discord);

  wrap.appendChild(actions);
  return wrap;
};

const maybeShowVersionChangePopup = (fromVersion, toVersion) => {
  if (fromVersion === toVersion) return;
  Spicetify.PopupModal.display({
    title: "",
    content: createVersionChangeContent(fromVersion, toVersion),
  });
};

const makeErrorContent = (title, description) => {
  const div = document.createElement("div");
  div.style.cssText = "text-align:center;padding:24px 16px;";
  div.innerHTML = `
    <h2 style="margin:0 0 8px;font-size:1.5rem;font-weight:700;color:#fff;">${title}</h2>
    <p style="margin:0 0 20px;font-size:0.875rem;color:rgba(255,255,255,0.5);">${description}</p>
    <p style="margin:0 0 8px;font-size:0.875rem;color:rgba(255,255,255,0.7);">
      Check your connection and our
      <a href="https://status.spicylyrics.org" style="color:#fff;text-decoration:underline;">Status Page</a>.
    </p>
    <p style="margin:0 0 20px;font-size:0.8rem;color:rgba(255,255,255,0.4);">
      Still having issues?
      <a href="https://discord.com/invite/uqgXU5wh8j" style="color:rgba(255,255,255,0.6);text-decoration:underline;">Discord</a>
    </p>
  `;
  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex;justify-content:center;";
  const switchBtn = makeBtn("Switch Build Channel");
  switchBtn.addEventListener("click", showChannelSwitcher);
  btnRow.appendChild(switchBtn);
  div.appendChild(btnRow);
  return div;
};

const showVersionError = () => {
  showPanel("Spicy Lyrics", (scroll) => {
    scroll.appendChild(makeErrorContent(
      "Failed to load",
      "We couldn\u2019t connect after multiple attempts."
    ));
  });
};

const showImportError = () => {
  showPanel("Spicy Lyrics", (scroll) => {
    scroll.appendChild(makeErrorContent(
      "Failed to initialize",
      "The extension couldn\u2019t be loaded properly."
    ));
  });
};

const selectVersionFromChannel = () => {
  const channel = getCurrentChannel();
  const map = getFullChannelMap();
  const hosts = map[channel] ?? map.Stable;

  const fixedVersion = hosts.length >= 3 ? hosts[2] : null;
  console.log(`[Spicy Lyrics] [Entry] Channel: ${channel}, API: ${hosts[0]}, Storage: ${hosts[1]}${fixedVersion ? `, Fixed Version: ${fixedVersion}` : ""}`);
  return { apiHost: hosts[0], storageHost: hosts[1], fixedVersion };
};

const load = async () => {
  await new Promise((resolve) => {
    const interval = setInterval(() => {
      if (
        Spicetify !== undefined &&
        Spicetify.React !== undefined &&
        Spicetify.ReactDOM !== undefined &&
        Spicetify.ReactDOMServer !== undefined &&
        Spicetify.LocalStorage !== undefined
      ) {
        clearInterval(interval);
        resolve();
      }
    }, 10);
  });

  // Inject styles so the panel works regardless of which plugin version is loaded
  injectStyles();

  // Initialize the custom-channel gate before any UI tries to read it
  getCustomChannelAccessEnabled();

  // Register channel settings in the settings page (works even if plugin fails)
  registerChannelSettings();
  registerSettingsPageUnlockGesture();

  const { apiHost, storageHost, fixedVersion } = selectVersionFromChannel();
  let lastError;
  let version;
  const previousVersion = lsGet("fromVersion") || "";

  if (fixedVersion) {
    version = fixedVersion;
  } else {
    for (let i = 0; i < 10; i++) {
      try {
        version = await getVersionFromHost(apiHost);
        break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!version) {
      console.error(`[Spicy Lyrics] [Entry] Failed to fetch version after 10 attempts:`, lastError);
      showVersionError();
      return;
    }
  }

  for (let i = 0; i < 3; i++) {
    try {
      lsSet("fromVersion", version);
      await loadExtension(storageHost, version);
      pluginLoadedVersion = version;
      maybeShowVersionChangePopup(previousVersion, version);
      return;
    } catch (err) {
      lastError = err;
      lsSet("fromVersion", previousVersion);
    }
  }

  console.error(`[Spicy Lyrics] [Entry] Failed to import extension after 3 attempts:`, lastError);
  showImportError();
};

load();
