import re

js = open(r"D:\NGODING\spicy-lyrics\dist\spicy-lyrics.js", encoding="utf-8", errors="replace").read()

# 1. Is the CompactMode / right-side guard present in any minified form?
for needle in ("CompactMode", "ForcedCompactMode", "NowBarSide__Right"):
    hits = [m.start() for m in re.finditer(needle, js)]
    near = [h for h in hits if "Exp_HalloweenTheme" in js[max(0, h - 120) : h]]
    print(f"{needle:18} total {len(hits):3}  near Exp_HalloweenTheme {len(near)}")
    if near:
        h = near[0]
        print("   ", ascii(js[h - 90 : h + 110]))

# 2. Which data URIs exist, and which quote style wraps each?
print()
for m in re.finditer(r"(.)data:image/(png|webp);base64,([A-Za-z0-9+/=]{0,40})", js):
    print(f"   quote {m.group(1)!r:5} {m.group(2):4}  starts {m.group(3)[:24]}")
