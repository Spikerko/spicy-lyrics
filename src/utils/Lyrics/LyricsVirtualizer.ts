import {
  Virtualizer,
  elementScroll,
  observeElementRect,
  observeElementOffset,
} from "@tanstack/virtual-core";
import { Maid } from "../../modules/Maid.ts";
import { Spring } from "../../modules/Spring.ts";
import Logger from "../Logger.ts";
import { $simpleLyricsMode, $smoothScrolling } from "../stores.ts";
import { $experiment, isExperimentEnabled } from "../experiments.ts";
import { cancelCappedFrame, requestCappedFrame } from "../AnimationFrameLoop.ts";

// Gap scale factors relative to 1cqw (containerWidth / 100).
// Gap is baked into each wrapper's padding-bottom so items can have
// different trailing gaps without any virtualizer-level workaround.
const GAP_NORMAL = 1;      // 1cqw — line↔line and bg-line↔next-line
const GAP_LINE_TO_BG = 0.2; // 0.2cqw — line↔bg-line (bg sits closer to its parent)

const ESTIMATE: Record<string, number> = {
  // Inactive musical-lines have line-height: 0 → measured height ~0.
  "musical-line": 0,
  // bg-lines are smaller than regular lines (no lead vocal padding).
  "bg-line": 50,
  // Single-line actual height is ~66px.
  default: 66,
};

const virtualizerLogger = new Logger("Lyrics Virtualizer");

// Smooth-scroll spring. Critically damped, so it never overshoots the line, and
// settles in ~0.8s. A retarget mid-flight keeps the current velocity, which is
// what makes back-to-back line changes read as one continuous glide.
const SMOOTH_SCROLL_FREQUENCY = 1;
const SMOOTH_SCROLL_DAMPING = 1;
// The glide is done once it is this close (px) to the goal and moving slower than
// this per frame. Sub-pixel rendering makes the final snap invisible.
const SMOOTH_SCROLL_SETTLE_PX = 0.25;
const SMOOTH_SCROLL_SETTLE_SPEED = 0.05;
// Largest single spring step, and the most time one glide frame may account for.
// The cap allows frames 67 ms apart (15 fps); anything longer is a stall.
const SMOOTH_SCROLL_MAX_STEP = 0.05;
const SMOOTH_SCROLL_MAX_ELAPSED = 0.1;
// How many times a glide may re-aim after finding the list somewhere other than
// where it steered it (layout changed underneath it) before it just accepts
// where the browser put it.
const SMOOTH_SCROLL_MAX_RECONCILES = 3;
// Rows a glide keeps mounted at most (see _glideHold). Past this the destination
// is too far to be worth holding, and rows mount and unmount as the window slides.
const GLIDE_HOLD_MAX_ROWS = 40;
// Matches the virtualizer's overscan.
const OVERSCAN = 5;

// scrollTop lands on device pixels, not CSS pixels: one step is 1.44 CSS px at 69%
// zoom and 0.8 at 125% display scaling. A glide that assumed whole CSS pixels put
// the list up to half a step from where its sub-pixel translate expected, and the
// error flipped sign from frame to frame as a visible shimmer. Read per element,
// since the popup is its own window with its own ratio.
function scrollStep(el: HTMLElement): number {
  return 1 / (el.ownerDocument.defaultView?.devicePixelRatio || 1);
}

// With Smooth Scrolling on, rows glide to a new position instead of jumping when
// something above them changes height — chiefly a "•••" interlude line, which
// snaps between 0 and a full line height as it becomes active and ends.
const LAYOUT_GLIDE_MS = 500;
const LAYOUT_GLIDE_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const LAYOUT_GLIDE_TRANSITION = `transform ${LAYOUT_GLIDE_MS / 1000}s ${LAYOUT_GLIDE_EASING}`;
// Row glides are held off for this long after anything that re-lays the list out
// wholesale (opening it, instant jumps, resizes, the user scrolling), where rows
// sliding into place would look like drift rather than motion.
const LAYOUT_GLIDE_BLOCK_INIT_MS = 1500;
const LAYOUT_GLIDE_BLOCK_MS = 800;

// Refreshed Simple Lyrics (experiment). Lines sit further apart, by a share of
// the lyrics' own font size rather than of the container, so the spacing keeps
// its proportion where the font size is clamped.
const REFRESHED_GAP_EM = 0.62;

// It also follows the active line in a ripple instead of moving the list as one
// block: the list jumps to its new place, every row is held where it was, and
// each lets go a moment after the row above it and springs home.
const CASCADE_FREQUENCY = 2.1; // Hz
const CASCADE_STEP_MS = 42; // wait between one row and the next
// Below the active line the waits shrink, so the rows coming up close ranks.
const CASCADE_STEP_FALLOFF = 0.9;
// A move bigger than this share of the viewport is a jump, not a line change.
const CASCADE_MAX_JUMP = 0.7;
// A row is home once this close (px) and slower than this (px/s).
const CASCADE_SETTLE_PX = 0.2;
const CASCADE_SETTLE_SPEED = 4;
const CASCADE_MAX_STEP = 0.05;
const CASCADE_MAX_ELAPSED = 0.1;

// One row of the ripple, as the scroll position it is drawn at: `p` (velocity
// `v`) springs toward `goal`. A row still waiting its turn takes `next` as its
// goal once the clock reaches `at` (0 when nothing is waiting).
type CascadeRow = { p: number; v: number; goal: number; next: number; at: number; drawn: number };

// Critically damped, so a row never overshoots into its neighbours.
function stepCascadeRow(row: CascadeRow, dt: number, w: number): void {
  const q = Math.exp(-w * dt);
  const o = row.p - row.goal;
  const k = row.v + w * o;
  row.p = (o + k * dt) * q + row.goal;
  row.v = (row.v - w * k * dt) * q;
}

const isRefreshedSimpleLyrics = (): boolean =>
  $simpleLyricsMode.get() && isExperimentEnabled("refreshedSimpleLyrics");

// Background Vocal Pop-Out only applies to the refreshed layout. The animator
// folds lines by the same gate, so the two agree on which rows collapse.
export const isBgPopActive = (): boolean =>
  isRefreshedSimpleLyrics() && isExperimentEnabled("backgroundLinePop");

class LyricsVirtualizer {
  private _virtualizer: Virtualizer<HTMLElement, HTMLElement> | null = null;
  private _allElements: HTMLElement[] = [];
  private _indexByElement = new Map<HTMLElement, number>();
  // One positioning wrapper per line element. The wrapper gets position:absolute +
  // translateY from the virtualizer; the .line lives inside it so a CSS `scale` on
  // .line acts around its own center instead of composing with translateY through
  // transform-origin (which would shift elements down proportionally to translateY).
  private _wrappers: (HTMLElement | null)[] = [];
  private _mountedIndices = new Set<number>();
  private _virtualContainer: HTMLElement | null = null;
  private _scrollEl: HTMLElement | null = null;

  // Invoked when a new element is mounted. Used by the animator to invalidate its
  // active-line blur cache so newly visible elements get the correct --BlurAmount
  // next frame instead of a stale value from a run that skipped them while disconnected.
  private _onNewElementMounted: (() => void) | null = null;

  // Shared ResizeObserver — fires after every layout recalc for observed elements.
  private _resizeObserver: ResizeObserver | null = null;

  // Timer for the scroll-settle remeasure pass (fallback for browsers without scrollend).
  private _scrollEndTimer: ReturnType<typeof setTimeout> | null = null;

  private _resizeDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  // RAF handle used to coalesce multiple ResizeObserver entries into one _willUpdate()
  // call per frame.
  private _resizeRAF: ReturnType<typeof requestAnimationFrame> | null = null;

  // Last observed clientWidth of the scroll element.
  private _containerWidth = 0;

  // Last observed clientHeight of the scroll element. Lets the watchdog and the
  // width observer detect height-only resizes (which change the visible window
  // and the bottom spacer, but not individual item heights).
  private _containerHeight = 0;

  // ResizeObserver dedicated to tracking clientWidth changes on the scroll element.
  private _widthObserver: ResizeObserver | null = null;

  // MutationObserver that watches class attribute changes on musical-line elements.
  private _classObserver: MutationObserver | null = null;

  // Permanent spacer appended after the virtual container so the last item can
  // always be scrolled to center without temporarily inflating container height.
  private _spacer: HTMLElement | null = null;

  private _maid: Maid | null = null;
  private _lastVirtualWindowSignature = "";

  // Pending verification rAF for scrollToIndex. Programmatic scroll targets a
  // position from measurementsCache, but unmounted items only have _estimateSize,
  // so the first scroll after init (e.g. mid-song open) lands on a stale, clamped
  // position. We retry one frame after every scroll so the updated cache can
  // re-compute the target until it stabilises.
  private _scrollVerifyRAF: ReturnType<typeof requestAnimationFrame> | null = null;
  // Walk far targets (mid-song open) until the line is actually mounted; bounded so a
  // pathological case can't loop forever (~0.5s at 60fps).
  private static readonly _MAX_SCROLL_RETRIES = 30;

  // True while a programmatic scrollToIndex is converging. During this window we
  // disable TanStack's own scroll-position adjustment (see _shouldAdjustScroll) so we are
  // the sole writer of scrollTop and the retry chain's "external scroll" abort only
  // trips on a genuine user scroll.
  private _converging = false;

  // The SimpleBar root, which carries .simplebar-dragging while its thumb is held.
  private _scrollbarRoot: HTMLElement | null = null;

  // Re-entry guard for _onVirtualizerChange. TanStack's resizeItem calls onChange
  // synchronously on a non-zero size delta, so v.measureElement() inside the mount
  // loop can recurse back in; without this guard the outer loop's stale items
  // snapshot would overwrite correct transforms set by the inner call.
  private _inOnChange = false;
  private _onChangePending = false;
  private _changeQueued = false;

  // Smooth-scroll state (see _smoothScrollToIndex). The spring persists across
  // scrolls so its velocity can carry over into the next target.
  private _smoothSpring: Spring | null = null;
  // Stepped on the frame-capped loop: every glide frame writes scrollTop and a
  // translate, so at the display's own rate (240 Hz on some setups) the glide
  // alone redrew the whole page every refresh for the second or two it runs.
  private _smoothRAF: number | null = null;
  private _smoothTarget: {
    index: number;
    align: "start" | "center" | "end" | "auto";
    padding: number;
  } | null = null;
  private _smoothLastTs: number | null = null;
  // Running average of the glide's frame interval (seconds). Kept across glides:
  // it's a property of the display and the frame cap, not of one glide.
  private _smoothFrameAvg: number | null = null;
  private _smoothLastPosition: number | null = null;
  // Whole-pixel scrollTop last written; the sub-pixel remainder lives in
  // _smoothFraction and is applied as a translate on the virtual container.
  private _smoothLastWhole: number | null = null;
  private _smoothFraction = 0;
  // Layout the glide needs every frame, read once per retarget rather than per
  // frame — each read here forces a layout on top of the lyrics animator's writes.
  // Null means "stale, re-read next frame" (set on viewport resizes).
  private _smoothGeometry: {
    containerOffset: number;
    viewportHeight: number;
    maxScroll: number;
    // v.getTotalSize() when maxScroll was read. Rows below can change height
    // mid-glide (an interlude opening or collapsing), which moves the scroll
    // limit by exactly the change in total size — tracked without a layout read.
    totalSize: number;
  } | null = null;
  private _smoothReconciles = 0;
  // Rows kept mounted for the glide in flight: the ones on screen when it started
  // plus the ones its destination needs. Mounting or unmounting a row restyles the
  // whole document (Spotify's CSS has :has() rules that every insertion re-checks,
  // 20+ ms a time), and mid-glide that dropped frame shows as the list jumping.
  // With the hold, the mounts happen as the glide starts, from rest, and the
  // unmounts once it has landed.
  private _glideHold: Set<number> | null = null;

