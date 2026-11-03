"""Validate the Halloween theme at several window sizes on the live page.

Uses CDP device-metrics emulation, which changes only the rendered viewport of
this tab: no window resize, no settings written, no playback calls. The
emulation is always cleared at the end, even on failure.

Per size, checks the same requirements as evidence_live.py, measured on real
layout boxes and real glyph extents, plus that the scene's characters are
hidden in the layouts where they do not belong (compact, portrait).
"""

import json
import sys
import time

from cdp import Page

SIZES = [(1280, 720), (1366, 768), (1440, 810), (1600, 900), (1920, 1080), (2560, 1440), (900, 1200)]

PROBE = r"""
(() => {
  const P = document.querySelector('#SpicyLyricsPage');
  const vis = (e) => e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0;
  const r = (s) => { const e = P.querySelector(s); if (!vis(e)) return null; const b = e.getBoundingClientRect(); return {l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height}; };
  const title = (() => { const e = P.querySelector('.NowBar .Header .Metadata .SongName'); if (!e) return null; const g = document.createRange(); g.selectNodeContents(e); const b = g.getBoundingClientRect(); return {l: b.left, r: b.right, t: b.top, b: b.bottom}; })();
  // Glyph extents, not line boxes: .line is a full-width block whose left edge
  // is the container's and never moves with the text.
  const glyph = (l) => { const g = document.createRange(); g.selectNodeContents(l); return g.getBoundingClientRect(); };
  const lineBoxes = [...P.querySelectorAll('.LyricsContent .line')].map(l => l.getBoundingClientRect()).filter(b => b.width && b.bottom > 0 && b.top < innerHeight);
  const lines = [...P.querySelectorAll('.LyricsContent .line')].map(glyph).filter(b => b.width && b.bottom > 0 && b.top < innerHeight);
  const ground = P.querySelector('.Hlw__Ground').getBoundingClientRect();
  return {
    vw: innerWidth, vh: innerHeight,
    compact: P.classList.contains('CompactMode') || P.classList.contains('ForcedCompactMode'),
    canvas: P.classList.contains('CanvasImmersive'),
    cover: r('.NowBar .MediaImageContainer'), title, lute: r('.Hlw__Lute'), tree: r('.Hlw__Tree'),
    witch: r('.Hlw__Witch'), moon: r('.Hlw__Moon'), graves: r('.Hlw__Graves'),
    lyricsRight: lines.length ? Math.max(...lines.map(b => b.right)) : null,
    lyricsBottom: lines.length ? Math.max(...lines.map(b => b.bottom)) : null,
    bats: [...P.querySelectorAll('.Hlw__Bat')].filter(vis).map(b => b.getBoundingClientRect().right),
    lyricsLeft: lines.length ? Math.min(...lines.map(b => b.left)) : null,
    batsBottom: Math.max(0, ...[...P.querySelectorAll('.Hlw__Bat')].filter(vis).map(b => b.getBoundingClientRect().bottom)),
    logo: r('.Hlw__Logo'),
    lineBoxLeft: lineBoxes.length ? Math.min(...lineBoxes.map(b => b.left)) : null,
    lyricsCount: lines.length,
    groundTop: ground.top, groundBottom: ground.bottom,
  };
})()
"""

p = Page()
rows, fails = [], []
win = p.call("Browser.getWindowForTarget")
WID, ORIG = win["windowId"], win["bounds"]
SCREEN = p.eval("[screen.availWidth, screen.availHeight]")
methods = {}


def emulate(w, h):
    # Prefer a real window resize (what a user actually does). Emulate only
    # sizes larger than the screen. The window chrome adds no inset in Spotify
    # (outer == inner), so window bounds equal the viewport.
    if w <= SCREEN[0] and h <= SCREEN[1] and ORIG.get("windowState", "normal") == "normal":
        p.call("Emulation.clearDeviceMetricsOverride")
        p.call("Browser.setWindowBounds", windowId=WID, bounds={"left": 0, "top": 0, "width": w, "height": h})
        methods[(w, h)] = "window"
    else:
        p.call("Emulation.setDeviceMetricsOverride", width=w, height=h, deviceScaleFactor=1, mobile=False)
        methods[(w, h)] = "emulated"


def restore():
    p.call("Emulation.clearDeviceMetricsOverride")
    if ORIG.get("windowState", "normal") != "normal":
        # A maximized/fullscreen window must get its state back, not bounds:
        # setting bounds would leave it as a normal window the size of the
        # screen (seen 2026-10-26).
        p.call("Browser.setWindowBounds", windowId=WID, bounds={"windowState": "normal"})
        time.sleep(0.5)
        p.call("Browser.setWindowBounds", windowId=WID, bounds={"windowState": ORIG["windowState"]})
        time.sleep(1)
        return
    b = {k: ORIG[k] for k in ("left", "top", "width", "height")}
    # The 1px nudge forces Chromium to resync the viewport after emulation
    # (a bare clear left it stuck at 1280x720 on 2026-10-26).
    p.call("Browser.setWindowBounds", windowId=WID, bounds={**b, "width": b["width"] - 1})
    time.sleep(0.8)
    p.call("Browser.setWindowBounds", windowId=WID, bounds=b)


