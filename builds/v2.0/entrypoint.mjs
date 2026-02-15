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

// ─── Styles (Spotify-like design language) ───

const INPUT_STYLE = "padding:8px 12px;border-radius:4px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.1);color:inherit;font-size:0.875rem;width:100%;box-sizing:border-box;color-scheme:dark;";
const SELECT_STYLE = "padding:8px 12px;border-radius:4px;border:1px solid rgba(255,255,255,0.2);background:#282828;color:#fff;font-size:0.875rem;width:100%;box-sizing:border-box;";
const OPTION_STYLE = "background:#282828;color:#fff;";
const BTN_PRIMARY = "padding:8px 24px;border-radius:500px;border:none;background:#fff;color:#000;font-weight:700;cursor:pointer;font-size:0.875rem;";
const BTN_SECONDARY = "padding:8px 24px;border-radius:500px;border:1px solid rgba(255,255,255,0.3);background:transparent;color:#fff;font-weight:700;cursor:pointer;font-size:0.875rem;";
const BTN_DANGER = "padding:8px 24px;border-radius:500px;border:1px solid rgba(231,76,60,0.5);background:transparent;color:#e74c3c;font-weight:700;cursor:pointer;font-size:0.875rem;";
const BTN_DANGER_SMALL = "padding:6px 16px;border-radius:500px;border:1px solid rgba(231,76,60,0.5);background:transparent;color:#e74c3c;font-weight:600;cursor:pointer;font-size:0.8rem;";
const CHECKBOX_STYLE = "width:16px;height:16px;cursor:pointer;accent-color:#1db954;";

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

// ─── Channel Management UI ───

const showChannelSwitcher = () => {
  const map = getFullChannelMap();
  const allNames = Object.keys(map);
  const current = getCurrentChannel();

  const div = document.createElement("div");
  div.style.cssText = "display:flex;flex-direction:column;gap:16px;padding:8px 0;";

  // Channel select
  const selectLabel = document.createElement("label");
  selectLabel.style.cssText = "display:flex;flex-direction:column;gap:6px;";
  selectLabel.innerHTML = `<span style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:rgba(255,255,255,0.6);">Build Channel</span>`;
  const select = document.createElement("select");
  select.style.cssText = SELECT_STYLE;
  for (const name of allNames) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    opt.selected = name === current;
    opt.style.cssText = OPTION_STYLE;
    select.appendChild(opt);
  }
  selectLabel.appendChild(select);
  div.appendChild(selectLabel);

  // Channel info (updates on selection change)
  const info = document.createElement("p");
  info.style.cssText = "margin:0;font-size:0.75rem;color:rgba(255,255,255,0.4);line-height:1.4;";
  const updateInfo = () => {
    const hosts = map[select.value];
    if (hosts) {
      info.textContent = "";
      const h0 = document.createElement("strong"); h0.textContent = hosts[0];
      const h1 = document.createElement("strong"); h1.textContent = hosts[1];
      info.append(h0, " / ", h1);
      if (hosts[2]) { const fx = document.createElement("strong"); fx.textContent = hosts[2]; info.append(" \u00b7 fixed: ", fx); }
    }
  };
  updateInfo();
  select.addEventListener("change", updateInfo);
  div.appendChild(info);

  // Buttons row
  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex;gap:8px;justify-content:flex-end;";

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.textContent = "Add Custom";
  addBtn.style.cssText = BTN_SECONDARY;
  addBtn.addEventListener("click", () => {
    Spicetify.PopupModal.hide();
    setTimeout(showAddCustomChannel, 100);
  });
  btnRow.appendChild(addBtn);

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.textContent = "Remove Custom";
  removeBtn.style.cssText = BTN_DANGER;
  removeBtn.addEventListener("click", () => {
    Spicetify.PopupModal.hide();
    setTimeout(showRemoveCustomChannel, 100);
  });
  btnRow.appendChild(removeBtn);

  const applyBtn = document.createElement("button");
  applyBtn.type = "button";
  applyBtn.textContent = "Apply & Reload";
  applyBtn.style.cssText = BTN_PRIMARY;
  applyBtn.addEventListener("click", () => {
    setCurrentChannel(select.value);
    Spicetify.PopupModal.hide();
    window.location.reload();
  });
  btnRow.appendChild(applyBtn);

  div.appendChild(btnRow);

  Spicetify.PopupModal.display({
    title: "Build Channel",
    content: div,
    isLarge: true,
  });
};

