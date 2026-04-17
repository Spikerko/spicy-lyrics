import {
  Virtualizer,
  elementScroll,
  observeElementRect,
  observeElementOffset,
} from "@tanstack/virtual-core";
let _virtualizer: Virtualizer<HTMLElement, HTMLElement> | null = null;
let _allElements: HTMLElement[] = [];
// One positioning wrapper per line element. The wrapper gets position:absolute +
// translateY from the virtualizer; the .line element lives inside it so that any
// CSS `scale` applied to .line acts purely around the element's own center and
// does NOT interact with the virtualizer's translateY.  Without the wrapper,
// `scale` and `transform: translateY(N)` compose through transform-origin, causing
// elements to shift downward by an amount proportional to N (i.e. by 0.05×N for
// scale 1.05), which grows the further down the list the element sits.
let _wrappers: (HTMLElement | null)[] = [];
let _mountedIndices = new Set<number>();
let _virtualContainer: HTMLElement | null = null;
let _scrollEl: HTMLElement | null = null;

// Optional callback invoked whenever a new element enters the viewport (is mounted
// for the first time in the current render pass). Used by the animator to
// invalidate its active-line blur cache so that newly visible elements immediately
// receive the correct --BlurAmount on the next frame rather than showing a stale
// value from a previous applyBlur run that skipped them while disconnected.
let _onNewElementMounted: (() => void) | null = null;

export function setOnNewElementMounted(cb: (() => void) | null): void {
  _onNewElementMounted = cb;
}

// Shared ResizeObserver — fires after every layout recalc for observed elements.
// This is the single source of truth for element heights, replacing the brittle
// class-observer + RAF approach. ResizeObserver guarantees the callback runs
// after layout so offsetHeight is always accurate when we read it.
// We observe the WRAPPER (not the .line directly) because the wrapper carries
// data-index and its offsetHeight equals the .line's layout height.
let _resizeObserver: ResizeObserver | null = null;

// Timer for the scroll-settle remeasure pass (fallback for browsers without scrollend).
let _scrollEndTimer: ReturnType<typeof setTimeout> | null = null;

// RAF handle used to coalesce multiple ResizeObserver entries into one _willUpdate()
// call per frame. Prevents redundant full render passes when several mounted wrappers
// change height simultaneously (e.g. on song load or musical-line activation).
let _resizeRAF: ReturnType<typeof requestAnimationFrame> | null = null;

// Last observed clientWidth of the scroll element. Used by _widthObserver to
// detect container resize so we can update gap (= 1cqw in px) and remeasure.
let _containerWidth = 0;

// ResizeObserver dedicated to tracking clientWidth changes on the scroll element.
// Kept separate from _resizeObserver (which watches item wrappers) so the two
// concerns stay independent.
let _widthObserver: ResizeObserver | null = null;

const ESTIMATE: Record<string, number> = {
  // Inactive musical-lines have line-height: 0 → measured height ~0.
  "musical-line": 0,
  // bg-lines are smaller than regular lines (no lead vocal padding).
  "bg-line": 50,
  // Single-line actual height is ~66px.
  default: 66,
};

// Gap scale factors relative to 1cqw (containerWidth / 100).
// Gap is baked into each wrapper's padding-bottom so items can have
// different trailing gaps without any virtualizer-level workaround.
const GAP_NORMAL = 1;      // 1cqw — line↔line and bg-line↔next-line
const GAP_LINE_TO_BG = 0.2; // 0.2cqw — line↔bg-line (bg sits closer to its parent)

function _isNextBgLine(index: number): boolean {
  const next = _allElements[index + 1];
  return next != null && next.classList.contains("bg-line");
}

// Trailing gap (in px) to apply as padding-bottom on the wrapper at `index`.
function _itemGap(index: number): number {
  if (index >= _allElements.length - 1) return 0;
  return (_isNextBgLine(index) ? GAP_LINE_TO_BG : GAP_NORMAL) * (_containerWidth / 100);
}

function estimateSize(index: number): number {
  const el = _allElements[index];
  let h: number;
  if (!el) h = ESTIMATE.default;
  else if (el.classList.contains("musical-line")) h = ESTIMATE["musical-line"];
  else if (el.classList.contains("bg-line")) h = ESTIMATE["bg-line"];
  else h = ESTIMATE.default;
  // Include the trailing gap so the virtualizer's position estimates are accurate
  // before ResizeObserver delivers the first real measurement.
  return h + _itemGap(index);
}

