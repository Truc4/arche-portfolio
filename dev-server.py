#!/usr/bin/env python3
# Dev server for the playground + its components. Unlike `python3 -m http.server`, it (1) sends
# `Cache-Control: no-store` on every response so the browser NEVER caches — each load re-fetches the wasm /
# hosts / js fresh (a hard refresh every time), and (2) opens a browser tab automatically.
#   usage: python3 dev-server.py [PORT] [ROOT]   (defaults: 8000, www)
import functools
import http.server
import socketserver
import sys
import threading
import webbrowser

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
root = sys.argv[2] if len(sys.argv) > 2 else "www"


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        super().end_headers()

    def log_message(self, *a):
        pass  # quiet


socketserver.TCPServer.allow_reuse_address = True
url = f"http://localhost:{port}/"
threading.Timer(0.7, lambda: webbrowser.open_new_tab(url)).start()
print(f"→ {url}   (serving {root}/, no cache — Ctrl-C to stop)")
try:
    socketserver.TCPServer(("", port), functools.partial(Handler, directory=root)).serve_forever()
except KeyboardInterrupt:
    pass
