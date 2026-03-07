// deno-lint-ignore-file no-case-declarations
import { Query } from "../../utils/API/Query.ts";
import fetchLyrics, { UserTTMLStore, SessionTTMLStore, getSongKey } from "../../utils/Lyrics/fetchLyrics.ts";
import ApplyLyrics from "../../utils/Lyrics/Global/Applyer.ts";
import { ProcessLyrics } from "../../utils/Lyrics/ProcessLyrics.ts";
import storage from "../../utils/storage.ts";
import Global from "../Global/Global.ts";
import { SpotifyPlayer } from "../Global/SpotifyPlayer.ts";
import { ShowNotification } from "../Pages/PageView.ts";

type TTMLMode = "temp" | "session" | "persist";

function resetTTML() {
  const songKey = getSongKey(SpotifyPlayer.GetUri() ?? "");
  storage.set("currentLyricsData", "");
  if (songKey) {
    SessionTTMLStore.delete(songKey);
    if (UserTTMLStore) UserTTMLStore.RemoveItem(songKey).catch(() => {});
  }
  ShowNotification("TTML has been reset.", "info", 5000);
  setTimeout(() => {
    fetchLyrics(SpotifyPlayer.GetUri() ?? "")
      .then(ApplyLyrics)
      .catch((err) => {
        ShowNotification("Error applying lyrics", "error", 5000);
        console.error("Error applying lyrics:", err);
      });
  }, 25);
}

function uploadTTML(mode: TTMLMode) {
  const labels: Record<TTMLMode, string> = {
    temp:    "Lyrics Applied Temporarily! (will reset on song change)",
    session: "Lyrics Applied for Session!",
    persist: "Lyrics Saved Persistently!",
  };

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".ttml";
  fileInput.onchange = (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const ttml = e.target?.result as string;

      ShowNotification("Found TTML, Parsing...", "info", 5000);
      const result = await ParseTTML(ttml);
      if (!result?.Result) {
        ShowNotification("Error parsing TTML", "error", 5000);
        return;
      }

      const data = { ...result.Result, id: SpotifyPlayer.GetId(), userUploaded: true };
      await ProcessLyrics(data);

      const songKey = getSongKey(SpotifyPlayer.GetUri() ?? "");
      if (songKey) {
        if (mode === "session") {
          SessionTTMLStore.set(songKey, data);
        } else if (mode === "persist" && UserTTMLStore) {
          await UserTTMLStore.SetItem(songKey, data);
        }
      }

      storage.set("currentLyricsData", JSON.stringify(data));
      setTimeout(() => {
        fetchLyrics(SpotifyPlayer.GetUri() ?? "")
          .then((lyrics) => {
            ApplyLyrics(lyrics);
            ShowNotification(labels[mode], "success", 5000);
          })
          .catch((err) => {
            ShowNotification("Error applying lyrics", "error", 5000);
            console.error("Error applying lyrics:", err);
          });
      }, 25);
    };
    reader.onerror = (e) => {
      console.error("Error reading file:", e.target?.error);
      ShowNotification("Error reading TTML file.", "error", 5000);
    };
    reader.readAsText(file);
  };
  fileInput.click();
}

