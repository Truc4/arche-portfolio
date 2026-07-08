# arche-portfolio

A portfolio you **walk through**. It's a single [Arche](https://github.com/) program compiled to WebAssembly:
a side-scrolling parallax world (buildings, hills, clouds, a player you move with the arrow keys) where the
text is info about me — and if you walk **left**, you find the **arche playground** sitting in the world: a
real code editor + output panel where you can write Arche and run it, compiled entirely in your browser.

One wasm program composes six devices — `gfx` (the canvas), `text` (the DOM signs), `camera` (the follow-cam),
and `editor` + `screen` + `compiler` (the embedded playground) — through their DOM/wasm backends.

## Run it

```sh
make serve     # build + serve → http://localhost:8000
```

Arrow keys (or A/D) walk. Walk **left** to reach the playground; click its editor, type Arche, press
**Ctrl-Enter** to compile + run in-browser. Click the canvas again to resume walking.

Needs the sibling checkouts `../arche` (the compiler + `gfx`/`text`/`camera` devices) and `../arche-playground`
(the `editor`/`screen`/`compiler` devices + the in-browser compiler toolchain). Override the compiler with
`make ARCHE=/path/to/arche`.

## Editing the content

Everything lives in **`src/portfolio.arche`**:

- **The signs** — `seed_text` inserts each `Sign` with a world anchor `twx/twy`, parallax `tplx` (must be an
  exact `/16` fraction), size `tsz`, colour `tcol`, and the string. `twx < 2100` is left of the start. Swap the
  strings / positions to change the portfolio text.
- **The playground's spot** — `seed_playground` places the `Panel` at world `pwx/pwy` (default ~700, left of
  home). Move it anywhere.
- **The world** — buildings/hills/clouds are seeded in `seed`; the palette is one block of colour constants.

The `#run` schedule interleaves the scene systems (`walk`, `follow`, `project_*`, `draw_*`, `text.render`) with
the playground systems (`editor.*`, `run_it`, `populate`, `screen.render`, and the `*.place` seams that position
the DOM panels at the projected world coords each frame).
