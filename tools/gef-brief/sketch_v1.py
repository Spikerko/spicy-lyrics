"""Rough sketch: PJS x GEF (Perayaan Jelajah Studi) fullscreen theme.

A static mockup only, to agree on direction before the final assets arrive.
Built from the Global Edufair 2026 website's own key-visual kit
(D:\\NGODING\\gik-intern\\Global-Edu-Fair\\public\\kv\\v1), read-only, plus the
new PJS x GEF logo. Same frame and content zones as the Halloween mockup, so
the two are directly comparable (1440x810, zones from ContentBox.css).

Direction, taken from gef.gikugm.com:
  - Daylight sky (hero-sky-clouds) graded into the site's brand blues
    (--kv-grad-hero #0a4fb8 -> #1068dc), the opposite of Halloween's night.
  - The site's white diagonal "swoosh" bands in the corners.
  - The landmark collage (Big Ben, Liberty, Pisa, Colosseum, Taj Mahal...)
    as a skyline along the bottom, the GEF hero's signature image.
  - Moving pieces (for the real build): the plane crossing the sky, hot-air
    balloons drifting up, the flag bunting swaying.
  - Logo top centre (the position the user settled on for Halloween).

Checks (exit 1 on failure), same rules as the Halloween mockups:
  1. No foreground decoration overlaps a content zone (8px margin).
  2. White text readable: >= 4.5:1 at the 98th-percentile brightest pixel of
     every 48px tile in the lyrics and title areas.
"""

import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

KV = r"D:\NGODING\gik-intern\Global-Edu-Fair\public\kv\v1"
LOGO = r"C:\Users\AFFAN\Downloads\PJS X GEF (Perayaan Jelajah Study) (5).png"
OUT = os.path.dirname(os.path.abspath(__file__))
W, H = 1440, 810
MARGIN = 8
GROUND = 768

ZONES = {
    "ALBUM COVER": (141, 133, 604, 597),
    "TITLE / ARTIST / CONTROLS": (141, 605, 604, 747),
    "LYRICS": (749, 97, 1354, 745),
}

# Brand tokens from src/app/kv.css
NAVY_TOP, HERO_MID, HERO_BOT = (10, 79, 184), (14, 97, 207), (16, 104, 220)
DEEP = (4, 41, 107)
YELLOW = (255, 222, 89)


def load(path):
    im = Image.open(path).convert("RGBA")
    return im.crop(im.getchannel("A").getbbox())


def kv(rel):
    return load(os.path.join(KV, rel))


def by_h(im, h):
    return im.resize((max(1, round(im.width * h / im.height)), h), Image.LANCZOS)


def by_w(im, w):
    return im.resize((w, max(1, round(im.height * w / im.width))), Image.LANCZOS)


def shade(im, brightness=1.0, alpha=1.0):
    rgb = ImageEnhance.Brightness(im.convert("RGB")).enhance(brightness)
    out = rgb.convert("RGBA")
    out.putalpha(im.getchannel("A").point(lambda a: round(a * alpha)))
    return out


def tint(im, rgb, amount):
    """Pull an image toward a brand colour, keeping its alpha."""
    flat = Image.new("RGB", im.size, rgb)
    out = Image.blend(im.convert("RGB"), flat, amount).convert("RGBA")
    out.putalpha(im.getchannel("A"))
    return out


# ─────────────────────────────────────────────────────────────── background
bg = Image.new("RGBA", (W, H))
d = ImageDraw.Draw(bg)
for y in range(H):  # --kv-grad-hero, top to bottom
    t = y / H
    a, b = (NAVY_TOP, HERO_MID) if t < 0.58 else (HERO_MID, HERO_BOT)
    tt = t / 0.58 if t < 0.58 else (t - 0.58) / 0.42
    d.line([(0, y), (W, y)], fill=tuple(round(a[i] + (b[i] - a[i]) * tt) for i in range(3)) + (255,))

# Real sky photo, blended into the brand gradient so it reads as GEF blue.
# Kept faint: white lyrics need a deep blue behind them, and a bright
# daylight photo (v1 attempt: 1.0:1 contrast) makes white text vanish.
sky = Image.open(os.path.join(KV, "images", "hero-sky-clouds-1920.webp")).convert("RGBA").resize((W, H), Image.LANCZOS)
sky = tint(sky, HERO_MID, 0.45)
sky.putalpha(130)
bg.alpha_composite(sky)

