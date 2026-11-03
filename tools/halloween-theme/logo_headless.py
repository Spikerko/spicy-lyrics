"""Render the real built Halloween CSS in headless Chrome and measure the logo.

Spotify's debug port is closed, so this is a stand-in for the live check:
  - Takes the exact Halloween CSS out of dist/spicy-lyrics.js.
  - Takes Spicy Lyrics' own layout variable rules (--NowBarWidth etc.) from
    src/css/ContentBox.css, the same rules the live page uses.
  - Builds a minimal #SpicyLyricsPage skeleton (page as size container,
    ContentBox, LyricsContainer/LyricsContent) with the real logo image.
  - Opens it in headless Chrome over CDP at real window sizes, measures the
    rendered logo box and the computed lyrics mask stops.
Checks: rendered box == CSS model (<=2px); at 1920x1080 inside the design's
LOGO box and centred; lyrics mask fully transparent at the logo's bottom.
Negative control: same page with the PREVIOUS logo rule (top centre) must
fail the design-box check.
"""

import json
import os
import re
import subprocess
import tempfile
import time
import urllib.request

import websocket

REPO = r"D:\NGODING\spicy-lyrics"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
DESIGN = (1007, 169, 1574, 397)

js = open(os.path.join(REPO, "dist", "spicy-lyrics.js"), encoding="utf-8", errors="replace").read()
css = js[js.find("#SpicyLyricsPage .HalloweenScene") : js.find("}}", js.rfind("Exp_HalloweenTheme")) + 2]
logo_uri = re.search(r'export const LOGO = "([^"]+)"', open(os.path.join(REPO, "src", "components", "Utils", "HalloweenAssets.ts"), encoding="utf-8").read()).group(1)
cb = open(os.path.join(REPO, "src", "css", "ContentBox.css"), encoding="utf-8").read()
layout_vars = re.search(r"#SpicyLyricsPage \{\s*--NowBarWidth.*?\n\}", cb, re.S).group(0)

OLD_LOGO_RULE = """#SpicyLyricsPage.Exp_HalloweenTheme.Fullscreen .Hlw__Logo{left:50% !important;top:1.2cqh !important;
  height:min(calc(var(--hlw-cover-top) - 2.4cqh),12cqh) !important}"""


def page(extra=""):
    return f"""<!doctype html><html><head><style>
html,body{{margin:0;height:100%;background:#000}}
.design-box{{position:fixed;left:1007px;top:169px;width:567px;height:228px;outline:2px dashed #0f0;z-index:99;pointer-events:none}}
#SpicyLyricsPage{{position:fixed;inset:0;container-type:size}}
#SpicyLyricsPage .ContentBox{{position:absolute;inset:0}}
#SpicyLyricsPage .LyricsContainer{{position:absolute;inset:0;z-index:4}}
#SpicyLyricsPage .LyricsContainer .LyricsContent{{height:100%;--spice-sidebar:#fff;-webkit-mask-image:var(--ImageMask);mask-image:var(--ImageMask);background:#fff}}
{layout_vars}
{css}
{extra}
</style></head><body>
<div id="SpicyLyricsPage" class="Exp_HalloweenTheme Fullscreen"><div class="ContentBox">
<div class="HalloweenLogo"><img class="Hlw__Logo" src="{logo_uri}" style="--aspect: 1.9300"></div>
<div class="LyricsContainer"><div class="LyricsContent"></div></div>
</div></div><div class="design-box"></div></body></html>"""


def model(W, H):
    # Top centre (2026-10-30): centred, top 1.2cqh, height min(cover top - 2.4cqh, 12cqh).
    cw, ch = W / 100, H / 100
    nbw = min(30 * cw, 52 * ch) * 1.1
    cover_top = 50 * ch - nbw * 0.625
    h = min(cover_top - 2.4 * ch, 12 * ch)
    return (W / 2 - h * 1.93 / 2, 1.2 * ch, W / 2 + h * 1.93 / 2, 1.2 * ch + h)


