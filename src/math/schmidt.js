// @ts-check

import { Circle } from './circle.js';
import { Gaussian } from './gaussian.js';
import { IDENTITY, GENERATORS } from './mobius.js';

/**
 * The Schmidt arrangement of the Gaussian integers.
 *
 * Where `packing.js` fills the interstices of a Descartes quadruple, this subdivides
 * the whole plane the way Asmus Schmidt's continued fraction algorithm does. The
 * Apollonian gasket is inside the result rather than beside it — see
 * notes/schmidt-generations.md.
 *
 * Schmidt's two region types and their subdivisions (Lemma 1.1 vi–vii):
 *
 *     J   (circular)    = V₁(J)  V₂(J)  V₃(J)  E₁(J*) E₂(J*) E₃(J*) C(J*)
 *     J*  (triangular)  = V₁(J*) V₂(J*) V₃(J*) C(J)
 *
 * so a circular region splits into three circular and four triangular parts, and a
 * triangular one into three triangular and one circular. The number of regions *at*
 * generation n — not cumulative — follows `R(n) = 5·R(n−1) + 2`, giving
 * 1, 7, 37, 187, 937, 4687, with closed form `(3·5ⁿ − 1)/2`.
 *
 * A region is a matrix and a type; its circle is that matrix applied to the real
 * line, which is Schmidt's circumscribed circle of the Farey set. Every curvature
 * that comes out is even, which is his ρ(F) ∈ 2ℕ₀ and a strong check that the
 * construction is being followed correctly.
 *
 * Storage here deliberately mirrors `Packing` rather than sharing with it. Two
 * generators is the point at which the common shape can be abstracted with evidence
 * rather than guessed at — plan.md §8.4 step 3.
 */

/**
 * The real line, as a circle of zero curvature with a unit normal. Everything in the
 * arrangement is an image of this.
 * @type {Circle}
 */
export const REAL_LINE = new Circle(0n, 0n, new Gaussian(0n, 1n));

/**
 * The curves bounding `𝒥*`, the triangular seed region
 * `{0 ≤ x ≤ 1, y ≥ √(x − x²)}`.
 *
 * Three of them are its actual sides: the lines `x = 0` and `x = 1` and the semicircle
 * between them, mutually tangent — the lines meet at infinity, the circle touches each
 * at 0 and 1 — so every image of `𝒥*` is a curvilinear triangle.
 *
 * The fourth, the real line, is **not a side**; it touches `𝒥*` only at 0 and 1. It is
 * here because the three sides do not determine the region. "Between the lines and
 * outside the semicircle" describes two components — the one above the semicircle and
 * the one below it — and `y ≥ 0` is what picks the right one. Without it a renderer
 * that works by intersecting constraints fills both, which in practice means filling
 * most of the picture.
 *
 * @type {Circle[]}
 */
export const JSTAR_BOUNDARY = [
  new Circle(0n, 0n, new Gaussian(1n, 0n)), // x = 0
  new Circle(2n, 0n, new Gaussian(1n, 0n)), // x = 1
  new Circle(0n, 2n, new Gaussian(1n, 0n)), // |z − ½| = ½
  REAL_LINE,                                // y ≥ 0, to select the component
];

/** `𝒥` is the upper half plane; the real line is its only boundary. */
export const J_BOUNDARY = [REAL_LINE];

/** A point comfortably inside `𝒥`. */
export const J_INTERIOR = { x: 0, y: 1 };

/** A point comfortably inside `𝒥*` — above the semicircle, between the lines. */
export const JSTAR_INTERIOR = { x: 0.5, y: 0.9 };

/**
 * A region of the subdivision: which map produced it, and which of Schmidt's two
 * shapes it is.
 *
 * @typedef {object} Region
 * @property {import('./mobius.js').Mobius} m
 * @property {'J'|'T'} type circular or triangular
 * @property {string} name Schmidt's label, e.g. `𝒱₂` or `C*`
 */

