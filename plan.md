# Kissing Circles — Port Plan

Porting **DynamicKissingCircles** (Android/Kotlin) to a modular JavaScript web app for
research into Apollonian circle packings.

---

## 1. What the old project actually is

I read all 819 lines of Kotlin. It's worth being blunt about the state of it, because it
changes what "port" means here.

| File | Lines | What it does | Verdict |
|---|---|---|---|
| `math/Gaussean.kt` | 52 | Gaussian integers `re + i·im` over `Long` | **Port the idea, rewrite** |
| `math/SoddyCircle.kt` | 76 | Circle as `(b, b·z)`; has the `complement()` spawn rule | **The good stuff** |
| `DynamicView.kt` | 283 | Pan/zoom canvas transform + touch handling | **Port the concept** |
| `KcTestView.kt` | 225 | Renders exactly one circle, plus scratch work | Scaffolding |
| `KissingCirclesView.kt` | 53 | Draws two hardcoded circles | Scaffolding |
| `MainActivity` / `KCActivity` | 70 | Menu → view routing | Not needed |

**The recursion was never written.** There is no packing generation anywhere in the
Android source — `drawIt()` renders a single circle `v1` and stops. Several defined
quadruples (`v1,v2,v3,c`) are constructed and immediately discarded.

Known defects in the source (documented here so the port doesn't inherit them):

- `SoddyCircle.minus` computes `b + c.b` — **sign bug**, should be `b - c.b`.
- `Gaussean.hashCode()` returns `(re+im)` — collides on everything on the anti-diagonal.
- `KcTestView` loads `fonts/Cambria.ttf` from assets; **there is no assets directory**.
  That constructor throws.
- `GausseanTest.kt` doesn't import `math.Gaussean` — it does not compile.
- `sizeChange()` sets `yOffset = width + height/4f`, mixing width into a vertical
  offset. Probably the origin bug that made panning feel wrong.
- `render()` bails on `b == 0` with a `// do something here` comment. Lines are unhandled.

**So: this is a port of the mathematical representation and the pan/zoom interaction
model, and a from-scratch implementation of everything else.** That's good news — the
representation is the part that was right.

### The one genuinely valuable idea in the old code

`SoddyCircle` stores a circle as **`(b, bz)`** where `b` is the curvature (`1/r`) and
`bz` is the *curvature times center*, held as a **Gaussian integer**. Then:

```kotlin
fun complement(p1, p2, p3) = SoddyCircle(
    2 * (p1.b  + p2.b  + p3.b)  - b,
    2 * (p1.bz + p2.bz + p3.bz) - bz)
```

That is the Descartes reflection rule, and **it is pure integer arithmetic** — no square
roots, no floating point. For an integral packing every circle at every depth is exact.
This is the spine of the whole project and it survives the port unchanged.

---

## 2. The mathematics we're building on

**Descartes Circle Theorem.** For four mutually tangent circles with curvatures
`b₁..b₄`:

```
(b₁ + b₂ + b₃ + b₄)² = 2(b₁² + b₂² + b₃² + b₄²)
```

Solving the quadratic for `b₄` gives two roots whose sum is `2(b₁+b₂+b₃)`. Given one
solution, the other is:

```
b₄' = 2(b₁ + b₂ + b₃) − b₄        ← Vieta jump. No square root.
```

**Complex Descartes Theorem** (Lagarias–Mallows–Wilks, 2002). The identical relation
holds for the products `bᵢzᵢ` where `zᵢ ∈ ℂ` is the center:

```
(b₁z₁ + b₂z₂ + b₃z₃ + b₄z₄)² = 2((b₁z₁)² + (b₂z₂)² + (b₃z₃)² + (b₄z₄)²)
b₄z₄' = 2(b₁z₁ + b₂z₂ + b₃z₃) − b₄z₄
```

Which is exactly `complement()`. The pair `(b, bz)` is therefore closed under the
recursion, and for an integral packing stays in `ℤ × ℤ[i]` forever.

**The recursion.** Start from a root Descartes quadruple. Each of the 4 choose 3 = 4
triples, together with the fourth circle, produces one new circle by Vieta jump. Discard
the jump that reproduces the parent; each new circle plus its generating triple forms a
new quadruple. Recurse. Curvatures grow monotonically, which gives a natural
termination condition.

Canonical roots to ship:
- `(−1, 2, 2, 3)` — bounded packing inside a unit circle. The classic picture.
- `(0, 0, 1, 1)` — the strip packing between two parallel lines.
- `(−3, 5, 8, 8)`, `(−6, 11, 14, 15)` — other primitive integral packings.
- Arbitrary user-entered quadruple, validated against the theorem.

**Zero curvature.** `b = 0` is a straight line, and the old code punted on it. We handle
it by carrying the full **augmented curvature-center coordinate** row:

```
(b̄, b, bx, by)     b̄ = co-curvature (curvature of the image under z ↦ 1/z̄)
```

This 4-vector is what the Apollonian group acts on by matrix multiplication — which is
what those unused `V1, V2, V3, E1, E2, E3` matrices in `SoddyCircle.kt` were reaching
for. With `b̄` carried along, lines are just rows with `b = 0` and need no special case
in the recursion, only in the renderer.

---

## 3. Target architecture

Plain **ES modules, no build step**. This matters: GitHub Pages serves the source
directly, `git push` is the deploy, and there's no bundler between what I write and what
runs in the debugger. For a research tool that's worth more than tree-shaking.

```
kissing-circles/                    ← git repo root
├── .gitignore                      ← ignores DynamicKissingCircles/
├── plan.md                         ← this file
├── README.md
├── index.html                      ← entry point; GitHub Pages serves from root
├── src/
│   ├── math/
│   │   ├── gaussian.js             ← Gaussian integers over BigInt
│   │   ├── circle.js               ← Circle: (bbar, b, bz) + Vieta jump
│   │   ├── descartes.js            ← theorem, validation, root quadruples
│   │   └── packing.js              ← the recursion; generation + pruning
│   ├── render/
│   │   ├── viewport.js             ← world ↔ screen transform (ports Trans)
│   │   ├── renderer.js             ← Canvas2D draw loop, culling, LOD
│   │   ├── palette.js              ← curvature → color
│   │   └── labels.js               ← curvature numerals inside circles
│   ├── ui/
│   │   ├── controls.js             ← desktop control panel
│   │   ├── input.js                ← mouse/wheel/keyboard/touch (ports DynamicView)
│   │   └── state.js                ← URL-encoded view state
│   └── main.js                     ← wiring
├── test/                           ← node --test, zero dependencies
│   ├── gaussian.test.js
│   ├── descartes.test.js
│   └── packing.test.js
└── DynamicKissingCircles/          ← old source, ignored, kept for reference
```

**Hard rule: `src/math/` imports nothing from `src/render/` or `src/ui/`.** It must run
under bare `node` with no DOM. The old code stated this intent in a comment
(`"the mathematical aspect is separate from the presentation"`) and then put
`SoddyCircle` construction inside `drawIt()`. Enforced by the test suite running in Node.

### BigInt, and where we stop using it

Curvatures in a deep packing grow fast — depth 20 in the `(−1,2,2,3)` packing reaches
curvatures past 2⁵³, where `Number` silently loses integer precision and tangency
degrades into visible gaps. So:

- **Generation** is `BigInt` throughout. Exact at any depth.
- **Rendering** converts to `Number` at the last moment, per circle, after the
  world→screen transform. A circle being drawn is at most a few thousand pixels; the
  precision loss is far below one pixel.
- Each `Circle` caches its float `{x, y, r}` lazily so the conversion happens once.

If BigInt generation profiles too slow, the fallback is a `Number` fast path for
`|b| < 2⁵³` with automatic promotion — but measure before optimizing.

---

## 4. Phases

### Phase 0 — Repository setup
- `git init` at `kissing-circles/`.
- `.gitignore` containing `DynamicKissingCircles/` (plus `node_modules/`, `.DS_Store`).
  The old repo has its own `.git` and its own GitHub remote; it stays untouched and
  unreferenced.
- `README.md`: what this is, how to run it, link to the live Pages build.
- Initial commit.

**Done when:** `git status` is clean and shows nothing from the old project.

### Phase 1 — The math core
Port and fix, with tests first.

1. `gaussian.js` — `BigInt` real/imaginary parts. Immutable. `add`, `sub` (with the sign
   bug fixed), `mul`, `neg`, `scale`, `equals`, `toString`. Correct `hashCode`/key if
   we need a `Set` for deduplication.
2. `circle.js` — `Circle { bbar, b, bz }`. Methods: `spawn(c1,c2,c3)` (the Vieta jump),
   `radius()`, `center()`, `isLine()`, `toFloat()`.
3. `descartes.js` — `validate(quad)` checking the theorem holds exactly; `solve(b1,b2,b3)`
   returning both roots; the named root quadruples.

> **Built, with one addition.** Column-wise Descartes checks are not sufficient to
> validate a quadruple. The full Lagarias–Mallows–Wilks identity `WᵀQ_D W = Q_W`
> also constrains the columns *against each other*, and a root can satisfy every
> single-column relation while failing a cross-relation — which is exactly what
> happened when the strip root was first written with both line normals reversed.
> Every circle in it satisfied `|bz|² − b·b̄ = 1`, Descartes held on the curvature
> and co-curvature columns, the complex relation held, all six tangencies held —
> and 4358 of the 4376 generated circles were not circles. `lmwErrors()` checks all
> ten relations and catches it. Roots are validated by the test suite, so this class
> of error cannot reach the renderer.

**Tests (`node --test`, no dependencies):**
- The Descartes invariant holds *exactly* (BigInt equality, not epsilon) for every
  circle generated to depth 12.
- Known curvature sets appear: the `(−1,2,2,3)` packing must contain
  `6, 11, 14, 15, 18, 23, 26, 27, 30, 35, 38, 39...`
- Tangency check: for every generated quadruple and every pair in it,
  `|z₁−z₂|² = (r₁+r₂)²` — verified in exact rational arithmetic via the `(b, bz)` form.
- Round-trip: `spawn` twice with the same triple returns the original circle.

**Done when:** `node --test` passes with no DOM, no browser, no dependencies.

### Phase 2 — Generation and recursion
`packing.js`. The part the Android app never had.

- Depth-first recursion from a root quadruple, with an explicit stack rather than
  actual JS recursion — depth 25+ in a wide packing will otherwise blow the call stack,
  and an explicit stack also makes generation **resumable**, which Phase 5 needs.
- Termination, all configurable and all simultaneously active:
  - max depth
  - max curvature (`|b| > B` ⇒ stop)
  - **screen-space pruning**: stop when the circle would render smaller than ~0.5px.
    This is the important one — it makes cost proportional to what's *visible*, not to
    the depth requested.
  - viewport culling: a circle entirely offscreen has no visible descendants (its
    children are strictly inside it), so the whole subtree is prunable.
- Emit into a flat typed structure, not a tree of objects — a tree of 10⁶ objects will
  thrash GC during pan. Circles carry a depth index and a parent index.
- Deduplication: a `Set` keyed on `b:bz.re:bz.im`. Cheap, exact, catches the duplicate
  circles the naive four-way recursion produces.

**Done when:** generating the `(−1,2,2,3)` packing to depth 15 in Node prints a correct
curvature histogram and completes in well under a second.

### Phase 3 — Rendering
- `viewport.js` — ports `DynamicView.Trans` honestly, minus the `width + height/4f`
  origin bug. `worldToScreen`, `screenToWorld`, `pan`, `zoomAt(screenPoint, factor)`.
  Zoom-about-cursor, which the Android version got wrong (its `onScale` adjusts
  `yOffset` and never touches `xOffset` — there's even a comment noticing it).
- `renderer.js` — Canvas2D, `devicePixelRatio`-aware so it's sharp on a Retina display.
  Batch circles into a single `Path2D` per color to cut state changes. Cull to viewport.
- `palette.js` — a perceptually even palette indexed by curvature. The old 18-color
  `CircleColor` enum had `Fuchsia` and `Magenta` as literally the same value and several
  near-white entries that vanish on a white background. Replace it; keep the option of
  coloring by depth or by curvature mod n, which is the more research-useful mode.
- `labels.js` — draw the curvature numeral when the circle exceeds ~40px. This is the
  research-critical feature: reading the integer curvatures straight off the picture.
  Web fonts, so no missing-asset crash.

**Done when:** the classic `(−1,2,2,3)` packing renders correctly, with legible integer
curvatures, at 60fps while panning.

> **Built.** 8.3 ms per frame (~120 fps) at 1400×900 on a Retina backing store with
> 3,300 circles on screen and the view moving every frame. Four things only became
> visible once the page was actually rendered and looked at:
>
> - **The golden angle is the wrong hue map here.** Buckets are curvature mod 24, and
>   a packing does not use all 24 residues — the classic one uses only 8. The golden
>   angle placed residues 2 and 23 just 7.7° apart, so two of the commonest
>   curvatures came out the same purple. A multiplier of 173°/bucket was chosen by
>   search: 28° minimum separation across the residues that occur, 14° across all 24.
> - **`maxDepth: 64` silently capped deep zoom.** Past about 5000× the packing simply
>   stopped deepening. Depth is now effectively unbounded; resolution and viewport do
>   the pruning, which is what should have been doing the work all along.
>
> The reported "17 fps" that prompted the performance work was an artifact: the HUD
> used an exponential average starting from zero, which takes hundreds of frames to
> climb. It now reports a median over a short window.
>
> **Numeral size is a design decision, and it is settled.** A numeral is set as large
> as it can be and still fit inside its circle, so it bears a *constant ratio to the
> circle it labels*, at every zoom level, with no ceiling of any kind. Zooming in
> grows the numeral exactly as it grows the circle. Longer curvatures are set smaller
> so their box still fits — that is the "as long as they fit" part — but nothing else
> alters the relation.
>
> I got this wrong twice. First by sizing from a fixed cap height, which makes every
> numeral the same weight regardless of digit count. Then, after reverting that, by
> keeping a viewport ceiling I described as engaging "only for a circle bigger than
> the window" — it was 12% of the viewport, about 91px, while the correct
> proportional size for the large circles at the default view is around 360px, so it
> was quietly clamping nearly every numeral in the picture. A cap that engages at
> some size shows up as the numeral detaching from its circle partway through a zoom,
> which is worse than a numeral running off screen. There is now a test asserting the
> ratio is constant from radius 100 to radius 500,000.

### Phase 4 — Interaction, desktop-first
The Android version was touch-only. Desktop gets the better experience:

- **Mouse**: drag to pan, wheel to zoom about the cursor, double-click to zoom in.
- **Keyboard**: arrows pan, `+`/`−` zoom, `0` reset view, `[`/`]` depth down/up,
  `L` toggle labels, `C` cycle color mode, `Space` pause/resume generation.
- **Hover readout**: cursor over a circle shows its curvature, exact center as a
  Gaussian rational, depth, and its generating quadruple. This is the tool a researcher
  actually wants and it has no touch equivalent.
- **Control panel**: root quadruple picker, custom quadruple entry (validated against
  the theorem, with the error shown), depth/curvature limits, color mode, label toggle.
- **Touch**: pinch-zoom and drag-pan preserved via Pointer Events, so one code path
  covers mouse, touch, and stylus. Panel collapses to a drawer on narrow screens.

**Done when:** it's genuinely more pleasant on a desktop than the phone version was, and
still works on a phone.

> **Built.** The hover readout gives a circle's curvature, radius, center as a reduced
> Gaussian rational, co-curvature, depth, and the quadruple it was reflected out of.
> That needed two additions: the generator now records each circle's parent triple as
> indices, and hit-testing runs against the indices drawn last frame — bounded by
> what is on screen rather than by the hundreds of thousands a deep zoom accumulates,
> and so incapable of reporting a circle the user cannot see.
>
> **Custom roots turned out to be constructible after all.** Phase 1 deferred this,
> expecting it to need a square root in ℤ[i]. It does not. Placing four curvatures
> from their pairwise distances is entirely rational — `|zᵢ − zⱼ| = |bᵢ+bⱼ| / |bᵢbⱼ|`
> — and the one square root that appears comes out rational for an integral
> quadruple. Two things make it work:
>
> - **A translation search.** The natural placement is almost never integral:
>   `(−3,5,8,8)` lands on `0, 2/3, −4/3+i, −4/3−i`. Since translating by `c` sends
>   `b·z` to `b·z + b·c`, and the products share a denominator `D`, only the `D`
>   translations `c = u/D` need trying. Here `c = 2/3` gives `−2, 4, 4+i, 4−i`.
> - **An ordering search.** Placing the first two circles on the real axis fixes the
>   orientation, and only some orientations are integral. `(−6,11,14,15)` has no
>   integral placement from that pair but does from `−6` and `14`. There are only 24
>   orderings, so try them all.
>
> Everything is verified by `validateQuad` before it is returned, so a constructed
> root is held to the same standard as a hand-derived one. `(−2,3,6,7)`, `(−3,5,8,8)`
> and `(−6,11,14,15)` now ship as named roots, built at load time.
>
> The depth control became a *display* filter rather than a generation limit —
> nothing is discarded, so peeling back to depth ≤ 1 and forward again is instant and
> lossless. It shows the root quadruple and its four children, which is a better
> explanation of the recursion than any diagram.

### Phase 5 — Deep zoom
The payoff of exact arithmetic. As you zoom in, circles pruned as sub-pixel become
visible and must be generated on demand.

- Generation resumes from the saved stack when the viewport changes, rather than
  restarting.
- Run it incrementally across frames (chunked in a `requestIdleCallback`-style loop) so
  the UI never blocks. Move it to a Web Worker if a single-threaded chunked loop stutters.
- Because everything is `BigInt`, zooming to curvature 10¹⁵ and beyond stays *exact* —
  tangencies remain perfect where a float implementation visibly falls apart. Worth
  building a side-by-side demo of exactly that; it's the strongest argument for the
  representation.

### Phase 6 — Research features
- **Export**: SVG and PNG at arbitrary resolution, for papers and figures.
- **Curvature analysis**: histogram, which residues mod 24 appear (the local-global
  conjecture territory), count by depth.
- **Shareable URLs**: encode root quadruple + viewport + settings in the fragment, so a
  specific view can be linked in a paper or an email.
- **Apollonian group view**: expose the `V1..V3 / E1..E3 / C` matrix generators the old
  code sketched, acting on the augmented coordinate row — showing the packing as a group
  orbit rather than a recursion.

### Phase 7 — GitHub Pages
- New public repo, Pages serving from `main` at root.
- No build step means no Actions workflow and no `gh-pages` branch — push is deploy.
- Add a `<link rel="canonical">` and an OG image (a rendered packing) so shared links
  preview well.
- Optional later: a Vite build if we ever want minification. Not before it's needed.

---

## 5. Decisions worth flagging now

These are the calls I'd make; say the word if you'd rather go the other way.

1. **BigInt over Number.** Costs some speed, buys exactness at any depth. For a research
   tool about *integral* packings, exactness is the point. → **BigInt.**
2. **No build step.** Native ESM, direct Pages deploy, debuggable source. Costs
   minification and npm libraries. → **No build step**, revisit only if we need a library.
3. **Canvas2D over WebGL.** Canvas2D handles ~10⁵ circles comfortably, and it's what the
   Android `Canvas` port maps onto naturally. WebGL is a Phase 5+ option if deep zoom
   demands 10⁶+. → **Canvas2D**, keep the renderer swappable behind one interface.
4. **Rewrite, don't transliterate.** Only `(b, bz)` + `complement()` and the pan/zoom
   transform model carry over. Everything else is new code — a faithful transliteration
   would import the bugs listed in §1.
5. **Vanilla JS, JSDoc types.** No TypeScript, so no compile step; JSDoc annotations give
   editor type-checking anyway. → **Vanilla + JSDoc**, `// @ts-check` at the top of the
   math modules.

---

## 6. Suggested order of work

1. Phase 0 — repo, `.gitignore`, first commit. *(minutes)*
2. Phase 1 — math core + tests. Nothing renders yet, everything is verified. *(the foundation)*
3. Phase 2 — recursion, validated in Node against known curvature sets.
4. Phase 3 — first pixels. The classic packing on screen.
5. Phase 4 — desktop interaction.
6. Phase 7 — get it on Pages early, even if rough. Deploying is easier to keep working
   than to fix later.
7. Phases 5 and 6 — deep zoom and research features, iteratively.

The dependency that matters: **Phase 1's tests must pass before anything is drawn.**
Rendering a wrong packing beautifully is the failure mode to avoid, and it's exactly
where the Android version ended up — a pretty pan/zoom canvas with no correct math
behind it.
