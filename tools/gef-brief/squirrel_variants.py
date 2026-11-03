"""Quick test: GEF-themed squirrel variants made by editing the existing
PJS pixel-art sprites (no image generation available in this session).

Method: recolour clothing pixels into the GEF brand blues/yellow by hue,
leaving the squirrel's orange fur, face and outlines alone. Hues are picked
per sprite from what that sprite's cloth actually uses.
Output: tools/gef-brief/squirrels/*.png and a contact sheet.
"""

import colorsys
import os

from PIL import Image

LIB = r"D:\GIK-INTERN\PJS_13_Asset\pjs13\pustaka\tokoh"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "squirrels")
os.makedirs(OUT, exist_ok=True)

NAVY = (0, 74, 173)      # --kv-navy
BRAND = (19, 110, 226)   # --kv-brand
SKY = (133, 197, 255)    # --kv-blue-200
YELLOW = (255, 222, 89)  # --kv-yellow


def recolour(im, ranges, target, sat_min=0.18):
    """Map pixels whose hue falls in any (lo, hi) degree range onto `target`,
    keeping each pixel's lightness so the pixel-art shading survives."""
    th, tl, ts = colorsys.rgb_to_hls(*(c / 255 for c in target))
    px = im.load()
    n = 0
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a < 20:
                continue
            h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
            deg = h * 360
            if s < sat_min or not any(lo <= deg <= hi for lo, hi in ranges):
                continue
            nl = min(1, max(0, tl + (l - 0.45) * 0.9))
            nr, ng, nb = colorsys.hls_to_rgb(th, nl, max(ts * 0.9, s))
            px[x, y] = (round(nr * 255), round(ng * 255), round(nb * 255), a)
            n += 1
    return n


VARIANTS = [
    # (source, output name, [(hue ranges, target colour)], note)
    ("tupai-pemain-kecapi.png", "gef-bard-blue-cloak", [([(75, 170)], NAVY)], "green cloak -> GEF navy"),
    ("tupai-pembawa-bendera.png", "gef-flag-bearer", [([(330, 360), (0, 8)], BRAND), ([(75, 170)], YELLOW)], "red flag -> brand blue, green tunic -> yellow"),
    ("tupai-penyihir-ungu.png", "gef-graduate", [([(230, 320)], NAVY)], "purple wizard robe and hat -> navy gown"),
    ("tupai-pemanah-tudung-hijau.png", "gef-explorer", [([(60, 170)], BRAND)], "green hood -> brand blue"),
]

made = []
for src, name, maps, note in VARIANTS:
    im = Image.open(os.path.join(LIB, src)).convert("RGBA")
    im = im.crop(im.getchannel("A").getbbox())
    changed = sum(recolour(im, ranges, tgt) for ranges, tgt in maps)
    im.save(os.path.join(OUT, name + ".png"))
    made.append((src, name, im, changed, note))
    print(f"{name:22} from {src:32} {changed:6} px recoloured  ({note})")

# Contact sheet: original above, variant below, on the GEF blue.
h = 230
cells = []
for src, name, im, _, _ in made:
    orig = Image.open(os.path.join(LIB, src)).convert("RGBA")
    orig = orig.crop(orig.getchannel("A").getbbox())
    cells.append([x.resize((round(x.width * h / x.height), h), Image.NEAREST) for x in (orig, im)])
cw = max(c.width for pair in cells for c in pair) + 20
sheet = Image.new("RGBA", (cw * len(cells), (h + 20) * 2), (14, 97, 207, 255))
for i, (o, v) in enumerate(cells):
    sheet.alpha_composite(o, (i * cw + 10, 10))
    sheet.alpha_composite(v, (i * cw + 10, h + 30))
sheet.save(os.path.join(OUT, "_sheet.png"))
print("sheet:", os.path.join(OUT, "_sheet.png"))
