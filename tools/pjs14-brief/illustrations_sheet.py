"""Side-by-side sheet of the PJS 14 illustrations that matter for composition."""
import os
from PIL import Image

R = r"D:\GIK-INTERN\asset_pjs_14"
FILES = [
    r"hiasan\ilustrasi_globe_bendera\ilustrasi_globe_bendera_01_3e88716fb7.png",
    r"hiasan\ilustrasi_globe_bendera\ilustrasi_globe_bendera_02_fc09a82c08.png",
    r"hiasan\ilustrasi_globe_bendera\ilustrasi_globe_bendera_03_12f749e5d8.png",
    r"background\gradasi_biru\gradasi_biru_08_d36bf44d39.png",
    r"background\gradasi_biru\gradasi_biru_01_5f9b295eb9.png",
    r"background\langit_skyline\langit_skyline_06_c029818dcb.png",
    r"hiasan\swoosh_dan_kurva\swoosh_dan_kurva_01_52d93386a6.png",
    r"hiasan\swoosh_dan_kurva\swoosh_dan_kurva_02_e873711616.png",
    r"hiasan\kompas\kompas_01_722c99867b.png",
]
H = 300
ims = []
for f in FILES:
    im = Image.open(os.path.join(R, f)).convert("RGBA")
    ims.append(im.resize((round(im.width * H / im.height), H), Image.LANCZOS))
sheet = Image.new("RGBA", (sum(i.width + 12 for i in ims), H), (60, 60, 80, 255))
x = 0
for im in ims:
    sheet.alpha_composite(im, (x, 0))
    x += im.width + 12
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "inventory", "_illustrations.png")
sheet.convert("RGB").save(out)
print(out, sheet.size)
