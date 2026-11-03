"""Pixel-accurate worst-case title vs lute, at real window sizes.

The lute PNG's box overlaps a long title's box, but its upper-left is
transparent. This maps the title box onto the lute's alpha mask (including
the current strum transform, via getBoundingClientRect of the transformed
element sampled across the animation) and reports the smallest horizontal
clearance between the title's visible box and an opaque lute pixel in the
rows they share. Title text and the window are always restored.
"""

import json
import os
import time

import numpy as np
from PIL import Image

from cdp import Page

HERE = os.path.dirname(os.path.abspath(__file__))
A = np.array(Image.open(os.path.join(HERE, "source", "tokoh__tupai-pemain-kecapi.png")).convert("RGBA").split()[3]) > 40
IH, IW = A.shape
SIZES = [(1280, 720), (1366, 768), (1440, 810), (1600, 900), (1920, 1080), (1740, 917)]
TITLES = ["Ghosts That We Knew In The Long October Night Of The Haunted Hill", "Supercalifragilisticexpialidociousandmoreandmore"]

PROBE = r"""
(async (titles) => {
  const P = document.querySelector('#SpicyLyricsPage');
  const n = P.querySelector('.NowBar .Header .Metadata .SongName');
  const L = P.querySelector('.Hlw__Lute');
  const orig = n.innerHTML;
  const R = (b) => [b.left, b.top, b.right, b.bottom];
  const out = {titles: [], lute: []};
  try {
    for (const t of titles) {
      n.textContent = t;
      await new Promise(r => setTimeout(r, 120));
      // Visible extent: glyph rects clipped to the SongName box.
      const box = n.getBoundingClientRect();
      const g = document.createRange(); g.selectNodeContents(n);
      for (const b of g.getClientRects()) {
        const l = Math.max(b.left, box.left), r = Math.min(b.right, box.right);
        const tp = Math.max(b.top, box.top), bt = Math.min(b.bottom, box.bottom);
        if (r > l && bt > tp) out.titles.push([l, tp, r, bt]);
      }
    }
  } finally { n.innerHTML = orig; }
  // Untransformed layout box + the live strum transform, sampled over a cycle.
  const lb = {l: L.offsetLeft, t: L.offsetTop, w: L.offsetWidth, h: L.offsetHeight};
  const parent = L.offsetParent.getBoundingClientRect();
  for (let i = 0; i < 8; i++) {
    out.lute.push(getComputedStyle(L).transform);
    await new Promise(r => setTimeout(r, 120));
  }
  out.box = [parent.left + lb.l, parent.top + lb.t, lb.w, lb.h];
  out.origin = getComputedStyle(L).transformOrigin;
  out.restored = n.innerHTML === orig;
  return out;
})
"""


def clearance(g):
    x0, y0, w, h = g["box"]
    ox, oy = [float(v) for v in g["origin"].replace("px", "").split()[:2]]
    sx, sy = IW / w, IH / h
    ys, xs = np.nonzero(A)
    # Opaque pixel centres in element-local CSS px.
    lx, ly = (xs + 0.5) / sx, (ys + 0.5) / sy
    worst = None
    for m in set(g["lute"]):
        if m == "none":
            a, b, c, d, e, f = 1, 0, 0, 1, 0, 0
        else:
            a, b, c, d, e, f = [float(v) for v in m[m.index("(") + 1:-1].split(",")]
        px = x0 + ox + a * (lx - ox) + c * (ly - oy) + e
        py = y0 + oy + b * (lx - ox) + d * (ly - oy) + f
        for l, t, r, btm in g["titles"]:
            rows = (py >= t) & (py <= btm)
            if not rows.any():
                continue
            gap = float(px[rows].min() - r)
            worst = gap if worst is None else min(worst, gap)
    return worst


p = Page()
w0 = p.call("Browser.getWindowForTarget")
WID, ORIG = w0["windowId"], w0["bounds"]
res = []
try:
    for w, h in SIZES:
        p.call("Browser.setWindowBounds", windowId=WID, bounds={"left": 0, "top": 0, "width": w, "height": h})
        p.eval("new Promise(r => setTimeout(r, 1500))")
        g = p.eval(f"({PROBE})({json.dumps(TITLES)})")
        res.append(((w, h), g, clearance(g)))
finally:
    b = {k: ORIG[k] for k in ("left", "top", "width", "height")}
    p.call("Browser.setWindowBounds", windowId=WID, bounds={**b, "width": b["width"] - 1})
    time.sleep(0.8)
    p.call("Browser.setWindowBounds", windowId=WID, bounds=b)
    time.sleep(1)

ok = 0
for (w, h), g, c in res:
    good = c is None or c >= 8
    ok += good
    desc = "no shared rows" if c is None else f"min clearance {c:+.0f}px"
    print(f"{w}x{h}  {desc}  {'OK' if good else 'TOUCHES'}  transforms={len(set(g['lute']))} restored={g['restored']}")
print("window:", p.call("Browser.getWindowForTarget")["bounds"], p.eval("[innerWidth, innerHeight]"))
print(f"{ok}/{len(res)} sizes: worst-case title clear of visible lute pixels")
