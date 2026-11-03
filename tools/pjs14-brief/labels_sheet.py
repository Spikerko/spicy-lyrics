"""Readable-size sheet of the labels, titles and panels (the 'busy' assets)."""
import glob
import os

from PIL import Image, ImageDraw

R = r"D:\GIK-INTERN\asset_pjs_14\hiasan"
fs = []
for g in ("label_lokasi", "angka_dan_judul", "panel_kartu"):
    fs += sorted(glob.glob(os.path.join(R, g, "*.png")))
ims = []
for f in fs:
    im = Image.open(f).convert("RGBA")
    im = im.crop(im.getchannel("A").getbbox())
    s = min(700 / im.width, 150 / im.height, 1)
    ims.append((os.path.basename(f)[:26], im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))))))
H = sum(i.height + 22 for _, i in ims)
sheet = Image.new("RGBA", (720, H), (14, 97, 207, 255))
d = ImageDraw.Draw(sheet)
y = 0
for name, im in ims:
    d.text((4, y), name, fill="white")
    sheet.alpha_composite(im, (4, y + 14))
    y += im.height + 22
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "inventory", "_labels_titles_panels.png")
sheet.convert("RGB").save(out)
print(out, sheet.size)
