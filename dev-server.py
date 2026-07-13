#!/usr/bin/env python3
"""Dev server for the playground and its components.

Unlike `python3 -m http.server` it sends `Cache-Control: no-store` on every response, so the browser never
caches — each load re-fetches the wasm / hosts / js fresh, a hard refresh every time.

Pass `--open` (or set OPEN_BROWSER=1) to auto-open a browser tab; by default it does not.

    usage: python3 dev-server.py [PORT] [ROOT] [--open]   (defaults: 8000, www)
"""
import functools
import http.server
import os
import socketserver
import sys
import threading
import webbrowser

args = [a for a in sys.argv[1:] if not a.startswith("-")]
open_browser = "--open" in sys.argv[1:] or os.environ.get("OPEN_BROWSER") == "1"
port = int(args[0]) if len(args) > 0 else 8000
root = args[1] if len(args) > 1 else "www"

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        super().end_headers()

    def log_message(self, *a):
        pass

socketserver.TCPServer.allow_reuse_address = True
url = f"http://localhost:{port}/"
if open_browser:
    threading.Timer(0.7, lambda: webbrowser.open_new_tab(url)).start()
print(f"→ {url}   (serving {root}/, no cache — Ctrl-C to stop)")
try:
    socketserver.TCPServer(("", port), functools.partial(Handler, directory=root)).serve_forever()
except KeyboardInterrupt:
    pass
