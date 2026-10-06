import { $currentLyricsType } from "../../../../utils/stores.ts";
import { LyricsObject } from "../../lyrics.ts";
import { timeOffset } from "../Shared.ts";

// Only line Status is read (by ScrollToActiveLine); words and letters are
// animated straight from their times, so they carry no status.
export function TimeSetter(PreCurrentPosition: number): void {
  const CurrentPosition = PreCurrentPosition + timeOffset;
  const CurrentLyricsType = $currentLyricsType.get();

  if (CurrentLyricsType !== "Syllable" && CurrentLyricsType !== "Line") return;

  const lines = LyricsObject.Types[CurrentLyricsType].Lines;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (CurrentPosition < line.StartTime) line.Status = "NotSung";
    else if (CurrentPosition >= line.EndTime) line.Status = "Sung";
    else line.Status = "Active";
  }
}
