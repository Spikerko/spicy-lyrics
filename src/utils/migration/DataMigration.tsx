import React from "react";
import { flushSync } from "react-dom";
import ReactDOM from "react-dom/client";
import { PopupModal } from "../../components/Modal.ts";
import { SETTINGS_KEY } from "../stores.ts";
import { UI_STATE_KEY } from "../uiState.ts";

const OLD_PREFIX = "SpicyLyrics-";

const OLD_SETTINGS_KEYS = [
  "staticBackground",
  "staticBackgroundType",
  "simpleLyricsMode",
  "simpleLyricsModeRenderingType",
  "minimalLyricsMode",
  "skip-spicy-font",
  "old-style-font",
  "show_topbar_notifications",
  "hide_npv_bg",
  "lockedMediaBox",
  "viewControlsPosition",
  "settingsOnTop",
  "developerMode",
];

const OLD_UI_STATE_KEYS = [
  "sidebar-status",
  "IsNowBarOpen",
  "NowBarSide",
  "ForceCompactMode",
  "romanization",
  "fromVersion",
  "lastFetchedUri",
  "previous-version",
];

function readOld(key: string): any {
  const raw = Spicetify.LocalStorage.get(`${OLD_PREFIX}${key}`);
  if (raw === null || raw === undefined) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function hasAnyOldKey(): boolean {
  for (const key of OLD_SETTINGS_KEYS) {
    if (Spicetify.LocalStorage.get(`${OLD_PREFIX}${key}`) !== null) return true;
  }
  for (const key of OLD_UI_STATE_KEYS) {
    if (Spicetify.LocalStorage.get(`${OLD_PREFIX}${key}`) !== null) return true;
  }
  if (Spicetify.LocalStorage.get(`${OLD_PREFIX}disablePopupLyrics`) !== null || Spicetify.LocalStorage.get(`${OLD_PREFIX}devMode`) !== null) return true;
  return false;
}

function migrateData() {
  const settings: Record<string, any> = {};
  for (const key of OLD_SETTINGS_KEYS) {
    const val = readOld(key);
    if (val !== undefined) settings[key] = val;
  }
  // popupLyricsAllowed is the inverse of the old disablePopupLyrics key
  const disablePopup = readOld("disablePopupLyrics");
  if (disablePopup !== undefined) {
    settings["popupLyricsAllowed"] = !disablePopup;
  }

  // Map old "devMode" to new "ttmlMakerMode" if present
  const oldDevMode = readOld("devMode");
  if (oldDevMode !== undefined) {
    settings["ttmlMakerMode"] = oldDevMode;
  }

  const uiState: Record<string, any> = {};
  for (const key of OLD_UI_STATE_KEYS) {
    const val = readOld(key);
    if (val !== undefined) uiState[key] = val;
  }

  Spicetify.LocalStorage.set(SETTINGS_KEY, JSON.stringify(settings));
  Spicetify.LocalStorage.set(UI_STATE_KEY, JSON.stringify(uiState));
}

/**
 * Returns true if the migration modal should be shown.
 * Also handles fresh installs by writing empty blobs so this check only runs once.
 */
export function needsMigration(): boolean {
  const hasNewKey = Spicetify.LocalStorage.get(SETTINGS_KEY) !== null;
  if (hasNewKey) return false;

  if (!hasAnyOldKey()) {
    // Fresh install — write empty blobs to mark as initialized
    Spicetify.LocalStorage.set(SETTINGS_KEY, JSON.stringify({}));
    Spicetify.LocalStorage.set(UI_STATE_KEY, JSON.stringify({}));
    return false;
  }

  return true;
}

export function showMigrationModal() {
  const div = document.createElement("div");
  const reactRoot = ReactDOM.createRoot(div);

  function renderMigrate() {
    flushSync(() => {
      reactRoot.render(
        <div className="update-card-wrapper slm migration-card">
          <div className="udc-icon-wrap">
            <svg className="udc-migrate-svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <ellipse cx="12" cy="5" rx="8" ry="3" stroke="currentColor" strokeWidth="1.75"/>
              <path d="M4 5v5c0 1.657 3.582 3 8 3s8-1.343 8-3V5" stroke="currentColor" strokeWidth="1.75"/>
              <path d="M4 10v5c0 1.657 3.582 3 8 3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
              <path d="M16 17l2.5 2.5L22 16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>

          <h2 className="uc-title">Settings Migration Required</h2>
          <p className="uc-subtitle udc-desc">
            Spicy Lyrics has updated its storage format. Your existing settings need to be migrated before you can continue. This only happens once.
          </p>

          <div className="uc-divider" />

          <button
            className="btn-update"
            onClick={() => {
              migrateData();
              renderSuccess();
              setTimeout(() => location.reload(), 1000);
            }}
          >
            Migrate Settings
          </button>
        </div>
      );
    });
  }

  function renderSuccess() {
    flushSync(() => {
      reactRoot.render(
        <div className="update-card-wrapper slm migration-card">
          <div className="udc-icon-wrap">
            <svg className="udc-migrate-svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ color: "#1db954" }}>
              <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>

          <h2 className="uc-title">Migration Complete</h2>
          <p className="uc-subtitle udc-desc">
            Your settings have been migrated successfully. Reloading Spotify...
          </p>
        </div>
      );
    });
  }

  renderMigrate();

  PopupModal.display({
    title: "Spicy Lyrics",
    content: div,
    onClose: () => reactRoot.unmount(),
    closeBtn: false,
    closeOnOutsideClick: false,
  });
}
