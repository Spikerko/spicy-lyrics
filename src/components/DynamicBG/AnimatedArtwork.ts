import "../../css/AnimatedArtwork.css";
import { getRemoteConfig } from "../../utils/remoteConfig.ts";
import { $motionArtwork } from "../../utils/stores.ts";
import Global from "../Global/Global.ts";
import { SpotifyPlayer } from "../Global/SpotifyPlayer.ts";
import { IsCardMode, PageContainer } from "../Pages/PageView.ts";
import { GetArtworkPlacement } from "./CanvasImmersive.ts";
import {
  ForgetArtworkUrl,
  GetAlbumUpc,
  GetArtworkUrl,
  IsMissed,
  IsMotionArtworkEnabled,
  KnownAlbumUpc,
  MarkAvailable,
  MarkMissed,
  PlayingAlbumId,
  type ArtworkUrl,
} from "./MotionArtworkSource.ts";

// Motion artwork on the NowBar cover: a looping video laid over the still cover, which stays
// untouched underneath, so no video (missing, loading, failed) simply shows the cover.

// Each UPC's signed URL is reused (MotionArtworkSource.ts). An error on a reused URL re-signs;
// two errors on fresh ones before any frame played mark the UPC as having no video for a while.

// Matches the transitions in AnimatedArtwork.css.
const FADE_IN_MS = 500;
const FADE_OUT_MS = 250;
// The cover's own swap (NowBar.ts) is about 1.1 s plus its blur fade. The video waits for it.
const COVER_SETTLE_POLL_MS = 100;
const COVER_SETTLE_MAX_MS = 3000;

const VISIBLE_CLASS = "Visible";

type Load = {
  albumId: string;
  // undefined until the metadata gives a definite answer; null when the album has no UPC.
  upc: string | null | undefined;
  cancelled: boolean;
  // Errors since a frame last played. Two in a row mean there is no video.
  failures: number;
  // Nothing starts before this time (rapid skips, or a signer that just failed).
  startAfter: number;
  // A metadata, sign or video start is in flight.
  busy: boolean;
};

type Slot = {
  load: Load;
  source: ArtworkUrl;
  video: HTMLVideoElement;
  played: boolean;
  timeout: ReturnType<typeof setTimeout> | null;
  cleanup: AbortController;
};

// The album wanted right now, with its UPC once known.
let currentLoad: Load | null = null;
// On screen (or fading in).
let shownSlot: Slot | null = null;
// Loading, not yet on screen. Replaces shownSlot once it plays.
let pendingSlot: Slot | null = null;
let observedDocument: Document | null = null;
// Holds a video on screen through a brief album change; see Refresh.
let settleTimer: ReturnType<typeof setTimeout> | null = null;
let settled = false;

function getContainer(): HTMLElement | null {
  return PageContainer?.querySelector<HTMLElement>(".ContentBox .NowBar .Header .MediaBox .MediaImageContainer") ?? null;
}

function isNowBarShown(): boolean {
  return !!PageContainer?.classList.contains("NowBarStatus__Open");
}

function shouldPlay(): boolean {
  const doc = PageContainer?.ownerDocument;
  const placement = GetArtworkPlacement();
  return !!doc && !doc.hidden && isNowBarShown() && (placement.cover || placement.pending);
}

function createVideo(): HTMLVideoElement {
  const video = document.createElement("video");
  video.className = "AnimatedArtwork";
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.autoplay = true;
  video.preload = "auto";
  video.disablePictureInPicture = true;
  video.setAttribute("aria-hidden", "true");
  return video;
}

// Stops and removes a video. A fresh element is made for every load, so nothing scanning the
// page for videos finds a dead one holding its old source.
function disposeSlot(slot: Slot) {
  if (slot.timeout) clearTimeout(slot.timeout);
  slot.timeout = null;
  slot.cleanup.abort();
  slot.video.pause();
  slot.video.removeAttribute("src");
  slot.video.load();
  slot.video.remove();
  if (shownSlot === slot) shownSlot = null;
  if (pendingSlot === slot) pendingSlot = null;
}

function fadeOutSlot(slot: Slot) {
  if (shownSlot === slot) shownSlot = null;
  if (pendingSlot === slot) pendingSlot = null;
  slot.cleanup.abort();
  if (slot.timeout) clearTimeout(slot.timeout);
  slot.timeout = null;
  if (!slot.video.classList.contains(VISIBLE_CLASS)) {
    disposeSlot(slot);
    return;
  }
  slot.video.classList.remove(VISIBLE_CLASS);
  setTimeout(() => disposeSlot(slot), FADE_OUT_MS + 50);
}

