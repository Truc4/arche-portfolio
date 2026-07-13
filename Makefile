ARCHE ?= $(shell command -v arche 2>/dev/null || echo ../arche/build/arche)
PORT  ?= 8000

WWWDEPS := www/wasi.js www/analyzer/wasi-fs.js www/analyzer/arche-compile.wasm www/analyzer/arche-fs.json

.PHONY: all serve dev dev-osin dev-osgtk clean

all: serve

GFX ?= x11
TEXTEDIT ?= window
TEXTVIEW ?= window
dev-osin:  TEXTEDIT = x11in
dev-osgtk: TEXTEDIT = x11gtk
dev-osgtk: TEXTVIEW = x11gtk
SRC := $(wildcard src/*.arche)

dev dev-osin dev-osgtk: $(SRC)
	@mkdir -p build
	ARCHE_SELECT=gfx=$(GFX),text=framebuffer,panel=window,textedit=$(TEXTEDIT),textview=$(TEXTVIEW),button=window,compiler=clib \
	  $(ARCHE) build -o build/portfolio-dev src/portfolio.arche
	ARCHE_BIN=$(ARCHE) ./build/portfolio-dev

serve: www/portfolio.wasm $(WWWDEPS)
	python3 dev-server.py $(PORT) www

www/portfolio.wasm: $(SRC)
	$(ARCHE) build --arch=wasm32 -o $@ src/portfolio.arche

www/wasi.js: ../arche-playground/www/runtime/wasi.js
	@mkdir -p www; cp $< $@
www/analyzer/%: ../arche-playground/www/analyzer/%
	@mkdir -p www/analyzer; cp $< $@

clean:
	rm -f www/portfolio.wasm www/portfolio.hosts.js www/arche-web.js www/wasi.js
	rm -rf www/analyzer test-results playwright-report
