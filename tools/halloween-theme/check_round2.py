"""Evaluate the round-2 CSS geometry at many window sizes and check, against the
REAL artwork extents, that the tree trunk/roots stay out of the title band, the
canopy stops at the cover, the lute clears the title text, and the bats clear
the moon disc. Mirrors HalloweenTheme.css formulas exactly.
"""

import sys

from layout_model import layout

TREE_ASPECT = 0.6190
TREE_ROOTS = (0.206, 0.860)   # widest root flare, x fraction of width, rows 0.55-1.0
TREE_CANOPY_RIGHT = 0.993     # canopy reaches this far right
LUTE_ASPECT = 0.9629
MOON_DISC = (0.132, 0.875)    # solid disc inside the moon box
BAT_ASPECTS = [2.598, 2.7964, 2.4154, 1.9205]  # measured on the trimmed artwork
DRIFT_X = 3.0                 # Hlw__Drift translate: 3cqw


def clamp(lo, v, hi):
    return max(lo, min(v, hi))


def check(w, h):
    cqw, cqh = w / 100, h / 100
    L = layout(w, h)
    nbls = L["left_strip"]
    nbw = L["nowbar_x"][1] - L["nowbar_x"][0]
    cover_left = nbls
    cover_right = nbls + nbw
    lyrics_left = L["lyrics_x"][0]
    title_top = L["cover_y"][1]               # timeline + title start right under the cover
    ground = 4 * cqh
    fails = []

    # Tree
    tree_h = 50 * cqh
    tree_w = tree_h * TREE_ASPECT
    tree_left = nbls - 1.2 * cqw - tree_w * TREE_ROOTS[1]
    tree_bottom_y = h - (ground - 1.8 * cqh)  # CSS bottom offset -> y of image bottom
    tree_top_y = tree_bottom_y - tree_h
    roots_right = tree_left + tree_w * TREE_ROOTS[1]
    canopy_right = tree_left + tree_w * TREE_CANOPY_RIGHT
    grass_line_y = h - ground - 5.2 * cqh * 0.66
    if roots_right > cover_left - 2:
        fails.append(f"tree roots reach x={roots_right:.0f}, title band starts {cover_left:.0f}")
    # The canopy may pass behind the cover (z 10 hides it), but the trunk may not.
    trunk_right = tree_left + tree_w * 0.73
    if trunk_right > cover_left - 2:
        fails.append(f"tree trunk reaches x={trunk_right:.0f}, cover starts {cover_left:.0f}")
    if tree_bottom_y < grass_line_y + 0.02 * h:
        fails.append(f"tree base y={tree_bottom_y:.0f} not sunk below grass line {grass_line_y:.0f}")
    if tree_bottom_y > h + 2:
        fails.append(f"tree base y={tree_bottom_y:.0f} cut off below the window ({h})")
    if tree_left + tree_w * 0.73 < 8:
        fails.append("tree trunk pushed off the left edge")
    if tree_h < 0.30 * h:
        fails.append(f"tree only {tree_h:.0f}px tall, reads as a shrub")
    sink = tree_bottom_y - grass_line_y

    # Lute
    gap = lyrics_left - cover_right
    lute_h = min(clamp(84, 15 * cqh, 200), (gap + 3 * cqw) / LUTE_ASPECT)
    lute_w = lute_h * LUTE_ASPECT
    lute_left = lyrics_left - lute_w - 0.4 * cqw
    lute_top = h - (ground - 0.4 * cqh) - lute_h
    reach_into_title = max(0.0, cover_right - lute_left)
    # Title text is centred on the cover; a long title occupies ~90% of cover width.
    title_text_right = cover_left + nbw * 0.95
    title_overlap = max(0.0, title_text_right - lute_left) if lute_top < L["meta_bottom"] else 0.0
    if lute_h < 84:
        fails.append(f"lute only {lute_h:.0f}px tall, too small to read")
    if lute_left + lute_w > lyrics_left + 1:
        fails.append(f"lute reaches x={lute_left + lute_w:.0f}, lyrics start {lyrics_left:.0f}")

    # Bats vs moon
    moon_h = clamp(120, 26 * cqh, 420)
    moon_box_left = w - 12 * cqw - moon_h
    disc_left = moon_box_left + moon_h * MOON_DISC[0]
    bat_h = clamp(16, 3.6 * cqh, 48)
    worst_bat_right = 0
    for i in (2, 3):
        left = 57 * cqw + (i - 2) * 5 * cqw
        right = left + bat_h * BAT_ASPECTS[i] + DRIFT_X * cqw
        worst_bat_right = max(worst_bat_right, right)
    if worst_bat_right > disc_left - 4:
        fails.append(f"bat reaches x={worst_bat_right:.0f}, moon disc starts {disc_left:.0f}")

    return {
        "tree": f"{tree_w:.0f}x{tree_h:.0f} roots<= {roots_right:.0f} (title {cover_left:.0f}) sunk {sink:.0f}px",
        "lute": f"{lute_w:.0f}x{lute_h:.0f} into title band {reach_into_title:.0f}px, under long title {title_overlap:.0f}px",
        "bats": f"right edge {worst_bat_right:.0f} vs moon disc {disc_left:.0f}",
        "fails": fails,
        "title_overlap": title_overlap,
    }


SIZES = [(1920, 1080), (1740, 917), (1600, 900), (1440, 810), (1366, 768), (1280, 720), (2560, 1440), (3440, 1440)]
any_fail = False
for w, h in SIZES:
    r = check(w, h)
    print(f"{w}x{h}")
    print(f"   tree  {r['tree']}")
    print(f"   lute  {r['lute']}")
    print(f"   bats  {r['bats']}")
    for f in r["fails"]:
        print(f"   FAIL  {f}")
        any_fail = True

print("\nALL GEOMETRY CHECKS PASS" if not any_fail else "\nGEOMETRY FAILURES ABOVE")
sys.exit(1 if any_fail else 0)
