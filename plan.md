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

> **Built**, and the arithmetic turned out to be the most interesting part. The
> analysis panel generates to a curvature bound and reports which residues mod 24 the
> packing occupies and — the useful part — which integers *inside* those admissible
> classes it never reaches. `(−1,2,2,3)` misses 78 and 159 first, 35 integers in all
> below 10,000; `(−2,3,6,7)` occupies a different eight residues and misses 132. The
> local–global conjecture held such exceptions were finite and was disproved in 2023,
> so listing them is more honest than assuming them away. 141 ms to curvature 10,000.
>
> Two bugs the browser caught that no test would have: the export buttons were being
> swallowed by the help panel, which overlapped them and intercepted the clicks; and
> downloads never fired because the anchor was detached from the document and the
> object URL was revoked before the click took effect.
- **Export**: SVG and PNG at arbitrary resolution, for papers and figures.
- **Curvature analysis**: histogram, which residues mod 24 appear (the local-global
  conjecture territory), count by depth.
- **Shareable URLs**: encode root quadruple + viewport + settings in the fragment, so a
  specific view can be linked in a paper or an email.
- **Apollonian group view**: expose the `V1..V3 / E1..E3 / C` matrix generators the old
  code sketched, acting on the augmented coordinate row — showing the packing as a group
  orbit rather than a recursion.

### Phase 7 — GitHub Pages

> **Deployed: https://jakeoil.github.io/kissing-circles/**
>
> The no-build-step decision from §5 paid off exactly as intended: Pages serves the
> repository verbatim, there is no Actions workflow and no `gh-pages` branch, and
> `git push` is the entire deployment. Added `.nojekyll`, a canonical URL, and Open
> Graph tags with a preview image generated from the running app.
>
> Verified against the deployed site rather than the local copy: modules and the
> self-hosted font load, `document.fonts.check` confirms Caladea is the font actually
> in use, the analysis panel reports the same misses (78, 159, 207, …), and a
> deep-zoom shared link round-trips at zoom 9357. No console errors, no failed
> requests.
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

---

## 7. Rendering

Two open questions, answered here so the answers stop being re-litigated: **how the app
is structured as the mathematics grows**, and **what the numerals look like**.

### 7.1 One core, several kinds of page

**This section originally said "one page with modes". That answered the wrong
question.** It answered *how is the code structured* and presented the result as
though it also answered *how does a reader move through this*. Those are separable,
and conflating them cost the project its narrative: a single page with a mode dropdown
is architecturally tidy and pedagogically flat. You cannot tell a story in a `<select>`.

The half that was right stays:

> **One shared core.** Every view imports the same `src/` modules — the exact
> arithmetic, the viewport, the renderer, the palette, the numerals. Nothing is
> duplicated, nothing forks. This is what keeps every picture in the project
> arithmetically identical and is not negotiable.

The half that was wrong is replaced. There are **three kinds of page**, and they differ
in what they are *for*, not in what they are built from:

| | Purpose | Polish | Linked |
|---|---|---|---|
| **The workbench** — `index.html` | The research tool. Every packing, every control, deep zoom, analysis, export. | Finished | Everywhere |
| **Chapters** — `story/*.html` | One idea each, with prose and one live figure. Read in order. | Finished | From the contents and each other |
| **Labs** — `labs/*.html` | One question, asked and answered. May be ugly. | None | From the workbench, loosely |

A chapter is not a mode and not a lab. It has **prose**, a **single figure with the
fewest controls that make the point**, and a **place in a sequence**. The workbench is
where a reader ends up once the story has given them a reason to poke at something; a
lab is where I go to find out whether an idea works before it earns prose.

**The rule that keeps this from sprawling:** a chapter may import from `src/` and may
not contain mathematics of its own. If a chapter needs something the core cannot do,
that is a signal to extend the core, not to write a one-off in the page. The moment a
chapter carries its own arithmetic, the project has two implementations and the
guarantee that every picture is exact quietly dies.

