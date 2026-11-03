"""Row-by-row horizontal extent of the tree artwork, plus the colour of the
grass tile's soil strip, for positioning the tree and blending the earth."""

import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "source")

tree = Image.open(os.path.join(SRC, "adegan__pohon-rindang.png")).convert("RGBA")
tree = tree.crop(tree.getchannel("A").getbbox())
a = tree.getchannel("A").load()
w, h = tree.size
print(f"TREE {w}x{h}")
for f in [i / 20 for i in range(6, 20)]:
    y = int(h * f)
    cols = [x for x in range(w) if a[x, y] > 128]
    if cols:
        print(f"  row {f:.2f}: x {min(cols) / w:.3f}-{max(cols) / w:.3f}")

# Rightmost / leftmost opaque column over a band of rows.
def band(f0, f1):
    xs = [x for y in range(int(h * f0), int(h * f1)) for x in range(w) if a[x, y] > 128]
    return min(xs) / w, max(xs) / w

for f0 in (0.50, 0.55, 0.60, 0.65):
    lo, hi = band(f0, 1.0)
    print(f"  rows {f0:.2f}-1.00 span x {lo:.3f}-{hi:.3f}")

grass = Image.open(os.path.join(SRC, "adegan__rumput-semak-berbunga.png")).convert("RGBA")
grass = grass.crop(grass.getchannel("A").getbbox())
gw, gh = grass.size
px = grass.load()
for f in (0.80, 0.86, 0.92, 0.97):
    y = int(gh * f)
    row = [px[x, y] for x in range(int(gw * 0.1), int(gw * 0.9)) if px[x, y][3] > 200]
    if row:
        r = sorted(p[0] for p in row)[len(row) // 2]
        g = sorted(p[1] for p in row)[len(row) // 2]
        b = sorted(p[2] for p in row)[len(row) // 2]
        print(f"GRASS row {f:.2f}: median #{r:02x}{g:02x}{b:02x}  opaque {len(row) / (gw * 0.8):.0%}")
