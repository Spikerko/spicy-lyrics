import { openDB } from "idb";
import { $customFont, $customFontFamily, $skipSpicyFont } from "./stores.ts";

// The picked font file lives in its own small database, apart from the lyrics one
// (that one's version is shared with forks). The setting only holds the file's name,
// which is what the settings row shows and what says a font is in use.
const DB_NAME = "spicylyrics-font";
const STORE = "font";
const KEY = "custom";
const FAMILY = "SpicyLyricsCustom";

const MAX_BYTES = 30 * 1024 * 1024;

let activeFace: FontFace | null = null;
let activeData: ArrayBuffer | null = null;

function openFontDb() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore(STORE);
    },
  });
}

function register(face: FontFace, data: ArrayBuffer) {
  activeData = data;
  if (activeFace) document.fonts.delete(activeFace);
  document.fonts.add(face);
  activeFace = face;
}

async function makeFace(data: ArrayBuffer) {
  // A weight range lets one file serve every weight the lyrics ask for.
  const face = new FontFace(FAMILY, data, { weight: "100 900" });
  await face.load();
  return face;
}

/** Registers the stored font, if there is one. Run at startup. */
export async function loadCustomFont() {
  if (!$customFont.get()) return;
  try {
    const db = await openFontDb();
    const data: ArrayBuffer | undefined = await db.get(STORE, KEY);
    db.close();
    if (!data) {
      $customFont.set("");
      return;
    }
    register(await makeFace(data), data);
  } catch (error) {
    console.warn("(Custom Font) Could not load the stored font", error);
  }
}

/** Stores and applies a font file. Rejects when the file isn't a usable font. */
export async function setCustomFontFile(file: File) {
  if (file.size > MAX_BYTES) throw new Error("tooLarge");
  const data = await file.arrayBuffer();
  const face = await makeFace(data);
  const db = await openFontDb();
  await db.put(STORE, data, KEY);
  db.close();
  register(face, data);
  $customFontFamily.set("");
  $skipSpicyFont.set(false);
  $customFont.set(file.name);
}

/** Uses an installed font by family name; drops a picked file. Empty is the Spicy Lyrics font. */
export async function setCustomFontFamily(family: string) {
  $customFontFamily.set(family.trim());
  $skipSpicyFont.set(false);
  if ($customFont.get()) await clearCustomFont();
}

/** Leaves the lyrics in whatever font the app around them uses. */
export async function useSystemFont() {
  $customFontFamily.set("");
  $skipSpicyFont.set(true);
  if ($customFont.get()) await clearCustomFont();
}

type PickedFile = File | "unsupported" | null;

/**
 * Asks for a font file with a single "Font files" filter. A file input would list each
 * extension as its own filter. null means the dialog was dismissed; "unsupported" means this
 * browser has no such picker and the caller should fall back to an input.
 */
export async function pickFontFile(): Promise<PickedFile> {
  const open = (window as any).showOpenFilePicker as
    | undefined
    | ((options: unknown) => Promise<{ getFile(): Promise<File> }[]>);
  if (!open) return "unsupported";
  try {
    const [handle] = await open.call(window, {
      multiple: false,
      excludeAcceptAllOption: true,
      types: [
        {
          description: "Font files",
          accept: {
            "font/ttf": [".ttf"],
            "font/otf": [".otf"],
            "font/woff": [".woff"],
            "font/woff2": [".woff2"],
          },
        },
      ],
    });
    return handle ? await handle.getFile() : null;
  } catch (error) {
    return (error as Error)?.name === "AbortError" ? null : "unsupported";
  }
}

let systemFonts: Promise<string[]> | null = null;

/** Family names of the installed fonts, or [] where the browser can't list them. */
export function listSystemFonts(): Promise<string[]> {
  systemFonts ??= (async () => {
    try {
      const query = (window as any).queryLocalFonts as undefined | (() => Promise<{ family: string }[]>);
      if (!query) return [];
      const families = new Set<string>((await query.call(window)).map((font) => font.family));
      return [...families].sort((a, b) => a.localeCompare(b));
    } catch {
      return [];
    }
  })();
  // A refusal or failure shouldn't stick: let the next focus ask again.
  systemFonts.then((list) => {
    if (list.length === 0) systemFonts = null;
  });
  return systemFonts;
}

export async function clearCustomFont() {
  $customFont.set("");
  if (activeFace) document.fonts.delete(activeFace);
  activeFace = null;
  activeData = null;
  const db = await openFontDb();
  await db.delete(STORE, KEY);
  db.close();
}

/** A window with its own document (the popup) doesn't share our fonts: give it the picked file. */
export function addCustomFontTo(target: Window) {
  if (!activeData) return;
  const face = new FontFace(FAMILY, activeData, { weight: "100 900" });
  void face.load().then(() => target.document.fonts.add(face));
}
