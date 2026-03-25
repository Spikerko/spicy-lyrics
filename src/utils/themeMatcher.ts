/* as of right now, this is super simple as i made this in a rush. might evolve, might not */

function onMarketplaceUserCssDetected(userCssText: string | null) {
    if (userCssText?.includes(`*:not([style*="lyric" i] *, [class*="lyric" i], .main-entityHeader-title)`)) {
        document.body.classList.add("sltm__ThemeMatch__textdt");
        return;
    }

    document.body.classList.remove("sltm__ThemeMatch__textdt")
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

export async function runThemeMatcher() {
  watchMarketplaceUserCss();
}