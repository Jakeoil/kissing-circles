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

/**
 * Twice the inversive product of two circles.
 *
 *     2⟨X, Y⟩ = X.b̄·Y.b + X.b·Y.b̄ − 2·Re(X.bz · conj(Y.bz))
 *
 * Doubled so it stays an integer: the halves cancel and nothing needs dividing. For a
 * circle with itself it is always −2, since `|bz|² − b·b̄ = 1` is the invariant every
 * row here satisfies — so ⟨X, X⟩ = −1 and every circle is already normalised for the
 * reflection below.
 *
 * @param {Circle} x
 * @param {Circle} y
 * @returns {bigint}
 */
export function inversiveProduct2(x, y) {
  return x.bbar * y.b + x.b * y.bbar
    - 2n * (x.bz.re * y.bz.re + x.bz.im * y.bz.im);
}

/**
 * Reflect one circle in another — geometric inversion, done in integers.
 *
 *     X ↦ X − 2⟨X, C⟩/⟨C, C⟩ · C  =  X + 2⟨X, C⟩ · C     since ⟨C, C⟩ = −1
 *
 * Linear in the augmented coordinates, so it needs no square root and no division and
 * keeps everything in `ℤ × ℤ[i]` — the same property that makes the Vieta jump exact.
 *
 * @param {Circle} x the circle being reflected
 * @param {Circle} c the mirror
 * @returns {Circle}
 */
export function reflectIn(x, c) {
  const k = inversiveProduct2(x, c);
  return new Circle(x.bbar + k * c.bbar, x.b + k * c.b, x.bz.add(c.bz.scale(k)));
}

/**
 * Turn a quadruple inside out through one of its own circles.
 *
 * **The outward move**, and Jake's construction: rather than filling a gap, reflect the
 * whole quadruple in one of its four circles. That circle stays where it is but swaps
 * its inside for its outside — hence the sign flip — and the other three land within it.
 *
 * It is **not** the Vieta jump. Vieta replaces one circle and keeps three;
 * this keeps one and moves three. From `(−1, 2, 2, 3)`:
 *
 *     through the −1  →  (0, 0, 1, 1)     the strip
 *     through a    2  →  (−2, 3, 6, 7)
 *     through the  3  →  (−3, 5, 8, 8)
 *
 * so the strip is not the root of the recursion but its waist: inward is the familiar
 * packing, outward is this. Note `(−3, 5, 8, 8)` and not `3 × (−1, 2, 2, 3) =
 * (−3, 6, 6, 9)` — the latter is a perfectly good quadruple but an imprimitive one, and
 * the reflection lands on the primitive root instead.
 *
 * Reflecting twice through the same circle is the identity, as a reflection should be.
 *
 * This appears to be a generator of what Graham, Lagarias, Mallows, Wilks and Yan call
 * the **dual Apollonian group** — the Apollonian group acts by the Vieta jumps, its dual
 * by inversions in the four circles, and the two together generate the super-Apollonian
 * group. *Named from the reference, not read out of it; see plan.md §9.*
 *
 * @param {Circle[]} quad a valid Descartes quadruple
 * @param {number} i which of its circles to turn through
 * @returns {Circle[]} another valid Descartes quadruple
 */
export function reflectQuad(quad, i) {
  const mirror = quad[i];
  return quad.map((c, j) => (j === i
    // The mirror keeps its position and reverses orientation: what was outside it is
    // now in. Without this the four rows are still valid circles but no longer a
    // Descartes quadruple, since the enclosing circle would have positive bend.
    ? new Circle(-c.bbar, -c.b, c.bz.scale(-1n))
    : reflectIn(c, mirror)));
}