**A decision I have not made, because it is not mine.** Should `index.html` stay the
workbench, with the story at `story/`, or should the front door become the contents
page with the workbench moving to `app/`? The story-first arrangement is better for a
teaching program. It also **breaks every link already shared**, because those are
`index.html#…` fragments — see §7.2. My recommendation is to keep `index.html` as the
workbench and link the story prominently from it, but this is worth deciding
deliberately rather than by default.

### 7.2 The legacy guarantee

The requirement is that the current view keeps working as new modes arrive. Stated
concretely, so it can be checked rather than hoped for:

> **Every state reachable today must stay reachable through controls, and every URL
> emitted today must keep rendering the same picture.**

That is testable, and it is the reason the share fragment matters beyond convenience.
The commitment has three parts:

1. **The default view does not change.** Loading the page with no fragment gives the
   `(−1, 2, 2, 3)` packing, framed on its bounding circle, colored by curvature, with
   numerals on. A new mode may be *offered*, but must not become the default.
2. **Old fragments keep working.** `decode()` already returns `null` for anything it
   cannot parse and falls back rather than breaking, and unknown keys are ignored. Any
   new mode key must therefore default to "the current behavior" when absent — never
   the reverse.
3. **A set of canonical URLs is kept and checked.** A handful of fragments — default
   view, deep zoom, strip packing, custom root, depth filter — rendered and compared
   before anything ships. This is the concrete form of "show that state with controls".

The one thing that would break this is a mode that changes what a *circle* is. The
Schmidt arrangement does not: its circles are the same `(b̄, b, b·z)` rows, in a
normalization where curvatures are even (§7 of the notes). So it can be a mode.

### 7.3 Numerals

Reading curvatures off the picture is the point of the tool, so the typeface is not
decoration. The catalogue is `src/render/fonts.js`; the mechanics are in
[assets/FONTS.md](assets/FONTS.md).

**Six faces, chosen in the app**, with the choice carried in the share link and
remembered locally:

| Font | Figures | Source |
|---|---|---|
| **Caladea** (default) | lining | shipped, Apache 2.0 |
| Times New Roman | lining | system |
| Georgia | **oldstyle** | system |
| EB Garamond | **oldstyle** | shipped, SIL OFL |
| Crimson Pro | **oldstyle** | shipped, SIL OFL |
| STIX Two Text | **oldstyle** | shipped, SIL OFL |

Caladea stays the default because it is what the deployed site already draws with, and
§7.2 says adding a control must not change the default view.

**Oldstyle figures cannot be requested at draw time.** `ctx.font` takes a CSS font
shorthand, which has no room for `font-feature-settings`, and the `@font-face` descriptor
form is ignored — measured directly, a family declared with `'onum' 1` gives metrics
identical to the same family without it. So the feature is *frozen into the font*:
`pyftfeatfreeze -f onum` makes the oldstyle set the default and nothing needs selecting
at draw time. Georgia is the exception that needs no treatment, its figures being
oldstyle already.

**Sizing and placement stay measured, never assumed.** Nothing in `src/` names a font.
The size still comes from the digit box measured once per face, so every numeral holds
the same constant ratio to its circle (§Phase 3 — settled, and not to be capped). But
each numeral is now centerd on **its own** measured box rather than on the average over
all ten digits, because with oldstyle figures `11` has no descender and `39` has two; a
shared offset leaves one of them sitting visibly wrong.

**A consequence worth knowing before choosing.** Oldstyle numerals *look* smaller at the
same setting, because their measured box includes descenders while their visible body is
x-height. EB Garamond in particular sets `1` as a short figure close to a lowercase
roman numeral, which is authentic but can read oddly in a circle labelled `11`. If a
face is chosen for the default and this becomes annoying, the fix is to size oldstyle
faces from x-height rather than from the full box — a per-face metric, not a global
change.

**Adding a face** is: an entry in `src/render/fonts.js`, an `@font-face` in `index.html`
if it is shipped, and nothing else.

