// Read-only: where every scene part actually rendered, and whether any of them
// overlap content. Does not touch playback.
(() => {
  const page = document.querySelector("#SpicyLyricsPage");
  const box = (el) => {
    const b = el.getBoundingClientRect();
    return { x: Math.round(b.left), y: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) };
  };
  const q = (s) => page.querySelector(s);
  const content = {
    cover: q(".NowBar .Header .MediaBox .MediaImageContainer"),
    timeline: q(".NowBar .Timeline"),
    metadata: q(".NowBar .Header .Metadata"),
  };
  const lines = [...page.querySelectorAll(".LyricsContent .line")].map((l) => l.getBoundingClientRect()).filter((b) => b.width && b.bottom > 0 && b.top < innerHeight);
  const parts = {};
  for (const el of page.querySelectorAll(".HalloweenScene > *, .HalloweenTop > *")) {
    const name = el.className.replace("Hlw__", "") + (el.style.getPropertyValue("--i") ? `#${el.style.getPropertyValue("--i").trim()}` : "");
    parts[name] = { ...box(el), opacity: getComputedStyle(el).opacity, display: getComputedStyle(el).display };
  }
  const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const overlaps = [];
  for (const el of page.querySelectorAll(".HalloweenScene > *, .HalloweenTop > *")) {
    const eb = el.getBoundingClientRect();
    if (!eb.width || el.matches(".Hlw__Sky, .Hlw__Scrim, .Hlw__Clouds, .Hlw__Ground, .Hlw__MoonGlow")) continue;
    for (const [k, c] of Object.entries(content)) if (c && hit(eb, c.getBoundingClientRect())) overlaps.push(`${el.className} x ${k}`);
    if (lines.some((l) => hit(eb, l))) overlaps.push(`${el.className} x lyric line`);
  }
  return {
    content: Object.fromEntries(Object.entries(content).map(([k, v]) => [k, v && box(v)])),
    lyricLines: lines.length ? { left: Math.round(Math.min(...lines.map((b) => b.left))), right: Math.round(Math.max(...lines.map((b) => b.right))) } : null,
    parts,
    overlaps: [...new Set(overlaps)],
  };
})();
