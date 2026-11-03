"""Verify the branded header in the built bundle. Re-run after every rebuild.

Usage: python tools/branded-header/verify_bundle.py [path-to-bundle]
"""

import base64
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
BUNDLE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(REPO, "dist", "spicy-lyrics.js")

js = open(BUNDLE, encoding="utf-8", errors="replace").read()
flat = js.replace(" ", "")
results = []


def check(name, cond, extra=""):
    results.append((name, bool(cond), "" if cond else extra))


for eid, cls in (("brandedHeader", "Exp_BrandedHeader"), ("brandedHeaderGlass", "Exp_BrandedHeaderGlass")):
    m = re.search(rf'id:"{eid}".{{0,400}}?default:(!1|!0)', js, re.S)
    check(f"{eid} registered, default ON", m is not None and m.group(1) == "!0", m.group(1) if m else "missing")
    check(f"{cls} page class emitted", cls in js)

tpl = re.search(r'<div class="ContentBox">.{0,40}?\$\{(\w+)\(\)\}.{0,40}?<div class="NowBar">', js, re.S)
check("pill slot between ContentBox and NowBar", tpl is not None)

for tok in ("--material-thick-blur", "--liquid-edge", "--liquid-cast", "--ease-standard"):
    check(f"token {tok} referenced", tok in js)

check("mono marks recoloured white", "brightness(0)invert(1)" in flat)
# The CSS minifier strips attribute quotes and rewrites rgba() as hex.
check("colour mark keeps its chip", re.search(r"data-kind=color\]\{background:(#ffffffeb|rgba)", flat) is not None)
check("colour mark never recoloured", re.search(r"data-kind=color\][^{]*\{[^}]*brightness\(0\)", flat) is None)
check("plate skin present", ":not(.Exp_BrandedHeaderGlass)" in js)
check("popup lyrics excluded", ".spicy-pip-wrapper" in js and "BrandedHeader" in js)
check("reduced motion honoured", "prefers-reduced-motion" in js)
check("no crop", "object-fit:contain" in flat)
check("click-through", "pointer-events:none" in flat)

# Match the branded logos by their generated constants, not by counting every
# image in the bundle: other features (the Halloween theme) inline images too.
sys.path.insert(0, os.path.join(REPO, "src", "components", "Utils"))
assets_ts = open(os.path.join(REPO, "src", "components", "Utils", "BrandedHeaderAssets.ts"), encoding="utf-8").read()
expected = re.findall(r'"data:image/png;base64,([A-Za-z0-9+/=]+)"', assets_ts)
uris = [d for d in expected if d in js]
check("both branded logos inlined", len(expected) == 2 and len(uris) == 2, f"found {len(uris)} of {len(expected)}")
for i, d in enumerate(uris):
    check(f"logo {i + 1} is a valid PNG", base64.b64decode(d)[:8] == b"\x89PNG\r\n\x1a\n")
check("no encoding damage", "\ufffd" not in js)

failed = [r for r in results if not r[1]]
for name, ok, extra in results:
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  -> {extra}" if extra else ""))
print(f"\n{len(results) - len(failed)}/{len(results)} passed  ({os.path.getsize(BUNDLE) / 1024:.1f} KB)")
sys.exit(1 if failed else 0)
