# arche gotchas

Workarounds in `src/portfolio.arche` that look like mistakes and are not. Do not "clean these up" without
checking the compiler still has the bug.

## Singleton-pool query broadcast

Several pools are declared with **extent 2 and one live row**:

```arche
[2]Player(1);
[2]Focus(1);
[2]Touch(1);
```

A `[1]`-extent pool that shares a **device-datasheet column** with wider pools makes a query anchor on the shared
column and **broadcast** the singleton's other columns onto every matching row. Extent 2 sidesteps it. See
`../arche/tests/extras/query_singleton_pool_broadcast.arche` (a RED bug-capture test).

The `Focus`/`Touch` columns are also deliberately **plain, non-datasheet** ints, which keeps them out of the
bug's blast radius entirely.

The UI pools have the same problem, and it is **latent until a neighbouring pool grows**. `[1]Editor` was fine
next to `[1]Panel`; the moment `Panel` became `[4]` (two panels + headroom), `textedit`'s `query { source, len }`
started matching Panel rows through the shared `len` column and `source` failed to resolve — surfacing as an
unrelated-looking LLVM type error inside `textedit_be_text`. `Editor` and `Output` are `[2]` for that reason.

**If you widen a UI pool, widen its `[1]` neighbours too.**

## Negative constants do not exist

```arche
ARENA_L :: -1700.0;   // "a constant's value must be a literal"
```

The minus makes it an *expression*, and a const's value must be a literal. The sandbox sits at negative world-x,
so its bounds are stored as **magnitudes** and negated at their (two) use sites. Negative numbers are fine inside
array literals and function bodies — just not after `::`.

## `select` in a return-tuple slot mis-types as i32

```arche
return (select(c, a, b), ...);   // mis-lowers as an integer
```

Bind to a local first:

```arche
rx := select(c, a, b);
return (rx, ...);
```

Same for a bare binary op in a tuple slot. `esc_pos` / `esc_vel` do this.

## Binding a vec component to a scalar local mis-types as i32

```arche
v := vec.mk(a, 0.0).x;   // v is inferred i32, not float
```

It only detonates when the local reaches a context that forces a type (a `select` arm), and it *hides* when the
other arm is a literal. Keep the value in a **vec local** and use `.x` inline at every use site. Captured as
`../arche/tests/unit/language/vec_component_local_type.arche`.

Where a count has to come back as a float, routing it through the reciprocal twice forces the right type:

```arche
msi := 1.0 / select(me.cor.x > 1.0, me.cor.x, 1.0);
ms := 1.0 / msi;
```

## A nested `map` is not a column transform

A pure `map` body must be a sequence of `col = expr`. A nested `map` inside one is rejected. Either make the
outer a `system eff` (which may nest), or split into two systems — `vinput_clear` + `vinput` do the latter:
clear the accumulator in a pure map, then fold in an `eff` system whose outer map is over the *Buttons* and whose
inner map is over the *Touch* pool.

## `ppx` is its own scalar type

A bare float will not assign to it. Keep the expression `ppx`-typed:

```arche
ppx = ppx + (pos.x - ppx);
```

## Queries match by column, so scope them deliberately

`map (query { lvel })` matches **every** rigid body — Box, Ball, Solid, Player. A driver system that means "the
player" must include a Player-only column (`ppx`) purely to scope it. The same applies to `query { clicked }`,
which matches every `Button` row (hence `bid`), and `query { key }`, `query { view }` and friends across the UI
archetypes.