### 7.4 The chapters

A story, not a feature tour. Each chapter asks a question, answers it with a figure you
can move, and leaves you needing the next one. The arc is already latent in what has
been built — this is mostly a matter of putting it in order and writing it down.

**1 · Four circles that touch.**
Descartes' theorem. Drag one of four mutually tangent circles and watch
`(Σb)² = 2Σb²` hold. *Ends on:* given three circles, there are exactly two that
complete them — so which one do you draw?

This chapter carries **Soddy's poem**, which states the theorem in verse and gives the
circles their other name. Frederick Soddy, "The Kiss Precise", *Nature* **137**, 1021
(20 June 1936) — the second stanza ends:

> Since zero bend's a dead straight line
> And concave bends have minus sign,
> **The sum of the squares of all four bends**
> **Is half the square of their sum.**

which is `Σb² = ½(Σb)²`, our relation rearranged. Soddy states the sign conventions the
code uses — a line has bend zero, an enclosing circle has negative bend — in two lines
of verse, thirty-nine years before Schmidt and sixty-six before Lagarias, Mallows and
Wilks. The poem has a third stanza extending to spheres; quote what is used and cite
the rest.

**On the name.** Jake's Android original called the class `SoddyCircle`, and that is
the better name for what the workbench draws. The code keeps `Circle` — it also
represents lines, and the arrangement's circles are not all Soddy circles — but the
prose and the interface should say *Soddy circles* where that is what is meant.

**2 · The jump.**
Both answers are roots of the same quadratic, so they sum to `2(b₁+b₂+b₃)`. Click a
triple, watch the fourth circle flip between its two positions. *Ends on:* the second
circle costs one subtraction. No square root. That is the whole recursion.

This chapter is also what the workbench's **custom** field should be explained by, and
redesigned around. The rules, which the field currently hides:

- **Three curvatures force the fourth — to two values**, `b₄ = b₁+b₂+b₃ ± 2√(b₁b₂+b₂b₃+b₃b₁)`.
  So the field should take *three* and offer both completions, not demand four and
  reject three of every four attempts.
- **Two do not force anything.** A free parameter remains; there are infinitely many
  completions.
- The four curvatures are a **multiset, not a set** — unordered, and duplicates are
  ordinary: `(−1, 2, 2, 3)` has two 2s. `rootFromCurvatures` already treats order as
  irrelevant, trying all 24 permutations internally.

**3 · Why the numbers stay whole.**
Curvature and center together, `(b, b·z)` in ℤ[i]. Side by side: the same packing in
exact integers and in floating point, zoomed until the float version's tangencies
visibly come apart. *Ends on:* the picture is made of integers, so it can be counted.

**4 · Generations.**
`4·3ⁿ⁻¹` new circles per generation. Peel the packing back with `[` and `]` and watch
it rebuild. *Ends on:* every circle has an integer curvature — which integers?

**5 · Which numbers appear.**
Curvatures mod 24: eight classes of twenty-four for `(−1,2,2,3)`, a different eight for
`(−2,3,6,7)`. Then the ones that are admissible and still never occur — 78, 159, and 33
more below ten thousand. *Ends on:* a conjecture that said these were finite, disproved
in 2023. The picture has an open problem in it.

**6 · Schmidt's two regions.**
The chapter that fixes the defect Jake spotted. Fig. 1 and Fig. 1\* **side by side and
separately**, because they subdivide different things: a circular region into seven, a
triangular one into four. Then, and only then, superimposed. *Ends on:* one of those
two rules is the Apollonian move you already know. The other you have never drawn.

**7 · The arrangement.**
Apply both rules everywhere. Outlines, not fills — and show why, by filling them once.
The gasket located inside it, at the factor of two that makes Schmidt's curvatures even.
*Ends on:* the packing was never the whole object. It is one orbit inside a larger one.

