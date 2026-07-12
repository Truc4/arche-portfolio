# Input and focus

Two consumers share one keyboard: the **world** (walk, jump) and the embedded **editor**. Exactly one owns it
at a time, and the `Focus` pool is the authority.

## Keys

Movement is **arrows + Space** (Space = jump). WASD was tried and removed: letter keys are *printable*, so a
backend has to track them **alongside** its key dispatch rather than inside it, or it swallows keystrokes the
editor needs — and the two backends promptly drifted doing exactly that, leaving A/D working on the web and
dead natively. Arrows carry no such tax.

## Level vs edge — the distinction that matters

`gfx` exposes two *different kinds* of keyboard signal, and using the wrong one is a real bug:

- **`axis_x` / `axis_y`** — **held** state (level). True on every frame the key is down.
- **`key`** — a **drained queue** (edge). One key per call, and the caller *consumes* it.

`walk` uses `axis_x`. `jump` uses `axis_y`.

Jump originally polled the key queue, and the symptom was that holding jump bounced you on landing only *some*
of the time. A held key refills that queue via OS **auto-repeat** (~30/sec) against a 60fps loop, so roughly
every other frame it is empty — whether you jumped depended on which frame you happened to touch down. A coin
flip, not something you can tune. Holding a key is level state, so it has to come from level state.

## One drain per frame

`input_read` is the **only** caller of `gfx.key`, and it stashes the result in `Window.gkey`. `gfx.key` is
drain-and-clear: if two systems called it, whichever ran first would eat the key and the other would see
nothing — the editor would randomly drop keystrokes, or the jump would randomly not fire.

## The Focus pool

arche has no tags (an archetype's component set is fixed at compile time), so "who has focus" is a one-row pool:
`Focus { fown, fwas }`, `fown` being `FOCUS_WORLD` or `FOCUS_EDIT`.

The two backends reach the same answer by different routes, which is the whole reason the pool exists:

- **Native** — the editor is drawn into our framebuffer, so a click on it *is* a canvas click. `focus_update`
  hit-tests the pointer against the playground panel's rect on the rising edge of a press. This is the only
  mechanism there.
- **Browser** — the playground is **real DOM above the canvas**, so a click on the editor never reaches
  `gfx.mouse_down`; it is invisible to the hit-test. It surfaces instead through `gfx.text_focus`, which reports
  that a text field has taken the keyboard (and `gfx` has correspondingly gone silent). Meanwhile a *canvas*
  press is, by construction, always a click on the **world**.

So: a canvas press is **authoritative**; otherwise we adopt whatever the DOM says. Clicking away also has to
**blur** the DOM editor — `gfx.release_text` does that (a no-op natively).

Pressing an on-screen movement pad also forces `FOCUS_WORLD`. The pads are DOM elements, so a press on one
never reaches the canvas and never produces a click edge; without this, tapping the editor and then reaching for
a pad would leave focus on the `<textarea>` and the player would not budge.

## What focus gates

- **`walk`** — only drives while `FOCUS_WORLD`. Otherwise it falls through to the damping, so the player coasts
  to a stop rather than freezing mid-stride, and keeps its physics.
- **`jump`** — same gate.
- **`ui_input`** — routes the frame's key to whoever owns the keyboard: `key = select(fown == FOCUS_EDIT, gk, 0)`.

This replaced a hardcoded rule ("arrows always go to the world, everything else always goes to the editor") that
was wrong in both directions: it moved the editor's cursor while you were merely walking past, and it let you
type into an editor you had never focused.

## Bugs this fixed (do not reintroduce)

- **The editor stole focus at boot.** `textedit_be_open` called `ta.focus()`, and `open` runs once at startup.
  Since `gfx` drops the whole keyboard event when a text field is focused, arrows did nothing until you clicked
  the canvas.
- **The invisible wall.** Because that off-screen `<textarea>` held focus, arrow keys landed on it and the
  browser scrolled `#app` sideways to bring the focused element into view, dragging the `<canvas>` with it. Its
  right edge became a hard vertical line mid-screen that also stopped the player (`clamp_player` clamps to the
  canvas width). Fixed at the root here, and belt-and-braces by `overflow: clip` in `www/index.html` — a
  `hidden` box is still a scroll container; a `clip` box is not.
- **Sticky held axis.** `gfx`'s focus guard used to early-return on **keyup** as well as keydown, so holding →
  and then clicking into the editor swallowed the release and left the player walking forever. Releases are
  always observed now; only presses belong to the text field.
