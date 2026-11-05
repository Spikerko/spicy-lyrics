import "../../css/NextUp.css";
import Global from "../Global/Global.ts";
import { SpotifyPlayer } from "../Global/SpotifyPlayer.ts";
import { PageContainer } from "../Pages/PageView.ts";
import Fullscreen from "./Fullscreen.ts";
import { IsPIP } from "./PopupLyrics.ts";
import { isExperimentEnabled, onExperimentChange } from "../../utils/experiments.ts";

/**
 * "Next up" in fullscreen and Cinema View: for the last stretch of a song, the next
 * track in the queue (cover, title, artist) in the corner above the lyrics. Display
 * only, so clicks pass through to the lyrics. Gated by the `nextUpCard` experiment.
 */

// Shown once this little of the song is left.
const SHOW_WITHIN_MS = 30_000;
// How often the remaining time and the queue are re-read while fullscreen is open.
const TICK_MS = 500;
// Text too long for the card scrolls past as a loop at about this speed, after a short pause.
const SCROLL_PX_PER_S = 40;
const SCROLL_PAUSE_MS = 700;
// It speeds up from rest over this long, then keeps going at a steady pace.
const SCROLL_RAMP_MS = 800;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

type NextTrack = { uri: string; title: string; artist: string; image: string | null };

let card: HTMLElement | null = null;
let content: HTMLElement | null = null;
let shownUri: string | null = null;
let ticker: ReturnType<typeof setInterval> | null = null;
// Watches the controls' fade in Canvas Stage, where the card makes way for them.
let controlsObserver: MutationObserver | null = null;
let observedMediaBox: HTMLElement | null = null;
// When the card was last hidden. Its content is only replaced once the fade-out is over.
let hiddenAt = 0;
// A little longer than the fade-out in NextUp.css.
const FADE_OUT_MS = 450;

/** The first real track or episode coming up, skipping separators and ads. */
function readNextTrack(): NextTrack | null {
  for (const entry of Spicetify.Queue?.nextTracks ?? []) {
    const track = entry?.contextTrack;
    const uri: string = track?.uri ?? "";
    if (!/^spotify:(track|episode|local):/.test(uri)) continue;
    const meta = track.metadata ?? {};
    if (meta.is_advertisement === "true") continue;
    const artists = Object.keys(meta)
      .filter((key) => /^artist_name(:\d+)?$/.test(key))
      .sort((a, b) => Number(a.split(":")[1] ?? 0) - Number(b.split(":")[1] ?? 0))
      .map((key) => meta[key]);
    const imageUri: string | undefined = meta.image_url ?? meta.image_large_url ?? meta.image_small_url;
    return {
      uri,
      title: meta.title ?? "",
      artist: artists.join(", "),
      image: imageUri?.startsWith("spotify:image:")
        ? `https://i.scdn.co/image/${imageUri.slice("spotify:image:".length)}`
        : imageUri?.startsWith("https://")
          ? imageUri
          : null,
    };
  }
  return null;
}

function buildContent(next: NextTrack): HTMLElement {
  const doc = card!.ownerDocument;
  const wrap = doc.createElement("div");
  wrap.className = "NextUpContent";

  const art = doc.createElement("div");
  art.className = "NextUpArt";
  if (next.image) {
    const img = doc.createElement("img");
    img.src = next.image;
    img.alt = "";
    img.decoding = "async";
    art.append(img);
  }

  const text = doc.createElement("div");
  text.className = "NextUpText";
  const label = doc.createElement("span");
  label.className = "NextUpLabel";
  label.textContent = "Next up";
  const line = (className: string, value: string) => {
    const outer = doc.createElement("span");
    outer.className = className;
    outer.dataset.text = value;
    const inner = doc.createElement("span");
    inner.className = "NextUpScroll";
    inner.textContent = value;
    outer.append(inner);
    return outer;
  };
  text.append(label, line("NextUpTitle", next.title), line("NextUpArtist", next.artist));

  wrap.append(art, text);
  return wrap;
}

