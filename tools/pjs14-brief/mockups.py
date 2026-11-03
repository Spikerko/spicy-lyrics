"""PJS #14 (PJS x GEF / GIK Education Festival) fullscreen mockups, 3 options.

All art comes from D:\\GIK-INTERN\\asset_pjs_14 (read-only). Same 1440x810
frame and content zones as the Halloween mockups, so options are comparable
and every one is held to the same two checks (exit 1 if any option fails):
  1. No foreground decoration overlaps a content zone (8px margin).
  2. White text readable: >= 4.5:1 at the 98th-percentile brightest pixel of
     every 48px tile of the lyrics and title zones.

Which assets go together (the "harmony" decision):
  - The kit has two visual families. (a) Flat brand blue: gradasi_biru,
    panel_kartu, tombol_pill_biru, swoosh_dan_kurva, kompas, the yellow-edged
    titles and the GIK Education Festival wordmark. (b) Photographic: the
    blue-graded skyline photos (Singapore, Sydney...) and the globe/flags
    illustration. The pixel squirrels sit between them: pixel art with a
    white sticker outline, warm orange that pops on any blue.
  - So every option uses ONE photo at most, graded to the brand blue, and
    takes its shapes from family (a). Yellow (#ffd400-ish, from panel_kartu
    05 and the titles) is the only accent, used sparingly.
  - Squirrels: one pair of the uniform squirrels (boy + girl variants exist
    for each pose), since a mix of poses reads as busy.

Options:
  A "Skyline"   Singapore skyline photo (langit_skyline_05) as the scene,
                squirrels waving on the left, PJS logo top centre.
  B "Festival"  Flat brand-blue panels and swooshes, no photo; GIK Education
                Festival wordmark as the hero, snack-holding squirrels.
  C "Globe"     Bright sky + globe with landmarks and flags rising from the
                bottom left, compass, karaoke squirrels (music theme).
"""

import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

A = r"D:\GIK-INTERN\asset_pjs_14"
OUT = os.path.dirname(os.path.abspath(__file__))
W, H = 1440, 810
MARGIN = 8
ZONES = {
    "ALBUM COVER": (141, 133, 604, 597),
    "TITLE / ARTIST / CONTROLS": (141, 605, 604, 747),
    "LYRICS": (749, 97, 1354, 745),
}
DEEP = (4, 35, 95)
YELLOW = (255, 212, 0)

_cache = {}


def load(rel):
    if rel not in _cache:
        im = Image.open(os.path.join(A, rel)).convert("RGBA")
        bb = im.getchannel("A").getbbox()
        _cache[rel] = im.crop(bb) if bb else im
    return _cache[rel].copy()


def by_h(im, h, pixel=False):
    return im.resize((max(1, round(im.width * h / im.height)), h), Image.NEAREST if pixel else Image.LANCZOS)


def by_w(im, w, pixel=False):
    return im.resize((w, max(1, round(im.height * w / im.width))), Image.NEAREST if pixel else Image.LANCZOS)


def cover(im, w, h, anchor_y=0.5):
    s = max(w / im.width, h / im.height)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    x0 = (im.width - w) // 2
    y0 = round((im.height - h) * anchor_y)
    return im.crop((x0, y0, x0 + w, y0 + h))


def shade(im, b=1.0, alpha=1.0):
    out = ImageEnhance.Brightness(im.convert("RGB")).enhance(b).convert("RGBA")
    out.putalpha(im.getchannel("A").point(lambda v: round(v * alpha)))
    return out


def squirrel(n, half=None):
    """Pixel squirrel sprite n (1-10). Sprites 02/03 hold two squirrels side
    by side; half='L'/'R' picks one of them."""
    names = {i: f for i, f in enumerate(sorted(os.listdir(os.path.join(A, "karakter", "tupai_pixel"))), 1)}
    im = Image.open(os.path.join(A, "karakter", "tupai_pixel", names[n])).convert("RGBA")
    if half == "L":
        im = im.crop((0, 0, 920, im.height))
    elif half == "R":
        im = im.crop((960, 0, im.width, im.height))
    return im.crop(im.getchannel("A").getbbox())


def scrim(bg, strength=200, blur=50):
    m = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(m)
    lz, tz = ZONES["LYRICS"], ZONES["TITLE / ARTIST / CONTROLS"]
    d.rounded_rectangle((lz[0] - 30, lz[1] - 20, lz[2] + 20, lz[3] + 10), radius=80, fill=strength)
    d.rounded_rectangle((tz[0] - 20, tz[1] - 10, tz[2] + 20, tz[3] + 10), radius=40, fill=strength)
    m = m.filter(ImageFilter.GaussianBlur(blur))
    dark = Image.new("RGBA", (W, H), DEEP + (255,))
    dark.putalpha(m)
    bg.alpha_composite(dark)


