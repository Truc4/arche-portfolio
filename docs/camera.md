# Camera

**Scroll/pan is the primary control.** The camera never locks onto the player. Both directions of push exist,
and both are wanted:

| | |
|---|---|
| **pan → player** | `clamp_player` keeps the body inside the viewport, so scrolling **shoves the player along**. |
| **walk → camera** | `cam_push` drags the camera when you **walk** into a dead-zone margin at the screen edge. |

They cannot collide, because the margins nest: `cam_push` reacts at `CAM_MARGIN` (30% of the viewport, 42% on
touch), while `clamp_player` only bites at `PW` (102px). Walking moves the camera long before the player reaches
the hard clamp; panning with no key held leaves `cam_push` inert.

## `cam_push`

Gated on `gfx.axis_x` being non-zero, so it only acts while you are actually walking — a scroll is never fought
or undone by it. The catch-up is a **lerp, not a snap**: if you have scrolled far from the player, walking pulls
the camera smoothly back instead of teleporting. Steady-state that means the player rides ~45px past the margin
while walking, invisible against a 500px band.

Two bugs worth not reintroducing:

**Push only when walking INTO the edge you are past.** `past` and `dx` must agree in sign. Physics can carry you
out of the band on its own (momentum, a shove from a box, the pan clamp dragging you), and then *any* held key
kept hauling the camera the same way — press the opposite direction and the view lurched outward before
reversing. Walking back off the edge must move the camera exactly **0**.

**The dead zone is a fraction, not pixels.** It used to be a hardcoded 500px, which is wider than a phone's
entire canvas (the backing store is only ~500 render px across). `lo` and `hi` **inverted**: `lo` landed past
`hi`, the `sx < lo` test was true almost everywhere, so it always reported "past the left edge" and the
right-hand branch was never reached. Walking right never pushed the camera at all. A fraction cannot invert —
`0.3 * vw` is always left of `0.7 * vw`, at any width.

## `cam_center`

Give the playground focus and the camera glides until the whole panel is dead centre; hand focus back to the
world and the horizon settles back to `EYE_Y0` (x is left alone — that belongs to scroll and `cam_push`). The
panel's world rect is derived from its **actual `layout` size**, not a hardcoded guess.

## Vertical

`eye.y` rests at `EYE_Y0 = 720` on desktop and `EYE_Y0_M = 840` on touch. The lower eye raises the ground up the
screen: the on-screen pads live along the bottom edge, and at 720 the ground line lands at screen y ~960 while
the pads start at ~936 — they sat right on top of the player. The canvas height is always `renderH = 1080`
regardless of device, so these are stable numbers rather than guesses about a particular phone.

## Consequence to be aware of

`clamp_player` is always on, so **any** camera motion drags the player along by the screen edge — including
`cam_center` gliding to the playground. Since the clamp writes `pos.x` directly, it ignores collisions. This is
the same hazard scroll-panning already has, and it is left consistent rather than special-cased. If it becomes a
problem, disabling `clamp_player` while the editor has focus is the fix (the player is not under your control
then anyway).
