"""Confirm every copy of the theme is the current build and has the logo at top centre."""

import hashlib
import os
import re
import zipfile

DIST = r"D:\NGODING\spicy-lyrics\dist\spicy-lyrics.js"
DESK = os.path.join(os.environ["USERPROFILE"], "Desktop")
ref = open(DIST, "rb").read()


def ok(data):
    s = data.decode("utf-8", "replace")
    top = re.search(r"--hlw-logo-cx: ?50cqw", s) and re.search(r"--hlw-logo-top: ?1\.2cqh", s)
    column = re.search(r"--hlw-logo-cx: ?calc\(var\(--hlw-lyrics-left\)", s)
    return data == ref, bool(top), not column


def zipped(path):
    z = zipfile.ZipFile(path)
    if z.testzip() is not None:
        raise SystemExit(f"corrupt zip {path}")
    return z.read(next(n for n in z.namelist() if n.endswith("spicy-lyrics.js")))


copies = {
    "dist": ref,
    "this laptop (Extensions)": open(os.path.expandvars(r"%APPDATA%\spicetify\Extensions\spicy-lyrics.js"), "rb").read(),
    "windows folder": open(os.path.join(DESK, "pjs13-spicy-lyrics-windows", "spicy-lyrics.js"), "rb").read(),
    "windows zip": zipped(os.path.join(DESK, "pjs13-spicy-lyrics-windows.zip")),
    "mac folder": open(os.path.join(DESK, "pjs13-spicy-lyrics-mac", "spicy-lyrics.js"), "rb").read(),
    "mac zip": zipped(os.path.join(DESK, "pjs13-spicy-lyrics-mac.zip")),
}
print("build sha", hashlib.sha256(ref).hexdigest()[:12])
bad = 0
for name, data in copies.items():
    same, top, no_col = ok(data)
    bad += not (same and top and no_col)
    print(f"{name:26} same as build: {same}  logo top-centre: {top}  no lyrics-column logo: {no_col}")
print("ALL COPIES UPDATED" if not bad else f"{bad} COPIES WRONG")
raise SystemExit(1 if bad else 0)
