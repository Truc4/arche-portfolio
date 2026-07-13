# Rendering

## Two canvases, and the DOM between them

The browser renders the world to **two** canvases, with the DOM stacked between them:

```
z0  canvas (background)   sky, hills, clouds, buildings
z1  DOM                   the world signs, the sandbox panel
z2  canvas (foreground)   the container, the ground, the bodies, the player   [transparent]
z5  DOM                   the playground panel, editor, output
z6  DOM                   the touch pads
```

`gfx.split` is the layer break: it presents everything drawn so far to the background surface and clears the
framebuffer to transparent, so the rest of the frame **composites** rather than overwrites. The foreground
canvas's shader keys pure black to alpha 0 — the framebuffer int is `0x00RRGGBB` and carries no alpha channel, so
"was this pixel drawn?" has to come from the colour, and black is the sentinel `split` clears to.

**Why this exists.** DOM always paints above a canvas. With one canvas that is an impossible ordering problem:
the sandbox's panel must sit *behind* the bodies standing inside it, and the world signs must sit *behind* the
walls they stand next to — but DOM over one opaque canvas can only ever be all-above or all-below. That is why
the sandbox frame used to be a hand-rolled rect (`draw_back`) rather than a real `panel`, and why parallax signs
painted straight over the container walls.

Splitting the canvas gives the DOM a **middle** to live in. The sandbox is now a real `Panel` — the same device
and the same look as the playground's — and the signs sit where they belong.

**On native there is no DOM, so there is nothing to sandwich.** `gfx.split` is a **no-op** there: the frame
accumulates in one framebuffer and plain draw order already gives the right answer. The two backends now agree
on depth instead of diverging.

## Panels have a layer

`ui`'s `layer` column: 1 = foreground (normal UI, over the world), 0 = background (behind the world's
foreground). The panel device renders the two in separate passes — `render` and `render_bg` — so a driver can
schedule them on opposite sides of `gfx.split`.

A framed section *behind* the bodies standing in it is the same widget as a dialog *in front* of them. It should
not be a second, hand-rolled implementation just because it sits lower.

Panels also carry a **subtitle** (`sub` / `sublen`) — a caption line under the title rule. The sandbox's controls
hint lives there. It used to be a floating `Sign`, which was wrong twice over: it was not attached to the panel,
and once the world text moved *behind* the panels it would have been invisible anyway.

## Draw order

```
gfx.clear
draw_hills            parallax
draw_round            parallax (clouds + bushes)
gfx.rect              parallax buildings (Prop)
panel.render_bg       BACKGROUND panels (layer 0) -- the sandbox
text.render           the world signs
--------- gfx.split ---------        (browser: everything above lands on the background canvas)
draw_solid            the container: walls, ramp, stairs (static bodies)
draw_ground           the ground plane (Back)
draw_rbox, draw_ball, draw_player
panel.render          FOREGROUND panels (layer 1) -- the playground
textedit / textview / button renders
gfx.present
```

Two things drive this and are easy to get wrong.

**Parallax layers are background.** They *slide* relative to the world as the camera moves, so a building from
the middle of the map drifts across the sandbox. Drawn after it, they paint over the container walls. Anything
with `plx < 1` must be underneath.

**The ground must be drawn after the container.** The ramp's underside is necessarily buried — a slab has
thickness, and its top face has to reach the ground line or you hit a lip and stop dead. The ground plane is what
covers it.

## Rasterisation: sample pixel centres

`draw_rbox`, `draw_ball` and `draw_solid` all test the pixel **centre** (`xx + 0.5`), not its corner.

Sampling the corner puts the sample points exactly *on* the shape's boundary — a box of half-height 44 has its
bottom row at `dy = 44`, testing `44 <= 44`. Sitting precisely on the threshold, a residual tilt of `rot.y ≈
1e-4` (about 0.02px across the whole box) is enough to push one bottom corner over the line and not the other:

```
bottom-LEFT  (dx = -44):  |ly| = 43.9956  <= 44  -> drawn
bottom-RIGHT (dx = +44):  |ly| = 44.0044  >  44  -> not drawn
```

One corner pixel drops out and the edge shows a 1px step. The renderer was amplifying two-hundredths of a pixel
of tilt into a whole pixel of visible skew. Half-pixel offsets keep the boundary off every sample point, so a
settled box rasterises perfectly flat and exactly `2*hw` by `2*hh` (corner sampling also made every box one row
too tall).

## Layers

| Archetype | Role |
|---|---|
| `Hill` | parallax triangles on the horizon |
| `Round` | clouds (parallax) and bushes (foreground), separated only by world y |
| `Prop` | parallax buildings |
| `Back` | the ground plane (a world-anchored flat rect) |
| `Panel` | the playground (layer 1) and the sandbox frame (layer 0) — the same device, at two depths |
| `Solid` | the container's static bodies, drawn straight from the physics (`sflag = 0` skips the world ground, which is 12000px wide and drawn by `Back`) |
| `Sign` | world text (`text` device) |
