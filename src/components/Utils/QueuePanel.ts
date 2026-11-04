import Global from "../Global/Global.ts";
import { PageContainer } from "../Pages/PageView.ts";
import Logger from "../../utils/Logger.ts";

/*
 * Fullscreen queue panel: what plays next and what played recently, opened over
 * the lyrics on the side away from the cover. Spotify's own queue lives in the
 * main view, which fullscreen hides.
 */

const queueLogger = new Logger("Queue Panel");

// Long playlists put hundreds of tracks in "next up"; nobody scrolls that far here.
const MAX_ROWS = 80;

type QueueTrack = {
  uri?: string;
  uid?: string;
  name?: string;
  artists?: { name?: string }[];
  images?: { url?: string; label?: string }[];
  album?: { images?: { url?: string; label?: string }[] };
};

type Tab = "queue" | "recent";

let panel: HTMLElement | null = null;
let tab: Tab = "queue";
let teardown: (() => void) | null = null;
let renderToken = 0;

function imageUrl(track: QueueTrack): string | undefined {
  const images = track.images?.length ? track.images : track.album?.images;
  const url = (images?.find((i) => i.label === "small") ?? images?.[0])?.url;
  if (!url) return undefined;
  if (url.startsWith("spotify:image:")) return `https://i.scdn.co/image/${url.slice(14)}`;
  return url;
}

function trackRow(track: QueueTrack, onClick?: () => void): HTMLElement {
  const row = document.createElement(onClick ? "button" : "div");
  row.className = "SL_QP_Item";
  if (row instanceof HTMLButtonElement) row.type = "button";

  const art = document.createElement("span");
  art.className = "SL_QP_Art";
  const src = imageUrl(track);
  if (src) {
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    img.loading = "lazy";
    img.draggable = false;
    art.appendChild(img);
  }

  const text = document.createElement("span");
  text.className = "SL_QP_Text";
  const title = document.createElement("span");
  title.className = "SL_QP_Title";
  title.textContent = track.name ?? "";
  const artists = document.createElement("span");
  artists.className = "SL_QP_Artists";
  artists.textContent = (track.artists ?? [])
    .map((a) => a.name)
    .filter(Boolean)
    .join(", ");
  text.append(title, artists);

  row.append(art, text);
  if (onClick) row.addEventListener("click", onClick);
  return row;
}

function section(label: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "SL_QP_Section";
  el.textContent = label;
  return el;
}

function note(text: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "SL_QP_Empty";
  el.textContent = text;
  return el;
}

function appendTracks(list: ParentNode, tracks: QueueTrack[], onClick: (t: QueueTrack) => void) {
  for (const track of tracks.slice(0, MAX_ROWS)) list.append(trackRow(track, () => onClick(track)));
  if (tracks.length > MAX_ROWS) list.append(note(`and ${tracks.length - MAX_ROWS} more`));
}

function skipTo(track: QueueTrack) {
  Spicetify.Platform.PlayerAPI.skipTo({ uri: track.uri, uid: track.uid }).catch((err: unknown) =>
    queueLogger.error("Failed to skip to track", err)
  );
}

function playRecent(track: QueueTrack) {
  if (!track.uri) return;
  Promise.resolve(Spicetify.Player.playUri(track.uri)).catch((err: unknown) =>
    queueLogger.error("Failed to play track", err)
  );
}

