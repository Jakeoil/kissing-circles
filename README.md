# Kissing Circles

Exact integral Apollonian circle packings, in the browser.

**Live: https://jakeoil.github.io/kissing-circles/**

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

## Running it

Open the [live site](https://jakeoil.github.io/kissing-circles/), or serve it locally.
ES modules need a real origin, so use HTTP rather than the filesystem:

```sh
python3 -m http.server 8000     # then visit http://localhost:8000/
```

There is no build step. GitHub Pages serves these files exactly as they are in the
repository, so `git push` is the whole deployment.

Drag to pan, wheel or pinch to zoom, double-click to zoom in. `0` resets the view,
`+`/`-` zoom, arrows pan, `[`/`]` peel the packing back a level at a time, `l` toggles
the curvature labels, `c` the color mode, `t` the theme, and `space` pauses generation.
Zooming in generates new detail on the fly rather than regenerating from scratch.

Hovering a circle reports it exactly: curvature, radius, center as a reduced Gaussian
rational, co-curvature, depth, and the Descartes quadruple it was reflected out of.

The **custom** field takes four curvatures — `-6,11,14,15` — and builds that packing,
or explains why it cannot.

**analysis** opens the curvature arithmetic: which residues mod 24 the packing occupies,
and which integers inside those classes it never reaches. **link** copies a URL that
restores the exact packing and view. **PNG** and **SVG** export what you have framed —
SVG stays sharp at any size, which matters for print.

Light and dark themes both ship; the selector follows the system setting by default
and remembers an explicit choice.

## Numerals

Reading integer curvatures off the picture is the point of the tool, so the numerals
get some care. The font is self-hosted rather than left to a system stack — see
[assets/README.md](assets/README.md) for why, and for how to swap it. Sizing and
placement are measured at runtime from the font's own digit bounding box, so numerals
sit on their optical center rather than on the em box. A numeral is set as large as it
can be and still fit, so it bears a constant ratio to its circle at every zoom level —
zooming in grows the numeral exactly as it grows the circle. Longer curvatures are set
smaller so their box still fits. Nothing in `src/` names a specific font.

The page shows a **build stamp** in the top bar. It is written by `npm run stamp` and
is there so what is on screen can be checked against what was last built — a stale
cached module otherwise looks exactly like a change that did not work.

## Status

Phases 1 through 6 complete: the math core, the generator, the renderer, the research
interaction, and the arithmetic tooling.

| Module | Purpose |
|---|---|
| `src/math/gaussian.js` | Gaussian integers over BigInt |
| `src/math/circle.js` | Augmented curvature-center coordinates; the Descartes reflection |
| `src/math/descartes.js` | The theorem, exact validation, named root quadruples |
| `src/math/packing.js` | Budgeted, resumable generation with screen-space pruning |
| `src/render/viewport.js` | World-to-screen transform |
| `src/render/renderer.js` | Canvas 2D drawing, batched by color |
| `src/render/labels.js` | Curvature numerals, measured from the font |
| `src/render/palette.js` | Color by curvature or by depth, light and dark |
| `src/math/rational.js` | Exact rationals, for constructing a root from curvatures |
| `src/math/analysis.js` | Residues mod 24, and the integers a packing misses |
| `src/ui/readout.js` | Exact formatting for the hover panel |
| `src/ui/share.js` | View state in the URL fragment |
| `src/ui/export.js` | PNG and SVG output |

Measured at 1400x900 on a Retina backing store: 8.3 ms per frame, about 120 fps, with
3,300 circles on screen and the view moving every frame.

## Curvature arithmetic

A primitive integral Apollonian packing only produces curvatures in certain classes
modulo 24 — the classic `(-1, 2, 2, 3)` packing uses eight of the twenty-four, and
`(-2, 3, 6, 7)` uses a different eight. Within those classes most integers occur, but
not all: `(-1, 2, 2, 3)` misses 78 and 159, and 35 integers in total below 10,000. The
local–global conjecture held that such exceptions were finite; it was disproved in 2023
by Haag, Kertzer, Rickards and Stange, so the analysis panel lists them rather than
assuming them away.

Still to come: a memory budget for very long deep-zoom sessions, and deploying to
GitHub Pages (Phase 7).

## Tests

No dependencies, no build step. Node 18+:

```sh
npm test          # or: node --test test/*.test.js
```

The suite checks the augmented invariant and the full Lagarias–Mallows–Wilks matrix
identity in exact BigInt arithmetic across every quadruple visited in a generated
packing, verifies all six pairwise tangencies without square roots, and drives one
chain of reflections past curvature 2^53 to confirm nothing drifts. It also holds the
generator to the naive reference implementation in `test/helpers/`, and checks that
refining a packing step by step lands on exactly the same set of circles as generating
it outright — the property deep zoom depends on.

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

https://www.mathpuzzle.com/MAA/15-Gaussian%20Numbers/mathgames_03_15_04.html

