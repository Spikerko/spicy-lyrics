import "../../css/QueueView.css";
import Global from "../Global/Global.ts";
import { PageContainer } from "../Pages/PageView.ts";
import { Icons } from "../Styling/Icons.ts";
import Fullscreen from "./Fullscreen.ts";
import { IsPIP } from "./PopupLyrics.ts";
import { SyncNoLyricsLayout } from "../../utils/Lyrics/LyricsNotice.ts";
import Logger from "../../utils/Logger.ts";
import { createTooltip } from "../../utils/tooltip.ts";
import { CreateTextScroller, type TextScroller } from "../../utils/TextScroller.ts";
import { RefreshSwitchClearance, WatchViewSwitch } from "../../utils/ViewSwitchClearance.ts";

/*
 * The queue in Cinema View and fullscreen. It takes the lyrics column while it's open: the
 * lyrics fade out under it (QueueView.css) and come back when it closes. The list is Spotify's own
 * queue (PlayerAPI.getQueue): the songs the user queued, then what plays next from the context.
 * Rows are kept per queue item `uid` across updates, so when the queue changes (a song starts, an
 * item is removed or added elsewhere) the rows that stay slide to their new place instead of the
 * list being redrawn.
 *
 * A two-way switch in the bottom corner on the lyrics side picks between the lyrics and the queue.
 */

const queueLogger = new Logger("Queue View");

type QueueImage = { url?: string; label?: string };
type QueueTrack = {
  uri: string;
  uid: string;
  name?: string;
  provider?: string;
  isLocal?: boolean;
  isExplicit?: boolean;
  duration?: { milliseconds?: number };
  artists?: { name?: string }[];
  album?: { images?: QueueImage[] };
  images?: QueueImage[];
  metadata?: Record<string, string>;
};
type QueueState = { queued: QueueTrack[]; nextUp: QueueTrack[] };
/** Where a moved item lands: before or after another item, as `reorderQueue` takes it. */
type MoveTarget = { before: QueueTrack } | { after: QueueTrack };

// The context runs on for hundreds of tracks; the next few are what the view is for.
const NEXT_UP_LIMIT = 30;
const QUEUED_LIMIT = 50;
const LEAVE_MS = 200;
// The lyrics' return in QueueView.css: 80 ms delay + 280 ms fade, with a little to spare.
const LYRICS_RETURN_MS = 420;
// A fetch answered quicker than this never shows the placeholder rows.
const SKELETON_DELAY_MS = 160;
const CLEAR_CONFIRM_MS = 3000;
const REFRESH_SETTLE_MS = 150;
const EDIT_ANSWER_MS = 1000;
const EDIT_TIMEOUT_MS = 6000;
// The panel itself starts fading in 60 ms after the click (QueueView.css); the rows follow it.
const ENTER_DELAY_MS = 60;
const ENTER_STAGGER_MS = 30;
const ENTER_STAGGER_ROWS = 8;
const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
const EASE_IN_OUT = "cubic-bezier(0.77, 0, 0.175, 1)";

let open = false;
let panel: HTMLElement | null = null;
let list: HTMLElement | null = null;
let status: HTMLElement | null = null;
let unsubscribe: (() => void) | null = null;
let leaveTimer: ReturnType<typeof setTimeout> | null = null;
let closingTimer: ReturnType<typeof setTimeout> | null = null;
let skeletonTimer: ReturnType<typeof setTimeout> | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let loadGeneration = 0;
let hasRendered = false;
let lastState: QueueState | null = null;
let lastEditAt = -Infinity;
let clearArmed: ReturnType<typeof setTimeout> | null = null;
let viewSwitch: HTMLElement | null = null;
let switchTooltips: { destroy?: () => void }[] = [];
/** Rows and section labels currently in the list, by key. */
const nodes = new Map<string, HTMLElement>();
/** The queue item a row stands for now. A kept row can stand for a new item with the same song. */
const rowTracks = new WeakMap<HTMLElement, QueueTrack>();
/** Each row's title and artists scroller, destroyed when the row leaves the document. */
const scrollers = new Map<HTMLElement, TextScroller>();

function DropScroller(row: HTMLElement) {
  scrollers.get(row)?.destroy();
  scrollers.delete(row);
}
/** Liked state per song uri, as the library last confirmed it while the panel was open. */
const liked = new Map<string, boolean>();
const likeChecks = new Set<string>();
let announcer: HTMLElement | null = null;
// Edits go to Spotify one at a time: each one is written against the queue revision the last left.
let editChain: Promise<unknown> = Promise.resolve();
let editsPending = 0;
let refreshHeld = false;
/**
 * Rows moved since Spotify's list was last read. Moving a song into the queue gives it a new id,
 * and an edit sent with the old one does nothing, so these rows take no edits until the list is in.
 */
let awaitingQueue = new WeakSet<HTMLElement>();
/** The ids those rows were moved under: a move placed beside one would send a stale anchor. */
let awaitingUids = new Set<string>();
/** The next render puts rows in place without sliding them: a move made from the keyboard. */
let snapNextRender = false;
let announceRow: HTMLElement | null = null;

const playerApi = (): any => (Spicetify as any).Platform?.PlayerAPI;
const libraryApi = (): any => (Spicetify as any).Platform?.LibraryAPI;

// Each control is drawn only where this Spotify build has the call behind it.
const CanReorder = () => typeof playerApi()?.reorderQueue === "function";
const CanRemove = () => typeof playerApi()?.removeFromQueue === "function";
const CanLike = () =>
  typeof libraryApi()?.add === "function" && typeof libraryApi()?.remove === "function";
const Likeable = (track: QueueTrack) => !track.isLocal && track.uri.startsWith("spotify:track:");
const IsAutoplay = (track: QueueTrack) => track.provider === "autoplay";
/** Autoplay picks can't be moved, and nothing can be moved in among them. */
const Movable = (track: QueueTrack) => !!track.uid && !IsAutoplay(track);

const reducedMotion = () =>
  !!panel?.ownerDocument.defaultView?.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const IsQueueOpen = () => open;

/** Only Cinema View and fullscreen have room for it; the popup keeps its own layout. */
const CanShowQueue = () => !!PageContainer && Fullscreen.IsOpen && !IsPIP;

export function OpenQueue() {
  if (open || !CanShowQueue() || !PageContainer) return;
  const page = PageContainer;
  const box = page.querySelector<HTMLElement>(".ContentBox");
  if (!box) return;

  open = true;
  if (leaveTimer) {
    clearTimeout(leaveTimer);
    leaveTimer = null;
  }
  if (!panel || !panel.isConnected || panel.parentElement !== box) {
    BuildPanel(box);
  } else {
    // The queue has moved on since it was last open; start from a fresh list and its cascade.
    ClearList();
    HideStatus();
    hasRendered = false;
    lastState = null;
  }
  panel!.classList.remove("Leaving");
  // A frame in the closed state first, so the panel transitions in instead of appearing.
  void panel!.offsetWidth;
  panel!.classList.add("Open");
  panel!.removeAttribute("inert");
  if (closingTimer) clearTimeout(closingTimer);
  closingTimer = null;
  page.classList.remove("QueueClosing");
  page.classList.add("QueueOpen");
  SyncToggle();
  // A song without lyrics gives the column back to the NowBar; the queue needs it.
  SyncNoLyricsLayout();
  Subscribe();
  void Load();
}

/** `immediate` skips the exit fade, for a page that is leaving fullscreen or going away. */
export function CloseQueue(immediate = false) {
  if (!open && !immediate) return;
  open = false;
  EndDrag("cancel", false);
  FinishSettle();
  Unsubscribe();
  DisarmClear();
  // Likes can change elsewhere while the panel is shut; the next open asks again.
  liked.clear();
  likeChecks.clear();
  loadGeneration++;
  if (skeletonTimer) {
    clearTimeout(skeletonTimer);
    skeletonTimer = null;
  }
  const page = PageContainer;
  page?.classList.remove("QueueOpen");
  if (page && !immediate) {
    // The lyrics fade back on their own timing (QueueView.css) until they are fully in.
    page.classList.add("QueueClosing");
    if (closingTimer) clearTimeout(closingTimer);
    closingTimer = setTimeout(() => {
      closingTimer = null;
      page.classList.remove("QueueClosing");
    }, LYRICS_RETURN_MS);
  }
  SyncToggle();
  SyncNoLyricsLayout();
  if (!panel) return;
  const leaving = panel;
  // Focus inside would be stranded on an inert button; the switch, now on the lyrics, takes it.
  const active = leaving.ownerDocument.activeElement as HTMLElement | null;
  if (active && leaving.contains(active)) {
    const option = CheckedOption();
    if (option) option.focus({ preventScroll: true });
    else active.blur();
  }
  leaving.setAttribute("inert", "");
  leaving.classList.remove("Open");
  if (immediate) {
    DestroyPanel();
    return;
  }
  leaving.classList.add("Leaving");
  if (leaveTimer) clearTimeout(leaveTimer);
  leaveTimer = setTimeout(() => {
    leaveTimer = null;
    if (open) return;
    leaving.classList.remove("Leaving");
    // The next open starts from a fresh list anyway. Until then the hidden rows' title
    // scrollers would restyle every frame, and the rows relaid out with the lyrics.
    if (panel === leaving) ClearList();
  }, LEAVE_MS);
}

