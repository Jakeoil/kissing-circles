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
  inversiveProduct2,
  reflectQuad,
  placeQuadruple,
  rootQuadruples,
  rootFromCurvatures,
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

describe('reflecting a quadruple outward', () => {
  test('every circle is normalised: 2<X,X> = -2', () => {
    for (const root of Object.values(ROOTS)) {
      for (const c of root.quad) {
        assert.equal(inversiveProduct2(c, c), -2n, `${root.name} has an unnormalised row`);
      }
    }
  });

  test('it is an involution', () => {
    for (const root of Object.values(ROOTS)) {
      for (let i = 0; i < 4; i++) {
        const there = reflectQuad(root.quad, i);
        const back = reflectQuad(there, i);
        for (let j = 0; j < 4; j++) {
          assert.ok(back[j].equals(root.quad[j]),
            `${root.name}: reflecting twice through circle ${i} did not return`);
        }
      }
    }
  });

  test('it produces valid Descartes quadruples', () => {
    for (const root of Object.values(ROOTS)) {
      for (let i = 0; i < 4; i++) {
        const out = reflectQuad(root.quad, i);
        const v = validateQuad(out);
        assert.ok(v.ok, `${root.name} through circle ${i}: ${v.errors?.[0]}`);
      }
    }
  });

  test('the classic packing turns outward into the strip and two known roots', () => {
    // The three distinct results Jake predicted, and the reason the strip is the waist
    // of the recursion rather than its root.
    const bends = (q) => q.map((c) => Number(c.b)).sort((a, b) => a - b).join(',');
    const got = new Set();
    for (let i = 0; i < 4; i++) got.add(bends(reflectQuad(ROOTS.apollonian.quad, i)));
    assert.ok(got.has('0,0,1,1'), 'the -1 circle should open onto the strip');
    assert.ok(got.has('-2,3,6,7'), 'a 2 circle should open onto (-2, 3, 6, 7)');
    assert.ok(got.has('-3,5,8,8'), 'the 3 circle should open onto (-3, 5, 8, 8)');
    assert.equal(got.size, 3, 'the two 2s should give the same quadruple');
  });

  test('it is not the Vieta jump', () => {
    const q = ROOTS.apollonian.quad;
    const vieta = q[0].spawn(q[1], q[2], q[3]);
    assert.equal(vieta.b, 15n);
    const out = reflectQuad(q, 3).map((c) => Number(c.b)).sort((a, b) => a - b);
    assert.deepEqual(out, [-3, 5, 8, 8], 'reflection keeps one circle and moves three');
  });
});

describe('placing quadruples that are not roots', () => {
  test('(5, 8, 12, 53) places, two Vieta steps inside (-3, 5, 8, 8)', () => {
    // It was on plan.md's open list as a placement failure. It is not: every bend is
    // positive, so no circle encloses the others and it is not a root quadruple at all.
    // rootFromCurvatures declining it was correct; asking it was the mistake.
    const r = placeQuadruple([5, 8, 12, 53]);
    assert.ok(r.ok, r.ok ? '' : r.reason);
    assert.equal(r.steps, 2);
    assert.deepEqual(r.root.map(Number), [-3, 5, 8, 8]);
    assert.ok(validateQuad(r.quad).ok);
    assert.deepEqual(
      r.quad.map((c) => Number(c.b)).sort((a, b) => a - b),
      [5, 8, 12, 53],
    );
  });

  test('roots place unchanged, at zero steps', () => {
    for (const root of Object.values(ROOTS)) {
      const bends = root.quad.map((c) => c.b);
      const r = placeQuadruple(bends);
      assert.ok(r.ok, `${root.name}: ${r.ok ? '' : r.reason}`);
      assert.equal(r.steps, 0, `${root.name} should already be a root`);
    }
  });

  test('interior quadruples place at their true depth', () => {
    for (const [bends, steps] of [[[2, 2, 3, 15], 1], [[2, 3, 6, 23], 2], [[5, 8, 12, 53], 2]]) {
      const r = placeQuadruple(bends);
      assert.ok(r.ok, r.ok ? '' : r.reason);
      assert.equal(r.steps, steps, `(${bends}) should be ${steps} steps in`);
      assert.ok(validateQuad(r.quad).ok);
    }
  });

  test('it refuses what is genuinely not a quadruple', () => {
    const r = placeQuadruple([6, 11, 14, 15]);
    assert.equal(r.ok, false);
    assert.match(r.reason, /not a Descartes quadruple/);
  });
});

