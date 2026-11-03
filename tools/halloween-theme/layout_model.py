"""Evaluate Spicy Lyrics' own fullscreen layout formulas at any window size.

Formulas copied from the live page (fullscreen, NowBar left, lyrics showing):
  NowBarWidth          = min(30cqw, 52cqh) * 1.1
  NowBarRightSpacing   = NowBarWidth / 4
  NowBarLeftSpacing    = 50cqw - NowBarWidth - NowBarRightSpacing
  LyricsLeftSidePadding  = 50cqw - NowBarRightSpacing * 0.3
  LyricsRightSidePadding = NowBarLeftSpacing * 0.35
Cover top / metadata bottom come from padding-top = 50cqh - NowBarWidth*0.625
plus the measured stack (cover NowBarWidth tall, timeline 58, metadata 79).

Run it to print the free gaps the Halloween scene can use. Checked against the
live measurement at 1740x917 (nowBar 214-739, lines from 831).
"""


def layout(w, h):
    cqw, cqh = w / 100, h / 100
    nbw = min(30 * cqw, 52 * cqh) * 1.1
    nb_right_sp = nbw / 4
    nb_left_sp = 50 * cqw - nbw - nb_right_sp
    lyr_left = 50 * cqw - nb_right_sp * 0.3
    lyr_right_pad = nb_left_sp * 0.35
    cover_top = 50 * cqh - nbw * 0.625
    return {
        "nowbar_x": (nb_left_sp, nb_left_sp + nbw),
        "cover_y": (cover_top, cover_top + nbw),
        "meta_bottom": cover_top + nbw + 58 + 79,
        "lyrics_x": (lyr_left, w - lyr_right_pad),
        "left_strip": nb_left_sp,
        "gap": (nb_left_sp + nbw, lyr_left),
        "top_band": cover_top,
        "bottom_band": h - (cover_top + nbw + 58 + 79),
    }


if __name__ == "__main__":
    live = layout(1740, 917)
    print("check vs live 1740x917:", {k: tuple(round(x) for x in v) if isinstance(v, tuple) else round(v) for k, v in live.items()})
    for w, h in [(1920, 1080), (1740, 917), (1600, 900), (1440, 810), (1366, 768), (1280, 720), (2560, 1440), (1080, 1920)]:
        L = layout(w, h)
        print(
            f"{w}x{h:<5} left strip {L['left_strip']:6.0f}  gap {L['gap'][1] - L['gap'][0]:5.0f}  "
            f"top band {L['top_band']:5.0f}  bottom band {L['bottom_band']:5.0f}  lyrics {L['lyrics_x'][0]:.0f}-{L['lyrics_x'][1]:.0f}"
        )
