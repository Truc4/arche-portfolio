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

## `cam_center` — camera focus is NOT keyboard focus

Click a panel and the camera glides until it is dead centre. Release it (press a movement key) and the horizon
settles back to `EYE_Y0`. The panel's world rect comes from its **actual `layout` size**, not a hardcoded guess.

`Focus` carries **two** independent things:

- **`fown`** — who owns the KEYBOARD (`FOCUS_WORLD` / `FOCUS_EDIT`).
- **`fcam`** — which panel the CAMERA is centred on (0 = none, otherwise `bid + 1`).

They are separate because the sandbox needs to pull the camera **without** taking the arrows — you need those to
play in it. Clicking the playground takes both; clicking the sandbox takes only the camera.

Any movement input clears `fcam`, so `cam_center` and `cam_push` can never fight: the moment you walk, the camera
is yours again.

### Edge detection must not live in the panel loop

`focus_claim` iterates every panel row. The mouse-down **edge** (`md == 1 && fwas == 0`) therefore cannot be
computed there — the first row would latch `fwas` and every later row would see no press at all. It lives in
`focus_input`, which runs once, and the panel pass only reads the resulting `fpress`.

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
