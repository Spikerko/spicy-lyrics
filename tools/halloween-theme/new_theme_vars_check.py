"""Evidence for the 'new theme' advice: does a theme that reuses Halloween's
--hlw-* layout vars break when Halloween is off, and does one with its own
renamed copy of the var block work?

Renders in headless Chrome, using Spicy Lyrics' real layout rules
(ContentBox.css) and the real built Halloween CSS (dist). Two scratch themes
place one element at the lyrics column's left edge:
  A) "reuse"  : left: var(--hlw-lyrics-left)        (my original, wrong tip)
  B) "own"    : its own --ntl-lyrics-left declared under .Exp_NatalTheme
Each is rendered with Halloween ON and OFF. Expected: A works only with
Halloween on; B works in both. Nothing in the repo is changed.
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
js = open(os.path.join(REPO, "dist", "spicy-lyrics.js"), encoding="utf-8", errors="replace").read()
hlw_css = js[js.find("#SpicyLyricsPage .HalloweenScene") : js.find("}}", js.rfind("Exp_HalloweenTheme")) + 2]
cb = open(os.path.join(REPO, "src", "css", "ContentBox.css"), encoding="utf-8").read()
layout = re.search(r"#SpicyLyricsPage \{\s*--NowBarWidth.*?\n\}", cb, re.S).group(0)

# Copied exactly as the advice says: Halloween's var block, renamed.
own_block = re.search(r"#SpicyLyricsPage\.Exp_HalloweenTheme\.Fullscreen \{[^}]*--hlw-lyrics-left[^}]*\}",
                      open(os.path.join(REPO, "src", "css", "HalloweenTheme.css"), encoding="utf-8").read()).group(0)
own_block = own_block.replace("Exp_HalloweenTheme", "Exp_NatalTheme").replace("--hlw-", "--ntl-")

THEMES = {
    "A reuse --hlw-*": "#SpicyLyricsPage.Exp_NatalTheme .Probe{left:var(--hlw-lyrics-left)}",
    "B own --ntl-*": own_block + "\n#SpicyLyricsPage.Exp_NatalTheme .Probe{left:var(--ntl-lyrics-left)}",
}


def page(theme_css, halloween_on):
    cls = "Exp_NatalTheme Fullscreen" + (" Exp_HalloweenTheme" if halloween_on else "")
    return f"""<!doctype html><html><head><style>
html,body{{margin:0}} #SpicyLyricsPage{{position:fixed;inset:0;container-type:size}}
.Probe{{position:absolute;top:0;width:10px;height:10px;left:-999px}}
{layout}
{hlw_css}
{theme_css}
</style></head><body><div id="SpicyLyricsPage" class="{cls}"><div class="Probe"></div></div></body></html>"""


tmp = tempfile.mkdtemp()
proc = subprocess.Popen([CHROME, "--headless=new", "--remote-debugging-port=9334", f"--user-data-dir={tmp}", "--no-first-run",
                         "--disable-gpu", "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(50):
        try:
            tgt = next(t for t in json.load(urllib.request.urlopen("http://127.0.0.1:9334/json/list")) if t["type"] == "page")
            break
        except Exception:  # noqa: BLE001
            time.sleep(0.2)
    ws = websocket.create_connection(tgt["webSocketDebuggerUrl"], suppress_origin=True)
    n = [0]

    def call(m, **p):
        n[0] += 1
        ws.send(json.dumps({"id": n[0], "method": m, "params": p}))
        while True:
            r = json.loads(ws.recv())
            if r.get("id") == n[0]:
                return r.get("result", {})

    W, H = 1920, 1080
    expected = 50 * W / 100 - min(30 * W / 100, 52 * H / 100) * 1.1 / 4 * 0.3  # lyrics column left
    call("Emulation.setDeviceMetricsOverride", width=W, height=H, deviceScaleFactor=1, mobile=False)
    results = {}
    for name, css in THEMES.items():
        for on in (True, False):
            f = os.path.join(tmp, "p.html")
            open(f, "w", encoding="utf-8").write(page(css, on))
            call("Page.navigate", url="file:///" + f.replace("\\", "/"))
            time.sleep(0.4)
            x = call("Runtime.evaluate", returnByValue=True, expression="document.querySelector('.Probe').getBoundingClientRect().left")["result"]["value"]
            ok = abs(x - expected) < 1
            results[(name, on)] = ok
            print(f"{name:16} Halloween {'ON ' if on else 'OFF'}: probe x={x:7.1f} (lyrics column {expected:.1f})  {'lands right' if ok else 'BROKEN'}")
    verdict = results[("A reuse --hlw-*", True)] and not results[("A reuse --hlw-*", False)] \
        and results[("B own --ntl-*", True)] and results[("B own --ntl-*", False)]
    print("\nCORRECTION CONFIRMED: reuse breaks with Halloween off, own copy works" if verdict else "\nUNEXPECTED RESULT")
finally:
    proc.terminate()
