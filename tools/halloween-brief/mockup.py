"""Mockup for the Halloween fullscreen brief.

Places PJS #13 assets ONLY in the free space around Spicy Lyrics' content and
asserts that no decoration's bounding box touches a content zone.

Content zones are estimates at 1440x810 from ContentBox.css proportions; they
must be re-measured live in Spotify before implementation.
"""

import os
import sys

from PIL import Image, ImageDraw, ImageFont

LIB = r"D:\GIK-INTERN\PJS_13_Asset\pjs13\pustaka"
OUT = r"D:\NGODING\spicy-lyrics\tools\halloween-brief"
W, H = 1440, 810
MARGIN = 8

ZONES = {
    "ALBUM COVER": (141, 133, 604, 597),
    "TITLE / ARTIST / CONTROLS": (141, 605, 604, 747),
    "LYRICS": (749, 97, 1354, 745),
}


def grow(box, m):
    return (box[0] - m, box[1] - m, box[2] + m, box[3] + m)


def hits(a, b):
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


def load(rel):
    return Image.open(os.path.join(LIB, rel)).convert("RGBA")


def fit(im, max_w, max_h):
    s = min(max_w / im.width, max_h / im.height)
    return im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)


canvas = Image.new("RGBA", (W, H))
d = ImageDraw.Draw(canvas)

# Night sky, PJS purple. The exact sky colour lives in the event site's CSS
# (.next-pjs-sky), which is not in the asset folder; this is an approximation.
top, bot = (34, 20, 58), (92, 44, 96)
for y in range(H):
    t = y / H
    d.line([(0, y), (W, y)], fill=tuple(round(top[i] + (bot[i] - top[i]) * t) for i in range(3)) + (255,))

placed = []  # (name, box)


def put(name, im, x, y, flip=False):
    if flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    canvas.alpha_composite(im, (round(x), round(y)))
    placed.append((name, (x, y, x + im.width, y + im.height)))


# ── top band (y < 89) ──
web = fit(load("hiasan/jaring-hitam.png"), 196, 125)
put("web top-left", web, 0, 0)

branch = fit(load("hiasan/cabang-labu.png"), 400, 89)
put("pumpkin branch top-right", branch, W - branch.width, 0)

logo = fit(load("logo/logo-spooky.png"), 200, 84)
put("spooky logo", logo, (W - logo.width) / 2, 4)

for i, (bx, by, size, var) in enumerate(
    [(300, 30, 40, 1), (380, 12, 30, 2), (930, 26, 38, 3), (1010, 48, 28, 4), (1100, 16, 34, 5)]
):
    bat = fit(load(f"hiasan/kelelawar-oranye-{var}.png"), size, size)
    put(f"bat {i + 1}", bat, bx, by)

# ── centre gutter between cover and lyrics (x 612-741) ──
moon = fit(load("adegan/bulan.png"), 120, 120)
glow = Image.new("RGBA", (W, H))
ImageDraw.Draw(glow).ellipse([616, 112, 736, 232], fill=(255, 220, 120, 40))
canvas.alpha_composite(glow)
put("moon", moon, 676 - moon.width / 2, 112)

hands = fit(load("adegan/tangan-zombie-tengah.png"), 110, 120)
put("zombie hand", hands, 676 - hands.width / 2, 755 - hands.height)

# ── bottom band (y > 755): fence + road ──
fence = fit(load("adegan/pagar.png"), 4000, 30)
x = 0
while x < W:
    canvas.alpha_composite(fence, (x, 758))
    x += fence.width
placed.append(("fence", (0, 758, W, 788)))
d.rectangle([0, 788, W, H], fill="#4a4550")
placed.append(("road", (0, 788, W, H)))

# ── side strips: characters standing on the ground ──
dukun = fit(load("tokoh/dukun.png"), 133 - MARGIN, 160)
put("dukun (left)", dukun, 0, 760 - dukun.height)

mumi = fit(load("tokoh/mumi.png"), 78 - MARGIN, 160)
put("mumi (right)", mumi, W - mumi.width, 760 - mumi.height, flip=True)

# ── verify: nothing may touch a content zone ──
failures = []
for name, box in placed:
    for zname, z in ZONES.items():
        if hits(box, grow(z, MARGIN)):
            failures.append(f"{name} overlaps {zname}: {tuple(round(v) for v in box)}")

# ── draw content placeholders on top, to show they stay clear ──
shown = canvas.copy()
sd = ImageDraw.Draw(shown, "RGBA")
try:
    font = ImageFont.truetype("arialbd.ttf", 22)
    small = ImageFont.truetype("arial.ttf", 30)
except OSError:
    font = small = ImageFont.load_default()

c = ZONES["ALBUM COVER"]
sd.rounded_rectangle(c, radius=14, fill=(20, 14, 30, 235), outline=(255, 255, 255, 90), width=2)
sd.text(((c[0] + c[2]) / 2, (c[1] + c[3]) / 2), "ALBUM COVER", font=font, fill="white", anchor="mm")

t = ZONES["TITLE / ARTIST / CONTROLS"]
sd.text(((t[0] + t[2]) / 2, t[1] + 30), "Song Title", font=small, fill="white", anchor="mm")
sd.text(((t[0] + t[2]) / 2, t[1] + 66), "Artist", font=font, fill=(255, 255, 255, 170), anchor="mm")
sd.rounded_rectangle((t[0] + 40, t[1] + 92, t[2] - 40, t[1] + 98), radius=3, fill=(255, 255, 255, 120))
sd.text(((t[0] + t[2]) / 2, t[1] + 122), "|<     ||     >|", font=font, fill="white", anchor="mm")

lz = ZONES["LYRICS"]
for i, line in enumerate(
    ["Lyrics line one is singing", "the active line is bright", "next line waiting here", "and another line below", "still clear of every ghost"]
):
    sd.text((lz[0] + 10, lz[1] + 80 + i * 110), line, font=small, fill=(255, 255, 255, 255 if i == 1 else 110))

shown.convert("RGB").save(os.path.join(OUT, "mockup.png"))

zd = ImageDraw.Draw(shown, "RGBA")
for zname, z in ZONES.items():
    zd.rectangle(z, outline=(0, 255, 120, 255), width=2)
shown.convert("RGB").save(os.path.join(OUT, "mockup_zones.png"))

print(f"{len(placed)} decorations placed")
if failures:
    print("OVERLAPS:")
    print("\n".join("  " + f for f in failures))
    sys.exit(1)
print("0 overlaps with any content zone (8px margin)")