function clearSettle() {
  if (settleTimer) clearTimeout(settleTimer);
  settleTimer = null;
  settled = false;
}

function dropEverything() {
  clearSettle();
  if (currentLoad) currentLoad.cancelled = true;
  currentLoad = null;
  if (pendingSlot) disposeSlot(pendingSlot);
  if (shownSlot) fadeOutSlot(shownSlot);
}

function syncPlayback() {
  const play = shouldPlay();
  for (const slot of [shownSlot, pendingSlot]) {
    if (!slot) continue;
    if (play) slot.video.play().catch(() => undefined);
    else slot.video.pause();
  }
}

// True once the static cover shows the playing track's art and isn't mid-swap.
function coverSettled(container: HTMLElement): boolean {
  if (container.querySelector(".MB_anim_enter, .MB_anim_fimg")) return false;
  const cover = SpotifyPlayer.GetCover("xlarge");
  return !cover || container.getAttribute("last-image") === cover;
}

async function waitForCover(container: HTMLElement, load: Load): Promise<void> {
  const start = performance.now();
  while (!coverSettled(container) && performance.now() - start < COVER_SETTLE_MAX_MS) {
    await new Promise((resolve) => setTimeout(resolve, COVER_SETTLE_POLL_MS));
    if (load.cancelled) return;
  }
}

async function reveal(slot: Slot, container: HTMLElement) {
  await waitForCover(container, slot.load);
  if (slot.load.cancelled || pendingSlot !== slot || !slot.video.isConnected) return;
  const previous = shownSlot;
  pendingSlot = null;
  shownSlot = slot;
  slot.video.classList.add(VISIBLE_CLASS);
  // The new video is above the old one, so the old one goes once it is covered.
  if (previous && previous !== slot) setTimeout(() => disposeSlot(previous), FADE_IN_MS + 50);
}

function onSlotFailed(slot: Slot) {
  if (slot.load.cancelled || (slot !== shownSlot && slot !== pendingSlot)) return;
  const { load } = slot;
  if (load.upc) ForgetArtworkUrl(load.upc, slot.source.url);
  // A reused URL failing is most likely an expired signature, not a missing video.
  if (!slot.source.reused) load.failures++;
  if (load.failures >= 2) {
    if (load.upc) MarkMissed(load.upc);
    if (pendingSlot) fadeOutSlot(pendingSlot);
    if (shownSlot) fadeOutSlot(shownSlot);
    return;
  }
  // One more try with a new signature. A video that was on screen stays there (on its last
  // frame) until the new one plays over it.
  if (slot === pendingSlot) disposeSlot(slot);
  void ensureLoaded(load, true);
}

// Resolves the UPC if needed, signs and starts a video for the wanted album. `replace` lets it
// load next to a video already on screen (the re-sign after an error).
async function ensureLoaded(load: Load, replace = false) {
  if (load.busy || load.cancelled || currentLoad !== load) return;
  if (pendingSlot?.load === load || (!replace && shownSlot?.load === load)) return;
  load.busy = true;
  try {
    const wait = load.startAfter - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    if (load.cancelled || !isNowBarShown()) return;

    if (load.upc === undefined) {
      await GetAlbumUpc(load.albumId);
      if (load.cancelled) return;
      // A failed lookup leaves it undefined, so a later refresh asks again.
      const upc = KnownAlbumUpc(load.albumId);
      if (upc !== undefined) load.upc = upc;
    }
    if (!load.upc || IsMissed(load.upc)) return;
    await startVideo(load);
  } finally {
    load.busy = false;
  }
}

