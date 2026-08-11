// @ts-check

import { Circle } from './circle.js';
import { Gaussian } from './gaussian.js';
import { Rational, ZERO as RZERO, lcm, gcd } from './rational.js';

/**
 * Descartes' Circle Theorem, its complex extension, and the root quadruples we
 * generate packings from.
 *
 * For four mutually tangent circles with curvatures b1..b4:
 *
 *     (b1 + b2 + b3 + b4)^2 = 2 * (b1^2 + b2^2 + b3^2 + b4^2)
 *
 * Lagarias, Mallows and Wilks (2002) showed the identical relation holds for the
 * co-curvatures bbar, and for the curvature-center products b*z under *complex*
 * multiplication. So all three columns of an augmented quadruple satisfy the same
 * quadratic form, and all three admit the same Vieta jump — see Circle.spawn.
 */

/**
 * Integer square root of a non-negative BigInt, by Newton's method.
 * @param {bigint} n
 * @returns {bigint} floor(sqrt(n))
 */
export function isqrt(n) {
  if (n < 0n) throw new Error('isqrt of a negative number');
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}

/**
 * Is `n` a perfect square?
 * @param {bigint} n
 * @returns {boolean}
 */
export function isPerfectSquare(n) {
  if (n < 0n) return false;
  const r = isqrt(n);
  return r * r === n;
}

/**
 * Does a real quadruple satisfy the Descartes relation exactly?
 * @param {bigint} a
 * @param {bigint} b
 * @param {bigint} c
 * @param {bigint} d
 * @returns {boolean}
 */
export function descartesReal(a, b, c, d) {
  const s = a + b + c + d;
  return s * s === 2n * (a * a + b * b + c * c + d * d);
}

/**
 * Does a quadruple of curvature-center products satisfy the complex Descartes
 * relation exactly? Note these are *complex* squares, not squares of the real and
 * imaginary parts taken separately.
 * @param {Gaussian} a
 * @param {Gaussian} b
 * @param {Gaussian} c
 * @param {Gaussian} d
 * @returns {boolean}
 */
export function descartesComplex(a, b, c, d) {
  const s = a.add(b).add(c).add(d).square();
  const t = a.square().add(b.square()).add(c.square()).add(d.square()).scale(2n);
  return s.equals(t);
}

/**
 * Exact tangency test for two circles, with no square roots anywhere.
 *
 * Two circles are tangent when |z1 - z2| = |r1 + r2|. Substituting z = bz/b and
 * r = 1/b and clearing denominators by (b1*b2)^2 gives the integer identity
 *
 *     |b2*bz1 - b1*bz2|^2 = (b1 + b2)^2
 *
 * which covers external tangency, internal tangency against a bounding circle
 * (b < 0), and circle-to-line tangency uniformly.
 *
 * Caveat: for two lines both sides vanish identically, so the test cannot tell
 * parallel lines from crossing ones. In a Descartes quadruple at most two circles
 * can be lines and they are necessarily parallel, so this does not arise in
 * generated packings.
 *
 * @param {Circle} c1
 * @param {Circle} c2
 * @returns {boolean}
 */
export function areTangent(c1, c2) {
  const lhs = c1.bz.scale(c2.b).sub(c2.bz.scale(c1.b)).normSq();
  const s = c1.b + c2.b;
  return lhs === s * s;
}

/**
 * The two curvatures completing b1, b2, b3 to a Descartes quadruple:
 *
 *     b4 = b1 + b2 + b3 +/- 2*sqrt(b1*b2 + b2*b3 + b3*b1)
 *
 * Returns null when the discriminant is negative (no such quadruple) or is not a
 * perfect square (the quadruple exists but is not integral, so it falls outside the
 * exact-arithmetic representation this project is built on).
 *
 * @param {bigint} b1
 * @param {bigint} b2
 * @param {bigint} b3
 * @returns {[bigint, bigint]|null}
 */
export function fourthCurvature(b1, b2, b3) {
  const disc = b1 * b2 + b2 * b3 + b3 * b1;
  if (disc < 0n || !isPerfectSquare(disc)) return null;
  const s = b1 + b2 + b3;
  const r = isqrt(disc);
  return [s + 2n * r, s - 2n * r];
}

