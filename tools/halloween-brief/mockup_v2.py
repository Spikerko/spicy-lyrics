"""Revised Halloween fullscreen mockup (v2).

Two layers, which is the main change from v1:

  BACKGROUND  a single coherent night scene drawn behind all content: sky,
              moon, cloud banks, haunted house, graves, tree, and one ground
              plane that everything stands on. It may sit behind the lyrics
              (the lyrics are transparent text) but is dimmed there.
  FOREGROUND  a few small decorations in front of content, restricted to the
              free space: logo/bats/web in the top band, characters and music
              notes in the side strip and the centre gap.

Checks (script exits 1 on failure):
  1. No foreground decoration overlaps a content zone (8px margin).
  2. White text stays readable: the background behind the lyrics and the
     title area must give at least 4.5:1 contrast for white text (WCAG AA) at
     the 98th-percentile brightest pixel.

Content zones are estimates at 1440x810 from ContentBox.css proportions and
must be re-measured live in Spotify before implementation.
"""

import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

LIB = r"D:\GIK-INTERN\PJS_13_Asset\pjs13\pustaka"
OUT = r"D:\NGODING\spicy-lyrics\tools\halloween-brief"
W, H = 1440, 810
MARGIN = 8
GROUND = 768  # y where feet, roots and foundations meet the grass

ZONES = {
    "ALBUM COVER": (141, 133, 604, 597),
    "TITLE / ARTIST / CONTROLS": (141, 605, 604, 747),
    "LYRICS": (749, 97, 1354, 745),
}


def load(rel):
    im = Image.open(os.path.join(LIB, rel)).convert("RGBA")
    return im.crop(im.getchannel("A").getbbox())


def by_h(im, h):
    return im.resize((max(1, round(im.width * h / im.height)), h), Image.LANCZOS)


def by_w(im, w):
    return im.resize((w, max(1, round(im.height * w / im.width))), Image.LANCZOS)


def shade(im, brightness=1.0, alpha=1.0):
    """Atmospheric depth: distant layers are darker and slightly faded."""
    rgb = ImageEnhance.Brightness(im.convert("RGB")).enhance(brightness)
    out = rgb.convert("RGBA")
    out.putalpha(im.getchannel("A").point(lambda a: round(a * alpha)))
    return out


# ─────────────────────────────────────────────────────────────── background
bg = Image.new("RGBA", (W, H))
d = ImageDraw.Draw(bg)

# Sky: deep night at the top, warmer purple near the horizon.
top, bot = (26, 14, 46), (86, 40, 92)
for y in range(H):
    t = min(1, y / GROUND)
    d.line([(0, y), (W, y)], fill=tuple(round(top[i] + (bot[i] - top[i]) * t) for i in range(3)) + (255,))

# Moon, upper right, with a soft glow. Behind the lyrics, so it is dimmed by
# the scrim later; placed high so the brightest part sits above the text.
moon = by_h(load("adegan/bulan.png"), 230)
mx, my = 1100, 20
glow = Image.new("RGBA", (W, H))
ImageDraw.Draw(glow).ellipse([mx - 70, my - 70, mx + moon.width + 70, my + moon.height + 70], fill=(255, 210, 120, 46))
bg.alpha_composite(glow.filter(ImageFilter.GaussianBlur(40)))
# Dimmer than the source art: lyrics scroll, so every line passes over it.
bg.alpha_composite(shade(moon, 0.62), (mx, my))

# Cloud banks: the layered purple clouds become a misty horizon behind the
# buildings. Tiled with alternating mirrors so the straight cut edge never shows.
cloud = shade(by_h(load("adegan/awan-ungu-berlapis.png"), 420), 0.62, 0.9)
x, flip = -60, False
while x < W:
    tile = cloud.transpose(Image.FLIP_LEFT_RIGHT) if flip else cloud
    bg.alpha_composite(tile, (x, GROUND - 400))
    x += cloud.width - 2
    flip = not flip

# Haunted house: far right, standing on the ground, half behind the lyrics.
house = shade(by_h(load("adegan/rumah-hantu.png"), 440), 1.0)
bg.alpha_composite(house, (W - house.width + 40, GROUND - house.height + 6))

# Graves stand just in front of the haunted house, as a dark silhouette like
# the house itself. The lyric column spans nearly the whole right half, so the
# white skull and bones cannot sit anywhere under it at full brightness: two
# earlier placements failed the contrast check (3.2:1 and 3.6:1).
graves = shade(by_h(load("adegan/kuburan.png"), 78), 0.38)
bg.alpha_composite(graves, (W - house.width - graves.width + 70, GROUND - graves.height + 4))

# Tree on the far left: its trunk roots into the ground, its canopy sits behind
# the album cover and frames it.
tree = shade(by_h(load("adegan/pohon-rindang.png"), 600), 0.8)
bg.alpha_composite(tree, (-120, GROUND - tree.height + 10))

