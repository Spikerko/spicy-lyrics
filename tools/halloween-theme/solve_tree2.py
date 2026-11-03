"""Second pass: the trunk, not the whole root flare, must stay in the strip.

The left half of the root flare may run off the window's left edge (the tree
then reads as growing at the frame edge, a common illustration framing). The
trunk and the right side of the roots must stay clear of the title band, and
the canopy may reach over the cover's left edge: the cover is z 10, so the
canopy simply sits behind it.
"""

from layout_model import layout

ASPECT = 0.6190
ROOTS_R = 0.860
TRUNK = (0.38, 0.73)


def solve(w, h, frac):
    cqh, cqw = h / 100, w / 100
    strip = layout(w, h)["left_strip"]
    tree_h = frac * h
    tree_w = tree_h * ASPECT
    margin = 1.2 * cqw
    left = strip - margin - tree_w * ROOTS_R          # right roots end before the title band
    trunk = (left + tree_w * TRUNK[0], left + tree_w * TRUNK[1])
    canopy_right = left + tree_w * 0.993
    return tree_w, tree_h, left, trunk, canopy_right, strip


for frac in (0.50, 0.55, 0.60):
    print(f"\ntree height = {frac:.0%} of window")
    ok = True
    for w, h in [(1920, 1080), (1740, 917), (1600, 900), (1440, 810), (1366, 768), (1280, 720), (2560, 1440), (3440, 1440)]:
        tw, th, left, trunk, cr, strip = solve(w, h, frac)
        trunk_visible = trunk[1] > 8                     # some trunk stays on screen
        trunk_mostly = trunk[0] > -0.5 * (trunk[1] - trunk[0])
        flag = "" if trunk_visible and trunk_mostly else "  <- trunk off screen"
        ok &= trunk_visible and trunk_mostly
        print(f"  {w}x{h:<5} {tw:4.0f}x{th:4.0f} left {left:6.0f} trunk {trunk[0]:5.0f}-{trunk[1]:4.0f} strip {strip:4.0f}{flag}")
    print("  -> all sizes keep the trunk on screen" if ok else "  -> fails")