function host(): HTMLElement | null {
  if (!Fullscreen.IsOpen || IsPIP || !PageContainer || PageContainer.classList.contains("CardMode")) return null;
  return PageContainer.querySelector<HTMLElement>(".ContentBox");
}

function unmount() {
  if (ticker) clearInterval(ticker);
  ticker = null;
  controlsObserver?.disconnect();
  controlsObserver = null;
  observedMediaBox = null;
  card?.remove();
  card = content = null;
  shownUri = null;
}

function tick() {
  const box = host();
  if (!box || !isExperimentEnabled("nextUpCard")) {
    unmount();
    return;
  }
  if (!card || card.parentElement !== box) {
    card?.remove();
    card = box.ownerDocument.createElement("div");
    card.className = "NextUpCard";
    card.setAttribute("aria-hidden", "true");
    box.append(card);
    content = null;
    shownUri = null;
  }

  followStageControls(box);
  const next = readNextTrack();
  const remaining = SpotifyPlayer.GetDuration() - SpotifyPlayer.GetPosition();
  const show =
    !!next &&
    // Repeat-one plays this song again, so nothing else is next.
    SpotifyPlayer.LoopType !== "track" &&
    SpotifyPlayer.GetDuration() > 0 &&
    remaining <= SHOW_WITHIN_MS;
  const isVisible = card.classList.contains("Visible");

  if (!show) {
    if (isVisible) hide();
    // Loaded while hidden, so the card never opens on the song that's playing now and
    // its cover is ready by the time it shows. Not until the fade-out has finished.
    else if (next && next.uri !== shownUri && performance.now() - hiddenAt >= FADE_OUT_MS) setContent(next, false);
    return;
  }

  // The queue changed while it's showing: the new next track fades in over the old.
  if (next.uri !== shownUri) setContent(next, isVisible);
  if (!isVisible) {
    // Every reveal starts the title from its beginning.
    prepareScrolling();
    card.classList.add("Visible");
  }
}

/**
 * Title and artist that don't fit run past as a loop: the text, a gap, then the text
 * again, moved by exactly one text-and-gap so each loop starts where the last ended.
 */
function prepareScrolling() {
  if (!content) return;
  for (const el of content.querySelectorAll<HTMLElement>(".NextUpTitle, .NextUpArtist")) {
    const inner = el.querySelector<HTMLElement>(".NextUpScroll");
    if (!inner) continue;
    const text = el.dataset.text ?? "";
    for (const animation of inner.getAnimations()) animation.cancel();
    el.classList.remove("Scrolls");
    inner.textContent = text;
    if (el.scrollWidth - el.clientWidth <= 2) continue;

    const doc = el.ownerDocument;
    const copy = (hidden: boolean) => {
      const part = doc.createElement("span");
      part.className = "NextUpLoopPart";
      part.textContent = text;
      if (hidden) part.setAttribute("aria-hidden", "true");
      return part;
    };
    // Three copies: the loop's offset plus the visible width never runs past the end.
    inner.replaceChildren(copy(false), copy(true), copy(true));
    // One part's width includes the gap after it (NextUp.css).
    const distance = (inner.firstElementChild as HTMLElement).offsetWidth;
    el.classList.add("Scrolls");
    if (reducedMotion.matches) continue;
    // The start: a pause, then speeding up to the steady pace. The ramp covers half the
    // distance the steady pace would in that time, which is what this curve does.
    const rampPx = (SCROLL_PX_PER_S * SCROLL_RAMP_MS) / 1000 / 2;
    const start = inner.animate(
      [
        { transform: "translateX(0)", offset: 0 },
        { transform: "translateX(0)", offset: SCROLL_PAUSE_MS / (SCROLL_PAUSE_MS + SCROLL_RAMP_MS), easing: "cubic-bezier(0.5, 0, 1, 1)" },
        { transform: `translateX(${-rampPx}px)`, offset: 1 },
      ],
      { duration: SCROLL_PAUSE_MS + SCROLL_RAMP_MS, fill: "forwards" }
    );
    // Then it never stops: one copy's width per loop, and the copies line up, so the
    // jump back each loop can't be seen.
    start.finished
      .then(() => {
        inner.animate(
          [{ transform: `translateX(${-rampPx}px)` }, { transform: `translateX(${-rampPx - distance}px)` }],
          { duration: (distance / SCROLL_PX_PER_S) * 1000, iterations: Infinity }
        );
        start.cancel();
      })
      .catch(() => undefined); // Cancelled: a new song, or the card was rebuilt.
  }
}