function DestroyPanel() {
  if (leaveTimer) clearTimeout(leaveTimer);
  leaveTimer = null;
  EndDrag("cancel", false);
  FinishSettle();
  scrollers.forEach((scroller) => scroller.destroy());
  scrollers.clear();
  panel?.remove();
  panel = null;
  list = null;
  status = null;
  announcer = null;
  nodes.clear();
  hasRendered = false;
  lastState = null;
}

/** The switch follows the state, whichever way it changed. */
function SyncToggle() {
  if (!viewSwitch) return;
  const view = open ? "queue" : "lyrics";
  viewSwitch.dataset.view = view;
  viewSwitch.querySelectorAll<HTMLElement>(".ViewSwitchOption").forEach((option) => {
    const checked = option.dataset.view === view;
    option.setAttribute("aria-checked", String(checked));
    option.tabIndex = checked ? 0 : -1;
  });
}

const CheckedOption = () =>
  viewSwitch?.querySelector<HTMLElement>(".ViewSwitchOption[aria-checked='true']") ?? null;

// Spotify toggles playback on Space at the document; a focused control here keeps its key.
function KeepKeys(event: KeyboardEvent) {
  if (event.key !== " " && event.key !== "Enter") return;
  if ((event.target as HTMLElement | null)?.closest("button")) event.stopPropagation();
}

// A mouse click leaves focus on the button, and KeepKeys would then keep Space from Spotify's
// play/pause until focus moved on. Pointer clicks (detail > 0) let the focus go once handled.
function ReleasePointerFocus(event: MouseEvent) {
  if (event.detail === 0) return;
  const root = event.currentTarget as HTMLElement;
  const active = root.ownerDocument.activeElement as HTMLElement | null;
  if (active && root.contains(active)) active.blur();
}

function BuildPanel(box: HTMLElement) {
  DestroyPanel();
  const doc = box.ownerDocument;
  const root = doc.createElement("div");
  root.className = "QueuePanel";
  root.setAttribute("role", "region");
  root.setAttribute("aria-label", "Up Next");
  root.setAttribute("inert", "");
  root.addEventListener("keydown", KeepKeys);
  root.addEventListener("click", ReleasePointerFocus);

  const inner = doc.createElement("div");
  inner.className = "QueueInner";

  const header = doc.createElement("div");
  header.className = "QueueHeader";
  const title = doc.createElement("h2");
  title.className = "QueueTitle";
  title.textContent = "Up Next";
  header.append(title);

  const scroll = doc.createElement("div");
  scroll.className = "QueueScroll";
  const listEl = doc.createElement("div");
  listEl.className = "QueueList";
  const statusEl = doc.createElement("div");
  statusEl.className = "QueueStatus";
  statusEl.setAttribute("aria-live", "polite");
  scroll.append(listEl, statusEl);
  // Moves made from the keyboard are read out here; the status region is for the list's state.
  const announce = doc.createElement("div");
  announce.className = "QueueAnnounce";
  announce.setAttribute("aria-live", "polite");

  inner.append(header, scroll, announce);
  root.appendChild(inner);
  box.appendChild(root);
  // The click that ends a drag lands on the row's button; it mustn't play the song.
  root.addEventListener(
    "click",
    (event) => {
      if (!swallowClick) return;
      swallowClick = false;
      event.preventDefault();
      event.stopPropagation();
    },
    true
  );

  panel = root;
  list = listEl;
  status = statusEl;
  announcer = announce;
}

// --- Data ---

function Subscribe() {
  if (unsubscribe) return;
  const offs: (() => void)[] = [];
  try {
    const off = playerApi()?.getEvents?.()?.addListener?.("queue_update", ScheduleRefresh);
    if (typeof off === "function") offs.push(off);
  } catch (err) {
    queueLogger.warn("Couldn't listen for queue updates", err);
  }
  // Likes and unlikes from anywhere (the NowBar heart, Spotify's own) reach the rows.
  try {
    const events = libraryApi()?.getEvents?.();
    if (typeof events?.addListener === "function") {
      const off = events.addListener("update_item", OnLibraryUpdate);
      offs.push(
        typeof off === "function" ? off : () => events.removeListener?.("update_item", OnLibraryUpdate)
      );
    }
  } catch (err) {
    queueLogger.warn("Couldn't listen for library updates", err);
  }
  // The context name lives on the player state, not the queue.
  Spicetify.Player.addEventListener("songchange", ScheduleRefresh);
  offs.push(() => Spicetify.Player.removeEventListener("songchange", ScheduleRefresh));
  unsubscribe = () => offs.forEach((off) => off());
}

function Unsubscribe() {
  unsubscribe?.();
  unsubscribe = null;
  if (refreshTimer !== null) clearTimeout(refreshTimer);
  refreshTimer = null;
}

// Updates come in bursts, and a song change or a new context passes through partial states on the
// way (a next-up list one song long). Reading once the burst has gone quiet skips those.
function ScheduleRefresh() {
  if (!open) return;
  // A drag or an edit in flight owns the list; the read waits for it to finish.
  if (drag?.started || editsPending > 0) {
    refreshHeld = true;
    return;
  }
  if (refreshTimer !== null) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void Load();
  }, REFRESH_SETTLE_MS);
}

async function Load() {
  const generation = ++loadGeneration;
  if (!hasRendered && !skeletonTimer) {
    skeletonTimer = setTimeout(() => {
      skeletonTimer = null;
      if (generation === loadGeneration && !hasRendered) ShowStatus("loading");
    }, SKELETON_DELAY_MS);
  }
  try {
    const raw = await playerApi()?.getQueue?.();
    if (generation !== loadGeneration || !open) return;
    if (drag?.started || editsPending > 0) {
      refreshHeld = true;
      return;
    }
    if (!raw) throw new Error("No queue state");
    Render({
      queued: Array.isArray(raw.queued) ? raw.queued : [],
      nextUp: Array.isArray(raw.nextUp) ? raw.nextUp : [],
    });
    // Spotify's own list is in: moved rows carry their current ids again, and a move made from
    // the keyboard is read out where it actually landed.
    awaitingQueue = new WeakSet();
    awaitingUids = new Set();
    const moved = announceRow;
    announceRow = null;
    if (moved?.isConnected) AnnounceMove(moved);
  } catch (err) {
    if (generation !== loadGeneration || !open) return;
    queueLogger.warn("Couldn't read the queue", err);
    if (!hasRendered) ShowStatus("error");
  } finally {
    if (generation === loadGeneration && skeletonTimer) {
      clearTimeout(skeletonTimer);
      skeletonTimer = null;
    }
  }
}

