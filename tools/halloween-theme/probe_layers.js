// Live layering probe. Layout-only (no screenshots), so it works even while the
// Spotify window is hidden. Returns structure, stacking and guard facts.
(() => {
  const q = (s) => document.querySelector(s);
  const page = q("#SpicyLyricsPage");
  const out = {
    visibility: document.visibilityState,
    viewport: [innerWidth, innerHeight, outerWidth, outerHeight],
    pageOpen: !!page,
  };
  if (!page) return out;
  out.pageClasses = [...page.classList].filter((c) => /^Exp_|Fullscreen|Canvas|Compact|NoLyrics|Sidebar|Portrait/i.test(c));
  const z = (el) => (el ? getComputedStyle(el).zIndex : null);
  const scene = page.querySelector(".HalloweenScene");
  const top = page.querySelector(".HalloweenTop");
  const lyrics = page.querySelector(".LyricsContainer") || page.querySelector("#SpicyLyricsPage .LyricsContent");
  const lyricsLayer = lyrics && lyrics.closest(".ContentBox") ? lyrics.closest(".ContentBox") : lyrics;
  out.layers = {
    scene: scene && { z: z(scene), display: getComputedStyle(scene).display, children: scene.children.length },
    top: top && { z: z(top), display: getComputedStyle(top).display, children: top.children.length },
    lyricsLayer: lyricsLayer && { cls: lyricsLayer.className.toString().slice(0, 60), z: z(lyricsLayer) },
    canvasStage: z(page.querySelector(".CanvasStage")),
  };
  const shown = (el) => {
    if (!el) return false;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== "none" && cs.visibility !== "hidden" && +cs.opacity > 0 && r.width > 0 && r.height > 0;
  };
  out.parts = {};
  if (scene) for (const el of scene.querySelectorAll("[class]")) {
    const k = [...el.classList].find((c) => /^HW|^Halloween/.test(c)) || el.classList[0];
    if (!(k in out.parts)) out.parts[k] = shown(el);
  }
  if (top) for (const el of top.querySelectorAll("[class]")) {
    const k = [...el.classList].find((c) => /^HW|^Halloween/.test(c)) || el.classList[0];
    if (!(k in out.parts)) out.parts[k] = shown(el);
  }
  out.brandPillShown = shown(page.querySelector(".BrandedHeader"));
  const imgs = [...page.querySelectorAll(".HalloweenScene img, .HalloweenTop img")];
  out.images = { total: imgs.length, broken: imgs.filter((i) => i.complete && i.naturalWidth === 0).length };
  out.pointerThrough = [scene, top].map((el) => el && getComputedStyle(el).pointerEvents);
  out.animations = document.getAnimations().filter((a) => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest(".HalloweenScene,.HalloweenTop")).length;
  return out;
})()
