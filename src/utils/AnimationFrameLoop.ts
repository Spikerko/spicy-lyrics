import Logger from "./Logger.ts";
import { $animationFpsCap, $animationFpsCapEnabled } from "./stores.ts";

const frameLogger = new Logger("Animation Frame");

/**
 * One requestAnimationFrame loop shared by everything that repaints every frame
 * (the lyrics animator and the Kawarp backgrounds), capped by `$animationFpsCap`.
 *
 * Both have to render on the *same* frames: if each capped itself on its own
 * schedule, the page would still be repainted on the union of their frames.
 */

type FrameCallback = (timestamp: number) => void;

const callbacks = new Set<FrameCallback>();

// vsync timestamps jitter by a fraction of a millisecond. Without some slack a
// 60 fps cap on a 60 Hz display would drop every other frame.
const FRAME_SLACK_MS = 1;

// Same bounds and default as the settings slider. The value comes from the
// persisted settings blob, so it is validated rather than trusted.
const MIN_FPS_CAP = 15;
const MAX_FPS_CAP = 240;
const DEFAULT_FPS_CAP = 60;

const computeFrameInterval = (): number => {
  if (!$animationFpsCapEnabled.get()) return 0;
  const saved = Number($animationFpsCap.get());
  const fps = Number.isFinite(saved)
    ? Math.min(MAX_FPS_CAP, Math.max(MIN_FPS_CAP, saved))
    : DEFAULT_FPS_CAP;
  return 1000 / fps;
};

let frameInterval = computeFrameInterval();
const updateFrameInterval = () => {
  frameInterval = computeFrameInterval();
};
$animationFpsCapEnabled.listen(updateFrameInterval);
$animationFpsCap.listen(updateFrameInterval);

let lastRender = -Infinity;

const shouldRender = (timestamp: number): boolean => {
  if (frameInterval === 0) return true;
  const elapsed = timestamp - lastRender;
  if (elapsed < frameInterval - FRAME_SLACK_MS) return false;
  // Keep the phase so a 60 fps cap on a 144 Hz display averages out to 60,
  // but start over after a stall (hidden window, long task) instead of bursting.
  lastRender =
    elapsed >= frameInterval && elapsed < frameInterval * 2
      ? timestamp - (elapsed % frameInterval)
      : timestamp;
  return true;
};

// One-shot callbacks for the next rendered frame (see requestCappedFrame).
let pending = new Map<number, FrameCallback>();
let nextPendingId = 1;

const run = (callback: FrameCallback, timestamp: number) => {
  // One throwing subscriber must not stop the others (or the loop).
  try {
    callback(timestamp);
  } catch (err) {
    frameLogger.error("Animation frame callback failed", err);
  }
};

const frame = (timestamp: number) => {
  if (!shouldRender(timestamp)) return;
  for (const callback of callbacks) run(callback, timestamp);
  if (pending.size > 0) {
    // Swap first: callbacks that schedule themselves again land on the next frame.
    const due = pending;
    pending = new Map();
    for (const callback of due.values()) run(callback, timestamp);
  }
};

// Popup Lyrics shows the page in a Document PiP window, which paints on its own
// frame clock. Driven from the main window's frames, about one popup frame in
// twenty was painted between two updates and showed the scroll standing still.
// While the popup is open its frames drive the loop; the main window keeps
// ticking only to notice it closing, since a closed window's frames just stop.
// Spotify's own Miniplayer is a Document PiP window too, hence the wrapper check.
const popupWindow = (): Window | null => {
  const w = (window as { documentPictureInPicture?: { window?: Window | null } })
    .documentPictureInPicture?.window;
  return w && !w.closed && w.document.querySelector(".spicy-pip-wrapper") ? w : null;
};

let drivingPopup: Window | null = null;

const popupLoop = (timestamp: number) => {
  const popup = popupWindow();
  if (!popup || popup !== drivingPopup) {
    drivingPopup = null;
    return;
  }
  // Callers compare against this window's performance.now(); the popup's clock
  // has its own origin.
  frame(timestamp + (popup.performance.timeOrigin - performance.timeOrigin));
  popup.requestAnimationFrame(popupLoop);
};

const loop = (timestamp: number) => {
  const popup = popupWindow();
  if (!popup) {
    drivingPopup = null;
    frame(timestamp);
  } else if (drivingPopup !== popup) {
    drivingPopup = popup;
    popup.requestAnimationFrame(popupLoop);
  }
  requestAnimationFrame(loop);
};

requestAnimationFrame(loop);

/** Run `callback` on every rendered frame. Returns a function that unsubscribes it. */
export function onAnimationFrame(callback: FrameCallback): () => void {
  callbacks.add(callback);
  return () => callbacks.delete(callback);
}

/**
 * requestAnimationFrame, but on the next frame the cap lets through. For
 * JS-driven motion that should not redraw the page more often than the lyrics do.
 */
export function requestCappedFrame(callback: FrameCallback): number {
  const id = nextPendingId++;
  pending.set(id, callback);
  return id;
}

export function cancelCappedFrame(id: number): void {
  pending.delete(id);
}