# One ground plane for the whole scene: dark earth with a grass and bush strip
# on top. Replaces v1's fence and grey road, which nothing was standing on.
d = ImageDraw.Draw(bg)
for y in range(GROUND, H):
    t = (y - GROUND) / (H - GROUND)
    c = (round(34 - 14 * t), round(24 - 10 * t), round(40 - 16 * t))
    d.line([(0, y), (W, y)], fill=c + (255,))
grass = by_h(load("adegan/rumput-semak-berbunga.png"), 44)
x = -20
while x < W:
    bg.alpha_composite(grass, (x, GROUND - 28))
    x += grass.width - 30

# Readability scrim: a soft dark wash behind the lyric column and the title
# area, so scenery shows through without fighting white text.
scrim = Image.new("L", (W, H), 0)
sd = ImageDraw.Draw(scrim)
lz = ZONES["LYRICS"]
sd.rounded_rectangle((lz[0] - 30, lz[1] - 40, lz[2] + 30, lz[3] + 20), radius=60, fill=150)
tz = ZONES["TITLE / ARTIST / CONTROLS"]
sd.rounded_rectangle((tz[0] - 20, tz[1] - 10, tz[2] + 20, tz[3] + 10), radius=40, fill=110)
scrim = scrim.filter(ImageFilter.GaussianBlur(45))
dark = Image.new("RGBA", (W, H), (12, 6, 22, 255))
dark.putalpha(scrim)
bg.alpha_composite(dark)

# ─────────────────────────────────────────────────────────────── foreground
fg = Image.new("RGBA", (W, H))
placed = []


def put(name, im, x, y, flip=False):
    if flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    fg.alpha_composite(im, (round(x), round(y)))
    placed.append((name, (x, y, x + im.width, y + im.height)))


web = by_w(load("hiasan/jaring-hitam.png"), 190)
put("web", web, 0, 0)

branch = by_h(load("hiasan/cabang-labu.png"), 88)
put("pumpkin branch", branch, W - branch.width, 0)

logo = by_h(load("logo/logo-spooky.png"), 84)
put("spooky logo", logo, (W - logo.width) / 2, 3)

for i, (bx, by, s, v) in enumerate([(300, 34, 36, 1), (372, 14, 26, 2), (940, 22, 34, 3), (1010, 50, 24, 4)]):
    put(f"bat {i + 1}", by_h(load(f"hiasan/kelelawar-oranye-{v}.png"), s), bx, by)

# Witch on the left strip, in front of the tree trunk, staff raised.
witch = by_w(load("tokoh/penyihir.png"), 128)
put("witch", witch, 2, GROUND + 4 - witch.height)

# Lute player in the centre gap between cover and lyrics. The music rises from
# him up the gap: notes drift upward, shrinking and fading.
gap_l, gap_r = ZONES["TITLE / ARTIST / CONTROLS"][2] + MARGIN, ZONES["LYRICS"][0] - MARGIN
lute = by_w(load("tokoh/tupai-pemain-kecapi.png"), gap_r - gap_l - 6)
lx = gap_l + 3
put("lute player", lute, lx, GROUND + 4 - lute.height)

notes = [  # (file, height, x, y, rotate, opacity)
    ("not-musik-oranye.png", 58, gap_l + 58, 532, -10, 1.00),
    ("not-musik-coklat.png", 50, gap_l + 8, 446, 8, 0.95),
    ("not-musik-oranye.png", 46, gap_l + 62, 362, -14, 0.90),
    ("not-musik-coklat.png", 40, gap_l + 14, 286, 10, 0.80),
    ("not-musik-oranye.png", 34, gap_l + 56, 216, -6, 0.65),
    ("not-musik-oranye.png", 28, gap_l + 22, 156, 12, 0.50),
]
for i, (f, h, nx, ny, rot, op) in enumerate(notes):
    n = by_h(load(f"hiasan/{f}"), h).rotate(rot, expand=True, resample=Image.BICUBIC)
    # The brown note is near-invisible on purple; lift it toward its orange twin.
    put(f"note {i + 1}", shade(n, 1.9 if "coklat" in f else 1.1, op), nx, ny)

# ─────────────────────────────────────────────────────────────── checks
failures = []


def grow(b, m):
    return (b[0] - m, b[1] - m, b[2] + m, b[3] + m)


def hits(a, b):
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


for name, box in placed:
    for zname, z in ZONES.items():
        if hits(box, grow(z, MARGIN)):
            failures.append(f"overlap: {name} touches {zname} {tuple(round(v) for v in box)}")


def rel_lum(rgb):
    c = rgb / 255.0
    c = np.where(c <= 0.03928, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]


