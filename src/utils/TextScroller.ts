/**
 * Scrolls one-line text that is wider than its box: hold at the start, slide to the end at a
 * reading pace, hold, and slide back. The pace is set in em per second of the text's own font
 * size, so the time a scroll takes follows how far the text overflows: a slightly long title
 * glides a short way, a very long one takes longer, and both move at the same speed.
 *
 * Each box's first element child is the moving track. The box clips it (and usually fades its
 * edges); the track is moved with `translate` in a Web Animation built from measured pixels, so
 * nothing is measured per frame. Spotify's Chromium still restyles and repaints the track each
 * frame, so owners pause it while its box is hidden. Text that fits is left where its CSS puts it.
 *
 * Boxes in one scroller share a cycle: they leave together at the same speed, the one with less
 * to travel waits at its end, and they come back together. A title and its artists line then
 * never drift out of step.
 *
 * The animation is rebuilt (from the start hold) when a box's track is replaced or its text
 * changes, and when a resize changes how far a track has to travel or its font size.
 */

/** Scroll speed in em of the track's font size per second. */
const SPEED_EM_PER_S = 2;
/** Time spent speeding up at the start of a slide and slowing down at its end. */
const RAMP_S = 0.6;
/** Shortest slide, so a few pixels of overflow glide instead of twitching. */
const MIN_TRAVEL_S = 1.2;
/** Hold at the start, long enough to read what is visible before it moves. */
const START_HOLD_S = 3;
/** Hold at the end, with the last words in view. */
const END_HOLD_S = 2;
/** Overflow below this is rounding, not text that needs to move. */
const MIN_OVERFLOW_PX = 1;
/** Quiet time after the last resize before a running scroll is re-measured. */
const RESIZE_SETTLE_MS = 200;

const ANIMATION_ID = "SL_TextScroller";

export interface TextScrollerOptions {
  /** Hold the text at its start under prefers-reduced-motion, instead of scrolling it. */
  holdOnReducedMotion?: boolean;
  /** A class set on each box whose text overflows it, for an edge fade only where one is needed. */
  overflowClass?: string;
  /**
   * A class set on each box while its text is away from its start: on as the slide sets off,
   * off a ramp's length before the return lands. With it a start-edge fade can show only while
   * the text is moving, so text at rest keeps its first letters whole. Boxes that get it also
   * carry `--TextScrollTravel`, how far their text travels, to keep such a fade within it.
   */
  slidingClass?: string;
  /**
   * A class set from where `slidingClass` comes off until the text lands back at its start, so a
   * fade can ease out with the return. A rebuild drops both at once, letting such a fade snap
   * off rather than ease out over new text that is already at rest.
   */
  settlingClass?: string;
  /**
   * Start paused (see `pause`), for text built ahead of being shown. `resume` starts it.
   */
  paused?: boolean;
}

export interface TextScroller {
  /** Re-measures now and restarts the cycle. */
  refresh(): void;
  /**
   * Stops the motion and leaves the text at its start, for a box that is hidden. The animation
   * restyles and repaints the track every frame, which a hidden box would pay for nothing.
   * The overflow class stays up to date.
   */
  pause(): void;
  /** Starts a paused scroller from the start hold. */
  resume(): void;
  destroy(): void;
}

interface Member {
  box: HTMLElement;
  track: HTMLElement | null;
  animation: Animation | null;
  /** The last measure: start and end translate, and font size. */
  shape: [number, number, number] | null;
}

interface Travel {
  member: Member;
  track: HTMLElement;
  from: number;
  to: number;
  seconds: number;
}

/** A velocity curve with eased ends and a constant middle, as a CSS `linear()` easing. */
function rampEasing(seconds: number, supportsLinear: boolean): string {
  if (!supportsLinear) return "ease-in-out";
  const r = Math.min(RAMP_S / seconds, 0.5);
  const peak = 1 / (1 - r);
  const steps = 8;
  const points: string[] = ["0 0%"];
  for (let i = 1; i <= steps; i++) {
    const u = (r * i) / steps;
    points.push(`${((peak * u * u) / (2 * r)).toFixed(5)} ${(u * 100).toFixed(3)}%`);
  }
  for (let i = steps - 1; i >= 0; i--) {
    const u = 1 - (r * i) / steps;
    const rest = 1 - u;
    points.push(`${(1 - (peak * rest * rest) / (2 * r)).toFixed(5)} ${(u * 100).toFixed(3)}%`);
  }
  return `linear(${points.join(", ")})`;
}

