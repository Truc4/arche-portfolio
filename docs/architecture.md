# Architecture

The portfolio is **one arche program** compiled to a single wasm module. It is a
walkable 2D world that also embeds a live arche playground (editor + output + RUN). The same source runs
natively (`make dev`, X11 + framebuffer UI) and in the browser (`make serve`, canvas + DOM UI) — the device
`[select]` in `arche.toml` swaps the backends.

The program is split across files that **path-import** into one flat namespace, so everything is still
referenced by bare name and `arche build src/portfolio.arche` follows the imports transitively:

- `src/portfolio.arche` — **the driver: data only.** Constants, component + archetype declarations, the ECS
  pools, the `boot`/`seed*` initialization, and the single `#run` schedule. No frame logic.
- `src/render.arche` — `project_*` (world→screen) and `draw_*` (rasterizers).
- `src/physics.arche` — gravity, `walk`/`jump`, `phys_sub` (the substep), `reset_arena`, `sync_player_ppx`.
- `src/camview.arche` — `pan`, `cam_push`, `cam_center`, `clamp_player`.
- `src/input.arche` — key drain, virtual pads, and the whole `focus_*` / `ui_input` set.
- `src/playground.arche` — `layout`, `measure`, the RUN button, `run_it` (the embedded compiler), `done`.

Each module `#import`s only the devices it calls; the driver's constants and archetypes are visible to all of
them through the flat merge.

## Archetypes and pools

| Pool | What it is |
|---|---|
| `[8]Box(6)` `[6]Ball(4)` | the dynamic rigid bodies in the sandbox |
| `[16]Solid(7)` | the static world: ground, the sandbox's walls, ramp and stairs |
| `[2]Player(1)` | the player — **also a fully dynamic rigid body** (see [physics.md](physics.md)) |
| `[2]Focus(1)` | who owns the keyboard (see [input-and-focus.md](input-and-focus.md)) |
| `[2]Touch(1)` | the on-screen pads folded into a virtual axis (see [mobile.md](mobile.md)) |
| `[12]Prop(6)` `[6]Hill(3)` `[8]Round(6)` `[4]Back(2)` | scenery (see [rendering.md](rendering.md)) |
| `[4]Button` `[1]Panel` `[1]Editor` `[1]Output` | the playground UI + the touch pads |
| `[1]Window` `[1]Camera` `[1]Framebuffer` `[12]Sign` | singletons |

Several pools are declared with **extent 2 but one live row** (`[2]Player(1)`, `[2]Focus(1)`, `[2]Touch(1)`).
That is not a mistake — see [arche-gotchas.md](arche-gotchas.md#singleton-pool-query-broadcast).

## Frame order

The schedule is order-sensitive in several places that are not obvious. Roughly:

```
input_read            drain the key queue ONCE per frame
vinput_clear, vinput  fold the touch pads into a virtual axis + jump
pan, cam_push, cam_center     ALL camera motion
layout                projects the UI rects from the (now final) camera
focus_update          hit-tests the pointer against the panel rect layout just wrote
rigid.supports        per-body contact normals, for the grounded test
walk, jump            set the player body's VELOCITY only
phys_sub() x16        the substepped rigid solve
confine_box/ball, clamp_player, sync_player_ppx
ui_input              route the frame's key to whoever has focus
project_*             world -> screen
gfx.clear, draw_*     back-to-front
textedit/button/panel steps and renders
gfx.present, gfx.poll
```

Constraints worth knowing before you reorder anything:

- **All camera motion must precede `layout`.** `layout` projects the playground panel from the camera; if the
  camera moves after it, the DOM panel lags the world it is anchored in by a frame.
- **`layout` must precede `focus_update`**, which hit-tests the pointer against the panel rect `layout` writes.
- **`walk`/`jump` only set velocity.** Everything else about the player — gravity, contacts, friction, being
  shoved — is the solver's.
- **`input_read` is the only caller of `gfx.key`.** It is drain-and-clear: a second reader would eat keys the
  first one never sees. See [input-and-focus.md](input-and-focus.md).

## Where things live

- `src/portfolio.arche` — the driver (data + schedule); `src/{render,physics,camview,input,playground}.arche` — the logic modules it imports.
- `../arche/extras/rigid/` — the rigid-body device (solver + collision).
- `../arche/extras/{gfx,camera,text,ui/*}` — the device library.
- `www/index.html` — the page shell, and the CSS skin for the touch pads.
