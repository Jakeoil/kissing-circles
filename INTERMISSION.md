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

**Retracted: they *can* be separated, and Jake was right.** I said they could not, and
cited the wrong measurement to prove it — that every circle the 𝒥* subdivision draws is
already one of the arrangement's, 90 of 90 at generation 3. True, and beside the point:
that shows *containment*, not inseparability.

The arrangement really is two families, and they are disjoint. Every circle in it is
`m(ℝ)` for some region, and that region is either circular — in which case the circle is
its **boundary** — or triangular, in which case the circle runs through the three tangency
points and is **not a side of anything**. To generation 6, unoriented:

| | circles |
|---|---|
| boundary of a circular region | 9,769 |
| circumcircle of a triangular region | 9,831 |
| **both** | **0** |

Zero overlap in 19,600 circles, and nearly a 50/50 split — which is exactly Jake's "when I
turn on 𝒥, *half* the lines of the arrangement are gone." The half that stays is the
boundaries; the half that goes is the circumcircles, and those are precisely the ones he
describes as "every circle with 3 tangents shows 3 circles crossing through the tangency
points." That is what the circumcircle of a curvilinear triangle *is*.

So his names are better than mine. The mish is the boundaries, the mash is the
circumcircles, and a partition view is the mish alone. Worth being careful about one
thing: this is *not* a split by which seed a circle descends from. 𝒥* subdivides into both
types as well, so it draws from both families. The split is by the role a circle plays,
not by its ancestry — which is why the earlier containment measurement said nothing about
it.

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

## What the arrangement is indexed by

Jake: *"It's a huge slew of circles, they are indexed somehow. What is the arrangement
indexed by?"*

**By the bottom row of the matrix.** Every circle is `m(ℝ)` for a word `m` in the seven
generators, and writing `m = [[a, b], [c, d]]`, two facts hold, both checked:

**Its curvature is `±2·Im(c·conj d)`.** Exact on all 19,600 circles to generation 6. `c`
and `d` are Gaussian integers, so `Im(c·conj d)` is an ordinary integer — which is *why*
every bend is even, and where the factor of two in the whole arrangement comes from. It is
the 2 in `Im(w) = (w − w̄)/2i`, nothing to do with Apollonius. The top row `a, b` never
enters.

**The bottom row pins the circle up to a quarter turn and a lattice shift.** If two words
share a bottom row then `m′·adj(m) = [[δ′, t], [0, δ]]`, which as a map is
`z ↦ (δ′/δ)z + t/δ`. Both determinants are *units* — the generators are in `GL₂(ℤ[i])`, not
`SL₂`: `V₁ V₂ V₃` have det 1 but `E₁ E₂ E₃` have det `i` and `C` has det `−i` — so `δ′/δ` is
one of `1, i, −1, −i`. A quarter turn, then a Gaussian-integer translation. Checked: of
1,223 bottom rows shared by two or more circles, all 1,223 fit, and all have equal radius.

I got this wrong first time by assuming determinant 1, which predicted a pure translation;
only 284 of the 1,223 fit that. The determinants of the generators are the correction.

So the index is a point of `ℙ¹(ℤ[i])` — a Gaussian rational `c/d` — modulo the lattice's
own symmetries. Which is the same D4-and-translations group that turns up in the
permutations, arriving from the other direction.

---

## Congruent, equivalent, and the factor of two

Jake: *"I like the term congruent, not as used in geometry — that would be similarity —
but as in modular arithmetic. 7 ≡ 2 mod 5. Or 2/4 ≡ 1/2. Or 3² + 4² = 5² ≡ 6² + 8² = 10².
The quads can be multiplied by any scalar to come up with a congruent map. How come the
only time it comes up in practice is with this dastardly arrangement?"*

**Equivalent is the safer word, and the reason is that both other words are already taken
here.** *Congruent* means "same shape and size" in the geometry this project is doing, and
*similar* means "same shape, any size" — which is precisely the relation between
`(0,0,1,1)` and `(0,0,2,2)`, so calling it congruence inverts the sense. The clean phrase
is what GLMWY use: the quadruples are **scalar multiples**, related by a **homothety**, and
the class has one **primitive** representative.

