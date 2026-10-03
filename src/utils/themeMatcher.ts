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
const getPlaybar = () =>
  document.querySelector<HTMLElement>(".Root__now-playing-bar .playback-bar") ??
  document.querySelector<HTMLElement>('[data-testid="now-playing-bar"] .playback-bar') ??
  document.querySelector<HTMLElement>(".playback-bar");

const getElapsed = (bar: HTMLElement) =>
  bar.querySelector<HTMLElement>(
    `:scope > :is(.playback-bar__progress-time-elapsed, [data-testid="playback-position"])`
  );

const isStockPlaybar = (): boolean => {
  // Dribbblish restyles the bar without moving anything the checks below see.
  if (document.querySelector('[id*="dribbblish"]')) return false;
  const bar = getPlaybar();
  if (!bar) return false;
  const barPosition = getComputedStyle(bar).position;
  if (barPosition !== "static" && barPosition !== "relative") return false;

  const elapsed = getElapsed(bar);
  // The rule's own targets for the progress wrapper: the classed one, whichever
  // direct child holds the progress bar, or (1.3.3, where neither class is
  // mapped) the child following the position label.
  let progress: Element | null = bar.querySelector(":scope > .playback-progressbar-container");
  if (!progress) {
    progress = bar.querySelector(".playback-progressbar");
    while (progress && progress.parentElement !== bar) progress = progress.parentElement;
  }
  progress ??= bar.querySelector(`:scope > [data-testid="playback-position"] + div`);
  if (!elapsed || !progress) return false;
  // Spotify's own rule makes the label position: relative (1.2.98 through 1.3.3).
  const elapsedPosition = getComputedStyle(elapsed).position;
  if (elapsedPosition !== "static" && elapsedPosition !== "relative") return false;

  // Not laid out (hidden bar): nothing to compare, and nothing to break.
  if (bar.getBoundingClientRect().width === 0) return true;
  const label = elapsed.getBoundingClientRect();
  const track = progress.getBoundingClientRect();
  const sameRow = label.top < track.bottom && track.top < label.bottom;
  return sameRow && label.right <= track.left + 1;
};

// Spotify reopens the last route on startup, so the page can open before the
// playback bar has mounted. Measuring then would settle on "not stock" until the
// page is reopened, so wait for the bar and its label first.
const PLAYBAR_WAIT_INTERVAL_MS = 250;
const PLAYBAR_WAIT_MAX_TRIES = 120;
let pendingPlaybarSync: ReturnType<typeof setTimeout> | undefined;

// The page the class is held for. This used to be a `body:has(#SpicyLyricsPage)`
// gate in default.scss, but a :has() on <body> ahead of a descendant selector
// makes Blink re-check body's whole subtree on every DOM change anywhere (the
// lyrics virtualizer, Spotify's own React updates), which showed up as dropped
// frames in every view on 1.3.3.
let stockPlaybarPage: HTMLElement | null = null;

// Pass the mounted page, or null when it goes away. A page in the popup window
// isn't in this document, so the main window's bar is left alone, as before.
export function setStockPlaybarPage(page: HTMLElement | null) {
  stockPlaybarPage = page?.ownerDocument === document ? page : null;
  syncStockPlaybarClass();
}

// Spotify can swap the playback bar (or its label) out while the page stays
// open, and the reading taken on open would then go stale. The now-playing bar
// is watched for that, childList only, plus its parent for the bar being
// replaced whole, so the lyrics page's own churn never reaches the observer.
// The check reruns only when the bar or its label is a different element.
let playbarObserver: MutationObserver | null = null;
let observedBar: HTMLElement | null = null;
let observedElapsed: HTMLElement | null = null;

const stopWatchingPlaybar = () => {
  playbarObserver?.disconnect();
  playbarObserver = null;
  observedBar = null;
  observedElapsed = null;
};

const watchPlaybar = (bar: HTMLElement | null) => {
  stopWatchingPlaybar();
  if (!bar) return;
  const root =
    bar.closest<HTMLElement>('.Root__now-playing-bar, [data-testid="now-playing-bar"]') ??
    bar.parentElement;
  if (!root) return;
  observedBar = bar;
  observedElapsed = getElapsed(bar);
  playbarObserver = new MutationObserver(() => {
    const current = getPlaybar();
    if (current === observedBar && (current && getElapsed(current)) === observedElapsed) return;
    syncStockPlaybarClass();
  });
  playbarObserver.observe(root, { childList: true, subtree: true });
  if (root.parentElement) playbarObserver.observe(root.parentElement, { childList: true });
};

// The class comes off before measuring so the reading is the theme's layout,
// not ours; it goes back on in the same task, so nothing paints in between.
export function syncStockPlaybarClass(tries = 0) {
  clearTimeout(pendingPlaybarSync);
  stopWatchingPlaybar();
  document.body.classList.remove(STOCK_PLAYBAR_CLASS);
  if (!stockPlaybarPage?.isConnected) return;
  const bar = getPlaybar();
  if ((!bar || !getElapsed(bar)) && tries < PLAYBAR_WAIT_MAX_TRIES) {
    pendingPlaybarSync = setTimeout(
      () => syncStockPlaybarClass(tries + 1),
      PLAYBAR_WAIT_INTERVAL_MS
    );
    return;
  }
  document.body.classList.toggle(STOCK_PLAYBAR_CLASS, isStockPlaybar());
  watchPlaybar(bar);
}

export async function runThemeMatcher() {
  watchMarketplaceUserCss();
}
