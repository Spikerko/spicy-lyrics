import { $maxAnimationFps } from "./stores.ts";

/**
 * One requestAnimationFrame loop shared by everything that repaints every frame
 * (the lyrics animator and the Kawarp backgrounds), capped by `$maxAnimationFps`.
 *
 * Both have to render on the *same* frames: if each capped itself on its own
 * schedule, the page would still be repainted on the union of their frames.
 */

type FrameCallback = (timestamp: number) => void;

const callbacks = new Set<FrameCallback>();

// vsync timestamps jitter by a fraction of a millisecond. Without some slack a
// 60 fps cap on a 60 Hz display would drop every other frame.
const FRAME_SLACK_MS = 1;

const toFrameInterval = (value: string): number => {
  const fps = Number(value);
  return Number.isFinite(fps) && fps > 0 ? 1000 / fps : 0;
};

let frameInterval = toFrameInterval($maxAnimationFps.get());
$maxAnimationFps.listen((value) => {
  frameInterval = toFrameInterval(value);
});

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

const loop = (timestamp: number) => {
  if (shouldRender(timestamp)) {
    for (const callback of callbacks) {
      // One throwing subscriber must not stop the others (or the loop).
      try {
        callback(timestamp);
      } catch (err) {
        console.error("Spicy Lyrics: animation frame callback failed", err);
      }
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