# World map, faint, behind the lyrics: "jelajah" (explore) the world.
wmap = shade(by_w(kv("cutouts/deco-world-map-1280.webp"), 900), 1.0, 0.10)
bg.alpha_composite(wmap, (W - wmap.width - 40, 150))

# The site's white diagonal swoosh bands, top-right and bottom-left corners.
sw = Image.new("RGBA", (W, H))
sd = ImageDraw.Draw(sw)
for i, a in enumerate((70, 45, 28)):
    o = i * 34
    sd.polygon([(W - 520 + o, 0), (W - 430 + o, 0), (W, 300 - o), (W, 390 - o)], fill=(255, 255, 255, a))
    sd.polygon([(0, H - 360 + o), (0, H - 290 + o), (330 - o, H), (250 - o, H)], fill=(255, 255, 255, a))
bg.alpha_composite(sw)

# Landmarks: Prambanan (Jogja, home of GIK UGM) at the foot of the left strip,
# the world's landmarks on the far right edge past the lyric column. They
# stand on the cloud floor, as in the site's hero.
col = kv("cutouts/hero-collage-landmarks-1280.webp")
col = col.crop((0, 0, col.width, round(col.height * 0.66)))
pisa = col.crop((round(col.width * 0.58), 0, round(col.width * 0.74), col.height))   # Pisa + balloon
# Only the strip right of the lyric column (x > 1354 + margin) is free of
# text: a full-size Pisa there dropped the last lyric line to 2.9:1.
free_w = W - (ZONES["LYRICS"][2] + MARGIN)
ph = by_w(pisa, free_w + 30)
bg.alpha_composite(ph, (W - ph.width + 30, GROUND - ph.height + 30))
pram = by_h(kv("cutouts/object-prambanan-720.webp"), 250)
bg.alpha_composite(pram, (-20, GROUND - pram.height + 22))

# Cloud floor along the bottom (soft white, the site's hero base), below the
# lyric and title zones (they end at y 747).
cl = Image.new("RGBA", (W, H))
cd = ImageDraw.Draw(cl)
for cx_, r in [(80, 60), (260, 48), (430, 62), (640, 52), (860, 64), (1080, 56), (1280, 64), (1430, 54)]:
    cd.ellipse((cx_ - r * 1.8, GROUND - r * 0.45, cx_ + r * 1.8, GROUND + r), fill=(255, 255, 255, 235))
bg.alpha_composite(cl.filter(ImageFilter.GaussianBlur(8)))
d = ImageDraw.Draw(bg)
for y in range(GROUND + 10, H):
    d.line([(0, y), (W, y)], fill=(236, 245, 255, 255))

# Readability scrim, in deep brand navy (not black). v1 used one big box
# behind the whole lyric column, which turned the right half into a flat dark
# patch and hid the sky. Here it is a soft band that follows the lyric
# text's left edge and fades out toward the right screen edge, so the bright
# sky still shows above, below and to the right of the words.
scrim = Image.new("L", (W, H), 0)
s = ImageDraw.Draw(scrim)
lz = ZONES["LYRICS"]
s.rounded_rectangle((lz[0] - 30, lz[1] - 20, lz[2] + 10, lz[3] + 10), radius=80, fill=215)
tz = ZONES["TITLE / ARTIST / CONTROLS"]
s.rounded_rectangle((tz[0] - 20, tz[1] - 10, tz[2] + 20, tz[3] + 10), radius=40, fill=200)
scrim = scrim.filter(ImageFilter.GaussianBlur(55))
dark = Image.new("RGBA", (W, H), DEEP + (255,))
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


# Flag bunting across the top band (sways in the real build).
bunt = by_w(kv("cutouts/object-flags-bunting-1280.webp"), 520)
put("bunting left", bunt, -10, 0)
put("bunting right", bunt, W - bunt.width + 10, 0, flip=True)

# PJS x GEF logo, top centre, inside the band above the cover. Sized so it
# clears the lyrics zone (top 97) with the 8px margin: v1's 118px touched it.
logo = by_h(load(LOGO), 84)
put("PJS x GEF logo", logo, (W - logo.width) / 2, 3)

# Plane crossing the top band (moves left to right in the real build).
plane = by_w(kv("cutouts/hero-plane-440.webp"), 130)
put("plane", plane, 1000, 44)