**8 · Ford circles, one dimension down.**
The same construction over ℝ: Ford circles on the rationals, subdividing by mediants.
Lemma 1.5 says which words in the generators produce them, so they can be picked out of
the arrangement and lit up. *Ends on:* continued fractions on the line are this
subdivision. So what is a continued fraction on the plane?

**9 · Walking to e^i.**
A complex number's expansion is the nested sequence of regions containing it, one per
generation. Type a number, watch it zoom. Schmidt's closed form for `exp[1/(−ib)]`
predicts the word `C² V₃ C² V₃³ C² V₃⁵ …`, so the walk can be checked against arithmetic
rather than against the picture. *Ends on:* the figure Ed Pegg wanted in 2004 and wrote
that he could not draw.

---

**The packings list has no principled basis yet, and should.** Every integral packing
has a unique **root quadruple** — the minimal one under the Apollonian group,
characterised by `a ≤ b ≤ c ≤ d`, `a ≤ 0` and `a + b + c ≥ d` (Graham, Lagarias,
Mallows, Wilks and Yan). Enumerated, they begin:

```
(−1,2,2,3) (−2,3,6,7) (−3,4,12,13) (−3,5,8,8) (−4,5,20,21) (−4,8,9,9)
(−5,6,30,31) (−5,7,18,18) (−6,7,42,43) (−6,10,15,19) (−6,11,14,15) …
```

The workbench currently offers #1, #2, #4 and #11 — an arbitrary subset, chosen because
they were the ones I had verified, not for any reason. It was not a limitation:
`rootFromCurvatures` builds all twelve of the first twelve without complaint. The list
should be generated from the enumeration rather than hand-picked.

**What each chapter needs from the core.** Most of it exists. The gaps, in order of
appearance: a draggable-quadruple figure (1, 2), a float-arithmetic comparison mode (3),
region-type-aware drawing so Fig. 1 and Fig. 1\* can be shown apart (6), the gasket's
embedding in the arrangement (7), Ford-circle word recognition (8), and the walker (9).
Chapters 4 and 5 need nothing new at all.

**Order of writing.** Not 1 through 9. Write **6 and 7 first** — they are where the
current work already is, and chapter 6 fixes a real defect. Then **4 and 5**, which need
no new code. Then **1, 2, 3**, which need the most new figure machinery and are the
least urgent because they cover the best-understood ground. **8 and 9** last, because 9
is the payoff and should not be rushed to meet an outline.


---

## 8. Next: modes, and the Schmidt arrangement

A plan, not a commitment. §7.1 settled that new views are modes inside one page; this
works out what a mode *is*, and stages the mathematics from
[notes/schmidt-generations.md](notes/schmidt-generations.md).

### 8.1 What a mode is

Today's generator is one specific thing: reflect a circle in a triple of tangent
circles. Schmidt's construction is more general — subdivide a region by applying a
Möbius map from a fixed set of generators. The Apollonian reflection is a special case,
which is why one page can hold both.

Concretely, a mode supplies three things and nothing else:

- **a generator** — something that fills a `Packing`-shaped structure from a root;
- **a framing** — the world rectangle to open on;
- **its own controls** — a fragment of the panel, shown only when the mode is active.

Everything else stays shared: viewport, renderer, palette, numerals, hover readout,
export, share links, analysis. The mode id joins the share fragment as another key that
**defaults to today's behavior when absent**, per §7.2.

The honest risk: `Packing` currently hard-codes the reflection rule in `_expand`. Making
it mode-agnostic means separating *what to expand* from *how to expand it*. That is a
refactor of the one module everything depends on, and it should be done with the test
suite green at every step, not in one move.

### 8.2 How a Möbius map acts on a circle — the piece that has to be right

The Apollonian recursion never needed matrices. The Schmidt construction is nothing but
matrices, so the action has to be exact, or the arrangement drifts off the Gaussian
integers within a few generations.

A circle `A|z|² + B̄z + Bz̄ + C = 0` corresponds to the Hermitian matrix

```
M = [ A   B ]     with A, C real
    [ B̄   C ]
```