function showConfirm(message: string, onConfirm: () => void) {
  const page = document.querySelector("#SpicyLyricsPage");
  const rect = page?.getBoundingClientRect();

  const overlay = document.createElement("div");
  overlay.style.cssText = [
    "position:fixed",
    `left:${rect ? rect.left : 0}px`,
    `top:${rect ? rect.top : 0}px`,
    `width:${rect ? rect.width : window.innerWidth}px`,
    `height:${rect ? rect.height : window.innerHeight}px`,
    "z-index:10000",
    "display:flex", "align-items:center", "justify-content:center",
    "background:rgba(0,0,0,0.5)",
  ].join(";");

  const panel = document.createElement("div");
  panel.style.cssText = [
    "background:#0e0e0e",
    "border:1px solid rgba(255,255,255,0.14)",
    "border-radius:10px", "padding:20px 24px",
    "width:min(360px,calc(100% - 80px))",
    "box-shadow:0 8px 32px rgba(0,0,0,0.7)",
    "display:flex", "flex-direction:column", "gap:16px",
  ].join(";");

  const msg = document.createElement("p");
  msg.style.cssText = "margin:0;font-size:0.875rem;color:rgba(255,255,255,0.85);line-height:1.5;";
  msg.textContent = message;

  const buttons = document.createElement("div");
  buttons.style.cssText = "display:flex;justify-content:flex-end;gap:8px;";

  const cancelBtn = document.createElement("button");
  cancelBtn.style.cssText = "background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.7);border:1px solid rgba(255,255,255,0.12);border-radius:6px;padding:6px 16px;font-size:0.8rem;cursor:pointer;";
  cancelBtn.textContent = "Cancel";

  const confirmBtn = document.createElement("button");
  confirmBtn.style.cssText = "background:rgba(200,40,40,0.85);color:#fff;border:none;border-radius:6px;padding:6px 16px;font-size:0.8rem;cursor:pointer;";
  confirmBtn.textContent = "Clear";

  const close = () => overlay.remove();
  cancelBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  confirmBtn.addEventListener("click", () => { close(); onConfirm(); });

  buttons.appendChild(cancelBtn);
  buttons.appendChild(confirmBtn);
  panel.appendChild(msg);
  panel.appendChild(buttons);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
}

