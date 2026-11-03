"""Hot-swap the new Halloween stylesheet and tile images into the running page.

No reload and no playback calls, so the user's listening is not interrupted.
The swap is undone on the next normal reload, which loads the installed build.
"""

import json
import os
import re
import subprocess
import sys

from cdp import Page

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))

# Take the rule text straight from the built bundle, where it is already
# minified: from the first Halloween selector to the end of the last rule that
# mentions Exp_HalloweenTheme (the portrait @container block closes with "}}").
js = open(os.path.join(REPO, "dist", "spicy-lyrics.js"), encoding="utf-8", errors="replace").read()
start = js.find("#SpicyLyricsPage .HalloweenScene")
last = js.rfind("Exp_HalloweenTheme")
end = js.find("}}", last) + 2
css = js[start:end]
if start < 0 or end <= start or len(css) < 2000 or "@keyframes Hlw__Rise" not in css:
    sys.exit(f"could not extract Halloween CSS from bundle ({start}, {end}, {len(css)} chars)")

assets = open(os.path.join(REPO, "src", "components", "Utils", "HalloweenAssets.ts"), encoding="utf-8").read()
clouds = re.search(r'export const CLOUDS = "([^"]+)"', assets).group(1)
clouds_aspect = re.search(r"export const CLOUDS_ASPECT = ([\d.]+)", assets).group(1)
grass = re.search(r'export const GRASS = "([^"]+)"', assets).group(1)
grass_aspect = re.search(r"export const GRASS_ASPECT = ([\d.]+)", assets).group(1)

expr = f"""(() => {{
  let s = document.getElementById("hlw-preview");
  if (!s) {{ s = document.createElement("style"); s.id = "hlw-preview"; document.head.appendChild(s); }}
  s.textContent = {json.dumps(css)};
  const c = document.querySelector("#SpicyLyricsPage .Hlw__Clouds");
  const g = document.querySelector("#SpicyLyricsPage .Hlw__Ground");
  if (c) {{ c.style.setProperty("--cloud", "url('{clouds}')"); c.style.setProperty("--aspect", "{clouds_aspect}"); }}
  if (g) {{ g.style.setProperty("--grass", "url('{grass}')"); g.style.setProperty("--aspect", "{grass_aspect}"); }}
  return {{ cssChars: s.textContent.length, clouds: !!c, ground: !!g }};
}})()"""

print(json.dumps(Page().eval(expr)))
