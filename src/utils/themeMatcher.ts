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
// page is open. Themes that already reposition the bar or its labels (Spotify
// Spice lays the bar across the top edge) break under that, so it only applies
// to a layout where both are still in flow. The class comes off before measuring
// so the reading is the theme's layout, not ours; it goes back on in the same
// task, so nothing paints in between.
export function syncStockPlaybarClass() {
  document.body.classList.remove(STOCK_PLAYBAR_CLASS);
  const bar =
    document.querySelector<HTMLElement>(".Root__now-playing-bar .playback-bar") ??
    document.querySelector<HTMLElement>(".playback-bar");
  const elapsed = bar?.querySelector<HTMLElement>(
    `:scope > :is(.playback-bar__progress-time-elapsed, [data-testid="playback-position"])`
  );
  const barPosition = bar ? getComputedStyle(bar).position : null;
  const stock =
    (barPosition === "static" || barPosition === "relative") &&
    (!elapsed || getComputedStyle(elapsed).position === "static");
  document.body.classList.toggle(STOCK_PLAYBAR_CLASS, stock);
}

export async function runThemeMatcher() {
  watchMarketplaceUserCss();
}
