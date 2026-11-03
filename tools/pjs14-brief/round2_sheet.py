"""Second-round sheet: the pieces still unused (or used once) in round 1."""
import os
from PIL import Image

R = r"D:\GIK-INTERN\asset_pjs_14"
FILES = [
    r"hiasan\ilustrasi_globe_bendera\ilustrasi_globe_bendera_02_fc09a82c08.png",
    r"hiasan\swoosh_dan_kurva\swoosh_dan_kurva_01_52d93386a6.png",
    r"karakter\tupai_pixel\tupai_pixel_02_15cf2e3bd2.png",
    r"karakter\tupai_pixel\tupai_pixel_03_528ca417b7.png",
    r"karakter\tupai_pixel\tupai_pixel_04_36128e2104.png",
    r"karakter\tupai_pixel\tupai_pixel_05_be3df0b06f.png",
    r"karakter\tupai_pixel\tupai_pixel_06_d96c45b181.png",
]
H = 260
ims = []
for f in FILES:
    im = Image.open(os.path.join(R, f)).convert("RGBA")
    im = im.crop(im.getchannel("A").getbbox())
    ims.append(im.resize((round(im.width * H / im.height), H), Image.LANCZOS))
sheet = Image.new("RGBA", (sum(i.width + 10 for i in ims), H), (14, 97, 207, 255))
x = 0
for im in ims:
    sheet.alpha_composite(im, (x, 0))
    x += im.width + 10
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "inventory", "_round2.png")
sheet.convert("RGB").save(out)
print(out, sheet.size)