  // performance.now() until which row glides stay off. See LAYOUT_GLIDE_BLOCK_MS.
  private _layoutGlideBlockedUntil = 0;

  // Refreshed Simple Lyrics state (see REFRESHED_GAP_EM / CASCADE_*). The flag
  // is cached because _itemGap runs for every row on every estimate.
  private _refreshed = false;
  // Font size of a lyrics line, for the refreshed gap; 0 until one is mounted.
  private _gapFontPx = 0;
  // Background Vocal Pop-Out (experiment), cached like _refreshed. While it's on,
  // a background line without GroupActive is collapsed (Mixed.css) and sized 0.
  private _bgPop = false;
  // The last scroll made through the retry chain, so it can be re-aimed when a
  // background line above its target folds or opens while it is still moving.
  private _lastRetryTarget: {
    index: number;
    align: "start" | "center" | "end" | "auto";
    instant: boolean;
    padding: number;
  } | null = null;
  private _cascadeRows = new Map<number, CascadeRow>();
  // scrollTop the ripple is converging on.
  private _cascadeScroll = 0;
  private _cascadeRAF: number | null = null;
  private _cascadeLastTs: number | null = null;
  // The retry chain in flight was started by a ripple scroll.
  private _cascadeChain = false;
  // The credits, provider and song info under the list are plain flow content,
  // so they move with scrollTop alone. They get the last row's ripple offset or
  // the glide's sub-pixel remainder, whichever is running, through `translate`.
  private _trailingOffset = 0;
  // Those elements, kept between frames. The observer watches the list's parent for
  // children coming and going, and its pending records are checked on every read, so the
  // cache never lags a change, even one made earlier in the same task.
  private _trailingCache: HTMLElement[] | null = null;
  private _trailingObserver: MutationObserver | null = null;
  // Total size at the last layout pass, so the credits can glide when it changes.
  private _lastTotalSize = 0;

  setOnNewElementMounted(cb: (() => void) | null): void {
    this._onNewElementMounted = cb;
  }

  private _isCollapsedBg(el: HTMLElement | undefined): boolean {
    return (
      this._bgPop &&
      el != null &&
      el.classList.contains("bg-line") &&
      !el.classList.contains("GroupActive")
    );
  }

  // Collapsed background lines take no space, so the gap is set by the first
  // line after them that does.
  private _isNextBgLine(index: number): boolean {
    let i = index + 1;
    while (this._isCollapsedBg(this._allElements[i])) i++;
    const next = this._allElements[i];
    return next != null && next.classList.contains("bg-line");
  }

  private _itemGap(index: number): number {
    if (index >= this._allElements.length - 1) return 0;
    if (this._isCollapsedBg(this._allElements[index])) return 0;
    // Inactive musical-lines collapse to zero height; suppress their trailing gap
    // too so there is no double-gap between the surrounding lines.
    const el = this._allElements[index];
    if (el?.classList.contains("musical-line") && !el.classList.contains("Active")) return 0;
    const cqw = this._containerWidth / 100;
    if (this._isNextBgLine(index)) return GAP_LINE_TO_BG * cqw;
    if (this._refreshed && this._gapFontPx > 0) return this._gapFontPx * REFRESHED_GAP_EM;
    return GAP_NORMAL * cqw;
  }

  // Reads a mounted lyrics line's font size into _gapFontPx. Costs a style
  // recalc, so it only runs where a layout read follows anyway. True on change.
  private _readGapFont(): boolean {
    for (const idx of this._mountedIndices) {
      const el = this._allElements[idx];
      if (!el?.isConnected) continue;
      if (el.classList.contains("musical-line") || el.classList.contains("bg-line")) continue;
      const px = parseFloat(getComputedStyle(el).fontSize);
      if (!(px > 0)) continue;
      const changed = Math.abs(px - this._gapFontPx) >= 0.5;
      if (changed) this._gapFontPx = px;
      return changed;
    }
    return false;
  }

  // Simple Lyrics Mode or the experiment flipped. Rows off screen keep their
  // measured height, so it is moved by the change in their gap; otherwise the
  // list would shift as each one next mounts.
  private _applyRefreshed(next: boolean): void {
    if (next === this._refreshed) return;
    const v = this._virtualizer;
    const sizes = v
      ? (v as unknown as { itemSizeCache?: Map<number, number> }).itemSizeCache
      : undefined;
    const oldGaps = new Map<number, number>();
    if (sizes) {
      for (const idx of sizes.keys()) {
        if (!this._mountedIndices.has(idx)) oldGaps.set(idx, this._itemGap(idx));
      }
    }
    this._refreshed = next;
    // As in init(): the ripple needs scroll anchoring off.
    if (this._scrollEl) this._scrollEl.style.overflowAnchor = next ? "none" : "";
    if (next) this._readGapFont();
    else this._stopCascade();
    if (!v || !sizes) return;
    for (const [idx, oldGap] of oldGaps) {
      const size = sizes.get(idx);
      const gap = this._itemGap(idx);
      const delta = gap - oldGap;
      if (size === undefined || Math.abs(delta) < 0.5) continue;
      v.resizeItem(idx, size + delta);
      // Kept in step with the size, which _rowsChanged reads it against.
      const wrapper = this._wrappers[idx];
      if (wrapper) wrapper.style.paddingBottom = `${gap}px`;
    }
    this._blockLayoutGlide(LAYOUT_GLIDE_BLOCK_MS);
    this._remeasureVisible();
  }

  // Background Vocal Pop-Out turned on or off (the experiment, or the refreshed
  // layout it needs). Off-screen background lines and the rows
  // above them keep their measured size, so they are resized here to what they
  // would measure now; otherwise the list would shift as each one next mounts.
  private _applyBgPop(next: boolean): void {
    if (next === this._bgPop) return;
    const v = this._virtualizer;
    const sizes = v
      ? (v as unknown as { itemSizeCache?: Map<number, number> }).itemSizeCache
      : undefined;
    const old = new Map<number, { gap: number; collapsed: boolean }>();
    if (sizes) {
      for (const idx of sizes.keys()) {
        if (this._mountedIndices.has(idx)) continue;
        old.set(idx, {
          gap: this._itemGap(idx),
          collapsed: this._isCollapsedBg(this._allElements[idx]),
        });
      }
    }
    this._bgPop = next;
    if (!v || !sizes) return;
    for (const [idx, prev] of old) {
      const size = sizes.get(idx);
      if (size === undefined) continue;
      const collapsed = this._isCollapsedBg(this._allElements[idx]);
      const gap = this._itemGap(idx);
      let target: number;
      if (collapsed) target = 0;
      else if (prev.collapsed) target = this._estimateSize(idx);
      else target = size + gap - prev.gap;
      if (Math.abs(target - size) < 0.5) continue;
      v.resizeItem(idx, target);
      // Kept in step with the size, which _rowsChanged reads it against.
      const wrapper = this._wrappers[idx];
      if (wrapper) wrapper.style.paddingBottom = `${gap}px`;
    }
    this._blockLayoutGlide(LAYOUT_GLIDE_BLOCK_MS);
    this._remeasureVisible();
  }

  // Rows whose classes changed: each one's gap is set again, and a background
  // line folding or opening also changes the gap of the rows above it, back to
  // its lead line. Mounted rows are re-measured. The animator flags background
  // lines whether they're mounted or not, so a row can also change while
  // unmounted; it can't be measured then, so its cached size is set to what it
  // would measure now. Otherwise the rows below keep the old space until it
  // mounts again, and the list shifts at that point.
  private _rowsChanged(v: Virtualizer<HTMLElement, HTMLElement>, indices: number[]): void {
    const sizeOf = (i: number) =>
      (v as unknown as { itemSizeCache?: Map<number, number> }).itemSizeCache?.get(i);
    // Lowest background row that collapsed or opened in this batch.
    let bgFirst = Infinity;
    if (this._bgPop) {
      for (const index of indices) {
        if (index < bgFirst && this._allElements[index]?.classList.contains("bg-line")) bgFirst = index;
      }
    }
    const toMeasure: HTMLElement[] = [];
    // Unmounted rows resized below, with their previous size.
    const resized: { index: number; prev: number }[] = [];
    let firstMounted: number | null = null;
    const resize = (index: number, size: number) => {
      const prev = sizeOf(index);
      if (prev === undefined || Math.abs(size - prev) < 0.5) return;
      resized.push({ index, prev });
      // A row above everything on screen, with the list at rest (the user has
      // scrolled away): glides would leave scrollTop alone and slide the rows
      // being read, so they're held off and the scroll correction keeps them
      // still. In motion, the re-aim below or the glide's per-frame aim takes
      // it up instead.
      firstMounted ??= this._mountedIndices.size > 0 ? Math.min(...this._mountedIndices) : -1;
      if (index < firstMounted && !this.moving) this._blockLayoutGlide(LAYOUT_GLIDE_BLOCK_MS);
      v.resizeItem(index, size);
    };
    const repad = (index: number) => {
      const wrapper = this._wrappers[index];
      if (!wrapper) return;
      const gap = this._itemGap(index);
      const prev = parseFloat(wrapper.style.paddingBottom) || 0;
      if (Math.abs(gap - prev) < 0.5) return;
      wrapper.style.paddingBottom = `${gap}px`;
      if (wrapper.isConnected) {
        if (!toMeasure.includes(wrapper)) toMeasure.push(wrapper);
        return;
      }
      // The cached size was last measured, or moved, with the old padding.
      const size = sizeOf(index);
      if (size !== undefined) resize(index, size + gap - prev);
    };
    for (const index of indices) {
      const isBg = this._bgPop && !!this._allElements[index]?.classList.contains("bg-line");
      const wrapper = this._wrappers[index];
      if (isBg && !wrapper?.isConnected) {
        if (wrapper) wrapper.style.paddingBottom = `${this._itemGap(index)}px`;
        resize(index, this._estimateSize(index));
      } else {
        repad(index);
      }
      if (!isBg) continue;
      for (let i = index - 1; i >= 0; i--) {
        repad(i);
        if (!this._allElements[i]?.classList.contains("bg-line")) break;
      }
    }
    // Sizes of the rows above the last scroll's target, before measuring, to
    // tell how far the target moved. Read from the size cache: TanStack only
    // rebuilds measurementsCache on its next pass.
    const target = bgFirst < Infinity ? this._lastRetryTarget : null;
    const above = target
      ? toMeasure.map((w) => Number(w.dataset.index)).filter((i) => i < target.index)
      : [];
    const before = above.map((i) => sizeOf(i) ?? 0);
    // Forced for a background line: it folds the moment the list starts to
    // scroll to the next line, exactly when TanStack would hold the size back.
    this._measureBatch(v, toMeasure, bgFirst < Infinity);
    // The animator runs a little behind the scroll's clock, so a group that
    // ends as the next line is scrolled to folds just after the scroll has
    // aimed. While that scroll is still moving, aim it again: as a retry, so a
    // ripple keeps each row's place in it. Smooth Scrolling's glide re-reads
    // the target's place every frame and needs nothing. A list that has come
    // to rest is left alone; the animator holds an ended group open until the
    // list next moves, so a fold always lands inside a motion.
    if (
      target &&
      bgFirst < target.index &&
      this._smoothRAF === null &&
      this._retryMotion()
    ) {
      let moved = 0;
      above.forEach((i, k) => (moved += (sizeOf(i) ?? 0) - before[k]));
      for (const { index, prev } of resized) {
        if (index < target.index) moved += (sizeOf(index) ?? prev) - prev;
      }
      if (Math.abs(moved) >= 1) this._reaimNextFrame(v, target);
    }
    if (toMeasure.length > 0 && this._resizeRAF === null) {
      this._resizeRAF = requestAnimationFrame(() => {
        this._resizeRAF = null;
        if (this._virtualizer === v) {
          virtualizerLogger.debug("Class mutation scheduled virtualizer update");
          v._willUpdate();
        }
      });
    }
  }