async function startVideo(load: Load) {
  if (!load.upc || !getContainer()) return;
  const source = await GetArtworkUrl(load.upc);
  if (load.cancelled || currentLoad !== load) return;
  if (!source) {
    load.startAfter = Date.now() + getRemoteConfig().animatedArtwork.signRetryMs;
    // A video that broke on screen can't be replaced for now; show the cover again.
    if (shownSlot?.load === load && shownSlot.video.error) fadeOutSlot(shownSlot);
    return;
  }
  const target = getContainer();
  if (!target) return;

  if (pendingSlot) disposeSlot(pendingSlot);
  const video = createVideo();
  const slot: Slot = { load, source, video, played: false, timeout: null, cleanup: new AbortController() };
  pendingSlot = slot;
  const { signal } = slot.cleanup;

  video.addEventListener(
    "playing",
    () => {
      if (slot.played) return;
      slot.played = true;
      load.failures = 0;
      if (load.upc) MarkAvailable(load.upc);
      if (slot.timeout) clearTimeout(slot.timeout);
      slot.timeout = null;
      void reveal(slot, target);
    },
    { signal },
  );
  // Also fires mid-loop, for example when a range is re-requested after the signature expired.
  video.addEventListener("error", () => onSlotFailed(slot), { signal });

  // Only time spent trying to play counts: a video held paused (NowBar closed, window hidden)
  // hasn't failed.
  const armTimeout = () => {
    slot.timeout = setTimeout(() => {
      slot.timeout = null;
      if (slot.played) return;
      if (shouldPlay()) onSlotFailed(slot);
      else armTimeout();
    }, getRemoteConfig().animatedArtwork.loadTimeoutMs);
  };
  armTimeout();

  video.src = source.url;
  target.append(video);
  if (shouldPlay()) video.play().catch(() => undefined);
  else video.pause();
}

async function Refresh() {
  const container = getContainer();
  const albumId = IsMotionArtworkEnabled() && !IsCardMode && container ? PlayingAlbumId() : null;
  const placement = albumId ? GetArtworkPlacement() : null;

  // Nothing on the cover while the Canvas Stage holds it. While it's still deciding, a video
  // already up stays, as the stage keeps its own.
  if (!albumId || !placement || !(placement.cover || placement.pending)) {
    dropEverything();
    return;
  }

  // The page was rebuilt under a playing video: start over in the new container.
  if (shownSlot && !container!.contains(shownSlot.video)) dropEverything();

  // Same album, or another album id with the same UPC: keep whatever is loading or playing, or
  // start it if it never did (the NowBar was closed, or the signer failed earlier).
  const live = currentLoad && !currentLoad.cancelled ? currentLoad : null;
  const knownUpc = KnownAlbumUpc(albumId);
  if (live && (live.albumId === albumId || (knownUpc && live.upc === knownUpc))) {
    clearSettle();
    live.albumId = albumId;
    syncPlayback();
    if (placement.cover) void ensureLoaded(live);
    return;
  }

  // Another album. A relinked track first reports the album it was played from, then its own,
  // so a video already up gets one short wait before it goes.
  if (live && (shownSlot || pendingSlot) && !settled) {
    settleTimer ??= setTimeout(() => {
      settleTimer = null;
      settled = true;
      void Refresh();
    }, getRemoteConfig().animatedArtwork.albumSettleMs);
    return;
  }

  // Past the wait, the old album's video must not stay over the new cover.
  dropEverything();
  if (!placement.cover) return;
  const load: Load = {
    albumId,
    upc: knownUpc,
    cancelled: false,
    failures: 0,
    // Rapid skipping shouldn't cost a request per track.
    startAfter: Date.now() + getRemoteConfig().lyricsFetch.rapidSwitchBackoffMs,
    busy: false,
  };
  currentLoad = load;
  // Nothing is fetched while the cover can't be seen; nowbar:open refreshes.
  await ensureLoaded(load);
}

function observeDocument() {
  const doc = PageContainer?.ownerDocument ?? null;
  if (doc === observedDocument) return;
  observedDocument?.removeEventListener("visibilitychange", syncPlayback);
  observedDocument = doc;
  observedDocument?.addEventListener("visibilitychange", syncPlayback);
}

function onPageOpen() {
  observeDocument();
  void Refresh();
}

function onPageDestroy() {
  dropEverything();
  observedDocument?.removeEventListener("visibilitychange", syncPlayback);
  observedDocument = null;
}

Global.Event.listen("page:open", onPageOpen);
Global.Event.listen("page:destroy", onPageDestroy);
Global.Event.listen("playback:songchange", () => void Refresh());
Global.Event.listen("nowbar:open", () => void Refresh());
Global.Event.listen("nowbar:close", syncPlayback);
Global.Event.listen("canvas-stage:change", () => void Refresh());
Global.Event.listen("motion-artwork:verdict", () => void Refresh());
$motionArtwork.listen(() => void Refresh());
// Moving the page into or out of fullscreen re-parents it, which pauses its videos.
const onLayoutMove = () =>
  setTimeout(() => {
    observeDocument();
    void Refresh();
  }, 0);
Global.Event.listen("fullscreen:open", onLayoutMove);
Global.Event.listen("fullscreen:exit", onLayoutMove);
Global.Event.listen("compact-mode:enable", onLayoutMove);
Global.Event.listen("compact-mode:disable", onLayoutMove);

