import { $animationFpsCap, $animationFpsCapEnabled } from "./stores.ts";

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
    console.error("Spicy Lyrics: animation frame callback failed", err);
  }
};

const loop = (timestamp: number) => {
  if (shouldRender(timestamp)) {
    for (const callback of callbacks) run(callback, timestamp);
    if (pending.size > 0) {
      // Swap first: callbacks that schedule themselves again land on the next frame.
      const due = pending;
      pending = new Map();
      for (const callback of due.values()) run(callback, timestamp);
    }
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
