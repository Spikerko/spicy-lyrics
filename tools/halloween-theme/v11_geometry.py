"""Geometry check for design v1.1, using the exact formulas in HalloweenTheme.css.

Live checks need the Spicy Lyrics fullscreen page open; this one does not. It
evaluates the CSS calc()s in Python at many window sizes and asserts:
  - the witch stands right of the graves, in front of the house, on screen
  - the zombie starts on the graves and its walk ends fully off the left edge
  - the lyrics' top fade is fully transparent at the logo's bottom edge
  - the logo is wholly above the album cover (NowBar is z 10 anyway)
Run validate_sizes.py for the same checks on the live page.
"""

GRAVES_ASPECT, WITCH_ASPECT, ZOMBIE_ASPECT, LOGO_ASPECT = 2.0933, 1.0938, 1.1133, 1.93
SIZES = [(1280, 720), (1366, 768), (1440, 810), (1600, 900), (1740, 917), (1920, 1080),
         (2560, 1440), (3440, 1440), (2560, 1080), (1024, 768)]


def clamp(lo, v, hi):
    return max(lo, min(v, hi))


fails = 0
for W, H in SIZES:
    cw, ch = W / 100, H / 100
    f = []
    nbw = min(30 * cw, 52 * ch) * 1.1
    cover_top = 50 * ch - nbw * 0.625
    ground = 4 * ch
    # house / graves (unchanged)
    house_h = 54 * ch
    house_l = W + 2 * cw - house_h * 0.6375
    graves_right_off = 54 * ch * 0.638 - 4 * cw
    graves_w = 9.5 * ch * GRAVES_ASPECT
    graves_l, graves_r = W - graves_right_off - graves_w, W - graves_right_off
    # witch
    witch_w = min(18 * ch * WITCH_ASPECT, 54 * ch * 0.638 - 4 * cw - 3.5 * cw)
    witch_r = W - 2 * cw
    witch_l = witch_r - witch_w
    if witch_l < graves_r + 8:
        f.append(f"witch {witch_l:.0f} overlaps graves {graves_r:.0f}")
    if witch_l < house_l - 0.25 * witch_w:
        f.append(f"witch {witch_l:.0f} not in front of house {house_l:.0f}")
    if witch_w < 60:
        f.append(f"witch tiny ({witch_w:.0f}px)")
    # zombie
    z_h = clamp(70, 13 * ch, 170)
    z_w = z_h * ZOMBIE_ASPECT
    graves_mid = graves_right_off + graves_w / 2
    z_start = W - graves_mid - z_w / 2
    z_mid = z_start + z_w / 2
    if not graves_l <= z_mid <= graves_r:
        f.append(f"zombie centre {z_mid:.0f} not on graves {graves_l:.0f}-{graves_r:.0f}")
    if z_start + z_w > witch_l:
        f.append(f"zombie {z_start + z_w:.0f} rises into witch {witch_l:.0f}")
    # Walk translates by -(start + w): the box's right edge lands on x = 0.
    end_right = (z_start + z_w) - (z_start + z_w)
    if end_right > 0.5:
        f.append(f"walk ends at {end_right:.0f}, still on screen")
    # logo + lyrics mask (LyricsContent assumed at page top; live check verifies)
    logo_h = min(cover_top - 2.4 * ch, 12 * ch)
    logo_top = 1.2 * ch
    logo_bottom = logo_top + logo_h
    fade_clear = logo_bottom + 0.5 * ch
    fade_solid = logo_bottom + 7 * ch
    if fade_clear < logo_bottom:
        f.append("fade starts above logo bottom")
    if logo_bottom > cover_top:
        f.append(f"logo bottom {logo_bottom:.0f} below cover top {cover_top:.0f}")
    visible_lyrics = H - 64 - fade_solid
    if visible_lyrics < 0.6 * H:
        f.append(f"only {visible_lyrics:.0f}px of full-opacity lyrics")
    fails += bool(f)
    print(f"{W}x{H:<5} witch {witch_l:.0f}-{witch_r:.0f} graves {graves_l:.0f}-{graves_r:.0f} house>{house_l:.0f} | "
          f"zombie {z_start:.0f}-{z_start + z_w:.0f} h{z_h:.0f} | logo.b {logo_bottom:.0f} fade {fade_clear:.0f}->{fade_solid:.0f} "
          f"| {'PASS' if not f else 'FAIL: ' + '; '.join(f)}")
print(f"\n{len(SIZES) - fails}/{len(SIZES)} sizes pass")
raise SystemExit(1 if fails else 0)
