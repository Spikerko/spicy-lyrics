import Logger from "../../utils/Logger.ts";
import { isExperimentEnabled, onExperimentChange } from "../../utils/experiments.ts";
import Global from "../Global/Global.ts";
import { SpotifyPlayer } from "../Global/SpotifyPlayer.ts";
import { PageContainer } from "../Pages/PageView.ts";
import { SetControlsDragLock } from "./Fullscreen.ts";

const pickerLogger = new Logger("Playlist Picker");

/*
 * Fullscreen "Add to playlist" picker. Spotify's own menu lives in the main view,
 * which fullscreen hides, so the list is drawn over the artwork instead. It sits in
 * .MediaBox (not .MediaContent) so it survives NowBar rebuilding MediaContent and so
 * its backdrop blur can reach the artwork through MediaContent's opacity layer.
 */

type PickerPlaylist = { uri: string; name: string; image?: string };

type RootlistItem = {
  type?: string;
  uri?: string;
  name?: string;
  images?: { url?: string }[];
  isOwnedBySelf?: boolean;
  isCollaborative?: boolean;
  canAdd?: boolean;
  items?: RootlistItem[];
};

let panel: HTMLElement | null = null;
let anchorButton: HTMLElement | null = null;
let teardown: (() => void) | null = null;

function imageUrl(url?: string): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("spotify:image:")) return `https://i.scdn.co/image/${url.slice(14)}`;
  // Playlists without a custom cover get a 2×2 grid of their first albums.
  if (url.startsWith("spotify:mosaic:")) {
    return `https://mosaic.scdn.co/300/${url.slice(15).split(":").join("")}`;
  }
  return url;
}

function collectPlaylists(items: RootlistItem[] | undefined, out: PickerPlaylist[]) {
  for (const item of items ?? []) {
    if (item.type === "folder") {
      collectPlaylists(item.items, out);
      continue;
    }
    if (item.type !== "playlist" || !item.uri) continue;
    // Only playlists the user can write to. Older clients don't report canAdd,
    // so fall back to ownership there.
    const writable =
      typeof item.canAdd === "boolean"
        ? item.canAdd
        : item.isOwnedBySelf !== false || item.isCollaborative === true;
    if (!writable) continue;
    out.push({
      uri: item.uri,
      name: item.name ?? "Untitled",
      image: imageUrl(item.images?.[0]?.url),
    });
  }
}

async function getWritablePlaylists(): Promise<PickerPlaylist[]> {
  const root = await Spicetify.Platform.RootlistAPI.getContents({ flatten: true });
  const out: PickerPlaylist[] = [];
  collectPlaylists(root?.items, out);
  // flatten can still list a playlist under several folders on some builds.
  const seen = new Set<string>();
  return out.filter((p) => !seen.has(p.uri) && seen.add(p.uri));
}

async function playlistHasTrack(playlistUri: string, trackUri: string): Promise<boolean> {
  try {
    const contents = await Spicetify.Platform.PlaylistAPI.getContents(playlistUri, {
      limit: 10000,
    });
    const items: { uri?: string }[] = contents?.items ?? [];
    return items.some((i) => i?.uri === trackUri);
  } catch {
    // The check only saves a duplicate; never block the add on it.
    return false;
  }
}

async function addTrack(playlistUri: string, trackUri: string): Promise<void> {
  await Spicetify.Platform.PlaylistAPI.add(playlistUri, [trackUri], { after: "end" });
}

function setStatus(row: HTMLElement, state: "busy" | "added" | "exists" | "error", text: string) {
  row.dataset.state = state;
  const status = row.querySelector<HTMLElement>(".SL_PP_Status");
  if (status) status.textContent = text;
}

function renderList(list: HTMLElement, playlists: PickerPlaylist[], query: string) {
  const q = query.trim().toLowerCase();
  const shown = q ? playlists.filter((p) => p.name.toLowerCase().includes(q)) : playlists;
  list.replaceChildren();

  if (shown.length === 0) {
    const empty = document.createElement("div");
    empty.className = "SL_PP_Empty";
    empty.textContent = q ? "No playlists match" : "No playlists you can add to";
    list.appendChild(empty);
    return;
  }

  for (const playlist of shown) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "SL_PP_Item";
    row.dataset.uri = playlist.uri;

    const art = document.createElement("span");
    art.className = "SL_PP_Art";
    if (playlist.image) {
      const img = document.createElement("img");
      img.src = playlist.image;
      img.alt = "";
      img.loading = "lazy";
      img.draggable = false;
      art.appendChild(img);
    }

    const name = document.createElement("span");
    name.className = "SL_PP_Name";
    name.textContent = playlist.name;

    const status = document.createElement("span");
    status.className = "SL_PP_Status";

    row.append(art, name, status);
    list.appendChild(row);
  }
}

function updateTrackLabel() {
  const label = panel?.querySelector<HTMLElement>(".SL_PP_Track");
  if (!label) return;
  const artists = SpotifyPlayer.GetArtists()
    ?.map((a) => a.name)
    .join(", ");
  label.textContent = [SpotifyPlayer.GetName(), artists].filter(Boolean).join(" · ");
}

// Turning the experiment off hides the picker through CSS; close it too, or the
// controls would stay locked visible until fullscreen closes.
onExperimentChange((experiment) => {
  if (experiment.id !== "fullscreenAddToPlaylist") return;
  if (!isExperimentEnabled("fullscreenAddToPlaylist")) ClosePlaylistPicker();
});