  // Background lines the animator folded or opened while they were unmounted,
  // which the class observer can't see.
  detachedRowsChanged(lines: HTMLElement[]): void {
    const v = this._virtualizer;
    if (!v) return;
    const indices: number[] = [];
    for (const el of lines) {
      const index = this._indexByElement.get(el);
      if (index !== undefined) indices.push(index);
    }
    if (indices.length > 0) this._rowsChanged(v, indices);
  }

  /** Whether a scroll, glide or ripple the list made itself is still moving. */
  get moving(): boolean {
    return this._smoothRAF !== null || this._retryMotion();
  }

  // A retry-chain scroll still moving: converging, rippling, or, with Smooth
  // Scrolling off, the browser's own smooth scroll still under way. The user
  // scrolling clears _lastRetryTarget, so their scroll never counts.
  private _retryMotion(): boolean {
    return (
      this._converging ||
      this._cascadeRows.size > 0 ||
      (this._lastRetryTarget !== null && this._virtualizer?.isScrolling === true)
    );
  }

  get refreshedLayout(): boolean {
    return this._refreshed;
  }

  private _estimateSize = (index: number): number => {
    const el = this._allElements[index];
    let h: number;
    if (!el) h = ESTIMATE.default;
    else if (el.classList.contains("musical-line")) {
      // Inactive musical-lines collapse to height: 0 (CSS). Active ones render
      // the dotGroup at roughly default-line height, so estimate accordingly —
      // a 0 estimate for an Active dotline lets every following item render at
      // a wrong start position until the ResizeObserver catches up.
      h = el.classList.contains("Active") ? ESTIMATE.default : ESTIMATE["musical-line"];
    }
    else if (el.classList.contains("bg-line")) h = this._isCollapsedBg(el) ? 0 : ESTIMATE["bg-line"];
    else h = ESTIMATE.default;
    return h + this._itemGap(index);
  };

  // offsetHeight is the most reliable measurement: it reflects the true rendered
  // layout height and is unaffected by translateY, scrollTop, or paint clipping.
  private _measureHeight(el: HTMLElement): number {
    return el.offsetHeight;
  }

  private _remeasureVisible(): void {
    const v = this._virtualizer;
    if (!v) return;
    virtualizerLogger.debug("Remeasure pass started", {
      mountedCount: this._mountedIndices.size,
      containerWidth: this._containerWidth,
    });
    // The font can change with the width (it is clamped), so re-read it here.
    if (this._refreshed) this._readGapFont();
    const toMeasure: HTMLElement[] = [];
    for (const idx of this._mountedIndices) {
      const wrapper = this._wrappers[idx];
      if (!wrapper?.isConnected) continue;
      // The gap is computed in pixels from _containerWidth and the line's
      // current classList. Both can change without the wrapper itself being
      // resized (window resize, Active toggle while disconnected from the
      // class-observer subtree). Refresh padding before measuring so the
      // offsetHeight reading is not contaminated by a stale gap.
      const gap = this._itemGap(idx);
      const prevPad = parseFloat(wrapper.style.paddingBottom) || 0;
      if (Math.abs(prevPad - gap) >= 0.5) {
        wrapper.style.paddingBottom = `${gap}px`;
      }
      toMeasure.push(wrapper);
    }
    // Measured after all padding writes so the pass costs one layout, not one per line.
    this._measureBatch(v, toMeasure);
    if (toMeasure.length > 0) {
      virtualizerLogger.debug("Remeasure pass updated virtualizer layout");
      v._willUpdate();
    } else {
      virtualizerLogger.debug("Remeasure pass completed with no changes");
    }
  }

  public remeasure(): void {
    this._remeasureVisible();
  }

  // Push the live viewport size into TanStack's cached scrollRect when it has gone
  // stale. TanStack writes scrollRect only from observeElementRect's ResizeObserver,
  // which has no zero-guard: while hidden/occluded (Wayland) it caches a 0×0 rect and
  // does not reliably re-fire on restore, so scrollRect stays {0,0} → getSize() 0 →
  // calculateRange() null → the whole list unmounts and never comes back until a manual
  // scroll. Nothing else repairs this, so we write the real size here; offsetWidth/Height
  // matches TanStack's getRect() basis so we don't thrash its RO. Returns true on change.
  private _syncScrollRect(): boolean {
    const v = this._virtualizer;
    const el = this._scrollEl;
    if (!v || !el || document.hidden) return false;
    const w = Math.round(el.offsetWidth);
    const h = Math.round(el.offsetHeight);
    if (w === 0 || h === 0) return false; // mirror the zero-width guards elsewhere
    const r = v.scrollRect;
    if (!r || Math.abs(r.width - w) >= 1 || Math.abs(r.height - h) >= 1) {
      v.scrollRect = { width: w, height: h };
      // Keep TanStack's offset aligned with the real scroll position so the recomputed
      // window lands where the user actually is.
      if (v.scrollOffset == null || Math.abs(v.scrollOffset - el.scrollTop) >= 1) {
        v.scrollOffset = el.scrollTop;
      }
      return true;
    }
    return false;
  }

  // Time-based fallback that self-heals layout drift the reactive observers miss.
  // ResizeObserver notifications can be coalesced/dropped/delivered as a transient
  // 0×0 size (Wayland, CPU lag, fast resizes), so the settle callback never lands and
  // the list stays wedged (stale width or measurements) until a scroll fires
  // _remeasureVisible(). This runs on a low-frequency Maid interval, does read-only
  // layout queries, and only runs the same recovery when it finds drift — returning
  // after the first acting branch to keep steady state at one reflow per tick.
  private _selfHealCheck = (): void => {
    const v = this._virtualizer;
    const el = this._scrollEl;
    if (!v || !el) return;
    // While hidden/minimized/detached the container collapses to 0; measuring
    // then would cache zeros that corrupt the layout on restore. Mirrors the
    // zero-width guards in the resize and width observers.
    if (document.hidden) return;
    const clientWidth = el.clientWidth;
    if (clientWidth === 0) return;
    const clientHeight = el.clientHeight;

    // 0. Viewport drift — TanStack's cached scrollRect can be stale-zero after a
    // hidden/occluded cycle (Wayland) with no RO re-fire, emptying the virtual window.
    // Repair it first and force a re-mount: the primary recovery for the "blank after
    // tabbing back" bug. Being a setInterval (not rAF) it runs even when
    // visibilitychange/focus never fire (occlusion-only on Wayland).
    if (this._syncScrollRect()) {
      virtualizerLogger.debug("Self-heal: refreshed stale TanStack scrollRect");
      this._onVirtualizerChange(v);
      return;
    }

    // 1. Width drift — stale width breaks gap padding (cqw) and the centering
    // math, and today only recovers on scroll.
    if (Math.abs(clientWidth - this._containerWidth) >= 1) {
      virtualizerLogger.debug("Self-heal: width drift detected", {
        previous: this._containerWidth,
        current: clientWidth,
      });
      this._containerWidth = clientWidth;
      this._containerHeight = clientHeight;
      this._blockLayoutGlide(LAYOUT_GLIDE_BLOCK_MS);
      this._smoothGeometry = null;
      if (this._spacer) this._spacer.style.height = `${clientHeight / 2}px`;
      this._remeasureVisible();
      v._willUpdate();
      return;
    }

    // 2. Height drift — changes the visible window and spacer but not item heights.
    if (Math.abs(clientHeight - this._containerHeight) >= 1) {
      virtualizerLogger.debug("Self-heal: height drift detected", {
        previous: this._containerHeight,
        current: clientHeight,
      });
      this._containerHeight = clientHeight;
      this._smoothGeometry = null;
      if (this._spacer) this._spacer.style.height = `${clientHeight / 2}px`;
      v._willUpdate();
      return;
    }

    // 3. Measurement drift — a dropped per-wrapper _resizeObserver notification
    // leaves a mounted wrapper's true height out of sync with the cached size.
    // Read-only offsetHeight over the small mounted window (overscan 5).
    for (const idx of this._mountedIndices) {
      const wrapper = this._wrappers[idx];
      if (!wrapper?.isConnected) continue;
      const cached = (v.measurementsCache[idx] as { size: number } | undefined)?.size;
      if (cached === undefined) continue;
      if (Math.abs(wrapper.offsetHeight - cached) >= 1) {
        virtualizerLogger.debug("Self-heal: measurement drift detected", {
          index: idx,
          cached,
          measured: wrapper.offsetHeight,
        });
        this._remeasureVisible();
        v._willUpdate();
        return;
      }
    }
  };

  private _onScrollEnd = (): void => {
    // Every per-frame write of a smooth glide ends its own "scroll" and fires
    // scrollend; remeasuring each time is a forced layout per frame. The glide
    // remeasures once when it settles instead.
    if (this._smoothRAF !== null) return;
    if (this._scrollEndTimer !== null) {
      clearTimeout(this._scrollEndTimer);
      this._scrollEndTimer = null;
    }
    this._remeasureVisible();
  };

  private _onScrollDebounced = (): void => {
    if (this._smoothRAF !== null) return;
    if (this._scrollEndTimer !== null) clearTimeout(this._scrollEndTimer);
    this._scrollEndTimer = setTimeout(() => {
      this._scrollEndTimer = null;
      this._remeasureVisible();
    }, 200);
  };