and our representation is exactly that, already:

```
A = b        B = −b·z        C = b̄
```

so `M = [[b, −b·z], [−conj(b·z), b̄]]`, and `det M = b·b̄ − |bz|² = −1` by the invariant
in `Circle.isValid`. A Möbius map `g` acts by conjugation, and using the **adjugate**
rather than the inverse keeps everything integral:

```
M  ↦  adj(g)* · M · adj(g)          adj(g) = [[d, −b], [−c, a]]
```

**Checked, not assumed.** Applying each of Schmidt's seven generators to circles taken
from the current packing — the bounding circle, a curvature-2, a 3 and a 15 — the result
stays Hermitian (A and C real) and satisfies `|bz|² − b·b̄ = 1` **exactly, with no
scaling factor**, for all 28 combinations. So the action needs no normalization, every
entry stays a Gaussian integer, and the invariant is a free check on every step.

That is the load-bearing result for everything below: the whole Schmidt construction is
implementable in the representation we already have, in exact BigInt arithmetic, with
`Circle.isValid` as its own verification.

**Normalization.** Schmidt's curvatures are even (§4a of the notes); ours are not. A
factor of two converts between them. Pick one convention, state it in the module, and
convert at the boundary — not in scattered places.

### 8.3 What breaks when disks stop being empty

This is the part to plan for rather than discover. Three assumptions in the current
renderer hold only because an Apollonian gasket never subdivides a disk:

1. **Draw order does not matter.** Interiors are disjoint today, so circles can be
   batched by color and painted in any order. Once a disk contains circles, that
   fails completely.

   > **Settled, and more simply than this predicted.** I expected to bucket by depth
   > and batch by color within a depth. The real answer is not to fill at all: the
   > arrangement is drawn as **outlines**, which need no ordering, keep the color
   > batching intact, and are how these pictures are conventionally drawn. Filled, the
   > arrangement is a solid mass with no structure visible whatsoever — see the lab
   > page. `draw()` now takes `style: 'fill' | 'stroke'`, defaulting to `fill` so the
   > packing is untouched.
2. **`pick` can return the first hit.** With nesting it must return the *smallest*
   containing circle, which means scanning all candidates rather than stopping early.
3. **The bounding circle is the only negative curvature.** Probably still true, but the
   analysis panel and the palette both assume the sign means "the frame". Check.

None of these is hard. All three are silent if missed.

### 8.4 Staging

Ordered so each step is verifiable before the next depends on it.

1. ~~**The Möbius action, in `src/math/mobius.js`.**~~ **Done.** The seven generators
   plus S and I, the action by adjugate conjugation, and words in the generators.
   Schmidt's Lemma 1.1 turned out to be the ideal test material — `S³ = I`,
   `V_{j+1} = S Vⱼ S⁻¹`, `det Vⱼ = 1`, `det Eⱼ = i`, `det C = −i`, `Vⱼ⁻¹ = conj(Vⱼ)` —
   because together those identities pin every entry down, so a transcription error
   cannot survive. 19 tests.
2. ~~**A Schmidt generator.**~~ **Done**, in `src/math/schmidt.js`. Regions are a
   matrix and a type; a region's circle is its matrix applied to the real line.
   Verified by curvature — **every curvature it produces is even**, which is Schmidt's
   ρ(F) ∈ 2ℕ₀ arrived at independently, and the strongest available check that the
   construction is right. Region counts match `(3·5ⁿ − 1)/2` exactly: 1, 7, 37, 187,
   937, 4687. Note the gasket branches by 3 per generation and this by 5. 15 tests.

   It returns the same shape as a `Packing` — `circles`, `x`, `y`, `r`, `depth`,
   `count` — so the existing renderer draws it with no changes at all. That is the
   §7.1 thesis holding up under its first real test.
3. **Mode infrastructure**, once there are two real generators to abstract over — not
   before. Abstracting over one implementation is guesswork.
4. **The renderer's nesting work** (§8.3), driven by the arrangement actually rendering
   wrong without it.
