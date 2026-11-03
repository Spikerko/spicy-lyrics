"""Real-time evidence for the zombie loop (no seeking).

Samples the zombie's on-screen box once a second for 27s, longer than one 24s
cycle, then asserts the requested behaviour from what was observed:
  1. it rises out of the ground at the graves (image top moves up while its
     horizontal centre is over the graves),
  2. it then moves left (x never increases while visible),
  3. it fades to invisible at/through the left edge,
  4. it reappears at the graves (the loop restarts).
"""

import json
import time

from cdp import Page

PROBE = r"""(() => {
  const P = document.querySelector('#SpicyLyricsPage');
  const z = P.querySelector('.Hlw__Zombie'), w = P.querySelector('.Hlw__ZombieWalk');
  const b = z.getBoundingClientRect(), g = P.querySelector('.Hlw__Graves').getBoundingClientRect();
  return {x: b.left, cx: b.left + b.width / 2, top: b.top, clip: w.getBoundingClientRect().bottom,
          wx: w.getBoundingClientRect().left,
          op: +getComputedStyle(w).opacity, gl: g.left, gr: g.right, t: w.getAnimations()[0].currentTime % 24000};
})()"""

p = Page()
s = []
for _ in range(27):
    s.append(p.eval(PROBE))
    time.sleep(1)
json.dump(s, open("zombie_rt.json", "w"), indent=0)

for r in s:
    print(f"t={r['t'] / 1000:5.1f}s  walk.x={r['wx']:7.0f}  img.x={r['x']:7.0f}  top={r['top']:6.0f}  opacity={r['op']:.2f}")

vis = [r for r in s if r["op"] > 0.05]
at_graves = [r for r in vis if r["gl"] <= r["cx"] <= r["gr"]]
rising = [(a, b) for a, b in zip(s, s[1:]) if a["gl"] <= a["cx"] <= a["gr"] and b["top"] < a["top"] - 2 and abs(b["wx"] - a["wx"]) < 1]
# Walk direction from the walk box: the image also rocks +-4deg (the lurch),
# which shifts its rotated bounding box by ~10px either way.
moved_right = [(a, b) for a, b in zip(s, s[1:]) if a["op"] > 0.05 and b["op"] > 0.05 and b["wx"] > a["wx"] + 0.5 and b["t"] > a["t"]]
left_fade = [r for r in s if r["op"] < 0.05 and r["x"] < 0]
restart = [(a, b) for a, b in zip(s, s[1:]) if a["x"] < 200 and b["gl"] <= b["cx"] <= b["gr"]]
peak_left = min(r["x"] for r in vis)

checks = [
    ("rises out of the ground at the graves", bool(rising), f"{len(rising)} rising steps, top {max(r['top'] for r in at_graves):.0f}->{min(r['top'] for r in at_graves):.0f}" if at_graves else "never at graves"),
    ("walks left only (never right while visible)", not moved_right, f"{len(moved_right)} rightward steps"),
    ("reaches the left side while visible", peak_left < 300, f"leftmost visible x {peak_left:.0f}"),
    ("fades out at the left edge", bool(left_fade), f"{len(left_fade)} invisible samples off-screen left"),
    ("loops back to the graves", bool(restart), f"{len(restart)} restarts observed"),
]
for name, ok, why in checks:
    print(f"{'PASS' if ok else 'FAIL'}  {name}: {why}")
print(f"{sum(c[1] for c in checks)}/{len(checks)} zombie behaviours observed in real time")