// offsetHeight is the most reliable measurement: it reflects the true rendered
// layout height and is unaffected by translateY, scrollTop, or paint clipping.
function _measureHeight(el: HTMLElement): number {
  return el.offsetHeight;
}

// Re-measure all currently mounted elements and trigger a layout pass.
// Called after scroll settles to fix any drift from fast scrolling.
function _remeasureVisible(): void {
  const v = _virtualizer;
  if (!v) return;
  let changed = false;
  for (const idx of _mountedIndices) {
    const wrapper = _wrappers[idx];
    if (wrapper?.isConnected) {
      v.measureElement(wrapper);
      changed = true;
    }
  }
  if (changed) v._willUpdate();
}

function _onScrollEnd(): void {
  // Cancel the debounced timer if the browser emitted a proper scrollend event.
  if (_scrollEndTimer !== null) {
    clearTimeout(_scrollEndTimer);
    _scrollEndTimer = null;
  }
  _remeasureVisible();
}

function _onScrollDebounced(): void {
  if (_scrollEndTimer !== null) clearTimeout(_scrollEndTimer);
  _scrollEndTimer = setTimeout(() => {
    _scrollEndTimer = null;
    _remeasureVisible();
  }, 200);
}

export function initLyricsVirtualizer(
  scrollEl: HTMLElement,
  virtualContainer: HTMLElement,
  lineElements: HTMLElement[]
): void {
  destroyLyricsVirtualizer();
  _allElements = lineElements;
  _wrappers = new Array(lineElements.length).fill(null);
  _virtualContainer = virtualContainer;
  _scrollEl = scrollEl;

  // Derive 1cqw from the scroll element's width (same as the container).
  // If the element has no width yet (layout pending), gap starts at 0 and is
  // corrected by the deferred RAF below or by _widthObserver on first resize.
  const containerWidth = scrollEl.clientWidth || virtualContainer.clientWidth || 0;
  _containerWidth = containerWidth;

  // One shared ResizeObserver for all mounted wrappers.  When the .line element
  // inside a wrapper changes height (Active ↔ inactive toggle, text reflow, etc.)
  // the wrapper's offsetHeight changes too, the observer fires, and we tell the
  // virtualizer to update that item's cached size.
  //
  // We defer the _willUpdate() call to a requestAnimationFrame so that if several
  // wrappers change height in the same layout cycle (e.g. on song load or when a
  // musical-line becomes Active) they are all measured first and only ONE render
  // pass is triggered instead of one per entry.
  _resizeObserver = new ResizeObserver((entries) => {
    const v = _virtualizer;
    if (!v) return;
    let changed = false;
    for (const entry of entries) {
      const el = entry.target as HTMLElement;
      // Guard: element might have been detached between observation and callback.
      if (!el.isConnected) continue;
      if (el.getAttribute("data-index") === null) continue;
      v.measureElement(el);
      changed = true;
    }
    if (changed && _resizeRAF === null) {
      _resizeRAF = requestAnimationFrame(() => {
        _resizeRAF = null;
        // Re-check: the virtualizer may have been replaced since we scheduled this.
        if (_virtualizer === v) v._willUpdate();
      });
    }
  });

  // gap: 0 — trailing gaps are baked into each wrapper's padding-bottom so
  // that the line→bg-line gap can be smaller than all other adjacent gaps.
  _virtualizer = new Virtualizer<HTMLElement, HTMLElement>({
    count: lineElements.length,
    getScrollElement: () => scrollEl,
    estimateSize,
    overscan: 5,
    gap: 0,
    scrollToFn: elementScroll,
    observeElementRect,
    observeElementOffset,
    onChange: _onVirtualizerChange,
    measureElement: _measureHeight,
  });

  // Reset scroll position so the new song always starts at the top.
  scrollEl.scrollTop = 0;

  _virtualizer._willUpdate();

  // Deferred pass: if the scroll element had zero clientWidth at init time
  // (Simplebar not yet mounted, CSS pending) the gap will have been set to 0.
  // Re-check one frame later — layout is always settled by then.
  requestAnimationFrame(() => {
    const v = _virtualizer;
    if (!v || !_scrollEl) return;
    const settled = _scrollEl.clientWidth;
    if (settled > 0 && Math.abs(settled - _containerWidth) >= 1) {
      _containerWidth = settled;
      _remeasureVisible();
      v._willUpdate();
    } else {
      // Width was already correct; still trigger a pass in case the scroll
      // element now has a valid clientHeight it lacked during the sync call.
      v._willUpdate();
    }
  });

  // After scrolling settles, remeasure all visible items to correct any
  // accumulated offset errors from fast user scrolling.
  scrollEl.addEventListener("scrollend", _onScrollEnd, { passive: true });
  // Debounced fallback for browsers that don't support scrollend.
  scrollEl.addEventListener("scroll", _onScrollDebounced, { passive: true });

  // Dedicated width observer: fires whenever the scroll container is resized
  // horizontally (e.g. NowBar open/close, sidebar toggle, window resize).
  // Keeps gap (= 1cqw in px) in sync and remeasures mounted wrappers so that
  // text-reflow height changes are captured in the same synchronous pass,
  // preventing lyric lines from overlapping at the new container width.
  _widthObserver = new ResizeObserver(() => {
    const v = _virtualizer;
    const el = _scrollEl;
    if (!v || !el) return;
    const newWidth = el.clientWidth;
    if (Math.abs(newWidth - _containerWidth) < 1) return; // no meaningful change
    _containerWidth = newWidth;
    // Per-item trailing gap depends on 1cqw; width changes require remeasuring
    // visible wrappers to refresh each wrapper's padding-bottom contribution.
    // Re-measure all currently mounted wrappers.  Text has already reflowed in
    // this layout pass (ResizeObserver fires post-layout), so offsetHeight is
    // the accurate post-reflow value.
    _remeasureVisible();
    v._willUpdate();
  });
  _widthObserver.observe(scrollEl);
}

