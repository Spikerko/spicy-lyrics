import Fullscreen from "../components/Utils/Fullscreen.ts";
import { isRomanized, setRomanizedStatus } from "./Lyrics/lyrics.ts";
import storage from "./storage.ts";

function isInputFocused(): boolean {
  const tag = (document.activeElement?.tagName ?? "").toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}

function handleKeyDown(e: KeyboardEvent): void {
  if (storage.get("keyboard-shortcuts-enabled") === "false") return;
  if (isInputFocused()) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  const page = document.querySelector("#SpicyLyricsPage");
  if (!page) return;

  switch (e.key.toLowerCase()) {
    case "f": {
      e.preventDefault();
      if (Fullscreen.IsOpen || Fullscreen.CinemaViewOpen) {
        Fullscreen.Close();
      } else {
        Fullscreen.Open();
      }
      break;
    }
    case "r": {
      e.preventDefault();
      setRomanizedStatus(!isRomanized);
      break;
    }
    default:
      break;
  }
}

export function initKeyboardShortcuts(): void {
  document.addEventListener("keydown", handleKeyDown);
}

export function cleanupKeyboardShortcuts(): void {
  document.removeEventListener("keydown", handleKeyDown);
}