function ContextName(): string | null {
  const metadata = Spicetify.Player.data?.context?.metadata as Record<string, unknown> | undefined;
  const name = metadata?.context_description;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

// --- Rendering ---

type Entry =
  | { key: string; kind: "label"; text: string; clear?: boolean }
  | { key: string; kind: "row"; track: QueueTrack; queued: boolean }
  | { key: string; kind: "more"; text: string };

function Entries(state: QueueState): Entry[] {
  const entries: Entry[] = [];
  // Rows are keyed by the item alone, not its section, so a song moved between the queue and what
  // plays next keeps its row and slides there.
  const rowKeys = new Set<string>();
  const RowKey = (track: QueueTrack) => {
    let key = `r:${track.uid || track.uri}`;
    while (rowKeys.has(key)) key += "+";
    rowKeys.add(key);
    return key;
  };
  const queued = state.queued.filter((t) => t?.uri).slice(0, QUEUED_LIMIT);
  if (queued.length) {
    entries.push({ key: "label:queue", kind: "label", text: "In Queue", clear: true });
    for (const track of queued) {
      entries.push({ key: RowKey(track), kind: "row", track, queued: true });
    }
  }

  const nextUp = state.nextUp.filter((t) => t?.uri);
  const shown = nextUp.slice(0, NEXT_UP_LIMIT);
  let provider: string | null = null;
  const labels = new Set<string>();
  for (const track of shown) {
    const group = track.provider === "autoplay" ? "autoplay" : "context";
    if (group !== provider) {
      provider = group;
      const context = ContextName();
      let key = `label:${group}`;
      while (labels.has(key)) key += "+";
      labels.add(key);
      entries.push({
        key,
        kind: "label",
        text: group === "autoplay" ? "Autoplay" : context ? `Next from ${context}` : "Next Up",
      });
    }
    entries.push({ key: RowKey(track), kind: "row", track, queued: false });
  }
  const rest = nextUp.length - shown.length;
  if (rest > 0) {
    entries.push({
      key: "more",
      kind: "more",
      text: `${rest} more ${rest === 1 ? "song" : "songs"} after these`,
    });
  }
  return entries;
}

function ImageUrl(track: QueueTrack): string | null {
  const images = track.album?.images?.length ? track.album.images : track.images ?? [];
  const pick =
    images.find((i) => i.label === "standard") ??
    images.find((i) => i.label === "small") ??
    images[0];
  const url = pick?.url;
  if (!url) return null;
  if (url.startsWith("spotify:image:")) return url.replace("spotify:image:", "https://i.scdn.co/image/");
  return /^https?:/.test(url) ? url : null;
}

function FormatTime(ms: number | undefined): string {
  if (!ms || !Number.isFinite(ms)) return "";
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function BuildLabel(doc: Document, entry: Extract<Entry, { kind: "label" }>): HTMLElement {
  const el = doc.createElement("div");
  el.className = "QueueLabel";
  // Drags read the sections from these (DropTarget, StateFromMove).
  if (entry.key.startsWith("label:autoplay")) el.classList.add("AutoplayLabel");
  const text = doc.createElement("h3");
  text.className = "QueueLabelText";
  el.appendChild(text);
  if (entry.clear) {
    const clear = doc.createElement("button");
    clear.type = "button";
    clear.className = "QueueClear";
    clear.textContent = "Clear";
    clear.addEventListener("click", () => OnClear(clear));
    el.appendChild(clear);
  }
  UpdateLabel(el, entry);
  return el;
}

function UpdateLabel(el: HTMLElement, entry: Extract<Entry, { kind: "label" | "more" }>) {
  const text = el.querySelector(".QueueLabelText") ?? el;
  if (text.textContent !== entry.text) text.textContent = entry.text;
}

function BuildRow(doc: Document, entry: Extract<Entry, { kind: "row" }>): HTMLElement {
  const { track } = entry;
  const name = track.name || "Unknown song";
  const artists = (track.artists ?? [])
    .map((a) => a?.name)
    .filter(Boolean)
    .join(", ");

  const row = doc.createElement("div");
  row.className = "QueueRow";
  if (entry.queued) row.classList.add("Queued");
  rowTracks.set(row, track);

  const play = doc.createElement("button");
  play.type = "button";
  play.className = "QueuePlay";
  play.setAttribute("aria-label", artists ? `Play ${name} by ${artists}` : `Play ${name}`);
  play.addEventListener("click", () => {
    const current = rowTracks.get(row);
    // A row just moved may stand for an item Spotify has since given a new id (awaitingQueue).
    if (current && !awaitingQueue.has(row)) PlayTrack(current);
  });

  const art = doc.createElement("span");
  art.className = "QueueArt";
  const url = ImageUrl(track);
  if (url) {
    const img = doc.createElement("img");
    img.alt = "";
    img.decoding = "async";
    img.loading = "lazy";
    img.draggable = false;
    img.addEventListener("load", () => art.classList.add("Loaded"), { once: true });
    img.src = url;
    art.appendChild(img);
  }
  const glyph = doc.createElement("span");
  glyph.className = "QueueArtPlay";
  glyph.setAttribute("aria-hidden", "true");
  glyph.innerHTML = Icons.Play;
  art.appendChild(glyph);

  const text = doc.createElement("span");
  text.className = "QueueText";
  const title = doc.createElement("span");
  title.className = "QueueName";
  // Each line is a box holding one moving track: a name or artists list wider than the column
  // scrolls inside it (TextScroller), the title and its artists in one cycle.
  const titleText = doc.createElement("span");
  titleText.className = "QueueNameText";
  const titleTrack = doc.createElement("span");
  titleTrack.className = "QueueTrack";
  titleTrack.textContent = name;
  titleText.appendChild(titleTrack);
  title.appendChild(titleText);
  if (track.isExplicit) {
    const badge = doc.createElement("span");
    badge.className = "QueueExplicit";
    badge.textContent = "E";
    badge.title = "Explicit";
    title.appendChild(badge);
  }
  const sub = doc.createElement("span");
  sub.className = "QueueArtists";
  const subTrack = doc.createElement("span");
  subTrack.className = "QueueTrack";
  subTrack.textContent = artists;
  sub.appendChild(subTrack);
  text.append(title, sub);
  // Under reduced motion a long line holds at its start, its end faded out.
  scrollers.set(
    row,
    CreateTextScroller([titleText, sub], { holdOnReducedMotion: true, overflowClass: "Overflowing" })
  );

  const time = doc.createElement("span");
  time.className = "QueueTime";
  time.textContent = FormatTime(track.duration?.milliseconds);

  play.append(art, text, time);
  row.appendChild(play);
  play.addEventListener("pointerdown", (event) => PressRow(row, play, event));
  play.addEventListener("keydown", (event) => {
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    event.stopPropagation();
    // One move per press: a held key would send the next move before the last has landed.
    if (event.repeat) return;
    MoveByKey(row, event.key === "ArrowUp" ? -1 : 1);
  });

  // The like and remove buttons take the duration's place on hover or focus (QueueView.css).
  const actions = doc.createElement("span");
  actions.className = "QueueActions";
  if (CanLike() && Likeable(track)) {
    const like = doc.createElement("button");
    like.type = "button";
    like.className = "QueueLike";
    like.innerHTML = HEART;
    // A press from the keyboard (detail 0) gets no fill-in, as keyboard moves get no slide.
    like.addEventListener("click", (event) => ToggleLike(row, event.detail > 0));
    actions.appendChild(like);
  }
  if (CanRemove()) {
    const remove = doc.createElement("button");
    remove.type = "button";
    remove.className = "QueueRemove";
    remove.setAttribute("aria-label", `Remove ${name} from the queue`);
    remove.innerHTML = Icons.Close;
    remove.addEventListener("click", (event) => {
      const current = rowTracks.get(row);
      // A click from the keyboard (detail 0) hands focus on to a neighbouring row.
      if (current) RemoveTrack(row, current, event.detail === 0);
    });
    actions.appendChild(remove);
  }
  if (actions.childElementCount) row.appendChild(actions);
  SyncRow(row, entry);
  return row;
}

// Its own glyph rather than the NowBar's heart, whose ids would repeat once per row.
const HEART = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 20.25S3.75 15.4 3.75 9.4A4.4 4.4 0 0 1 12 7.25a4.4 4.4 0 0 1 8.25 2.15c0 6-8.25 10.85-8.25 10.85Z"/></svg>`;

/** Brings a row, new or kept, in line with the item it stands for now. */
function SyncRow(row: HTMLElement, entry: Extract<Entry, { kind: "row" }>) {
  const { track } = entry;
  const autoplay = IsAutoplay(track);
  row.classList.toggle("Queued", entry.queued);
  row.classList.toggle("Autoplay", autoplay);
  row.classList.toggle("Movable", CanReorder() && Movable(track));
  const like = row.querySelector<HTMLElement>(".QueueLike");
  const remove = row.querySelector<HTMLElement>(".QueueRemove");
  // Autoplay picks aren't in the queue yet; there is nothing to take out.
  if (remove) remove.hidden = autoplay || !track.uid;
  row.classList.toggle("HasActions", !!like || (!!remove && !remove.hidden));
  if (like) PaintLike(like, track);
}

function BuildMore(doc: Document, entry: Extract<Entry, { kind: "more" }>): HTMLElement {
  const el = doc.createElement("div");
  el.className = "QueueMore";
  UpdateLabel(el, entry);
  return el;
}

function Render(state: QueueState) {
  if (!list || !status || !panel) return;
  lastState = state;
  const doc = list.ownerDocument;
  const entries = Entries(state);
  const snap = snapNextRender;
  snapNextRender = false;
  const animate = hasRendered && !reducedMotion() && !snap;
  const firstRender = !hasRendered;

  if (!entries.length) {
    ClearList();
    ShowStatus("empty");
    hasRendered = true;
    return;
  }
  HideStatus();

  // First: where every node is on screen now, mid-animation included.
  const before = new Map<HTMLElement, DOMRect>();
  if (animate) nodes.forEach((el) => before.set(el, el.getBoundingClientRect()));
  nodes.forEach((el) => el.getAnimations().forEach((a) => a.cancel()));

  AdoptRows(entries);
  const wanted = new Set(entries.map((e) => e.key));
  const leaving: { el: HTMLElement; rect: DOMRect; opacity: number }[] = [];
  nodes.forEach((el, key) => {
    if (wanted.has(key)) return;
    nodes.delete(key);
    const rect = before.get(el);
    // A row being removed is already dimmed; its fade starts from there.
    if (animate && rect) {
      const opacity = Number.parseFloat(getComputedStyle(el).opacity);
      leaving.push({ el, rect, opacity: Number.isFinite(opacity) ? opacity : 1 });
    }
    else {
      el.remove();
      DropScroller(el);
    }
  });

  const created = new Set<HTMLElement>();
  const ordered: HTMLElement[] = [];
  for (const entry of entries) {
    let el = nodes.get(entry.key);
    if (!el) {
      el =
        entry.kind === "row"
          ? BuildRow(doc, entry)
          : entry.kind === "label"
            ? BuildLabel(doc, entry)
            : BuildMore(doc, entry);
      nodes.set(entry.key, el);
      created.add(el);
    } else if (entry.kind === "row") {
      rowTracks.set(el, entry.track);
      SyncRow(el, entry);
    } else {
      UpdateLabel(el, entry);
    }
    ordered.push(el);
  }
  // Only nodes out of place move: a node taken out of the document and put back loses its hover
  // and restarts its transitions, so re-appending them all made the hovered row's buttons blink
  // on every update (a like changes Liked Songs, which updates the queue). Ghosts from an earlier
  // update go to the end, so the first label stays the list's first child. Moving a node takes
  // focus off it, so the focused control gets it back.
  const focused = doc.activeElement as HTMLElement | null;
  const hadFocus = !!focused && list.contains(focused);
  list.querySelectorAll(":scope > .QueueGhost").forEach((el) => list!.appendChild(el));
  // Nodes on their way out (they turn into ghosts below) are stepped over, not moved around.
  const placed = new Set<Element>(ordered);
  let cursor = list.firstElementChild;
  for (const el of ordered) {
    while (cursor && !placed.has(cursor)) cursor = cursor.nextElementSibling;
    if (cursor === el) {
      cursor = el.nextElementSibling;
      continue;
    }
    list.insertBefore(el, cursor);
  }
  if (hadFocus && focused!.isConnected && doc.activeElement !== focused) {
    focused!.focus({ preventScroll: true });
  }
  CheckLikes(entries);

  // A node that left stays where it was, out of the flow, while it fades.
  const listRect = list.getBoundingClientRect();
  for (const { el, rect, opacity } of leaving) {
    el.classList.add("QueueGhost");
    el.classList.remove("Removing");
    el.style.top = `${rect.top - listRect.top}px`;
    el.style.height = `${rect.height}px`;
    list.appendChild(el);
    const fade = el.animate(
      [
        { opacity, transform: "translateY(0)" },
        { opacity: 0, transform: "translateY(-8px)" },
      ],
      { duration: 180, easing: EASE_OUT, fill: "forwards" }
    );
    const gone = () => {
      el.remove();
      DropScroller(el);
    };
    fade.onfinish = gone;
    fade.oncancel = gone;
  }

  if (firstRender) {
    EnterRows(ordered);
  } else if (animate) {
    // Last and Invert: kept nodes start from where they were and slide to their new place.
    // The user's own edit gets an answer that starts moving at once; changes that arrive on their
    // own (a song starting, an edit elsewhere) ease in and out.
    const easing = performance.now() - lastEditAt < EDIT_ANSWER_MS ? EASE_OUT : EASE_IN_OUT;
    nodes.forEach((el) => {
      if (created.has(el)) return;
      const from = before.get(el);
      if (!from) return;
      const dy = from.top - el.getBoundingClientRect().top;
      if (Math.abs(dy) < 0.5) return;
      el.animate([{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }], {
        duration: 280,
        easing,
      });
    });
    created.forEach((el) => {
      el.animate(
        [
          { opacity: 0, transform: "translateY(8px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { duration: 260, delay: 80, easing: EASE_OUT, fill: "backwards" }
      );
    });
  }
  hasRendered = true;
}

/**
 * Spotify hands out new uids for the whole context when it restarts it (replaying it, picking a
 * song from it). A row whose uid is gone is taken over by a new item for the same song in the same
 * section, in list order, so the same songs stay the same rows instead of all leaving and coming
 * back. Matching by uid comes first, so a song that is in the list twice keeps its own rows.
 */
function AdoptRows(entries: Entry[]) {
  const wanted = new Set(entries.map((e) => e.key));
  const spare = new Map<string, { key: string; el: HTMLElement }[]>();
  nodes.forEach((el, key) => {
    if (wanted.has(key) || !el.classList.contains("QueueRow")) return;
    const track = rowTracks.get(el);
    if (!track) return;
    const slot = `${el.classList.contains("Queued") ? "q" : "n"}:${track.uri}`;
    const list = spare.get(slot) ?? [];
    list.push({ key, el });
    spare.set(slot, list);
  });
  if (!spare.size) return;
  for (const entry of entries) {
    if (entry.kind !== "row" || nodes.has(entry.key)) continue;
    const match = spare.get(`${entry.queued ? "q" : "n"}:${entry.track.uri}`)?.shift();
    if (!match) continue;
    nodes.delete(match.key);
    nodes.set(entry.key, match.el);
  }
}

/** The first list after opening rises in a short cascade; anything below the first rows follows at once. */
function EnterRows(els: HTMLElement[]) {
  const reduce = reducedMotion();
  els.forEach((el, i) => {
    const delay = ENTER_DELAY_MS + Math.min(i, ENTER_STAGGER_ROWS) * ENTER_STAGGER_MS;
    el.animate(
      reduce
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0, transform: "translateY(10px)" },
            { opacity: 1, transform: "translateY(0)" },
          ],
      { duration: 280, delay, easing: EASE_OUT, fill: "backwards" }
    );
  });
}

function ClearList() {
  nodes.forEach((el) => el.remove());
  nodes.clear();
  list?.querySelectorAll(".QueueGhost").forEach((el) => el.remove());
  scrollers.forEach((scroller) => scroller.destroy());
  scrollers.clear();
}

function HideStatus() {
  if (!status) return;
  status.className = "QueueStatus";
  status.replaceChildren();
}

function ShowStatus(kind: "loading" | "empty" | "error") {
  if (!status) return;
  const doc = status.ownerDocument;
  status.className = `QueueStatus ${kind === "loading" ? "Loading" : "Message"}`;
  if (kind === "loading") {
    ClearList();
    const rows = Array.from({ length: 5 }, () => {
      const row = doc.createElement("div");
      row.className = "QueueSkeletonRow";
      row.innerHTML = `<span class="QueueSkeletonArt"></span><span class="QueueSkeletonText"><span></span><span></span></span>`;
      return row;
    });
    status.replaceChildren(...rows);
    status.setAttribute("aria-busy", "true");
    return;
  }
  status.removeAttribute("aria-busy");
  const title = doc.createElement("p");
  title.className = "QueueStatusTitle";
  const body = doc.createElement("p");
  body.className = "QueueStatusBody";
  if (kind === "empty") {
    title.textContent = "Nothing up next";
    body.textContent = "Songs you add to the queue show up here.";
    status.replaceChildren(title, body);
    return;
  }
  ClearList();
  title.textContent = "Couldn't load the queue";
  body.textContent = "Spotify didn't answer. Try again in a moment.";
  const retry = doc.createElement("button");
  retry.type = "button";
  retry.className = "QueueRetry";
  retry.textContent = "Try Again";
  retry.addEventListener("click", () => {
    HideStatus();
    void Load();
  });
  status.replaceChildren(title, body, retry);
}

// --- Actions ---

function PlayTrack(track: QueueTrack) {
  const api = playerApi();
  if (!api?.skipTo) return;
  Promise.resolve(api.skipTo({ uri: track.uri, uid: track.uid })).catch((err: unknown) =>
    queueLogger.warn("Couldn't play the queued song", err)
  );
}

function RemoveTrack(row: HTMLElement, track: QueueTrack, passFocus: boolean) {
  const api = playerApi();
  if (!api?.removeFromQueue || awaitingQueue.has(row)) return;
  row.classList.add("Removing");
  // Focus would fall back to the page with the button. From the keyboard, the nearest other row
  // takes it, the next one first, or the switch when this was the only row.
  if (passFocus && row.contains(row.ownerDocument.activeElement)) {
    const rows = [...(list?.querySelectorAll<HTMLElement>(":scope > .QueueRow:not(.QueueGhost)") ?? [])];
    const at = rows.indexOf(row);
    const target =
      rows[at + 1]?.querySelector<HTMLElement>(".QueuePlay") ??
      rows[at - 1]?.querySelector<HTMLElement>(".QueuePlay") ??
      CheckedOption();
    target?.focus({ preventScroll: true });
  }
  // The list answers at once from what it last showed; Spotify's own update follows and matches.
  lastEditAt = performance.now();
  if (lastState) {
    const keep = (t: QueueTrack) => t.uid !== track.uid;
    Render({ queued: lastState.queued.filter(keep), nextUp: lastState.nextUp.filter(keep) });
  }
  QueueEdit("remove the song from the queue", () =>
    api.removeFromQueue([{ uri: track.uri, uid: track.uid }])
  );
}

/**
 * Runs a queue edit after the ones before it. Spotify can leave an edit undone without an error
 * (the target moved on, another handler took the action), so the list is read again once the
 * last edit settles, whichever way it went; until then, updates wait.
 */
function QueueEdit(what: string, run: () => unknown) {
  editsPending++;
  // An answer that never comes would hold every update after it; past the limit, the list moves on.
  const limited = () =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("No answer from Spotify")), EDIT_TIMEOUT_MS);
      Promise.resolve()
        .then(run)
        .then(resolve, reject)
        .finally(() => clearTimeout(timer));
    });
  editChain = editChain
    .then(limited)
    .catch((err: unknown) => queueLogger.warn(`Couldn't ${what}`, err))
    .finally(() => {
      editsPending--;
      if (editsPending > 0) return;
      refreshHeld = true;
      ReleaseRefresh();
    });
}

