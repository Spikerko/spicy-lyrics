/* as of right now, this is super simple as i made this in a rush. might evolve, might not */

function onMarketplaceUserCssDetected(userCssText: string | null) {
  // A Marketplace theme can load or change after the page opened.
  syncStockPlaybarClass();

  if (
    userCssText?.includes(
      `*:not([style*="lyric" i] *, [class*="lyric" i], .main-entityHeader-title)`,
    ) ||
    userCssText?.includes(
      `---------------\nPLAYBACK BAR\n---------------\n*/\n/* playback progress bar moves smoothly */\n.x-progressBar-fillColor`,
    ) ||
    userCssText?.includes(
      "/* check out a cool project: https://github.com/Rigellute/spotify-tui",
    )
  ) {
    document.body.classList.add("sltm__ThemeMatch__textdt");
    return;
  }

  document.body.classList.remove("sltm__ThemeMatch__textdt");
}

export function watchMarketplaceUserCss(): () => void {
  if (typeof document === "undefined") return () => {};

  let cssObserver: MutationObserver | null = null;
  let currentEl: Element | null = null;

  const emit = (userCssText: string | null) =>
    onMarketplaceUserCssDetected(userCssText);

  const getMarketplaceUserCssEl = () =>
    document.body?.querySelector(":scope > .marketplaceUserCSS") ?? null;

  const detachCssObserver = () => {
    cssObserver?.disconnect();
    cssObserver = null;
  };

  const attachCssObserver = (el: Element) => {
    // If it's the same element, do nothing.
    if (currentEl === el && cssObserver) return;

    // New element (or first time): swap observers.
    detachCssObserver();
    currentEl = el;

    cssObserver = new MutationObserver(() => {
      // If the element got removed, stop observing and wait for recreation.
      if (!document.body?.contains(el)) {
        currentEl = null;
        detachCssObserver();
        emit(null);
        return;
      }
      emit(el.textContent);
    });

    cssObserver.observe(el, {
      characterData: true,
      childList: true,
      subtree: true,
    });
  };

  const sync = () => {
    const el = getMarketplaceUserCssEl();

    // Element removed
    if (!el) {
      if (currentEl) {
        currentEl = null;
        detachCssObserver();
        emit(null);
      }
      return;
    }

    // Element added or recreated
    if (el !== currentEl) {
      emit(el.textContent);
      attachCssObserver(el);
    }
  };

  const bodyObserver = new MutationObserver(sync);
  bodyObserver.observe(document.body, { childList: true, subtree: true });

  // Initial sync (handles already-present element)
  sync();

  return () => {
    bodyObserver.disconnect();
    detachCssObserver();
    currentEl = null;
  };
}

const STOCK_PLAYBAR_CLASS = "SpicyLyrics_StockPlaybar";

// default.scss pins the elapsed time out of the playback bar's flow while the
// page is open, and pads the progress bar to make room for it. That assumes
// Spotify's own arrangement: bar and label in flow, the label on the progress
// bar's row, directly to its left. Themes arrange it differently (Spotify Spice
// lays the bar across the top edge, others restack it with flex, grid or
// margins without touching `position`), so the geometry is checked too, not
// just `position`. Anything else, right-to-left layouts included, keeps its own
// layout.
const isStockPlaybar = (): boolean => {
  const bar =
    document.querySelector<HTMLElement>(".Root__now-playing-bar .playback-bar") ??
    document.querySelector<HTMLElement>(".playback-bar");
  if (!bar) return false;
  const barPosition = getComputedStyle(bar).position;
  if (barPosition !== "static" && barPosition !== "relative") return false;

  const elapsed = bar.querySelector<HTMLElement>(
    `:scope > :is(.playback-bar__progress-time-elapsed, [data-testid="playback-position"])`
  );
  // The rule's own two targets for the progress wrapper: the classed one, or
  // whichever direct child holds the progress bar.
  let progress: Element | null = bar.querySelector(":scope > .playback-progressbar-container");
  if (!progress) {
    progress = bar.querySelector(".playback-progressbar");
    while (progress && progress.parentElement !== bar) progress = progress.parentElement;
  }
  if (!elapsed || !progress) return false;
  if (getComputedStyle(elapsed).position !== "static") return false;

  // Not laid out (hidden bar): nothing to compare, and nothing to break.
  if (bar.getBoundingClientRect().width === 0) return true;
  const label = elapsed.getBoundingClientRect();
  const track = progress.getBoundingClientRect();
  const sameRow = label.top < track.bottom && track.top < label.bottom;
  return sameRow && label.right <= track.left + 1;
};

// The class comes off before measuring so the reading is the theme's layout,
// not ours; it goes back on in the same task, so nothing paints in between.
export function syncStockPlaybarClass() {
  document.body.classList.remove(STOCK_PLAYBAR_CLASS);
  document.body.classList.toggle(STOCK_PLAYBAR_CLASS, isStockPlaybar());
}

export async function runThemeMatcher() {
  watchMarketplaceUserCss();
}
