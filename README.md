# Kissing Circles

Exact integral Apollonian circle packings, in the browser.

A research tool for studying Apollonian packings, built on Descartes' Circle Theorem
and its complex extension. A port of the Android/Kotlin project
[DynamicKissingCircles](https://github.com/Jakeoil/DynamicKissingCircles) to modular
JavaScript. See [plan.md](plan.md) for the full design and the phased build-out.

## Why exact arithmetic

A circle is stored in augmented curvature-center coordinates `(bbar, b, b*z)`, with the
curvature-center product held as a Gaussian integer in BigInt. The Descartes recursion
is then a Vieta jump:

```
w' = 2*(w1 + w2 + w3) - w
```

componentwise. No square roots, no division, no floating point — so an integral packing
stays exactly integral to unlimited depth, and tangencies remain perfect at zoom levels
where a float implementation visibly comes apart. Floats appear only in the renderer,
converted per circle at draw time.

## Status

Phase 1 complete: the math core and its test suite.

| Module | Purpose |
|---|---|
| `src/math/gaussian.js` | Gaussian integers over BigInt |
| `src/math/circle.js` | Augmented curvature-center coordinates; the Descartes reflection |
| `src/math/descartes.js` | The theorem, exact validation, named root quadruples |

Nothing renders yet. That's deliberate — the plan's one hard dependency is that the math
is verified before a pixel is drawn.

## Tests

No dependencies, no build step. Node 18+:

```sh
npm test          # or: node --test test/*.test.js
```

The suite checks the augmented invariant and the full Lagarias–Mallows–Wilks matrix
identity in exact BigInt arithmetic across every quadruple visited in a generated
packing, verifies all six pairwise tangencies without square roots, and drives one
chain of reflections past curvature 2^53 to confirm nothing drifts.

`src/math/` imports nothing from the renderer or the UI and runs under bare Node with no
DOM. The test suite is what enforces that.

## Layout

```
src/math/     exact arithmetic, no DOM
test/         node --test, zero dependencies
plan.md       design and phases
```

`DynamicKissingCircles/` is the original Android source, kept locally for reference and
excluded from this repository.
