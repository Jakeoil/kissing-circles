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
 * Every region at generation n — the leaves of the subdivision, which together
 * partition the plane.
 *
 * This is the honest object to draw when the question is "what does generation n look
 * like". Drawing each region's circumscribed circle instead superimposes two
 * categorically different things: for a circular region that circle is its boundary,
 * but for a triangular one it passes through the three vertices and is not a side at
 * all. Superimposed, they read as one tangle. See labs/schmidt.html.
 *
 * @param {number} n
 * @returns {Region[]}
 */
export function regionsAt(n) {
  let regions = [seed()];
  for (let g = 0; g < n; g++) {
    /** @type {Region[]} */
    const next = [];
    for (const region of regions) next.push(...subdivide(region));
    regions = next;
  }
  return regions;
}

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

  /** @type {{m: import('./mobius.js').Mobius, type: 'J'|'T'}[]} */
  let regions = [{ m: IDENTITY, type: 'J' }];

  for (let generation = 1; generation <= maxGeneration; generation++) {
    /** @type {{m: import('./mobius.js').Mobius, type: 'J'|'T'}[]} */
    const next = [];
    for (const region of regions) {
      for (const [name, type] of SUBDIVISION[region.type]) {
        const m = region.m.mul(GENERATORS[name]);
        const circle = m.applyTo(REAL_LINE);
        if (circle === null) continue;
        emit(circle, generation);
        next.push({ m, type });
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