function ReleaseRefresh() {
  if (!refreshHeld || drag?.started || editsPending > 0) return;
  refreshHeld = false;
  ScheduleRefresh();
}

// --- Likes ---

function KnownLike(track: QueueTrack): boolean | undefined {
  const known = liked.get(track.uri);
  if (known !== undefined) return known;
  try {
    const cached = libraryApi()?.containsSync?.(track.uri);
    if (typeof cached === "boolean") return cached;
  } catch {
    // An older build without the cache; the item's own field answers.
  }
  const field = track.metadata?.["collection.in_collection"];
  return field === "true" ? true : field === "false" ? false : undefined;
}

function PaintLike(button: HTMLElement, track: QueueTrack) {
  const on = KnownLike(track) === true;
  const name = track.name || "this song";
  button.setAttribute("aria-pressed", String(on));
  button.setAttribute("aria-label", on ? `Remove ${name} from Liked Songs` : `Save ${name} to Liked Songs`);
}

function SetLiked(uri: string, on: boolean) {
  liked.set(uri, on);
  nodes.forEach((el) => {
    const track = rowTracks.get(el);
    const like = track?.uri === uri ? el.querySelector<HTMLElement>(".QueueLike") : null;
    if (like) PaintLike(like, track!);
  });
}

function OnLibraryUpdate(event: any) {
  const data = event?.data ?? event;
  if (typeof data?.uri === "string" && typeof data?.isInLibrary === "boolean") {
    SetLiked(data.uri, data.isInLibrary);
  }
}