class Scene:
    def __init__(self, name, bg):
        self.name, self.bg = name, bg
        self.fg = Image.new("RGBA", (W, H))
        self.placed = []

    def put(self, label, im, x, y, flip=False):
        if flip:
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        self.fg.alpha_composite(im, (round(x), round(y)))
        self.placed.append((label, (x, y, x + im.width, y + im.height)))


# ═══════════════════════════════════════════════════════════ option A
def option_a():
    bg = Image.new("RGBA", (W, H), (30, 110, 220, 255))
    sky = cover(load(r"background\langit_skyline\langit_skyline_05_69c3277307.png"), W, H, anchor_y=0.55)
    bg.alpha_composite(sky)
    # Darken the top so the logo and bats band reads, keep the skyline bright.
    top = Image.new("L", (W, H), 0)
    td = ImageDraw.Draw(top)
    for y in range(H):
        td.line([(0, y), (W, y)], fill=round(150 * max(0, 1 - y / 360)))
    veil = Image.new("RGBA", (W, H), DEEP + (255,))
    veil.putalpha(top)
    bg.alpha_composite(veil)
    scrim(bg, 205)
    s = Scene("A_skyline", bg)

    logo = by_h(load(r"logo\pjs_perayaan_jelajah_studi\pjs_perayaan_jelajah_studi_07_0e16274837.png"), 80)
    s.put("PJS logo", logo, (W - logo.width) / 2, 5)
    # Compass top-left, pill accents top-right (flat family, sparing).
    s.put("compass", by_h(load(r"hiasan\kompas\kompas_02_543c28674b.png"), 70), 30, 12)
    pill = by_w(load(r"hiasan\tombol_pill_biru\tombol_pill_biru_01_b3927324b4.png"), 150)
    s.put("pill", pill, W - pill.width - 40, 30)
    # Squirrels: the left strip is only 133px wide (cover starts at x 141),
    # so the boy fits there; the girl stands in the cover/lyrics gap.
    sq1 = by_w(squirrel(9), 124, pixel=True)
    s.put("squirrel waving (boy)", sq1, 4, H - sq1.height - 2)
    gap_l = ZONES["ALBUM COVER"][2] + MARGIN + 2
    sq2 = by_w(squirrel(10), ZONES["LYRICS"][0] - MARGIN - gap_l - 4, pixel=True)
    s.put("squirrel waving (girl)", sq2, gap_l, H - sq2.height - 2)
    return s


# ═══════════════════════════════════════════════════════════ option B
def option_b():
    bg = Image.new("RGBA", (W, H))
    g = cover(load(r"background\gradasi_biru\gradasi_biru_01_5f9b295eb9.png"), W, H)
    bg.alpha_composite(Image.new("RGBA", (W, H), (18, 104, 222, 255)))
    bg.alpha_composite(g)
    # Swoosh curves bottom-right and top-left, the festival's motion lines.
    sw = by_h(load(r"hiasan\swoosh_dan_kurva\swoosh_dan_kurva_02_e873711616.png"), 520)
    bg.alpha_composite(shade(sw, 1.0, 0.85), (W - sw.width + 60, H - sw.height + 40))
    sw2 = by_h(load(r"hiasan\swoosh_dan_kurva\swoosh_dan_kurva_03_11a756cd04.png"), 420).transpose(Image.ROTATE_180)
    bg.alpha_composite(shade(sw2, 1.0, 0.6), (-80, -60))
    # Faint panel shapes behind the cover: the kit's stacked-card look.
    p = by_w(load(r"hiasan\panel_kartu\panel_kartu_02_3f0ac12687.png"), 560)
    bg.alpha_composite(shade(p, 1.05, 0.55), (100, 110))
    scrim(bg, 200)
    s = Scene("B_festival", bg)

    word = by_h(load(r"logo\gik_education_festival\gik_education_festival_02_0bb375f749.png"), 66)
    s.put("GIK Education Festival", word, (W - word.width) / 2, 10)
    pjs = by_h(load(r"logo\pjs_perayaan_jelajah_studi\pjs_perayaan_jelajah_studi_07_0e16274837.png"), 80)
    s.put("PJS logo", pjs, 26, 8)
    gef = by_h(load(r"logo\global_edufair\Logo_GEF.png"), 64)
    s.put("GEF logo", gef, W - gef.width - 26, 16)
    # Snack squirrels: onigiri (girl, 07) left strip, takoyaki (boy, 08) in the gap.
    sq1 = by_w(squirrel(7), 124, pixel=True)
    s.put("squirrel onigiri", sq1, 4, H - sq1.height - 4)
    gap_l = ZONES["ALBUM COVER"][2] + MARGIN + 2
    sq2 = by_w(squirrel(8), ZONES["LYRICS"][0] - MARGIN - gap_l - 4, pixel=True)
    s.put("squirrel takoyaki", sq2, gap_l, H - sq2.height - 4)
    return s