*Why it only bites here* has a clean answer. Scaling a quadruple is invisible as long as
nothing else in the picture fixes a unit. A gasket on its own has no unit: any of its
scalar multiples draws the same picture, and the primitive one is chosen by convention
only. The arrangement **does** fix a unit — the lattice `ℤ[i]`, whose translations have
length 1 — so the strip between consecutive horizontal lines is 1 tall, the circle in it
has radius ½, and its bend is 2. The scaling stops being a free choice the moment there is
a lattice to be commensurate with.

> There are two sets of quads. The quads in lowest terms and the Schmidt quads, times 2.
> Unfortunate. Too bad that's not resolvable.

It is not resolvable, and it is worth saying why rather than filing it as bad luck: the
two conventions are answering different questions. `gcd = 1` is the right normalisation if
you are enumerating packings, because it makes the representative unique. Lattice-length 1
is the right normalisation if you are running a continued-fraction algorithm on `ℤ[i]`,
because the algorithm's steps *are* lattice operations. A single convention would have to
break one of those. The honest fix is the one already in the lab: show both names for the
same picture and let the reader keep whichever they arrived with.

And it does throw a wrench into the continued-fraction reading, exactly as Jake says — the
factor is a permanent seam between the two halves of this project.

---

## D4, D8, and a catalogue of quads

> An expressed quad has an orientation and certain degrees of symmetry. Asymmetric quads
> (3 unequal circles) appear multiple times in a mode, as vertical and horizontal flips.
> Every quad is unique barring predictable rotations and reflections. A catalogue of gen 1,
> gen 2, gen 3 quads can be built and they are all exclusive.

This is the right shape for a lab and the machinery is already in place: `permutations()`
gives the eight, and `Circle.translate` puts an image back where it belongs. What is
missing is the **catalogue** — enumerate the quadruples that occur at each generation,
quotient by the eight permutations plus lattice translation, and show one representative
of each class with its multiplicity.

Two things already known that the catalogue would have to agree with: distinct quadruples
per round in a gasket go `2·3ⁿ⁻¹ + 1`, and the eight permutations collapse to fewer when a
quadruple has a symmetry of its own — the strip, with its repeated pair, being the case to
test against.

The claim that they are *all exclusive* is the interesting one, and it is checkable rather
than obvious. It is the natural next measurement.

> (BTW! the symmetry page (whole numbers) gives piss poor examples of the symmetry. YOU
> CAN DO BETTER)

Noted, and fair. Chapter 3 argues for 8 orientations, 4 per dual, and then illustrates it
with figures that do not let you *see* a flip happen. With `permutations()` now existing,
the figure that chapter wants is one quadruple and a control that walks its orbit — the
same eight the Schmidt lab already offers — so the reader watches the four numbers stay
put while the picture turns. That is a rewrite of the figures, not of the prose.

---

## The odd circle

> The circle left out of 𝒥*. This is literally the "odd" circle.

The floor. 𝒥* is the ideal triangle with vertices `0, 1, ∞`, and the semicircle joining 0
to 1 is its bottom side, so the disc beneath it is outside the region by definition — along
with everything at `x < 0` or `x > 1`.

The pun is doing real work, though, and it points at the asymmetry Jake noticed: 𝒥 splits
into **seven** pieces and 𝒥* into **four**, so a mirror axis has a tangency to sit in
for one and a circle to sit *on* for the other. Odd counts and even counts, and the odd one
out is the one the axis cuts. Whether that is a coincidence of the generator choice or
something structural is still open — it is the sharpest unanswered question in the lab.

---

## Fun with the arrangement

> Two colour tiling as a display mode. An arrangement of intersecting lines in the plane
> always gives a two-colorable map of its regions: colour one region black, then flip
> colour every time you cross a line.

**This works for circles too, and it should be built.** The theorem is not special to
lines: any arrangement of closed curves in the plane two-colours, because each curve
divides the plane in two and crossing it flips a parity. Concretely, colour a point by

```
parity of  #{ circles C in the arrangement : the point is inside C }
```

with a fixed side chosen for each line. Crossing any one circle changes the count by
exactly one, so adjacent faces always differ. The partition machinery already computes an
interior point per region, so the mode is a parity count per region and a two-entry
palette — no new geometry at all.

It would also be the most direct possible answer to "is this one arrangement or two",
since the colouring cares only about the curves and not at all about which family drew
them.

> Alternating red greens, HUE_STEP = 173. What would happen if you used the golden angle
> 137.507764°? (just a haha)