async function render() {
  const root = panel;
  const list = root?.querySelector<HTMLElement>(".SL_QP_List");
  if (!root || !list) return;
  const token = ++renderToken;

  root.querySelectorAll<HTMLElement>(".SL_QP_Tab").forEach((b) => {
    const active = b.dataset.tab === tab;
    b.classList.toggle("Active", active);
    b.setAttribute("aria-selected", String(active));
  });

  try {
    const fragment = document.createDocumentFragment();
    if (tab === "queue") {
      const queue = await Spicetify.Platform.PlayerAPI.getQueue();
      if (token !== renderToken || panel !== root) return;
      const queued: QueueTrack[] = queue?.queued ?? [];
      const nextUp: QueueTrack[] = queue?.nextUp ?? [];
      if (queue?.current) {
        fragment.appendChild(section("Now playing"));
        fragment.appendChild(trackRow(queue.current)).classList.add("Current");
      }
      if (queued.length) {
        fragment.appendChild(section("Next in queue"));
        appendTracks(fragment, queued, skipTo);
      }
      fragment.appendChild(section("Next up"));
      if (nextUp.length) appendTracks(fragment, nextUp, skipTo);
      else fragment.appendChild(note("Nothing else is coming up"));
    } else {
      const history = await Spicetify.Platform.PlayHistoryAPI.getContents();
      if (token !== renderToken || panel !== root) return;
      const items: QueueTrack[] = history?.items ?? [];
      if (items.length) appendTracks(fragment, items, playRecent);
      else fragment.appendChild(note("Nothing played recently"));
    }
    list.replaceChildren(fragment);
  } catch (err) {
    queueLogger.error("Failed to load", err);
    if (token === renderToken && panel === root) {
      list.replaceChildren(
        note(tab === "queue" ? "Couldn't load the queue" : "Couldn't load recently played")
      );
    }
  }
}

export function IsQueuePanelOpen(): boolean {
  return panel !== null;
}

export function CloseQueuePanel() {
  if (!panel) return;
  const closing = panel;
  panel = null;
  teardown?.();
  teardown = null;
  PageContainer?.querySelector("#QueueToggle")?.classList.remove("Active");

  closing.classList.remove("Visible");
  const remove = () => closing.remove();
  closing.addEventListener("transitionend", remove, { once: true });
  // transitionend never fires under reduced motion or if the node was detached.
  setTimeout(remove, 250);
}

export function ToggleQueuePanel() {
  if (panel) CloseQueuePanel();
  else OpenQueuePanel();
}

function OpenQueuePanel() {
  const contentBox = PageContainer?.querySelector<HTMLElement>(".ContentBox");
  if (!contentBox) return;
  if (PageContainer?.classList.contains("CompactMode")) return;
  if (PageContainer?.classList.contains("ForcedCompactMode")) return;

  const root = document.createElement("div");
  root.className = "SL_QueuePanel";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Queue");
  root.innerHTML = `
    <div class="SL_QP_Tabs" role="tablist">
      <button type="button" class="SL_QP_Tab" role="tab" data-tab="queue">Queue</button>
      <button type="button" class="SL_QP_Tab" role="tab" data-tab="recent">Recently played</button>
    </div>
    <div class="SL_QP_List"></div>
  `;

  panel = root;
  contentBox.appendChild(root);
  PageContainer?.querySelector("#QueueToggle")?.classList.add("Active");
  requestAnimationFrame(() => root.classList.add("Visible"));
  void render();

  root.querySelectorAll<HTMLElement>(".SL_QP_Tab").forEach((button) =>
    button.addEventListener("click", () => {
      tab = button.dataset.tab === "recent" ? "recent" : "queue";
      void render();
    })
  );

  // Spotify's global shortcuts would otherwise fire on keys pressed in the panel.
  const onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Escape") CloseQueuePanel();
  };
  root.addEventListener("keydown", onKeyDown);

  // The queue changes when a track ends, when one is queued elsewhere, or when the
  // panel itself skips to one.
  const refresh = () => {
    if (panel === root) void render();
  };
  const songChangeId = Global.Event.listen("playback:songchange", refresh);
  const playerEvents = Spicetify.Platform.PlayerAPI.getEvents?.();
  playerEvents?.addListener?.("queue_update", refresh);

  teardown = () => {
    root.removeEventListener("keydown", onKeyDown);
    Global.Event.unListen(songChangeId);
    playerEvents?.removeListener?.("queue_update", refresh);
  };
}

// Compact mode has no room beside the cover and drops the button, so close with it.
Global.Event.listen("compact-mode:enable", () => CloseQueuePanel());
