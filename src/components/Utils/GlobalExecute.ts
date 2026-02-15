// deno-lint-ignore-file no-case-declarations
import { parseTTML } from "../../edited_packages/applemusic-like-lyrics-lyric/parser.ts";
import { Query } from "../../utils/API/Query.ts";
import fetchLyrics, { UserTTMLStore, SessionTTMLStore, getSongKey } from "../../utils/Lyrics/fetchLyrics.ts";
import ApplyLyrics, { currentLyricsPlayer } from "../../utils/Lyrics/Global/Applyer.ts";
import { ProcessLyrics } from "../../utils/Lyrics/ProcessLyrics.ts";
import storage from "../../utils/storage.ts";
import Defaults from "../Global/Defaults.ts";
import Global from "../Global/Global.ts";
import { SpotifyPlayer } from "../Global/SpotifyPlayer.ts";
import { ShowNotification } from "../Pages/PageView.ts";

type TTMLMode = "persist" | "temp" | "session";

function uploadTTML(mode: TTMLMode) {
  const labels: Record<TTMLMode, { loading: string; done: string }> = {
    persist: { loading: "Found TTML, Inserting...", done: "Lyrics Applied!" },
    temp:    { loading: "Found TTML, Inserting temporarily...", done: "Lyrics Applied Temporarily! (will reset on song change)" },
    session: { loading: "Found TTML, Inserting for session...", done: "Lyrics Applied for Session!" },
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

      if (Defaults.LyricsRenderer === "aml-lyrics") {
        ShowNotification(labels[mode].loading, "info", 5000);
        const lyricsLines = await parseTTML(ttml);
        currentLyricsPlayer?.setLyricLines(lyricsLines.lines);

        const songKey = getSongKey(SpotifyPlayer.GetUri() ?? "");
        if (songKey) {
          const amlData = { SourceTTML: ttml, Type: "Syllable", id: SpotifyPlayer.GetId() };
          if (mode === "persist") await UserTTMLStore.SetItem(songKey, amlData);
          else if (mode === "session") SessionTTMLStore.set(songKey, amlData);
        }

        ShowNotification(labels[mode].done, "success", 5000);
        return;
      }

      ShowNotification("Found TTML, Parsing...", "info", 5000);
      const result = await ParseTTML(ttml);
      if (!result?.Result) {
        ShowNotification("Error parsing TTML", "error", 5000);
        return;
      }

      const data = { ...result.Result, id: SpotifyPlayer.GetId() };
      await ProcessLyrics(data);

      const songKey = getSongKey(SpotifyPlayer.GetUri() ?? "");
      if (songKey) {
        if (mode === "persist") await UserTTMLStore.SetItem(songKey, data);
        else if (mode === "session") SessionTTMLStore.set(songKey, data);
      }

      storage.set("currentLyricsData", JSON.stringify(data));
      setTimeout(() => {
        fetchLyrics(SpotifyPlayer.GetUri() ?? "")
          .then((lyrics) => {
            ApplyLyrics(lyrics);
            ShowNotification(labels[mode].done, "success", 5000);
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

function applyLyricsAfterReset() {
  setTimeout(() => {
    fetchLyrics(SpotifyPlayer.GetUri() ?? "")
      .then(ApplyLyrics)
      .catch((err) => {
        ShowNotification("Error applying lyrics", "error", 5000);
        console.error("Error applying lyrics:", err);
      });
  }, 25);
}

Global.SetScope("execute", async (command: string) => {
  switch (command) {
    case "upload-ttml":
      uploadTTML("persist");
      break;
    case "upload-ttml-temp":
      uploadTTML("temp");
      break;
    case "upload-ttml-session":
      uploadTTML("session");
      break;
    case "explore-ttml-db": {
      try {
        const cache = await caches.open("SpicyLyrics_UserTTMLStore");
        const keys = await cache.keys();

        if (keys.length === 0) {
          Spicetify.PopupModal.display({
            title: "Local TTML Database",
            isLarge: true,
            content: `<div class="SpicyLyricsDevToolsContainer">
              <div class="Setting">
                <div class="SettingName"><span>No TTML entries found in the local database.</span></div>
              </div>
            </div>`,
          });
          return;
        }

        const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

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
                trackMeta[track.id] = { name: track.name, artists: track.artists.map((a: any) => a.name).join(", ") };
              }
            }
          } catch (metaErr) {
            console.warn("Could not fetch track metadata for batch:", metaErr);
          }
        }

        let entriesHtml = "";
        for (const entry of entries) {
          let displayName: string;
          let tags = "";

          if (entry.isLocal) {
            displayName = escHtml(entry.trackId);
            tags = `<span style="background: rgba(255,255,255,0.1); border-radius: 4px; padding: 1px 6px; font-size: 0.75em; margin-left: 6px;">Local File</span>`;
          } else if (trackMeta[entry.trackId]) {
            const meta = trackMeta[entry.trackId];
            displayName = escHtml(`${meta.name} - ${meta.artists}`);
          } else {
            displayName = escHtml(entry.trackId);
          }

          entriesHtml += `
            <div class="Setting" style="border-bottom: 1px solid rgba(255,255,255,0.08); padding: 6px 0;">
              <div class="SettingName" style="flex: 1;">
                <span style="font-weight: 600;">${displayName}</span>${tags}
                <span style="opacity: 0.6; font-size: 0.85em; margin-left: 8px;">${escHtml(entry.lyricsType)}</span>
              </div>
              <div class="SettingValue" style="display: flex; gap: 6px;">
                ${!entry.isLocal ? `<button onclick="window._spicy_lyrics.execute('play-ttml-entry:${escHtml(entry.itemKey)}')">Play Now</button>` : ""}
                <button onclick="window._spicy_lyrics.execute('remove-ttml-entry:${escHtml(entry.itemKey)}')">Remove</button>
              </div>
            </div>`;
        }

        Spicetify.PopupModal.display({
          title: `Local TTML Database (${keys.length} entries)`,
          isLarge: true,
          content: `<div class="SpicyLyricsDevToolsContainer">${entriesHtml}</div>`,
        });
      } catch (err) {
        console.error("Error exploring TTML database:", err);
        ShowNotification("Error reading TTML database", "error", 5000);
      }
      break;
    }
    case "reset-ttml": {
      const resetSongKey = getSongKey(SpotifyPlayer.GetUri() ?? "");
      storage.set("currentLyricsData", "");
      if (resetSongKey) {
        await UserTTMLStore.RemoveItem(resetSongKey);
        SessionTTMLStore.delete(resetSongKey);
      }
      ShowNotification("TTML has been reset.", "info", 5000);
      applyLyricsAfterReset();
      break;
    }
    default: {
      if (command.startsWith("play-ttml-entry:")) {
        const entryKey = command.replace("play-ttml-entry:", "");
        try {
          (Spicetify as any).Player.playUri(`spotify:track:${entryKey}`);
        } catch (err) {
          console.error("Error playing track:", err);
          ShowNotification("Error playing track", "error", 5000);
        }
      } else if (command.startsWith("remove-ttml-entry:")) {
        const entryKey = command.replace("remove-ttml-entry:", "");
        try {
          await UserTTMLStore.RemoveItem(entryKey);
          ShowNotification("TTML entry removed.", "info", 5000);
          (globalThis as any)._spicy_lyrics?.execute?.("explore-ttml-db");
        } catch (err) {
          console.error("Error removing TTML entry:", err);
          ShowNotification("Error removing entry", "error", 5000);
        }
      }
      break;
    }
  }
});

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
