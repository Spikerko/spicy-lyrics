"""Restore the Spotify page viewport after a CDP size emulation.

Proven fix (2026-10-26): clearDeviceMetricsOverride alone left the page at
1280x720 (and later 0x0 after a hide/show). Clearing, then nudging the real
window by 1px and back via Browser.setWindowBounds forces Chromium to resync
the viewport to the window. Window position and size end up unchanged.
"""

import time

from cdp import Page

p = Page()
p.call("Emulation.clearDeviceMetricsOverride")
w = p.call("Browser.getWindowForTarget")
wid, b = w["windowId"], w["bounds"]
if b.get("windowState", "normal") == "normal":
    p.call("Browser.setWindowBounds", windowId=wid, bounds={"width": b["width"] - 1, "height": b["height"] - 1})
    time.sleep(1)
    p.call("Browser.setWindowBounds", windowId=wid, bounds={"width": b["width"], "height": b["height"]})
time.sleep(1.5)
s = p.eval("[innerWidth, innerHeight, outerWidth, outerHeight]")
print(s, p.call("Browser.getWindowForTarget")["bounds"])
print("RESTORED" if s[:2] == s[2:] else "STILL EMULATED (resize the Spotify window by hand)")