tmp = tempfile.mkdtemp()
proc = subprocess.Popen([CHROME, "--headless=new", "--remote-debugging-port=9333", f"--user-data-dir={tmp}",
                         "--no-first-run", "--disable-gpu", "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(50):
        try:
            tgt = next(t for t in json.load(urllib.request.urlopen("http://127.0.0.1:9333/json/list")) if t["type"] == "page")
            break
        except Exception:  # noqa: BLE001
            time.sleep(0.2)
    ws = websocket.create_connection(tgt["webSocketDebuggerUrl"], suppress_origin=True)
    n = [0]

    def call(m, **pr):
        n[0] += 1
        ws.send(json.dumps({"id": n[0], "method": m, "params": pr}))
        while True:
            r = json.loads(ws.recv())
            if r.get("id") == n[0]:
                return r.get("result", {})

    def render(html, W, H):
        f = os.path.join(tmp, "p.html")
        open(f, "w", encoding="utf-8").write(html)
        call("Emulation.setDeviceMetricsOverride", width=W, height=H, deviceScaleFactor=1, mobile=False)
        call("Page.navigate", url="file:///" + f.replace("\\", "/"))
        time.sleep(0.6)
        return call("Runtime.evaluate", returnByValue=True, expression="""(() => {
          const L = document.querySelector('.Hlw__Logo'), b = L.getBoundingClientRect();
          const m = getComputedStyle(document.querySelector('.LyricsContent')).maskImage;
          return {box: [b.left, b.top, b.right, b.bottom], loaded: L.naturalWidth > 0, mask: m};
        })()""")["result"]["value"]

    fails = 0
    for W, H in [(1920, 1080), (1280, 720), (1740, 917), (2560, 1440), (3440, 1440), (1024, 768)]:
        g = render(page(), W, H)
        box, mod = g["box"], model(W, H)
        err = max(abs(a - b) for a, b in zip(box, mod))
        stops = [float(x) for x in re.findall(r"rgba\(0, 0, 0, 0\) ([\d.]+)px", g["mask"])]
        clear_to = max(stops) if stops else 0
        f = []
        if not g["loaded"]:
            f.append("logo image did not load")
        if err > 2:
            f.append(f"rendered vs model {err:.1f}px")
        if clear_to < box[3]:
            f.append(f"mask clear only to {clear_to:.0f}, logo bottom {box[3]:.0f}")
        extra = ""
        if (W, H) == (1920, 1080):
            # The column-box position covered lyrics; the logo must now sit
            # clear of that box and above the album cover.
            overlaps_box = box[2] > DESIGN[0] and box[0] < DESIGN[2] and box[3] > DESIGN[1] and box[1] < DESIGN[3]
            cover_top = 540 - min(576, 561.6) * 1.1 * 0.625
            if overlaps_box or box[3] > cover_top:
                f.append("logo not at top centre above the cover")
            extra = f" | overlaps old lyrics-column box: {overlaps_box}, bottom {box[3]:.0f} <= cover top {cover_top:.0f}"
        fails += bool(f)
        print(f"{W}x{H:<5} rendered {tuple(round(v) for v in box)} model diff {err:.1f}px, lyrics mask clear to {clear_to:.0f}px{extra}  {'PASS' if not f else 'FAIL: ' + '; '.join(f)}")

    # Control: the reverted lyrics-column position must be caught as overlapping the box.
    COLUMN_RULE = """#SpicyLyricsPage.Exp_HalloweenTheme.Fullscreen{--hlw-logo-cx:calc(var(--hlw-lyrics-left) + (100cqw - var(--hlw-lyrics-left)) * .375) !important;
      --hlw-logo-top:15.6cqh !important;--hlw-logo-h:min(21cqh,(100cqw - var(--hlw-lyrics-left)) * .56 / 1.93) !important}"""
    g = render(page(COLUMN_RULE), 1920, 1080)
    b = g["box"]
    old_inside = b[2] > DESIGN[0] and b[0] < DESIGN[2] and b[3] > DESIGN[1] and b[1] < DESIGN[3]
    print(f"control (reverted lyrics-column rule) at 1920x1080: {tuple(round(v) for v in b)} overlaps the lyrics box: {old_inside}  {'PASS (control caught)' if old_inside else 'FAIL: control not caught'}")
    fails += not old_inside

    # Fallback layouts: no lyrics column, so the logo returns to top centre.
    for state in ("CompactMode", "CanvasImmersive", "NowBarSide__Right"):
        g = render(page().replace('class="Exp_HalloweenTheme Fullscreen"', f'class="Exp_HalloweenTheme Fullscreen {state}"'), 1920, 1080)
        b = g["box"]
        centred = abs((b[0] + b[2]) / 2 - 960) < 2 and b[1] < 20
        stops = [float(x) for x in re.findall(r"rgba\(0, 0, 0, 0\) ([\d.]+)px", g["mask"])]
        mask_ok = stops and abs(max(stops) - (b[3] + 5.4)) < 2  # fade follows the fallback logo
        ok = centred and mask_ok
        fails += not ok
        print(f"fallback {state:18} logo {tuple(round(v) for v in b)} top-centre={centred} mask clear to {max(stops) if stops else 0:.0f} (logo bottom {b[3]:.0f})  {'PASS' if ok else 'FAIL'}")

    # Screenshot for eyeballing, standard layout at 1920x1080.
    render(page(), 1920, 1080)
    import base64
    shot = call("Page.captureScreenshot", format="png")["data"]
    open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "logo_headless_1920.png"), "wb").write(base64.b64decode(shot))
    print(f"\n{'ALL PASS' if not fails else f'{fails} FAIL'}")
finally:
    proc.terminate()
