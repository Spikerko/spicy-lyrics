"""Measure where the visible pixels sit inside the tree, lute and moon images,
so CSS can position the actual artwork (trunk, roots, feet) rather than the
transparent box around it."""

import os

from PIL import Image

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "source")


def trimmed(name):
    im = Image.open(os.path.join(SRC, name)).convert("RGBA")
    return im.crop(im.getchannel("A").getbbox())


def opaque_cols(im, y0f, y1f, thresh=128):
    a = im.getchannel("A")
    w, h = im.size
    px = a.load()
    y0, y1 = int(h * y0f), int(h * y1f)
    cols = [x for x in range(w) if any(px[x, y] > thresh for y in range(y0, y1))]
    return (min(cols) / w, max(cols) / w) if cols else None


def lowest_opaque_row(im, x0f=0.0, x1f=1.0, thresh=128):
    a = im.getchannel("A")
    w, h = im.size
    px = a.load()
    for y in range(h - 1, -1, -1):
        if any(px[x, y] > thresh for x in range(int(w * x0f), int(w * x1f))):
            return y / h
    return None


tree = trimmed("adegan__pohon-rindang.png")
print("TREE  aspect %.4f" % (tree.width / tree.height))
for label, a, b in (("canopy", 0.0, 0.45), ("trunk mid", 0.55, 0.8), ("roots", 0.88, 1.0)):
    lo, hi = opaque_cols(tree, a, b)
    print(f"  {label:10} x {lo:.3f}-{hi:.3f} of width")
print("  lowest opaque row, centre 40%%: %.3f of height" % lowest_opaque_row(tree, 0.3, 0.7))

lute = trimmed("tokoh__tupai-pemain-kecapi.png")
print("LUTE  aspect %.4f" % (lute.width / lute.height))
lo, hi = opaque_cols(lute, 0.0, 1.0)
print(f"  body x {lo:.3f}-{hi:.3f}; feet lowest row {lowest_opaque_row(lute):.3f}")

moon = trimmed("adegan__bulan.png")
lo, hi = opaque_cols(moon, 0.0, 1.0, thresh=200)
print(f"MOON  solid disc x {lo:.3f}-{hi:.3f} of its box (rest is soft glow)")
