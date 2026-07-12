# Mobile

A phone has no keyboard, so the world is unplayable without on-screen controls. Three pads — ◀ ▶ bottom-left,
▲ bottom-right — built on the `button` device.

## Detection

`gfx.coarse_pointer()` — the CSS `pointer: coarse` test, which asks about the primary input's **precision**, not
the screen size. A narrow desktop window stays fine-pointered; a phone in landscape stays coarse. It returns 0 on
every native backend.

When it is 0, `layout` gives the pads **zero size**. The DOM host hides a zero-sized button and the framebuffer
renderer draws no pixels for it, so they cost a desktop nothing and cannot swallow a click meant for the world.

## Sizing

Pads are `PAD_VMIN` = **18% of `min(vw, vh)`**, matching the old site's `.touchButton { width: 18vmin }`.

A fixed pixel size is meaningless here: the canvas backing store is `renderH x aspect`, which on a portrait
phone is only **~500 render px wide**. An earlier hardcoded 190px pad ate ~40% of the screen.

`vw`/`vh` come from `gfx.dims` and are in the same render-px space as `screen`/`size`, so deriving rects from
them **is** percentage sizing — it just lives in `layout`, where layout belongs.

## The playground on a phone

`PANEL_W` (1100) is wider than a phone's entire canvas, so on touch the panel width becomes `vw - 2*PAD` and the
editor/output panes **stack vertically** instead of sharing a row.

## Touch input

Touch feeds `mdown`/`mx`/`my` in the gfx wasm host (scroll and fling accumulation are untouched — a swipe both
pans the world *and* counts as touching it). Without this, `mouse_down` was only ever written by mouse events, so
on a phone **nothing could observe a press on the world** and focus could never be taken back from the editor.
See [input-and-focus.md](input-and-focus.md).

## What the `button` device needed

Two things, both fixed in `../arche/extras/ui/button/`:

- **It was a hard singleton.** `getElementById("ui-button")`, one element, one shared `clicked` flag, and
  `button_be_poll()` took no argument. Every `Button` row drove the *same* `<button>`. Elements are now keyed by a
  `bid` column, so N buttons genuinely work.
- **There was no HELD state**, only a rising-edge `clicked`. A movement pad needs the *level*, or you step once
  per tap instead of walking. A `held` column now carries it, driven by `pointerdown`/`pointerup`.

Both are why `run_button` is gated on `bid == BTN_RUN`: `query { clicked }` matches every Button row, so without
the id test, tapping ◀ would submit the editor and run the compiler.

### Pointer details that matter

- **Release the implicit pointer capture.** A touch pointer is captured to whatever element received
  `pointerdown`, so every later event goes there — making it impossible to slide a thumb from ◀ onto ▶, because
  the second button never hears a thing. Releasing it restores `pointerenter`/`pointerleave`.
- **A window-level `pointerup` clears every pad.** Lifting a thumb off the *edge* of a button never reaches its
  own handler, and the pad would stay stuck down — walking you off forever.
- **`preventDefault()` on `touchstart`** (non-passive) is what kills the long-press context menu **and its
  haptic buzz**. Cancelling `contextmenu` is not enough: on Android the buzz fires *before* that event. The
  gesture itself has to be refused.

### Skin

The pads' appearance lives in `www/index.html` (`#ui-button-1/2/3`), lifted from the old site's `.touchButton`: a
raised key with a hard `0 1.5vmin` offset shadow that, on press, **drops onto its own shadow** —
`translateY(1.5vmin)`, shadow removed, face darkened, over `50ms linear`.

This is only possible because the button host puts *appearance* in a `.arche-btn` class and keeps only the
**rect** inline. Inline styles beat author CSS, so a host that bakes its look in is unskinnable. `.is-down` is the
pressed-state hook, toggled on pointerdown/up.

Glyphs are pure CSS triangles (the border trick), so there is no text, no font and no baseline to scale.

## Jump on a pad

All three pads use `held`, not `clicked` — so holding ▲ bounces you the moment you land, exactly like holding the
up key. They disagreed once, and the pad felt broken next to the keyboard.
