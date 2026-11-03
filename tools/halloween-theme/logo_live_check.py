"""One-command live check for the moved logo (run once Spotify has port 9222).

1. Loads the installed build's CSS/markup into the open page (hotswap_full.py)
   if the page is still on an older build.
2. Measures the live logo box and compares it with the CSS model
   (logo_position_model.py formulas) at the current window size, and at
   1920x1080 with the v1.1 design's LOGO box.
3. Runs logo_over_lyrics.py: logo on top of lyrics, lyrics faded under it,
   with its negative controls.
No playback calls. Read-only apart from the reversible hotswap.
"""

import os
import subprocess
import sys

from cdp import Page

HERE = os.path.dirname(os.path.abspath(__file__))
DESIGN = (1007, 169, 1574, 397)

p = Page()
state = p.eval("""(() => {
  const P = document.querySelector('#SpicyLyricsPage');
  return {open: !!P, fullscreen: !!P && P.classList.contains('Fullscreen')};
})()""")
if not state["open"] or not state["fullscreen"]:
    sys.exit("Open Spicy Lyrics in Cinema View / Fullscreen first.")
# Always load the current build: an older page also has a .HalloweenLogo
# layer (logo at top centre), so its presence proves nothing.
subprocess.run([sys.executable, os.path.join(HERE, "hotswap_full.py")], check=True)

g = p.eval("""(() => {
  const P = document.querySelector('#SpicyLyricsPage');
  const b = P.querySelector('.Hlw__Logo').getBoundingClientRect();
  return {vw: innerWidth, vh: innerHeight, l: b.left, t: b.top, r: b.right, b: b.bottom,
          compact: P.classList.contains('CompactMode') || P.classList.contains('ForcedCompactMode'),
          canvas: P.classList.contains('CanvasImmersive')};
})()""")

W, H = g["vw"], g["vh"]
cw, ch = W / 100, H / 100
nbw = min(30 * cw, 52 * ch) * 1.1
ll = 50 * cw - nbw / 4 * 0.3
col = W - ll
h = min(21 * ch, col * 0.56 / 1.93)
cx = ll + col * 0.375
model = (cx - h * 1.93 / 2, 15.6 * ch, cx + h * 1.93 / 2, 15.6 * ch + h)
live = (g["l"], g["t"], g["r"], g["b"])
err = max(abs(a - b) for a, b in zip(live, model))
print(f"window {W}x{H}  live logo {tuple(round(v) for v in live)}  model {tuple(round(v) for v in model)}  max diff {err:.1f}px")
ok = err <= 3
if g["compact"] or g["canvas"]:
    print("compact/canvas layout: logo should be back at top centre; model above does not apply")
    ok = abs((g["l"] + g["r"]) / 2 - W / 2) < 3
if (W, H) == (1920, 1080):
    dcx = abs((live[0] + live[2]) / 2 - (DESIGN[0] + DESIGN[2]) / 2)
    print(f"vs design LOGO box: centre off {dcx:.0f}px, top {abs(live[1] - DESIGN[1]):.0f}px, bottom {abs(live[3] - DESIGN[3]):.0f}px")
print("POSITION", "PASS" if ok else "FAIL")

r = subprocess.run([sys.executable, os.path.join(HERE, "logo_over_lyrics.py")])
sys.exit(0 if ok and r.returncode == 0 else 1)
