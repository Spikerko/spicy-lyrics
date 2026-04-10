import { Query } from "../../utils/API/Query.ts";
import fetchLyrics from "../../utils/Lyrics/fetchLyrics.ts";
import ApplyLyrics from "../../utils/Lyrics/Global/Applyer.ts";
import { ProcessLyrics } from "../../utils/Lyrics/ProcessLyrics.ts";
import { $currentLyricsData } from "../../utils/stores.ts";
import Global from "../Global/Global.ts";
import { SpotifyPlayer } from "../Global/SpotifyPlayer.ts";
import { toast } from "sonner";

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
            const uri = SpotifyPlayer.GetUri();

            if (uri.startsWith("spotify:local:")) {
              toast.warning("Local TTML files are not available on local songs", { duration: 5000 });
              return
            };


            const ttml = e.target?.result as string;
            toast("Found TTML, Parsing...", { duration: 5000 });
            ParseTTML(ttml).then(async (result) => {
              const dataToSave = {
                ...result?.Result,
                id: SpotifyPlayer.GetId(),
              };

              await ProcessLyrics(dataToSave);

              $currentLyricsData.set(JSON.stringify(dataToSave));
              setTimeout(() => {
                fetchLyrics(uri ?? "")
                  .then((lyrics) => {
                    ApplyLyrics(lyrics);
                    toast.success("Lyrics Parsed and Applied!", { duration: 5000 });
                  })
                  .catch((err) => {
                    toast.error("Error applying lyrics", { duration: 5000 });
                    console.error("Error applying lyrics:", err);
                  });
              }, 25);
            });
          };
          reader.onerror = (e) => {
            console.error("Error reading file:", e.target?.error);
            toast.error("Error reading TTML file.", { duration: 5000 });
          };
          reader.readAsText(file);
        }
      };
      fileInput.click();
      break;
    }
    case "reset-ttml":
      // console.log("Reset TTML");
      $currentLyricsData.set("");
      toast("TTML has been reset.", { duration: 5000 });
      setTimeout(() => {
        fetchLyrics(SpotifyPlayer.GetUri() ?? "")
          .then(ApplyLyrics)
          .catch((err) => {
            toast.error("Error applying lyrics", { duration: 5000 });
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
    toast.error("Error parsing TTML", { duration: 5000 });
    return null;
  }
}