  init(
    scrollEl: HTMLElement,
    virtualContainer: HTMLElement,
    lineElements: HTMLElement[]
  ): void {
    virtualizerLogger.info("Initializing lyrics virtualizer", {
      lineCount: lineElements.length,
      scrollClientHeight: scrollEl.clientHeight,
      scrollClientWidth: scrollEl.clientWidth,
    });
    this.destroy();
    this._maid = new Maid();
    this._maid.Give(() => {
      if (this._scrollEndTimer !== null) { clearTimeout(this._scrollEndTimer); this._scrollEndTimer = null; }
      if (this._resizeRAF !== null) { cancelAnimationFrame(this._resizeRAF); this._resizeRAF = null; }
    });
    this._allElements = lineElements;
    this._indexByElement = new Map(lineElements.map((el, i) => [el, i]));
    this._wrappers = new Array(lineElements.length).fill(null);
    this._virtualContainer = virtualContainer;
    this._scrollEl = scrollEl;
    this._trailingCache = null;
    const listParent = virtualContainer.parentElement;
    if (listParent) {
      this._trailingObserver = this._maid.Give(
        new MutationObserver(() => {
          this._trailingCache = null;
        })
      );
      this._trailingObserver.observe(listParent, { childList: true });
    }
    this._refreshed = isRefreshedSimpleLyrics();
    this._bgPop = isBgPopActive();
    // The ripple holds rows back with `translate` as the list scrolls past them,
    // and Chromium's scroll anchoring reads that as the rows moving down, so it
    // scrolled the list a second time by the same amount.
    if (this._refreshed) scrollEl.style.overflowAnchor = "none";

    const containerWidth = scrollEl.clientWidth || virtualContainer.clientWidth || 0;
    this._containerWidth = containerWidth;
    this._containerHeight = scrollEl.clientHeight;
    virtualizerLogger.debug("Initial container width resolved", containerWidth);

    this._resizeObserver = this._maid!.Give(new ResizeObserver((entries) => {
      const v = this._virtualizer;
      if (!v) return;
      // When minimized the scroll element collapses to 0×0 and every wrapper fires
      // with 0 offsetHeight; caching those zeros corrupts the cache so on restore all
      // items land at start=0. Only write measurements when the container is rendered.
      if (this._scrollEl && this._scrollEl.clientWidth === 0) {
        virtualizerLogger.debug("Skipping resize measure: container width is zero");
        return;
      }
      const toMeasure: HTMLElement[] = [];
      for (const entry of entries) {
        const el = entry.target as HTMLElement;
        if (!el.isConnected) continue;
        if (el.getAttribute("data-index") === null) continue;
        toMeasure.push(el);
      }
      this._measureBatch(v, toMeasure);
      if (toMeasure.length > 0 && this._resizeRAF === null) {
        this._resizeRAF = requestAnimationFrame(() => {
          this._resizeRAF = null;
          if (this._virtualizer === v) {
            virtualizerLogger.debug("ResizeObserver scheduled virtualizer update");
            v._willUpdate();
          }
        });
      }
    }));

    this._classObserver = this._maid!.Give(new MutationObserver((mutations) => {
      const v = this._virtualizer;
      if (!v) return;
      const indices: number[] = [];
      for (const mutation of mutations) {
        const index = this._indexByElement.get(mutation.target as HTMLElement);
        if (index !== undefined) indices.push(index);
      }
      this._rowsChanged(v, indices);
    }));
    // Single subtree observer on the virtual container rather than one per element:
    // only mounted elements live there, so it scopes to where gap updates matter.
    this._classObserver.observe(virtualContainer, {
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });

    this._virtualizer = new Virtualizer<HTMLElement, HTMLElement>({
      count: lineElements.length,
      getScrollElement: () => scrollEl,
      estimateSize: this._estimateSize,
      overscan: OVERSCAN,
      gap: 0,
      scrollToFn: elementScroll,
      observeElementRect,
      observeElementOffset,
      onChange: (v) => this._queueChange(v),
      measureElement: this._measureHeight,
    });

    this._virtualizer.shouldAdjustScrollPositionOnItemSizeChange = this._shouldAdjustScroll;

    // Switching Smooth Scrolling off must take effect on the glide in flight,
    // not only on the next scroll.
    this._maid!.Give(
      $smoothScrolling.listen((enabled) => {
        if (!enabled) this._handOffSmoothScroll();
      })
    );
    // In this order: each one resizes rows relative to the other's current state.
    const syncLayout = () => {
      this._applyRefreshed(isRefreshedSimpleLyrics());
      this._applyBgPop(isBgPopActive());
    };
    this._maid!.Give($simpleLyricsMode.listen(syncLayout));
    this._maid!.Give($experiment("refreshedSimpleLyrics").listen(syncLayout));
    this._maid!.Give($experiment("backgroundLinePop").listen(syncLayout));
    this._blockLayoutGlide(LAYOUT_GLIDE_BLOCK_INIT_MS);

    scrollEl.scrollTop = 0;
    virtualizerLogger.debug("Scroll position reset to top during init");
    this._virtualizer._willUpdate();
    this._flushQueuedChange(this._virtualizer);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const v = this._virtualizer;
        if (!v || !this._scrollEl) return;
        const settled = this._scrollEl.clientWidth;
        if (settled > 0 && Math.abs(settled - this._containerWidth) >= 1) {
          virtualizerLogger.debug("Post-init width settled to new value", {
            previous: this._containerWidth,
            settled,
          });
          this._containerWidth = settled;
          this._remeasureVisible();
        }
        // The scroll element may not have had its final size when init() ran, so
        // TanStack could have cached a 0/last-known rect. Push the settled size in and
        // re-mount so the first paint isn't blank when opening the page.
        this._syncScrollRect();
        this._onVirtualizerChange(v);
      })
    });

    scrollEl.addEventListener("scrollend", this._onScrollEnd, { passive: true });
    scrollEl.addEventListener("scroll", this._onScrollDebounced, { passive: true });
    this._maid!.Give(() => {
      this._scrollEl?.removeEventListener("scrollend", this._onScrollEnd);
      this._scrollEl?.removeEventListener("scroll", this._onScrollDebounced);
    });

    // Anything the user does to move the list. The scrollbar lives on the
    // SimpleBar root, outside the scroll element, hence the second target.
    const intentRoot = scrollEl.closest<HTMLElement>("[data-simplebar]") ?? scrollEl;
    this._scrollbarRoot = intentRoot;
    for (const type of ["wheel", "touchstart", "keydown"] as const) {
      scrollEl.addEventListener(type, this._onUserScrollIntent, { passive: true });
    }
    intentRoot.addEventListener("pointerdown", this._onUserScrollIntent, { passive: true });
    this._maid!.Give(() => {
      for (const type of ["wheel", "touchstart", "keydown"] as const) {
        scrollEl.removeEventListener(type, this._onUserScrollIntent);
      }
      intentRoot.removeEventListener("pointerdown", this._onUserScrollIntent);
    });

    // Permanent bottom spacer at half the viewport height so the last item can be
    // centered without temporary container-height inflation (which flickers the scrollbar).
    const spacer = document.createElement("div");
    spacer.style.flexShrink = "0";
    spacer.style.pointerEvents = "none";
    spacer.setAttribute("aria-hidden", "true");
    spacer.style.height = `${scrollEl.clientHeight / 2}px`;
    scrollEl.appendChild(spacer);
    this._spacer = spacer;
    this._maid!.Give(() => spacer.parentElement?.removeChild(spacer));

    this._widthObserver = this._maid!.Give(new ResizeObserver(() => {
      const v = this._virtualizer;
      const el = this._scrollEl;
      if (!v || !el) return;
      const newWidth = el.clientWidth;
      
      if (newWidth === 0) {
        virtualizerLogger.debug("Ignoring width change to 0 (likely minimized)");
        return;
      }
      // The viewport moved under a glide in flight; have it re-read its geometry.
      this._smoothGeometry = null;
      if (this._spacer) this._spacer.style.height = `${el.clientHeight / 2}px`;
      if (Math.abs(newWidth - this._containerWidth) < 1) {
        // Width unchanged, but a height-only resize (vertical-only window resize,
        // PIP) still changes the visible window. The early return would otherwise
        // swallow it until the watchdog catches up; respond immediately here.
        if (Math.abs(el.clientHeight - this._containerHeight) >= 1) {
          virtualizerLogger.debug("Container height changed (width stable)", {
            previous: this._containerHeight,
            next: el.clientHeight,
          });
          this._containerHeight = el.clientHeight;
          this._blockLayoutGlide(LAYOUT_GLIDE_BLOCK_MS);
          v._willUpdate();
        }
        return;
      }
      
      this._blockLayoutGlide(LAYOUT_GLIDE_BLOCK_MS);
      virtualizerLogger.info("Container width changed", {
        previous: this._containerWidth,
        next: newWidth,
      });
      this._containerWidth = newWidth;
      this._containerHeight = el.clientHeight;

      // Clear any existing timer
      if (this._resizeDebounceTimer !== null) {
        clearTimeout(this._resizeDebounceTimer);
      }
    
      // Wait 150ms after the user STOPS resizing before measuring.
      // This lets sluggish devices finish their DOM reflow before TanStack measures.
      this._resizeDebounceTimer = setTimeout(() => {
        this._resizeDebounceTimer = null;
        virtualizerLogger.debug("Applying debounced resize remeasure");
        this._remeasureVisible();
        v._willUpdate();
      }, 150);
    }));
    this._widthObserver.observe(scrollEl);

    // Watchdog catching drift within ~250ms when an observer notification above is
    // coalesced/dropped/zero-sized. Registered on the Maid so destroy() tears it down.
    const healInterval = setInterval(this._selfHealCheck, 250);
    this._maid!.Give(() => clearInterval(healInterval));

    // After a minimize/restore cycle _mountedIndices is empty, so the observers'
    // re-triggered _remeasureVisible is a no-op. Force a full remeasure once the page
    // has re-laid out so every re-mounted item gets correct heights.
    const _handleVisibilityRestore = () => {
      if (document.hidden) return;
      this._blockLayoutGlide(LAYOUT_GLIDE_BLOCK_MS);
      virtualizerLogger.debug("Visibility restored; forcing remeasure cycle");
      requestAnimationFrame(() => {
        const v = this._virtualizer;
        if (!v || !this._scrollEl) return;
        const w = this._scrollEl.clientWidth;
        if (w > 0 && Math.abs(w - this._containerWidth) >= 0.5) {
          this._containerWidth = w;
        }
        // Push the live viewport size back into TanStack (its RO may have cached 0×0
        // while hidden and not re-fired) and re-mount from the fresh rect.
        this._syncScrollRect();
        this._remeasureVisible();
        this._onVirtualizerChange(v);
      });
    };
    document.addEventListener("visibilitychange", _handleVisibilityRestore);
    this._maid!.Give(() =>
      document.removeEventListener("visibilitychange", _handleVisibilityRestore)
    );
  }

  // Get or create the positioning wrapper for the given index.
  private _getOrCreateWrapper(index: number): HTMLElement {
    let wrapper = this._wrappers[index];
    if (!wrapper) {
      wrapper = document.createElement("div");
      wrapper.setAttribute("data-index", String(index));
      wrapper.style.position = "absolute";
      wrapper.style.left = "0";
      wrapper.style.width = "100%";
      wrapper.style.willChange = "transform";
      wrapper.style.paddingBottom = `${this._itemGap(index)}px`;
      this._wrappers[index] = wrapper;

      const el = this._allElements[index];
      if (el) {
        el.style.position = "";
        el.style.transform = "";
        el.style.left = "";
        el.style.width = "100%";
        wrapper.appendChild(el);
      }
    }
    return wrapper;
  }

  // TanStack notifies once per resized item, and its ResizeObserver resizes items
  // one at a time: running the mount pass on each notify forced a layout per line.
  // Coalesce to one pass per task; the microtask still lands before paint.
  private _queueChange(v: Virtualizer<HTMLElement, HTMLElement>): void {
    if (this._inOnChange) {
      this._onChangePending = true;
      return;
    }
    if (this._changeQueued) return;
    this._changeQueued = true;
    queueMicrotask(() => this._flushQueuedChange(v));
  }

  // Run a queued pass now. Needed right after our own DOM insertions: Spicetify's
  // wrapper rescans the page once per mutation delivery, so mounting in a later
  // microtask would cost a second full scan.
  private _flushQueuedChange(v: Virtualizer<HTMLElement, HTMLElement>): void {
    if (!this._changeQueued) return;
    this._changeQueued = false;
    this._onVirtualizerChange(v);
  }

  // measureElement can synchronously re-enter onChange, whose DOM writes would
  // force a fresh layout for every following read. Hold onChange until the batch
  // is measured, then run it once.
  // `force` writes the sizes even while the list is scrolling, when TanStack's
  // measureElement holds them back until the scroll has been still for a moment.
  private _measureBatch(
    v: Virtualizer<HTMLElement, HTMLElement>,
    wrappers: HTMLElement[],
    force = false
  ): void {
    const measure = (wrapper: HTMLElement) => {
      if (!force) v.measureElement(wrapper);
      else if (wrapper.isConnected) v.resizeItem(Number(wrapper.dataset.index), this._measureHeight(wrapper));
    };
    if (this._inOnChange) {
      for (const wrapper of wrappers) measure(wrapper);
      return;
    }
    this._inOnChange = true;
    try {
      for (const wrapper of wrappers) measure(wrapper);
    } finally {
      this._inOnChange = false;
    }
    if (this._onChangePending) {
      this._onChangePending = false;
      this._onVirtualizerChange(v);
    }
  }

  private _onVirtualizerChange(v: Virtualizer<HTMLElement, HTMLElement>): void {
    // Guard against stale callbacks from a virtualizer that has been replaced.
    if (v !== this._virtualizer) return;
    if (!this._virtualContainer) return;

    if (this._inOnChange) {
      // Re-entered from a sync resizeItem → notify chain triggered by our
      // own v.measureElement() call. Skip the inner pass and let the outer
      // call re-run with a fresh items snapshot once it finishes.
      this._onChangePending = true;
      return;
    }

    this._inOnChange = true;
    try {
      do {
        this._onChangePending = false;
        this._doOnVirtualizerChange(v);
      } while (this._onChangePending && this._virtualizer === v);
    } finally {
      this._inOnChange = false;
    }
  }

  private _doOnVirtualizerChange(v: Virtualizer<HTMLElement, HTMLElement>): void {
    if (!this._virtualContainer) return;

    const totalSize = v.getTotalSize();
    this._virtualContainer.style.height = `${totalSize}px`;
    const sizeDelta = totalSize - this._lastTotalSize;
    if (
      this._lastTotalSize > 0 &&
      Math.abs(sizeDelta) >= 0.5 &&
      this._mountedIndices.has(this._allElements.length - 1) &&
      this._layoutGlideEnabled()
    ) {
      this._glideTrailing(sizeDelta);
    }
    this._lastTotalSize = totalSize;

    const items = v.getVirtualItems();
    const nextVisible = new Set(items.map((i) => i.index));
    const firstVisible = items[0]?.index ?? -1;
    const lastVisible = items[items.length - 1]?.index ?? -1;
    const signature = `${firstVisible}:${lastVisible}:${items.length}:${totalSize}`;
    if (signature !== this._lastVirtualWindowSignature) {
      this._lastVirtualWindowSignature = signature;
      virtualizerLogger.debug("Visible window updated", {
        firstVisible,
        lastVisible,
        visibleCount: items.length,
        totalSize,
      });
    }

    // Writes and reads are split into separate passes throughout: interleaving an
    // offsetHeight read with each append forced a full page layout per line.
    // A glide in flight keeps its rows mounted (see _glideHold), on top of the window.
    const hold = this._glideHold;
    const rendered = hold
      ? [
          ...items,
          ...[...hold]
            .filter((idx) => !nextVisible.has(idx) && v.measurementsCache[idx])
            .map((idx) => v.measurementsCache[idx]),
        ]
      : items;
    const toUnmount: number[] = [];
    for (const idx of this._mountedIndices) {
      if (!nextVisible.has(idx) && !hold?.has(idx)) toUnmount.push(idx);
    }
    // Sync the cached size to the line's current classList before unmounting.
    // The animator may have flipped Active/Sung since the wrapper was rendered,
    // and the MutationObserver only fires for elements still in the subtree (and
    // only as a microtask). Recomputing the gap here makes the cache match what a
    // remount would render, so re-entry doesn't misalign following items by the
    // stale dot-line height. We do NOT mutate classList — the animator owns
    // Active/Sung, and stripping Active flashes the line collapsed on remount.
    const unmountWrappers: HTMLElement[] = [];
    for (const idx of toUnmount) {
      const wrapper = this._wrappers[idx];
      if (wrapper) {
        const gap = this._itemGap(idx);
        const prevPad = parseFloat(wrapper.style.paddingBottom) || 0;
        if (Math.abs(prevPad - gap) >= 0.5) {
          wrapper.style.paddingBottom = `${gap}px`;
        }
        unmountWrappers.push(wrapper);
        if (this._cascadeRows.delete(idx)) {
          wrapper.style.translate = "";
          if (idx === this._allElements.length - 1) this._setTrailingOffset(0);
        }
      }
      this._mountedIndices.delete(idx);
    }
    for (const wrapper of unmountWrappers) v.measureElement(wrapper);
    for (const wrapper of unmountWrappers) {
      this._resizeObserver?.unobserve(wrapper);
      wrapper.parentElement?.removeChild(wrapper);
    }
    if (unmountWrappers.length > 0 && this._resizeRAF === null) {
      this._resizeRAF = requestAnimationFrame(() => {
        this._resizeRAF = null;
        if (this._virtualizer === v) {
          virtualizerLogger.debug("Unmount pass scheduled virtualizer update");
          v._willUpdate();
        }
      });
    }

    // Measured on mount so start offsets are corrected in the same frame; a gap
    // change alters height without a ResizeObserver callback arriving in time.
    const toMeasure: HTMLElement[] = [];
    let mountedAny = false;
    const glide = this._layoutGlideEnabled();
    for (const item of rendered) {
      const wrapper = this._getOrCreateWrapper(item.index);
      const gap = this._itemGap(item.index);
      const prevPad = parseFloat(wrapper.style.paddingBottom) || 0;
      const gapChanged = Math.abs(prevPad - gap) >= 0.5;
      if (gapChanged) {
        wrapper.style.paddingBottom = `${gap}px`;
      }
      // Only rows already on screen glide; a row being mounted has no previous
      // position to glide from and must appear where it belongs.
      const wantGlide = glide && this._mountedIndices.has(item.index);
      if ((wrapper.dataset.glide === "1") !== wantGlide) {
        wrapper.style.transition = wantGlide ? LAYOUT_GLIDE_TRANSITION : "";
        wrapper.dataset.glide = wantGlide ? "1" : "";
      }
      wrapper.style.transform = `translateY(${Math.round(item.start)}px)`;

      if (!this._mountedIndices.has(item.index)) {
        this._virtualContainer.appendChild(wrapper);
        this._mountedIndices.add(item.index);
        this._resizeObserver?.observe(wrapper);
        toMeasure.push(wrapper);
        mountedAny = true;
        if (this._cascadeRows.size > 0) this._joinCascade(item.index);
      } else if (gapChanged) {
        toMeasure.push(wrapper);
      }
    }
    // The first rows of a list: the refreshed gap needs a mounted line's font,
    // so set their padding again now that there is one.
    if (mountedAny && this._refreshed && this._gapFontPx === 0 && this._readGapFont()) {
      for (const item of rendered) {
        const wrapper = this._wrappers[item.index];
        if (!wrapper) continue;
        wrapper.style.paddingBottom = `${this._itemGap(item.index)}px`;
        if (!toMeasure.includes(wrapper)) toMeasure.push(wrapper);
      }
    }
    for (const wrapper of toMeasure) v.measureElement(wrapper);
    if (mountedAny) this._onNewElementMounted?.();
    const didMeasure = toMeasure.length > 0;
    if (didMeasure && this._resizeRAF === null) {
      this._resizeRAF = requestAnimationFrame(() => {
        this._resizeRAF = null;
        if (this._virtualizer === v) {
          virtualizerLogger.debug("Mount pass scheduled virtualizer update");
          v._willUpdate();
        }
      });
    }
  }

  private _trailingElements(): HTMLElement[] {
    if (this._trailingObserver?.takeRecords().length) this._trailingCache = null;
    if (this._trailingCache) return this._trailingCache;
    const out: HTMLElement[] = [];
    let el = this._virtualContainer?.nextElementSibling;
    while (el) {
      if (el !== this._spacer) out.push(el as HTMLElement);
      el = el.nextElementSibling;
    }
    // Without an observer nothing would clear the cache, so the list is walked every time.
    if (this._trailingObserver) this._trailingCache = out;
    return out;
  }

  private _setTrailingOffset(offset: number): void {
    if (Math.abs(offset - this._trailingOffset) < 0.01 && offset !== 0) return;
    if (offset === 0 && this._trailingOffset === 0) return;
    this._trailingOffset = offset;
    const value = offset === 0 ? "" : `0 ${offset.toFixed(2)}px`;
    for (const el of this._trailingElements()) el.style.translate = value;
  }

  // The list grew or shrank by `delta` while its rows glide to their new places:
  // start the credits where they were and glide them along with the last row.
  // Additive, so a glide started mid-glide stacks instead of jumping.
  private _glideTrailing(delta: number): void {
    for (const el of this._trailingElements()) {
      el.animate(
        [{ transform: `translateY(${-delta}px)` }, { transform: "translateY(0)" }],
        { duration: LAYOUT_GLIDE_MS, easing: LAYOUT_GLIDE_EASING, composite: "add" }
      );
    }
  }

  /**
   * How much a "•••" interlude line right above `index` will give up. Once the
   * line after it starts the interlude collapses to nothing, but a scroll to
   * that line often starts first (Early Scroll, the ripple, Smooth Scrolling).
   * Aimed at the line's current place, it would end up this far above centre
   * when the collapse lands, so the scroll aims where the line is going.
   */
  private _collapsingAbove(v: Virtualizer<HTMLElement, HTMLElement>, index: number): number {
    if (!this._allElements[index - 1]?.classList.contains("musical-line")) return 0;
    const above = v.measurementsCache[index - 1] as { size: number } | undefined;
    return above ? above.size : 0;
  }

  getVirtualizer(): Virtualizer<HTMLElement, HTMLElement> | null {
    return this._virtualizer;
  }

  /**
   * Scroll the virtualizer to center (or align) a specific line index.
   *
   * Bypasses TanStack's scrollToIndex() (its offset ignores the scroll
   * container's margin-top). We read item.start/size from measurementsCache,
   * measure the absolute containerOffset, compute the target scrollTop, set it
   * directly, then schedule a one-frame retry that re-reads the cache and
   * re-scrolls if measurements drifted or the browser clamped scrollTop —
   * converging when the first call relied on estimates (mid-song open).
   */
  scrollToIndex(
    index: number,
    align: "start" | "center" | "end" | "auto" = "center",
    instant: boolean = false,
    padding: number = 0
  ): void {
    if (this._scrollVerifyRAF !== null) {
      cancelAnimationFrame(this._scrollVerifyRAF);
      this._scrollVerifyRAF = null;
    }
    // Refreshed Simple Lyrics follows lines with the ripple, in place of either
    // kind of smooth scroll. The list itself moves instantly; the rows animate.
    this._cascadeChain = !instant && this._refreshed;
    if (this._cascadeChain) {
      this._stopSmoothScroll();
      this._setConverging(true);
      this._scrollToIndexWithRetry(index, align, true, padding, 0, null);
      return;
    }
    this._stopCascade();
    if (!instant && $smoothScrolling.get()) {
      this._smoothScrollToIndex(index, align, padding);
      return;
    }
    this._stopSmoothScroll();
    this._setConverging(true);
    this._scrollToIndexWithRetry(index, align, instant, padding, 0, null);
  }

  /**
   * Hand a scroll the list just made (`from` → `to`) to the rows, so they reach
   * it in a ripple. `target` is the line being scrolled to, or -1 for a retry
   * correcting the same move, which leaves each row's place in the ripple as it
   * was. Must run in the same task as the scrollTop write, before paint.
   */
  private _cascadeTo(
    from: number,
    to: number,
    target: number,
    containerOffset: number,
    viewportHeight: number
  ): void {
    const v = this._virtualizer;
    if (!v || Math.abs(to - from) < 0.5) return;
    if (target >= 0 && Math.abs(to - from) > viewportHeight * CASCADE_MAX_JUMP) {
      this._stopCascade();
      return;
    }
    const now = performance.now();
    let delay = 0;
    let step = CASCADE_STEP_MS;
    const indices = [...this._mountedIndices].sort((a, b) => a - b);
    for (const idx of indices) {
      let row = this._cascadeRows.get(idx);
      if (!row) {
        // At rest where the list was.
        row = { p: from, v: 0, goal: from, next: from, at: 0, drawn: 0 };
        this._cascadeRows.set(idx, row);
      }
      if (target < 0) {
        if (row.at) row.next = to;
        else row.goal = to;
        continue;
      }
      const item = v.measurementsCache[idx] as { end: number } | undefined;
      if (item && containerOffset + item.end - from <= 0) {
        // Above the viewport: nobody sees it, so it needn't wait.
        row.goal = to;
        row.at = 0;
        continue;
      }
      row.next = to;
      row.at = now + delay;
      delay += step;
      if (idx >= target) step *= CASCADE_STEP_FALLOFF;
    }
    this._cascadeScroll = to;
    // Hold every row where it was for this frame; the scroll already moved.
    for (const [idx, row] of this._cascadeRows) this._drawCascadeRow(idx, row);
    if (this._cascadeRAF === null) {
      this._cascadeLastTs = null;
      this._cascadeRAF = requestCappedFrame(this._cascadeStep);
    }
  }

  // A row mounted mid-ripple (scrolled into the window) moves with its neighbour.
  private _joinCascade(index: number): void {
    for (let d = 1; d < 8; d++) {
      const near = this._cascadeRows.get(index - d) ?? this._cascadeRows.get(index + d);
      if (!near) continue;
      const row = { ...near, drawn: 0 };
      this._cascadeRows.set(index, row);
      this._drawCascadeRow(index, row);
      return;
    }
  }

  private _drawCascadeRow(index: number, row: CascadeRow): void {
    const offset = this._cascadeScroll - row.p;
    if (Math.abs(offset - row.drawn) < 0.01) return;
    row.drawn = offset;
    const wrapper = this._wrappers[index];
    if (wrapper) wrapper.style.translate = offset === 0 ? "" : `0 ${offset.toFixed(2)}px`;
    if (index === this._allElements.length - 1) this._setTrailingOffset(offset);
  }

  private _cascadeStep = (ts: number): void => {
    this._cascadeRAF = null;
    const elapsed =
      this._cascadeLastTs === null
        ? 1 / 60
        : Math.min((ts - this._cascadeLastTs) / 1000, CASCADE_MAX_ELAPSED);
    this._cascadeLastTs = ts;
    const now = performance.now();
    const w = CASCADE_FREQUENCY * 2 * Math.PI;
    for (const [idx, row] of this._cascadeRows) {
      if (row.at && now >= row.at) {
        row.goal = row.next;
        row.at = 0;
      }
      for (let left = elapsed; left > 0; left -= CASCADE_MAX_STEP) {
        stepCascadeRow(row, Math.min(left, CASCADE_MAX_STEP), w);
      }
      const home =
        row.at === 0 &&
        row.goal === this._cascadeScroll &&
        Math.abs(row.p - row.goal) < CASCADE_SETTLE_PX &&
        Math.abs(row.v) < CASCADE_SETTLE_SPEED;
      if (home) {
        row.p = row.goal;
        this._drawCascadeRow(idx, row);
        this._cascadeRows.delete(idx);
      } else {
        this._drawCascadeRow(idx, row);
      }
    }
    if (this._cascadeRows.size > 0) this._cascadeRAF = requestCappedFrame(this._cascadeStep);
    else this._cascadeLastTs = null;
  };

  // Puts every row back where the list has it, at once.
  private _stopCascade(): void {
    if (this._cascadeRAF !== null) {
      cancelCappedFrame(this._cascadeRAF);
      this._cascadeRAF = null;
    }
    for (const idx of this._cascadeRows.keys()) {
      const wrapper = this._wrappers[idx];
      if (wrapper) wrapper.style.translate = "";
    }
    this._cascadeRows.clear();
    this._setTrailingOffset(0);
    this._cascadeLastTs = null;
    this._cascadeChain = false;
  }

  // Where item N sits in the virtual container. Unmeasured items fall back to an
  // average-size estimate; callers re-read this as measurements land.
  // Re-aims `target` on the next frame, after the virtualizer's own pass has
  // placed the rows at their new sizes. Held in the retry chain's slot, so any
  // new scroll cancels it.
  private _reaimNextFrame(
    v: Virtualizer<HTMLElement, HTMLElement>,
    target: NonNullable<LyricsVirtualizer["_lastRetryTarget"]>
  ): void {
    if (this._scrollVerifyRAF !== null) cancelAnimationFrame(this._scrollVerifyRAF);
    this._setConverging(true);
    this._scrollVerifyRAF = requestAnimationFrame(() => {
      this._scrollVerifyRAF = null;
      if (this._virtualizer !== v || this._lastRetryTarget !== target || !this._scrollEl) {
        this._setConverging(false);
        return;
      }
      this._scrollToIndexWithRetry(
        target.index,
        target.align,
        target.instant,
        target.padding,
        1,
        this._scrollEl.scrollTop
      );
    });
  }

  private _getItemRect(
    v: Virtualizer<HTMLElement, HTMLElement>,
    index: number
  ): { start: number; size: number } {
    const cached = v.measurementsCache[index] as
      | { start: number; end: number; size: number }
      | undefined;
    if (cached) return { start: cached.start, size: cached.size };

    // gap is always 0 — baked into each wrapper's padding-bottom.
    const count = this._allElements.length;
    const totalSize = v.getTotalSize();
    const avgItemSize = count > 1 ? totalSize / count : totalSize;
    return { start: index * avgItemSize, size: this._estimateSize(index) };
  }

  /**
   * Spring-driven alternative to the native smooth scroll. Each frame re-reads
   * the target line's position (items mounting above it shift it while we
   * travel), so this converges on far targets the same way the retry chain
   * does, without needing it. Calling again mid-flight just retargets.
   */
  private _smoothScrollToIndex(
    index: number,
    align: "start" | "center" | "end" | "auto",
    padding: number
  ): void {
    const v = this._virtualizer;
    const scrollEl = v?.scrollElement;
    if (!v || !scrollEl || !this._virtualContainer) return;

    const viewportHeight = scrollEl.clientHeight;
    if (!viewportHeight) return;

    const animating = this._smoothRAF !== null;
    // Where the list visually is right now, sub-pixel remainder included.
    const current = animating && this._smoothSpring
      ? scrollEl.scrollTop + this._smoothFraction
      : scrollEl.scrollTop;

    if (!this._smoothSpring) {
      this._smoothSpring = new Spring(current, SMOOTH_SCROLL_FREQUENCY, SMOOTH_SCROLL_DAMPING);
    } else if (!animating) {
      // Starting fresh: begin at rest from wherever the list actually is.
      this._smoothSpring.SetGoal(current, true);
    }

    this._smoothGeometry = this._readSmoothGeometry(v, scrollEl);
    this._smoothReconciles = 0;

    this._smoothTarget = { index, align, padding };
    // The glide is in charge now; an older retry-chain target must not count
    // as motion once it lands (see _retryMotion).
    this._lastRetryTarget = null;
    // We are the only scrollTop writer until the glide settles — see _shouldAdjustScroll.
    this._setConverging(true);
    this._holdForGlide(v, index, align, padding);

    if (!animating) {
      this._smoothLastTs = null;
      this._smoothLastPosition = null;
      this._smoothLastWhole = null;
      this._smoothRAF = requestCappedFrame(this._smoothStep);
    }
  }

  /**
   * Mounts, now, the rows the glide to `index` will end on (with overscan), and
   * keeps everything mounted until it lands. See _glideHold.
   */
  private _holdForGlide(
    v: Virtualizer<HTMLElement, HTMLElement>,
    index: number,
    align: "start" | "center" | "end" | "auto",
    padding: number
  ): void {
    const geometry = this._smoothGeometry;
    const items = v.measurementsCache;
    if (!geometry || items.length === 0) return;
    const item = this._getItemRect(v, index);
    const goal = Math.min(
      geometry.maxScroll,
      this._computeFinalScrollTop(
        item.start - this._collapsingAbove(v, index),
        item.size,
        geometry.viewportHeight,
        geometry.containerOffset,
        align,
        padding
      )
    );
    // The destination's viewport, in the virtual container's coordinates. The
    // virtualizer itself (no scrollMargin) takes scrollTop as the container's own
    // offset, so its window runs on below the real one by containerOffset; hold
    // both, or the row at its far edge still mounts mid-glide.
    const top = goal - geometry.containerOffset;
    const bottom = goal + geometry.viewportHeight;
    let first = items.findIndex((m) => m.end > top);
    if (first < 0) first = items.length - 1;
    let last = first;
    while (last + 1 < items.length && items[last + 1].start < bottom) last++;

    // Every row from those mounted now through the destination's, so nothing in
    // between mounts as the glide passes over it. A longer stretch than the cap
    // isn't held at all: it would mount too much up front.
    let from = Math.max(0, first - OVERSCAN);
    let to = Math.min(items.length - 1, last + OVERSCAN);
    for (const idx of [...(this._glideHold ?? []), ...this._mountedIndices]) {
      if (idx < from) from = idx;
      if (idx > to) to = idx;
    }
    if (to - from + 1 > GLIDE_HOLD_MAX_ROWS) {
      this._releaseGlideHold();
      return;
    }
    const hold = new Set<number>();
    for (let i = from; i <= to; i++) hold.add(i);
    this._glideHold = hold;
    this._onVirtualizerChange(v);
  }

  // Drops the hold and lets the window shrink back to what's on screen.
  private _releaseGlideHold(): void {
    if (!this._glideHold) return;
    this._glideHold = null;
    if (this._virtualizer) this._onVirtualizerChange(this._virtualizer);
  }

  // Layout reads for the glide. Done at retarget and after invalidation only —
  // never on an ordinary frame. Null when the list isn't laid out.
  private _readSmoothGeometry(
    v: Virtualizer<HTMLElement, HTMLElement>,
    scrollEl: HTMLElement
  ): NonNullable<LyricsVirtualizer["_smoothGeometry"]> | null {
    const container = this._virtualContainer;
    const viewportHeight = scrollEl.clientHeight;
    if (!container || !viewportHeight) return null;
    // The virtual container's rect includes the sub-pixel translate, so add it
    // back to get the untranslated offset.
    const containerRect = container.getBoundingClientRect();
    const scrollElRect = scrollEl.getBoundingClientRect();
    return {
      containerOffset:
        containerRect.top - scrollElRect.top + scrollEl.scrollTop + this._smoothFraction,
      viewportHeight,
      maxScroll: Math.max(0, scrollEl.scrollHeight - viewportHeight),
      totalSize: v.getTotalSize(),
    };
  }

  /**
   * One frame of the glide. Ordinarily reads no layout: the goal comes from
   * TanStack's measurement cache (items mounting above the target move it while
   * we travel, so it is re-read every frame) plus geometry cached at retarget,
   * with the scroll limit kept current from the change in total size. The only
   * DOM work is the scroll write and the sub-pixel translate.
   */
  private _smoothStep = (ts: number): void => {
    this._smoothRAF = null;
    const v = this._virtualizer;
    const target = this._smoothTarget;
    const spring = this._smoothSpring;
    const scrollEl = v?.scrollElement;
    const container = this._virtualContainer;
    if (!v || !target || !spring || !scrollEl || !container) {
      this._stopSmoothScroll();
      return;
    }

    // Invalidated by a viewport resize (or never read): re-read it this frame.
    if (!this._smoothGeometry) this._smoothGeometry = this._readSmoothGeometry(v, scrollEl);
    const geometry = this._smoothGeometry;
    if (!geometry) {
      this._stopSmoothScroll();
      return;
    }

    const maxScroll = Math.max(0, geometry.maxScroll + (v.getTotalSize() - geometry.totalSize));
    const step = scrollStep(scrollEl);
    const maxWhole = Math.floor(maxScroll / step + 1e-6) * step;
    const item = this._getItemRect(v, target.index);
    // On a scroll step, so the glide ends where scrollTop can actually sit, with no
    // translate left over.
    const goal = Math.min(
      maxWhole,
      Math.round(
        this._computeFinalScrollTop(
          item.start - this._collapsingAbove(v, target.index),
          item.size,
          geometry.viewportHeight,
          geometry.containerOffset,
          target.align,
          target.padding
        ) / step
      ) * step
    );

    spring.SetGoal(goal);
    // Step the spring in slices of at most SMOOTH_SCROLL_MAX_STEP so a low frame
    // rate cap (15 fps is ~67 ms a frame) keeps the glide's wall-clock timing.
    // A frame that arrives well after the usual interval (a dropped frame) only
    // advances by twice that interval: the glide resumes from where it was shown
    // instead of leaping to where it would have been, which is the jump people see.
    const raw =
      this._smoothLastTs === null ? 1 / 60 : Math.min((ts - this._smoothLastTs) / 1000, SMOOTH_SCROLL_MAX_ELAPSED);
    this._smoothLastTs = ts;
    const usual = this._smoothFrameAvg ?? raw;
    let elapsed = Math.min(raw, Math.max(usual * 2, 1 / 60));
    this._smoothFrameAvg = usual * 0.9 + raw * 0.1;
    let stepped = spring.Step(Math.min(elapsed, SMOOTH_SCROLL_MAX_STEP));
    elapsed -= SMOOTH_SCROLL_MAX_STEP;
    while (elapsed > 0) {
      stepped = spring.Step(Math.min(elapsed, SMOOTH_SCROLL_MAX_STEP));
      elapsed -= SMOOTH_SCROLL_MAX_STEP;
    }
    const position = Math.max(0, stepped);

    const moved =
      this._smoothLastPosition === null ? Infinity : Math.abs(position - this._smoothLastPosition);
    this._smoothLastPosition = position;
    const settled =
      Math.abs(position - goal) < SMOOTH_SCROLL_SETTLE_PX &&
      moved < SMOOTH_SCROLL_SETTLE_SPEED &&
      this._mountedIndices.has(target.index);

    // scrollTop only moves in whole device pixels (see scrollStep), which near the
    // slow end of the ease shows up as the list ticking one step at a time. Scroll
    // by the whole steps and carry the remainder as a compositor-only translate.
    const whole = settled ? goal : Math.min(Math.round(position / step) * step, maxWhole);
    const fraction = settled ? 0 : Math.max(0, Math.min(position, maxScroll)) - whole;

    if (this._smoothLastWhole === null || Math.abs(whole - this._smoothLastWhole) > step / 2) {
      // `behavior: "instant"` overrides the element's CSS scroll-behavior: smooth,
      // which would otherwise ease every per-frame write and fight the spring.
      scrollEl.scrollTo({ top: whole, behavior: "instant" });
      this._smoothLastWhole = whole;
    }
    this._setSmoothFraction(fraction);

    // Same Wayland guard as the retry chain: a programmatic write may not
    // dispatch 'scroll', so push the offset into TanStack ourselves. This also
    // mounts rows coming into view in the same frame they are scrolled to.
    if (v.scrollOffset == null || Math.abs(v.scrollOffset - whole) >= 1) {
      v.scrollOffset = whole;
      this._onVirtualizerChange(v);
    }

    if (settled) {
      // One read, only when landing. If layout changed underneath the glide the
      // browser may have clamped us somewhere else; the virtualizer's window
      // must follow where the list really is, not where we asked it to be.
      const actual = scrollEl.scrollTop;
      if (Math.abs(actual - v.scrollOffset!) >= 1) {
        v.scrollOffset = actual;
        this._onVirtualizerChange(v);
      }
      if (Math.abs(actual - goal) > 1 && this._smoothReconciles < SMOOTH_SCROLL_MAX_RECONCILES) {
        // Re-aim from where the list actually is, with fresh geometry.
        virtualizerLogger.debug("Smooth scroll landed off target, re-aiming", { actual, goal });
        this._smoothReconciles += 1;
        this._smoothGeometry = null;
        this._smoothLastWhole = actual;
        this._smoothLastPosition = null;
        spring.SetGoal(actual, true);
        this._smoothRAF = requestCappedFrame(this._smoothStep);
        return;
      }
      this._stopSmoothScroll();
      // Stand-in for the scrollend remeasures skipped during the glide.
      this._remeasureVisible();
    } else {
      this._smoothRAF = requestCappedFrame(this._smoothStep);
    }
  };

  // Smooth Scrolling was switched off mid-glide: stop the spring and let the
  // standard path finish the move, so the line still ends up in place.
  private _handOffSmoothScroll(): void {
    const target = this._smoothTarget;
    const active = this._smoothRAF !== null;
    this._stopSmoothScroll();
    if (active && target) this.scrollToIndex(target.index, target.align, false, target.padding);
    // Strip the row-glide transitions from mounted rows right away.
    if (this._virtualizer) this._onVirtualizerChange(this._virtualizer);
  }

  private _setSmoothFraction(fraction: number): void {
    // Below a hundredth of a pixel nothing visibly changes; skip the style write.
    if (Math.abs(fraction - this._smoothFraction) < 0.01 && fraction !== 0) return;
    this._smoothFraction = fraction;
    if (this._virtualContainer) {
      this._virtualContainer.style.translate = fraction === 0 ? "" : `0 ${-fraction}px`;
    }
    this._setTrailingOffset(-fraction);
  }

  private _stopSmoothScroll(): void {
    const wasActive = this._smoothRAF !== null || this._smoothTarget !== null;
    if (this._smoothRAF !== null) {
      cancelCappedFrame(this._smoothRAF);
      this._smoothRAF = null;
    }
    this._smoothTarget = null;
    this._smoothGeometry = null;
    this._smoothLastTs = null;
    this._smoothLastPosition = null;
    this._smoothLastWhole = null;
    this._setSmoothFraction(0);
    if (wasActive) this._setConverging(false);
    this._releaseGlideHold();
  }

  // The user is about to move the list themselves: let go of any glide, and hold
  // off row glides so measurement corrections while they scroll stay instant.
  private _onUserScrollIntent = (): void => {
    this._blockLayoutGlide(LAYOUT_GLIDE_BLOCK_MS);
    this._lastRetryTarget = null;
    if (this._smoothRAF !== null) {
      virtualizerLogger.debug("Smooth scroll cancelled: user scroll");
      this._stopSmoothScroll();
    }
    // Rows still waiting their turn in a ripple head home now, so the list
    // settles under the user's hand instead of trailing behind it.
    for (const row of this._cascadeRows.values()) {
      if (!row.at) continue;
      row.goal = row.next;
      row.at = 0;
    }
  };

  private _blockLayoutGlide(ms: number): void {
    this._layoutGlideBlockedUntil = Math.max(this._layoutGlideBlockedUntil, performance.now() + ms);
  }

  private _layoutGlideEnabled(): boolean {
    return (
      ($smoothScrolling.get() || this._refreshed) &&
      performance.now() >= this._layoutGlideBlockedUntil
    );
  }

  // Converging (a programmatic scroll in flight): we are the only scrollTop
  // writer. Without this, TanStack's automatic scrollTop correction (for
  // above-viewport items measured larger than estimate) writes scrollTop out from
  // under the manual scroll and trips the retry's external-scroll guard — the
  // root cause of the active line never centering on a mid-song open.
  private _setConverging(active: boolean): void {
    this._converging = active;
  }

  /**
   * Installed as TanStack's shouldAdjustScrollPositionOnItemSizeChange. Outside
   * the two cases below it reproduces TanStack's default heuristic.
   */
  private _shouldAdjustScroll = (
    item: { start: number },
    _delta: number,
    instance: Virtualizer<HTMLElement, HTMLElement>
  ): boolean => {
    if (this._converging) return false;
    // A thumb drag sets scrollTop from the pointer on every move, so a correction
    // here only bounces the list for one frame before the next move undoes it.
    if (this._scrollbarRoot?.classList.contains("simplebar-dragging")) return false;
    // Rows are gliding to absorb the size change; shifting scrollTop by the same
    // amount instantly would move the list twice.
    if (this._layoutGlideEnabled()) return false;
    // TanStack's own default, verbatim (v3.16 resizeItem); both members are private there.
    const internals = instance as unknown as {
      scrollAdjustments: number;
      getScrollOffset: () => number;
    };
    return (
      item.start < internals.getScrollOffset() + internals.scrollAdjustments &&
      instance.scrollDirection !== "backward"
    );
  };

  private _computeFinalScrollTop(
    itemStart: number,
    itemSize: number,
    viewportHeight: number,
    containerOffset: number,
    align: "start" | "center" | "end" | "auto",
    padding: number
  ): number {
    let target: number;
    if (align === "center" || align === "auto") {
      target = containerOffset + itemStart - (viewportHeight - itemSize) / 2;
    } else if (align === "start") {
      target = containerOffset + itemStart;
    } else {
      target = containerOffset + itemStart - viewportHeight + itemSize;
    }
    return Math.max(0, target + padding);
  }

  private _scrollToIndexWithRetry(
    index: number,
    align: "start" | "center" | "end" | "auto",
    instant: boolean,
    padding: number,
    retry: number,
    expectedScrollTop: number | null
  ): void {
    const v = this._virtualizer;
    if (!v || !this._virtualContainer) {
      this._setConverging(false);
      return;
    }
    if (retry === 0) this._lastRetryTarget = { index, align, instant, padding };

    const scrollEl = v.scrollElement;
    if (!scrollEl) {
      this._setConverging(false);
      return;
    }

    const viewportHeight = scrollEl.clientHeight;
    if (!viewportHeight) {
      this._setConverging(false);
      return;
    }

    // If something else moved the scroll between our last set and this retry
    // (user scroll, another scrollTo call, etc), abandon the retry chain so we
    // don't fight whoever took over.
    if (
      expectedScrollTop !== null &&
      Math.abs(scrollEl.scrollTop - expectedScrollTop) > 2
    ) {
      virtualizerLogger.debug("Aborting scrollToIndex retry: external scroll detected", {
        expectedScrollTop,
        actualScrollTop: scrollEl.scrollTop,
        retry,
      });
      this._setConverging(false);
      return;
    }

    const rect = this._getItemRect(v, index);
    const itemStart = rect.start - this._collapsingAbove(v, index);
    const itemSize = rect.size;

    const containerRect = this._virtualContainer.getBoundingClientRect();
    const scrollElRect = scrollEl.getBoundingClientRect();
    const containerOffset = containerRect.top - scrollElRect.top + scrollEl.scrollTop;

    const finalScrollTop = this._computeFinalScrollTop(
      itemStart,
      itemSize,
      viewportHeight,
      containerOffset,
      align,
      padding
    );

    if (retry === 0) {
      virtualizerLogger.debug("scrollToIndex computed target", {
        index,
        align,
        instant,
        padding,
      });
      virtualizerLogger.debug("scrollToIndex computed offsets", {
        itemStart,
        itemSize,
        viewportHeight,
        containerOffset,
        finalScrollTop,
      });
    } else {
      virtualizerLogger.debug("scrollToIndex retry pass", {
        index,
        retry,
        itemStart,
        itemSize,
        finalScrollTop,
      });
    }

    // An instant jump re-lays out the whole window; rows gliding around after it
    // would look like the list settling. Extended on every retry. A ripple
    // scroll moves instantly too, but its rows are meant to be seen moving.
    if (instant && !this._cascadeChain) this._blockLayoutGlide(LAYOUT_GLIDE_BLOCK_MS);
    const scrollTopBefore = this._cascadeChain ? scrollEl.scrollTop : 0;

    if (instant) {
      scrollEl.classList.add("InstantScroll");
    } else {
      scrollEl.classList.remove("InstantScroll");
    }

    // The scroll element has `scroll-behavior: smooth !important` (Simplebar.css),
    // relaxed via `.InstantScroll` — but that class can race with style recalc. Under
    // smooth behavior, re-issuing the scroll each retry restarts the eased animation so
    // an in-range target crawls and never mounts. Passing explicit `behavior` to
    // scrollTo() overrides the CSS outright, guaranteeing an instant jump.
    scrollEl.scrollTo({
      top: finalScrollTop,
      behavior: instant ? "instant" : "auto",
    });
    // Read back: the browser clamps scrollTop to (scrollHeight - clientHeight),
    // and the spacer-padded scrollHeight may not be tall enough on retry 0 when
    // most items are still estimated.
    const observedScrollTop = scrollEl.scrollTop;
    // A smooth scroll hasn't moved yet on this read, so clamping is judged
    // against the scroll range instead of the read-back position.
    const maxScrollTop = scrollEl.scrollHeight - viewportHeight;
    const tanstackOffsetBefore = v.scrollOffset;

    // Diagnostics: distinguishes a smooth-scroll stall, an unscrollable container,
    // and the Wayland failure — a DOM/virtualizer offset desync (observedScrollTop
    // moved but tanstackOffset did not, because the 'scroll' event never dispatched).
    //
    // Gated on isEnabled rather than left to Logger.debug's own early return:
    // arguments are evaluated at the call site, so building this payload cost a
    // forced style recalc (getComputedStyle) plus five layout reads on EVERY
    // retry — up to 31 per scroll — even with developer mode off. Sitting between
    // the scrollTo() above and the measureElement() reads below, that turned the
    // convergence chain into sustained layout thrash while the lyrics render.
    if (virtualizerLogger.isEnabled) {
      const scrollHeight = scrollEl.scrollHeight;
      const clientHeight = scrollEl.clientHeight;
      virtualizerLogger.debug("scrollToIndex applied", {
        retry,
        finalScrollTop: Math.round(finalScrollTop),
        observedScrollTop: Math.round(observedScrollTop),
        tanstackOffset: tanstackOffsetBefore == null ? null : Math.round(tanstackOffsetBefore),
        scrollHeight,
        clientHeight,
        maxScroll: scrollHeight - clientHeight,
        virtualHeight: this._virtualContainer.offsetHeight,
        scrollBehavior: getComputedStyle(scrollEl).scrollBehavior,
        hasInstantScroll: scrollEl.classList.contains("InstantScroll"),
        targetMounted: this._mountedIndices.has(index),
      });
    }

    // Wayland quirk: a programmatic scrollTop write may not dispatch a 'scroll' event,
    // so observeElementOffset never updates scrollOffset and the virtual window stays
    // pinned to the old position while the DOM scrolled (blank lyrics until a manual
    // scroll). Push the observed offset into the virtualizer and re-render so the right
    // window mounts regardless. No-op where the event fires (offsets already match).
    if (v.scrollOffset == null || Math.abs(v.scrollOffset - observedScrollTop) >= 1) {
      v.scrollOffset = observedScrollTop;
      this._onVirtualizerChange(v);
    }

    // After the mount above, so rows scrolled into view join the ripple too.
    if (this._cascadeChain) {
      this._cascadeTo(
        scrollTopBefore,
        observedScrollTop,
        retry === 0 ? index : -1,
        containerOffset,
        viewportHeight
      );
    }

    if (retry < LyricsVirtualizer._MAX_SCROLL_RETRIES) {
      this._scrollVerifyRAF = requestAnimationFrame(() => {
        this._scrollVerifyRAF = null;
        if (this._virtualizer !== v) {
          this._setConverging(false);
          return;
        }

        const fresh = v.measurementsCache[index] as
          | { start: number; size: number }
          | undefined;
        // Did the cache move item N's position/size since we read it? Newly-mounted
        // items above N can shift its `start` even if N itself wasn't measured.
        const drift = fresh
          ? Math.abs(fresh.start - this._collapsingAbove(v, index) - itemStart) +
            Math.abs(fresh.size - itemSize)
          : 0;
        const wasClamped = finalScrollTop - maxScrollTop > 1;
        // By now the issued scroll has fired and onChange remounted the window, so
        // this reflects the post-scroll state.
        const targetMounted = this._mountedIndices.has(index);

        // Keep walking until the target is mounted AND its position has stopped moving
        // AND the browser is no longer clamping scrollTop, so a far (mid-song) target
        // is reached. The external-scroll guard and _MAX_SCROLL_RETRIES bound it.
        if (!targetMounted || drift >= 1 || wasClamped) {
          this._scrollToIndexWithRetry(
            index,
            align,
            instant,
            padding,
            retry + 1,
            observedScrollTop
          );
        } else {
          this._setConverging(false);
        }
      });
    } else {
      this._setConverging(false);
    }
  }

  destroy(): void {
    virtualizerLogger.info("Destroying lyrics virtualizer", {
      mountedCount: this._mountedIndices.size,
      wrappers: this._wrappers.length,
      hasVirtualizer: Boolean(this._virtualizer),
    });
    if (this._scrollVerifyRAF !== null) {
      cancelAnimationFrame(this._scrollVerifyRAF);
      this._scrollVerifyRAF = null;
    }
    // Torn down anyway; no point re-rendering the window on the way out.
    this._glideHold = null;
    this._stopSmoothScroll();
    this._stopCascade();
    this._trailingOffset = 0;
    this._trailingCache = null;
    this._trailingObserver = null;
    this._lastTotalSize = 0;
    this._gapFontPx = 0;
    this._smoothSpring = null;
    this._layoutGlideBlockedUntil = 0;
    // Reset convergence so the next virtualizer instance doesn't inherit a stale `true`
    // (the hook would then refuse every adjustment for the new instance).
    this._converging = false;
    this._scrollbarRoot = null;
    this._maid?.Destroy();
    this._maid = null;
    if (this._scrollEl) this._scrollEl.style.overflowAnchor = "";
    this._scrollEl = null;
    this._resizeObserver = null;
    this._widthObserver = null;
    this._containerWidth = 0;
    this._containerHeight = 0;
    this._classObserver = null;
    this._spacer = null;

    try {
      (this._virtualizer as any)._cleanup?.();
    } catch {
      // Ignore — method is private / may not exist in all versions.
    }

    for (const idx of this._mountedIndices) {
      this._wrappers[idx]?.parentElement?.removeChild(this._wrappers[idx]!);
    }
    this._virtualizer = null;
    this._allElements = [];
    this._indexByElement.clear();
    this._wrappers = [];
    this._mountedIndices.clear();
    this._lastVirtualWindowSignature = "";
    this._virtualContainer = null;
    if (this._resizeDebounceTimer !== null) {
      clearTimeout(this._resizeDebounceTimer);
      this._resizeDebounceTimer = null;
    }
    // _onNewElementMounted is kept: it is registered once at module load
    // (LyricsAnimator), and init() calls destroy() on every lyrics apply.
  }
}

