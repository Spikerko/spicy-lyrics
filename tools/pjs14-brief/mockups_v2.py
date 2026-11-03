"""PJS #14 mockups, round 2: as full as the Halloween theme.

Round 1 measured emptier than Halloween (fullness.py: busy 7-17% vs 19.2%).
The Halloween mockup fills every free region, so each option here fills the
same regions with an equivalent from asset_pjs_14:

  Halloween                -> PJS 14 equivalent
  web, top-left corner     -> compass / white cloud swoosh
  pumpkin branch, top-right-> flags (globe_bendera_03)
  4 bats across top band   -> zooming pills (tombol_pill_biru) + map pins
  logo, top centre         -> PJS logo
  tree, left strip         -> poster stack (yellow + blue panel_kartu)
                              peeking out behind the cover, vertical pills
  rising notes, the gap    -> rising map pins (label_lokasi pin icon)
  lute player, the gap     -> squirrel
  witch, left strip        -> squirrel
  moon behind lyrics       -> globe collage (globe_bendera_02), graded dark
  grass + house, bottom    -> city skyline strip (langit_skyline_05)

Same checks as before (overlap, white-text contrast >= 4.5:1) plus fullness:
each option must reach at least the Halloween mockup's busy share.
"""

import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fullness import measure  # noqa: E402

A = r"D:\GIK-INTERN\asset_pjs_14"
OUT = os.path.dirname(os.path.abspath(__file__))
HALLOWEEN = os.path.join(OUT, "..", "halloween-brief", "mockup_v2.png")
W, H = 1440, 810
MARGIN = 8
ZONES = {
    "ALBUM COVER": (141, 133, 604, 597),
    "TITLE / ARTIST / CONTROLS": (141, 605, 604, 747),
    "LYRICS": (749, 97, 1354, 745),
}
GAP_L, GAP_R = ZONES["ALBUM COVER"][2] + MARGIN, ZONES["LYRICS"][0] - MARGIN
LEFT_R = ZONES["ALBUM COVER"][0] - MARGIN
DEEP = (4, 35, 95)
YELLOW = (255, 212, 0)
_c = {}


def load(rel):
    if rel not in _c:
        im = Image.open(os.path.join(A, rel)).convert("RGBA")
        bb = im.getchannel("A").getbbox()
        _c[rel] = im.crop(bb) if bb else im
    return _c[rel].copy()


def by_h(im, h, px=False):
    return im.resize((max(1, round(im.width * h / im.height)), h), Image.NEAREST if px else Image.LANCZOS)


def by_w(im, w, px=False):
    return im.resize((w, max(1, round(im.height * w / im.width))), Image.NEAREST if px else Image.LANCZOS)


def cover(im, w, h, ay=0.5):
    s = max(w / im.width, h / im.height)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    x0, y0 = (im.width - w) // 2, round((im.height - h) * ay)
    return im.crop((x0, y0, x0 + w, y0 + h))


def alpha(im, a):
    out = im.copy()
    out.putalpha(im.getchannel("A").point(lambda v: round(v * a)))
    return out


def tint(im, rgb, amt):
    out = Image.blend(im.convert("RGB"), Image.new("RGB", im.size, rgb), amt).convert("RGBA")
    out.putalpha(im.getchannel("A"))
    return out


def grade(im, dark=0.5):
    """Map an image into dark brand blue, keeping its luminance detail."""
    l = im.convert("L").point(lambda v: round(v * dark))
    out = Image.merge("RGB", (l.point(lambda v: round(v * 0.3)), l.point(lambda v: round(v * 0.68)), l)).convert("RGBA")
    out.putalpha(im.getchannel("A"))
    return out


