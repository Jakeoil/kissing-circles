# Intermission

Musings on where this project might go. Not a plan — `plan.md` is the plan, and it
records what was decided and why. This is the other thing: what is worth looking at
longer, what is beautiful, and what is still a mystery.

Jake's observations are marked as his. Where a claim of his turned out to be checkable,
the measurement is underneath it, because several of them are sharper than they first
look.

---

## The Workbench

> The Workbench is a simple and straightforward look into the future. It is a lab in
> spirit, just put there by circumstances because it happened to be called `index`. It
> just drives down without stopping.

That is the right reading of it. Nothing about `index.html` makes it the front door
except its name; it asks a lab's question — *how far down does this go* — and answers it
by going there.

**Where it starts to hurt**, from driving it:

| bend | Jake |
|---|---|
| `19,859,439,132,420` | passable, with reservations |
| `1,200,460,035,524,937` | really struggling |

**The wall is the viewport, not the arithmetic.** Bends are `BigInt` and stay exact as
deep as you care to go; the picture falls apart at `screen = world * scale + tx` in
`src/render/viewport.js`, where two enormous nearly-cancelling doubles are added at draw
time. Showing a circle of bend `b` at about ten pixels needs `scale ≈ 10b`, and the error
that survives is the ulp of the big term:

| bend | scale | surviving error |
|---|---|---|
| `10⁶` | `1.0e7` | ±0.0000000009 px |
| `10⁹` | `1.0e10` | ±0.0000010 px |
| `19,859,439,132,420` | `2.0e14` | **±0.016 px** |
| `1,200,460,035,524,937` | `1.2e16` | **±1.0 px** |
| `2⁵³` | `9.0e16` | ±8 px |

Which lands on Jake's two numbers exactly: sixteen thousandths of a pixel is "passable
with reservations", a whole pixel is "really struggling."

So `plan.md` Phase 5 — *"zooming to curvature 10¹⁵ and beyond stays exact"* — is true
about the arithmetic and misleading about the image. The exactness is real and it is
thrown away in the last step before drawing.

**The direction, if it is ever worth it.** Subtract before scaling, and subtract
*exactly*. A centre is `bz/b`, a ratio of Gaussian integers, so the offset from the view
centre can be formed in `BigInt` and converted to a double only once it is small. Doing
the subtraction in floats first does not help — that is where the cancellation already
happened. This is the side-by-side demo Phase 5 always wanted, except that the float
version being beaten would be our own.

---

## The Schmidt subdivision

> The Schmidt subdivision deserves to be at the top of the labs. With its modest
> defaults it has the most development. Held back by generation, it is Soddy on steroids.
> It is the spirit of Asmus Schmidt, but some of the objects are mysteries.

Agreed, and it should be moved to the top of `labs/index.html`.

### The mish and the mash

Jake's reading of the arrangement, recorded as given:

> The arrangement looks at first like a mish-mash of 𝒥 and 𝒥* circles. The mish has a 𝒥
> symmetry: with both halves set, three horizontal parallel lines with four circles. The
> mash has what would be 𝒥* symmetry: vertical parallel lines with three circles in a
> row. When you look at 𝒥 itself, everything is clear — the centre is the tangency of two
> circles. But 𝒥* has an odd number; the axis splits the centre circle. A different
> symmetry.

**Confirmed: they cannot be separated, and it is one arrangement.** Not a matter of
taste. Every circle the 𝒥* subdivision draws is already one of the arrangement's — all 90
of them at generation 3, checked by exact key. There is no "𝒥 circle" and "𝒥* circle" to
sort into piles; there is one set of curves and two different ways of cutting the plane
along them. The partitions differ; the circles do not.

**Confirmed: 𝒥\* with both halves is missing the centre circle and has nothing outside
the parallels.** Both follow from what 𝒥* *is* — the ideal triangle with vertices
`0, 1, ∞`, bounded by `x = 0`, `x = 1` and the semicircle between them. Everything inside
that semicircle is *below the floor*, which is why the disc is absent; everything with
`x < 0` or `x > 1` is outside the sides. The missing centre circle is the floor itself.

**The odd/even asymmetry Jake noticed is real and structural.** 𝒥 splits into seven
pieces, 𝒥* into four. So the counts run `(3·5ⁿ − 1)/2` against `(3·5ⁿ + 1)/4`, and the
mirror axis has something to sit *between* in one case and something to sit *on* in the
other. Still a mystery worth pulling on: why the axis splits a circle in 𝒥* and falls in
a tangency in 𝒥.

### The alternating red and green

> I think the generations are alternating red and green.

**They are, and the reason is one constant.** The arrangement layer colours by depth,
`depth % 24`, and hues step by `HUE_STEP = 173` degrees — chosen to separate curvature
residues, with the depth cycle a documented afterthought. 173 is very nearly a half turn,
so each generation lands almost opposite the last and the sequence flip-flops, drifting
seven degrees a step:

| depth | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| hue | 0° | 173° | 346° | 159° | 332° | 145° |
| | red | cyan | red | green | pink | green |

