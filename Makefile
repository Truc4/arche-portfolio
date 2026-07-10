# arche-portfolio — a walkable portfolio WORLD (WebGL canvas + DOM text signs) that also EMBEDS the arche
# playground (editor + screen + compiler, DOM backends), all one wasm program. Browser-only: the playground
# uses the DOM device backends + an in-browser compiler. Depends on the sibling ../arche (compiler + extras)
# and ../arche-playground (the editor/screen/compiler devices + the compiler toolchain).
#
#   make serve   # build + serve → http://localhost:8000 (walk with the arrow keys)
#
# Uses `arche` from PATH; override `make ARCHE=/path/to/arche`. The --arch=wasm32 link needs a WASI sysroot
# (ARCHE_WASI_SDK / WASI_SDK_PATH, or the system /usr/share/wasi-sysroot).
ARCHE ?= $(shell command -v arche 2>/dev/null || echo ../arche/build/arche)
PORT  ?= 8000

# The in-browser compiler host loads these (built by arche-playground's `make toolchain`; copied from there).
WWWDEPS := www/wasi.js www/analyzer/wasi-fs.js www/analyzer/arche-compile.wasm www/analyzer/arche-fs.json

.PHONY: all serve dev dev-osin dev-osgtk clean

all: serve

# Native hot-reload dev: run the SAME portfolio.arche natively via `arche run` (edit → recompiles + reloads
# live) with the NATIVE device backends — a gfx X11 window (text as bitmap glyphs in the framebuffer, the
# editor/screen as framebuffer panels, the compiler shelling out to `arche`). The browser (`make serve`) is
# where the DOM playground positions itself in the world; native dev renders it in the framebuffer.
GFX ?= x11
# LIMITATION: this BUILDS a binary then runs it, rather than `arche run` (hot-reload). The embedded compiler
# device (compiler=clib) shells out to `arche` to run a snippet on Ctrl-R, and `arche run`'s hot-reload runtime
# stack-overflows the instant the running app spawns a subprocess — so hot-reload + the in-app compiler can't
# coexist yet. A built binary popens fine. Trade-off: no live scene reload here; re-run `make dev` after editing
# src/. (The browser path — `make serve` — is unaffected; it compiles in-process via arche-compile.wasm.)
# TEXTEDIT selects the native editor backend: the default `window` draws bitmap glyphs into the shared
# framebuffer; the two OS-embedded variants make the editor a real CHILD of the scene window (not a separate
# top-level), positioned from the SAME arche `layout` the framebuffer path uses:
#   make dev-osin   — X11 child window: OS focus/key input, drawn with a core X server font (plain Xlib).
#   make dev-osgtk  — a real GtkTextView (native cursor/selection/IME/clipboard), embedded via XReparentWindow.
# Both require gfx=x11 (they parent to its window via gfx_x11_window). dev-osgtk needs GTK3 dev headers.
TEXTEDIT ?= window
TEXTVIEW ?= window
dev-osin:  TEXTEDIT = x11in
dev-osgtk: TEXTEDIT = x11gtk
dev-osgtk: TEXTVIEW = x11gtk
dev dev-osin dev-osgtk:
	@mkdir -p build
	ARCHE_SELECT=gfx=$(GFX),text=framebuffer,panel=window,textedit=$(TEXTEDIT),textview=$(TEXTVIEW),button=window,compiler=clib \
	  $(ARCHE) build -o build/portfolio-dev src/portfolio.arche
	ARCHE_BIN=$(ARCHE) ./build/portfolio-dev

# Build the portfolio wasm — `arche build --arch=wasm32` also emits www/portfolio.hosts.js (the collected gfx +
# text + editor + screen + compiler hosts) + copies arche-web.js. Gather the toolchain, then serve (no-cache).
serve: www/portfolio.wasm $(WWWDEPS)
	python3 dev-server.py $(PORT) www

www/portfolio.wasm: src/portfolio.arche
	$(ARCHE) build --arch=wasm32 -o $@ src/portfolio.arche

www/wasi.js: ../arche-playground/www/runtime/wasi.js
	@mkdir -p www; cp $< $@
www/analyzer/%: ../arche-playground/www/analyzer/%
	@mkdir -p www/analyzer; cp $< $@

clean:
	rm -f www/portfolio.wasm www/portfolio.hosts.js www/arche-web.js www/wasi.js
	rm -rf www/analyzer test-results playwright-report