/** Schmidt's labels for the children of each region type. */
const LABELS = {
  J: { V1: '𝒱₁', V2: '𝒱₂', V3: '𝒱₃', E1: 'ℰ₁', E2: 'ℰ₂', E3: 'ℰ₃', C: 'C' },
  T: { V1: '𝒱₁*', V2: '𝒱₂*', V3: '𝒱₃*', C: 'C*' },
};

/**
 * The seed region: the upper half plane, undivided.
 * @returns {Region}
 */
export function seed() {
  return { m: IDENTITY, type: 'J', name: '𝒥' };
}

/**
 * Subdivide one region, with Schmidt's names attached.
 *
 * A circular region gives seven parts (Fig. 1, Fig. 2); a triangular one gives four
 * (Fig. 1*, Fig. 2*). This is the whole of the construction.
 *
 * @param {Region} region
 * @returns {Region[]}
 */
export function subdivide(region) {
  return SUBDIVISION[region.type].map(([name, type]) => ({
    m: region.m.mul(GENERATORS[name]),
    type,
    name: LABELS[region.type][name],
  }));
}

/**
 * The disc a region lies inside, or null when it is unbounded.
 *
 * Schmidt's `m(R)` is the *circumscribed* circle of the region, so the region sits
 * inside that disc — and since subdivision only ever cuts a region into pieces of
 * itself, so does everything below it. Checked over 123,000 descendants without a
 * single escape.
 *
 * Null means the circumscribed circle is a straight line, or the region is the
 * outside of the circle rather than the inside. Either way it is unbounded and
 * nothing can be ruled out.
 *
 * **This bounds regions, not the circles drawn from them.** A triangular region's
 * circumscribed circle is larger than the region — much larger when the triangle is
 * thin — so a circle whose region lies off screen can still arc across it. Pruning on
 * this is exact for the partition and approximate for the arrangement; give the
 * bounds a margin if the difference matters.
 *
 * @param {Region} region
 * @returns {{x: number, y: number, r: number}|null}
 */
export function regionDisc(region) {
  const circle = region.m.applyTo(REAL_LINE);
  if (circle === null || circle.isLine()) return null;

  const g = geometry(region);
  if (g === null) return null;

  const f = circle.toFloat();
  const r = Math.abs(f.r);
  const inside = Math.hypot(g.interior.x - f.x, g.interior.y - f.y) < r;
  return inside ? { x: f.x, y: f.y, r } : null;
}

/**
 * Schmidt's norm N(F), computed from the region's matrix.
 *
 * Lemma 1.3 gives the region's three vertices as `m` applied to the columns of
 * `(1 0 1 / 0 1 1)`, so their denominators are `c`, `d` and `c + d`, and N is the sum
 * of their Gaussian norms. Two facts make it the right thing to prune on:
 *
 *   - **Lemma 1.3(iv): N never decreases under subdivision.** Checked over 5,848
 *     parent/child pairs without a single drop.
 *   - **Lemma 1.4(iii): `diam F ≤ 4/√N`** once `N > 2`.
 *
 * Together those say a region of large norm is small, and everything below it is
 * smaller still. Nothing else I tried had that property: the circumscribed circle is
 * a median 22 times the region's actual size and can be 1,300 times it, because a thin
 * curvilinear triangle has nearly collinear vertices and therefore an enormous
 * circumscribed circle. Pruning on that bound does not bite; pruning on this does.
 *
 * Exact, in BigInt, like everything else here.
 *
 * @param {Region} region
 * @returns {bigint}
 */
export function regionNorm(region) {
  const { c, d } = region.m;
  return c.normSq() + d.normSq() + c.add(d).normSq();
}

/**
 * An upper bound on the region's diameter, from Lemma 1.4(iii).
 * @param {Region} region
 * @returns {number}
 */
export function regionDiameter(region) {
  const n = regionNorm(region);
  return n <= 2n ? Infinity : 4 / Math.sqrt(Number(n));
}

