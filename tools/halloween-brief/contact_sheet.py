"""Contact sheet of the assets requested for the revised mockup, plus ground
candidates, with their trimmed sizes, so composition decisions use real shapes."""

import os

from PIL import Image, ImageDraw, ImageFont

ROOT = r"D:\GIK-INTERN\PJS_13_Asset\pjs13"
OUT = r"D:\NGODING\spicy-lyrics\tools\halloween-brief\contact_sheet.png"

FILES = [
    "pustaka/tokoh/penyihir.png",
    "pustaka/tokoh/tupai-pemain-kecapi.png",
    "pustaka/hiasan/not-musik-coklat.png",
    "pustaka/hiasan/not-musik-oranye.png",
    "pustaka/adegan/awan-ungu-berlapis.png",
    "pustaka/adegan/pohon-rindang.png",
    "pustaka/adegan/rumah-hantu.png",
    "pustaka/adegan/rumput-semak-berbunga.png",
    "pustaka/adegan/tanah-kerikil.png",
    "tanah.png",
    "pustaka/adegan/kuburan.png",
    "pustaka/adegan/bulan.png",
]

CELL = 300
cols = 4
rows = (len(FILES) + cols - 1) // cols
sheet = Image.new("RGB", (cols * CELL, rows * (CELL + 40)), (60, 60, 70))
d = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype("arial.ttf", 13)
except OSError:
    font = ImageFont.load_default()

for i, rel in enumerate(FILES):
    path = os.path.join(ROOT, rel)
    im = Image.open(path).convert("RGBA")
    bbox = im.getchannel("A").getbbox() or (0, 0, *im.size)
    im = im.crop(bbox)
    w, h = im.size
    s = min((CELL - 20) / w, (CELL - 20) / h)
    thumb = im.resize((max(1, int(w * s)), max(1, int(h * s))), Image.LANCZOS)
    cx, cy = (i % cols) * CELL, (i // cols) * (CELL + 40)
    # Checkerboard so transparency is visible.
    for yy in range(0, CELL, 20):
        for xx in range(0, CELL, 20):
            if (xx // 20 + yy // 20) % 2:
                d.rectangle([cx + xx, cy + yy, cx + xx + 19, cy + yy + 19], fill=(80, 80, 92))
    sheet.paste(thumb, (cx + (CELL - thumb.width) // 2, cy + (CELL - thumb.height) // 2), thumb)
    d.text((cx + 6, cy + CELL + 4), os.path.basename(rel), fill="white", font=font)
    d.text((cx + 6, cy + CELL + 20), f"{w}x{h}  aspect {w / h:.2f}", fill=(200, 200, 200), font=font)
    print(f"{os.path.basename(rel):28} trimmed {w}x{h}  aspect {w / h:.2f}")

sheet.save(OUT)
print("wrote", OUT)