try:
    for w, h in SIZES:
        emulate(w, h)
        p.eval("new Promise(r => setTimeout(r, 1600))")  # let Compactify and layout settle
        g = p.eval(PROBE)
        if (g["vw"], g["vh"]) != (w, h):
            fails.append(f"{w}x{h}: viewport is {g['vw']}x{g['vh']}, size not applied")
        f = []
        cover, title = g["cover"], g["title"]
        if g["compact"] or g["canvas"] or w < h:
            # Characters must be hidden in layouts they were not designed for.
            for part in ("lute", "tree", "witch"):
                if g[part]:
                    f.append(f"{part} visible in {'compact' if g['compact'] else 'canvas' if g['canvas'] else 'portrait'} layout")
        else:
            if g["lute"] and title and g["lute"]["l"] <= title["r"] + 8:
                f.append(f"lute {g['lute']['l']:.0f} <= title {title['r']:.0f}")
            if g["lute"] and g["lyricsLeft"] and g["lute"]["r"] > g["lyricsLeft"] + 1:
                f.append(f"lute right {g['lute']['r']:.0f} into lyrics {g['lyricsLeft']:.0f}")
            if g["tree"] and cover:
                trunk = g["tree"]["l"] + g["tree"]["w"] * 0.73
                if trunk >= cover["l"]:
                    f.append(f"trunk {trunk:.0f} >= cover {cover['l']:.0f}")
                if trunk < 8:
                    f.append(f"trunk off screen ({trunk:.0f})")
                grass = g["groundTop"] + (g["groundBottom"] - g["groundTop"]) * 0.45
                if g["tree"]["b"] <= grass:
                    f.append(f"tree base {g['tree']['b']:.0f} above grass {grass:.0f}")
            # v1.1: the witch stands far right, in front of the house, right
            # of the graves, and must stay on screen.
            if g["witch"] and g["graves"] and g["witch"]["l"] < g["graves"]["r"] + 8:
                f.append(f"witch left {g['witch']['l']:.0f} into graves {g['graves']['r']:.0f}")
            if g["witch"] and g["witch"]["r"] > w:
                f.append(f"witch right {g['witch']['r']:.0f} off screen {w}")
            # Lyrics overlapping the witch is fine: lyrics are z 4, scene z 1.
        if g["moon"] and g["bats"]:
            disc = g["moon"]["l"] + g["moon"]["w"] * 0.132
            # Bats drift right by up to 3cqw during the animation.
            reach = max(g["bats"]) + 0.03 * w
            # A collision needs both axes. Bats only drift horizontally.
            if reach >= disc and g["batsBottom"] > g["moon"]["t"]:
                f.append(f"bat reach {reach:.0f} >= moon disc {disc:.0f}")
        if g["moon"] and g["logo"]:
            disc = g["moon"]["l"] + g["moon"]["w"] * 0.132
            if g["logo"]["r"] > disc and g["logo"]["b"] > g["moon"]["t"]:
                f.append(f"logo ({g['logo']['r']:.0f},{g['logo']['b']:.0f}) over moon disc ({disc:.0f},{g['moon']['t']:.0f})")
        rows.append((w, h, g["compact"], g["canvas"], f, g))
        fails += [f"{w}x{h}: {x}" for x in f]
finally:
    restore()
    p.eval("new Promise(r => setTimeout(r, 1200))")

restored = p.eval("({w: innerWidth, h: innerHeight, ow: outerWidth, oh: outerHeight})")
bounds = p.call("Browser.getWindowForTarget")["bounds"]
for w, h, compact, canvas, f, g in rows:
    mode = "compact" if compact else "canvas" if canvas else "portrait" if w < h else "standard"
    edges = f"lute {g['lute']['l']:.0f}-{g['lute']['r']:.0f}" if g["lute"] else "lute hidden"
    edges += f" title.r {g['title']['r']:.0f}" if g["title"] else ""
    edges += f" lyrics glyph {g['lyricsLeft']} box {g['lineBoxLeft']} n={g['lyricsCount']}"
    print(f"{w}x{h:<5} {methods[(w, h)]:8} {mode:9} {'PASS' if not f else 'FAIL: ' + '; '.join(f)}")
    print(f"            {edges}")
ok = bounds.get("windowState") == ORIG.get("windowState") and (
    ORIG.get("windowState", "normal") != "normal"
    or ((restored["w"], restored["h"]) == (ORIG["width"], ORIG["height"]) and all(bounds[k] == ORIG[k] for k in ("left", "top", "width", "height")))
)
print(f"\nrestored window {bounds.get('windowState')} {bounds['width']}x{bounds['height']} at {bounds['left']},{bounds['top']}, viewport {restored['w']}x{restored['h']}: {'OK' if ok else 'NOT RESTORED'}")
if not ok:
    fails.append("window/viewport not restored")
print(f"{len(rows) - sum(1 for r in rows if r[4])}/{len(rows)} sizes pass")
sys.exit(1 if fails else 0)