const showAddCustomChannel = () => {
  const div = document.createElement("div");
  div.style.cssText = "display:flex;flex-direction:column;gap:14px;padding:8px 0;";

  const labelStyle = "display:flex;flex-direction:column;gap:4px;";
  const spanStyle = "font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:rgba(255,255,255,0.6);";

  div.innerHTML = `
    <label style="${labelStyle}">
      <span style="${spanStyle}">Channel Name</span>
      <input id="sl-cc-name" type="text" placeholder="e.g. My-Test-Server" style="${INPUT_STYLE}" />
    </label>
    <label style="${labelStyle}">
      <span style="${spanStyle}">API Host</span>
      <input id="sl-cc-api" type="text" placeholder="Default: ${DEFAULT_API_HOST}" style="${INPUT_STYLE}" />
    </label>
    <label id="sl-cc-storage-label" style="${labelStyle}">
      <span style="${spanStyle}">Storage Host</span>
      <input id="sl-cc-storage" type="text" placeholder="Default: ${DEFAULT_STORAGE_HOST}" style="${INPUT_STYLE}" />
    </label>
    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
      <input id="sl-cc-same-host" type="checkbox" style="${CHECKBOX_STYLE}" />
      <span style="font-size:0.875rem;">Use the same host for both API and Storage</span>
    </label>
    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
      <input id="sl-cc-fixed-version-toggle" type="checkbox" style="${CHECKBOX_STYLE}" />
      <span style="font-size:0.875rem;">Use a fixed version instead of fetching from /version</span>
    </label>
    <label id="sl-cc-fixed-version-label" style="display:none;flex-direction:column;gap:4px;">
      <span style="${spanStyle}">Fixed Version</span>
      <input id="sl-cc-fixed-version" type="text" placeholder="e.g. 5.19.11" style="${INPUT_STYLE}" />
    </label>
    <p style="margin:0;font-size:0.7rem;color:rgba(255,255,255,0.35);line-height:1.5;">
      Leave API Host and Storage Host empty to use the defaults.
      To pull an older version, just set a channel name, enable fixed version, and enter the version number.
      <br/><br/>
      Custom hosts: the API host must serve <strong>/version</strong> as plain text (not required with fixed version).
      The Storage host must serve the bundle at <strong>/spicy-lyrics@{version}.mjs</strong> with CORS and <strong>application/javascript</strong> content type.
    </p>
  `;

  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex;gap:8px;justify-content:flex-end;padding-top:4px;";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.textContent = "Cancel";
  cancelBtn.style.cssText = BTN_SECONDARY;
  cancelBtn.addEventListener("click", () => {
    Spicetify.PopupModal.hide();
    setTimeout(showChannelSwitcher, 100);
  });
  btnRow.appendChild(cancelBtn);

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.textContent = "Save Channel";
  saveBtn.style.cssText = BTN_PRIMARY;
  btnRow.appendChild(saveBtn);

  div.appendChild(btnRow);

  Spicetify.PopupModal.display({
    title: "Add Channel",
    content: div,
    isLarge: true,
  });

  const sameHostCb = div.querySelector("#sl-cc-same-host");
  const storageLabel = div.querySelector("#sl-cc-storage-label");
  sameHostCb.addEventListener("change", () => {
    storageLabel.style.display = sameHostCb.checked ? "none" : "flex";
  });

  const fixedCb = div.querySelector("#sl-cc-fixed-version-toggle");
  const fixedLabel = div.querySelector("#sl-cc-fixed-version-label");
  fixedCb.addEventListener("change", () => {
    fixedLabel.style.display = fixedCb.checked ? "flex" : "none";
  });

  saveBtn.addEventListener("click", () => {
    const name = div.querySelector("#sl-cc-name").value.trim();
    const apiHostRaw = div.querySelector("#sl-cc-api").value.trim();
    const storageHostRaw = sameHostCb.checked
      ? apiHostRaw
      : div.querySelector("#sl-cc-storage").value.trim();
    const fixedVersion = fixedCb.checked
      ? div.querySelector("#sl-cc-fixed-version").value.trim()
      : "";

    // Default empty hosts to built-in values
    const apiHost = apiHostRaw || DEFAULT_API_HOST;
    const storageHost = storageHostRaw || DEFAULT_STORAGE_HOST;

    if (!name) {
      Spicetify.showNotification("Channel name is required", true);
      return;
    }
    if (fixedCb.checked && !fixedVersion) {
      Spicetify.showNotification("Fixed version is required when enabled", true);
      return;
    }
    if (BUILT_IN_CHANNELS.includes(name)) {
      Spicetify.showNotification("Cannot override built-in channels", true);
      return;
    }

    const channels = getCustomChannels();
    channels[name] = fixedVersion
      ? [apiHost, storageHost, fixedVersion]
      : [apiHost, storageHost];
    saveCustomChannels(channels);

    Spicetify.PopupModal.hide();
    Spicetify.showNotification(`Channel "${name}" added`);
    setTimeout(showChannelSwitcher, 100);
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

  const div = document.createElement("div");
  div.style.cssText = "display:flex;flex-direction:column;gap:8px;padding:8px 0;";

  for (const name of names) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-radius:6px;background:rgba(255,255,255,0.04);";
    const rowInfo = document.createElement("div");
    const nameDiv = document.createElement("div");
    nameDiv.style.cssText = "font-weight:600;font-size:0.875rem;";
    nameDiv.textContent = name;
    const hostDiv = document.createElement("div");
    hostDiv.style.cssText = "font-size:0.75rem;color:rgba(255,255,255,0.4);margin-top:2px;";
    hostDiv.textContent = `${channels[name][0]} / ${channels[name][1]}${channels[name][2] ? ` \u00b7 fixed: ${channels[name][2]}` : ""}`;
    rowInfo.append(nameDiv, hostDiv);
    row.appendChild(rowInfo);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Remove";
    btn.style.cssText = BTN_DANGER_SMALL;
    btn.addEventListener("click", () => {
      delete channels[name];
      saveCustomChannels(channels);
      if (getCurrentChannel() === name) {
        setCurrentChannel("Stable");
      }
      Spicetify.PopupModal.hide();
      Spicetify.showNotification(`Channel "${name}" removed`);
      setTimeout(showChannelSwitcher, 100);
    });
    row.appendChild(btn);
    div.appendChild(row);
  }

  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex;justify-content:flex-end;padding-top:8px;";
  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.textContent = "Back";
  backBtn.style.cssText = BTN_SECONDARY;
  backBtn.addEventListener("click", () => {
    Spicetify.PopupModal.hide();
    setTimeout(showChannelSwitcher, 100);
  });
  btnRow.appendChild(backBtn);
  div.appendChild(btnRow);

  Spicetify.PopupModal.display({
    title: "Remove Channel",
    content: div,
    isLarge: false,
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
          <button id="sl-entry-manage-btn" type="button" class="x-settings-button"
            data-encore-id="buttonSecondary"
            style="padding:6px 16px;border-radius:500px;border:1px solid rgba(255,255,255,0.3);background:transparent;color:#fff;font-weight:700;cursor:pointer;font-size:0.8rem;">
            Manage
          </button>
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
  div.style.cssText = "text-align:center;padding:24px 0;";
  div.innerHTML = `
    <h2 style="margin:0 0 8px;font-size:1.5rem;font-weight:700;">${title}</h2>
    <p style="margin:0 0 20px;font-size:0.875rem;color:rgba(255,255,255,0.5);">${description}</p>
    <p style="margin:0 0 8px;font-size:0.875rem;color:rgba(255,255,255,0.7);">
      Check your connection and our
      <a href="https://status.spicylyrics.org" style="color:#fff;text-decoration:underline;">Status Page</a>.
    </p>
    <p style="margin:0;font-size:0.8rem;color:rgba(255,255,255,0.4);">
      Still having issues?
      <a href="https://discord.com/invite/uqgXU5wh8j" style="color:rgba(255,255,255,0.6);text-decoration:underline;">Discord</a>
    </p>
  `;
  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex;justify-content:center;padding-top:20px;";
  const switchBtn = document.createElement("button");
  switchBtn.type = "button";
  switchBtn.textContent = "Switch Build Channel";
  switchBtn.style.cssText = BTN_SECONDARY;
  switchBtn.addEventListener("click", () => {
    Spicetify.PopupModal.hide();
    setTimeout(showChannelSwitcher, 100);
  });
  btnRow.appendChild(switchBtn);
  div.appendChild(btnRow);
  return div;
};

const showVersionError = () => {
  Spicetify.PopupModal.display({
    title: "",
    content: makeErrorContent(
      "Spicy Lyrics failed to load",
      "We couldn\u2019t connect after multiple attempts."
    ),
    isLarge: true,
  });
};

const showImportError = () => {
  Spicetify.PopupModal.display({
    title: "",
    content: makeErrorContent(
      "Spicy Lyrics failed to initialize",
      "The extension couldn\u2019t be loaded properly."
    ),
    isLarge: true,
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
        Spicetify.PopupModal !== undefined &&
        Spicetify.LocalStorage !== undefined
      ) {
        clearInterval(interval);
        resolve();
      }
    }, 10);
  });

  // Check if the plugin loaded directly (e.g. dev build).
  // The dev build writes spicy-lyrics.mjs which loads via WebSocket — if that script
  // exists alongside the entrypoint, wait for it to set the loaded flag.
  if (window._spicy_lyrics_loaded) {
    console.log("[Spicy Lyrics] [Entry] Plugin already loaded (dev build detected), skipping entrypoint.");
    return;
  }

  const devExtensionExists = document.querySelector('script[src*="spicy-lyrics.mjs"]:not([src*="entrypoint"])');
  if (devExtensionExists) {
    const devDetected = await new Promise((resolve) => {
      let checks = 0;
      const iv = setInterval(() => {
        if (window._spicy_lyrics_loaded) { clearInterval(iv); resolve(true); }
        else if (++checks >= 300) { clearInterval(iv); resolve(false); } // 3s max
      }, 10);
    });

    if (devDetected) {
      console.log("[Spicy Lyrics] [Entry] Plugin already loaded (dev build detected), skipping entrypoint.");
      return;
    }
  }

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
