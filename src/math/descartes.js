// @ts-check

import { Circle } from './circle.js';
import { Gaussian } from './gaussian.js';

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
 * Named root quadruples, each an integral Descartes quadruple in augmented
 * coordinates. Every one of these is checked against validateQuad by the test
 * suite, so a typo here cannot survive to the renderer.
 *
 * Constructing an arbitrary root from four curvatures requires a square root in
 * Z[i] to place the centers; that is deferred until the UI needs custom quadruple
 * entry. Until then, generation starts from one of these.
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
