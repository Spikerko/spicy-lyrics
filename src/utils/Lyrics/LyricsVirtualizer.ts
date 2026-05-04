import {
  Virtualizer,
  elementScroll,
  observeElementRect,
  observeElementOffset,
} from "@tanstack/virtual-core";
import { Maid } from "../../modules/Maid.ts";
import Logger from "../logger.ts";

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

class LyricsVirtualizer {
  private _virtualizer: Virtualizer<HTMLElement, HTMLElement> | null = null;
  private _allElements: HTMLElement[] = [];
  // One positioning wrapper per line element. The wrapper gets position:absolute +
  // translateY from the virtualizer; the .line element lives inside it so that any
  // CSS `scale` applied to .line acts purely around the element's own center and
  // does NOT interact with the virtualizer's translateY.  Without the wrapper,
  // `scale` and `transform: translateY(N)` compose through transform-origin, causing
  // elements to shift downward by an amount proportional to N (i.e. by 0.05×N for
  // scale 1.05), which grows the further down the list the element sits.
  private _wrappers: (HTMLElement | null)[] = [];
  private _mountedIndices = new Set<number>();
  private _virtualContainer: HTMLElement | null = null;
  private _scrollEl: HTMLElement | null = null;

  // Optional callback invoked whenever a new element enters the viewport (is mounted
  // for the first time in the current render pass). Used by the animator to
  // invalidate its active-line blur cache so that newly visible elements immediately
  // receive the correct --BlurAmount on the next frame rather than showing a stale
  // value from a previous applyBlur run that skipped them while disconnected.
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

  // ResizeObserver dedicated to tracking clientWidth changes on the scroll element.
  private _widthObserver: ResizeObserver | null = null;

  // MutationObserver that watches class attribute changes on musical-line elements.
  private _classObserver: MutationObserver | null = null;

  // Permanent spacer appended after the virtual container so the last item can
  // always be scrolled to center without temporarily inflating container height.
  private _spacer: HTMLElement | null = null;

  private _maid: Maid | null = null;
  private _lastVirtualWindowSignature = "";

  // Re-entry guard for _onVirtualizerChange. TanStack's resizeItem calls
  // notify(false) → onChange synchronously when an item's size delta is
  // non-zero, so v.measureElement() inside the mount loop can recurse back
  // into _onVirtualizerChange. Without this guard, the outer loop's stale
  // items snapshot overwrites correct transforms set by the inner call.
  private _inOnChange = false;
  private _onChangePending = false;

  setOnNewElementMounted(cb: (() => void) | null): void {
    this._onNewElementMounted = cb;
  }

  private _isNextBgLine(index: number): boolean {
    const next = this._allElements[index + 1];
    return next != null && next.classList.contains("bg-line");
  }