export function IsPlaylistPickerOpen(): boolean {
  return panel !== null;
}

export function ClosePlaylistPicker() {
  if (!panel) return;
  const closing = panel;
  panel = null;
  teardown?.();
  teardown = null;
  anchorButton?.classList.remove("Active");
  anchorButton = null;
  SetControlsDragLock(false);

  closing.classList.remove("Visible");
  const remove = () => closing.remove();
  closing.addEventListener("transitionend", remove, { once: true });
  // transitionend never fires under reduced motion or if the node was detached.
  setTimeout(remove, 250);
}

export function TogglePlaylistPicker(button: HTMLElement) {
  if (panel) {
    ClosePlaylistPicker();
    return;
  }
  OpenPlaylistPicker(button);
}

function OpenPlaylistPicker(button: HTMLElement) {
  if (SpotifyPlayer.GetContentType() === "episode") return;
  const mediaBox = PageContainer?.querySelector<HTMLElement>(
    ".ContentBox .NowBar .Header .MediaBox"
  );
  if (!mediaBox) return;

  const root = document.createElement("div");
  root.className = "SL_PlaylistPicker";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Add to playlist");
  root.innerHTML = `
    <div class="SL_PP_Header">
      <span class="SL_PP_Title">Add to playlist</span>
      <span class="SL_PP_Track"></span>
    </div>
    <input class="SL_PP_Search" type="text" placeholder="Find a playlist" spellcheck="false" autocomplete="off" />
    <div class="SL_PP_List"><div class="SL_PP_Empty">Loading playlists…</div></div>
  `;

  const search = root.querySelector<HTMLInputElement>(".SL_PP_Search")!;
  const list = root.querySelector<HTMLElement>(".SL_PP_List")!;

  panel = root;
  anchorButton = button;
  button.classList.add("Active");
  mediaBox.appendChild(root);
  updateTrackLabel();
  // Keep the controls lit while the picker is up; they fade out after 750 ms idle.
  SetControlsDragLock(true);
  requestAnimationFrame(() => root.classList.add("Visible"));

  let playlists: PickerPlaylist[] = [];
  let busy = false;
  // Bumped when the track changes, so an add that finishes after the track moved
  // on doesn't report on (or close the list for) the new track. A song repeating
  // also fires a song change, but with the same uri, and doesn't count.
  let songVersion = 0;
  let songUri = SpotifyPlayer.GetUri();

  getWritablePlaylists()
    .then((result) => {
      if (panel !== root) return;
      playlists = result;
      renderList(list, playlists, search.value);
    })
    .catch((err) => {
      pickerLogger.error("Failed to load playlists", err);
      if (panel !== root) return;
      list.innerHTML = `<div class="SL_PP_Empty">Couldn't load your playlists</div>`;
    });

  search.addEventListener("input", () => renderList(list, playlists, search.value));

  list.addEventListener("click", async (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>(".SL_PP_Item");
    if (!row || busy) return;
    const playlistUri = row.dataset.uri;
    const trackUri = SpotifyPlayer.GetUri();
    if (!playlistUri || !trackUri) return;

    busy = true;
    const version = songVersion;
    const current = () => panel === root && version === songVersion;
    setStatus(row, "busy", "Adding…");
    try {
      if (await playlistHasTrack(playlistUri, trackUri)) {
        if (current()) setStatus(row, "exists", "Already added");
        return;
      }
      await addTrack(playlistUri, trackUri);
      if (!current()) return;
      setStatus(row, "added", "Added");
      setTimeout(() => {
        if (current()) ClosePlaylistPicker();
      }, 650);
    } catch (err) {
      pickerLogger.error("Failed to add track", err);
      if (current()) setStatus(row, "error", "Failed");
    } finally {
      busy = false;
    }
  });

  // Spotify's global shortcuts (space to pause, etc.) would fire while typing.
  const stopKeys = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Escape") ClosePlaylistPicker();
  };
  root.addEventListener("keydown", stopKeys);

  const onPointerDown = (e: PointerEvent) => {
    const target = e.target as Element;
    // The view controls can be rebuilt while the picker is open, so match the
    // button by id rather than by the element it was opened from.
    if (root.contains(target) || target.closest?.("#AddToPlaylist")) return;
    ClosePlaylistPicker();
  };
  document.addEventListener("pointerdown", onPointerDown, true);

  const onSongChange = () => {
    if (panel !== root) return;
    const uri = SpotifyPlayer.GetUri();
    if (uri === songUri) return;
    songUri = uri;
    songVersion++;
    updateTrackLabel();
    // Statuses describe the previous track.
    for (const row of list.querySelectorAll<HTMLElement>(".SL_PP_Item[data-state]")) {
      delete row.dataset.state;
      const status = row.querySelector<HTMLElement>(".SL_PP_Status");
      if (status) status.textContent = "";
    }
    if (SpotifyPlayer.GetContentType() === "episode") ClosePlaylistPicker();
  };
  const songChangeId = Global.Event.listen("playback:songchange", onSongChange);

  teardown = () => {
    document.removeEventListener("pointerdown", onPointerDown, true);
    root.removeEventListener("keydown", stopKeys);
    Global.Event.unListen(songChangeId);
  };

  setTimeout(() => {
    if (panel === root) search.focus({ preventScroll: true });
  }, 50);
}
