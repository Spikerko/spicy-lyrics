import { Query } from "../../utils/API/Query.ts";
import fetchLyrics from "../../utils/Lyrics/fetchLyrics.ts";
import ApplyLyrics from "../../utils/Lyrics/Global/Applyer.ts";
import { removeLocalTTML, saveLocalTTML } from "../../utils/Lyrics/LocalTTML.ts";
import { ProcessLyrics } from "../../utils/Lyrics/ProcessLyrics.ts";
import storage from "../../utils/storage.ts";
import Global from "../Global/Global.ts";
import { SpotifyPlayer } from "../Global/SpotifyPlayer.ts";
import { ShowNotification } from "../Pages/PageView.ts";

Global.SetScope("execute", async (command: string) => {
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
            const uri = SpotifyPlayer.GetUri();
            const ttml = e.target?.result as string;
            ShowNotification("Found TTML, Parsing...", "info", 5000);
            ParseTTML(ttml).then(async (result) => {
              if (!result?.Result) {
                ShowNotification("Unable to parse TTML file.", "error", 5000);
                return;
              }

              const trackId = SpotifyPlayer.GetId();
              const dataToSave = {
                ...result?.Result,
                id: trackId,
              };

              try {
                await ProcessLyrics(dataToSave);
                
                if (trackId) {
                  await saveLocalTTML(trackId, dataToSave, {
                    isLocal: SpotifyPlayer.IsLocalTrack(),
                    trackName: SpotifyPlayer.GetName() || null,
                    artistNames:
                      SpotifyPlayer.GetArtists()
                        ?.map((artist) => artist.name)
                        .filter(Boolean)
                        .join(", ") || null,
                  });
                } else {
                  ShowNotification("Unable to save lyrics without a track ID.", "warning", 5000);
                }

                storage.set("currentLyricsData", JSON.stringify(dataToSave));
                setTimeout(() => {
                  fetchLyrics(uri ?? "")
                    .then((lyrics) => {
                      ApplyLyrics(lyrics);
                      ShowNotification("Lyrics Parsed and Applied!", "success", 5000);
                    })
                    .catch((err) => {
                      ShowNotification("Error applying lyrics", "error", 5000);
                      console.error("Error applying lyrics:", err);
                    });
                }, 25);
              } catch (error) {
                console.error("Error saving local TTML:", error);
                ShowNotification("Error saving local TTML.", "error", 5000);
              }
            });
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
    case "reset-ttml": {
      // console.log("Reset TTML");
      try {
        storage.set("currentLyricsData", "");
        await removeLocalTTML(SpotifyPlayer.GetId() ?? "");
        ShowNotification("TTML has been reset.", "info", 5000);
      } catch (error) {
        console.error("Error removing local TTML:", error);
        ShowNotification("Error resetting local TTML.", "error", 5000);
      }

      await new Promise((resolve) => setTimeout(resolve, 25));
      try {
        const lyrics = await fetchLyrics(SpotifyPlayer.GetUri() ?? "");
        ApplyLyrics(lyrics);
      } catch (err) {
        ShowNotification("Error applying lyrics", "error", 5000);
        console.error("Error applying lyrics:", err);
      }
      break;
    }
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
