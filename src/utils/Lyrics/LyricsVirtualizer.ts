import {
  Virtualizer,
  elementScroll,
  observeElementRect,
  observeElementOffset,
} from "@tanstack/virtual-core";
import { Maid } from "../../modules/Maid.ts";
import Logger from "../Logger.ts";

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
  // disable TanStack's own scroll-position adjustment (see _setConverging) so we are
  // the sole writer of scrollTop and the retry chain's "external scroll" abort only
  // trips on a genuine user scroll.
  private _converging = false;

  // Re-entry guard for _onVirtualizerChange. TanStack's resizeItem calls onChange
  // synchronously on a non-zero size delta, so v.measureElement() inside the mount
  // loop can recurse back in; without this guard the outer loop's stale items
  // snapshot would overwrite correct transforms set by the inner call.
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
          v._willUpdate();
        }
        return;
      }
      
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
        // Sync the cached size to the line's current classList before unmounting.
        // The animator may have flipped Active/Sung since the wrapper was rendered,
        // and the MutationObserver only fires for elements still in the subtree (and
        // only as a microtask). Recomputing the gap here makes the cache match what a
        // remount would render, so re-entry doesn't misalign following items by the
        // stale dot-line height. We do NOT mutate classList — the animator owns
        // Active/Sung, and stripping Active flashes the line collapsed on remount.
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
    this._setConverging(true);
    this._scrollToIndexWithRetry(index, align, instant, padding, 0, null);
  }

  // Toggle convergence mode. While converging we disable TanStack's
  // shouldAdjustScrollPositionOnItemSizeChange hook, whose automatic scrollTop
  // correction (for above-viewport items measured larger than estimate) writes
  // scrollTop out from under our manual scroll and trips the retry's external-scroll
  // guard — the root cause of the active line never centering on a mid-song open.
  // Restored to the default heuristic on settle so steady-state scrolling keeps it.
  private _setConverging(active: boolean): void {
    if (active === this._converging) return;
    this._converging = active;
    const v = this._virtualizer;
    if (v) {
      v.shouldAdjustScrollPositionOnItemSizeChange = active ? () => false : undefined;
    }
  }

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
    const tanstackOffsetBefore = v.scrollOffset;

    // Diagnostics: distinguishes a smooth-scroll stall, an unscrollable container,
    // and the Wayland failure — a DOM/virtualizer offset desync (observedScrollTop
    // moved but tanstackOffset did not, because the 'scroll' event never dispatched).
    virtualizerLogger.debug("scrollToIndex applied", {
      retry,
      finalScrollTop: Math.round(finalScrollTop),
      observedScrollTop: Math.round(observedScrollTop),
      tanstackOffset: tanstackOffsetBefore == null ? null : Math.round(tanstackOffsetBefore),
      scrollHeight: scrollEl.scrollHeight,
      clientHeight: scrollEl.clientHeight,
      maxScroll: scrollEl.scrollHeight - scrollEl.clientHeight,
      virtualHeight: this._virtualContainer.offsetHeight,
      scrollBehavior: getComputedStyle(scrollEl).scrollBehavior,
      hasInstantScroll: scrollEl.classList.contains("InstantScroll"),
      targetMounted: this._mountedIndices.has(index),
    });

    // Wayland quirk: a programmatic scrollTop write may not dispatch a 'scroll' event,
    // so observeElementOffset never updates scrollOffset and the virtual window stays
    // pinned to the old position while the DOM scrolled (blank lyrics until a manual
    // scroll). Push the observed offset into the virtualizer and re-render so the right
    // window mounts regardless. No-op where the event fires (offsets already match).
    if (v.scrollOffset == null || Math.abs(v.scrollOffset - observedScrollTop) >= 1) {
      v.scrollOffset = observedScrollTop;
      this._onVirtualizerChange(v);
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
          ? Math.abs(fresh.start - itemStart) + Math.abs(fresh.size - itemSize)
          : 0;
        const wasClamped = Math.abs(observedScrollTop - finalScrollTop) > 1;
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
    // Reset convergence so the next virtualizer instance doesn't inherit a stale `true`
    // (which would make _setConverging(true) a no-op and never install the hook).
    this._converging = false;
    this._maid?.Destroy();
    this._maid = null;
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
    this._wrappers = [];
    this._mountedIndices.clear();
    this._lastVirtualWindowSignature = "";
    this._virtualContainer = null;
    if (this._resizeDebounceTimer !== null) {
      clearTimeout(this._resizeDebounceTimer);
      this._resizeDebounceTimer = null;
    }
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

export function triggerRemeasureLV(): void {
  lyricsVirtualizer.remeasure();
}