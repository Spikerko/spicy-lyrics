"""Content-independent recheck of the lute's gap at real window sizes.

validate_sizes.py measures the current song's title glyphs and lyric glyphs,
so a short title or short lines can hide an overlap. This measures the boxes
those texts are allowed to occupy: the title's container (the widest a title
can render before truncating) and the lyrics column's left content edge.
Uses real window resizes and restores the window exactly.
"""

import json
import time

from cdp import Page

SIZES = [(1280, 720), (1366, 768), (1440, 810), (1600, 900), (1920, 1080)]
PROBE = r"""
(() => {
  const P = document.querySelector('#SpicyLyricsPage');
  const box = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return {l: b.left, r: b.right}; };
  const name = P.querySelector('.NowBar .Header .Metadata .SongName');
  // Walk up to the nearest ancestor that actually clips or bounds the title.
  let bound = name, chain = [];
  for (let e = name; e && e !== P; e = e.parentElement) {
    const cs = getComputedStyle(e);
    chain.push([e.className.toString().slice(0, 30), Math.round(e.getBoundingClientRect().right), cs.overflow, cs.textOverflow, cs.whiteSpace]);
  }
  const nameCs = getComputedStyle(name);
  const lc = P.querySelector('.LyricsContent') || P.querySelector('.LyricsContainer');
  const lcb = lc.getBoundingClientRect();
  const pad = parseFloat(getComputedStyle(lc).paddingLeft) || 0;
  const firstLine = P.querySelector('.LyricsContent .line');
  return {
    vw: innerWidth,
    title: box(name), titleMetadata: box(P.querySelector('.NowBar .Header .Metadata')),
    nowbar: box(P.querySelector('.NowBar')),
    titleWraps: nameCs.whiteSpace, titleOverflow: nameCs.overflow,
    chain: chain.slice(0, 5),
    lute: box(P.querySelector('.Hlw__Lute')),
    lyricsColumnLeft: lcb.left + pad,
    lineLeft: firstLine ? firstLine.getBoundingClientRect().left : null,
  };
})()
"""

p = Page()
w0 = p.call("Browser.getWindowForTarget")
WID, ORIG = w0["windowId"], w0["bounds"]
out = []
try:
    for w, h in SIZES:
        p.call("Browser.setWindowBounds", windowId=WID, bounds={"left": 0, "top": 0, "width": w, "height": h})
        p.eval("new Promise(r => setTimeout(r, 1500))")
        out.append(((w, h), p.eval(PROBE)))
finally:
    b = {k: ORIG[k] for k in ("left", "top", "width", "height")}
    p.call("Browser.setWindowBounds", windowId=WID, bounds={**b, "width": b["width"] - 1})
    time.sleep(0.8)
    p.call("Browser.setWindowBounds", windowId=WID, bounds=b)
    time.sleep(1)

for (w, h), g in out:
    print(f"{w}x{h}  vw={g['vw']}  nowbar {g['nowbar']['l']:.0f}-{g['nowbar']['r']:.0f}  metadata.r {g['titleMetadata']['r']:.0f}  "
          f"title {g['title']['l']:.0f}-{g['title']['r']:.0f} ({g['titleWraps']}/{g['titleOverflow']})  "
          f"lute {g['lute']['l']:.0f}-{g['lute']['r']:.0f}  lyricsCol.l {g['lyricsColumnLeft']:.0f}  line.l {g['lineLeft']:.0f}")
print("chain@first:", json.dumps(out[0][1]["chain"]))
print("restored:", p.call("Browser.getWindowForTarget")["bounds"], p.eval("[innerWidth, innerHeight]"))
