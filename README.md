# arche-portfolio

A portfolio you **walk through**. It's a single [Arche](https://github.com/) program compiled to WebAssembly: a
side-scrolling parallax world where the text is info about me, plus a **rigid-body sandbox** you can climb into,
and the **arche playground** sitting in the world — a real code editor + output panel where you can write Arche
and run it, compiled entirely in your browser.

One wasm program composes the devices — `gfx` (the canvas), `rigid` (the physics), `text` (the DOM signs),
`camera`, and `panel`/`textedit`/`textview`/`button`/`compiler` (the embedded playground) — through their
DOM/wasm backends. The same source also runs natively (X11 + a framebuffer UI) with no changes.

## Run it

```sh
make serve     # build + serve → http://localhost:8000
make dev       # the same program, natively (X11)
```

**Arrows** walk, **↑ / Space** jumps. Scroll to pan the world. On a phone, on-screen pads appear instead. Click
the playground's editor, type Arche, press **Ctrl-Enter** to compile + run in-browser; click the world to resume
walking.

Needs the sibling checkouts `../arche` (the compiler + device library) and `../arche-playground` (the in-browser
compiler toolchain). Override the compiler with `make ARCHE=/path/to/arche`.

## Source

Everything lives in **`src/portfolio.arche`** — one file, no code comments by policy. All the *why* is in
[`docs/`](docs/):

| | |
|---|---|
| [architecture.md](docs/architecture.md) | archetypes, pools, and the frame order (which is load-bearing) |
| [physics.md](docs/physics.md) | the rigid solver, the player-as-a-body, the sandbox, tuning |
| [input-and-focus.md](docs/input-and-focus.md) | held-vs-drained keys, and who owns the keyboard |
| [camera.md](docs/camera.md) | pan, the dead-zone push, centring on a focused panel |
| [rendering.md](docs/rendering.md) | draw order, the layer system, the DOM-text caveat |
| [mobile.md](docs/mobile.md) | touch controls, the `button` device, coarse-pointer detection |
| [arche-gotchas.md](docs/arche-gotchas.md) | compiler workarounds that look like mistakes and are not |
| [scenery.md](docs/scenery.md) | art direction and palette |

## Editing the content

- **The signs** — `seed_text` inserts each `Sign` with a world anchor `twx/twy`, parallax `tplx`, size and
  colour. `twx < 2100` is left of the start.
- **The playground's spot** — `PANEL_WX` / `PANEL_WY`.
- **The sandbox** — `Solid` seeds the walls, ramp and stairs; `Box`/`Ball` the loose bodies.
- **The palette** — one block of colour constants at the top.