/**
 * Canvas Stage with the Now Bar on the right puts the view controls in this corner
 * while they show (they fade with the mouse). The card slides down below them then,
 * and back up when they go.
 */
function followStageControls(box: HTMLElement) {
  if (!card || !PageContainer) return;
  const page = PageContainer.classList;
  const shared =
    page.contains("CanvasImmersive") &&
    page.contains("NowBarSide__Right") &&
    !page.contains("CompactMode") &&
    !page.contains("ForcedCompactMode");
  const mediaBox = shared ? box.querySelector<HTMLElement>(".NowBar .MediaBox") : null;
  const controls = mediaBox?.querySelector<HTMLElement>(".ViewControls") ?? null;

  if (!mediaBox || !controls) {
    controlsObserver?.disconnect();
    controlsObserver = null;
    observedMediaBox = null;
    card.classList.remove("BelowControls");
    return;
  }

  // Measured at rest: the row slides in with a translate while it appears.
  const slide = parseFloat(getComputedStyle(controls).translate.split(" ")[1] ?? "0") || 0;
  const controlsBottom = controls.getBoundingClientRect().bottom - slide;
  const cardTop = card.getBoundingClientRect().top - (parseFloat(getComputedStyle(card).translate.split(" ")[1] ?? "0") || 0);
  card.style.setProperty("--NextUpDrop", `${Math.max(0, Math.round(controlsBottom + 10 - cardTop))}px`);

  if (observedMediaBox !== mediaBox) {
    controlsObserver?.disconnect();
    observedMediaBox = mediaBox;
    const sync = () => {
      const opacity = parseFloat(mediaBox.style.getPropertyValue("--ControlsOpacity")) || 0;
      card?.classList.toggle("BelowControls", opacity > 0.05);
    };
    controlsObserver = new MutationObserver(sync);
    controlsObserver.observe(mediaBox, { attributes: true, attributeFilter: ["style"] });
    sync();
  }
}

function hide() {
  if (!card?.classList.contains("Visible")) return;
  card.classList.remove("Visible");
  hiddenAt = performance.now();
  // Hidden, the scrolling waits; the next reveal starts it from the beginning.
  for (const animation of card.getAnimations({ subtree: true })) {
    if (animation instanceof CSSTransition) continue;
    animation.pause();
  }
}

function setContent(next: NextTrack, crossfade: boolean) {
  if (!card) return;
  const previous = content;
  if (crossfade && previous) {
    previous.classList.add("Leaving");
    setTimeout(() => previous.remove(), 300);
  } else {
    previous?.remove();
  }
  content = buildContent(next);
  if (crossfade) content.classList.add("Entering");
  card.append(content);
  shownUri = next.uri;
  if (crossfade) prepareScrolling();
}

function sync() {
  if (host() && isExperimentEnabled("nextUpCard")) {
    tick();
    ticker ??= setInterval(tick, TICK_MS);
  } else {
    unmount();
  }
}

Global.Event.listen("fullscreen:open", () => setTimeout(sync, 0));
Global.Event.listen("fullscreen:exit", unmount);
Global.Event.listen("page:destroy", unmount);
Global.Event.listen("playback:songchange", () => {
  // The next track is now playing; hide straight away rather than on the next tick.
  hide();
  sync();
});
onExperimentChange((exp) => {
  if (exp.id === "nextUpCard") sync();
});
