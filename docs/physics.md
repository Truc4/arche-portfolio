# Physics

The world is solved by the `rigid` device (`../arche/extras/rigid/`): a substepped **TGS-Soft velocity Jacobi**
solver over oriented boxes, with circles as a special case. The driver's job is only to seed bodies, apply
gravity per substep, and run the schedule.

## The substep

`phys_sub()` is one substep, listed **16x per frame**:

```
rigid_gravity          add GDT to lvel (GDT = GRAV / 16)
rigid.contacts         count each body's active contacts (for mass-splitting)
rigid.solve_lin/ang/apply   x2   soft-constraint velocity iterations
rigid.integrate        advance position by lvel * DT
rigid.solve_lin_relax/ang_relax/apply   the RELAX pass
```

Rigidity comes from the small step plus the soft velocity bias — there is **no positional/Baumgarte pass**.
That is what removed the old "sink then spring back" squish.

The **relax pass** re-solves the contacts with the bias disabled, after `integrate`. The biased solve
deliberately over-drives each contact to push penetration out; once `integrate` has used that velocity, the
surplus is still sitting in `lvel`/`spin`. Left there it re-enters the next substep and a settled body never
reaches a fixed point.

## The player is a rigid body

The player is not a special case. It is a fully dynamic tumbling box with the same inverse mass and inertia as
any other. `walk` sets its horizontal **velocity**; gravity, contacts, friction, torque and being shoved by a
box all come from the solver. `ppx` is a read-only *view* of `pos.x` that the camera and renderer consume.

It used to be the other way round — `ppx` was the authority and the body was teleported onto it each frame as
an infinite-mass obstacle.

## Tuning constants

| Constant | Why it is what it is |
|---|---|
| `GRAV 0.4`, `GDT 0.025` | gravity per frame, and per substep (`GRAV / SUBSTEPS`) |
| `BINVI 0.0016` | box inverse inertia — tuned so boxes visibly tumble |
| `BREST 0.12` | restitution. **Note: `mat.x` is not currently read by the solver, so this does nothing.** |
| `BFRIC 0.45` | box friction |
| `PFRIC 0.05` | **player** friction — deliberately slippery, see below |
| `WALK_DAMP 0.80` | horizontal damping when grounded with no key held |
| `JUMP 13.0` | jump impulse; with `GRAV = 0.4` that is a ~210px apex, enough to clear a 50px stair riser |

### Why the player is slippery

Coulomb friction is bounded by `mu * normal impulse`, and the impulse needed to arrest you scales with how hard
you are pressed into a surface. At `mu = 0.45`, pressing into a wall buys enough friction to carry your entire
weight — you hang there instead of sliding down. Measured fall speed after 40 frames pinned to a wall:

| player friction | fall speed |
|---|---|
| 0.45 | 1.3 px/frame (effectively stuck) |
| 0.20 | 2.0 |
| **0.05** | **6.6** |
| 0.00 | 16.0 (free fall) |

Lowering friction is the only fix — the bound scales with the push, so *any* friction plus a constant push
clings. The player does not need ground friction for control (`walk` **sets** the velocity), so the one job
friction was doing — stopping you when you let go — is `WALK_DAMP` instead, gated on being grounded so it never
flattens a jump arc or kills a wall slide.

`walk` also refuses to command velocity into a wall it is already flush against (see the `sup` section below),
which removes the push at source.

## Contact normals: `sup`

`rigid.supports` folds each body's **summed contact normal** into `sup`, once per frame. It answers "what am I
touching, and in which direction?" — which the contact *count* cannot. World +y is down, so:

- **`sup.y`** sums only contacts flatter than the device's `SUP_GROUND` (~25°). This is the real **grounded**
  test. A wall (normal.y = 0) and a steep ramp contribute nothing, so neither can be jumped from.
- **`sup.x`** sums only near-vertical contacts (`|n.y| < SUP_WALL`). This is the **blocked** test. A floor or a
  ramp must *not* contribute, or walking up a slope would look identical to shoving into a wall and get
  suppressed.

They are two separate tests, not two halves of one threshold. A ramp is *both* standable *and* not-a-wall, and
one cutoff cannot say that. (With a single threshold, the ramp could either not be jumped from, or — worse —
could not be climbed at all.)

Using `cor.x > 0` (the contact count) as a grounded test is wrong: it is true while merely scraping a wall,
which lets you jump off the wall, re-stick, and climb it forever.

## The sandbox

A short, **open-topped** container at world x −1700..−500, far left of the playground. It is real geometry —
walls, ramp and stairs are static `Solid` bodies drawn straight from the physics, so what you see is what you
collide with.

- **Ramp** (right / approach side): a rotated slab from the ground at x=−100 climbing to (−500, 867), which
  clears the wall top at 940. You run up it, off the end, and drop in. Its low end **sinks below the ground
  line on purpose**: a slab has thickness, and its top face must actually reach y=1140 or you hit a lip and stop
  dead. A rigid body cannot step up *any* riser — only a continuous slope works. The ground plane is drawn
  after the container specifically to bury it (see [rendering.md](rendering.md)).
- **Stairs** (inside, left wall): 50px risers. A body cannot walk up one — it butts into the vertical face — so
  each needs a jump. That is what makes the jump load-bearing rather than decorative.
- **Exit wall** is 120px wide so you can actually land on top of it; a 20px lip would be unlandable.

### Reset

Every dynamic body carries `home` / `hrot` — the position and orientation it was seeded with. The RESET button
in the sandbox panel restores them and zeroes velocity and spin.

They are columns rather than a re-run of `seed_arena` because arche has no conditional schedule combinator: a
seed system assigns whole pool columns from array literals, which cannot be done from inside a `map` body. The
spawn state has to live in the data.

### The escape net

`confine_box` / `confine_ball` are a **last resort**, not a boundary — the static walls do all real collision.
They only fire once a body is `ESC_MARGIN` past a wall, catching a body squeezed clean out of the bin.

They must **not** clamp at the wall line itself. An earlier version clamped to `ARENA_FLOOR - ext.y`, which is
exactly where a resting box sits, so every frame it hard-snapped the position and zeroed the gravity impulse of
a body that was resting perfectly well — a permanent tug-of-war with the contact solver.

They are scoped to Box and Ball by archetype. A blanket query would match the (now dynamic) **player** and trap
it inside the arena forever.