/**
 * The eight permutations of a quadruple: the symmetries of the square, applied to it.
 *
 * Turning by a unit and mirroring in the real axis generate a group of order eight —
 * four rotations, and the same four again with a flip. Every one sends a Descartes
 * quadruple to a Descartes quadruple, because tangency and bends survive rotation and
 * reflection untouched; only where the circles sit changes.
 *
 * **Up to eight.** The count is eight only when the quadruple has no symmetry of its
 * own. When it does, images coincide and the orbit is shorter — the strip `(0,0,1,1)`
 * has a repeated pair and lands on four distinct placements, not eight. Callers that
 * care about distinctness should dedupe; this returns the orbit as generated, in a fixed
 * order, so index 0 is always the quadruple that came in.
 *
 * Note these are *placements*, not new packings. All eight have the same four bends.
 *
 * @param {Circle[]} quad
 * @returns {Circle[][]} eight quadruples, `[rotations…, mirrored rotations…]`
 */
export function permutations(quad) {
  const units = [
    new Gaussian(1n, 0n), new Gaussian(0n, 1n),
    new Gaussian(-1n, 0n), new Gaussian(0n, -1n),
  ];
  const out = [];
  for (const mirrored of [false, true]) {
    for (const u of units) {
      out.push(quad.map((c) => (mirrored ? c.conjugate() : c).rotate(u)));
    }
  }
  return out;
}

/**
 * Place any valid Descartes quadruple, root or not.
 *
 * `rootFromCurvatures` builds *root* quadruples — those with an enclosing circle,
 * `a ≤ 0`. Plenty of perfectly good quadruples are not roots: `(5, 8, 12, 53)` has
 * four positive bends, so no circle encloses the others, and it sits two Vieta steps
 * inside the `(−3, 5, 8, 8)` packing. Asking a root builder for it and calling the
 * refusal a bug was a mistake in this project's own notes.
 *
 * The construction is the obvious one and it is exact: reduce to the root by replacing
 * the largest bend with its Vieta partner while that lowers it, place *that*, then walk
 * back out by jumping until the bends match again. Every step is integer arithmetic.
 *
 * @param {(number|bigint)[]} curvatures
 * @returns {{ok: true, quad: Circle[], root: bigint[], steps: number}
 *   | {ok: false, reason: string}}
 */
export function placeQuadruple(curvatures) {
  const want = curvatures.map((v) => BigInt(v)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const key = (v) => v.join(',');
  const target = key(want);

  if (!descartesReal(want[0], want[1], want[2], want[3])) {
    return { ok: false, reason: `${want.join(', ')} is not a Descartes quadruple` };
  }

  // Reduce to the root, counting steps so the walk back out knows how far to go.
  let b = [...want];
  let steps = 0;
  for (let guard = 0; guard < 500; guard++) {
    const sum = b[0] + b[1] + b[2] + b[3];
    const alt = 2n * (sum - b[3]) - b[3];
    if (alt >= b[3]) break;
    b = [b[0], b[1], b[2], alt].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
    steps++;
  }
  const root = b;

  // A shipped root first. The strip's two zero bends are circles like any other here —
  // bend 0, radius infinite, an ordinary row with `b = 0`, which is the whole reason
  // `Circle` carries `b̄` (see circle.js). The exception is not what they *are* but how
  // `rootFromCurvatures` works: it places by choosing rational centres, and a circle of
  // infinite radius has no centre to choose. So the strip is hand-built in ROOTS, and
  // since it is exactly what the outward move keeps reaching, a designer lands on it.
  const known = Object.values(ROOTS).find((r) =>
    key(r.quad.map((c) => c.b).sort((x, y) => (x < y ? -1 : x > y ? 1 : 0))) === key(root));
  const direct = known
    ? { ok: /** @type {const} */ (true), quad: known.quad }
    : rootFromCurvatures(root.map(Number));
  const placed = direct.ok ? direct : searchForPlacement(root);
  if (!placed.ok) return { ok: false, reason: `its root ${root.join(', ')} could not be placed` };
  if (steps === 0) return { ok: true, quad: placed.quad, root, steps };

  // Walk back out. Breadth-first over the four Vieta jumps, to exactly the depth the
  // reduction took — the target is reachable in that many and no fewer.
  let frontier = [placed.quad];
  const seen = new Set([key(placed.quad.map((c) => c.b).sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)))]);
  for (let depth = 1; depth <= steps; depth++) {
    /** @type {Circle[][]} */
    const next = [];
    for (const quad of frontier) {
      for (let i = 0; i < 4; i++) {
        const others = quad.filter((_, j) => j !== i);
        const jumped = quad[i].spawn(others[0], others[1], others[2]);
        const out = quad.map((c, j) => (j === i ? jumped : c));
        const sig = key(out.map((c) => c.b).sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)));
        if (sig === target) return { ok: true, quad: out, root, steps };
        if (seen.has(sig)) continue;
        seen.add(sig);
        next.push(out);
      }
    }
    frontier = next;
  }
  return { ok: false, reason: `reduced to ${root.join(', ')} but could not walk back out` };
}