// Get or create the positioning wrapper for the given index.
// The wrapper is a plain div that holds the .line element and receives the
// virtualizer's position/transform styles so that .line itself stays free of
// any positioning transform.
function _getOrCreateWrapper(index: number): HTMLElement {
  let wrapper = _wrappers[index];
  if (!wrapper) {
    wrapper = document.createElement("div");
    wrapper.setAttribute("data-index", String(index));
    // Set the static layout/positioning styles once at creation so that
    // _onVirtualizerChange only needs to update the dynamic translateY.
    // Writing three extra style properties on every scroll event (at 60 fps)
    // for every mounted wrapper creates unnecessary style-recalc work.
    wrapper.style.position = "absolute";
    wrapper.style.left = "0";
    wrapper.style.width = "100%";
    wrapper.style.paddingBottom = `${_itemGap(index)}px`;
    _wrappers[index] = wrapper;

    const el = _allElements[index];
    if (el) {
      // Clear any JS-set position styles from a previous (pre-wrapper) mount so
      // that inside the wrapper the element flows as a normal block child.
      el.style.position = "";
      el.style.transform = "";
      el.style.left = "";
      // Keep width:100% so the element fills the wrapper.
      el.style.width = "100%";
      wrapper.appendChild(el);
    }
  }
  return wrapper;
}

