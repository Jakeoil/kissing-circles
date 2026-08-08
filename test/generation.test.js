// @ts-check

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ROOTS, validateQuad, areTangent } from '../src/math/descartes.js';
import { generate, curvatures } from './helpers/reference-packing.js';

/**
 * These are the tests the plan calls the foundation: they run the Descartes
 * recursion over thousands of circles and assert that exactness survives it. They
 * use the naive reference generator, not the real one — the point is to validate
 * the math primitives before any rendering exists.
 */

describe('the classic (-1, 2, 2, 3) packing', () => {
  const { circles, quads } = generate(ROOTS.apollonian.quad, {
    maxCurvature: 2000n,
  });

  test('generates a substantial packing', () => {
    assert.ok(circles.length > 1000, `only ${circles.length} circles`);
  });

  test('every circle satisfies its augmented invariant, exactly', () => {
    // BigInt equality, not an epsilon. Any drift at all fails here.
    for (const { circle } of circles) {
      assert.ok(circle.isValid(), `${circle} violates |bz|^2 - b*bbar = 1`);
    }
  });

  test('every quadruple visited is a genuine Descartes quadruple', () => {
    for (const quad of quads) {
      const result = validateQuad(quad);
      assert.ok(result.ok, result.errors.join('; '));
    }
  });

  test('contains the known small curvatures', () => {
    const found = new Set(circles.map((c) => c.circle.b));
    const known = [6n, 11n, 14n, 15n, 18n, 23n, 26n, 27n, 30n, 35n, 38n, 39n];
    for (const b of known) {
      assert.ok(found.has(b), `curvature ${b} is missing from the packing`);
    }
  });

  test('every curvature is an integer, and all but the bounding one positive', () => {
    for (const { circle } of circles) {
      assert.equal(typeof circle.b, 'bigint');
      if (circle.b < 0n) {
        assert.equal(circle.b, -1n, 'only the bounding circle is negative');
      }
    }
  });

  test('the bounding circle appears exactly once', () => {
    const bounding = circles.filter((c) => c.circle.b < 0n);
    assert.equal(bounding.length, 1);
    assert.equal(bounding[0].circle.b, -1n);
  });

  test('curvatures grow with depth', () => {
    // Every circle beyond the root is strictly smaller than the triple that made
    // it, which is what makes screen-space pruning safe in Phase 2.
    const deepest = Math.max(...circles.map((c) => c.depth));
    assert.ok(deepest > 5, `only reached depth ${deepest}`);
    const byDepth = new Map();
    for (const { circle, depth } of circles) {
      if (depth === 0) continue;
      const min = byDepth.get(depth);
      if (min === undefined || circle.b < min) byDepth.set(depth, circle.b);
    }
    // The minimum curvature at each depth is non-decreasing.
    const depths = [...byDepth.keys()].sort((a, b) => a - b);
    for (let i = 1; i < depths.length; i++) {
      assert.ok(
        byDepth.get(depths[i]) >= byDepth.get(depths[i - 1]),
        `depth ${depths[i]} has a smaller minimum curvature than depth ${depths[i - 1]}`,
      );
    }
  });

  test('deduplication leaves no repeated circles', () => {
    const keys = new Set(circles.map((c) => c.circle.key()));
    assert.equal(keys.size, circles.length);
  });

  test('no two distinct circles share a center and curvature', () => {
    const seen = new Map();
    for (const { circle } of circles) {
      const k = `${circle.b}|${circle.bz.key()}`;
      if (seen.has(k)) {
        assert.ok(
          seen.get(k).bbar === circle.bbar,
          `two circles share (b, bz) but differ in co-curvature: ${k}`,
        );
      }
      seen.set(k, circle);
    }
  });
});

describe('the (0, 0, 1, 1) strip packing', () => {
  // The strip is infinite in x — the row of unit circles translates forever at
  // curvature 1 — so it is bounded by depth rather than by curvature.
  const { circles, quads } = generate(ROOTS.strip.quad, {
    maxCurvature: 10000n,
    maxDepth: 7,
  });

  test('generates circles and keeps the two lines', () => {
    assert.ok(circles.length > 100, `only ${circles.length} circles`);
    const lines = circles.filter((c) => c.circle.isLine());
    assert.ok(lines.length >= 2, 'the two bounding lines should be present');
  });

  test('every circle satisfies its augmented invariant, exactly', () => {
    for (const { circle } of circles) {
      assert.ok(circle.isValid(), `${circle} violates the invariant`);
    }
  });

  test('every quadruple visited is valid, lines included', () => {
    for (const quad of quads) {
      const result = validateQuad(quad);
      assert.ok(result.ok, result.errors.join('; '));
    }
  });

  test('lines have b = 0 and unit normals', () => {
    for (const { circle } of circles) {
      if (circle.isLine()) {
        assert.equal(circle.b, 0n);
        assert.equal(circle.bz.normSq(), 1n, 'a line normal must be a unit vector');
      }
    }
  });

  test('circles tangent to a line all sit on one side of it', () => {
    const line = ROOTS.strip.quad[0]; // y = 0, normal +i
    for (const { circle } of circles) {
      if (circle.isLine()) continue;
      if (!areTangent(line, circle)) continue;
      const f = circle.toFloat();
      assert.ok(f.y > 0, `circle ${circle} is tangent to y=0 but centered below it`);
    }
  });
});

describe('exactness at depth', () => {
  test('curvatures pass the double integer limit and stay exact', () => {
    // Follow one chain of reflections down and check the invariant keeps holding
    // long after Number would have started lying.
    let quad = ROOTS.apollonian.quad.slice();
    let skip = -1;
    let maxB = 0n;

    for (let step = 0; step < 60; step++) {
      // Always replace the smallest-curvature circle we are allowed to, which
      // drives curvature up fastest.
      let pick = -1;
      for (let i = 0; i < 4; i++) {
        if (i === skip) continue;
        if (pick === -1 || quad[i].b < quad[pick].b) pick = i;
      }
      const rest = quad.filter((_, j) => j !== pick);
      const born = quad[pick].spawn(rest[0], rest[1], rest[2]);

      assert.ok(born.isValid(), `step ${step}: ${born} broke the invariant`);
      const result = validateQuad([...rest, born]);
      assert.ok(result.ok, `step ${step}: ${result.errors.join('; ')}`);

      const next = quad.slice();
      next[pick] = born;
      quad = next;
      skip = pick;
      if (born.b > maxB) maxB = born.b;
    }

    assert.ok(
      maxB > 9007199254740992n,
      `expected to exceed 2^53, only reached ${maxB}`,
    );
  });
});

describe('reference generator', () => {
  test('curvatures() returns a sorted distinct list', () => {
    const { circles } = generate(ROOTS.apollonian.quad, { maxCurvature: 50n });
    const list = curvatures(circles);
    assert.equal(list[0], -1n);
    for (let i = 1; i < list.length; i++) {
      assert.ok(list[i] > list[i - 1], 'ascending and distinct');
    }
  });

  test('the curvature bound is respected', () => {
    const { circles } = generate(ROOTS.apollonian.quad, { maxCurvature: 100n });
    for (const { circle } of circles) {
      assert.ok(circle.b <= 100n);
    }
  });
});