5. **The continued-fraction walker.** Enter a complex number, follow its nested regions
   generation by generation. Schmidt's closed form for `exp[1/(−ib)]` is the test
   oracle — the expansion is known in advance, so this is checkable against arithmetic
   rather than against a picture. This is the payoff, and the thing the 2004 article
   wanted and could not draw.
6. **A Farey/Ford lab page**, if it helps explain the analogy. Lab page, not a mode:
   it needs neither the packing nor the viewport.

### 8.4a Found while starting chapter 7

**The gasket is in the arrangement, and the factor of two is confirmed.** Searching
the arrangement for four mutually tangent circles satisfying Descartes — allowing one
to be negatively oriented, since a bounding circle must be — turns up **(−2, 4, 4, 6)**,
156 times over. That is the classic `(−1, 2, 2, 3)` packing doubled. So are the others:
`(−4, 6, 12, 14)`, `(−6, 10, 16, 16)`, `(−8, 16, 18, 18)` are our named roots at twice
the curvature. One such quadruple passes `validateQuad` and generates a packing.

Two things that came out of trying to demonstrate it, both worth fixing before
chapter 7 can be written:

- **`arrangement()` prunes emission, not traversal.** `maxCurvature` and `bounds`
  decide what gets *recorded*; the region walk expands everything regardless. So the
  cost is 5ⁿ whatever the limits say, and generation 12 exhausts memory on a machine
  with 4 GB of heap. The limits need to prune the walk, which needs a bound on what a
  region's subtree can reach — the analogue of `branchBounds` in `packing.js`.
- **"Circles of curvature ≤ N" is not a finite set here.** The arrangement is invariant
  under translation by 1 and by i, so every curvature occurs infinitely often across
  the plane. Any comparison against a bounded gasket has to be windowed spatially, or
  it is measuring the wrong thing. My first attempt at the embedding check did exactly
  that and reported a meaningless 141 of 412.

Neither is hard. Both are silent, and the second produces a plausible-looking number.

### 8.5 What this does not answer

- ~~Whether the arrangement is *legible*.~~ **Answered by `labs/schmidt.html`, and the
  answer had teeth.** Filled, it is a featureless slab — every structure hidden, because
  the circles nest. Stroked, it is immediately the familiar picture: lines at integer
  heights, cusps at the Gaussian rationals, nested families tightening toward them. So
  legibility was never about density; it was about fill versus outline. Generation 7 is
  97,782 circles built in 320 ms. This is exactly what the lab page was for, and it
  overturned a prediction in §8.3 within minutes of existing.
- Whether curvature-mod-24 coloring means anything in the arrangement. The analysis
  panel assumes a single gasket; it may need a different question entirely.
- Memory. The arrangement grows faster than a gasket, and circles are still never
  evicted. The budget deferred after Phase 6 stops being optional here.

---

## 9. References

Everything this project relies on, in one place. Anything asserted in the code or the
notes should be traceable to something here; where a claim is second-hand rather than
checked against a primary source, that is said explicitly.

### The mathematics

- **Descartes' Circle Theorem.** The relation
  `(b₁+b₂+b₃+b₄)² = 2(b₁²+b₂²+b₃²+b₄²)`, and the Vieta jump
  `b₄' = 2(b₁+b₂+b₃) − b₄` that follows from it. Implemented in
  `src/math/descartes.js` and `Circle.spawn`.