# ═══════════════════════════════════════════════════════════ option C
def option_c():
    bg = Image.new("RGBA", (W, H), (25, 110, 225, 255))
    # The cloud photo is near-white, so it is graded into the brand blue
    # (luminance kept, hue replaced) instead of shown raw: raw, it held white
    # lyrics at 1.0:1 and the title at 3.2:1 even under a heavy scrim.
    sky = cover(load(r"background\langit_skyline\langit_skyline_06_c029818dcb.png"), W, H, anchor_y=0.4)
    lum = sky.convert("L").point(lambda v: round(v * 0.55))
    blue = Image.merge("RGB", (lum.point(lambda v: round(v * 0.25)), lum.point(lambda v: round(v * 0.62)), lum)).convert("RGBA")
    bg.alpha_composite(Image.blend(bg, blue, 0.75))
    grad = cover(load(r"background\gradasi_biru\gradasi_biru_08_d36bf44d39.png"), W, H)
    bg.alpha_composite(shade(grad, 1.0, 0.45))
    # Globe with landmarks: in the bottom-left strip it was a cropped sliver
    # (the strip is 133px wide). Here it rises large from the bottom-right
    # corner, behind the lyrics. Full colour it held lyrics at 2.6:1, so it is
    # graded into dark brand blue: still clearly a globe with landmarks, no
    # bright whites left under the text.
    globe = by_h(load(r"hiasan\ilustrasi_globe_bendera\ilustrasi_globe_bendera_01_3e88716fb7.png"), 420)
    gl = globe.convert("L").point(lambda v: round(v * 0.5))
    gb = Image.merge("RGB", (gl.point(lambda v: round(v * 0.3)), gl.point(lambda v: round(v * 0.7)), gl)).convert("RGBA")
    gb.putalpha(globe.getchannel("A"))
    bg.alpha_composite(gb, (W - globe.width + 70, H - globe.height + 110))
    flags = by_h(load(r"hiasan\ilustrasi_globe_bendera\ilustrasi_globe_bendera_03_12f749e5d8.png"), 78)
    # The cloud photo is bright white behind the lyrics: a stronger scrim.
    scrim(bg, 240, blur=40)
    s = Scene("C_globe", bg)

    logo = by_h(load(r"logo\pjs_perayaan_jelajah_studi\pjs_perayaan_jelajah_studi_07_0e16274837.png"), 80)
    s.put("PJS logo", logo, (W - logo.width) / 2, 5)
    s.put("flags", flags, W - flags.width - 24, 6)
    s.put("compass", by_h(load(r"hiasan\kompas\kompas_01_722c99867b.png"), 74), 26, 14)
    # Karaoke squirrels (01): the music theme, in the centre gap.
    gap_l = ZONES["ALBUM COVER"][2] + MARGIN + 2
    kar = by_w(squirrel(1), ZONES["LYRICS"][0] - MARGIN - gap_l - 2, pixel=True)
    s.put("karaoke squirrels", kar, gap_l, H - kar.height - 4)
    return s


# ═══════════════════════════════════════════════════════════ checks + render
def rel_lum(rgb):
    c = rgb / 255.0
    c = np.where(c <= 0.03928, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]


def check(s):
    fails, report = [], []
    for label, box in s.placed:
        for zn, z in ZONES.items():
            g = (z[0] - MARGIN, z[1] - MARGIN, z[2] + MARGIN, z[3] + MARGIN)
            if box[0] < g[2] and g[0] < box[2] and box[1] < g[3] and g[1] < box[3]:
                fails.append(f"overlap: {label} touches {zn} {tuple(round(v) for v in box)}")
    arr = np.asarray(Image.alpha_composite(s.bg, s.fg).convert("RGB")).astype(np.float64)
    for zn in ("LYRICS", "TITLE / ARTIST / CONTROLS"):
        x0, y0, x1, y1 = ZONES[zn]
        worst, at = 99.0, None
        for ty in range(y0, y1, 48):
            for tx in range(x0, x1, 48):
                lum = rel_lum(arr[ty:min(ty + 48, y1), tx:min(tx + 48, x1)])
                r = 1.05 / (float(np.percentile(lum, 98)) + 0.05)
                if r < worst:
                    worst, at = r, (tx, ty)
        report.append(f"{zn:26} {worst:4.1f}:1")
        if worst < 4.5:
            fails.append(f"contrast: {zn} {worst:.1f}:1 at {at}")
    return fails, report


