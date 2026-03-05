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

function showDatabaseOverlay(contentHtml: string, title: string) {
  document.querySelector(".SpicyLyricsTTMLDatabaseOverlay")?.remove();

  const overlay = document.createElement("div");
  overlay.className = "SpicyLyricsTTMLDatabaseOverlay";
  overlay.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:9999",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "background:rgba(0,0,0,0.6)",
  ].join(";");

  const panel = document.createElement("div");
  panel.style.cssText = [
    "background:var(--spice-main,#121212)",
    "border-radius:8px",
    "padding:24px",
    "max-width:620px",
    "width:90%",
    "max-height:75vh",
    "overflow-y:auto",
    "position:relative",
    "box-shadow:0 8px 32px rgba(0,0,0,0.6)",
  ].join(";");

  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
      <span style="font-weight:700;font-size:1.1em;">${title}</span>
      <button class="SpicyLyricsTTMLDBClose" style="background:none;border:none;cursor:pointer;opacity:0.7;font-size:1.2em;color:inherit;padding:4px 8px;">✕</button>
    </div>
    <style>.SpicyLyricsDevToolsContainer .SettingValue button{min-width:100px;box-sizing:border-box;text-align:center;}</style>
    <div class="SpicyLyricsDevToolsContainer">${contentHtml}</div>
  `;

  const close = () => overlay.remove();
  panel.querySelector(".SpicyLyricsTTMLDBClose")!.addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  overlay.appendChild(panel);
  document.body.appendChild(overlay);
}

function exploreTTMLDatabase() {
  (async () => {
    try {
      const cache = await caches.open("SpicyLyrics_UserTTMLStore");
      const keys = await cache.keys();

      if (keys.length === 0) {
        showDatabaseOverlay(
          `<div class="Setting"><div class="SettingName"><span>No TTML entries found in the local database.</span></div></div>`,
          "Local TTML Database"
        );
        return;
      }

      const escHtml = (s: string) =>
        s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

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

      let entriesHtml = "";
      for (const entry of entries) {
        let displayName: string;
        let tags = "";

        if (entry.isLocal) {
          displayName = escHtml(entry.trackId);
          tags = `<span style="background:rgba(255,255,255,0.1);border-radius:4px;padding:1px 6px;font-size:0.75em;margin-left:6px;">Local File</span>`;
        } else if (trackMeta[entry.trackId]) {
          const meta = trackMeta[entry.trackId];
          displayName = escHtml(`${meta.name} - ${meta.artists}`);
        } else {
          displayName = escHtml(entry.trackId);
        }

        entriesHtml += `
          <div class="Setting" style="border-bottom:1px solid rgba(255,255,255,0.08);padding:6px 0;">
            <div class="SettingName" style="flex:1;">
              <span style="font-weight:600;">${displayName}</span>${tags}
              <span style="opacity:0.6;font-size:0.85em;margin-left:8px;">${escHtml(entry.lyricsType)}</span>
            </div>
            <div class="SettingValue" style="display:flex;gap:6px;">
              ${!entry.isLocal ? `<button onclick="window.__spicy_ttml_play_entry?.(${JSON.stringify(entry.itemKey)})">Play Now</button>` : ""}
              <button onclick="window.__spicy_ttml_remove_entry?.(${JSON.stringify(entry.itemKey)})">Remove</button>
            </div>
          </div>`;
      }

      const clearBtn = `<div class="Setting" style="margin-top:8px;border-top:1px solid rgba(255,255,255,0.1);padding-top:8px;">
        <div class="SettingName"><span>Remove all persistent TTML entries</span></div>
        <div class="SettingValue"><button onclick="window.__spicy_ttml_clear_db?.()">Clear Database</button></div>
      </div>`;

      showDatabaseOverlay(`${entriesHtml}${clearBtn}`, `Local TTML Database (${keys.length} entries)`);
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
        (async () => {
          try {
            await caches.delete("SpicyLyrics_UserTTMLStore");
            ShowNotification("TTML database cleared.", "info", 5000);
          } catch (err) {
            ShowNotification("Error clearing database", "error", 5000);
            console.error("Error clearing TTML database:", err);
          }
        })();
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
  (async () => {
    try {
      await caches.delete("SpicyLyrics_UserTTMLStore");
      ShowNotification("TTML database cleared.", "info", 5000);
    } catch (err) {
      ShowNotification("Error clearing database", "error", 5000);
    }
  })();
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
