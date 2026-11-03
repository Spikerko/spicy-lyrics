// Read-only: lyric lines currently on screen, and which scene parts sit behind
// each one. Explains the "lyric line" overlaps (lines scrolled off the top).
(() => {
  const page = document.querySelector("#SpicyLyricsPage");
  const lines = [...page.querySelectorAll(".LyricsContent .line")]
    .map((l) => ({ t: l.innerText.trim().slice(0, 30), b: l.getBoundingClientRect(), op: getComputedStyle(l).opacity }))
    .filter((l) => l.b.width && l.b.bottom > 0 && l.b.top < innerHeight);
  const parts = [...page.querySelectorAll(".HalloweenScene > *, .HalloweenTop > *")].filter(
    (e) => !e.matches(".Hlw__Sky, .Hlw__Scrim, .Hlw__Clouds, .Hlw__Ground, .Hlw__MoonGlow"),
  );
  const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  return lines.map((l) => ({
    text: l.t,
    y: [Math.round(l.b.top), Math.round(l.b.bottom)],
    x: [Math.round(l.b.left), Math.round(l.b.right)],
    opacity: l.op,
    behind: parts.filter((p) => hit(p.getBoundingClientRect(), l.b)).map((p) => p.className.replace("Hlw__", "")),
  }));
})();