  private _itemGap(index: number): number {
    if (index >= this._allElements.length - 1) return 0;
    // Inactive musical-lines collapse to zero height; suppress their trailing gap
    // too so there is no double-gap between the surrounding lines.
    const el = this._allElements[index];
    if (el?.classList.contains("musical-line") && !el.classList.contains("Active")) return 0;
    return (this._isNextBgLine(index) ? GAP_LINE_TO_BG : GAP_NORMAL) * (this._containerWidth / 100);
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
    else if (el.classList.contains("bg-line")) h = ESTIMATE["bg-line"];
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
    let changed = false;
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
      v.measureElement(wrapper);
      changed = true;
    }
    if (changed) {
      virtualizerLogger.debug("Remeasure pass updated virtualizer layout");
      v._willUpdate();
    } else {
      virtualizerLogger.debug("Remeasure pass completed with no changes");
    }
  }

  private _onScrollEnd = (): void => {
    if (this._scrollEndTimer !== null) {
      clearTimeout(this._scrollEndTimer);
      this._scrollEndTimer = null;
    }
    this._remeasureVisible();
  };

  private _onScrollDebounced = (): void => {
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
    this._wrappers = new Array(lineElements.length).fill(null);
    this._virtualContainer = virtualContainer;
    this._scrollEl = scrollEl;

    const containerWidth = scrollEl.clientWidth || virtualContainer.clientWidth || 0;
    this._containerWidth = containerWidth;
    virtualizerLogger.debug("Initial container width resolved", containerWidth);

    this._resizeObserver = this._maid!.Give(new ResizeObserver((entries) => {
      const v = this._virtualizer;
      if (!v) return;
      // When the window is minimized the scroll element collapses to 0×0.
      // Every observed wrapper fires with 0 offsetHeight, and caching those
      // zeros corrupts the measurements cache so that on restore all items
      // land at start=0 and overlap. Guard here so measurements are only
      // written when the container is actually rendered.
      if (this._scrollEl && this._scrollEl.clientWidth === 0) {
        virtualizerLogger.debug("Skipping resize measure: container width is zero");
        return;
      }
      let changed = false;
      for (const entry of entries) {
        const el = entry.target as HTMLElement;
        if (!el.isConnected) continue;
        if (el.getAttribute("data-index") === null) continue;
        v.measureElement(el);
        changed = true;
      }
      if (changed && this._resizeRAF === null) {
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
      let changed = false;
      for (const mutation of mutations) {
        const el = mutation.target as HTMLElement;
        const index = this._allElements.indexOf(el);
        if (index === -1) continue;
        const wrapper = this._wrappers[index];
        if (!wrapper?.isConnected) continue;
        const gap = this._itemGap(index);
        const prev = parseFloat(wrapper.style.paddingBottom) || 0;
        if (Math.abs(gap - prev) >= 0.5) {
          wrapper.style.paddingBottom = `${gap}px`;
          v.measureElement(wrapper);
          changed = true;
        }
      }
      if (changed && this._resizeRAF === null) {
        this._resizeRAF = requestAnimationFrame(() => {
          this._resizeRAF = null;
          if (this._virtualizer === v) {
            virtualizerLogger.debug("Class mutation scheduled virtualizer update");
            v._willUpdate();
          }
        });
      }
    }));
    // Single observer on the virtual container (subtree) rather than one per element.
    // Only mounted (visible) elements live inside virtualContainer, so this
    // naturally scopes to elements where a gap update would actually matter.
    this._classObserver.observe(virtualContainer, {
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });

    this._virtualizer = new Virtualizer<HTMLElement, HTMLElement>({
      count: lineElements.length,
      getScrollElement: () => scrollEl,
      estimateSize: this._estimateSize,
      overscan: 5,
      gap: 0,
      scrollToFn: elementScroll,
      observeElementRect,
      observeElementOffset,
      onChange: (v) => this._onVirtualizerChange(v),
      measureElement: this._measureHeight,
    });

    scrollEl.scrollTop = 0;
    virtualizerLogger.debug("Scroll position reset to top during init");
    this._virtualizer._willUpdate();

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
          v._willUpdate();
        } else {
          v._willUpdate();
        }
      })
    });

    scrollEl.addEventListener("scrollend", this._onScrollEnd, { passive: true });
    scrollEl.addEventListener("scroll", this._onScrollDebounced, { passive: true });
    this._maid!.Give(() => {
      this._scrollEl?.removeEventListener("scrollend", this._onScrollEnd);
      this._scrollEl?.removeEventListener("scroll", this._onScrollDebounced);
    });

    // Permanent bottom spacer — sized to half the viewport so that the last
    // item can always be scrolled to center alignment without any temporary
    // container-height inflation (which causes scrollbar flicker).
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
      if (this._spacer) this._spacer.style.height = `${el.clientHeight / 2}px`;
      if (Math.abs(newWidth - this._containerWidth) < 1) return;
      
      virtualizerLogger.info("Container width changed", {
        previous: this._containerWidth,
        next: newWidth,
      });
      this._containerWidth = newWidth;
    
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

    // After a minimize/restore cycle TanStack's own observers re-trigger
    // _onVirtualizerChange, but _mountedIndices is empty so _remeasureVisible
    // is a no-op. Force a full remeasure pass once the browser has finished
    // re-laying out the page so every re-mounted item gets correct heights.
    const _handleVisibilityRestore = () => {
      if (document.hidden) return;
      virtualizerLogger.debug("Visibility restored; forcing remeasure cycle");
      requestAnimationFrame(() => {
        const v = this._virtualizer;
        if (!v || !this._scrollEl) return;
        const w = this._scrollEl.clientWidth;
        if (w > 0 && Math.abs(w - this._containerWidth) >= 0.5) {
          this._containerWidth = w;
        }
        this._remeasureVisible();
        v._willUpdate();
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

    const toUnmount: number[] = [];
    for (const idx of this._mountedIndices) {
      if (!nextVisible.has(idx)) toUnmount.push(idx);
    }
    for (const idx of toUnmount) {
      const wrapper = this._wrappers[idx];
      if (wrapper) {
        // Sync the cached size to the line's CURRENT classList before removing
        // the wrapper from the DOM. The wrapper's padding-bottom was sized to
        // the gap in effect when the line was last rendered; in the meantime
        // the animator may have flipped Active/Sung on the line, but the
        // MutationObserver that normally keeps the padding in sync only fires
        // for elements still in the virtualContainer subtree — and even then
        // it's a microtask, so a class change made earlier in this same task
        // (animator → onChange in one frame) hasn't been observed yet.
        //
        // Recomputing the gap from classList here makes the cache match what
        // a remount would render, so a re-entry into the viewport doesn't
        // misalign every following item by the stale dot-line height. We
        // deliberately do NOT mutate the line's classList ourselves: the
        // animator owns Active/Sung state, and stripping Active from a line
        // that's still actively playing causes the line to flash collapsed
        // for one animator frame on remount.
        const gap = this._itemGap(idx);
        const prevPad = parseFloat(wrapper.style.paddingBottom) || 0;
        if (Math.abs(prevPad - gap) >= 0.5) {
          wrapper.style.paddingBottom = `${gap}px`;
        }
        v.measureElement(wrapper);
        if (this._resizeRAF === null) {
          this._resizeRAF = requestAnimationFrame(() => {
            this._resizeRAF = null;
            if (this._virtualizer === v) {
              virtualizerLogger.debug("Unmount pass scheduled virtualizer update");
              v._willUpdate();
            }
          });
        }
        this._resizeObserver?.unobserve(wrapper);
        wrapper.parentElement?.removeChild(wrapper);
      }
      this._mountedIndices.delete(idx);
    }

    let didMeasure = false;
    for (const item of items) {
      const wrapper = this._getOrCreateWrapper(item.index);
      const gap = this._itemGap(item.index);
      const prevPad = parseFloat(wrapper.style.paddingBottom) || 0;
      if (Math.abs(prevPad - gap) >= 0.5) {
        wrapper.style.paddingBottom = `${gap}px`;
      }
      wrapper.style.transform = `translateY(${Math.round(item.start)}px)`;

      if (!this._mountedIndices.has(item.index)) {
        this._virtualContainer.appendChild(wrapper);
        this._mountedIndices.add(item.index);
        this._resizeObserver?.observe(wrapper);
        // Measure immediately on mount so start offsets are corrected in the same frame.
        v.measureElement(wrapper);
        didMeasure = true;
        this._onNewElementMounted?.();
      } else if (Math.abs(prevPad - gap) >= 0.5) {
        // Gap changes alter wrapper height without necessarily triggering a ResizeObserver
        // callback quickly enough for this pass.
        v.measureElement(wrapper);
        didMeasure = true;
      }
    }
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

  getVirtualizer(): Virtualizer<HTMLElement, HTMLElement> | null {
    return this._virtualizer;
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
  scrollToIndex(
    index: number,
    align: "start" | "center" | "end" | "auto" = "center",
    instant: boolean = false,
    padding: number = 0
  ): void {
    const v = this._virtualizer;
    if (!v || !this._virtualContainer) return;

    const scrollEl = v.scrollElement;
    if (!scrollEl) return;

    const viewportHeight = scrollEl.clientHeight;
    if (!viewportHeight) return;

    let itemStart: number;
    let itemSize: number;

    const cached = v.measurementsCache[index] as
      | { start: number; end: number; size: number }
      | undefined;

    if (cached) {
      itemStart = cached.start;
      itemSize = cached.size;
    } else {
      // gap is always 0 — baked into each wrapper's padding-bottom.
      const count = this._allElements.length;
      const totalSize = v.getTotalSize();
      const avgItemSize = count > 1 ? totalSize / count : totalSize;
      itemStart = index * avgItemSize;
      itemSize = this._estimateSize(index);
    }

    const containerRect = this._virtualContainer.getBoundingClientRect();
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

    // The permanent spacer (half a viewport) appended to scrollEl during init
    // guarantees there is always enough scrollable room to reach finalScrollTop,
    // so no temporary container-height inflation is needed here.
    const finalScrollTop = Math.max(0, targetScrollTop + padding);
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
      targetScrollTop,
      finalScrollTop,
    });

    if (instant) {
      scrollEl.classList.add("InstantScroll");
    } else {
      scrollEl.classList.remove("InstantScroll");
    }

    scrollEl.scrollTop = finalScrollTop;
  }

  destroy(): void {
    virtualizerLogger.info("Destroying lyrics virtualizer", {
      mountedCount: this._mountedIndices.size,
      wrappers: this._wrappers.length,
      hasVirtualizer: Boolean(this._virtualizer),
    });
    this._maid?.Destroy();
    this._maid = null;
    this._scrollEl = null;
    this._resizeObserver = null;
    this._widthObserver = null;
    this._containerWidth = 0;
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
    this._wrappers = [];
    this._mountedIndices.clear();
    this._lastVirtualWindowSignature = "";
    this._virtualContainer = null;
    if (this._resizeDebounceTimer) clearTimeout(this._resizeDebounceTimer);
    this._onNewElementMounted = null;
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

export function destroyLyricsVirtualizer(): void {
  lyricsVirtualizer.destroy();
}

export function setOnNewElementMounted(cb: (() => void) | null): void {
  lyricsVirtualizer.setOnNewElementMounted(cb);
}
