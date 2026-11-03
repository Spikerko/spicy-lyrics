"""Check the Halloween theme in a built bundle.

Usage: python tools/halloween-theme/verify_bundle.py [path-to-bundle]
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


m = re.search(r'id:"halloweenTheme".{0,500}?default:(!1|!0)', js, re.S)
check("experiment registered, default ON", m is not None and m.group(1) == "!0", m.group(1) if m else "missing")
check("page class emitted", "Exp_HalloweenTheme" in js)

tpl = re.search(r'<div class="ContentBox">.{0,60}?\$\{(\w+)\(\)\}', js, re.S)
check("scene is first child of ContentBox", tpl is not None)
if tpl:
    # The builder is long; check its whole body up to the next top-level function.
    start = js.find(f"function {tpl.group(1)}(")
    body = js[start : start + 6000] if start >= 0 else ""
    check("first slot builds the Halloween scene", all(k in body for k in ("HalloweenScene", "HalloweenTop", "HalloweenLogo")))

for part in ("Sky", "Moon", "Clouds", "House", "Graves", "Tree", "Ground", "Witch", "Lute", "Note", "Scrim", "Logo", "Web", "Branch", "Bat", "Zombie", "ZombieWalk"):
    check(f"part Hlw__{part} in CSS", f"Hlw__{part}" in js)

check("scene sits under lyrics (z 1)", re.search(r"Exp_HalloweenTheme\.Fullscreen \.HalloweenScene\{z-index:1\}", js) is not None)
check("bats/web band under lyrics (z 3 < lyrics z 4)", re.search(r"\.HalloweenTop\{z-index:3", js) is not None)
check("logo layer over lyrics, under NowBar (4 < 5 < 10)", re.search(r"\.HalloweenLogo\{z-index:5", js) is not None)
check("lyrics fade before the logo", re.search(r"Exp_HalloweenTheme\.Fullscreen \.LyricsContainer \.LyricsContent\{--ImageMask:[^}]*--hlw-logo-bottom", js) is not None)
check("logo at top centre", re.search(r"--hlw-logo-cx: ?50cqw", js) is not None and re.search(r"--hlw-logo-top: ?1\.2cqh", js) is not None and "left:var(--hlw-logo-cx)" in js)
check("logo not in the lyrics-column box (covered lyrics)", re.search(r"--hlw-logo-cx: ?calc\(var\(--hlw-lyrics-left\)", js) is None)
check("popup keeps the stock lyrics mask", re.search(r"\.spicy-pip-wrapper #SpicyLyricsPage\.Exp_HalloweenTheme\.Fullscreen \.LyricsContainer \.LyricsContent\{--ImageMask", js) is not None)
check("witch flipped to face left", re.search(r"\.Hlw__Witch\{[^}]*scale:-1 1", js) is not None)
check("zombie hidden in canvas layout", "Exp_HalloweenTheme.Fullscreen.CanvasImmersive .Hlw__ZombieWalk" in js)
check("zombie hidden in compact layout", "Exp_HalloweenTheme.Fullscreen.CompactMode .Hlw__ZombieWalk" in js)
check("zombie stops under reduced motion", re.search(r"prefers-reduced-motion:reduce\).{0,400}\.Hlw__Zombie", js, re.S) is not None)
check("click-through", "pointer-events:none" in flat)
check("dynamic bg hidden under the scene", re.search(r"Exp_HalloweenTheme\.Fullscreen \.ContentBox>\.spicy-dynamic-bg\{visibility:hidden", js) is not None)
check("branded pill hidden in theme", "Exp_HalloweenTheme.Fullscreen .BrandedHeader{display:none" in js)
check("popup lyrics excluded", re.search(r"\.spicy-pip-wrapper #SpicyLyricsPage\.Exp_HalloweenTheme", js) is not None)
# The minifier expands :is(...) into one selector per state, so check each one.
for state in ("CompactMode", "ForcedCompactMode", "NowBarSide__Right"):
    check(f"{state} layout guarded", f"Exp_HalloweenTheme.Fullscreen.{state} .Hlw__Lute" in js)
check("no-lyrics layout guarded", ":has(.ContentBox.LyricsHidden)" in js)
check(
    "canvas video stage lifted above the scene",
    re.search(r"Exp_HalloweenTheme\.Fullscreen\.CanvasImmersive \.ContentBox>\.CanvasStage\{z-index:2\}", js) is not None,
)
check("canvas layout hides witch", "Exp_HalloweenTheme.Fullscreen.CanvasImmersive .Hlw__Witch" in js)
check("canvas layout hides lute", "Exp_HalloweenTheme.Fullscreen.CanvasImmersive .Hlw__Lute" in js)
check("portrait guard survived minify", "@container (max-aspect-ratio:1/1)" in js or "@container (max-aspect-ratio: 1/1)" in js)
check("reduced motion honoured", re.search(r"prefers-reduced-motion:reduce\).{0,200}Exp_HalloweenTheme", js, re.S) is not None)
for kf in ("Hlw__Rise", "Hlw__Strum", "Hlw__Sway", "Hlw__Flap", "Hlw__Drift", "Hlw__Glow", "Hlw__Flicker", "Hlw__ZombieRise", "Hlw__ZombieWalk", "Hlw__Lurch"):
    check(f"keyframes {kf}", f"@keyframes {kf}" in js)
check("layout vars referenced", all(v in js for v in ("--NowBarWidth", "--NowBarLeftSpacing", "--NowBarRightSpacing")))

uris = re.findall(r'"data:image/(png|webp);base64,([A-Za-z0-9+/=]{500,})"', js)
check("18 Halloween images + 2 branded logos inlined", len(uris) == 20, f"found {len(uris)}")
sig = {"png": b"\x89PNG\r\n\x1a\n", "webp": b"RIFF"}
bad = [i for i, (kind, d) in enumerate(uris) if not base64.b64decode(d[:64] + "=" * (-len(d[:64]) % 4))[: len(sig[kind])] == sig[kind]]
check("every inlined image has a valid header", not bad, f"bad indexes {bad}")
check("no encoding damage", "\ufffd" not in js)

failed = [r for r in results if not r[1]]
for name, ok, extra in results:
    if not ok:
        print(f"FAIL  {name}  -> {extra}")
print(f"{len(results) - len(failed)}/{len(results)} passed  ({os.path.getsize(BUNDLE) / 1024:.1f} KB)")
sys.exit(1 if failed else 0)
