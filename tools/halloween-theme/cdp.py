"""Tiny Chrome DevTools Protocol client for the Spotify desktop page.

Requires Spotify started with --remote-debugging-port=9222.

  python cdp.py eval "<js expression>"      prints the JSON result
  python cdp.py evalfile path.js            same, reading the JS from a file
  python cdp.py shot out.png                full-window screenshot
"""

import base64
import json
import sys
import urllib.request

import websocket

PORT = 9222


def page_ws():
    targets = json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list", timeout=5))
    for t in targets:
        if t["type"] == "page" and "xpui" in t["url"]:
            return t["webSocketDebuggerUrl"]
    sys.exit("no Spotify xpui page target")


class Page:
    def __init__(self):
        self.ws = websocket.create_connection(page_ws(), timeout=60, suppress_origin=True)
        self.n = 0

    def call(self, method, **params):
        self.n += 1
        self.ws.send(json.dumps({"id": self.n, "method": method, "params": params}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == self.n:
                if "error" in msg:
                    raise RuntimeError(msg["error"])
                return msg["result"]

    def eval(self, expr):
        r = self.call("Runtime.evaluate", expression=expr, returnByValue=True, awaitPromise=True)
        if "exceptionDetails" in r:
            raise RuntimeError(r["exceptionDetails"].get("exception", {}).get("description", r["exceptionDetails"]))
        return r["result"].get("value")

    def shot(self, path):
        data = self.call("Page.captureScreenshot", format="png")["data"]
        with open(path, "wb") as fh:
            fh.write(base64.b64decode(data))


if __name__ == "__main__":
    p = Page()
    cmd = sys.argv[1]
    if cmd == "eval":
        print(json.dumps(p.eval(sys.argv[2]), indent=2))
    elif cmd == "evalfile":
        print(json.dumps(p.eval(open(sys.argv[2], encoding="utf-8").read()), indent=2))
    elif cmd == "shot":
        p.shot(sys.argv[2])
        print("saved", sys.argv[2])