We know exactly what happens, because it was tried and rejected — `palette.js` records it.
The golden angle is the standard choice for spreading an open-ended sequence, and it is
wrong here for a reason worth keeping: buckets are curvature mod 24, a packing uses only
some of the 24 residues, and the golden angle happens to place residues 2 and 23 just 7.7°
apart. Two of the commonest curvatures in the picture came out the same purple.

For *depth* it would behave better and read worse: the red/green alternation would go, and
with it the ability to see a generation at a glance. 173 is nearly a half turn, which is
what makes consecutive generations oppose each other. The golden angle would scatter them
handsomely and tell you nothing.

---

## A quad and a gasket

Asked directly, so recorded here.

A **quad** is four mutually tangent circles — one Descartes configuration, four rows,
finite data. In this code it is `Circle[4]`, sixteen `BigInt`s, and `validateQuad` says
whether it is one.

A **gasket** is what you get by never stopping: the closure of a quad under the Apollonian
group, every circle reachable by Vieta jumps. Infinite. In this code it is what
`generate(quad, limits)` returns, and the limits are the only reason it terminates — a
`Packing` is always a finite window onto an infinite object.

The relation is **many-to-one, and that is the whole point**. Every Descartes quadruple
sitting inside a gasket generates that same gasket, so a gasket has infinitely many quads
and no distinguished one — until you impose a rule. The rule is the root quadruple:
`a ≤ 0`, `a ≤ b ≤ c ≤ d`, `a + b + c ≥ d`, `gcd 1`. Every primitive integral packing has
exactly **one**, which is what makes `labs/packings.html` an enumeration rather than a
sample.

Three consequences worth holding on to:

- A quad has an orientation and a place; a gasket has a shape. The eight permutations move
  a quad and leave the gasket the same set of circles.
- Asking "is this gasket in the arrangement?" is meaningless without a placement, which is
  how the classic gasket got recorded as *not* contained when it is.
- `(5, 8, 12, 53)` is a perfectly good quad and not a root, because all four bends are
  positive so nothing encloses anything. It is a quadruple *inside* the `(−3, 5, 8, 8)`
  gasket, two Vieta steps in. A quad need not be a root; a gasket always has one.

---

## Modules, and the shape of the site

The goal is the second of the two, not the first: **let someone put the picture in their
own page**, with their own controls. Sharing a link is already free.

The intended end state:

| slot | what |
|---|---|
| `index.html` | the packing view as a teaser, then guidance — the story index as a table of contents, and the labs |
| lab 1 | the packing view, module-ised out of the workbench |
| lab 2 | the Schmidt arrangement, module-ised |

The workbench becomes a lab because that is what it always was — a lab in spirit, put at
the front because it happened to be called `index`.

`labs/outward.html` is the guinea pig: 253 lines, self-contained, no shared stylesheet,
and small enough that getting the pattern wrong costs an afternoon rather than a week. The
test that matters is the one the pentagrid notes flag as impossible to see from inside the
repo — **delete the stylesheet and check it still draws.**

Two things already true and worth not re-discovering: our Pages site already serves `src/`
with `access-control-allow-origin: *` and the right content type, and a page on another
origin can already import the live math *and* render modules and draw with them — verified,
413 circles. And we need no `dist/`, because we have no build step; `src/` is the
distributable. The pentagrid notes need TypeScript compiled first, and we skip that whole
row.

What is *not* in place is the canvas-module shape itself: `draw(ctx, packing, view,
options)` takes a context, not a container. Thirteen places build a `Viewport`, twelve
hand-roll the same devicePixelRatio dance, eleven look up their own canvas. That is the
duplication the pattern removes.

---

## The short list

- Module-ise `outward` as the guinea pig; delete the stylesheet and check it still draws.
- Then the packing view, then the Schmidt view; `index` becomes a teaser and a table of
  contents.
- Two-colour display mode for the arrangement — parity of containing circles, no new
  geometry.
- Rebuild chapter 3's symmetry figures on `permutations()`, so a flip can be watched
  instead of described.
- A catalogue of quads by generation, quotiented by the eight permutations, and a check of
  whether the classes really are exclusive.
- Exact offsets before scaling, if deep zoom is ever to mean what Phase 5 claims.
- More colour schemes; keep the family one exactly as it is.
- Why does the mirror axis split a circle in 𝒥* and land on a tangency in 𝒥?
- A character lab, once it is decided whether a math font is worth its weight.
