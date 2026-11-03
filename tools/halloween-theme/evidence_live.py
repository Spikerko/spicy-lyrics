"""Evidence that the round-2 requirements hold on the live 6.4.70 page.

Read-only for playback. One brief visual toggle: the theme class is removed for
one screenshot and restored immediately, to prove the album cover pixels are
identical with and without the theme (nothing drawn over the cover).

Checks:
  1. cover untouched     cover-box pixels identical, theme on vs off
  2. lute vs title       lute's left edge right of the title glyphs
  3. tree planted        tree base below the grass line, trunk left of cover
  4. bats clear of moon  over 10 samples during the drift animation
  5. ground seamless     no column jump at grass tile boundaries
  6. playback untouched  same track, paused state, position unchanged
"""

import base64
import io
import json
import sys

import numpy as np
from PIL import Image

from cdp import Page

p = Page()
results = []


def check(name, ok, detail):
    results.append((name, bool(ok), detail))


def shot():
    data = p.call("Page.captureScreenshot", format="png")["data"]
    return np.asarray(Image.open(io.BytesIO(base64.b64decode(data))).convert("RGB")).astype(np.int16)


before = p.eval("({uri: Spicetify.Player.data?.item?.uri, playing: Spicetify.Player.isPlaying(), progress: Spicetify.Player.getProgress()})")

# 1. Cover untouched: compare cover pixels with the theme on and off.
cover = p.eval("(() => { const b = document.querySelector('#SpicyLyricsPage .NowBar .MediaImageContainer').getBoundingClientRect(); return [Math.round(b.left)+6, Math.round(b.top)+6, Math.round(b.right)-6, Math.round(b.bottom)-6]; })()")
on = shot()
p.eval("document.querySelector('#SpicyLyricsPage').classList.remove('Exp_HalloweenTheme'); new Promise(r => setTimeout(r, 400))")
off = shot()
p.eval("document.querySelector('#SpicyLyricsPage').classList.add('Exp_HalloweenTheme'); 1")
restored = p.eval("document.querySelector('#SpicyLyricsPage').classList.contains('Exp_HalloweenTheme')")
x0, y0, x1, y1 = cover
diff = np.abs(on[y0:y1, x0:x1] - off[y0:y1, x0:x1])
changed = float((diff.max(axis=2) > 6).mean())
check("cover pixels unchanged by theme", changed < 0.002 and restored, f"{changed:.3%} of cover pixels differ; theme restored={restored}")

# 2-4. Geometry from the live layout.
g = p.eval(r"""
(() => {
  const P = document.querySelector('#SpicyLyricsPage');
  const r = (s) => { const e = P.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return {l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height}; };
  const rng = document.createRange(); rng.selectNodeContents(P.querySelector('.NowBar .Header .Metadata .SongName'));
  const tb = rng.getBoundingClientRect();
  const ground = P.querySelector('.Hlw__Ground').getBoundingClientRect();
  return { cover: r('.NowBar .MediaImageContainer'), title: {l: tb.left, r: tb.right, t: tb.top, b: tb.bottom},
           lute: r('.Hlw__Lute'), tree: r('.Hlw__Tree'), moon: r('.Hlw__Moon'), ground: {t: ground.top, b: ground.bottom},
           canvas: P.classList.contains('CanvasImmersive'), H: innerHeight };
})()""")
check("lute clear of title glyphs", g["lute"]["l"] > g["title"]["r"] + 8, f"title ends {g['title']['r']:.0f}, lute starts {g['lute']['l']:.0f}")
trunk_right = g["tree"]["l"] + g["tree"]["w"] * 0.73
grass_line = g["ground"]["t"] + (g["ground"]["b"] - g["ground"]["t"]) * 0.45
check("tree trunk left of cover", trunk_right < g["cover"]["l"], f"trunk ends {trunk_right:.0f}, cover starts {g['cover']['l']:.0f}")
check("tree base sunk below grass line", g["tree"]["b"] > grass_line + 8, f"tree base {g['tree']['b']:.0f}, grass line ~{grass_line:.0f}")

disc_left = g["moon"]["l"] + g["moon"]["w"] * 0.132
worst = -1e9
for _ in range(10):
    rights = p.eval("[...document.querySelectorAll('#SpicyLyricsPage .Hlw__Bat')].map(b => b.getBoundingClientRect().right)")
    worst = max(worst, max(rights))
    p.eval("new Promise(r => setTimeout(r, 450))")
check("bats never reach the moon disc", worst < disc_left - 4, f"rightmost bat {worst:.0f} over 10 samples (4.5s), moon disc starts {disc_left:.0f}")

# 5. Ground seamless: a seam would be a column jump at a tile boundary well
#    above the typical column-to-column change inside a tile.
tiles = p.eval(r"""
(() => {
  const g = document.querySelector('#SpicyLyricsPage .Hlw__Ground');
  const b = g.getBoundingClientRect();
  const size = getComputedStyle(g).backgroundSize.split(',')[0].trim().split(' ')[0];
  return { top: b.top, w: parseFloat(size) };
})()""")
img = shot()
y_a, y_b = int(tiles["top"] + 4), int(tiles["top"] + tiles["w"] * 0 + 30)
band = img[y_a:y_b]
col = np.abs(np.diff(band, axis=1)).mean(axis=(0, 2))
typical = float(np.median(col))
seam_x = [int(round(k * tiles["w"])) for k in range(1, int(img.shape[1] / tiles["w"]) + 1)]
seam = [float(col[x - 1]) for x in seam_x if 1 <= x < len(col)]
worst_seam = max(seam) if seam else 0.0
p95 = float(np.percentile(col, 95))
check("grass tiles join without a seam", worst_seam <= p95, f"{len(seam)} boundaries, worst jump {worst_seam:.1f} vs 95th pct column change {p95:.1f} (median {typical:.1f})")

# 6. Playback untouched.
after = p.eval("({uri: Spicetify.Player.data?.item?.uri, playing: Spicetify.Player.isPlaying(), progress: Spicetify.Player.getProgress()})")
same = after["uri"] == before["uri"] and after["playing"] == before["playing"] and (before["playing"] or abs(after["progress"] - before["progress"]) < 1500)
check("playback untouched", same, f"before {before}, after {after}")

print(json.dumps({"canvas_layout": g["canvas"], "viewport_h": g["H"]}))
for name, ok, detail in results:
    print(f"{'PASS' if ok else 'FAIL'}  {name}: {detail}")
print(f"\n{sum(r[1] for r in results)}/{len(results)} requirements evidenced live")
sys.exit(0 if all(r[1] for r in results) else 1)
