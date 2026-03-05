// deno-lint-ignore-file no-case-declarations
import { Query } from "../../utils/API/Query.ts";
import fetchLyrics, { SessionTTMLStore, getSongKey } from "../../utils/Lyrics/fetchLyrics.ts";
import ApplyLyrics from "../../utils/Lyrics/Global/Applyer.ts";
import { ProcessLyrics } from "../../utils/Lyrics/ProcessLyrics.ts";
import storage from "../../utils/storage.ts";
import Global from "../Global/Global.ts";
import { SpotifyPlayer } from "../Global/SpotifyPlayer.ts";
import { ShowNotification } from "../Pages/PageView.ts";

type TTMLMode = "temp" | "session";

function resetTTML() {
  const songKey = getSongKey(SpotifyPlayer.GetUri() ?? "");
  storage.set("currentLyricsData", "");
  if (songKey) SessionTTMLStore.delete(songKey);
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
      if (songKey && mode === "session") {
        SessionTTMLStore.set(songKey, data);
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

Global.SetScope("execute", (command: string) => {
  switch (command) {
    case "upload-ttml-temp":
      uploadTTML("temp");
      break;
    case "upload-ttml-session":
      uploadTTML("session");
      break;
    case "reset-ttml":
      resetTTML();
      break;
  }
});

// Dedicated globals so the popup buttons work even if window._spicy_lyrics
// gets overwritten by a stale entrypoint (e.g. jsDelivr version during dev).
(window as any).__spicy_ttml_upload_temp    = () => uploadTTML("temp");
(window as any).__spicy_ttml_upload_session = () => uploadTTML("session");
(window as any).__spicy_ttml_reset          = () => resetTTML();

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