// Singleton instance — keeps the same call sites working without threading
// an instance through every caller.
export const lyricsVirtualizer = new LyricsVirtualizer();

export function initLyricsVirtualizer(
  scrollEl: HTMLElement,
  virtualContainer: HTMLElement,
  lineElements: HTMLElement[]
): void {
  lyricsVirtualizer.init(scrollEl, virtualContainer, lineElements);
}

export function getLyricsVirtualizer(): Virtualizer<HTMLElement, HTMLElement> | null {
  return lyricsVirtualizer.getVirtualizer();
}

export function scrollLyricsToIndex(
  index: number,
  align: "start" | "center" | "end" | "auto" = "center",
  instant: boolean = false,
  padding: number = 0
): void {
  lyricsVirtualizer.scrollToIndex(index, align, instant, padding);
}

// Refreshed Simple Lyrics is on for the current list: rows glide when one
// above them changes height, and line changes ripple instead of scrolling.
export function lyricsUseRefreshedLayout(): boolean {
  return lyricsVirtualizer.refreshedLayout;
}

export function destroyLyricsVirtualizer(): void {
  lyricsVirtualizer.destroy();
}

export function setOnNewElementMounted(cb: (() => void) | null): void {
  lyricsVirtualizer.setOnNewElementMounted(cb);
}

// Background lines whose GroupActive the animator flipped while unmounted.
export function syncDetachedBackgroundLines(lines: HTMLElement[]): void {
  lyricsVirtualizer.detachedRowsChanged(lines);
}

export function isLyricsListMoving(): boolean {
  return lyricsVirtualizer.moving;
}

export function triggerRemeasureLV(): void {
  lyricsVirtualizer.remeasure();
}