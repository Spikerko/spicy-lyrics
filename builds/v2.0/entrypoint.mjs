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
  const map = getFullChannelMap();
  const allNames = Object.keys(map);
  const current = getCurrentChannel();

  const wrap = document.createElement("div");
  wrap.style.cssText = "padding:4px 0 2px;";

  // Channel select row
  const select = document.createElement("select");
  select.className = "sl-select";
  for (const name of allNames) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    opt.selected = name === current;
    select.appendChild(opt);
  }
  wrap.appendChild(makeRow("Build Channel", select));

  // Host info
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
  wrap.appendChild(info);

  // Buttons
  const btnRow = makeBtnRow();

  const addBtn = makeBtn("Add Custom");
  addBtn.addEventListener("click", () => { Spicetify.PopupModal.hide(); setTimeout(showAddCustomChannel, 100); });
  btnRow.appendChild(addBtn);

  const removeBtn = makeBtn("Remove Custom", "sl-btn-danger");
  removeBtn.addEventListener("click", () => { Spicetify.PopupModal.hide(); setTimeout(showRemoveCustomChannel, 100); });
  btnRow.appendChild(removeBtn);

  const applyBtn = makeBtn("Apply & Reload", "sl-btn-primary");
  applyBtn.addEventListener("click", () => { setCurrentChannel(select.value); Spicetify.PopupModal.hide(); window.location.reload(); });
  btnRow.appendChild(applyBtn);

  wrap.appendChild(btnRow);

  Spicetify.PopupModal.display({ title: "Build Channel", content: wrap, isLarge: true });
};

const showAddCustomChannel = () => {
  const wrap = document.createElement("div");
  wrap.style.cssText = "padding:4px 0 2px;";

  wrap.appendChild(makeGroup("Channel Details"));

  const nameInput = makeInput("e.g. My-Test-Server");
  wrap.appendChild(makeRow("Channel Name", nameInput));

  const apiInput = makeInput(`Default: ${DEFAULT_API_HOST}`);
  wrap.appendChild(makeRow("API Host", apiInput));

  const storageInput = makeInput(`Default: ${DEFAULT_STORAGE_HOST}`);
  const storageRow = makeRow("Storage Host", storageInput);
  wrap.appendChild(storageRow);

  const { wrap: sameWrap, input: sameCb } = makeToggle();
  wrap.appendChild(makeRow("Use the same host for both API and Storage", sameWrap));
  sameCb.addEventListener("change", () => {
    storageRow.style.display = sameCb.checked ? "none" : "";
  });

  const { wrap: fixedToggleWrap, input: fixedCb } = makeToggle();
  wrap.appendChild(makeRow("Use a fixed version instead of fetching from /version", fixedToggleWrap));

  const fixedInput = makeInput("e.g. 5.19.11");
  const fixedRow = makeRow("Fixed Version", fixedInput);
  fixedRow.style.display = "none";
  wrap.appendChild(fixedRow);
  fixedCb.addEventListener("change", () => {
    fixedRow.style.display = fixedCb.checked ? "" : "none";
  });

  const note = document.createElement("p");
  note.style.cssText = "margin:4px 8px 10px;font-size:0.7rem;color:rgba(255,255,255,0.35);line-height:1.5;";
  note.innerHTML = `Leave API Host and Storage Host empty to use the defaults. To pull an older version, set a channel name, enable fixed version, and enter the version number.<br><br>The API host must serve <strong>/version</strong> as plain text. The Storage host must serve the bundle at <strong>/spicy-lyrics@{version}.mjs</strong> with CORS and <code>application/javascript</code>.`;
  wrap.appendChild(note);

  const btnRow = makeBtnRow();

  const cancelBtn = makeBtn("Cancel");
  cancelBtn.addEventListener("click", () => { Spicetify.PopupModal.hide(); setTimeout(showChannelSwitcher, 100); });
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

    Spicetify.PopupModal.hide();
    Spicetify.showNotification(`Channel "${name}" added`);
    setTimeout(showChannelSwitcher, 100);
  });
  btnRow.appendChild(saveBtn);

  wrap.appendChild(btnRow);

  Spicetify.PopupModal.display({ title: "Add Channel", content: wrap, isLarge: true });
};

const showRemoveCustomChannel = () => {
  const channels = getCustomChannels();
  const names = Object.keys(channels);

  if (names.length === 0) {
    Spicetify.showNotification("No custom channels to remove", true);
    setTimeout(showChannelSwitcher, 100);
    return;
  }

  const wrap = document.createElement("div");
  wrap.style.cssText = "padding:4px 0 2px;";

  wrap.appendChild(makeGroup("Custom Channels"));

  for (const name of names) {
    const row = document.createElement("div");
    row.className = "sl-settings-row";

    const info = document.createElement("div");
    const nameEl = document.createElement("div");
    nameEl.style.cssText = "font-weight:600;font-size:0.875rem;";
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
      Spicetify.PopupModal.hide();
      Spicetify.showNotification(`Channel "${name}" removed`);
      setTimeout(showChannelSwitcher, 100);
    });

    row.appendChild(info);
    row.appendChild(removeBtn);
    wrap.appendChild(row);
  }

  const btnRow = makeBtnRow();
  const backBtn = makeBtn("Back");
  backBtn.addEventListener("click", () => { Spicetify.PopupModal.hide(); setTimeout(showChannelSwitcher, 100); });
  btnRow.appendChild(backBtn);
  wrap.appendChild(btnRow);

  Spicetify.PopupModal.display({ title: "Manage Channels", content: wrap, isLarge: false });
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
  const switchBtn = makeBtn("Switch Build Channel");
  switchBtn.addEventListener("click", () => { Spicetify.PopupModal.hide(); setTimeout(showChannelSwitcher, 100); });
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
