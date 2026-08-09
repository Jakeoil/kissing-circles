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
| curvilinear **triangle** (an interstice) | add the one circle inscribed in it | 1 circle + 3 smaller triangles = **4** parts |
| **circle** (a disk) | add 3 mutually tangent circles inside it | **7** parts: 𝒱₁ 𝒱₂ 𝒱₃ ℰ₁ ℰ₂ ℰ₃ C |

(Pegg says 8 for the circle; the paper says 7 — see §4.)

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
- the curvatures in the Gaussian arrangement lie in **2Z**. Our `(−1, 2, 2, 3)` packing
  plainly contains odd curvatures, so the two live at different scales. §4a settles
  this from the primary source, with Schmidt's formula for the curvature.

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

## 4. The matrices are already in your Kotlin — with one wrong entry

`DynamicKissingCircles/.../math/SoddyCircle.kt` carries a block of unused Gaussian
matrices under the comment *"We have a little playground here."* In Phase 1 I read them
as reaching toward the Apollonian group. They are not. They are **Schmidt's matrices**,
transcribed from §1.1 of the paper.

Schmidt's definitions (p. 4) beside the Kotlin:

| | Schmidt | Kotlin | |
|---|---|---|---|
| V₁ | `[[1, i], [0, 1]]` | `[[1, i], [0, 1]]` | ✓ |
| V₂ | `[[1, 0], [−i, 1]]` | `[[1, 0], [−i, 1]]` | ✓ |
| V₃ | `[[1−i, i], [−i, 1+i]]` | `[[1−i, i], [−i, 1+i]]` | ✓ |
| E₁ | `[[1, 0], [1−i, i]]` | `[[1, 0], [1−i, i]]` | ✓ |
| E₂ | `[[1, −1+i], [0, i]]` | `[[1, −1+i], [0, i]]` | ✓ |
| E₃ | `[[i, 0], [0, 1]]` | `[[i, 0], [0, i]]` | **✗** |
| C | `[[1, −1+i], [1−i, i]]` | `[[1, −1+i], [1−i, i]]` | ✓ |

Six of the seven are exact. **E₃ is wrong in the Kotlin**, and Schmidt's own Lemma 1.1
(iii) proves it independently of how the page is read: it states `det Vⱼ = 1`,
`det Eⱼ = i`, `det C = −i`. The Kotlin's `[[i,0],[0,i]]` has determinant `−1`, so it
cannot be an `E`. Worse, it is `i` times the identity, so as a Möbius map
`z ↦ (iz+0)/(0+i)` it *is* the identity — it would have subdivided nothing. Schmidt's
`[[i,0],[0,1]]` has determinant `i`, as required.

Schmidt also defines `S = [[0,−1],[1,−1]]` and `I`, which the Kotlin omits. `S` is not
a subdivision generator: by Lemma 1.1 it is the non-Euclidean rotation by 2π/3 about
½(1+i√3), with `S³ = I`, and it is what relates the three V's and the three E's to each
other — `V_{j+1} = S Vⱼ S⁻¹`, `E_{j+1} = S Eⱼ S⁻¹`, `C = S C S⁻¹`.

**The "8 matrices" in Pegg's article is loose.** Schmidt names nine (V₁V₂V₃, E₁E₂E₃, C,
S, I), of which seven do the subdividing. And the subdivision itself is into **seven**
parts, not eight:

> 𝒥 = 𝒱₁ ∪ 𝒱₂ ∪ 𝒱₃ ∪ ℰ₁ ∪ ℰ₂ ∪ ℰ₃ ∪ C
>
> 𝒥* = 𝒱₁* ∪ 𝒱₂* ∪ 𝒱₃* ∪ C*

where 𝒥 is the closed upper half-plane with ∞, and 𝒥* is the region
`0 ≤ x ≤ 1, y ≥ √(x−x²)`. So a circular region splits into **7** and a triangular one
into **4**. Pegg's "4 parts" for a triangle is right; his "8" for a circle should be 7.
Figure 1 of the paper shows it directly: two circles of radius ½ tangent at 1/(1−i),
sitting between the lines through {0,1} and {i,1+i}.

---

## 4a. What else the paper settles

**Curvatures are even — the normalization question, answered.** For a Farey set `F`
arising from `m: z ↦ (az+b)/(cz+d)`, Schmidt defines (p. 7)

```
ρ(F) = [ (N(c) + N(d) + N(c+d))² − 2(N²(c) + N²(d) + N²(c+d)) ]^(1/2)
```

with `N` the Gaussian norm, and notes that **1/ρ(F) is the radius of the circumscribed
circle**, with `ρ(F) = 0` exactly when that circle is a line. So ρ *is* curvature in our
sense. He then states:

> "We shall prove later in this chapter that ρ(F) ∈ 2N₀ = {0, 2, 4, ...} for all F ∈ 𝔉."

