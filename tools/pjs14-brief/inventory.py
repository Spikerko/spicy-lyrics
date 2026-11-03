"""Inventory + contact sheets for D:\\GIK-INTERN\\asset_pjs_14 (read-only).

Prints every file with size/mode/alpha bbox, and writes one labelled contact
sheet per folder to tools/pjs14-brief/inventory/ so the assets can be looked at.
"""

import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = r"D:\GIK-INTERN\asset_pjs_14"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "inventory")
os.makedirs(OUT, exist_ok=True)
try:
    FONT = ImageFont.truetype("arial.ttf", 13)
except OSError:
    FONT = ImageFont.load_default()

groups = {}
for r, ds, fs in os.walk(ROOT):
    for f in sorted(fs):
        p = os.path.join(r, f)
        rel = os.path.relpath(p, ROOT)
        try:
            im = Image.open(p)
            im.load()
        except Exception:  # noqa: BLE001
            print(f"{'?':>11}  {os.path.getsize(p) // 1024:>6}KB  {rel}")
            continue
        a = im.convert("RGBA").getchannel("A")
        bbox = a.getbbox()
        transparent = a.getextrema()[0] < 255
        print(f"{im.size[0]:>5}x{im.size[1]:<5} {im.mode:5} {'alpha' if transparent else 'opaque':6} {os.path.getsize(p) // 1024:>6}KB  {rel}")
        groups.setdefault(os.path.dirname(rel), []).append((f, im.convert("RGBA")))

CELL, LABEL = 220, 34
for g, items in groups.items():
    cols = min(5, len(items))
    rows = (len(items) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * (CELL + 10), rows * (CELL + LABEL + 10)), (40, 44, 60, 255))
    d = ImageDraw.Draw(sheet)
    for k, (f, im) in enumerate(items):
        t = im.copy()
        t.thumbnail((CELL, CELL))
        # checker so transparency is visible
        bg = Image.new("RGBA", (CELL, CELL), (70, 74, 90, 255))
        cd = ImageDraw.Draw(bg)
        for yy in range(0, CELL, 16):
            for xx in range(0, CELL, 16):
                if (xx // 16 + yy // 16) % 2:
                    cd.rectangle((xx, yy, xx + 15, yy + 15), fill=(90, 94, 110, 255))
        bg.alpha_composite(t, ((CELL - t.width) // 2, (CELL - t.height) // 2))
        x, y = (k % cols) * (CELL + 10), (k // cols) * (CELL + LABEL + 10)
        sheet.alpha_composite(bg, (x, y))
        d.text((x + 2, y + CELL + 2), f[:34], font=FONT, fill="white")
        d.text((x + 2, y + CELL + 17), f"{im.width}x{im.height}", font=FONT, fill=(180, 190, 210))
    name = g.replace(os.sep, "__") or "root"
    sheet.convert("RGB").save(os.path.join(OUT, name + ".png"))
print(f"\n{sum(len(v) for v in groups.values())} images in {len(groups)} folders; sheets in {OUT}")