- **Lagarias, J. C., Mallows, C. L., Wilks, A. R.**, "Beyond the Descartes Circle
  Theorem", *American Mathematical Monthly* **109** (2002), 338–361.
  [arXiv:math/0101066](https://arxiv.org/abs/math/0101066).
  The complex Descartes theorem, augmented curvature-center coordinates `(b̄, b, b·z)`,
  and the matrix identity `Wᵀ Q_D W = Q_W`. This is the representation the whole
  project is built on; the identity is what `lmwErrors()` checks, and checking only the
  per-column relations is what let a bad root through in Phase 1.

- **Graham, R. L., Lagarias, J. C., Mallows, C. L., Wilks, A. R., Yan, C. H.**,
  "Apollonian Circle Packings: Number Theory", *Journal of Number Theory* **100**
  (2003), 1–45. [arXiv:math/0009113](https://arxiv.org/abs/math/0009113).
  Integrality, the Apollonian group, and the congruence restrictions modulo 24 that
  `src/math/analysis.js` reports.

- **Haag, S., Kertzer, C., Rickards, J., Stange, K. E.**, "The Local-Global Conjecture
  for Apollonian circle packings is false" (2023).
  [arXiv:2307.02749](https://arxiv.org/abs/2307.02749).
  Why the analysis panel lists the admissible-but-absent curvatures instead of treating
  them as a finite nuisance. *Relayed, not read in full — the panel reports measured
  data and does not depend on the paper's argument.*

- **Schmidt, A. L.**, "Diophantine approximation of complex numbers",
  *Acta Mathematica* **134** (1975), 1–85.
  The complex continued fraction algorithm for **Q(i)**: Farey sets, the subdivision of
  the plane into circular and triangular regions, and the matrices V₁–V₃, E₁–E₃, C, S,
  I. §1.1 p. 4 defines the matrices; Lemma 1.1 p. 6 gives their determinants and the
  S-conjugacy; §1.2 p. 7 defines ρ(F) and states ρ(F) ∈ 2N₀. *Read directly from a copy
  of the paper; see [notes/schmidt-generations.md](notes/schmidt-generations.md).*
  Not redistributed here — `*.pdf` is gitignored.

- **Stange, K. E.**, [Schmidt Arrangements](https://math.katestange.net/illustration/schmidt-arrangements/)
  and [Visualizing imaginary quadratic fields](https://math.colorado.edu/~kstange/papers/Stange-short-exp.pdf).
  The modern framing: the orbit of the extended real line under PSL(2, O_K), and where
  Apollonian packings sit inside it.

- **Ford, L. R.**, "Fractions", *American Mathematical Monthly* **45** (1938), 586–601.
  Ford circles and mesh triangles, which Schmidt names as the thing Farey sets extend.
  *Cited via Schmidt's introduction, p. 2; not consulted directly.*

- **Pegg, E. Jr.**, [Math Games: Gaussian Numbers](https://www.mathpuzzle.com/MAA/15-Gaussian%20Numbers/mathgames_03_15_04.html),
  MAA, 15 March 2004. The article that prompted the project. Its account of Schmidt's
  method is the source of the "generations" framing; two of its counts are loose and
  are corrected against the paper in the notes.

- **OEIS**, [A042944](https://oeis.org/search?q=6,11,14,15,18,23,26,27) and neighbors —
  the curvature sequences of the `(−1,2,2,3)` packing, used informally as a check on
  the generator's output.

### Software and assets

- **Caladea**, by Huerta Tipográfica, Apache License 2.0. Metric-compatible with
  Cambria, and redistributable where Cambria is not. Shipped in `assets/`, with the
  licence, and explained in [assets/README.md](assets/README.md).

- **Cambria**, by Microsoft. The font the Android original reached for. Present on the
  development machine with Office, licensed with it, and **not** licensed for web
  embedding — hence Caladea.

- **Node.js `node:test`** for the test suite; no third-party test framework, and no
  runtime dependencies at all.

- **playwright-core** driving the system Chrome, used only for development — verifying
  the rendered page, measuring frame times, and generating the social preview image.
  Never a dependency of the shipped site; it lives outside the repository.

### Prior art in this repository's own history

- **Jakeoil**, [DynamicKissingCircles](https://github.com/Jakeoil/DynamicKissingCircles).
  The Android/Kotlin original. Contributed the `(b, b·z)` representation and the
  `complement()` reflection rule, which survive here essentially unchanged, and a
  transcription of Schmidt's matrices which turned out to be the key to §7 above.
