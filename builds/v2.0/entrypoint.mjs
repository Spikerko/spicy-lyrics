// Built-in channel → [apiHost, storageHost, fixedVersion?] map
const CHANNEL_MAP = {
  Stable: ["api.spicylyrics.org", "public.storage.spicylyrics.org"],
  Beta:   ["api.spicylyrics.org", "public.storage.spicylyrics.org"],
};

const BUILT_IN_CHANNELS = Object.keys(CHANNEL_MAP);
const DEFAULT_API_HOST = CHANNEL_MAP.Stable[0];
const DEFAULT_STORAGE_HOST = CHANNEL_MAP.Stable[1];

const LS_PREFIX = "SpicyLyrics-";
const lsGet = (key) => Spicetify.LocalStorage.get(`${LS_PREFIX}${key}`);
const lsSet = (key, value) => Spicetify.LocalStorage.set(`${LS_PREFIX}${key}`, value);

// ─── Version Helpers ───

const parseVersion = (str) => {
  const parts = (str || "").split(".").map(Number);
  return { Major: parts[0] || 0, Minor: parts[1] || 0, Patch: parts[2] || 0 };
};

const isVersionAtLeast = (version, minimum) => {
  const v = parseVersion(version);
  const m = parseVersion(minimum);
  if (v.Major !== m.Major) return v.Major > m.Major;
  if (v.Minor !== m.Minor) return v.Minor > m.Minor;
  return v.Patch >= m.Patch;
};

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

// ─── Channel Management UI ───

const showChannelSwitcher = () => {
  showPanel("Build Channel", (scroll, close) => {
    const map = getFullChannelMap();
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
    scroll.appendChild(makeRow("Build Channel", select));

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

    const addBtn = makeBtn("Add Custom");
    addBtn.addEventListener("click", () => { close(); setTimeout(showAddCustomChannel, 100); });
    btnRow.appendChild(addBtn);

    const removeBtn = makeBtn("Remove Custom", "sl-btn-danger");
    removeBtn.addEventListener("click", () => { close(); setTimeout(showRemoveCustomChannel, 100); });
    btnRow.appendChild(removeBtn);

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
    cancelBtn.addEventListener("click", () => { close(); setTimeout(showChannelSwitcher, 100); });
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
    backBtn.addEventListener("click", () => { close(); setTimeout(showChannelSwitcher, 100); });
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
          <label class="x-settings-label" style="font-size:0.875rem;">Build Channel (Current: ${getCurrentChannel()})</label>
        </div>
        <div class="x-settings-secondColumn">
          <button id="sl-entry-manage-btn" type="button" class="sl-btn">Manage</button>
        </div>
      </div>
    `;
    container.insertBefore(section, container.firstChild);
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

  // Register channel settings in the settings page (works even if plugin fails)
  registerChannelSettings();

  const { apiHost, storageHost, fixedVersion } = selectVersionFromChannel();
  let lastError;
  let version;

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
      await loadExtension(storageHost, version);
      pluginLoadedVersion = version;
      return;
    } catch (err) {
      lastError = err;
    }
  }

  console.error(`[Spicy Lyrics] [Entry] Failed to import extension after 3 attempts:`, lastError);
  showImportError();
};

load();
