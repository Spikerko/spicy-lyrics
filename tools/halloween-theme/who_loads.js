// Read-only: which Spicy Lyrics copies are on this page, and which one owns the
// lyrics page. Changes nothing.
(() => {
  const scripts = [...document.scripts].map((s) => s.src).filter(Boolean);
  const isSpicy = (u) => /spicy-lyrics|spicylyrics\.org/i.test(u);
  let marketplace = null;
  try {
    const raw = Object.keys(localStorage).filter((k) => /marketplace/i.test(k));
    marketplace = raw.map((k) => {
      const v = localStorage.getItem(k) || "";
      return { key: k, mentionsSpicy: /spicy-lyrics|spicylyrics/i.test(v), length: v.length };
    }).filter((x) => x.mentionsSpicy);
  } catch (e) {
    marketplace = String(e);
  }
  const page = document.querySelector("#SpicyLyricsPage");
  return {
    spicyScripts: scripts.filter(isSpicy),
    allExtensionScripts: scripts.filter((u) => u.includes("/extensions/")),
    customElementDefined: !!customElements.get("sl-generic-modal"),
    spicyGlobalKeys: Object.keys(window._spicy_lyrics || {}).slice(0, 20),
    marketplaceEntriesMentioningSpicy: marketplace,
    pageExists: !!page,
  };
})();