function _onVirtualizerChange(v: Virtualizer<HTMLElement, HTMLElement>): void {
  // Guard against stale callbacks from a virtualizer that has been replaced.
  // TanStack's internal observeElementRect/observeElementOffset observers outlive
  // the module-level state reset, so without this check the old virtualizer
  // would keep mutating _allElements / _mountedIndices for the new song.
  if (v !== _virtualizer) return;
  if (!_virtualContainer) return;

  // Size the virtual container so absolutely-positioned children anchor correctly.
  const totalSize = v.getTotalSize();
  _virtualContainer.style.height = `${totalSize}px`;

  const items = v.getVirtualItems();
  const nextVisible = new Set(items.map((i) => i.index));

  // Collect indices to unmount — mutating the Set while iterating it is unsafe.
  const toUnmount: number[] = [];
  for (const idx of _mountedIndices) {
    if (!nextVisible.has(idx)) toUnmount.push(idx);
  }
  for (const idx of toUnmount) {
    const wrapper = _wrappers[idx];
    if (wrapper) {
      // If this wrapper holds a musical-line that is still Active, the animator
      // will skip it once disconnected (isConnected guard) and never remove the
      // Active class. The virtualizer cache then retains the full Active height
      // permanently, inflating every subsequent item's start position.
      // Fix: collapse the element and re-measure it while the wrapper is still
      // attached to the DOM so the cache records the correct 0+gap size.
      const lineEl = _allElements[idx];
      if (
        lineEl?.classList.contains("musical-line") &&
        lineEl.classList.contains("Active")
      ) {
        lineEl.classList.remove("Active");
        // offsetHeight read forces a synchronous layout flush; the wrapper is
        // still in the DOM so it reflects the newly-collapsed height (0 + gap).
        v.measureElement(wrapper);
        // Schedule a re-render so the corrected measurement is applied to the
        // layout on the next frame.
        if (_resizeRAF === null) {
          _resizeRAF = requestAnimationFrame(() => {
            _resizeRAF = null;
            if (_virtualizer === v) v._willUpdate();
          });
        }
      }
      // Stop observing before removing so the ResizeObserver callback doesn't
      // fire for a detached element.
      _resizeObserver?.unobserve(wrapper);
      wrapper.parentElement?.removeChild(wrapper);
    }
    _mountedIndices.delete(idx);
  }

  // Mount / reposition visible items.
  for (const item of items) {
    const wrapper = _getOrCreateWrapper(item.index);
    // Keep per-item trailing gap in sync with container width and adjacency
    // rules (line->bg-line is tighter than other transitions).
    wrapper.style.paddingBottom = `${_itemGap(item.index)}px`;

    // Only update the dynamic per-frame value (vertical position).
    // position / left / width are set once at wrapper creation and never change.
    wrapper.style.transform = `translateY(${item.start}px)`;

    if (!_mountedIndices.has(item.index)) {
      _virtualContainer.appendChild(wrapper);
      _mountedIndices.add(item.index);

      // Begin observing. ResizeObserver fires after the next layout pass with
      // the true offsetHeight, correcting the estimateSize guess automatically.
      // No RAF needed — ResizeObserver guarantees post-layout delivery.
      _resizeObserver?.observe(wrapper);

      // Notify the animator that a new element has entered the viewport so it
      // can invalidate its blur cache and re-apply --BlurAmount on the next frame.
      _onNewElementMounted?.();
    }
  }
}

export function getLyricsVirtualizer(): Virtualizer<HTMLElement, HTMLElement> | null {
  return _virtualizer;
}

/**
 * Scroll the virtualizer to center (or align) a specific line index.
 *
 * We bypass TanStack's built-in scrollToIndex() because its offset does not
 * account for SpicyLyricsScrollContainer's margin-top. Instead we:
 *  1. Read item.start / item.size from measurementsCache (public field,
 *     populated for ALL items after the first getVirtualItems() call).
 *  2. Measure the absolute containerOffset (virtual container top → scroll
 *     element top at scrollPosition 0).
 *  3. Compute the target scrollTop for the requested alignment.
 *  4. Set scrollTop directly (always instant — smooth per-line scrolling
 *     would fight with subsequent auto-scroll ticks).
 */
