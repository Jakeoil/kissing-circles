// @ts-check

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  isqrt,
  isPerfectSquare,
  descartesReal,
  descartesComplex,
  areTangent,
  fourthCurvature,
  validateQuad,
  lmwErrors,
  columns,
  ROOTS,
} from '../src/math/descartes.js';
import { Circle } from '../src/math/circle.js';
import { Gaussian } from '../src/math/gaussian.js';

describe('integer square root', () => {
  test('exact squares', () => {
    for (const n of [0n, 1n, 4n, 9n, 144n, 10000n]) {
      assert.equal(isqrt(n) * isqrt(n), n);
      assert.ok(isPerfectSquare(n));
    }
  });

  test('floors non-squares', () => {
    assert.equal(isqrt(2n), 1n);
    assert.equal(isqrt(8n), 2n);
    assert.equal(isqrt(99n), 9n);
    assert.ok(!isPerfectSquare(2n));
    assert.ok(!isPerfectSquare(99n));
  });

  test('handles magnitudes no double could', () => {
    const big = 12345678901234567890n;
    assert.equal(isqrt(big * big), big);
    assert.ok(isPerfectSquare(big * big));
    assert.ok(!isPerfectSquare(big * big + 1n));
  });

  test('rejects negatives', () => {
    assert.throws(() => isqrt(-1n));
    assert.ok(!isPerfectSquare(-4n));
  });
});

describe("Descartes' theorem", () => {
  test('holds for the classic curvatures', () => {
    assert.ok(descartesReal(-1n, 2n, 2n, 3n));
    assert.ok(descartesReal(0n, 0n, 1n, 1n));
    assert.ok(descartesReal(-3n, 5n, 8n, 8n));
    assert.ok(descartesReal(-6n, 11n, 14n, 15n));
  });

  test('rejects curvatures that are merely close', () => {
    assert.ok(!descartesReal(-1n, 2n, 2n, 4n));
    assert.ok(!descartesReal(-1n, 2n, 3n, 3n));
  });

  test('the complex form uses complex squares', () => {
    const { quad } = ROOTS.apollonian;
    assert.ok(descartesComplex(quad[0].bz, quad[1].bz, quad[2].bz, quad[3].bz));

    // Treating the real and imaginary parts as two independent real Descartes
    // columns is a tempting mistake, and it is wrong: the real parts here are
    // 0, -1, 1, 0, which do not satisfy the real relation.
    assert.ok(!descartesReal(0n, -1n, 1n, 0n));
  });

  test('fourth curvature has two roots summing to 2*(b1+b2+b3)', () => {
    const roots = fourthCurvature(-1n, 2n, 2n);
    assert.ok(roots);
    assert.deepEqual(roots, [3n, 3n]);

    const r2 = fourthCurvature(2n, 2n, 3n);
    assert.ok(r2);
    assert.equal(r2[0] + r2[1], 2n * (2n + 2n + 3n));
    assert.ok(r2.includes(-1n), 'the bounding circle is one of the two roots');
    assert.ok(r2.includes(15n), 'and curvature 15 is the other');
  });

  test('every fourth curvature satisfies the theorem', () => {
    const roots = fourthCurvature(2n, 3n, 15n);
    assert.ok(roots);
    for (const b4 of roots) {
      assert.ok(descartesReal(2n, 3n, 15n, b4));
    }
  });

  test('returns null when no integral fourth circle exists', () => {
    assert.equal(fourthCurvature(1n, 1n, 1n), null, 'discriminant 3 is not square');
    assert.equal(fourthCurvature(-5n, 1n, 1n), null, 'negative discriminant');
  });
});

