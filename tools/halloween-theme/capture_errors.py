"""Collect console errors and exceptions from the Spotify page while it reloads.

Usage: python capture_errors.py [seconds]
"""

import json
import sys
import time

from cdp import Page

secs = float(sys.argv[1]) if len(sys.argv) > 1 else 20
p = Page()
p.call("Runtime.enable")
p.call("Log.enable")
p.ws.settimeout(1)
p.call("Page.enable")
p.call("Page.reload", ignoreCache=False)

seen = []
end = time.time() + secs
while time.time() < end:
    try:
        msg = json.loads(p.ws.recv())
    except Exception:  # noqa: BLE001 - timeout tick
        continue
    m = msg.get("method")
    prm = msg.get("params", {})
    if m == "Runtime.exceptionThrown":
        d = prm["exceptionDetails"]
        seen.append(("EXCEPTION", (d.get("exception", {}) or {}).get("description", d.get("text", ""))[:400], d.get("url", "")))
    elif m == "Runtime.consoleAPICalled" and prm.get("type") in ("error", "assert"):
        text = " ".join(str(a.get("value", a.get("description", ""))) for a in prm.get("args", []))
        seen.append(("console.error", text[:400], ""))
    elif m == "Log.entryAdded" and prm["entry"]["level"] == "error":
        e = prm["entry"]
        seen.append(("log", e.get("text", "")[:400], e.get("url", "")))

state = p.eval("({ready: !!window.Spicetify?.Player?.data?.item, spicy: !!window._spicy_lyrics, track: window.Spicetify?.Player?.data?.item?.name, title: document.title})")
print(json.dumps(state))
print(f"{len(seen)} error entries")
for kind, text, url in seen:
    print(f"- [{kind}] {text}  {url[-60:] if url else ''}")
