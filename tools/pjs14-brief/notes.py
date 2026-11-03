"""Music notes for the PJS 14 theme, recoloured from the Halloween notes.

The PJS 13 notes (orange / brown pixel-art quavers) are re-tinted into the
PJS 14 palette by luminance: each pixel keeps its light/dark value (so the
pixel shading and the dark outline survive), and its colour is mapped onto
a two-stop ramp from the kit (shadow -> highlight). Variants:
  white  white with sky-blue shading (reads on any of the blue backgrounds)
  yellow the kit's yellow accent (#ffd400, the title outlines / panel 05)
  sky    light brand blue (#85c5ff -> white), a quieter companion
Writes PNGs to tools/pjs14-brief/notes/ plus a preview on the theme blue,
and reports each note's contrast against the theme's blue so a note never
disappears into the background.
"""

import os

import numpy as np
from PIL import Image, ImageDraw

LIB = r"D:\GIK-INTERN\PJS_13_Asset\pjs13\pustaka\hiasan"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "notes")
os.makedirs(OUT, exist_ok=True)

# (dark stop, light stop) per variant, from asset_pjs_14 / the GEF kit
RAMPS = {
    "white": ((40, 92, 190), (255, 255, 255)),
    "yellow": ((150, 90, 0), (255, 226, 60)),
    "sky": ((24, 86, 186), (190, 228, 255)),
}
BG = (14, 97, 207)  # theme blue behind the notes


def recolour(src, ramp):
    im = Image.open(os.path.join(LIB, src)).convert("RGBA")
    im = im.crop(im.getchannel("A").getbbox())
    a = np.asarray(im).astype(np.float64)
    lum = (0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]) / 255
    # Stretch the source's own range to 0..1 so the brown note (darker) and
    # the orange one end up equally bright in the new colour.
    vis = a[..., 3] > 30
    lo, hi = np.percentile(lum[vis], 3), np.percentile(lum[vis], 97)
    t = np.clip((lum - lo) / max(hi - lo, 1e-6), 0, 1)
    dark, light = (np.array(c, dtype=np.float64) for c in ramp)
    rgb = dark + (light - dark) * t[..., None]
    # Keep the near-black outline black-ish navy so the sticker edge reads.
    outline = lum < lo + 0.04
    rgb[outline] = (6, 30, 80)
    out = np.dstack([rgb, a[..., 3]]).round().clip(0, 255).astype(np.uint8)
    return sticker(Image.fromarray(out, "RGBA"))


def sticker(im, navy=6, white=10):
    """Give the note the same edge as the PJS 14 squirrels: a dark navy line
    then a white sticker border (sizes in source pixels, notes are ~260px)."""
    from PIL import ImageFilter
    pad = navy + white + 2
    base = Image.new("RGBA", (im.width + pad * 2, im.height + pad * 2))
    base.alpha_composite(im, (pad, pad))
    a = base.getchannel("A").point(lambda v: 255 if v > 40 else 0)
    inner = a.filter(ImageFilter.MaxFilter(navy * 2 + 1))
    outer = inner.filter(ImageFilter.MaxFilter(white * 2 + 1))
    out = Image.new("RGBA", base.size)
    out.paste((255, 255, 255, 255), mask=outer)
    out.paste((6, 30, 80, 255), mask=inner)
    out.alpha_composite(base)
    return out


def rel_lum(c):
    c = np.asarray(c, dtype=np.float64) / 255
    c = np.where(c <= 0.03928, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]


made = []
for src in ("not-musik-oranye.png", "not-musik-coklat.png"):
    for name, ramp in RAMPS.items():
        im = recolour(src, ramp)
        fn = f"note-{'a' if 'oranye' in src else 'b'}-{name}.png"
        im.save(os.path.join(OUT, fn))
        a = np.asarray(im).astype(np.float64)
        body = a[..., 3] > 200
        med = np.median(a[body][:, :3], axis=0)
        l1, l2 = rel_lum(med), rel_lum(BG)
        ratio = (max(l1, l2) + 0.05) / (min(l1, l2) + 0.05)
        made.append((fn, im, ratio))
        print(f"{fn:22} body colour {tuple(int(v) for v in med)}  vs theme blue {ratio:4.1f}:1")

# Preview: original notes on top row, recolours below, on the theme blue.
h = 110
cells = []
for src in ("not-musik-oranye.png", "not-musik-coklat.png"):
    o = Image.open(os.path.join(LIB, src)).convert("RGBA")
    cells.append(o.crop(o.getchannel("A").getbbox()))
cells += [m[1] for m in made]
cells = [c.resize((round(c.width * h / c.height), h), Image.NEAREST) for c in cells]
sheet = Image.new("RGBA", (sum(c.width + 24 for c in cells) + 24, h + 40), BG + (255,))
d = ImageDraw.Draw(sheet)
x = 24
labels = ["orig A", "orig B"] + [m[0][5:-4] for m in made]
for c, lab in zip(cells, labels):
    sheet.alpha_composite(c, (x, 8))
    d.text((x, h + 16), lab, fill="white")
    x += c.width + 24
sheet.convert("RGB").save(os.path.join(OUT, "_preview.png"))
print("preview:", os.path.join(OUT, "_preview.png"))