try:
    BOLD = ImageFont.truetype("arialbd.ttf", 22)
    BIG = ImageFont.truetype("arialbd.ttf", 34)
    LYR = ImageFont.truetype("arialbd.ttf", 36)
    TAG = ImageFont.truetype("arialbd.ttf", 30)
except OSError:
    BOLD = BIG = LYR = TAG = ImageFont.load_default()


def render(s):
    img = Image.alpha_composite(s.bg, s.fg)
    d = ImageDraw.Draw(img, "RGBA")
    c = ZONES["ALBUM COVER"]
    d.rounded_rectangle(c, radius=16, fill=(6, 30, 80, 255), outline=(255, 255, 255, 70), width=2)
    d.text(((c[0] + c[2]) / 2, (c[1] + c[3]) / 2), "ALBUM COVER", font=BOLD, fill="white", anchor="mm")
    t = ZONES["TITLE / ARTIST / CONTROLS"]
    cx = (t[0] + t[2]) / 2
    d.text((cx, t[1] + 28), "Song Title", font=BIG, fill="white", anchor="mm")
    d.text((cx, t[1] + 64), "Artist Name", font=BOLD, fill=(255, 255, 255, 175), anchor="mm")
    d.rounded_rectangle((t[0] + 50, t[1] + 92, t[2] - 50, t[1] + 98), radius=3, fill=(255, 255, 255, 70))
    d.rounded_rectangle((t[0] + 50, t[1] + 92, t[0] + 200, t[1] + 98), radius=3, fill=YELLOW + (255,))
    by = t[1] + 124
    for sx, sg in ((cx - 70, -1), (cx + 70, 1)):
        d.polygon([(sx - 9 * sg, by - 10), (sx - 9 * sg, by + 10), (sx + 7 * sg, by)], fill="white")
        d.rectangle((sx + 8 * sg - 2, by - 10, sx + 8 * sg + 2, by + 10), fill="white")
    d.ellipse((cx - 22, by - 22, cx + 22, by + 22), fill="white")
    d.rectangle((cx - 8, by - 9, cx - 3, by + 9), fill=DEEP + (255,))
    d.rectangle((cx + 3, by - 9, cx + 8, by + 9), fill=DEEP + (255,))
    layer = Image.new("RGBA", (W, H))
    ld = ImageDraw.Draw(layer)
    lz = ZONES["LYRICS"]
    for i, (txt, a) in enumerate([("Young vision, global mission", 90), ("every road leads somewhere new", 255),
                                  ("from Jogja to the world", 120), ("pack your dreams and go", 90),
                                  ("the map is yours to draw", 70)]):
        ld.text((lz[0] + 16, lz[1] + 70 + i * 118), txt, font=LYR, fill=(255, 255, 255, a))
    img.alpha_composite(layer)
    return img


results = []
for build in (option_a, option_b, option_c):
    s = build()
    fails, report = check(s)
    img = render(s)
    img.convert("RGB").save(os.path.join(OUT, f"mockup_{s.name}.png"))
    z = img.copy()
    zd = ImageDraw.Draw(z, "RGBA")
    for box in ZONES.values():
        zd.rectangle(box, outline=(0, 255, 120, 255), width=2)
    for _, box in s.placed:
        zd.rectangle(box, outline=(255, 160, 0, 220), width=1)
    z.convert("RGB").save(os.path.join(OUT, f"mockup_{s.name}_zones.png"))
    results.append((s.name, fails, report, img))
    print(f"{s.name}: {len(s.placed)} decorations | " + " | ".join(report) + (" | OK" if not fails else ""))
    for f in fails:
        print("   FAIL", f)

# Side-by-side comparison sheet with labels.
th = 405
sheet = Image.new("RGB", (720 * 3 + 40, th + 50), (24, 28, 40))
sd = ImageDraw.Draw(sheet)
for i, (name, fails, _, img) in enumerate(results):
    sheet.paste(img.convert("RGB").resize((720, th), Image.LANCZOS), (10 + i * 730, 44))
    sd.text((14 + i * 730, 8), f"Option {name.replace('_', ' ')}", font=TAG, fill="white")
sheet.save(os.path.join(OUT, "mockups_compare.png"))
sys.exit(1 if any(r[1] for r in results) else 0)