def sprite(n, half=None):
    names = sorted(os.listdir(os.path.join(A, "karakter", "tupai_pixel")))
    im = Image.open(os.path.join(A, "karakter", "tupai_pixel", names[n - 1])).convert("RGBA")
    if half:
        cols = np.asarray(im.getchannel("A")).max(0) > 20
        mid = im.width // 2
        gap = [x for x in range(mid - 200, mid + 200) if not cols[x]]
        split = gap[len(gap) // 2] if gap else mid
        im = im.crop((0, 0, split, im.height)) if half == "L" else im.crop((split, 0, im.width, im.height))
    return im.crop(im.getchannel("A").getbbox())


def pin():
    """The white map-pin glyph from the location label (x 153-261). Rows
    16-20 and 232-236 are the label's own outline, so they are cut away."""
    lab = Image.open(os.path.join(A, "hiasan", "label_lokasi", "label_lokasi_01_df1403b5ac.png")).convert("RGBA")
    p = lab.crop((150, 24, 265, 228))
    return p.crop(p.getchannel("A").getbbox())


NOTES = os.path.join(OUT, "notes")


def note(shape, colour):
    """Halloween's pixel music notes recoloured to this palette (notes.py):
    shape 'a' (orange original) or 'b' (brown original); colour white/yellow/sky."""
    return Image.open(os.path.join(NOTES, f"note-{shape}-{colour}.png")).convert("RGBA")


def pill(n, w, light=0.45):
    names = sorted(os.listdir(os.path.join(A, "hiasan", "tombol_pill_biru")))
    im = Image.open(os.path.join(A, "hiasan", "tombol_pill_biru", names[n - 1])).convert("RGBA")
    im = im.crop(im.getchannel("A").getbbox())
    return tint(by_w(im, w), (255, 255, 255), light)


def skyline_strip(h=230, src=r"background\langit_skyline\langit_skyline_05_69c3277307.png", y0=0.30, y1=0.78):
    """Full-width city band for the bottom 'ground', top edge faded out.
    Round 2a had it at contrast 1.35 and it vanished into the blue: the
    skyline is the Halloween grass+house equivalent, so it must read."""
    im = load(src)
    im = im.crop((0, round(im.height * y0), im.width, round(im.height * y1)))
    im = cover(im, W, h)
    im = ImageEnhance.Contrast(im).enhance(1.9)
    # Not brighter: at 1.15 the band lifted the lowest lyric and title rows
    # to ~110-130 grey, holding white text at 3.5-3.9:1.
    im = ImageEnhance.Brightness(im).enhance(0.8)
    m = Image.new("L", (W, h), 255)
    md = ImageDraw.Draw(m)
    for y in range(h):
        md.line([(0, y), (W, y)], fill=round(255 * min(1, y / (h * 0.3))))
    im.putalpha(m)
    return im


def cloud_band(bg, y):
    """A soft white cloud floor along the very bottom, below the text zones
    (they end at y 747). The kit's cloud swoosh is a near-square blob, so a
    floor is built from blurred ellipses instead, in the swoosh's colour.
    Its top must stay below y 760: at 758 it pushed the last lyric line to
    3.7:1."""
    lay = Image.new("RGBA", (W, H))
    d = ImageDraw.Draw(lay)
    for cx, r in [(60, 46), (230, 38), (420, 50), (640, 42), (860, 52), (1080, 44), (1290, 50), (1440, 40)]:
        d.ellipse((cx - r * 2.2, y, cx + r * 2.2, y + r * 2), fill=(232, 244, 255, 230))
    bg.alpha_composite(lay.filter(ImageFilter.GaussianBlur(7)))


def right_strip(s):
    """The 86px strip right of the lyric column (x 1354..1440), the haunted
    house's place in Halloween: a vertical stack of capsules and a pin, on
    the background layer under the scrim's soft edge."""
    x0 = ZONES["LYRICS"][2] + MARGIN + 4
    w = W - x0 - 10
    for i, (n, y, h) in enumerate([(34, 150, 170), (38, 350, 140), (35, 520, 120)]):
        im = by_h(pill(n, 40, 0.45), h)
        s.back(im, x0 + (w - im.width) / 2 + (10 if i % 2 else -10), y)
    n_ = by_h(note("b", "sky"), 46, px=True)
    s.back(n_, x0 + (w - n_.width) / 2, 92)


def scrim(bg, strength=210, blur=45):
    m = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(m)
    lz, tz = ZONES["LYRICS"], ZONES["TITLE / ARTIST / CONTROLS"]
    d.rounded_rectangle((lz[0] - 30, lz[1] - 20, lz[2] + 20, lz[3] + 10), radius=80, fill=strength)
    d.rounded_rectangle((tz[0] - 20, tz[1] - 10, tz[2] + 20, tz[3] + 10), radius=40, fill=strength)
    m = m.filter(ImageFilter.GaussianBlur(blur))
    dk = Image.new("RGBA", (W, H), DEEP + (255,))
    dk.putalpha(m)
    bg.alpha_composite(dk)


class Scene:
    def __init__(self, name, title):
        self.name, self.title = name, title
        self.bg = Image.new("RGBA", (W, H), (14, 97, 207, 255))
        self.fg = Image.new("RGBA", (W, H))
        self.placed = []

    def back(self, im, x, y):
        self.bg.alpha_composite(im, (round(x), round(y)))

    def put(self, label, im, x, y, flip=False):
        if flip:
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        self.fg.alpha_composite(im, (round(x), round(y)))
        self.placed.append((label, (x, y, x + im.width, y + im.height)))

    # Shared furniture so all three options fill the same regions.
    def top_band(self, logo_h=80, pills=True, corner_left="compass"):
        logo = by_h(load(r"logo\pjs_perayaan_jelajah_studi\pjs_perayaan_jelajah_studi_07_0e16274837.png"), logo_h)
        self.put("PJS logo", logo, (W - logo.width) / 2, 5)
        if corner_left == "compass":
            self.put("compass", by_h(load(r"hiasan\kompas\kompas_01_722c99867b.png"), 82), 22, 8)
        flags = by_h(load(r"hiasan\ilustrasi_globe_bendera\ilustrasi_globe_bendera_03_12f749e5d8.png"), 82)
        self.put("flags", flags, W - flags.width - 16, 4)
        if pills:  # zooming capsules, the 'bats': two left of the logo, two right
            for i, (n, w, x, y) in enumerate([(1, 120, 200, 20), (36, 84, 330, 58), (5, 110, 870, 16), (33, 78, 1010, 56)]):
                self.put(f"zoom pill {i + 1}", pill(n, w), x, y)
            # A few notes drifting across the top band, like Halloween's bats.
            for i, (shape, col, h, x, y) in enumerate([("a", "yellow", 40, 470, 26), ("b", "white", 30, 545, 58),
                                                       ("b", "yellow", 36, 1130, 30)]):
                self.put(f"top note {i + 1}", by_h(note(shape, col), h, px=True), x, y)

    def rising_pins(self, bottom_y, n=6):
        """Halloween's rising-notes column, in this palette: notes float up
        the gap from the squirrel, alternating shapes and white/yellow/sky,
        shrinking and fading as they rise (in the build: the same Hlw__Rise
        animation)."""
        span = GAP_R - GAP_L
        seq = [("a", "white"), ("b", "yellow"), ("a", "sky"), ("b", "white"), ("a", "yellow"), ("b", "sky")]
        for i in range(n):
            h = round(50 - i * 4.5)
            shape, col = seq[i % len(seq)]
            im = alpha(by_h(note(shape, col), h, px=True), 1.0 - i * 0.11)
            im = im.rotate(-10 if i % 2 else 9, expand=True, resample=Image.NEAREST)
            x = GAP_L + (span * (0.3 if i % 2 else 0.68)) - im.width / 2
            y = bottom_y - 70 - i * 70
            self.put(f"rising note {i + 1}", im, x, y)


# ═══════════════════════════════════════════════════════════════ option 1
def festival():
    s = Scene("1_festival", "1 Festival (flat brand, poster stack)")
    s.back(cover(load(r"background\gradasi_biru\gradasi_biru_01_5f9b295eb9.png"), W, H), 0, 0)
    sw = by_h(load(r"hiasan\swoosh_dan_kurva\swoosh_dan_kurva_02_e873711616.png"), 560)
    s.back(alpha(sw, 0.85), W - sw.width + 60, H - sw.height + 30)
    sw3 = by_h(load(r"hiasan\swoosh_dan_kurva\swoosh_dan_kurva_03_11a756cd04.png"), 460).transpose(Image.ROTATE_180)
    s.back(alpha(sw3, 0.6), -90, -70)
    cloud = by_w(load(r"hiasan\swoosh_dan_kurva\swoosh_dan_kurva_01_52d93386a6.png"), 300).rotate(-70, expand=True)
    s.back(alpha(cloud, 0.75), -60, 120)
    # Poster stack behind the cover: the 'tree'. Only its edges show.
    c = ZONES["ALBUM COVER"]
    yel = by_w(load(r"hiasan\panel_kartu\panel_kartu_05_59508ca768.png"), 520)
    s.back(yel.rotate(6, expand=True, resample=Image.BICUBIC), c[0] - 110, c[1] + 120)
    blu = by_w(load(r"hiasan\panel_kartu\panel_kartu_02_3f0ac12687.png"), 520)
    s.back(tint(blu, (90, 170, 255), 0.25).rotate(-5, expand=True, resample=Image.BICUBIC), c[0] - 40, c[1] - 60)
    circ = by_h(load(r"hiasan\tombol_pill_biru\tombol_pill_biru_02_de586acd19.png"), 210)
    s.back(tint(circ, (120, 190, 255), 0.35), c[0] - 115, c[1] - 30)
    s.back(skyline_strip(210), 0, H - 210)
    cloud_band(s.bg, 772)
    right_strip(s)
    scrim(s.bg, 215)

    s.top_band()
    # Left strip: two vertical capsules (the trunk), onigiri squirrel at the foot.
    for i, (n, x, y, h) in enumerate([(34, 18, 250, 170), (38, 66, 330, 150)]):
        s.put(f"vertical pill {i + 1}", by_h(pill(n, 40, 0.35), h), x, y)
    girl = by_w(sprite(7), LEFT_R - 6, px=True)
    s.put("squirrel onigiri", girl, 3, H - girl.height - 4)
    boy = by_w(sprite(8), GAP_R - GAP_L - 6, px=True)
    s.put("squirrel takoyaki", boy, GAP_L + 3, H - boy.height - 4)
    s.rising_pins(H - boy.height - 4)
    return s


# ═══════════════════════════════════════════════════════════════ option 2
def harbour():
    s = Scene("2_skyline", "2 Kota Dunia (city photo, globe moon)")
    sky = cover(load(r"background\langit_skyline\langit_skyline_04_4c6bdf4c59.png"), W, H, ay=0.2)
    s.back(ImageEnhance.Contrast(sky).enhance(1.25), 0, 0)
    veil = Image.new("L", (W, H), 0)
    vd = ImageDraw.Draw(veil)
    for y in range(H):
        vd.line([(0, y), (W, y)], fill=round(160 * max(0, 1 - y / 380)))
    v = Image.new("RGBA", (W, H), DEEP + (255,))
    v.putalpha(veil)
    s.bg.alpha_composite(v)
    # The 'moon': globe collage, top-right behind the lyrics, graded dark.
    globe = by_h(load(r"hiasan\ilustrasi_globe_bendera\ilustrasi_globe_bendera_02_fc09a82c08.png"), 340)
    s.back(grade(globe, 0.62), W - globe.width + 30, 60)
    cloud = by_w(load(r"hiasan\swoosh_dan_kurva\swoosh_dan_kurva_01_52d93386a6.png"), 260).rotate(-75, expand=True)
    s.back(alpha(cloud, 0.8), -40, 150)
    s.back(skyline_strip(230), 0, H - 230)
    cloud_band(s.bg, 772)
    right_strip(s)
    scrim(s.bg, 220)

    s.top_band()
    # Lollipop girl in the left strip, boba boy in the gap (sprite 02 halves).
    girl = by_w(sprite(2, "L"), LEFT_R - 6, px=True)
    s.put("squirrel lollipop", girl, 3, H - girl.height - 4)
    boy = by_w(sprite(2, "R"), GAP_R - GAP_L - 6, px=True)
    s.put("squirrel boba", boy, GAP_L + 3, H - boy.height - 4)
    s.rising_pins(H - boy.height - 4)
    # Left strip above the girl: vertical capsules (the tree's place), the
    # same as options 1 and 3, so the map pin is no longer used as decoration.
    for i, (n, x, y, h) in enumerate([(34, 18, 240, 170), (38, 68, 320, 150)]):
        s.put(f"vertical pill {i + 1}", by_h(pill(n, 40, 0.35), h), x, y)
    return s


# ═══════════════════════════════════════════════════════════════ option 3
def karaoke():
    s = Scene("3_karaoke", "3 Karaoke Globe (music, dark blue)")
    s.back(Image.new("RGBA", (W, H), (8, 52, 140, 255)), 0, 0)
    s.back(alpha(cover(load(r"background\gradasi_biru\gradasi_biru_08_d36bf44d39.png"), W, H), 0.7), 0, 0)
    # Big globe rising behind the lyrics bottom-right (the house + moon).
    g1 = by_h(load(r"hiasan\ilustrasi_globe_bendera\ilustrasi_globe_bendera_01_3e88716fb7.png"), 460)
    s.back(grade(g1, 0.55), W - g1.width + 90, H - g1.height + 120)
    sw = by_h(load(r"hiasan\swoosh_dan_kurva\swoosh_dan_kurva_02_e873711616.png"), 520)
    s.back(alpha(sw, 0.55), -120, H - sw.height + 40)
    # Poster stack behind the cover, blue only (darker mood).
    c = ZONES["ALBUM COVER"]
    blu = by_w(load(r"hiasan\panel_kartu\panel_kartu_01_3fbb8d92dd.png"), 540)
    s.back(alpha(blu.rotate(5, expand=True, resample=Image.BICUBIC), 0.9), c[0] - 100, c[1] + 70)
    yel = by_w(load(r"hiasan\panel_kartu\panel_kartu_06_d4798c11c9.png"), 200)
    s.back(yel.rotate(-8, expand=True, resample=Image.BICUBIC), c[0] - 100, c[1] - 50)
    s.back(skyline_strip(190, src=r"background\langit_skyline\langit_skyline_01_d939808c08.png", y0=0.42, y1=0.72), 0, H - 190)
    cloud_band(s.bg, 772)
    right_strip(s)
    scrim(s.bg, 205)

    s.top_band()
    # Karaoke pair in the gap (the lute player), waving girl in the left strip.
    kar = by_w(sprite(1), GAP_R - GAP_L - 2, px=True)
    s.put("karaoke squirrels", kar, GAP_L + 1, H - kar.height - 4)
    girl = by_w(sprite(10), LEFT_R - 6, px=True)
    s.put("squirrel waving", girl, 3, H - girl.height - 4)
    s.rising_pins(H - kar.height - 4, n=6)
    for i, (n, x, y, h) in enumerate([(35, 20, 230, 160), (39, 70, 300, 140)]):
        s.put(f"vertical pill {i + 1}", by_h(pill(n, 40, 0.3), h), x, y)
    return s


# ═══════════════════════════════════════════════════════════════ checks
def rel_lum(rgb):
    c = rgb / 255.0
    c = np.where(c <= 0.03928, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]


def check(s):
    fails, rep = [], []
    for label, b in s.placed:
        for zn, z in ZONES.items():
            g = (z[0] - MARGIN, z[1] - MARGIN, z[2] + MARGIN, z[3] + MARGIN)
            if b[0] < g[2] and g[0] < b[2] and b[1] < g[3] and g[1] < b[3]:
                fails.append(f"overlap: {label} touches {zn} {tuple(round(v) for v in b)}")
    arr = np.asarray(Image.alpha_composite(s.bg, s.fg).convert("RGB")).astype(np.float64)
    for zn in ("LYRICS", "TITLE / ARTIST / CONTROLS"):
        x0, y0, x1, y1 = ZONES[zn]
        worst, at = 99.0, None
        for ty in range(y0, y1, 48):
            for tx in range(x0, x1, 48):
                r = 1.05 / (float(np.percentile(rel_lum(arr[ty:min(ty + 48, y1), tx:min(tx + 48, x1)]), 98)) + 0.05)
                if r < worst:
                    worst, at = r, (tx, ty)
        rep.append(f"{zn.split()[0].lower()} {worst:.1f}:1")
        if worst < 4.5:
            fails.append(f"contrast: {zn} {worst:.1f}:1 at {at}")
    return fails, rep


try:
    BOLD, BIG, LYR, TAG = (ImageFont.truetype("arialbd.ttf", s) for s in (22, 34, 36, 28))
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


h_edge, h_busy, h_empty = measure(HALLOWEEN)
print(f"Halloween reference: busy {h_busy:.1f}%  empty {h_empty:.1f}%")
results, bad = [], False
for build in (festival, harbour, karaoke):
    s = build()
    fails, rep = check(s)
    img = render(s)
    path = os.path.join(OUT, f"mockup2_{s.name}.png")
    img.convert("RGB").save(path)
    _, busy, empty = measure(path)
    if busy < h_busy:
        fails.append(f"fullness: busy {busy:.1f}% < Halloween {h_busy:.1f}%")
    z = img.copy()
    zd = ImageDraw.Draw(z, "RGBA")
    for b in ZONES.values():
        zd.rectangle(b, outline=(0, 255, 120, 255), width=2)
    for _, b in s.placed:
        zd.rectangle(b, outline=(255, 160, 0, 220), width=1)
    z.convert("RGB").save(os.path.join(OUT, f"mockup2_{s.name}_zones.png"))
    results.append((s, img, busy, empty))
    bad |= bool(fails)
    print(f"{s.name:12} {len(s.placed):2} decorations | busy {busy:4.1f}% empty {empty:4.1f}% | {' | '.join(rep)}{' | OK' if not fails else ''}")
    for f in fails:
        print("   FAIL", f)

th = 405
sheet = Image.new("RGB", (720 * 3 + 40, th + 50), (24, 28, 40))
sd = ImageDraw.Draw(sheet)
for i, (s, img, busy, _) in enumerate(results):
    sheet.paste(img.convert("RGB").resize((720, th), Image.LANCZOS), (10 + i * 730, 44))
    sd.text((14 + i * 730, 8), s.title, font=TAG, fill="white")
sheet.save(os.path.join(OUT, "mockups3_compare_notes.png"))
sys.exit(1 if bad else 0)
