# Rendering

## Draw order

Strictly back-to-front:

```
gfx.clear
draw_hills            parallax
draw_round            parallax (clouds + bushes)
gfx.rect              parallax buildings (Prop)
draw_back             the sandbox's frame  (Back, klay 0)
text.render           the world signs
draw_solid            the container: walls, ramp, stairs (static bodies)
draw_ground           the ground plane   (Back, klay 1)
draw_rbox, draw_ball, draw_player
... UI (panel, editor, output, button)
```

Two things drive this and are easy to get wrong.

**Parallax layers are background.** They *slide* relative to the world as the camera moves, so a building from
the middle of the map drifts across the sandbox. Drawn after it, they painted straight over the container walls.
Anything with `plx < 1` must be underneath.

**The container is sandwiched.** The frame must sit *behind* the walls, but the ground must sit *in front* of
them — because the ramp's underside is necessarily buried (a slab has thickness, and its top face has to reach
the ground line or you hit a lip and stop dead). So the frame and the ground cannot share a pass. That is why
the ground is **not** a `Prop`: `Back` carries a `klay` layer flag, and `draw_back` (klay 0) and `draw_ground`
(klay 1) sit on opposite sides of `draw_solid`.

## The DOM text caveat (browser only)

In the browser, `text=dom`: the world signs are real `<span>`s over the canvas, so **they always paint on top of
everything the canvas draws** — the sandbox frame, its walls, the bodies. Reordering `text.render` only affects
the *native* framebuffer path.

Natively the signs are a **middle** layer (above the buildings and the sandbox backdrop, behind the container and
the bodies). A single opaque canvas with DOM text on top can only be all-above or all-below; there is no way to
slot DOM into the middle. **The two backends genuinely disagree here.** Fixing it properly means either moving
the signs to the framebuffer (losing crisp, selectable DOM text) or splitting the canvas into a background and a
transparent foreground surface with the text layer between them.

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
| `Back` | world-anchored flat rects at a specific depth: `klay 0` = the sandbox frame, `klay 1` = the ground |
| `Solid` | the container's static bodies, drawn straight from the physics (`sflag = 0` skips the world ground, which is 12000px wide and drawn by `Back`) |
| `Sign` | world text (`text` device) |