/**
 * Is the point on the region's side of this constraint? Boundary counts as inside.
 * @param {Circle} circle
 * @param {number} x
 * @param {number} y
 * @param {{x: number, y: number}} interior
 * @returns {boolean}
 */
function onRegionSide(circle, x, y, interior) {
  if (circle.isLine()) {
    const nx = Number(circle.bz.re);
    const ny = Number(circle.bz.im);
    const off = circle.lineOffset();
    const scale = Math.hypot(nx, ny) || 1;
    const here = (nx * x + ny * y - off) / scale;
    const there = (nx * interior.x + ny * interior.y - off) / scale;
    return here * there >= -BOX_EPS;
  }
  const f = circle.toFloat();
  const r = Math.abs(f.r);
  const here = Math.hypot(x - f.x, y - f.y) - r;
  const there = Math.hypot(interior.x - f.x, interior.y - f.y) - r;
  return here * there >= -BOX_EPS * Math.max(r, 1);
}

/** Slack for the on-the-boundary tests in `regionBox`, in world units. */
const BOX_EPS = 1e-9;

/**
 * Does this single constraint put the whole window outside the region?
 *
 * Used only for unbounded regions, which have no bounding box to test. One constraint
 * excluding the window is enough to rule the region out; no constraint doing so proves
 * nothing, so this is sound but not sharp — which is all that is wanted.
 *
 * @param {Circle} circle
 * @param {{minX: number, minY: number, maxX: number, maxY: number}} w
 * @param {{x: number, y: number}} interior
 * @returns {boolean}
 */
function windowExcludedBy(circle, w, interior) {
  /** @type {[number, number][]} */
  const corners = [
    [w.minX, w.minY],
    [w.maxX, w.minY],
    [w.minX, w.maxY],
    [w.maxX, w.maxY],
  ];

  if (circle.isLine()) {
    const nx = Number(circle.bz.re);
    const ny = Number(circle.bz.im);
    const off = circle.lineOffset();
    const side = nx * interior.x + ny * interior.y - off;
    // A half plane is convex, so testing the four corners tests the whole window.
    return corners.every(([x, y]) => (nx * x + ny * y - off) * side < 0);
  }

  const f = circle.toFloat();
  const r = Math.abs(f.r);
  const regionIsInside = Math.hypot(interior.x - f.x, interior.y - f.y) < r;

  if (regionIsInside) {
    // Excluded when the window is wholly outside the disc: nearest point is beyond r.
    const dx = Math.max(w.minX - f.x, 0, f.x - w.maxX);
    const dy = Math.max(w.minY - f.y, 0, f.y - w.maxY);
    return Math.hypot(dx, dy) > r;
  }
  // Region is the outside of the disc; excluded when the window is wholly inside it.
  return corners.every(([x, y]) => Math.hypot(x - f.x, y - f.y) < r);
}

/**
 * @type {WeakMap<Region, {minX: number, minY: number, maxX: number, maxY: number}|null>}
 */
const boxCache = new WeakMap();

/**
 * The region's true axis-aligned bounding box, or null when it is unbounded.
 *
 * **This is the bound that pays.** Subdivision is a *partition*: the five children of a
 * region tile it exactly, so every descendant lies inside the parent — which makes one
 * box bound the whole subtree's position *and* its size at once. The two bounds I tried
 * first are each sound but only half the job, and both far too loose to bite:
 *
 *   - the circumscribed disc (§8.4a) is a median 22× the region's real extent, because
 *     a thin curvilinear triangle has nearly collinear vertices;
 *   - Schmidt's `diam F ≤ 4/√N` needs `N > 16/minSize²` before it fires, and the region
 *     count reaches 300,000 several generations before N reaches that.
 *
 * The box is exact rather than an estimate. A curvilinear triangle's extent in x is
 * attained either at a vertex or where a bounding arc has a vertical tangent, and that
 * is a leftmost or rightmost point of the underlying circle — so the candidates are the
 * three vertices plus the four compass points of each bounding circle, each admitted
 * only if it satisfies the region's other constraints. Same argument in y.
 *
 * Vertices come from Lemma 1.3: `m` applied to `∞`, `0` and `1`, whose denominators are
 * `c`, `d` and `c + d`. A zero denominator puts a vertex at infinity, and the region is
 * unbounded — a half plane or the outside of a disc — so nothing can be ruled out.
 *
 * @param {Region} region
 * @returns {{minX: number, minY: number, maxX: number, maxY: number}|null}
 */