/** One question to the library per render, for the songs it hasn't answered for yet. */
function CheckLikes(entries: Entry[]) {
  const api = libraryApi();
  if (typeof api?.contains !== "function" || !CanLike()) return;
  const uris = [
    ...new Set(
      entries.flatMap((e) =>
        e.kind === "row" && Likeable(e.track) && !liked.has(e.track.uri) && !likeChecks.has(e.track.uri)
          ? [e.track.uri]
          : []
      )
    ),
  ];
  if (!uris.length) return;
  uris.forEach((uri) => likeChecks.add(uri));
  Promise.resolve(api.contains(...uris))
    .then((answer: unknown) => {
      if (!open || !Array.isArray(answer)) return;
      uris.forEach((uri, i) => {
        if (typeof answer[i] === "boolean") SetLiked(uri, answer[i]);
      });
    })
    .catch((err: unknown) => queueLogger.warn("Couldn't read which songs are liked", err))
    .finally(() => uris.forEach((uri) => likeChecks.delete(uri)));
}

function ToggleLike(row: HTMLElement, animate: boolean) {
  const track = rowTracks.get(row);
  const api = libraryApi();
  if (!track || !api) return;
  const on = KnownLike(track) !== true;
  SetLiked(track.uri, on);
  // Liking answers with the heart filling in from a little smaller; taking it back just empties.
  const glyph = row.querySelector<SVGElement>(".QueueLike svg");
  if (on && animate && glyph && !reducedMotion()) {
    glyph.animate([{ scale: "0.8" }, { scale: "1" }], { duration: 220, easing: EASE_OUT });
  }
  const uris = [track.uri];
  Promise.resolve(on ? api.add({ uris }) : api.remove({ uris })).catch((err: unknown) => {
    queueLogger.warn(on ? "Couldn't like the song" : "Couldn't unlike the song", err);
    SetLiked(track.uri, !on);
  });
}

// --- Moving ---

/** The queue with `track` moved to `target`, for the list to answer with before Spotify does. */
function StateFromMove(state: QueueState, track: QueueTrack, target: MoveTarget): QueueState {
  const same = (t: QueueTrack) => t.uid === track.uid;
  const queued = state.queued.filter((t) => !same(t));
  const nextUp = state.nextUp.filter((t) => !same(t));
  const anchor = "before" in target ? target.before : target.after;
  const shift = "before" in target ? 0 : 1;
  const inQueue = queued.findIndex((t) => t.uid === anchor.uid);
  if (inQueue >= 0) {
    queued.splice(inQueue + shift, 0, { ...track, provider: "queue" });
    return { queued, nextUp };
  }
  const inNext = nextUp.findIndex((t) => t.uid === anchor.uid);
  if (inNext < 0) return state;
  nextUp.splice(inNext + shift, 0, { ...track, provider: track.provider === "queue" ? "context" : track.provider });
  return { queued, nextUp };
}

/**
 * Shows a move at once and sends it to Spotify. `snap` puts the rows straight in place: a key held
 * for a few moves would otherwise wait on each slide. False when the move wasn't made.
 */
function CommitMove(row: HTMLElement, target: MoveTarget, snap = false): boolean {
  const track = rowTracks.get(row);
  const api = playerApi();
  if (!track || !lastState || typeof api?.reorderQueue !== "function" || awaitingQueue.has(row)) return false;
  const anchor = "before" in target ? target.before : target.after;
  if (anchor.uid === track.uid || awaitingUids.has(anchor.uid)) return false;
  lastEditAt = performance.now();
  snapNextRender = snap;
  Render(StateFromMove(lastState, track, target));
  awaitingQueue.add(row);
  awaitingUids.add(track.uid);
  const ref = (t: QueueTrack) => ({ uri: t.uri, uid: t.uid });
  const position = "before" in target ? { before: ref(target.before) } : { after: ref(target.after) };
  QueueEdit("move the song", () => api.reorderQueue([ref(track)], position));
  return true;
}

/** The rows and labels in list order, without the ones fading out or the count at the end. */
const ListItems = () =>
  [...(list?.children ?? [])].filter(
    (el): el is HTMLElement =>
      el instanceof HTMLElement &&
      !el.classList.contains("QueueGhost") &&
      (el.classList.contains("QueueRow") || el.classList.contains("QueueLabel"))
  );

const IsRow = (el: Element | undefined): boolean =>
  !!el && el.classList.contains("QueueRow") && !el.classList.contains("Autoplay");

/**
 * Alt+Up / Alt+Down move the focused row one place. Across a section's edge the row joins the
 * neighbouring section: up from the top of what plays next onto the end of the queue, down from
 * the end of the queue under the first song after it.
 */
