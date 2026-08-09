# Schmidt's complex continued fractions, and generations

Notes on Ed Pegg Jr's *Math Games* column of 15 March 2004,
[Gaussian Numbers](https://www.mathpuzzle.com/MAA/15-Gaussian%20Numbers/mathgames_03_15_04.html),
and what it implies for this program.

Read the article expecting Apollonian gaskets and you will be surprised: most of it is
about Fermat–Catalan, Beal's conjecture and Sierpiński numbers over the Gaussian
integers. The part that matters here is the section on **Asmus Schmidt's complex
continued fraction algorithm**, and it matters a great deal, because that algorithm is
the setting in which our packing is a special case rather than the whole story.

---

## 1. What the article actually says

> "The best method at the moment was devised by Asmus Schmidt. It works by careful
> consideration of 8 matrices."

> "It turns out that these matrices can be used to divide up the complex plane into 8
> parts, in the first generation. After that, **each triangular region is divided into
> 4 parts, by adding a circle. That part works like an Apollonian packing.** In
> addition, **each circle is divided into 8 regions, by adding 3 tangent circles.**"

> "A complex number, for example e^i, can be represented as a series of these
> matrices: `c c v3 c c v3 v3 v3 c c v3 v3 v3 v3 v3 c c` and so on, in this case."

Figures 4, 5 and 6 show generations 1, 3 and 4. And the admission that prompted this
note:

> "I wanted to look at a zoomed-in picture of e^i at generation 50 or so, but I haven't
> quite figured it out how to draw all the circles."

That is a thing this program is now in a position to do.

---

## 2. The idea of generations

A *generation* is one synchronous round of subdivision applied to **every** region
present, not a step along one branch. Two rules alternate, because there are two kinds
of region:

| Region | Rule | Produces |
|---|---|---|
| curvilinear **triangle** (an interstice) | add the one circle inscribed in it | 1 circle + 3 smaller triangles = 4 parts |
| **circle** (a disk) | add 3 mutually tangent circles inside it | 8 regions |

The first rule is the Descartes reflection — it is exactly `Circle.spawn()`, and it is
what this program already does. **The second rule is not implemented here at all.**

That asymmetry is the whole point. An Apollonian gasket never subdivides the inside of
a disk: interiors stay empty, which is why the renderer can batch circles into one path
per color and rely on nothing occluding anything. Schmidt's arrangement *does*
subdivide them, and that is what makes it larger than a single gasket.

### Generations in this program, exactly

Our `depth` already is the generation number for the triangle rule. Counting circles
per generation from the actual generator, root `(−1, 2, 2, 3)`:

| generation | new circles | cumulative | closed form |
|---|---|---|---|
| 0 | 4 | 4 | the root quadruple |
| 1 | 4 | 8 | 4 |
| 2 | 12 | 20 | 4·3 |
| 3 | 36 | 56 | 4·3² |
| 4 | 108 | 164 | 4·3³ |
| 5 | 324 | 488 | 4·3⁴ |
| 6 | 972 | 1,460 | 4·3⁵ |
| 7 | 2,916 | 4,376 | 4·3⁶ |
| 8 | 8,748 | 13,124 | 4·3⁷ |
| 9 | 26,244 | 39,368 | 4·3⁸ |

So generation *n* ≥ 1 adds **4·3ⁿ⁻¹** circles, and the total through generation *n* is
**4 + 2(3ⁿ − 1)**. The `[` and `]` keys already walk this axis: pressing `[` down to
depth ≤ 1 shows exactly the 8 circles of generations 0 and 1.

The reason the branching factor is 3 and not 4 is the "don't undo the last move" rule in
`Packing._expand` — reflecting back through the circle you just arrived by returns the
parent. Without it the count would be 4ⁿ with massive duplication.

---

## 3. Why Gaussian integers, and what we already have

Schmidt's algorithm is the continued fraction algorithm for **Q(i)**, and the circles it
draws are the images of the extended real line under Möbius transformations from
**PSL(2, Z[i])**. That orbit is now called the **Schmidt arrangement** of the Gaussian
integers. Two facts from the literature, worth checking against our own normalization
rather than taking on trust:

- the tangency points of the arrangement are **Gaussian rationals** — which is precisely
  our `tangencyPoint`, `T = (b₁z₁ + b₂z₂)/(b₁ + b₂)`, a ratio of Gaussian integers;
- the curvatures in the Gaussian arrangement are reported to lie in **2Z**, whereas our
  `(−1, 2, 2, 3)` packing plainly contains odd curvatures. That is a normalization
  difference (a scaling of the whole configuration), and pinning it down is a
  prerequisite for drawing the arrangement in the same coordinates as the gasket.

The representation we already carry is the right one. A circle is `(b̄, b, b·z)` with
`b·z ∈ Z[i]`; a Möbius map from PSL(2, Z[i]) acts on that row linearly. Nothing needs
to change to support Schmidt's construction — the data is already Gaussian.

**Schmidt's own framing is the useful one:** this recursive subdivision of the complex
plane into circles and triangles is the natural analogue of the **Farey subdivision of
the real line**. Continued fractions on R nest intervals; Schmidt's algorithm on C nests
these regions. A complex number's expansion *is* the infinite sequence of nested regions
containing it, one per generation — which is why "e^i at generation 50" is a meaningful
request and why the expansion above is a word in the matrix letters.

---

## 4. The matrices are already in your Kotlin

This is the part worth flagging. `DynamicKissingCircles/.../math/SoddyCircle.kt` carries
a block of unused Gaussian matrices under the comment *"We have a little playground
here."* In Phase 1 I read them as reaching toward the Apollonian group. They are not.
They are **Schmidt's matrices from this article**:

```kotlin
val v1 = [[1,   i], [0,    1  ]]
val v2 = [[1,   0], [-i,   1  ]]
val v3 = [[1-i, i], [-i,   1+i]]
val e1 = [[1,   0], [1-i,  i  ]]
val e2 = [[1, -1+i], [0,   i  ]]
val e3 = [[i,   0], [0,    i  ]]
val c  = [[1, -1+i], [1-i,  i ]]
```

`V1, V2, V3` and `C` are the four parts a triangle subdivides into — three sub-triangles
and the inscribed circle. `E1, E2, E3` belong to the circle rule. The article's example
expansion of e^i is a word in exactly these letters: `c c v3 c c v3 v3 v3 …`.

One loose end: the article says **8** matrices; the Kotlin defines **7**. Schmidt's
original paper (1975) should settle which is missing — likely an identity or a second
circle generator — and that should be checked before implementing, not guessed.

---

## 5. What this suggests building, in order of value

**1. The circle rule — subdivide the disks.** The single biggest idea in the article for
this program. Adding "3 mutually tangent circles inside every disk" turns one gasket
into the Schmidt arrangement. Consequences to plan for: interiors stop being empty, so
the renderer's assumption that nothing occludes anything no longer holds and draw order
starts to matter; and `Packing.pick` would need to return the *smallest* containing
circle rather than the first hit.

**2. Follow a complex number's expansion.** Enter `e^i` (or any complex number) and have
the program walk its continued fraction generation by generation, zooming into the
nested region at each step. This is exactly the picture Ed Pegg wanted and could not
draw, and it is the natural payoff of the exact arithmetic: at generation 50 the regions
are far below double precision, and our BigInt representation does not care.

**3. Continued-fraction addresses in the hover readout.** Every circle is reached by a
word in the generators. Showing that word alongside the curvature would tie the readout
directly to the continued fraction — a circle's *address* rather than only its
coordinates. This depends on generating by matrix action rather than by reflection, so
it pairs naturally with item 1.

**4. Rename the depth axis to generations, and show the counts.** The `[`/`]` filter is
already a generation viewer; the 4·3ⁿ⁻¹ table above is exact and belongs in the analysis
panel next to the curvature histogram.

**5. A Farey / Ford-circle mode.** The one-dimensional analogue, as a warm-up view that
makes the analogy visible: Ford circles over the rationals, subdividing by mediants,
beside the complex picture doing the same thing one dimension up.

---

## Sources

- Ed Pegg Jr, [Math Games: Gaussian Numbers](https://www.mathpuzzle.com/MAA/15-Gaussian%20Numbers/mathgames_03_15_04.html), MAA, 15 March 2004 — the article above.
- Katherine E. Stange, [Schmidt Arrangements](https://math.katestange.net/illustration/schmidt-arrangements/) — illustrations and definitions.
- [Schmidt Arrangement](https://blogs.ams.org/visualinsight/2015/03/01/schmidt-arrangement/), AMS *Visual Insight*.
- Katherine E. Stange, [Visualizing imaginary quadratic fields](https://math.colorado.edu/~kstange/papers/Stange-short-exp.pdf).
- [An illustrated introduction to the arithmetic of Apollonian circle packings, continued fractions, and other thin orbits](https://arxiv.org/pdf/2412.02050).
- [The Apollonian structure of Bianchi groups](https://arxiv.org/pdf/1505.03121).