scene = Image.alpha_composite(bg, fg)
arr = np.asarray(scene.convert("RGB")).astype(np.float64)
contrast_report = []
# Checked per 48px tile, not per zone: lyrics scroll, so any line can land on
# the brightest patch. A zone-wide percentile hid the moon in the first draft.
TILE = 48
for zname in ("LYRICS", "TITLE / ARTIST / CONTROLS"):
    x0, y0, x1, y1 = ZONES[zname]
    worst, worst_at = 99.0, None
    for ty in range(y0, y1, TILE):
        for tx in range(x0, x1, TILE):
            lum = rel_lum(arr[ty : min(ty + TILE, y1), tx : min(tx + TILE, x1)])
            ratio = 1.05 / (float(np.percentile(lum, 98)) + 0.05)
            if ratio < worst:
                worst, worst_at = ratio, (tx, ty)
    contrast_report.append(
        f"{zname:26} worst-tile white-text contrast {worst:4.1f}:1 at {worst_at}"
    )
    if worst < 4.5:
        failures.append(f"contrast: {zname} drops to {worst:.1f}:1 at {worst_at} (need 4.5)")

# ─────────────────────────────────────────────────────────────── render
shown = scene.copy()
sdraw = ImageDraw.Draw(shown, "RGBA")
try:
    bold = ImageFont.truetype("arialbd.ttf", 22)
    big = ImageFont.truetype("arialbd.ttf", 34)
    lyr = ImageFont.truetype("arialbd.ttf", 36)
except OSError:
    bold = big = lyr = ImageFont.load_default()

c = ZONES["ALBUM COVER"]
sdraw.rounded_rectangle(c, radius=16, fill=(18, 12, 28, 255), outline=(255, 255, 255, 60), width=2)
sdraw.text(((c[0] + c[2]) / 2, (c[1] + c[3]) / 2), "ALBUM COVER", font=bold, fill="white", anchor="mm")

t = ZONES["TITLE / ARTIST / CONTROLS"]
cx = (t[0] + t[2]) / 2
sdraw.text((cx, t[1] + 28), "Song Title", font=big, fill="white", anchor="mm")
sdraw.text((cx, t[1] + 64), "Artist Name", font=bold, fill=(255, 255, 255, 175), anchor="mm")
sdraw.rounded_rectangle((t[0] + 50, t[1] + 92, t[2] - 50, t[1] + 98), radius=3, fill=(255, 255, 255, 70))
sdraw.rounded_rectangle((t[0] + 50, t[1] + 92, t[0] + 200, t[1] + 98), radius=3, fill=(255, 255, 255, 255))
# Controls drawn as shapes; the mockup font has no media glyphs.
by_ = t[1] + 124
for sx, sign in ((cx - 70, -1), (cx + 70, 1)):
    tri = [(sx - 9 * sign, by_ - 10), (sx - 9 * sign, by_ + 10), (sx + 7 * sign, by_)]
    sdraw.polygon(tri, fill="white")
    sdraw.rectangle((sx + 8 * sign - 2, by_ - 10, sx + 8 * sign + 2, by_ + 10), fill="white")
sdraw.ellipse((cx - 22, by_ - 22, cx + 22, by_ + 22), fill="white")
sdraw.rectangle((cx - 8, by_ - 9, cx - 3, by_ + 9), fill=(18, 12, 28, 255))
sdraw.rectangle((cx + 3, by_ - 9, cx + 8, by_ + 9), fill=(18, 12, 28, 255))

lines = [
    ("I can hear it in the dark", 90),
    ("a melody that pulls me close", 255),
    ("under a pale October moon", 120),
    ("we dance until the morning comes", 90),
    ("and every shadow sings along", 70),
]
# Text goes on its own layer so per-line opacity actually blends.
text_layer = Image.new("RGBA", (W, H))
tl = ImageDraw.Draw(text_layer)
for i, (txt, a) in enumerate(lines):
    tl.text((lz[0] + 16, lz[1] + 70 + i * 118), txt, font=lyr, fill=(255, 255, 255, a))
shown.alpha_composite(text_layer)

shown.convert("RGB").save(os.path.join(OUT, "mockup_v2.png"))

z = shown.copy()
zd = ImageDraw.Draw(z, "RGBA")
for zname, box in ZONES.items():
    zd.rectangle(box, outline=(0, 255, 120, 255), width=2)
for name, box in placed:
    zd.rectangle(box, outline=(255, 160, 0, 200), width=1)
z.convert("RGB").save(os.path.join(OUT, "mockup_v2_zones.png"))
bg.convert("RGB").save(os.path.join(OUT, "mockup_v2_background_only.png"))

print(f"{len(placed)} foreground decorations, background has 8 layers")
print("\n".join(contrast_report))
if failures:
    print("FAILURES:")
    print("\n".join("  " + f for f in failures))
    sys.exit(1)
print("0 foreground overlaps, contrast OK")