function MoveByKey(row: HTMLElement, step: -1 | 1) {
  const track = rowTracks.get(row);
  if (!track || !CanReorder() || !Movable(track)) return;
  const items = ListItems();
  const at = items.indexOf(row);
  let target: MoveTarget | null = null;
  const trackOf = (el: HTMLElement) => rowTracks.get(el);
  if (step < 0) {
    const prev = items[at - 1];
    if (IsRow(prev)) target = { before: trackOf(prev)! };
    else if (prev && IsRow(items[at - 2])) target = { after: trackOf(items[at - 2])! };
  } else {
    const next = items[at + 1];
    if (IsRow(next)) target = { after: trackOf(next)! };
    else if (next?.classList.contains("QueueLabel") && !next.classList.contains("AutoplayLabel") && IsRow(items[at + 2])) {
      target = { after: trackOf(items[at + 2])! };
    }
  }
  if (!target || awaitingQueue.has(row)) return;
  if (CommitMove(row, target, true)) announceRow = row;
}

function AnnounceMove(row: HTMLElement) {
  if (!announcer) return;
  const items = ListItems();
  let section = "";
  let position = 0;
  let count = 0;
  let found = false;
  for (const el of items) {
    if (el.classList.contains("QueueLabel")) {
      if (found) break;
      section = el.querySelector(".QueueLabelText")?.textContent ?? "";
      position = count = 0;
      continue;
    }
    count++;
    if (el === row) {
      position = count;
      found = true;
    }
  }
  const name = rowTracks.get(row)?.name || "Song";
  announcer.textContent = `${name} moved to ${position} of ${count}${section ? `, ${section}` : ""}`;
}

// --- Dragging ---

/*
 * A row is dragged by itself: press and move a few pixels, and it lifts and follows the pointer.
 * The row moves through the list as it goes (the others slide aside), so the list always shows
 * where it will land. Escape puts it back. Touch scrolls instead.
 *
 * What follows the pointer is a copy of the row (QueueFloat) outside the scrolling list; the row
 * itself stays in the list as the gap it will fill. The list's fade mask makes it a backdrop root,
 * so a frosted surface inside it would show nothing; the copy also stays whole past the fades.
 */

const DRAG_THRESHOLD = 5;
const DRAG_EDGE = 56;
/** The list scrolls under a row held at its edge at up to this many pixels a second. */
const DRAG_SCROLL_MAX = 900;
const DRAG_SLIDE_MS = 200;

type Drag = {
  row: HTMLElement;
  handle: HTMLElement;
  pointerId: number;
  startY: number;
  y: number;
  /** Where the pointer holds the row, from the row's top. */
  grab: number;
  started: boolean;
  /** The row's neighbours before the drag: to tell whether it moved, and to put it back. */
  homePrev: Element | null;
  homeNext: Element | null;
  frame: number;
  /** The copy under the pointer, in .QueueInner. */
  float: HTMLElement | null;
  /** The last frame's time and what it drew from, so a still pointer costs nothing. */
  at: number;
  drawn: string;
  view: Window;
};
let drag: Drag | null = null;
let swallowClick = false;

function PressRow(row: HTMLElement, handle: HTMLElement, event: PointerEvent) {
  FinishSettle();
  const track = rowTracks.get(row);
  if (
    drag ||
    event.button !== 0 ||
    event.pointerType === "touch" ||
    !open ||
    !track ||
    !Movable(track) ||
    !CanReorder() ||
    awaitingQueue.has(row) ||
    !row.ownerDocument.defaultView
  ) {
    return;
  }
  const view = row.ownerDocument.defaultView;
  drag = {
    row,
    handle,
    pointerId: event.pointerId,
    startY: event.clientY,
    y: event.clientY,
    grab: event.clientY - row.getBoundingClientRect().top,
    started: false,
    homePrev: null,
    homeNext: null,
    frame: 0,
    float: null,
    at: 0,
    drawn: "",
    view,
  };
  view.addEventListener("pointermove", OnDragMove, true);
  view.addEventListener("pointerup", OnDragUp, true);
  view.addEventListener("pointercancel", OnDragCancel, true);
  view.addEventListener("keydown", OnDragKey, true);
  // Focus leaving the window (Alt+Tab mid-drag) takes the pointer with it.
  view.addEventListener("blur", OnDragBlur);
}

function OnDragMove(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  drag.y = event.clientY;
  if (drag.started || Math.abs(drag.y - drag.startY) < DRAG_THRESHOLD) return;
  StartDrag();
}

function StartDrag() {
  if (!drag || !list || !panel) return;
  drag.started = true;
  try {
    drag.handle.setPointerCapture(drag.pointerId);
    drag.handle.addEventListener("lostpointercapture", OnDragLost);
  } catch {
    // The pointer is already gone; the up listener still ends the drag.
  }
  // Updates pending or in flight would fight the drag for the rows; they are dropped and the
  // queue is read again once the row is let go.
  if (refreshTimer !== null) clearTimeout(refreshTimer);
  refreshTimer = null;
  refreshHeld = true;
  loadGeneration++;
  nodes.forEach((el) => el.getAnimations().forEach((a) => a.cancel()));
  drag.homePrev = PrevItem(drag.row);
  drag.homeNext = NextItem(drag.row);
  drag.float = BuildFloat(drag.row);
  drag.row.classList.add("DragGap");
  panel.classList.add("Dragging");
  drag.at = performance.now();
  const tick = (now: number) => {
    if (!drag?.started) return;
    DragFrame(now);
    drag.frame = drag.view.requestAnimationFrame(tick);
  };
  drag.frame = drag.view.requestAnimationFrame(tick);
}

function DragFrame(now: number) {
  if (!drag || !list) return;
  const dt = Math.min(0.05, Math.max(0, (now - drag.at) / 1000));
  drag.at = now;
  const scroller = list.parentElement;
  if (scroller) {
    const box = scroller.getBoundingClientRect();
    const top = drag.y - box.top;
    const bottom = box.bottom - drag.y;
    // Near an edge the list scrolls under the row, faster the closer the pointer gets. By time,
    // not by frame, so a fast display doesn't scroll faster.
    const speed = (into: number) => DRAG_SCROLL_MAX * Math.min(1, (DRAG_EDGE - into) / DRAG_EDGE) * dt;
    if (top < DRAG_EDGE) scroller.scrollTop -= speed(top);
    else if (bottom < DRAG_EDGE) scroller.scrollTop += speed(bottom);
  }
  const drawn = `${drag.y}:${scroller?.scrollTop ?? 0}`;
  if (drawn === drag.drawn) return;
  drag.drawn = drawn;
  const listTop = list.getBoundingClientRect().top;
  const rowTop = drag.y - drag.grab - listTop;
  PlaceDragged(rowTop + drag.row.offsetHeight / 2);
  const float = drag.float;
  const inner = float?.parentElement;
  if (float && inner) {
    // It stays over the list: the row can't land above the first heading or past the end.
    let top = drag.y - drag.grab;
    const first = ListItems()[0];
    const bounds = scroller?.getBoundingClientRect();
    if (bounds) {
      // Past either end of the list it follows the pointer less the further it goes, rather than
      // stopping dead, and it never leaves the list's box (over the title, off the window).
      const floor = Math.min(bounds.bottom, drag.view.innerHeight) - float.offsetHeight;
      const last = ListItems().at(-1);
      const min = Math.max(bounds.top, first ? first.getBoundingClientRect().bottom : bounds.top);
      const max = Math.min(floor, last ? last.getBoundingClientRect().bottom - float.offsetHeight : floor);
      if (top < min) top = min - RubberBand(min - top, bounds.height);
      else if (top > max) top = max + RubberBand(top - max, bounds.height);
      top = Math.min(Math.max(top, bounds.top), floor);
    }
    float.style.translate = `0 ${top - inner.getBoundingClientRect().top}px`;
  }
}

/** Moves the dragged row to the place its middle is over, sliding the rows it passes. */
function PlaceDragged(middle: number) {
  if (!drag || !list) return;
  const row = drag.row;
  const items = ListItems().filter((el) => el !== row);
  let before: HTMLElement | null = null;
  for (const el of items) {
    if (el.offsetTop + el.offsetHeight / 2 > middle) {
      before = el;
      break;
    }
  }
  // Never above the first heading, and never in among the autoplay picks.
  if (before === items[0]) before = items[1] ?? null;
  const autoplay = items.find((el) => el.classList.contains("AutoplayLabel")) ?? null;
  if (autoplay && (!before || items.indexOf(before) > items.indexOf(autoplay))) before = autoplay;
  // Already there: `before` is null at the end, as NextItem is. A move touches every row's style,
  // so a frame that doesn't need one must not make one.
  if (before === NextItem(row)) return;
  const anchor = before ?? list.querySelector(":scope > .QueueMore");

  const reduce = reducedMotion();
  const from = new Map(items.map((el) => [el, el.getBoundingClientRect().top]));
  items.forEach((el) => el.getAnimations().forEach((a) => a.cancel()));
  list.insertBefore(row, anchor);
  if (reduce) return;
  for (const el of items) {
    const dy = from.get(el)! - el.getBoundingClientRect().top;
    if (Math.abs(dy) < 0.5) continue;
    el.animate([{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }], {
      duration: DRAG_SLIDE_MS,
      easing: EASE_OUT,
    });
  }
}