/**
 * The root quadruples, in order — every primitive integral packing, once each.
 *
 * Every integral Apollonian packing has exactly one **root quadruple**: the minimal one
 * under the Apollonian group, reached by Vieta-reducing until no bend can be lowered.
 * Graham, Lagarias, Mallows, Wilks and Yan characterise them by
 *
 *     a ≤ 0,   a ≤ b ≤ c ≤ d,   a + b + c ≥ d
 *
 * together with Descartes and `gcd = 1`. Those conditions are decidable, so the
 * packings can be *enumerated* rather than chosen. The list this replaces offered roots
 * #1, #2, #4 and #11 — an arbitrary subset picked because they were the ones already
 * verified, which `plan.md` §7.4 has called out as having no basis since it was written.
 *
 * Ordered by `|a|`, then `b`, then `c`, which is the conventional presentation and
 * begins `(0,0,1,1) (−1,2,2,3) (−2,3,6,7) (−3,4,12,13) (−3,5,8,8) …`. The first is the
 * strip: `a = 0` is allowed, and it is the degenerate packing between two parallel
 * lines.
 *
 * @param {number} count how many to return
 * @returns {bigint[][]} each sorted ascending
 */
export function rootQuadruples(count) {
  /** @type {bigint[][]} */
  const out = [];
  for (let a = 0n; out.length < count && -a < 400n; a -= 1n) {
    /** @type {bigint[][]} */
    const here = [];
    const A = -a;
    // The search range is narrow, and worth deriving rather than guessing at — a loose
    // bound here costs seconds, since every candidate pays an integer square root.
    //
    // Write the fourth bend as `d = a+b+c − 2r` with `r² = bc − A(b+c)`; the root takes
    // the smaller completion. Then `d ≥ c` forces `2r ≤ b − A`, and `r² ≥ 0` forces
    // `c(b−A) ≥ Ab`. Together those pin c to
    //
    //     Ab/(b−A)  ≤  c  ≤  (b−A)/4 + Ab/(b−A)
    //
    // a window whose width is only (b−A)/4. And since `c ≥ b`, the window empties once
    // b grows past about 4A/3, which ends the b loop as well.
    if (A === 0n) {
      // The strip, and only the strip: two parallel lines with a circle between them.
      here.push([0n, 0n, 1n, 1n]);
    }
    for (let b = A + 1n; A !== 0n; b += 1n) {
      const span = b - A;
      // SLACK because these are integer divisions and both bounds are derived from
      // exact rationals — truncating either one closes the window on real roots.
      // Dropping (−3, 5, 8, 8) this way cost an hour, so err wide: the window is only
      // a few wide regardless, and a couple of extra candidates cost nothing.
      const SLACK = 2n;
      const lo = (A * b) / span - SLACK;
      const hi = span / 4n + (A * b) / span + SLACK;
      const from = lo > b ? lo : b;
      if (from > hi) {
        // Empty for this b. Once c ≥ b outruns the window it does so for good.
        if (b > 4n * A + 8n) break;
        continue;
      }
      for (let c = from; c <= hi; c += 1n) {
        const disc = a * b + b * c + c * a;
        if (disc < 0n || !isPerfectSquare(disc)) continue;
        const d = a + b + c - 2n * isqrt(disc);
        if (d < c || a + b + c < d) continue;
        if (gcdOf([a, b, c, d]) !== 1n) continue;
        if (!descartesReal(a, b, c, d)) continue;
        here.push([a, b, c, d]);
      }
    }
    here.sort((x, y) => (x[1] === y[1] ? Number(x[2] - y[2]) : Number(x[1] - y[1])));
    for (const q of here) {
      if (out.length >= count) break;
      out.push(q);
    }
  }
  return out;
}

