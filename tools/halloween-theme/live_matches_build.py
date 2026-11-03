"""Prove the live (hot-swapped) theme equals what the build renders.

Bundles src/components/Utils/HalloweenTheme.ts on its own with bun (the same
source the installed build was made from: dist is newer than every theme
source file and identical to the installed file), runs HalloweenThemeHTML()
in the page, and compares the result with the three live layers element by
element: tag, class, style, and src (length + tail). Then compares the live
<style id=hlw-preview> text with the Halloween CSS inside the installed
bundle. Read-only on the page.
"""

import json
import os
import subprocess
import tempfile

from cdp import Page

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
tmp = tempfile.mkdtemp()
entry = os.path.join(tmp, "entry.ts")
with open(entry, "w", encoding="utf-8") as f:
    src = os.path.join(REPO, "src", "components", "Utils", "HalloweenTheme.ts").replace("\\", "/")
    f.write(f'import {{ HalloweenThemeHTML }} from "{src}";\n(globalThis as any).__HLW_HTML = HalloweenThemeHTML();\n')
out = os.path.join(tmp, "out.js")
subprocess.run(["bun", "build", entry, "--outfile", out, "--target", "browser"], check=True, capture_output=True, cwd=REPO, shell=True)
bundle = open(out, encoding="utf-8").read()

js = open(os.path.expandvars(r"%APPDATA%\spicetify\Extensions\spicy-lyrics.js"), encoding="utf-8", errors="replace").read()
css = js[js.find("#SpicyLyricsPage .HalloweenScene") : js.find("}}", js.rfind("Exp_HalloweenTheme")) + 2]

p = Page()
p.eval(f"(() => {{ {bundle}; return 1; }})()")
r = p.eval(f"""(() => {{
  const tpl = document.createElement('div');
  tpl.innerHTML = globalThis.__HLW_HTML;
  delete globalThis.__HLW_HTML;
  // Compare declarations, not raw text: the hotswap writes a trailing ';'.
  const norm = (s) => (s || '').split(';').map(x => x.trim()).filter(Boolean).join('; ');
  const sig = (root) => [...root.querySelectorAll('*')].map(e => [e.tagName, e.className, norm(e.getAttribute('style')), (e.getAttribute('src') || '').length, (e.getAttribute('src') || '').slice(-32)]);
  const box = document.querySelector('#SpicyLyricsPage .ContentBox');
  const live = [...box.querySelectorAll(':scope > .HalloweenScene, :scope > .HalloweenTop, :scope > .HalloweenLogo')];
  const built = [...tpl.children];
  const res = {{layersLive: live.map(e => e.className), layersBuilt: built.map(e => e.className), diffs: [], elements: 0}};
  built.forEach((b, i) => {{
    const l = live[i];
    if (!l) {{ res.diffs.push(['missing layer', b.className]); return; }}
    const sb = sig(b), sl = sig(l);
    res.elements += sb.length;
    if (sb.length !== sl.length) res.diffs.push([b.className, 'count', sb.length, sl.length]);
    sb.forEach((x, k) => {{ if (JSON.stringify(x) !== JSON.stringify(sl[k])) res.diffs.push([b.className, k, x, sl[k]]); }});
  }});
  const st = document.getElementById('hlw-preview');
  res.cssEqual = !!st && st.textContent === {json.dumps(css)};
  res.liveCssChars = st ? st.textContent.length : 0;
  return res;
}})()""")
print(json.dumps({k: v for k, v in r.items() if k != "diffs"}))
for d in r["diffs"][:10]:
    print("DIFF", json.dumps(d)[:300])
# 19 scene + 6 top (web, branch, 4 bats) + 1 logo, all compared above.
ok = not r["diffs"] and r["cssEqual"] and r["layersLive"] == r["layersBuilt"] and r["elements"] == 26
print("LIVE == BUILD" if ok else "MISMATCH")
raise SystemExit(0 if ok else 1)
