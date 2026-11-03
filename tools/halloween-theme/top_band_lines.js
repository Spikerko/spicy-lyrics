// Read-only: the real rendered opacity of the lyric lines that scroll up into
// the top band, sampled several times. getComputedStyle(line).opacity reads 0
// for lines Spicy Lyrics fades with child opacity or a mask, so this reports
// the line's own value AND its strongest descendant, plus any mask.
new Promise((resolve) => {
  const samples = [];
  let n = 0;
  const tick = () => {
    const band = document.querySelector("#SpicyLyricsPage .HalloweenTop").getBoundingClientRect().bottom;
    const rows = [...document.querySelectorAll("#SpicyLyricsPage .LyricsContent .line")]
      .map((l) => ({ l, b: l.getBoundingClientRect() }))
      .filter(({ b }) => b.width && b.top < band && b.bottom > 0)
      .map(({ l, b }) => {
        const kids = [...l.querySelectorAll("*")];
        const maxKid = kids.reduce((m, k) => Math.max(m, parseFloat(getComputedStyle(k).opacity) || 0), 0);
        const cs = getComputedStyle(l);
        return {
          y: [Math.round(b.top), Math.round(b.bottom)],
          own: cs.opacity,
          maxChild: Number(maxKid.toFixed(2)),
          mask: (cs.maskImage || cs.webkitMaskImage || "none").slice(0, 40),
          text: l.innerText.replace(/\s+/g, " ").trim().slice(0, 24),
        };
      });
    samples.push(rows);
    if (++n < 4) setTimeout(tick, 1500);
    else resolve({ bandBottom: Math.round(document.querySelector("#SpicyLyricsPage .HalloweenTop").getBoundingClientRect().bottom), samples });
  };
  tick();
});