/**
 * The four columns of a quadruple's augmented matrix: co-curvature, curvature,
 * and the real and imaginary parts of the curvature-center product.
 * @param {Circle[]} quad
 * @returns {bigint[][]}
 */
export function columns(quad) {
  return [
    quad.map((c) => c.bbar),
    quad.map((c) => c.b),
    quad.map((c) => c.bz.re),
    quad.map((c) => c.bz.im),
  ];
}

/** @type {string[]} */
const COLUMN_NAMES = ['co-curvature', 'curvature', 'b*x', 'b*y'];

/**
 * The Descartes quadratic form applied to two columns, scaled by 2 to stay in
 * integers:
 *
 *     <u, v> = 2*(u . v) - (sum u)*(sum v)
 *
 * The unscaled form is u.v - (sum u)(sum v)/2, i.e. u^T (I - J/2) v.
 *
 * @param {bigint[]} u
 * @param {bigint[]} v
 * @returns {bigint}
 */
function form(u, v) {
  let dot = 0n;
  let su = 0n;
  let sv = 0n;
  for (let i = 0; i < 4; i++) {
    dot += u[i] * v[i];
    su += u[i];
    sv += v[i];
  }
  return 2n * dot - su * sv;
}

/**
 * The Gram matrix the augmented columns must produce under `form`, doubled to
 * match its scaling. This is the Lagarias-Mallows-Wilks identity
 *
 *     W^T Q_D W = Q_W
 *
 * and it is a far stronger statement than the Descartes theorem alone. The two
 * zeros on the leading diagonal are the Descartes relations on the curvature and
 * co-curvature columns; the off-diagonal entries are cross-relations between the
 * columns, which no single-column check can see.
 *
 * Those cross-relations earn their keep: they are what catches a quadruple whose
 * columns each look individually fine but whose circles are inconsistently
 * oriented — a line whose normal points the wrong way, for instance.
 *
 * @type {bigint[][]}
 */
const GRAM = [
  [0n, -8n, 0n, 0n],
  [-8n, 0n, 0n, 0n],
  [0n, 0n, 4n, 0n],
  [0n, 0n, 0n, 4n],
];

/**
 * Check the full LMW matrix identity for a quadruple.
 * @param {Circle[]} quad
 * @returns {string[]} one message per violated relation; empty when it holds
 */
export function lmwErrors(quad) {
  const cols = columns(quad);
  /** @type {string[]} */
  const errors = [];
  for (let i = 0; i < 4; i++) {
    for (let j = i; j < 4; j++) {
      const got = form(cols[i], cols[j]);
      if (got !== GRAM[i][j]) {
        errors.push(
          `LMW relation <${COLUMN_NAMES[i]}, ${COLUMN_NAMES[j]}> is ${got}, expected ${GRAM[i][j]}`,
        );
      }
    }
  }
  return errors;
}

