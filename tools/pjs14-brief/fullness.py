"""How full is a mockup? Objective comparison against the Halloween mockup.

Measures only OUTSIDE the content zones (cover, title, lyrics), where
decoration lives:
  edge   mean gradient magnitude (Sobel-like): how much visual detail there is
  busy   % of pixels whose local 9x9 std-dev > 12: how much of the free area
         holds detail rather than flat sky/gradient
  empty  % of the free area that is flat (std-dev < 4): plain background
Usage: python fullness.py img1.png img2.png ...
"""

import sys

import numpy as np
from PIL import Image, ImageFilter

ZONES = [(141, 133, 604, 597), (141, 605, 604, 747), (749, 97, 1354, 745)]


def measure(path):
    im = Image.open(path).convert("L").resize((1440, 810))
    a = np.asarray(im).astype(np.float64)
    mask = np.ones_like(a, bool)
    for x0, y0, x1, y1 in ZONES:
        mask[y0:y1, x0:x1] = False
    gx = np.abs(np.diff(a, axis=1, prepend=a[:, :1]))
    gy = np.abs(np.diff(a, axis=0, prepend=a[:1, :]))
    edge = (gx + gy)[mask].mean()
    mean = np.asarray(im.filter(ImageFilter.BoxBlur(4))).astype(np.float64)
    sq = np.asarray(Image.fromarray((a ** 2 / 255).astype(np.uint8)).filter(ImageFilter.BoxBlur(4))).astype(np.float64) * 255
    std = np.sqrt(np.clip(sq - mean ** 2, 0, None))
    busy = (std[mask] > 12).mean() * 100
    empty = (std[mask] < 4).mean() * 100
    return edge, busy, empty


if __name__ == "__main__":
    print(f"{'image':48} {'edge':>6} {'busy%':>6} {'empty%':>7}")
    for p in sys.argv[1:]:
        e, b, m = measure(p)
        print(f"{p[-48:]:48} {e:6.2f} {b:6.1f} {m:7.1f}")