# Hot-air balloons drift up the gap between cover and lyrics.
gap_l, gap_r = ZONES["ALBUM COVER"][2] + MARGIN, ZONES["LYRICS"][0] - MARGIN
balloon_src = load(os.path.join(KV, "cutouts", "hero-collage-landmarks-1280.webp"))
b1 = balloon_src.crop((960, 300, 1040, 410))   # red balloon on the right of the collage
b2 = balloon_src.crop((130, 430, 215, 530))    # left balloon
for i, (im, h, x, y) in enumerate([(b1, 70, gap_l + 30, 520), (b2, 56, gap_l + 70, 330), (b1, 42, gap_l + 20, 180)]):
    put(f"balloon {i + 1}", by_h(im, h), x, y)

# Passport-and-globe icon on the left strip, in front of Prambanan.
pas = by_w(kv("icons3d/icon3d-passport-globe-560.webp"), 112)
put("passport globe", pas, 14, GROUND - pas.height + 6)

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
report = []
TILE = 48
for zname in ("LYRICS", "TITLE / ARTIST / CONTROLS"):
    x0, y0, x1, y1 = ZONES[zname]
    worst, at = 99.0, None
    for ty in range(y0, y1, TILE):
        for tx in range(x0, x1, TILE):
            lum = rel_lum(arr[ty: min(ty + TILE, y1), tx: min(tx + TILE, x1)])
            r = 1.05 / (float(np.percentile(lum, 98)) + 0.05)
            if r < worst:
                worst, at = r, (tx, ty)
    report.append(f"{zname:26} worst-tile white-text contrast {worst:4.1f}:1 at {at}")
    if worst < 4.5:
        failures.append(f"contrast: {zname} drops to {worst:.1f}:1 at {at} (need 4.5)")

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
sdraw.rounded_rectangle(c, radius=16, fill=(6, 30, 80, 255), outline=(255, 255, 255, 70), width=2)
sdraw.text(((c[0] + c[2]) / 2, (c[1] + c[3]) / 2), "ALBUM COVER", font=bold, fill="white", anchor="mm")
t = ZONES["TITLE / ARTIST / CONTROLS"]
cx = (t[0] + t[2]) / 2
sdraw.text((cx, t[1] + 28), "Song Title", font=big, fill="white", anchor="mm")
sdraw.text((cx, t[1] + 64), "Artist Name", font=bold, fill=(255, 255, 255, 175), anchor="mm")
sdraw.rounded_rectangle((t[0] + 50, t[1] + 92, t[2] - 50, t[1] + 98), radius=3, fill=(255, 255, 255, 70))
sdraw.rounded_rectangle((t[0] + 50, t[1] + 92, t[0] + 200, t[1] + 98), radius=3, fill=YELLOW + (255,))
by_ = t[1] + 124
for sx, sign in ((cx - 70, -1), (cx + 70, 1)):
    sdraw.polygon([(sx - 9 * sign, by_ - 10), (sx - 9 * sign, by_ + 10), (sx + 7 * sign, by_)], fill="white")
    sdraw.rectangle((sx + 8 * sign - 2, by_ - 10, sx + 8 * sign + 2, by_ + 10), fill="white")
sdraw.ellipse((cx - 22, by_ - 22, cx + 22, by_ + 22), fill="white")
sdraw.rectangle((cx - 8, by_ - 9, cx - 3, by_ + 9), fill=DEEP + (255,))
sdraw.rectangle((cx + 3, by_ - 9, cx + 8, by_ + 9), fill=DEEP + (255,))

lines = [("Young vision, global mission", 90), ("every road leads somewhere new", 255),
         ("from Jogja to the world", 120), ("pack your dreams and go", 90), ("the map is yours to draw", 70)]
tl_layer = Image.new("RGBA", (W, H))
tl = ImageDraw.Draw(tl_layer)
for i, (txt, a) in enumerate(lines):
    tl.text((lz[0] + 16, lz[1] + 70 + i * 118), txt, font=lyr, fill=(255, 255, 255, a))
shown.alpha_composite(tl_layer)

shown.convert("RGB").save(os.path.join(OUT, "sketch_v1.png"))
z = shown.copy()
zd = ImageDraw.Draw(z, "RGBA")
for zname, box in ZONES.items():
    zd.rectangle(box, outline=(0, 255, 120, 255), width=2)
for name, box in placed:
    zd.rectangle(box, outline=(255, 160, 0, 220), width=1)
z.convert("RGB").save(os.path.join(OUT, "sketch_v1_zones.png"))

print(f"{len(placed)} foreground decorations")
print("\n".join(report))
if failures:
    print("FAILURES:")
    print("\n".join("  " + f for f in failures))
    sys.exit(1)
print("0 foreground overlaps, contrast OK")