export function regionBox(region) {
  if (boxCache.has(region)) return boxCache.get(region) ?? null;
  const computed = computeBox(region);
  boxCache.set(region, computed);
  return computed;
}

/**
 * @param {Region} region
 * @returns {{minX: number, minY: number, maxX: number, maxY: number}|null}
 */
function computeBox(region) {
  const g = geometry(region);
  if (g === null) return null;

  const { a, b, c, d } = region.m;
  /** @type {[Gaussian, Gaussian][]} */
  const vertices = [
    [a, c],
    [b, d],
    [a.add(b), c.add(d)],
  ];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const admit = (/** @type {number} */ x, /** @type {number} */ y) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };

  for (const [num, den] of vertices) {
    const q = den.normSq();
    if (q === 0n) return null; // vertex at infinity: unbounded
    const p = num.mul(den.conj());
    admit(Number(p.re) / Number(q), Number(p.im) / Number(q));
  }

  for (const circle of g.constraints) {
    if (circle.isLine()) continue; // a line's extremes are at infinity
    const f = circle.toFloat();
    const r = Math.abs(f.r);
    /** @type {[number, number][]} */
    const compass = [
      [f.x - r, f.y],
      [f.x + r, f.y],
      [f.x, f.y - r],
      [f.x, f.y + r],
    ];
    for (const [x, y] of compass) {
      let ok = true;
      for (const other of g.constraints) {
        if (other === circle) continue;
        if (!onRegionSide(other, x, y, g.interior)) {
          ok = false;
          break;
        }
      }
      if (ok) admit(x, y);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return { minX, minY, maxX, maxY };
}

/**
 * Can this region's subtree contribute anything within the limits?
 *
 * The point of the whole exercise: without it the walk expands 5ⁿ regions however
 * tight the limits are, and generation 12 exhausts a 4 GB heap while keeping perhaps
 * a few thousand.
 *
 * Two callers want two different position tests, and the difference matters:
 *
 *   - `'region'` (the default) tests the region's own box. Exact for the *partition* —
 *     `regionsAt` draws regions, and a region's descendants are inside it.
 *   - `'disc'` tests the circumscribed disc instead. `arrangement` draws each region's
 *     circle, and for a triangular region that circle passes through the vertices and
 *     bulges outside the box, so a circle whose region is off screen can still arc
 *     across it. The disc contains that circle. It does not contain a *descendant's*
 *     circle (294 of 3,478 escape), so this remains the viewing aid the arrangement
 *     docs already say it is — but it is no worse than before, and it now comes with a
 *     size bound that is exact.
 *
 * The size test uses the box either way, since descendant *regions* nest regardless.
 *
 * @param {Region} region
 * @param {{minX: number, minY: number, maxX: number, maxY: number}|null} bounds
 * @param {number} minSize smallest region diameter worth descending into, world units
 * @param {'region'|'disc'} [position] which shape bounds the subtree's position
 * @returns {boolean}
 */
export function canReach(region, bounds, minSize, position = 'region') {
  return withinBounds(region, bounds, position) && !belowResolution(region, minSize);
}

/**
 * Is the region too small to be worth subdividing further?
 *
 * Separate from `withinBounds` because the two failures mean opposite things to a
 * caller drawing the partition. Out of the window, a region and its subtree are simply
 * not wanted. Below the resolution floor, the region is still *there* — dropping it
 * leaves a hole in a partition that is supposed to cover the plane, so the caller keeps
 * it as a leaf instead of descending into it.
 *
 * @param {Region} region
 * @param {number} minSize
 * @returns {boolean}
 */
export function belowResolution(region, minSize) {
  if (minSize <= 0) return false;
  if (regionDiameter(region) < minSize) return true;
  const box = regionBox(region);
  if (box === null) return false; // unbounded: never too small
  return Math.hypot(box.maxX - box.minX, box.maxY - box.minY) < minSize;
}

/**
 * Can the region's subtree reach the window at all?
 * @param {Region} region
 * @param {{minX: number, minY: number, maxX: number, maxY: number}|null} bounds
 * @param {'region'|'disc'} [position]
 * @returns {boolean}
 */
export function withinBounds(region, bounds, position = 'region') {
  return reaches(region, bounds, position);
}

/**
 * @param {Region} region
 * @param {{minX: number, minY: number, maxX: number, maxY: number}|null} bounds
 * @param {'region'|'disc'} position
 * @returns {boolean}
 */
function reaches(region, bounds, position) {
  if (bounds === null) return true;

  const box = regionBox(region);

  if (position === 'disc' && box !== null) {
    const d = regionDisc(region);
    if (d === null) return true;
    return !(
      d.x + d.r < bounds.minX ||
      d.x - d.r > bounds.maxX ||
      d.y + d.r < bounds.minY ||
      d.y - d.r > bounds.maxY
    );
  }

  // Unbounded: a half plane or the outside of a disc, one of the few regions whose
  // closure contains ∞. There is no box and no size bound — the subtree is infinite in
  // extent forever — so the only handle is whether the window still lies inside it.
  // It eventually does not: these regions recede toward ∞ as their complement grows,
  // and that recession is what lets a walk over a fixed window terminate at all.
  if (box === null) {
    const g = geometry(region);
    if (g === null) return true;
    return !g.constraints.some((c) => windowExcludedBy(c, bounds, g.interior));
  }

  return !(
    box.maxX < bounds.minX ||
    box.minX > bounds.maxX ||
    box.maxY < bounds.minY ||
    box.minY > bounds.maxY
  );
}

/**
 * Every region at generation n — the leaves of the subdivision, which together
 * partition the plane.
 *
 * This is the honest object to draw when the question is "what does generation n look
 * like". Drawing each region's circumscribed circle instead superimposes two
 * categorically different things: for a circular region that circle is its boundary,
 * but for a triangular one it passes through the three vertices and is not a side at
 * all. Superimposed, they read as one tangle. See labs/schmidt.html.
 *
 * Limits prune the walk itself, not merely its output, which is what makes deep
 * generations affordable at all.
 *
 * `maxRegions` is a safety valve rather than a limit to reason about: pruning makes the
 * frontier track the number of regions that actually fit the window, but that number is
 * `(window / minSize)²`, so a caller who asks for pixel resolution over a wide view is
 * asking for millions. Stopping early and saying so beats exhausting the heap. It is
 * checked once per generation and can overshoot by one generation's worth, because
 * stopping partway through a generation is the one thing that would break the partition.
 *
 * @param {number} n
 * @param {{bounds?: {minX: number, minY: number, maxX: number, maxY: number}|null,
 *   minSize?: number, maxRegions?: number}} [limits]
 * @returns {Region[]}
 */
export function regionsAt(n, limits = {}) {
  const bounds = limits.bounds ?? null;
  const minSize = limits.minSize ?? 0;
  const maxRegions = limits.maxRegions ?? 200000;

  // Regions that stopped early because they hit the resolution floor. They are still
  // part of the partition — dropping them punches holes in a picture whose entire point
  // is that it covers the plane — so they come back as leaves at whatever depth they
  // stopped, rather than being subdivided to depth n. A region pruned for being outside
  // the window is a different matter and is simply dropped: there is nothing to draw.
  /** @type {Region[]} */
  const leaves = [];

  let regions = [seed()];
  for (let g = 0; g < n; g++) {
    /** @type {Region[]} */
    const next = [];
    for (const region of regions) {
      for (const child of subdivide(region)) {
        if (!withinBounds(child, bounds)) continue;
        if (belowResolution(child, minSize)) leaves.push(child);
        else next.push(child);
      }
    }
    // Both halves count: the leaves are returned too, and they are the larger half by
    // the time a walk gets deep. Stopping here still returns a complete partition —
    // the frontier plus the leaves covers the window either way — just a coarser one.
    if (leaves.length + next.length > maxRegions) return leaves.concat(regions);
    regions = next;
  }
  return leaves.concat(regions);
}

/**
 * Geometry already computed, keyed by the region it describes.
 *
 * A region's boundaries and interior point are a pure function of it, and callers ask
 * repeatedly — a renderer needs them once to fill, once to outline, once to label.
 * Measured over 4,687 regions, computing them three times costs 47 ms against 27 ms
 * memoized, because each call is four Möbius applications and a point map.
 *
 * A WeakMap rather than a Map: entries die with the regions, so stepping through
 * generations cannot accumulate.
 *
 * @type {WeakMap<Region, {sides: Circle[], constraints: Circle[], interior: {x: number, y: number}}|null>}
 */
const geometryCache = new WeakMap();

/**
 * The curves bounding a region, and a point inside it.
 *
 * A circular region is bounded by a single circle or line — it is the image of a half
 * plane — so it is a disc or a half plane. A triangular one is bounded by three
 * mutually tangent curves. The interior point is what tells a renderer which *side*
 * of each boundary the region lies on, which no amount of staring at the boundary
 * alone will reveal.
 *
 * `sides` are the region's actual edges, and are what should be drawn. `constraints`
 * additionally contains the selecting curve described above, which bounds nothing and
 * must not be drawn — outlining it puts a stray arc through the middle of the picture.
 *
 * @param {Region} region
 * @returns {{sides: Circle[], constraints: Circle[], interior: {x: number, y: number}}|null}
 */
export function geometry(region) {
  if (geometryCache.has(region)) return geometryCache.get(region) ?? null;
  const computed = computeGeometry(region);
  geometryCache.set(region, computed);
  return computed;
}

/**
 * @param {Region} region
 * @returns {{sides: Circle[], constraints: Circle[], interior: {x: number, y: number}}|null}
 */
function computeGeometry(region) {
  const source = region.type === 'J' ? J_BOUNDARY : JSTAR_BOUNDARY;
  const inside = region.type === 'J' ? J_INTERIOR : JSTAR_INTERIOR;
  const sideCount = region.type === 'J' ? 1 : 3;

  /** @type {Circle[]} */
  const constraints = [];
  for (const curve of source) {
    const image = region.m.applyTo(curve);
    if (image === null) return null;
    constraints.push(image);
  }

  const interior = region.m.applyToPoint(inside.x, inside.y);
  if (interior === null) return null;

  return { sides: constraints.slice(0, sideCount), constraints, interior };
}

/** Which children a region has, by type. `J` is circular, `T` triangular. */
const SUBDIVISION = {
  J: /** @type {[string, 'J'|'T'][]} */ ([
    ['V1', 'J'], ['V2', 'J'], ['V3', 'J'],
    ['E1', 'T'], ['E2', 'T'], ['E3', 'T'],
    ['C', 'T'],
  ]),
  T: /** @type {[string, 'J'|'T'][]} */ ([
    ['V1', 'T'], ['V2', 'T'], ['V3', 'T'],
    ['C', 'J'],
  ]),
};

/**
 * @typedef {object} ArrangementLimits
 * @property {number} [maxGeneration] rounds of subdivision
 * @property {bigint|null} [maxCurvature]
 * @property {number} [minRadius] world units
 * @property {{minX: number, minY: number, maxX: number, maxY: number}|null} [bounds]
 */

/**
 * Build the arrangement to a given depth.
 *
 * The result has the same shape as a `Packing` — `circles`, `x`, `y`, `r`, `depth`,
 * `count` — so the existing renderer draws it unchanged.
 *
 * Unlike the Apollonian recursion, curvature is **not** known to increase down a
 * branch here, so a curvature or radius bound prunes what it can see rather than
 * guaranteeing everything below the bound is found. Generation is the honest limit;
 * treat the others as viewing aids.
 *
 * @param {ArrangementLimits} [limits]
 * @returns {{circles: Circle[], x: Float64Array, y: Float64Array, r: Float64Array,
 *   depth: Int32Array, count: number, regions: number, generations: number}}
 */
export function arrangement(limits = {}) {
  const maxGeneration = limits.maxGeneration ?? 5;
  const maxCurvature = limits.maxCurvature ?? null;
  const minRadius = limits.minRadius ?? 0;
  const bounds = limits.bounds ?? null;

  /** @type {Circle[]} */
  const circles = [];
  let x = new Float64Array(1024);
  let y = new Float64Array(1024);
  let r = new Float64Array(1024);
  let depth = new Int32Array(1024);
  let count = 0;
  /** @type {Set<string>} */
  const seen = new Set();

  const grow = () => {
    const n = x.length * 2;
    const nx = new Float64Array(n); nx.set(x); x = nx;
    const ny = new Float64Array(n); ny.set(y); y = ny;
    const nr = new Float64Array(n); nr.set(r); r = nr;
    const nd = new Int32Array(n); nd.set(depth); depth = nd;
  };

  /**
   * @param {Circle} c
   * @param {number} generation
   */
  const emit = (c, generation) => {
    const key = c.key();
    if (seen.has(key)) return;

    if (maxCurvature !== null) {
      const mag = c.b < 0n ? -c.b : c.b;
      if (mag > maxCurvature) return;
    }
    const f = c.toFloat();
    if (minRadius > 0 && Number.isFinite(f.r) && Math.abs(f.r) < minRadius) return;
    if (bounds !== null && Number.isFinite(f.r)) {
      const rad = Math.abs(f.r);
      if (
        f.x + rad < bounds.minX || f.x - rad > bounds.maxX ||
        f.y + rad < bounds.minY || f.y - rad > bounds.maxY
      ) return;
    }

    seen.add(key);
    if (count === x.length) grow();
    circles[count] = c;
    x[count] = f.x;
    y[count] = f.y;
    r[count] = f.r;
    depth[count] = generation;
    count++;
  };

  emit(REAL_LINE, 0);

  /** @type {{m: import('./mobius.js').Mobius, type: 'J'|'T', name: string}[]} */
  let regions = [{ m: IDENTITY, type: 'J', name: '𝒥' }];

  for (let generation = 1; generation <= maxGeneration; generation++) {
    /** @type {{m: import('./mobius.js').Mobius, type: 'J'|'T'}[]} */
    const next = [];
    for (const region of regions) {
      for (const [name, type] of SUBDIVISION[region.type]) {
        const m = region.m.mul(GENERATORS[name]);
        const circle = m.applyTo(REAL_LINE);
        if (circle === null) continue;
        emit(circle, generation);

        // Prune the walk, not just what it records. A region's subtree lies inside
        // the region, so a region that cannot reach the limits has nothing below it
        // that can either.
        const child = { m, type, name };
        if (canReach(child, bounds, minRadius > 0 ? minRadius * 2 : 0, 'disc')) {
          next.push(child);
        }
      }
    }
    regions = next;
  }

  return {
    circles,
    x,
    y,
    r,
    depth,
    count,
    // Regions at the final generation, which is what regionCount() gives.
    regions: regions.length,
    generations: maxGeneration,
  };
}

/**
 * How many regions there are *at* generation n, in closed form: (3·5ⁿ − 1)/2.
 *
 * A check on the traversal, and the analogue of the gasket's 4·3ⁿ⁻¹ circles per
 * generation. Note the gasket branches by 3 and this by 5.
 *
 * @param {number} n
 * @returns {number}
 */
export function regionCount(n) {
  return (3 * 5 ** n - 1) / 2;
}