/** The row or label after `el`, past the ones fading out. */
function NextItem(el: Element): Element | null {
  let next = el.nextElementSibling;
  while (next && next.classList.contains("QueueGhost")) next = next.nextElementSibling;
  return next && !next.classList.contains("QueueMore") ? next : null;
}

function PrevItem(el: Element): Element | null {
  let prev = el.previousElementSibling;
  while (prev && prev.classList.contains("QueueGhost")) prev = prev.previousElementSibling;
  return prev;
}

/** Where the row now sits in the list, as a move: after the row above it, or before the one below. */
function DropTarget(row: HTMLElement): MoveTarget | null {
  // A row moved since the list was read still carries its old id, so the other neighbour anchors.
  const anchorOf = (el: Element | null | undefined) => {
    const track = el?.classList.contains("QueueRow") ? rowTracks.get(el as HTMLElement) : undefined;
    return track && !awaitingUids.has(track.uid) ? track : undefined;
  };
  const above = anchorOf(PrevItem(row));
  if (above) return { after: above };
  const below = anchorOf(NextItem(row));
  return below ? { before: below } : null;
}

function OnDragUp(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  EndDrag("drop");
}

function OnDragCancel(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  EndDrag("cancel");
}

// Moving the row through the list takes it out of the document for a moment, which drops the
// capture; the drag carries on and takes it back. Only a pointer that is really gone ends it.
function OnDragLost() {
  if (!drag?.started) return;
  try {
    drag.handle.setPointerCapture(drag.pointerId);
  } catch {
    EndDrag("cancel");
  }
}

function OnDragBlur() {
  EndDrag("cancel");
}

function OnDragKey(event: KeyboardEvent) {
  if (!drag?.started || event.key !== "Escape") return;
  event.preventDefault();
  event.stopPropagation();
  EndDrag("cancel");
}

/** Ends a press or a drag. A drop sends the move; a cancel puts the row back where it was. */
function EndDrag(how: "drop" | "cancel", animate = true) {
  const current = drag;
  if (!current) return;
  drag = null;
  const { row, view } = current;
  view.removeEventListener("pointermove", OnDragMove, true);
  view.removeEventListener("pointerup", OnDragUp, true);
  view.removeEventListener("pointercancel", OnDragCancel, true);
  view.removeEventListener("keydown", OnDragKey, true);
  view.removeEventListener("blur", OnDragBlur);
  current.handle.removeEventListener("lostpointercapture", OnDragLost);
  if (!current.started) return;
  view.cancelAnimationFrame(current.frame);
  try {
    current.handle.releasePointerCapture(current.pointerId);
  } catch {
    // Already released.
  }
  // The pointer comes up over the row either way; that click mustn't play the song.
  // After Escape the button is still held, so the click comes with the release, whenever that is.
  // If none comes (released outside the window), the next press clears the flag.
  swallowClick = true;
  view.addEventListener("pointerdown", () => (swallowClick = false), { capture: true, once: true });
  panel?.classList.remove("Dragging");

  const moved = PrevItem(row) !== current.homePrev || NextItem(row) !== current.homeNext;
  const target = how === "drop" && moved && row.isConnected ? DropTarget(row) : null;
  // A cancelled drag, or a drop that couldn't be sent, goes back where it was.
  if (moved && !(target && CommitMove(row, target)) && list && row.isConnected) {
    if (current.homeNext?.parentElement === list) list.insertBefore(row, current.homeNext);
    else if (current.homePrev?.parentElement === list) current.homePrev.after(row);
  }
  // The press focused the row's button; a key pressed after (Escape) would ring it as if tabbed to.
  if (row.ownerDocument.activeElement === current.handle) current.handle.blur();
  Settle(row, current.float, animate);
  ReleaseRefresh();
}

const RubberBand = (overshoot: number, size: number) =>
  (overshoot * size * 0.55) / (size + 0.55 * overshoot);

/** The row's copy that follows the pointer, laid over the row where it is now. */
function BuildFloat(row: HTMLElement): HTMLElement | null {
  const inner = panel?.querySelector<HTMLElement>(".QueueInner");
  if (!inner) return null;
  const at = row.getBoundingClientRect();
  const box = inner.getBoundingClientRect();
  // A copy doesn't carry the row's scroll, so both start over from the start: the copy then shows
  // what the row does, and Settle restarts the row again so they match when it's revealed.
  scrollers.get(row)?.refresh();
  const float = row.cloneNode(true) as HTMLElement;
  float.classList.remove("DragGap");
  float.classList.add("QueueFloat");
  float.setAttribute("inert", "");
  float.setAttribute("aria-hidden", "true");
  float.querySelectorAll("img").forEach((img) => (img.loading = "eager"));
  float.style.left = `${at.left - box.left}px`;
  float.style.width = `${at.width}px`;
  // On `translate`, not `transform`: the lift's `scale` applies outside `transform`, so it would
  // scale the whole offset and drift the card off the pointer the further down the list it is.
  float.style.translate = `0 ${at.top - box.top}px`;
  inner.appendChild(float);
  // A frame at rest first, so the lift (scale and shadow) eases in.
  void float.offsetWidth;
  float.classList.add("Lifted");
  return float;
}

let settling: { row: HTMLElement; float: HTMLElement; animation: Animation } | null = null;

/** The copy glides into the row's place and gives way to it. */
function Settle(row: HTMLElement, float: HTMLElement | null, animate: boolean) {
  const reveal = () => {
    float?.remove();
    row.classList.remove("DragGap");
    if (float) scrollers.get(row)?.refresh();
  };
  const inner = float?.parentElement;
  if (!float || !inner || !animate || !row.isConnected || reducedMotion()) {
    reveal();
    return;
  }
  // From its own offset: its box is scaled by the lift, which would shift a measured top.
  const from = Number.parseFloat(float.style.translate.split(" ")[1] ?? "") || 0;
  const to = row.getBoundingClientRect().top - inner.getBoundingClientRect().top;
  float.classList.remove("Lifted");
  // The glass clears over the glide (QueueView.css), to the hover fill when the pointer is still
  // over the row, so the row takes over from a card that already looks like it.
  float.classList.add("Settling");
  float.classList.toggle("SettleHover", row.matches(":hover"));
  float.style.translate = `0 ${to}px`;
  const animation = float.animate(
    [{ translate: `0 ${from}px` }, { translate: `0 ${to}px` }],
    { duration: 240, easing: EASE_OUT }
  );
  settling = { row, float, animation };
  const done = () => {
    if (settling?.float === float) settling = null;
    reveal();
  };
  animation.onfinish = done;
  animation.oncancel = done;
}

function FinishSettle() {
  settling?.animation.cancel();
  settling = null;
}

// Clearing can't be undone, so it takes a second press: the first one arms it for a few seconds.
function OnClear(button: HTMLButtonElement) {
  if (!button.classList.contains("Armed")) {
    DisarmClear();
    button.classList.add("Armed");
    button.textContent = "Clear Queue?";
    clearArmed = setTimeout(DisarmClear, CLEAR_CONFIRM_MS);
    return;
  }
  DisarmClear();
  const api = playerApi();
  if (typeof api?.clearQueue !== "function") return;
  QueueEdit("clear the queue", () => api.clearQueue());
}

function DisarmClear() {
  if (clearArmed) clearTimeout(clearArmed);
  clearArmed = null;
  panel?.querySelectorAll<HTMLElement>(".QueueClear.Armed").forEach((b) => {
    b.classList.remove("Armed");
    b.textContent = "Clear";
  });
}

// --- Lyrics / Queue switch ---

/*
 * Two radio buttons under three stacked layers that share one coordinate box (QueueView.css): a
 * white plate with both glyphs cut out, shown only where the thumb is, and each plain glyph, shown
 * only where the thumb isn't. All three are clipped by the thumb's position, so moving the thumb
 * slides the plate and hands each glyph over at the same edge.
 */

