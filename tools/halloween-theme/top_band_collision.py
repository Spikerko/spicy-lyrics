"""Does the top band (logo, bats, moon, branch) collide with VISIBLE lyric text?

Read-only. For each lyric line inside the top band, reports the line's real
painted opacity (product of ancestor opacities and the LyricsContent fade mask
at that y), so a line Spicy Lyrics has already faded out does not count.
"""

import json
import sys

from cdp import Page

JS = r"""
(() => {
  const page = document.querySelector("#SpicyLyricsPage");
  const content = page.querySelector(".LyricsContainer .LyricsContent");
  const cb = content.getBoundingClientRect();
  const band = page.querySelector(".HalloweenTop").getBoundingClientRect().bottom;
  // Spicy Lyrics' fade mask: 0 until 16px, full at 64px, from the content top.
  const mask = (y) => { const d = y - cb.top; return d <= 16 ? 0 : d >= 64 ? 1 : (d - 16) / 48; };
  const parts = [...page.querySelectorAll(".HalloweenTop > *, .Hlw__Moon")].map((e) => ({ n: e.className.replace("Hlw__", ""), b: e.getBoundingClientRect() }));
  const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const out = [];
  for (const l of content.querySelectorAll(".line")) {
    const b = l.getBoundingClientRect();
    if (!b.width || b.top >= band || b.bottom <= 0) continue;
    let op = 1;
    for (let e = l; e && e !== content; e = e.parentElement) op *= parseFloat(getComputedStyle(e).opacity);
    const kids = [...l.querySelectorAll("*")].map((k) => parseFloat(getComputedStyle(k).opacity));
    const words = kids.length ? Math.max(...kids) : 1;
    const midY = Math.max(b.top, cb.top) + Math.min(b.height, band - b.top) / 2;
    const painted = op * words * mask(midY);
    out.push({ y: [Math.round(b.top), Math.round(b.bottom)], painted: +painted.toFixed(2), under: parts.filter((p) => hit(p.b, b)).map((p) => p.n) });
  }
  return { canvas: page.classList.contains("CanvasImmersive"), bandBottom: Math.round(band), contentTop: Math.round(cb.top), lines: out };
})()
"""

r = Page().eval(JS)
print(json.dumps(r, indent=1))
visible = [l for l in r["lines"] if l["painted"] > 0.15 and l["under"]]
print(f"\nvisible lyric lines under top-band art: {len(visible)}")
sys.exit(1 if visible else 0)
