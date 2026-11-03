"""Reassemble the PJS #13 16:9 key visual from posisi.json, then mark the zones
Spicy Lyrics' fullscreen needs kept clear, to judge where decoration can go.

Output: tools/halloween-brief/kv_composite.png and kv_with_safezones.png
"""

import json
import os

from PIL import Image, ImageDraw

ROOT = r"D:\GIK-INTERN\PJS_13_Asset\pjs13"
KV = os.path.join(ROOT, "kv")
OUT = r"D:\NGODING\spicy-lyrics\tools\halloween-brief"
os.makedirs(OUT, exist_ok=True)

SCALE = 1  # 1440x810 slide units -> pixels
W, H = 1440, 810

pos = json.load(open(os.path.join(KV, "posisi.json"), encoding="utf-8"))

# Sky: not in the JSON (lives in a site CSS file). Approximate with a night
# gradient sampled later from the poster; a neutral dusk purple for now.
canvas = Image.new("RGBA", (W, H), (0, 0, 0, 255))
sky = ImageDraw.Draw(canvas)
top, bot = (40, 24, 66), (120, 58, 110)
for y in range(H):
    t = y / H
    sky.line([(0, y), (W, y)], fill=tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)) + (255,))

items = []
for layer in pos["lapisan"]:
    if layer["slide"] == 1:
        items.append((layer["z"], os.path.join(KV, layer["berkas"]), layer["kotak"], False, False))
for ref in pos["acuan"]:
    if ref["slide"] == 1:
        items.append((ref["z"], os.path.normpath(os.path.join(KV, ref["berkas"])), ref["kotak"], ref.get("balik", False), ref.get("ubin", False)))
for flat in pos["datar"]:
    if flat["slide"] == 1:
        items.append((flat["z"], flat["warna"], flat["kotak"], False, False))

for z, src, box, flip, tile in sorted(items, key=lambda i: i[0]):
    x, y, w, h = (round(box[k] * SCALE) for k in ("x", "y", "w", "h"))
    if isinstance(src, str) and src.startswith("#"):
        ImageDraw.Draw(canvas).rectangle([x, y, x + w, y + h], fill=src)
        continue
    if not os.path.exists(src):
        print("missing", src)
        continue
    im = Image.open(src).convert("RGBA").resize((max(1, w), max(1, h)), Image.LANCZOS)
    if flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    if tile:
        cx = x
        while cx < W:
            canvas.alpha_composite(im, (cx, y))
            cx += w
    else:
        canvas.alpha_composite(im, (x, y))

canvas.convert("RGB").save(os.path.join(OUT, "kv_composite.png"))

# Spicy Lyrics fullscreen layout at 1440x810 (Default: NowBar left, lyrics right).
# Proportions measured from ContentBox.css NowBarWidth = min(30cqw,52cqh)*1.1.
overlay = canvas.copy()
d = ImageDraw.Draw(overlay, "RGBA")
nowbar_w = min(0.30 * W, 0.52 * H) * 1.1
nb_x = W * 0.5 - nowbar_w - nowbar_w / 4
art = nowbar_w
art_y = (H - art) / 2 - 40
zones = {
    "album cover": (nb_x, art_y, nb_x + art, art_y + art),
    "title + artist + controls": (nb_x, art_y + art + 8, nb_x + art, art_y + art + 150),
    "lyrics": (W * 0.52, H * 0.12, W * 0.94, H * 0.92),
}
for name, (x0, y0, x1, y1) in zones.items():
    d.rectangle([x0, y0, x1, y1], fill=(0, 255, 120, 70), outline=(0, 255, 120, 255), width=3)
    d.text((x0 + 8, y0 + 6), name, fill=(255, 255, 255, 255))
overlay.convert("RGB").save(os.path.join(OUT, "kv_with_safezones.png"))
print("wrote", OUT)
for k, v in zones.items():
    print(f"  {k:28} x {v[0]:.0f}-{v[2]:.0f}  y {v[1]:.0f}-{v[3]:.0f}")