That confirms, from the primary source, the claim I could only relay second-hand in §3:
every curvature in the Gaussian Schmidt arrangement is an even non-negative integer.
Our `(−1, 2, 2, 3)` packing contains odd curvatures, so the two live at different
scales — the gasket must be doubled, or the arrangement halved, before they can be
drawn in one picture. That is now a definite conversion rather than an open question.

Note the shape of that formula: `(Σ)² − 2(Σ²)` over three quantities is the Descartes
form. Schmidt is computing a curvature from a Descartes-type expression in the norms
`N(c)`, `N(d)`, `N(c+d)` — the same quadratic form our `descartesReal` checks.

**Ford circles, from Schmidt himself.** The introduction (p. 2) says:

> "As is pointed out, Farey sets appear to be a natural extension of the well-known
> circles and mesh triangles of L. R. Ford."

So the Farey/Ford connection is not a later reinterpretation; it is the stated design.
Chapter 1 is titled *Farey sets*, and the algorithm's two region types — circular and
triangular — are the direct analogue of Ford circles and the mesh triangles between
them, one dimension up.

**A closed form for e^i, which matches Pegg's expansion.** On p. 3 Schmidt announces
Hurwitzian chains, including

```
ch exp[1/(−ib)] = V₃ · ‾V₃^(2bn+b−2) C²‾ |ₙ₌₀^∞
```

extending Euler's `exp[1/a] = [1, 2an+a−1, 1]`. Setting `b = 1` gives alternating `C²`
blocks separated by odd powers of `V₃` — and Pegg's observed expansion of e^i is
exactly that:

```
c c  v3  c c  v3 v3 v3  c c  v3 v3 v3 v3 v3  c c   …
C²   V₃¹  C²      V₃³     C²        V₃⁵        C²
```

This is worth more than a curiosity: it is a **test oracle**. Any continued-fraction
implementation here can be checked against a closed form rather than against a picture.

**Uniqueness and convergents.** Chapter 2 establishes that the representation of a
complex irrational ξ by regular and dually regular chains is "essentially unique", that
Serret's theorem on equivalence extends, and that every fair approximant `p/q` with
`p, q ∈ Z[i]` appears as a convergent — extending Legendre. Chapter 3 extends Euler,
Lagrange and Galois on periodic and purely periodic expansions, giving an effective
solution of the complex Pellian equation. Periodic chains ↔ quadratic surds, exactly as
over the reals.

---

## 5. What this suggests building, in order of value

**1. The circle rule — subdivide the disks.** The single biggest idea here. A circular
region splits into 7 (three 𝒱, three ℰ, and C), a triangular one into 4. Adding the
circular rule turns one gasket into the Schmidt arrangement. Consequences to plan for:
interiors stop being empty, so the renderer's assumption that nothing occludes anything
no longer holds and draw order starts to matter; and `Packing.pick` would need the
*smallest* containing circle rather than the first hit. Work in Schmidt's normalization,
where curvatures are even, and convert to ours by a factor of two.

**2. Follow a complex number's expansion.** Enter `e^i` (or any complex number) and have
the program walk its continued fraction generation by generation, zooming into the
nested region at each step. This is exactly the picture Ed Pegg wanted and could not
draw, and it is the natural payoff of the exact arithmetic: at generation 50 the regions
are far below double precision, and our BigInt representation does not care. Schmidt's
closed form for `exp[1/(−ib)]` gives a test oracle, so the implementation can be checked
against arithmetic rather than against a picture.

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

- Asmus L. Schmidt, "Diophantine approximation of complex numbers", *Acta Mathematica*
  **134** (1975), 1–85. The primary source. Chapter 1 (*Farey sets*) defines the
  matrices and the subdivision; §1.1 p. 4 gives V₁–V₃, E₁–E₃, C, S, I; Lemma 1.1 p. 6
  gives the determinants and the S-conjugacy; §1.2 p. 7 defines ρ(F) and states
  ρ(F) ∈ 2N₀.
- Ed Pegg Jr, [Math Games: Gaussian Numbers](https://www.mathpuzzle.com/MAA/15-Gaussian%20Numbers/mathgames_03_15_04.html), MAA, 15 March 2004 — the article above.
- Katherine E. Stange, [Schmidt Arrangements](https://math.katestange.net/illustration/schmidt-arrangements/) — illustrations and definitions.
- [Schmidt Arrangement](https://blogs.ams.org/visualinsight/2015/03/01/schmidt-arrangement/), AMS *Visual Insight*.
- Katherine E. Stange, [Visualizing imaginary quadratic fields](https://math.colorado.edu/~kstange/papers/Stange-short-exp.pdf).
- [An illustrated introduction to the arithmetic of Apollonian circle packings, continued fractions, and other thin orbits](https://arxiv.org/pdf/2412.02050).
- [The Apollonian structure of Bianchi groups](https://arxiv.org/pdf/1505.03121).