// The track in the knockout disc's units: two 48-unit buttons and the capsule's 0.2 gap.
const SWITCH_GAP = 9.6;
const SWITCH_WIDTH = 48 * 2 + SWITCH_GAP;

const GlyphBody = (icon: string) => icon.match(/<svg[^>]*>([\s\S]*)<\/svg>/)?.[1] ?? "";
const GlyphAt = (icon: string, x: number) =>
  `<g transform="translate(${x + 12} 12)">${GlyphBody(icon)}</g>`;
const Strokes = (body: string, color: string) =>
  `<g fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</g>`;
// The clip sits on an HTML box: on the <svg> itself Chrome clipped the disc against the wrong edges.
const LayerSvg = (cls: string, body: string) =>
  `<div class="ViewSwitchLayer ${cls}" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SWITCH_WIDTH} 48" overflow="visible">${body}</svg></div>`;
// The plate bleeds past the box so the disc's edge is the clip's curve, not the plate's.
const BLEED = 6;
const Plate = (attrs: string) =>
  `<rect x="${-BLEED}" y="${-BLEED}" width="${SWITCH_WIDTH + BLEED * 2}" height="${48 + BLEED * 2}" ${attrs}/>`;

function BuildSwitch(doc: Document): HTMLElement {
  const root = doc.createElement("div");
  root.className = "ViewSwitch";
  const lyrics = GlyphAt(Icons.Lyrics, 0);
  const queue = GlyphAt(Icons.Queue, 48 + SWITCH_GAP);
  const mask = `SL_ViewSwitchMask_${Math.random().toString(36).slice(2, 8)}`;
  // Seats on either side of the track: the scroll-to-active button while it is shown
  // (ScrollToActiveLine.ts), and the romanization toggle while the lyrics can be romanized.
  root.innerHTML = `<div class="ViewSwitchSeat ViewSwitchSeat_Scroll"></div><div class="ViewSwitchTrack" role="radiogroup" aria-label="Show"><button type="button" class="ViewSwitchOption" role="radio" data-view="lyrics" aria-label="Lyrics"></button><button type="button" class="ViewSwitchOption" role="radio" data-view="queue" aria-label="Queue"></button>${LayerSvg(
    "ViewSwitchGlyph ViewSwitchGlyph_Lyrics",
    Strokes(lyrics, "currentColor")
  )}${LayerSvg("ViewSwitchGlyph ViewSwitchGlyph_Queue", Strokes(queue, "currentColor"))}${LayerSvg(
    "ViewSwitchThumb",
    `<mask id="${mask}" maskUnits="userSpaceOnUse" x="${-BLEED}" y="${-BLEED}" width="${SWITCH_WIDTH + BLEED * 2}" height="${48 + BLEED * 2}">${Plate(`fill="#fff"`)}${Strokes(lyrics + queue, "#000")}</mask>${Plate(`fill="#fff" mask="url(#${mask})"`)}`
  )}</div><div class="ViewSwitchSeat ViewSwitchSeat_Romanize"></div>`;

  const options = [...root.querySelectorAll<HTMLButtonElement>(".ViewSwitchOption")];
  const pick = (view: string | undefined) => {
    if (view === "queue") OpenQueue();
    else CloseQueue();
  };
  for (const option of options) {
    option.addEventListener("click", () => pick(option.dataset.view));
    const tip = createTooltip(option, {
      ...(Spicetify as any).TippyProps,
      placement: "top",
      content: option.getAttribute("aria-label"),
    });
    if (tip) switchTooltips.push(tip);
  }
  // A radio group: arrows move the choice, Tab leaves the group. The seat's button is outside it.
  root.addEventListener("keydown", (event) => {
    const step = ({ ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 } as Record<string, number>)[
      event.key
    ];
    if (!step || !(event.target as HTMLElement | null)?.closest(".ViewSwitchOption")) {
      KeepKeys(event);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const at = options.findIndex((o) => o.getAttribute("aria-checked") === "true");
    const next = options[Math.min(options.length - 1, Math.max(0, at + step))];
    pick(next.dataset.view);
    next.focus({ preventScroll: true });
  });
  root.addEventListener("click", ReleasePointerFocus);
  return root;
}

/**
 * Puts the switch on the page where the queue can open and takes it off everywhere else. Called
 * whenever the view controls are rebuilt, which every change of view goes through.
 */
export function SyncViewSwitch() {
  const box = PageContainer?.querySelector<HTMLElement>(".ContentBox") ?? null;
  if (!box || !CanShowQueue()) {
    RemoveSwitch();
    return;
  }
  if (viewSwitch?.isConnected && viewSwitch.parentElement === box) return;
  RemoveSwitch(false);
  viewSwitch = BuildSwitch(box.ownerDocument);
  // Start in the state the other controls are in, so it doesn't fade on its own when it mounts.
  const controls = box.querySelector<HTMLElement>(".NowBar .Header .MediaBox")?.dataset.controls;
  if (controls) viewSwitch.dataset.controls = controls;
  SyncToggle();
  box.appendChild(viewSwitch);
  // What shares its corner steps aside while it shows (ViewSwitchClearance.ts).
  WatchViewSwitch(viewSwitch);
  Global.Event.evoke("view-switch:changed", null);
}

/**
 * Moves the romanization toggle out of the view controls into the switch's corner seat, with its
 * handlers and tooltip. Called after each build of the controls (PageView.ts), which replaces it.
 * Its seat opens while the lyrics can be romanized (QueueView.css), as the button in the controls
 * shows only then.
 */
export function SeatRomanizationToggle() {
  const seat = viewSwitch?.querySelector<HTMLElement>(".ViewSwitchSeat_Romanize");
  const toggle = PageContainer?.querySelector<HTMLElement>(".ViewControls #RomanizationToggle");
  if (seat && toggle) seat.replaceChildren(toggle);
}

function RemoveSwitch(announce = true) {
  if (!viewSwitch) return;
  for (const tip of switchTooltips) tip.destroy?.();
  switchTooltips = [];
  WatchViewSwitch(null);
  viewSwitch.remove();
  viewSwitch = null;
  // The scroll-to-active button goes back to floating over the lyrics (ScrollToActiveLine.ts).
  if (announce) Global.Event.evoke("view-switch:changed", null);
}

// --- NowBar side swap ---

/*
 * Swapping the NowBar's side glides the lyrics across with the NowBar's own `left 0.4s` (ease).
 * The panel and the switch would jump to the other side, so they make the same trip: measured
 * before and after the swap and played back from where they stood. Measuring includes a slide
 * still running, so a second swap mid-way picks up from there.
 */
const SIDE_SWAP_MS = 400;
let sideSwapStarts: { el: HTMLElement; x: number }[] = [];
let sideSwapAnimations: Animation[] = [];

function SideSwapTargets(): HTMLElement[] {
  const inner = open ? panel?.querySelector<HTMLElement>(".QueueInner") : null;
  return [inner, viewSwitch].filter((el): el is HTMLElement => !!el?.isConnected);
}

Global.Event.listen("nowbar:side-swap:before", () => {
  sideSwapStarts = SideSwapTargets().map((el) => ({ el, x: el.getBoundingClientRect().left }));
});

Global.Event.listen("nowbar:side-swap:after", () => {
  // The switch changed corners without changing size.
  RefreshSwitchClearance();
  const starts = sideSwapStarts;
  sideSwapStarts = [];
  for (const animation of sideSwapAnimations) animation.cancel();
  sideSwapAnimations = [];
  const view = (viewSwitch ?? panel)?.ownerDocument.defaultView;
  const reduce = !!view?.matchMedia("(prefers-reduced-motion: reduce)").matches;
  for (const { el, x } of starts) {
    if (!el.isConnected) continue;
    const dx = x - el.getBoundingClientRect().left;
    if (Math.abs(dx) < 1) continue;
    // Reduced motion: no travel, the content fades in where it now is.
    sideSwapAnimations.push(
      reduce
        ? // Only a start keyframe: it fades up to whatever the element rests at (the switch sits
          // at 0.65 or 0).
          el.animate([{ opacity: 0, offset: 0 }], { duration: 200, easing: "ease" })
        : el.animate([{ translate: `${dx}px 0` }, { translate: "0 0" }], {
            duration: SIDE_SWAP_MS,
            easing: "ease",
          })
    );
  }
});

// --- Lifetime ---

for (const event of ["fullscreen:exit", "page:destroy"]) {
  Global.Event.listen(event, () => {
    CloseQueue(true);
    RemoveSwitch();
  });
}
