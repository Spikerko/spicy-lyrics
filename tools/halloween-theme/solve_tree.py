"""Solve for a tree size and offset that satisfies every constraint at once,
using the measured artwork extents. Prints the CSS-ready numbers."""

from layout_model import layout

TREE_ASPECT = 0.6190
ROOTS = (0.206, 0.860)    # root flare, rows 0.55-1.0
TRUNK = (0.38, 0.73)      # trunk at mid height
CANOPY_RIGHT = 0.993

SIZES = [(1920, 1080), (1740, 917), (1600, 900), (1440, 810), (1366, 768), (1280, 720), (2560, 1440), (3440, 1440)]

print("Constraint: roots inside [0, cover_left - margin], canopy right <= cover_left.")
print("The root flare is 65% of the width, the strip is NowBarLeftSpacing wide, so")
print("width <= strip / 0.86 keeps the roots on screen when the root's right edge")
print("touches the strip's right side.\n")
for w, h in SIZES:
    L = layout(w, h)
    strip = L["left_strip"]
    cqh, cqw = h / 100, w / 100
    # Largest width where the roots fit: left root edge >= -15% of width allowed
    # off-screen (looks like the trunk enters from the edge), right roots end 2cqw
    # before the cover.
    margin = 2 * cqw
    max_w_roots = (strip - margin) / (ROOTS[1] - 0.0)
    tree_w = min(max_w_roots, 64 * cqh * TREE_ASPECT)
    tree_h = tree_w / TREE_ASPECT
    left = strip - margin - tree_w * ROOTS[1]
    canopy_right = left + tree_w * CANOPY_RIGHT
    trunk_center = left + tree_w * (TRUNK[0] + TRUNK[1]) / 2
    print(
        f"{w}x{h:<5} strip {strip:5.0f}  tree {tree_w:4.0f}x{tree_h:4.0f} ({tree_h / h:.0%} of height)  "
        f"left {left:6.0f}  trunk centre {trunk_center:5.0f}  canopy right {canopy_right:5.0f} "
        f"(cover {strip:5.0f}{', canopy overlaps cover' if canopy_right > strip else ''})"
    )
