"""Where the moved logo lands at many window sizes, vs the v1.1 design box.

Evaluates the exact calc()s from HalloweenTheme.css (logo + layout vars).
Design reference at 1920x1080: LOGO box x 1007-1574, y 169-397.
"""

DESIGN = (1007, 169, 1574, 397)
fails = 0
for W, H in [(1920, 1080), (1280, 720), (1366, 768), (1440, 810), (1600, 900), (1740, 917),
             (2560, 1440), (3440, 1440), (2560, 1080), (1024, 768)]:
    cw, ch = W / 100, H / 100
    nbw = min(30 * cw, 52 * ch) * 1.1
    lyrics_left = 50 * cw - nbw / 4 * 0.3
    col = W - lyrics_left
    h = min(21 * ch, col * 0.56 / 1.93)
    w = h * 1.93
    cx = lyrics_left + col * 0.375
    top = 15.6 * ch
    box = (cx - w / 2, top, cx + w / 2, top + h)
    moon_left = W - 12 * cw - min(max(120, 26 * ch), 420)
    f = []
    if box[0] < lyrics_left - 1:
        f.append("starts left of the lyrics column")
    if box[2] > W:
        f.append("off screen right")
    if box[3] > 0.45 * H:
        f.append("runs into the lyric area")
    if (W, H) == (1920, 1080):
        # The grey box is 2.49:1, the logo art 1.93:1: the logo fills the box's
        # height and is centred in it, so compare centre, top, bottom, and
        # require it to sit inside the box.
        dcx = abs((box[0] + box[2]) / 2 - (DESIGN[0] + DESIGN[2]) / 2)
        dt, db = abs(box[1] - DESIGN[1]), abs(box[3] - DESIGN[3])
        inside = box[0] >= DESIGN[0] and box[2] <= DESIGN[2]
        if max(dcx, dt, db) > 6 or not inside:
            f.append(f"centre off {dcx:.0f}px, top {dt:.0f}px, bottom {db:.0f}px, inside box {inside}")
        note = f"  vs design box {DESIGN}: centre off {dcx:.0f}px, top {dt:.0f}px, bottom {db:.0f}px, inside {inside}"
    else:
        note = ""
    fails += bool(f)
    print(f"{W}x{H:<5} logo x {box[0]:.0f}-{box[2]:.0f} y {box[1]:.0f}-{box[3]:.0f} ({w:.0f}x{h:.0f})  lyrics col from {lyrics_left:.0f}"
          f"  {'PASS' if not f else 'FAIL: ' + '; '.join(f)}{note}")
print(f"\n{10 - fails}/10 sizes pass")
raise SystemExit(1 if fails else 0)
