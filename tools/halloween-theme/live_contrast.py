"""Measure white-text contrast on the LIVE screenshot, behind visible lyric lines.

Reads the screenshot plus theme_measured-style line boxes from lines_behind.js
output saved as lines_live.json. Samples only the background between glyph
strokes is impossible from a flattened screenshot, so this measures the
brightest background colour in each line box, excluding pixels that are close
to the text colour (near-white) themselves.
"""

import json
import sys

import numpy as np
from PIL import Image

shot = np.asarray(Image.open(sys.argv[1]).convert("RGB")).astype(np.float64)
lines = json.load(open(sys.argv[2], encoding="utf-8"))
H, W, _ = shot.shape


def rel_lum(rgb):
    c = rgb / 255.0
    c = np.where(c <= 0.03928, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]


worst = None
for ln in lines:
    y0, y1 = max(0, ln["y"][0]), min(H, ln["y"][1])
    x0, x1 = max(0, ln["x"][0]), min(W, ln["x"][1])
    if y1 - y0 < 4 or float(ln["opacity"]) < 0.05:
        continue
    region = shot[y0:y1, x0:x1].reshape(-1, 3)
    lum = rel_lum(region)
    # Drop the text itself: lyric glyphs render near-white, so anything above
    # the 75th luminance percentile is treated as glyph, not background.
    bg = lum[lum <= np.percentile(lum, 75)]
    p95 = float(np.percentile(bg, 95))
    ratio = 1.05 / (p95 + 0.05)
    print(f"{ratio:5.1f}:1  behind={','.join(ln['behind']) or '-':14} {ln['text']}")
    worst = ratio if worst is None else min(worst, ratio)

print(f"\nworst visible line: {worst:.1f}:1 (target 4.5:1)" if worst else "no visible lines")