Even depths cluster near red, odd depths near cyan-green. Over 24 buckets it does cover
the wheel; locally it reads as two alternating families, which is exactly what you see.

Worth deciding whether that is a happy accident to keep or a coincidence to replace. It
makes generation legible at a glance, which is not nothing.

---

## The family colouring, for posterity

> What is the lovely family colouring — circle and its triangles. I would not want to get
> rid of that wonderful chaotic mess. I want other colour schemes, but that one is a
> keeper.

`labs/schmidt.html`, `familyColor(region)`. The algorithm, in full:

1. **Find the family.** Take the region's `anchor` — its nearest *circular* ancestor, or
   itself if it is circular. A circular region's four triangular children fill what its
   three circular children leave over, and those triangles subdivide into more triangles,
   so every triangle belongs to the circle it was cut out of, however many generations
   back. `subdivide()` carries the anchor down, because a region has no parent link and a
   renderer could never recover it.
2. **Identify that circle exactly.** `regionCircle(anchor).key()` — the `BigInt` key of
   the circumscribed circle, not its floating-point position.
3. **Hash the key to a hue.** FNV-1a, 32-bit, over the key string; `hue = h mod 360`.
   Memoised in `familyHues`.
4. **Light the circle darker than its triangles.** `hsl(hue 58% 46%)` for the anchor
   itself, `hsl(hue 58% 60%)` for everything descended from it.

**Why it works, and why it must keep working.** The hue is a property of the *exact
circle*, not of an index, a position or a traversal order. So a family keeps its colour
when you pan, zoom, step the generation, turn on the mirror, or prune half the walk away
— nothing renumbers. That stability is what makes the chaos readable instead of noisy: the
mess is fixed, and you are moving through it.

Two consequences worth keeping in mind if it is ever changed: the hue is uniform on
`[0, 360)` with no regard for what is adjacent, so neighbouring families sometimes collide
— that is the price of statelessness, and dodging it would mean a colouring that depends
on the neighbourhood, which is exactly what would start flickering. And it says nothing
about depth, which is why it composes with the depth-coloured arrangement layer instead of
fighting it.

**Other schemes worth having** alongside it, not instead: by generation of the anchor
(family age); by the anchor's bend mod 24, to tie the picture to chapter 4; by region
norm `N(F)`, which would show the pruning's own measure.

---

## Latin Modern Roman and the character universe

> Latin Modern Roman is the key to the character universe. It is a mathematical font.
> Does it have more unicode than the rest? It was difficult to wrest old-style (onum)
> from its characters.

**The difficulty is visible in the repo.** Latin Modern is the only face shipped as *two*
registered faces — `lmroman` and `lmroman-onum`, two files, two `@font-face` names — where
every other oldstyle face is a single entry. The struggle left a mark.

**But the answer to the question is no**, at least in what we ship. Codepoints in each
subset, straight from the `cmap`:

| face | codepoints | Greek | Letterlike (ℝ ℚ ℵ) | Math Alphanumeric |
|---|---|---|---|---|
| EB Garamond | **2,091** | **94** | 22 | 0 |
| STIX Two Text | 1,281 | 93 | **80** | 0 |
| Crimson Pro | 689 | 5 | 5 | 0 |
| **Latin Modern Roman** | 665 | 25 | 9 | 0 |
| Caladea | 224 | 0 | 1 | 0 |

**The catch, and it matters: these are subsets.** They measure what we chose to ship, not
what the fonts contain. Latin Modern *is* the face TeX has set mathematics in since 1978 —
but its mathematics lives in a different file, `latinmodern-math.otf`, which we do not
have. Same for STIX: we ship STIX Two *Text*, and the math is in STIX Two *Math*. Judging
Latin Modern's math coverage by `lmroman10.woff2` is judging a placement, not a
containment — the same mistake this project has made before.

Note also that **nothing we ship covers `U+1D400–1D7FF`** at all, the Mathematical
Alphanumeric Symbols — the double-struck, fraktur and script letters. Zero, across all
seven files.

### The lab

> How about a lab page showcasing the unicode math characters too.

Worth doing, and there is a real decision inside it. As things stand such a page would
mostly showcase EB Garamond and STIX, which is not the point Jake is making. To make it a
Latin Modern showcase we would have to ship a math font — a few hundred KB against a
project whose entire current font payload is 467 KB — or subset one down to the characters
the story actually uses.

What it could show, which no chapter currently does: the same expression set in all seven
faces at once; the numerals in oldstyle against lining, which is the choice the workbench
already offers and never explains; and the blocks each face can and cannot reach, since
that is the thing nobody knows until a glyph silently falls back to Georgia.

---

## The short list

- Move the Schmidt lab to the top of `labs/index.html`. It has earned it.
- Exact offsets before scaling, if deep zoom is ever to mean what Phase 5 claims.
- More colour schemes; keep the family one exactly as it is.
- Why does the mirror axis split a circle in 𝒥* and land on a tangency in 𝒥?
- A character lab, once it is decided whether a math font is worth its weight.
