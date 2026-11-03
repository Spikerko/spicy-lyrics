"""Hot-swap the whole Halloween theme (markup + CSS) into the running page.

No reload and no playback calls. Rebuilds the three layers with the same
markup HalloweenTheme.ts emits, from HalloweenAssets.ts, and the CSS from the
built bundle. Undone by the next normal page load, which uses the installed
build.
"""

import json
import os
import re
import sys

from cdp import Page

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))

js = open(os.path.join(REPO, "dist", "spicy-lyrics.js"), encoding="utf-8", errors="replace").read()
start = js.find("#SpicyLyricsPage .HalloweenScene")
last = js.rfind("Exp_HalloweenTheme")
end = js.find("}}", last) + 2
css = js[start:end]
if start < 0 or end <= start or "@keyframes Hlw__ZombieWalk" not in css:
    sys.exit(f"could not extract Halloween CSS from bundle ({start}, {end}, {len(css)} chars)")

A = dict(re.findall(r'export const (\w+) = "([^"]+)";', open(os.path.join(REPO, "src", "components", "Utils", "HalloweenAssets.ts"), encoding="utf-8").read()))
R = {k: float(v) for k, v in re.findall(r"export const (\w+)_ASPECT = ([\d.]+);", open(os.path.join(REPO, "src", "components", "Utils", "HalloweenAssets.ts"), encoding="utf-8").read())}


def img(part, key, **v):
    style = "; ".join([f"--aspect: {R[key]:.4f}"] + [f"{k}: {x}" for k, x in v.items()])
    return f'<img class="Hlw__{part}" src="{A[key]}" alt="" draggable="false" style="{style}" />'


notes = "".join(img("Note", "NOTE_BROWN" if i % 3 == 1 else "NOTE_ORANGE", **{"--i": i}) for i in range(6))
bats = "".join(img("Bat", f"BAT_{i + 1}", **{"--i": i}) for i in range(4))
scene = "".join([
    '<div class="Hlw__Sky"></div>', '<div class="Hlw__MoonGlow"></div>', img("Moon", "MOON"),
    f"<div class=\"Hlw__Clouds\" style=\"--cloud: url('{A['CLOUDS']}'); --aspect: {R['CLOUDS']:.4f}\"></div>",
    img("House", "HOUSE"), img("Graves", "GRAVES"), img("Tree", "TREE"),
    f"<div class=\"Hlw__Ground\" style=\"--grass: url('{A['GRASS']}'); --aspect: {R['GRASS']:.4f}\"></div>",
    img("Witch", "WITCH"), img("Lute", "LUTE"),
    f'<div class="Hlw__ZombieWalk">{img("Zombie", "ZOMBIE")}</div>',
    notes, '<div class="Hlw__Scrim"></div>',
])
top = img("Web", "WEB") + img("Branch", "BRANCH") + bats
logo = img("Logo", "LOGO")

expr = f"""(() => {{
  const P = document.querySelector('#SpicyLyricsPage');
  if (!P) return {{ok: false, why: 'page not open'}};
  const box = P.querySelector('.ContentBox');
  const anchor = P.querySelector('.ContentBox > .HalloweenScene') || box.querySelector(':scope > .BrandedHeader');
  const where = anchor ? anchor.previousElementSibling : null;
  P.querySelectorAll('.HalloweenScene, .HalloweenTop, .HalloweenLogo').forEach(e => e.remove());
  const html = `<div class="HalloweenScene" aria-hidden="true">${{{json.dumps(scene)}}}</div>`
    + `<div class="HalloweenTop" aria-hidden="true">${{{json.dumps(top)}}}</div>`
    + `<div class="HalloweenLogo" aria-hidden="true">${{{json.dumps(logo)}}}</div>`;
  // Same slot as the real build: after CanvasAmbient, before BrandedHeader.
  if (where) where.insertAdjacentHTML('afterend', html); else box.insertAdjacentHTML('afterbegin', html);
  let s = document.getElementById('hlw-preview');
  if (!s) {{ s = document.createElement('style'); s.id = 'hlw-preview'; document.head.appendChild(s); }}
  s.textContent = {json.dumps(css)};
  return {{ok: true, layers: [...box.querySelectorAll(':scope > .HalloweenScene, :scope > .HalloweenTop, :scope > .HalloweenLogo')].map(e => e.className), cssChars: s.textContent.length}};
}})()"""
print(json.dumps(Page().eval(expr)))