/**
 * @param {bigint[]} v
 * @returns {bigint}
 */
function gcdOf(v) {
  let g = 0n;
  for (let x of v) {
    if (x < 0n) x = -x;
    while (x) { [g, x] = [x, g % x]; }
  }
  return g < 0n ? -g : g;
}

/**
 * Place a quadruple by finding it, when constructing it head-on does not work.
 *
 * `rootFromCurvatures` builds by putting one circle at the origin and the next on the
 * real axis, which fixes the frame — and then needs a rational square root for the
 * remaining two. The configuration really is rational (chapter 3), but not always *in
 * that frame*, and no reordering of the four rotates you into the right one. It fails
 * on 17 of the first 96 roots, all with `|a| ≥ 11`.
 *
 * So: stop constructing and start walking. From the classic packing, apply both moves
 * this project knows — the Vieta jump inward and the reflection outward (§8.6) — until
 * a quadruple with the wanted bends turns up. Both are exact, so whatever is found is
 * an exact placement. In practice the missing roots are one to four steps away and the
 * search takes milliseconds.
 *
 * @param {bigint[]} want sorted ascending
 * @returns {{ok: true, quad: Circle[]} | {ok: false, reason: string}}
 */
function searchForPlacement(want) {
  const key = (q) => q.map((c) => c.b).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).join(',');
  const target = want.join(',');

  // Best-first, not breadth-first. Some roots — `(−34, 39, 266, 267)` and its family,
  // shaped `(−n, n+5, m, m+1)` — sit deep down a narrow path, and a breadth-first walk
  // exhausts any sane ceiling long before reaching them. Ordering the frontier by how
  // near a quadruple's bends already are to the target follows that path instead.
  const distance = (q) => {
    const got = q.map((c) => c.b).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    let d = 0n;
    for (let i = 0; i < 4; i++) {
      const gap = got[i] - want[i];
      d += gap < 0n ? -gap : gap;
    }
    return d;
  };

  let frontier = [ROOTS.apollonian.quad];
  const seen = new Set([key(ROOTS.apollonian.quad)]);
  const CEILING = 120000;   // bounded: a runaway would hang whatever called it
  const WIDTH = 900;        // how much of each frontier to keep, best first

  for (let round = 0; round < 60 && seen.size < CEILING; round++) {
    /** @type {Circle[][]} */
    const next = [];
    for (const quad of frontier) {
      for (let i = 0; i < 4; i++) {
        const others = quad.filter((_, j) => j !== i);
        for (const out of [
          quad.map((c, j) => (j === i ? quad[i].spawn(others[0], others[1], others[2]) : c)),
          reflectQuad(quad, i),
        ]) {
          if (!validateQuad(out).ok) continue;
          const k = key(out);
          if (k === target) return { ok: true, quad: out };
          if (seen.has(k)) continue;
          seen.add(k);
          next.push(out);
        }
      }
    }
    if (next.length === 0) break;
    next.sort((a, b) => (distance(a) < distance(b) ? -1 : 1));
    frontier = next.slice(0, WIDTH);
  }
  return { ok: false, reason: `no placement found within reach of the classic packing` };
}
