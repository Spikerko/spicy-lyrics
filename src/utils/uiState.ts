import { atom } from "nanostores";

export const UI_STATE_KEY = "SL:uiState";

function readUiStateBlob(): Record<string, any> {
  const raw = Spicetify.LocalStorage.get(UI_STATE_KEY);
  if (raw === null || raw === undefined) return {};
  try {
    return JSON.parse(raw) as Record<string, any>;
  } catch {
    return {};
  }
}

function saveUiStateBlob(obj: Record<string, any>) {
  Spicetify.LocalStorage.set(UI_STATE_KEY, JSON.stringify(obj));
}

const _uiState: Record<string, any> = readUiStateBlob();

function persistAtom<T>(key: string, defaultValue: T) {
  const store = atom<T>(_uiState[key] !== undefined ? _uiState[key] : defaultValue);
  store.listen((v) => {
    _uiState[key] = v;
    saveUiStateBlob(_uiState);
  });
  return store;
}

// UI state atoms (persisted, not settings-panel entries)
export const $sidebarStatus = persistAtom<"open" | "closed">("sidebar-status", "closed");
export const $isNowBarOpen = persistAtom<boolean>("IsNowBarOpen", false);
export const $nowBarSide = persistAtom<"left" | "right">("NowBarSide", "left");
export const $forceCompactMode = persistAtom<boolean>("ForceCompactMode", false);
export const $romanization = persistAtom<boolean>("romanization", false);
export const $fromVersion = persistAtom<string>("fromVersion", "");
export const $lastFetchedUri = persistAtom<string | null>("lastFetchedUri", null);
export const $previousVersion = persistAtom<string>("previous-version", "");

// Runtime (ephemeral) atoms
export const $isGlobalNav = atom<boolean>(true);

(function watchGlobalNav() {
  function observe(root: Element) {
    $isGlobalNav.set(root.classList.contains("global-nav"));
    new MutationObserver(() => {
      $isGlobalNav.set(root.classList.contains("global-nav"));
    }).observe(root, { attributes: true, attributeFilter: ["class"] });
  }

  const existing = document.querySelector(".Root");
  if (existing) {
    observe(existing);
    return;
  }

  const mo = new MutationObserver((_, observer) => {
    const el = document.querySelector(".Root");
    if (el) {
      observer.disconnect();
      observe(el);
    }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();