function showDatabaseOverlay(title: string, buildContent: (scroll: HTMLElement) => void) {
  document.querySelector(".SpicyLyricsTTMLDatabaseOverlay")?.remove();

  const overlay = document.createElement("div");
  overlay.className = "SpicyLyricsSettingsOverlay SpicyLyricsTTMLDatabaseOverlay";
  overlay.addEventListener("click", () => overlay.remove());

  const container = document.createElement("div");
  container.className = "SpicyLyricsSettingsContainer";
  container.addEventListener("click", (e) => e.stopPropagation());

  function updatePosition() {
    const page = document.querySelector("#SpicyLyricsPage");
    const maxWidth = 560;
    const availW = page ? page.getBoundingClientRect().width : window.innerWidth;
    const availH = page ? page.getBoundingClientRect().height : window.innerHeight;
    const originX = page ? page.getBoundingClientRect().left : 0;
    const originY = page ? page.getBoundingClientRect().top : 0;
    const panelWidth = Math.min(maxWidth, availW - 80);
    container.style.width = `${panelWidth}px`;
    container.style.maxHeight = `${availH * 0.7}px`;
    container.style.left = `${originX + (availW - panelWidth) / 2}px`;
    container.style.top = `${originY + availH / 2}px`;
    container.style.transform = "translateY(-50%)";
  }

  updatePosition();
  window.addEventListener("resize", updatePosition);

  const removalObserver = new MutationObserver(() => {
    if (!document.contains(overlay)) {
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
  closeBtn.addEventListener("click", () => overlay.remove());
  header.appendChild(titleEl);
  header.appendChild(closeBtn);

  const scroll = document.createElement("div");
  scroll.className = "SpicyLyricsSettingsScroll";
  buildContent(scroll);

  container.appendChild(header);
  container.appendChild(scroll);
  overlay.appendChild(container);
  document.body.appendChild(overlay);
}

function exploreTTMLDatabase() {
  (async () => {
    try {
      const cache = await caches.open("SpicyLyrics_UserTTMLStore");
      const keys = await cache.keys();

      if (keys.length === 0) {
        showDatabaseOverlay("Local TTML Database", (scroll) => {
          const row = document.createElement("div");
          row.className = "sl-settings-row";
          const lbl = document.createElement("span");
          lbl.className = "sl-settings-label";
          lbl.textContent = "No TTML entries found in the local database.";
          row.appendChild(lbl);
          scroll.appendChild(row);
        });
        return;
      }

      const entries: { itemKey: string; trackId: string; lyricsType: string; isLocal: boolean }[] = [];
      const nonLocalIds: string[] = [];

      for (const key of keys) {
        const response = await cache.match(key);
        if (!response) continue;
        const data = await response.json();
        const itemKey = key.url.replace(/^.*\//, "");
        const trackId = data.Content?.id ?? itemKey;
        const lyricsType = data.Content?.Type ?? "Unknown";
        const isLocal = itemKey.startsWith("spotify") && itemKey.includes("local");
        entries.push({ itemKey, trackId, lyricsType, isLocal });
        if (!isLocal && trackId) nonLocalIds.push(trackId);
      }

      const trackMeta: Record<string, { name: string; artists: string }> = {};
      for (let i = 0; i < nonLocalIds.length; i += 50) {
        try {
          const resp = await (Spicetify as any).CosmosAsync.get(
            `https://api.spotify.com/v1/tracks?ids=${nonLocalIds.slice(i, i + 50).join(",")}`
          );
          for (const track of resp?.tracks ?? []) {
            if (track) {
              trackMeta[track.id] = {
                name: track.name,
                artists: track.artists.map((a: any) => a.name).join(", "),
              };
            }
          }
        } catch (metaErr) {
          console.warn("Could not fetch track metadata:", metaErr);
        }
      }

      showDatabaseOverlay(`Local TTML Database (${keys.length} entries)`, (scroll) => {
        const group = document.createElement("h3");
        group.className = "sl-settings-group";
        group.textContent = "Saved Entries";
        scroll.appendChild(group);

        for (const entry of entries) {
          const row = document.createElement("div");
          row.className = "sl-settings-row";

          const labelWrap = document.createElement("span");
          labelWrap.className = "sl-settings-label";

          const name = document.createElement("span");
          if (entry.isLocal) {
            name.textContent = entry.trackId;
          } else if (trackMeta[entry.trackId]) {
            const meta = trackMeta[entry.trackId];
            name.textContent = `${meta.name} — ${meta.artists}`;
          } else {
            name.textContent = entry.trackId;
          }
          labelWrap.appendChild(name);

          if (entry.isLocal) {
            const tag = document.createElement("span");
            tag.textContent = "Local File";
            tag.style.cssText = "background:rgba(255,255,255,0.1);border-radius:4px;padding:1px 6px;font-size:0.75em;margin-left:6px;";
            labelWrap.appendChild(tag);
          }

          const type = document.createElement("span");
          type.textContent = entry.lyricsType;
          type.style.cssText = "opacity:0.5;font-size:0.8em;margin-left:8px;";
          labelWrap.appendChild(type);

          const actions = document.createElement("div");
          actions.style.cssText = "display:flex;gap:6px;flex-shrink:0;";

          if (!entry.isLocal) {
            const playBtn = document.createElement("button");
            playBtn.className = "sl-btn";
            playBtn.textContent = "Play Now";
            playBtn.addEventListener("click", () => (window as any).__spicy_ttml_play_entry?.(entry.itemKey));
            actions.appendChild(playBtn);
          }

          const removeBtn = document.createElement("button");
          removeBtn.className = "sl-btn";
          removeBtn.textContent = "Remove";
          removeBtn.addEventListener("click", () => (window as any).__spicy_ttml_remove_entry?.(entry.itemKey));
          actions.appendChild(removeBtn);

          row.appendChild(labelWrap);
          row.appendChild(actions);
          scroll.appendChild(row);
        }

        const clearGroup = document.createElement("h3");
        clearGroup.className = "sl-settings-group";
        clearGroup.textContent = "Manage";
        scroll.appendChild(clearGroup);

        const clearRow = document.createElement("div");
        clearRow.className = "sl-settings-row";
        const clearLabel = document.createElement("span");
        clearLabel.className = "sl-settings-label";
        clearLabel.textContent = "Remove all persistent TTML entries";
        const clearBtn = document.createElement("button");
        clearBtn.className = "sl-btn";
        clearBtn.textContent = "Clear Database";
        clearBtn.addEventListener("click", () => (window as any).__spicy_ttml_clear_db?.());
        clearRow.appendChild(clearLabel);
        clearRow.appendChild(clearBtn);
        scroll.appendChild(clearRow);
      });
    } catch (err) {
      console.error("Error exploring TTML database:", err);
      ShowNotification("Error reading TTML database", "error", 5000);
    }
  })();
}

Global.SetScope("execute", (command: string) => {
  switch (command) {
    case "upload-ttml-temp":
      uploadTTML("temp");
      break;
    case "upload-ttml-session":
      uploadTTML("session");
      break;
    case "upload-ttml-persist":
      uploadTTML("persist");
      break;
    case "explore-ttml-db":
      exploreTTMLDatabase();
      break;
    case "reset-ttml":
      resetTTML();
      break;
    default:
      if (command.startsWith("play-ttml-entry:")) {
        const entryKey = command.replace("play-ttml-entry:", "");
        try {
          (Spicetify as any).Player.playUri(`spotify:track:${entryKey}`);
        } catch (err) {
          ShowNotification("Error playing track", "error", 5000);
          console.error("Error playing track:", err);
        }
      } else if (command.startsWith("remove-ttml-entry:")) {
        const entryKey = command.replace("remove-ttml-entry:", "");
        (async () => {
          try {
            if (UserTTMLStore) await UserTTMLStore.RemoveItem(entryKey);
            ShowNotification("TTML entry removed.", "info", 5000);
            exploreTTMLDatabase();
          } catch (err) {
            ShowNotification("Error removing entry", "error", 5000);
            console.error("Error removing TTML entry:", err);
          }
        })();
      } else if (command === "clear-ttml-db") {
        showConfirm("Clear the entire local TTML database? This cannot be undone.", () => {
          (async () => {
            try {
              await caches.delete("SpicyLyrics_UserTTMLStore");
              ShowNotification("TTML database cleared.", "info", 5000);
            } catch (err) {
              ShowNotification("Error clearing database", "error", 5000);
              console.error("Error clearing TTML database:", err);
            }
          })();
        });
      }
      break;
  }
});

// Dedicated globals so popup buttons work even if window._spicy_lyrics
// gets overwritten by a stale entrypoint (e.g. jsDelivr version during dev).
(window as any).__spicy_ttml_upload_temp      = () => uploadTTML("temp");
(window as any).__spicy_ttml_upload_session   = () => uploadTTML("session");
(window as any).__spicy_ttml_upload_persistent = () => uploadTTML("persist");
(window as any).__spicy_ttml_reset            = () => resetTTML();
(window as any).__spicy_ttml_explore_db       = () => exploreTTMLDatabase();
(window as any).__spicy_ttml_play_entry       = (key: string) => {
  try { (Spicetify as any).Player.playUri(`spotify:track:${key}`); }
  catch (err) { ShowNotification("Error playing track", "error", 5000); }
};
(window as any).__spicy_ttml_remove_entry     = (key: string) => {
  (async () => {
    try {
      if (UserTTMLStore) await UserTTMLStore.RemoveItem(key);
      ShowNotification("TTML entry removed.", "info", 5000);
      exploreTTMLDatabase();
    } catch (err) {
      ShowNotification("Error removing entry", "error", 5000);
    }
  })();
};
(window as any).__spicy_ttml_clear_db         = () => {
  showConfirm("Clear the entire local TTML database? This cannot be undone.", async () => {
    try {
      await caches.delete("SpicyLyrics_UserTTMLStore");
      ShowNotification("TTML database cleared.", "info", 5000);
    } catch (err) {
      ShowNotification("Error clearing database", "error", 5000);
    }
  });
};

async function ParseTTML(ttml: string): Promise<any | null> {
  try {
    const query = await Query([{ operation: "parseTTML", variables: { ttml } }]);
    const result = query.get("0");
    if (!result || result.httpStatus !== 200 || !result.data || result.format !== "json" || result.data.error) {
      return null;
    }
    return result.data;
  } catch (error) {
    console.error("Error parsing TTML:", error);
    ShowNotification("Error parsing TTML", "error", 5000);
    return null;
  }
}
