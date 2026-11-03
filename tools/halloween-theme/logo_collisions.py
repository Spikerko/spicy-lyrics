"""Does the moved logo collide with the moon or the bats? (CSS formulas)

In the v1.1 design the LOGO box overlaps the moon's lower-left edge (the
logo is drawn in front of it, z 5 vs scene z 1), so some overlap is by
design. This reports the overlap share so it can be compared with the design.
Bats must stay fully above the logo.
"""

D_LOGO = (1007, 169, 1574, 397)
for W, H in [(1920, 1080), (1280, 720), (1740, 917), (2560, 1440), (3440, 1440), (2560, 1080), (1024, 768)]:
    cw, ch = W / 100, H / 100
    nbw = min(30 * cw, 52 * ch) * 1.1
    ll = 50 * cw - nbw / 4 * 0.3
    col = W - ll
    h = min(21 * ch, col * 0.56 / 1.93)
    w = h * 1.93
    cx = ll + col * 0.375
    L, T, R, B = cx - w / 2, 15.6 * ch, cx + w / 2, 15.6 * ch + h
    mh = min(max(120, 26 * ch), 420)
    mr = W - 12 * cw
    ml = mr - mh
    mt, mb = 2 * ch, 2 * ch + mh
    ov = max(0, min(R, mr) - max(L, ml)) * max(0, min(B, mb) - max(T, mt))
    bats_bottom = 1 * ch + 3 * 1.6 * ch + min(max(16, 3.6 * ch), 48) + 1.2 * ch  # + drift
    print(f"{W}x{H:<5} logo {L:.0f}-{R:.0f} x {T:.0f}-{B:.0f} | moon {ml:.0f}-{mr:.0f} x {mt:.0f}-{mb:.0f} | "
          f"logo over moon box {ov / (w * h) * 100:4.1f}% | bats bottom {bats_bottom:.0f} {'<' if bats_bottom < T else '>='} logo top {T:.0f}")

# The design itself, for reference: moon in the mockup sits around x 1445-1655, y 55-265.
dm = (1445, 55, 1655, 265)
dov = max(0, min(D_LOGO[2], dm[2]) - max(D_LOGO[0], dm[0])) * max(0, min(D_LOGO[3], dm[3]) - max(D_LOGO[1], dm[1]))
print(f"design reference: LOGO box over moon {dov / ((D_LOGO[2] - D_LOGO[0]) * (D_LOGO[3] - D_LOGO[1])) * 100:.1f}%")
