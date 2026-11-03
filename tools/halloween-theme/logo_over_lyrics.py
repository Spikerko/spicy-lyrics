"""Pixel evidence: logo drawn over lyrics, and lyrics faded before the logo.

Requirement (option 2): the Spooky logo is on top of the lyrics, and lyrics
fade out before reaching it, so there are no half-hidden words.

On the live page, no playback calls, everything restored:
  1. Pin the scroll so the ACTIVE lyric line (opacity 1; sung lines are
     opacity 0 in this view) runs straight through the logo.
  2. Find the logo's opaque pixels: screenshot with the logo shown vs hidden.
  3. For each configuration, screenshot lyrics shown vs lyrics hidden
     (opacity 0 on .LyricsContainer) and measure:
       - ON-LOGO: % of the logo's opaque pixels changed by the lyrics
         (0 means nothing draws over the logo),
       - IN-BOX: % of the whole logo box changed (lyrics visible anywhere in
         the logo's area, e.g. through its transparent gaps),
       - row profile of lyric strength from the logo's bottom edge down.
  Configurations: v1.1 as shipped; control A = stock lyrics mask (logo still
  on top); control B = stock mask with the logo under the lyrics (old z 3).
"""

import base64
import io

import numpy as np
from PIL import Image

from cdp import Page

p = Page()


def shot(clip):
    clip = {k: round(v) for k, v in clip.items()}
    d = p.call("Page.captureScreenshot", format="png", clip={**clip, "scale": 1})["data"]
    return np.asarray(Image.open(io.BytesIO(base64.b64decode(d))).convert("RGB")).astype(int)


setup = p.eval(r"""(async () => {
  const P = document.querySelector('#SpicyLyricsPage');
  const logo = P.querySelector('.Hlw__Logo').getBoundingClientRect();
  const sc = P.querySelector('.LyricsContent .simplebar-content-wrapper') || P.querySelector('.LyricsContent');
  const glyph = (l) => { const g = document.createRange(); g.selectNodeContents(l); return g.getBoundingClientRect(); };
  const t = [...P.querySelectorAll('.LyricsContent .line')].find(l => l.classList.contains('Active') && +getComputedStyle(l).opacity > 0.9);
  if (!t) return {ok: false};
  window.__hlw = {sc, orig: sc.scrollTop, t};
  // Put the line's first text row across the logo's middle.
  sc.scrollTop += glyph(t).top - (logo.top + logo.height * 0.35);
  window.__hlw.pin = sc.scrollTop;
  await new Promise(r => setTimeout(r, 300));
  const g = glyph(t);
  return {ok: true, logo: {x: logo.left, y: logo.top, width: logo.width, height: logo.height},
          below: {x: logo.left, y: logo.bottom, width: logo.width, height: innerHeight * 0.12},
          line: [g.left, g.top, g.right, g.bottom], text: t.textContent.slice(0, 20)};
})()""")
if not setup["ok"]:
    raise SystemExit("no active lyric line to test with")
print("line", setup["text"], [round(v) for v in setup["line"]], "logo", {k: round(v) for k, v in setup["logo"].items()})

PIN = "(async () => { window.__hlw.sc.scrollTop = window.__hlw.pin; await new Promise(r => setTimeout(r, 250)); return Math.round(window.__hlw.t.getBoundingClientRect().top); })()"
LYR = "document.querySelector('#SpicyLyricsPage .LyricsContainer').style.opacity"
LOGO = "document.querySelector('#SpicyLyricsPage .Hlw__Logo').style.opacity"

# Opaque logo pixels, with lyrics hidden so they cannot interfere.
p.eval(f"({LYR} = '0', 1)")
p.eval(PIN)
with_logo = shot(setup["logo"])
p.eval(f"({LOGO} = '0', 1)")
p.eval(PIN)
without_logo = shot(setup["logo"])
p.eval(f"({LOGO} = '', {LYR} = '', 1)")
opaque = np.abs(with_logo - without_logo).max(2) > 40
print(f"logo opaque pixels: {opaque.mean() * 100:.1f}% of its box")


def measure(label):
    p.eval(f"({LYR} = '', 1)")
    top = p.eval(PIN)
    a_logo, a_below = shot(setup["logo"]), shot(setup["below"])
    p.eval(f"({LYR} = '0', 1)")
    p.eval(PIN)
    b_logo, b_below = shot(setup["logo"]), shot(setup["below"])
    p.eval(f"({LYR} = '', 1)")
    d_logo = np.abs(a_logo - b_logo).max(2)
    d_below = np.abs(a_below - b_below).max(2)
    on_logo = float((d_logo[opaque] > 24).mean() * 100)
    in_box = float((d_logo > 24).mean() * 100)
    rows = d_below.max(1)  # strongest lyric pixel per row under the logo
    prof = [int(rows[i]) for i in range(0, len(rows), max(1, len(rows) // 8))]
    print(f"{label:30} line top {top}: ON-LOGO {on_logo:5.2f}%  IN-BOX {in_box:5.2f}%  strength below logo (rows down) {prof}")
    return on_logo, in_box, rows


try:
    v11 = measure("v1.1 (logo z5 + fade)")
    p.eval("""(() => { const s = document.createElement('style'); s.id = 'NegCtlMask';
      s.textContent = '#SpicyLyricsPage.Exp_HalloweenTheme.Fullscreen .LyricsContainer .LyricsContent{--ImageMask:linear-gradient(180deg,transparent 0,transparent 16px,var(--spice-sidebar) 64px,var(--spice-sidebar) calc(100% - 64px),transparent calc(100% - 16px),transparent) !important}';
      document.head.append(s); return 1; })()""")
    ctl_a = measure("control A: stock mask, z5")
    p.eval("(document.querySelector('#SpicyLyricsPage .HalloweenLogo').style.zIndex = '3', 1)")
    ctl_b = measure("control B: stock mask, z3")
finally:
    p.eval(f"""(() => {{ const s = document.getElementById('NegCtlMask'); s && s.remove();
      document.querySelector('#SpicyLyricsPage .HalloweenLogo').style.zIndex = '';
      {LYR} = ''; {LOGO} = '';
      window.__hlw.sc.scrollTop = window.__hlw.orig; return 1; }})()""")

n = 12  # first rows right under the logo
checks = [
    ("v1.1: nothing draws over the logo", v11[0] < 0.5, f"{v11[0]:.2f}% of logo pixels changed"),
    ("v1.1: no lyric visible anywhere in the logo box", v11[1] < 0.5, f"{v11[1]:.2f}% of box changed"),
    ("v1.1: lyrics invisible right under the logo", v11[2][:n].max() < 24, f"max strength {v11[2][:n].max()} in first {n} rows"),
    ("v1.1: lyrics come back further down (fade, not cut)", v11[2][-n:].max() > 60, f"max strength {v11[2][-n:].max()} in last {n} rows"),
    ("control A: stock mask shows lyrics in the logo box", ctl_a[1] > 1, f"{ctl_a[1]:.2f}%"),
    ("control A: logo z5 still covers its own pixels", ctl_a[0] < 0.5, f"{ctl_a[0]:.2f}%"),
    ("control B: logo under lyrics gets painted over", ctl_b[0] > 1, f"{ctl_b[0]:.2f}%"),
]
for name, ok, why in checks:
    print(f"{'PASS' if ok else 'FAIL'}  {name}: {why}")
print(f"{sum(c[1] for c in checks)}/{len(checks)} logo/lyrics checks")