/**
 * Full validation of a Descartes quadruple. Checks, in exact integer arithmetic:
 *
 *   - each circle's own invariant, |bz|^2 - b*bbar = 1
 *   - the Descartes relation on the curvature column
 *   - the Descartes relation on the co-curvature column
 *   - the complex Descartes relation on the curvature-center column
 *   - the full LMW matrix identity, including the cross-column relations
 *   - all six pairwise tangencies
 *
 * @param {Circle[]} quad four circles
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateQuad(quad) {
  /** @type {string[]} */
  const errors = [];

  if (quad.length !== 4) {
    return { ok: false, errors: [`expected 4 circles, got ${quad.length}`] };
  }

  quad.forEach((c, i) => {
    if (!c.isValid()) {
      errors.push(
        `circle ${i} violates |bz|^2 - b*bbar = 1: ` +
          `got ${c.bz.normSq() - c.b * c.bbar} for (${c.bbar}, ${c.b}, ${c.bz})`,
      );
    }
  });

  const [c0, c1, c2, c3] = quad;

  if (!descartesReal(c0.b, c1.b, c2.b, c3.b)) {
    errors.push(
      `curvatures ${quad.map((c) => c.b).join(', ')} fail Descartes' theorem`,
    );
  }
  if (!descartesReal(c0.bbar, c1.bbar, c2.bbar, c3.bbar)) {
    errors.push(
      `co-curvatures ${quad.map((c) => c.bbar).join(', ')} fail Descartes' theorem`,
    );
  }
  if (!descartesComplex(c0.bz, c1.bz, c2.bz, c3.bz)) {
    errors.push('curvature-centers fail the complex Descartes theorem');
  }

  errors.push(...lmwErrors(quad));

  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      if (!areTangent(quad[i], quad[j])) {
        errors.push(`circles ${i} and ${j} are not tangent`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * A quadruple's common factor, and the quadruple divided by it.
 *
 * Scaling every curvature by k scales the whole packing by 1/k: the same picture at a
 * different size, with the same structure. Only the **primitive** quadruple — the one
 * whose curvatures share no common factor — is placed on the Gaussian integers, so
 * `(−7, 14, 14, 21)` cannot be constructed while `(−1, 2, 2, 3)` can, and they describe
 * the same packing.
 *
 * That accounts for nearly every construction failure worth reporting: of the
 * placement failures found by scanning small quadruples, 54 of 57 were simply
 * non-primitive.
 *
 * @param {(number|bigint)[]} curvatures
 * @returns {{factor: bigint, curvatures: bigint[]}}
 */
export function primitiveForm(curvatures) {
  const bs = curvatures.map((v) => BigInt(v));
  let factor = 0n;
  for (const b of bs) factor = gcd(factor, b);
  if (factor <= 1n) return { factor: 1n, curvatures: bs };
  return { factor, curvatures: bs.map((b) => b / factor) };
}

/**
 * Build a root quadruple from four curvatures.
 *
 * The construction runs in exact rational arithmetic:
 *
 *   1. Check the Descartes relation.
 *   2. Place the circles from their pairwise distances. Two circles of curvature
 *      b1, b2 are tangent exactly when their centers are |b1 + b2| / |b1 * b2|
 *      apart, which is rational, so the whole placement is rational — the only
 *      irrational step would be a square root, and for an integral quadruple that
 *      square root comes out rational too. If it does not, the quadruple is
 *      reported as non-integral rather than silently rounded.
 *   3. Translate into integral position. The natural placement is very rarely
 *      integral: (-3, 5, 8, 8) lands on curvature-center products of 0, 2/3,
 *      -4/3 + i and -4/3 - i. Translating by 2/3 turns those into -2, 4, 4 + i and
 *      4 - i. Since a translation by c sends b*z to b*z + b*c, and the products
 *      share a denominator D, it is enough to search the D translations c = u/D.
 *   4. Derive the co-curvatures from the invariant and check they are integers.
 *   5. Validate the result like any other quadruple.
 *
 * @param {(number|bigint)[]} curvatures four curvatures
 * @returns {{ok: true, quad: Circle[]}|{ok: false, reason: string}}
 */
export function rootFromCurvatures(curvatures) {
  if (curvatures.length !== 4) {
    return { ok: false, reason: `expected 4 curvatures, got ${curvatures.length}` };
  }

  /** @type {bigint[]} */
  const b = curvatures.map((v) => BigInt(v));

  if (!descartesReal(b[0], b[1], b[2], b[3])) {
    const s = b.reduce((a, v) => a + v, 0n);
    const q = b.reduce((a, v) => a + v * v, 0n);
    return {
      ok: false,
      reason:
        `${b.join(', ')} is not a Descartes quadruple: ` +
        `(sum)^2 = ${s * s} but 2*(sum of squares) = ${2n * q}`,
    };
  }

  if (b.some((v) => v === 0n)) {
    return {
      ok: false,
      reason:
        'quadruples containing a line (curvature 0) are not constructible this way; ' +
        'use the named strip packing',
    };
  }

  // The placement puts the first two circles on the real axis, which fixes the
  // orientation of the whole configuration — and only some orientations are
  // integral. (-6, 11, 14, 15) has no integral placement starting from that pair
  // but does starting from -6 and 14. Rather than reason about which frame is the
  // right one, try all of them; there are only 24.
  /** @type {string} */
  let reason = 'no integral placement was found in any ordering';

  for (const order of orderings()) {
    const attempt = place(order.map((i) => b[i]));
    if (attempt.ok) return { ok: true, quad: reorder(attempt.quad, b) };
    // Keep the most specific complaint to report if every ordering fails.
    if (!/no rational placement|no translation/.test(attempt.reason)) {
      reason = attempt.reason;
    }
  }

  return { ok: false, reason };
}

/** @type {number[][]|null} */
let cachedOrderings = null;

/** @returns {number[][]} the 24 permutations of 0..3, identity first */
function orderings() {
  if (cachedOrderings !== null) return cachedOrderings;
  /** @type {number[][]} */
  const out = [];
  /** @param {number[]} rest @param {number[]} acc */
  const walk = (rest, acc) => {
    if (rest.length === 0) {
      out.push(acc);
      return;
    }
    for (let i = 0; i < rest.length; i++) {
      walk([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, rest[i]]);
    }
  };
  walk([0, 1, 2, 3], []);
  cachedOrderings = out;
  return out;
}

/**
 * Put a constructed quadruple back into the order the caller asked for.
 * @param {Circle[]} quad
 * @param {bigint[]} wanted curvatures in the requested order
 * @returns {Circle[]}
 */
function reorder(quad, wanted) {
  const pool = quad.slice();
  return wanted.map((b) => {
    const i = pool.findIndex((c) => c.b === b);
    return pool.splice(i, 1)[0];
  });
}

/**
 * Place four curvatures in the frame where the first two lie on the real axis.
 * @param {bigint[]} b
 * @returns {{ok: true, quad: Circle[]}|{ok: false, reason: string}}
 */
function place(b) {
  // Pairwise center distances, exactly.
  /** @param {number} i @param {number} j */
  const dist = (i, j) => {
    const num = b[i] + b[j];
    const den = b[i] * b[j];
    return new Rational(num < 0n ? -num : num, den < 0n ? -den : den);
  };

  const d01 = dist(0, 1);
  if (d01.isZero()) {
    return { ok: false, reason: 'the first two circles coincide; reorder the curvatures' };
  }

  const two = Rational.of(2);
  /** @type {{x: Rational, y: Rational}[]} */
  const z = [
    { x: RZERO, y: RZERO },
    { x: d01, y: RZERO },
  ];

  // Circles 3 and 4 sit at the intersection of two distance constraints.
  for (const k of [2, 3]) {
    const r0 = dist(0, k);
    const r1 = dist(1, k);
    const x = r0.square().sub(r1.square()).add(d01.square()).div(two.mul(d01));
    const ySq = r0.square().sub(x.square());
    const y = ySq.sqrt();
    if (y === null) {
      return {
        ok: false,
        reason: `circle ${k + 1} has no rational placement, so this quadruple is not integral`,
      };
    }
    z.push({ x, y });
  }

  // Two mirror images satisfy the constraints for the fourth circle; pick the one
  // that is also the right distance from the third.
  const wanted = dist(2, 3).square();
  const apart = (/** @type {Rational} */ sign) => {
    const dy = z[3].y.mul(sign).sub(z[2].y);
    return z[3].x.sub(z[2].x).square().add(dy.square());
  };
  if (!apart(Rational.of(1)).equals(wanted)) {
    if (!apart(Rational.of(-1)).equals(wanted)) {
      return { ok: false, reason: 'the four circles cannot be placed mutually tangent' };
    }
    z[3] = { x: z[3].x, y: z[3].y.neg() };
  }

  // Curvature-center products, still rational.
  const prod = z.map((p, i) => ({
    x: p.x.mul(new Rational(b[i])),
    y: p.y.mul(new Rational(b[i])),
  }));

  const placed = translateToIntegers(b, prod);
  if (placed === null) {
    return {
      ok: false,
      reason: 'no translation puts this quadruple on the Gaussian integers',
    };
  }

  /** @type {Circle[]} */
  const quad = [];
  for (let i = 0; i < 4; i++) {
    const bz = new Gaussian(placed[i].x, placed[i].y);
    const num = bz.normSq() - 1n;
    if (num % b[i] !== 0n) {
      return { ok: false, reason: `circle ${i + 1} has no integral co-curvature` };
    }
    quad.push(new Circle(num / b[i], b[i], bz));
  }

  const check = validateQuad(quad);
  if (!check.ok) {
    return { ok: false, reason: `constructed quadruple failed validation: ${check.errors[0]}` };
  }

  return { ok: true, quad };
}

/**
 * Find a translation making every curvature-center product a Gaussian integer.
 *
 * A translation by c sends b*z to b*z + b*c, so with all products written over a
 * common denominator D it suffices to try c = u/D for u in [0, D): shifting u by D
 * moves c by a whole unit, which changes each product by the integer b, and cannot
 * change whether it is integral. The two axes are independent.
 *
 * @param {bigint[]} b
 * @param {{x: Rational, y: Rational}[]} prod
 * @returns {{x: bigint, y: bigint}[]|null}
 */
function translateToIntegers(b, prod) {
  let D = 1n;
  for (const p of prod) {
    D = lcm(D, p.x.d);
    D = lcm(D, p.y.d);
  }
  if (D > 1000000n) return null;

  /**
   * @param {(p: {x: Rational, y: Rational}) => Rational} axis
   * @returns {bigint|null} the shift numerator over D
   */
  const solve = (axis) => {
    for (let u = 0n; u < D; u++) {
      let ok = true;
      for (let i = 0; i < 4 && ok; i++) {
        const scaled = axis(prod[i]).mul(new Rational(D));
        if (!scaled.isInteger()) return null;
        if ((b[i] * u + scaled.n) % D !== 0n) ok = false;
      }
      if (ok) return u;
    }
    return null;
  };

  const u = solve((p) => p.x);
  const v = solve((p) => p.y);
  if (u === null || v === null) return null;

  return prod.map((p, i) => ({
    x: (p.x.mul(new Rational(D)).n + b[i] * u) / D,
    y: (p.y.mul(new Rational(D)).n + b[i] * v) / D,
  }));
}

/**
 * Build a named root, failing loudly at load time rather than shipping a broken one.
 * @param {number[]} curvatures
 * @returns {Circle[]}
 */
function built(curvatures) {
  const r = rootFromCurvatures(curvatures);
  if (!r.ok) throw new Error(`cannot build root (${curvatures.join(', ')}): ${r.reason}`);
  return r.quad;
}

/**
 * Named root quadruples, each an integral Descartes quadruple in augmented
 * coordinates. Every one of these is checked against validateQuad by the test
 * suite, so a typo here cannot survive to the renderer.
 *
 * @type {Record<string, {name: string, description: string, quad: Circle[]}>}
 */
export const ROOTS = {
  /**
   * The classic bounded packing: a unit bounding circle, two circles of curvature 2,
   * and one of curvature 3. Every curvature in it is an integer.
   */
  apollonian: {
    name: '(-1, 2, 2, 3)',
    description: 'The classic bounded packing inside a unit circle.',
    quad: [
      Circle.of(1, -1, 0, 0), //  bounding circle, center 0, radius 1
      Circle.of(0, 2, -1, 0), //  center (-1/2, 0), radius 1/2
      Circle.of(0, 2, 1, 0), //   center ( 1/2, 0), radius 1/2
      Circle.of(1, 3, 0, 2), //   center (0, 2/3),  radius 1/3
    ],
  },

  /**
   * Further primitive integral packings, built by rootFromCurvatures and checked
   * against validateQuad by the test suite like the hand-derived ones.
   */
  '2367': {
    name: '(-2, 3, 6, 7)',
    description: 'A primitive integral packing.',
    quad: /** @type {Circle[]} */ (built([-2, 3, 6, 7])),
  },
  '3588': {
    name: '(-3, 5, 8, 8)',
    description: 'A primitive integral packing.',
    quad: /** @type {Circle[]} */ (built([-3, 5, 8, 8])),
  },
  '611415': {
    name: '(-6, 11, 14, 15)',
    description: 'A primitive integral packing.',
    quad: /** @type {Circle[]} */ (built([-6, 11, 14, 15])),
  },

  /**
   * The strip packing: two parallel lines y = 0 and y = 2, and two unit circles
   * between them. Exercises the b = 0 case the Android version never handled.
   */
  strip: {
    name: '(0, 0, 1, 1)',
    description: 'The strip packing between two parallel lines.',
    quad: [
      Circle.of(0, 0, 0, -1), // line y = 0, normal -i, through the origin so bbar = 0
      Circle.of(4, 0, 0, 1), //  line y = 2, normal +i, distance 2 so bbar = 4
      Circle.of(0, 1, 0, 1), //  center (0, 1), radius 1
      Circle.of(4, 1, 2, 1), //  center (2, 1), radius 1
    ],
  },
};
