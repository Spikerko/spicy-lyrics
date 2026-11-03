import re

js = open(r"D:\NGODING\spicy-lyrics\dist\spicy-lyrics.js", encoding="utf-8", errors="replace").read()

m = re.search(r'<div class="ContentBox">.{0,60}?\$\{(\w+)\(\)\}', js, re.S)
fn = m.group(1)
print("first slot calls:", fn)
i = js.find(f"function {fn}(")
print("definition:", ascii(js[i : i + 260]) if i >= 0 else "not a 'function' decl")
j = re.search(rf"\b{re.escape(fn)}\s*=\s*", js)
print("assignment form:", ascii(js[j.start() : j.start() + 200]) if j else None)

k = js.find("Exp_HalloweenTheme.Fullscreen:")
print("\nfirst ':'-qualified selector:", ascii(js[k : k + 160]))
print("\ndata URIs by kind:", {kind: len(re.findall(rf'"data:image/{kind};base64,', js)) for kind in ("png", "webp")})
print("data URIs any quote:", len(re.findall(r"data:image/(?:png|webp);base64,", js)))