describe('enumerating the packings', () => {
  test('it reproduces the known order', () => {
    // The list in plan.md §7.4, which the workbench's dropdown used to sample
    // arbitrarily. If this drifts, the packings offered drift with it.
    const got = rootQuadruples(12).filter((q) => q[0] !== 0n).map((q) => q.join(','));
    assert.deepEqual(got.slice(0, 11), [
      '-1,2,2,3', '-2,3,6,7', '-3,4,12,13', '-3,5,8,8', '-4,5,20,21', '-4,8,9,9',
      '-5,6,30,31', '-5,7,18,18', '-6,7,42,43', '-6,10,15,19', '-6,11,14,15',
    ]);
  });

  test('the strip comes first, and every entry is a genuine root', () => {
    const roots = rootQuadruples(24);
    assert.deepEqual(roots[0].map(Number), [0, 0, 1, 1], 'the strip is the a = 0 root');
    for (const q of roots) {
      assert.ok(descartesReal(q[0], q[1], q[2], q[3]), `${q} fails Descartes`);
      assert.ok(q[0] <= 0n, `${q} has no enclosing circle`);
      assert.ok(q[0] + q[1] + q[2] >= q[3], `${q} is not minimal`);
      for (let i = 1; i < 4; i++) assert.ok(q[i - 1] <= q[i], `${q} is not sorted`);
      // Reducing a root must leave it alone: that is what being a root means.
      const r = placeQuadruple(q);
      assert.ok(r.ok, r.ok ? '' : `${q}: ${r.reason}`);
      assert.equal(r.steps, 0, `${q} should already be reduced`);
    }
  });

  test('the shipped roots all appear in it', () => {
    const listed = new Set(rootQuadruples(24).map((q) => q.join(',')));
    for (const root of Object.values(ROOTS)) {
      const bends = root.quad.map((c) => c.b).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      assert.ok(listed.has(bends.join(',')),
        `${root.name} is offered but not in the enumeration`);
    }
  });
});

describe('placing roots that cannot be constructed head-on', () => {
  test('the 17 that rootFromCurvatures refuses all place', () => {
    // rootFromCurvatures pins one circle at the origin and the next on the real axis,
    // then needs a rational square root for the other two. The configuration is
    // rational but not always in that frame, and no reordering rotates you into the
    // right one. placeQuadruple falls back to walking the orbit instead.
    const refused = [
      [-11n, 16n, 36n, 37n], [-13n, 18n, 47n, 50n], [-13n, 23n, 30n, 38n],
      [-14n, 19n, 54n, 55n], [-14n, 27n, 31n, 34n], [-16n, 21n, 68n, 69n],
    ];
    for (const bends of refused) {
      assert.equal(rootFromCurvatures(bends.map(Number)).ok, false,
        `${bends} was expected to defeat the direct construction`);
      const r = placeQuadruple(bends);
      assert.ok(r.ok, r.ok ? '' : `${bends}: ${r.reason}`);
      assert.ok(validateQuad(r.quad).ok, `${bends} placed but not a Descartes quadruple`);
      assert.deepEqual(
        r.quad.map((c) => c.b).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
        bends,
        `${bends} placed with the wrong bends`,
      );
    }
  });

  test('every one of the first 96 roots places, exactly', () => {
    for (const bends of rootQuadruples(96)) {
      const r = placeQuadruple(bends);
      assert.ok(r.ok, r.ok ? '' : `${bends}: ${r.reason}`);
      assert.ok(validateQuad(r.quad).ok, `${bends}`);
      assert.deepEqual(
        r.quad.map((c) => c.b).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
        bends,
      );
    }
  });
});
