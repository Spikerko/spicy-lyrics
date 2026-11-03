"""Build the Mac install zip from this folder plus the current build.

Output: dist/pjs-spicy-lyrics-mac.zip with install-mac.sh (mode 0755, LF),
BACA-DULU.md and dist/spicy-lyrics.js. Verifies integrity, modes, and that the
zipped spicy-lyrics.js is byte-identical to the build.
"""

import hashlib
import os
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
DIST = os.path.join(REPO, "dist", "spicy-lyrics.js")
NAME = "pjs-spicy-lyrics-mac"
OUT = os.path.join(REPO, "dist", NAME + ".zip")
FILES = {
    "install-mac.sh": os.path.join(HERE, "install-mac.sh"),
    "BACA-DULU.md": os.path.join(HERE, "BACA-DULU.md"),
    "spicy-lyrics.js": DIST,
}

if not os.path.exists(DIST):
    raise SystemExit(f"build first: {DIST} not found")
with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    for arc, path in FILES.items():
        zi = zipfile.ZipInfo(f"{NAME}/{arc}", date_time=(2026, 11, 3, 12, 0, 0))
        zi.create_system = 3  # Unix, so macOS honours the mode bits
        zi.external_attr = (0o100755 if arc.endswith(".sh") else 0o100644) << 16
        zi.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(zi, open(path, "rb").read())

with zipfile.ZipFile(OUT) as z:
    bad = z.testzip()
    print("integrity:", "ok" if bad is None else f"BAD {bad}")
    for i in z.infolist():
        print(f"  {oct(i.external_attr >> 16)}  {i.file_size:>9,}  {i.filename}")
    same = hashlib.sha256(z.read(f"{NAME}/spicy-lyrics.js")).digest() == hashlib.sha256(open(DIST, "rb").read()).digest()
    sh = z.read(f"{NAME}/install-mac.sh")
    print("spicy-lyrics.js == dist:", same)
    print("install-mac.sh LF only:", b"\r\n" not in sh, "| executable:", (z.getinfo(f"{NAME}/install-mac.sh").external_attr >> 16) & 0o111 != 0)
print(f"{OUT}  {os.path.getsize(OUT) / 1024:.0f} KB")