describe('tangency', () => {
  test('all six pairs of the classic root are tangent', () => {
    const quad = ROOTS.apollonian.quad;
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) {
        assert.ok(areTangent(quad[i], quad[j]), `${i} and ${j}`);
      }
    }
  });

  test('detects internal tangency against a bounding circle', () => {
    const [outer, left] = ROOTS.apollonian.quad;
    assert.ok(outer.b < 0n);
    assert.ok(areTangent(outer, left));
  });

  test('detects circle-to-line tangency', () => {
    const [line0, line2, unit] = ROOTS.strip.quad;
    assert.ok(areTangent(line0, unit));
    assert.ok(areTangent(line2, unit));
  });

  test('rejects circles that overlap or are separated', () => {
    const a = Circle.fromCurvature(1, 0, 0); // unit circle at origin
    const overlapping = Circle.fromCurvature(1, 1, 0); // center (1, 0), r = 1
    const separated = Circle.fromCurvature(1, 5, 0); // center (5, 0), r = 1
    const tangent = Circle.fromCurvature(1, 2, 0); // center (2, 0), r = 1
    assert.ok(!areTangent(a, overlapping));
    assert.ok(!areTangent(a, separated));
    assert.ok(areTangent(a, tangent));
  });
});

describe('quadruple validation', () => {
  test('every named root is a genuine Descartes quadruple', () => {
    for (const root of Object.values(ROOTS)) {
      const result = validateQuad(root.quad);
      assert.ok(result.ok, `${root.name}: ${result.errors.join('; ')}`);
    }
  });

  test('reports a wrong curvature', () => {
    const quad = ROOTS.apollonian.quad.slice();
    quad[3] = Circle.of(1, 4, 0, 2);
    const result = validateQuad(quad);
    assert.ok(!result.ok);
    assert.ok(result.errors.some((e) => /Descartes/.test(e)));
  });

  test('reports a displaced circle', () => {
    const quad = ROOTS.apollonian.quad.slice();
    quad[3] = new Circle(1n, 3n, new Gaussian(2n, 0n));
    const result = validateQuad(quad);
    assert.ok(!result.ok);
    assert.ok(result.errors.length > 0);
  });

  test('the LMW cross-relations catch a wrongly oriented line', () => {
    // Reversing *both* line normals while leaving the co-curvatures alone leaves
    // every single-column check satisfied: the curvature column is untouched, the
    // co-curvature column still obeys Descartes, and the complex relation still
    // holds because both signs flipped together. Only the cross-relation between
    // the co-curvature and b*y columns notices. This exact mistake was in the first
    // draft of the strip root, and it produced a packing in which essentially every
    // generated circle violated its own invariant.
    const quad = ROOTS.strip.quad.slice();
    quad[0] = new Circle(0n, 0n, new Gaussian(0n, 1n)); // was -i
    quad[1] = new Circle(4n, 0n, new Gaussian(0n, -1n)); // was +i

    const [bbar, b] = columns(quad);
    assert.ok(descartesReal(bbar[0], bbar[1], bbar[2], bbar[3]));
    assert.ok(descartesReal(b[0], b[1], b[2], b[3]));
    assert.ok(
      descartesComplex(quad[0].bz, quad[1].bz, quad[2].bz, quad[3].bz),
      'the complex relation is blind to this',
    );
    for (const c of quad) {
      assert.ok(c.isValid(), 'and every circle still satisfies its own invariant');
    }

    const errors = lmwErrors(quad);
    assert.ok(errors.length > 0, 'LMW should reject it');
    assert.ok(errors.some((e) => /co-curvature, b\*y/.test(e)), errors.join('; '));
    assert.ok(!validateQuad(quad).ok);

    // And the consequence: the recursion immediately leaves the variety.
    const born = quad[0].spawn(quad[1], quad[2], quad[3]);
    assert.ok(!born.isValid(), 'a bad root spawns circles that are not circles');
  });

  test('the LMW identity holds for every named root', () => {
    for (const root of Object.values(ROOTS)) {
      assert.deepEqual(lmwErrors(root.quad), [], root.name);
    }
  });

  test('reports the wrong number of circles', () => {
    const result = validateQuad(ROOTS.apollonian.quad.slice(0, 3));
    assert.ok(!result.ok);
    assert.match(result.errors[0], /expected 4/);
  });
});