export function scrollLyricsToIndex(
  index: number,
  align: "start" | "center" | "end" | "auto" = "center",
  instant: boolean = false,
  padding: number = 0
): void {
  const v = _virtualizer;
  if (!v || !_virtualContainer) return;

  const scrollEl = v.scrollElement;
  if (!scrollEl) return;

  const viewportHeight = scrollEl.clientHeight;
  // If the scroll element has no height yet the DOM hasn't settled — skip.
  if (!viewportHeight) return;

  // measurementsCache is a public field populated for ALL items (0..count-1)
  // after the first getVirtualItems() call in _onVirtualizerChange.
  // If the cache entry is missing (edge case: called before first render),
  // fall back to a linear estimate so we at least scroll approximately right.
  let itemStart: number;
  let itemSize: number;

  const cached = v.measurementsCache[index] as
    | { start: number; end: number; size: number }
    | undefined;

  if (cached) {
    itemStart = cached.start;
    itemSize = cached.size;
  } else {
    // Fallback: derive estimated position from total size and item count.
    const count = (v.options as any).count as number;
    const gap = (v.options as any).gap ?? 0;
    const totalSize = v.getTotalSize();
    const avgItemSize = count > 1 ? (totalSize - gap * (count - 1)) / count : totalSize;
    itemStart = index * (avgItemSize + gap);
    itemSize = estimateSize(index);
  }

  // Distance from scroll-position 0 to VirtualLyricsContainer's top edge.
  // Measured fresh from the DOM to capture SpicyLyricsScrollContainer's
  // margin-top (cqh-based, varies with viewport height).
  const containerRect = _virtualContainer.getBoundingClientRect();
  const scrollElRect = scrollEl.getBoundingClientRect();
  const containerOffset = containerRect.top - scrollElRect.top + scrollEl.scrollTop;

  let targetScrollTop: number;
  if (align === "center" || align === "auto") {
    targetScrollTop = containerOffset + itemStart - (viewportHeight - itemSize) / 2;
  } else if (align === "start") {
    targetScrollTop = containerOffset + itemStart;
  } else {
    // end
    targetScrollTop = containerOffset + itemStart - viewportHeight + itemSize;
  }

  // Guard: only inflate the virtual container when the *full* scroll area
  // (getTotalSize + CSS margins + credits) is shorter than the target position.
  // The old check compared against getTotalSize() alone, which is always less
  // than (targetScrollTop + viewportHeight) for center-aligned last-line
  // scrolls — causing permanent inflation and pushing Credits off-screen.
  // Comparing against scrollEl.scrollHeight is correct because it includes the
  // 45cqh margin-bottom on SpicyLyricsScrollContainer, which typically provides
  // more than enough extra scroll room.
  const finalScrollTop = Math.max(0, targetScrollTop + padding);
  const neededScrollHeight = finalScrollTop + viewportHeight;
  if (scrollEl.scrollHeight < neededScrollHeight) {
    const currentHeight = parseFloat(_virtualContainer.style.height) || 0;
    const deficit = neededScrollHeight - scrollEl.scrollHeight;
    _virtualContainer.style.height = `${currentHeight + deficit}px`;
    // Reset on the next frame after scrollTop has been accepted by the browser.
    // The inflation was only needed to prevent the assignment from being clamped.
    requestAnimationFrame(() => {
      if (_virtualContainer && _virtualizer) {
        _virtualContainer.style.height = `${_virtualizer.getTotalSize()}px`;
      }
    });
  }

  if (instant) {
    scrollEl.classList.add("InstantScroll");
  } else {
    scrollEl.classList.remove("InstantScroll");
  }

  scrollEl.scrollTop = finalScrollTop;
}

export function destroyLyricsVirtualizer(): void {
  if (_scrollEndTimer !== null) {
    clearTimeout(_scrollEndTimer);
    _scrollEndTimer = null;
  }

  if (_resizeRAF !== null) {
    cancelAnimationFrame(_resizeRAF);
    _resizeRAF = null;
  }

  if (_scrollEl) {
    _scrollEl.removeEventListener("scrollend", _onScrollEnd);
    _scrollEl.removeEventListener("scroll", _onScrollDebounced);
    _scrollEl = null;
  }

  // Disconnect stops all observations at once — no need to unobserve individually.
  _resizeObserver?.disconnect();
  _resizeObserver = null;

  _widthObserver?.disconnect();
  _widthObserver = null;
  _containerWidth = 0;

  // Call TanStack's internal cleanup to tear down its own observeElementRect /
  // observeElementOffset observers.  Without this the old Virtualizer instance
  // keeps firing _willUpdate() → _onVirtualizerChange() after the song changes.
  // The v !== _virtualizer guard in _onVirtualizerChange is the primary safety
  // net; this is a best-effort stop of the stale observers at their source.
  try {
    (_virtualizer as any)._cleanup?.();
  } catch {
    // Ignore — method is private / may not exist in all versions.
  }

  for (const idx of _mountedIndices) {
    _wrappers[idx]?.parentElement?.removeChild(_wrappers[idx]!);
  }
  _virtualizer = null;
  _allElements = [];
  _wrappers = [];
  _mountedIndices.clear();
  _virtualContainer = null;
  _onNewElementMounted = null;
}