/** Within a pixel: sub-pixel noise in a re-measure isn't worth restarting the cycle for. */
function sameShape(a: Member["shape"], b: Member["shape"]): boolean {
  if (!a || !b) return a === b;
  return Math.abs(a[0] - b[0]) < 1 && Math.abs(a[1] - b[1]) < 1 && a[2] === b[2];
}

export function CreateTextScroller(
  boxes: HTMLElement[],
  options: TextScrollerOptions = {}
): TextScroller {
  const members: Member[] = boxes.map((box) => ({ box, track: null, animation: null, shape: null }));
  const doc = boxes[0]?.ownerDocument ?? document;
  const view = doc.defaultView ?? window;
  const supportsLinear = view.CSS.supports("animation-timing-function", "linear(0, 1)");
  const reducedMotion = options.holdOnReducedMotion
    ? view.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

  let frame = 0;
  let settleTimer = 0;
  let slidingTimer = 0;
  let restartQueued = false;
  let destroyed = false;
  let paused = !!options.paused;

  const resizeObserver = new view.ResizeObserver(onResize);
  const mutationObserver = new view.MutationObserver(() => schedule(true));
  for (const { box } of members) {
    resizeObserver.observe(box);
    mutationObserver.observe(box, { childList: true, subtree: true, characterData: true });
  }

  // A layout animation resizes the box every frame. While text is scrolling, wait for it to
  // settle, so the scroll isn't rebuilt (and sent back to its start) on each of those frames.
  function onResize(): void {
    if (destroyed) return;
    if (!members.some((m) => m.animation)) {
      schedule(false);
      return;
    }
    view.clearTimeout(settleTimer);
    settleTimer = view.setTimeout(() => {
      settleTimer = 0;
      schedule(false);
    }, RESIZE_SETTLE_MS);
  }

  function schedule(restart: boolean): void {
    if (destroyed) return;
    restartQueued ||= restart;
    if (restart && settleTimer) {
      view.clearTimeout(settleTimer);
      settleTimer = 0;
    }
    if (frame) return;
    frame = view.requestAnimationFrame(() => {
      frame = 0;
      const restartNow = restartQueued;
      restartQueued = false;
      build(restartNow);
    });
  }

  function measure(member: Member): Travel | null {
    const track = member.box.firstElementChild as HTMLElement | null;
    if (track !== member.track) {
      if (member.track) resizeObserver.unobserve(member.track);
      member.animation?.cancel();
      member.animation = null;
      member.track = track;
      if (track) resizeObserver.observe(track);
    }
    const { box } = member;
    if (!track || box.offsetWidth === 0 || track.offsetWidth === 0) {
      member.shape = null;
      return null;
    }

    const boxStyle = view.getComputedStyle(box);
    const trackStyle = view.getComputedStyle(track);
    const boxRect = box.getBoundingClientRect();
    // Rects carry any scale on the way up; offsets don't. Work in the box's own pixels.
    const scale = boxRect.width / box.offsetWidth || 1;
    // The track's place without our translate, which the rect includes mid-scroll.
    const shift = parseFloat(trackStyle.translate) || 0;
    const left = (track.getBoundingClientRect().left - boxRect.left) / scale - shift;
    const paddingLeft = parseFloat(boxStyle.paddingLeft) || 0;
    const paddingRight = parseFloat(boxStyle.paddingRight) || 0;
    const windowLeft = box.clientLeft + paddingLeft;
    const windowRight = box.clientLeft + box.clientWidth - paddingRight;

    const from = windowLeft - left;
    const to = windowRight - (left + track.offsetWidth);
    const fontSize = parseFloat(trackStyle.fontSize) || 16;
    member.shape = [from, to, fontSize];
    const distance = from - to;
    if (distance < MIN_OVERFLOW_PX) return null;

    const seconds = Math.max(MIN_TRAVEL_S, distance / (fontSize * SPEED_EM_PER_S) + RAMP_S);
    return { member, track, from, to, seconds };
  }

  function build(restart: boolean): void {
    if (destroyed) return;
    const previous = members.map((m) => m.shape);
    const travels = members.map(measure);
    if (options.overflowClass) {
      members.forEach((m, i) => m.box.classList.toggle(options.overflowClass!, travels[i] !== null));
    }
    if (!restart && members.every((m, i) => sameShape(m.shape, previous[i]))) return;

    for (const member of members) {
      member.animation?.cancel();
      member.animation = null;
    }
    stopSliding();

    const moving = travels.filter((t): t is Travel => t !== null);
    if (paused || moving.length === 0 || reducedMotion?.matches) return;

    const longest = Math.max(...moving.map((t) => t.seconds));
    const cycle = START_HOLD_S + longest + END_HOLD_S + longest;
    const at = (s: number) => Math.min(s / cycle, 1);
    const startTime = doc.timeline.currentTime;

    for (const { member, track, from, to, seconds } of moving) {
      if (options.slidingClass || options.settlingClass) member.box.style.setProperty("--TextScrollTravel", `${from - to}px`);
      const easing = rampEasing(seconds, supportsLinear);
      const start = `${from}px`;
      const end = `${to}px`;
      member.animation = track.animate(
        [
          { offset: 0, translate: start },
          { offset: at(START_HOLD_S), translate: start, easing },
          { offset: at(START_HOLD_S + seconds), translate: end },
          { offset: at(START_HOLD_S + longest + END_HOLD_S), translate: end, easing },
          { offset: at(START_HOLD_S + longest + END_HOLD_S + seconds), translate: start },
          { offset: 1, translate: start },
        ],
        { id: ANIMATION_ID, duration: cycle * 1000, iterations: Infinity }
      );
      // The same start for every box, so the shared cycle stays in step.
      if (startTime !== null) member.animation.startTime = startTime;
    }

    if (options.slidingClass || options.settlingClass) {
      const away = moving.map((t) => {
        const land = (START_HOLD_S + longest + END_HOLD_S + t.seconds) * 1000;
        return { box: t.member.box, from: START_HOLD_S * 1000, until: land - RAMP_S * 1000, land };
      });
      syncSliding(moving[0].member.animation!, cycle * 1000, away);
    }
  }

  // Sets each box's sliding and settling classes for where the shared cycle is now, then waits for
  // the next change. The time is read off the animation, so the classes can't drift from the motion.
  function syncSliding(
    clock: Animation,
    cycleMs: number,
    away: Array<{ box: HTMLElement; from: number; until: number; land: number }>
  ): void {
    if (destroyed || clock.playState === "idle") return;
    const now = (Number(clock.currentTime) || 0) % cycleMs;
    let next = cycleMs - now;
    for (const { box, from, until, land } of away) {
      // Settling goes on in the same step sliding comes off, so the fade eases out on its curve.
      if (options.settlingClass) box.classList.toggle(options.settlingClass, now >= until && now < land);
      if (options.slidingClass) box.classList.toggle(options.slidingClass, now >= from && now < until);
      for (const edge of [from, until, land]) if (edge > now) next = Math.min(next, edge - now);
    }
    // A few ms past the edge, so the next read lands on the far side of it.
    slidingTimer = view.setTimeout(() => syncSliding(clock, cycleMs, away), next + 4);
  }

  function stopSliding(): void {
    view.clearTimeout(slidingTimer);
    slidingTimer = 0;
    for (const { box } of members) {
      if (options.slidingClass) box.classList.remove(options.slidingClass);
      if (options.settlingClass) box.classList.remove(options.settlingClass);
    }
  }

  const onReducedMotionChange = () => schedule(true);
  reducedMotion?.addEventListener("change", onReducedMotionChange);

  return {
    refresh: () => build(true),
    pause() {
      if (destroyed || paused) return;
      paused = true;
      for (const member of members) {
        member.animation?.cancel();
        member.animation = null;
      }
      stopSliding();
    },
    resume() {
      if (destroyed) return;
      paused = false;
      build(true);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (frame) view.cancelAnimationFrame(frame);
      view.clearTimeout(settleTimer);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      reducedMotion?.removeEventListener("change", onReducedMotionChange);
      for (const member of members) member.animation?.cancel();
      view.clearTimeout(slidingTimer);
    },
  };
}
