// deno-lint-ignore-file no-case-declarations
import { parseTTML } from "../../edited_packages/applemusic-like-lyrics-lyric/parser.ts";
import { Query } from "../../utils/API/Query.ts";
import fetchLyrics from "../../utils/Lyrics/fetchLyrics.ts";
import ApplyLyrics, { currentLyricsPlayer } from "../../utils/Lyrics/Global/Applyer.ts";
import { ProcessLyrics } from "../../utils/Lyrics/ProcessLyrics.ts";
import storage from "../../utils/storage.ts";
import Defaults from "../Global/Defaults.ts";
import Global from "../Global/Global.ts";
import { SpotifyPlayer } from "../Global/SpotifyPlayer.ts";
import { ShowNotification } from "../Pages/PageView.ts";

Global.SetScope("execute", (command: string) => {
  switch (command) {
    case "upload-ttml": {
      // console.log("Upload TTML");
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".ttml";
      fileInput.onchange = (event) => {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = async (e) => {
            const ttml = e.target?.result as string;
            // console.log("TTML file loaded:", ttml);
            if (Defaults.LyricsRenderer === "aml-lyrics") {
              ShowNotification("Found TTML, Inserting...", "info", 5000);
              const lyricsLines = await parseTTML(ttml);
              currentLyricsPlayer?.setLyricLines(lyricsLines.lines);
              ShowNotification("Lyrics Applied!", "success", 5000);
            } else {
              ShowNotification("Found TTML, Parsing...", "info", 5000);
              ParseTTML(ttml).then(async (result) => {
                const dataToSave = {
                  ...result?.Result,
                  id: SpotifyPlayer.GetId(),
                };

                await ProcessLyrics(dataToSave);

                storage.set("currentLyricsData", JSON.stringify(dataToSave));
                setTimeout(() => {
                  fetchLyrics(SpotifyPlayer.GetUri() ?? "")
                    .then((lyrics) => {
                      ApplyLyrics(lyrics);
                      ShowNotification("Lyrics Parsed and Applied!", "success", 5000);
                    })
                    .catch((err) => {
                      ShowNotification("Error applying lyrics", "error", 5000);
                      console.error("Error applying lyrics:", err);
                    });
                }, 25);
              });
            }
          };
          reader.onerror = (e) => {
            console.error("Error reading file:", e.target?.error);
            ShowNotification("Error reading TTML file.", "error", 5000);
          };
          reader.readAsText(file);
        }
      };
      fileInput.click();
      break;
    }
    case "reset-ttml":
      // console.log("Reset TTML");
      storage.set("currentLyricsData", "");
      ShowNotification("TTML has been reset.", "info", 5000);
      setTimeout(() => {
        fetchLyrics(SpotifyPlayer.GetUri() ?? "")
          .then(ApplyLyrics)
          .catch((err) => {
            ShowNotification("Error applying lyrics", "error", 5000);
            console.error("Error applying lyrics:", err);
          });
      }, 25);
      break;
  }
});

async function ParseTTML(ttml: string): Promise<any | null> {
  try {
    const query = await Query([
      {
        operation: "parseTTML",
        variables: {
          ttml,
        },
      },
    ]);
    const queryResult = query.get("0");
    if (!queryResult) {
      return null;
    }

    if (queryResult.httpStatus !== 200) {
      return null;
    }

    if (!queryResult.data) {
      return null;
    }

    if (queryResult.format !== "json") {
      return null;
    }

    if (queryResult.data.error) {
      return null;
    }

    return queryResult.data;
  } catch (error) {
    console.error("Error parsing TTML:", error);
    ShowNotification("Error parsing TTML", "error", 5000);
    return null;
  }
}
