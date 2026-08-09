// @ts-check

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { rootFromCurvatures, validateQuad, ROOTS } from '../src/math/descartes.js';
import { generate } from '../src/math/packing.js';
import { describe as describeCircle, exactCenter, exactRadius } from '../src/ui/readout.js';

describe('building a root from four curvatures', () => {
  const known = [
    [-1, 2, 2, 3],
    [-2, 3, 6, 7],
    [-3, 5, 8, 8],
    [-4, 8, 9, 9],
    [-6, 11, 14, 15],
    [-9, 14, 26, 27],
    [-10, 18, 23, 27],
    [-11, 21, 24, 28],
  ];

  for (const curvatures of known) {
    test(`(${curvatures.join(', ')}) constructs and validates`, () => {
      const r = rootFromCurvatures(curvatures);
      assert.ok(r.ok, r.ok ? '' : r.reason);

      const check = validateQuad(r.quad);
      assert.ok(check.ok, check.errors.join('; '));

      // The curvatures come back in the order they were asked for.
      assert.deepEqual(
        r.quad.map((c) => Number(c.b)),
        curvatures,
      );
      // And every circle is genuinely integral.
      for (const c of r.quad) {
        assert.ok(c.isValid());
        assert.equal(typeof c.bz.re, 'bigint');
      }
    });
  }

  test('reproduces the hand-derived classic root up to reflection', () => {
    const r = rootFromCurvatures([-1, 2, 2, 3]);
    assert.ok(r.ok);
    const built = new Set(r.quad.map((c) => `${c.b}|${c.bz.normSq()}`));
    const hand = new Set(ROOTS.apollonian.quad.map((c) => `${c.b}|${c.bz.normSq()}`));
    assert.deepEqual([...built].sort(), [...hand].sort());
  });

  test('a constructed root generates a correct packing', () => {
    const r = rootFromCurvatures([-3, 5, 8, 8]);
    assert.ok(r.ok);
    const p = generate(r.quad, { maxCurvature: 3000n });
    assert.ok(p.count > 500);
    for (let i = 0; i < p.count; i++) {
      assert.ok(p.circles[i].isValid(), `${p.circles[i]} is not a circle`);
    }
  });

  test('the ordering search is what makes the harder ones work', () => {
    // (-6, 11, 14, 15) has no integral placement in the frame set by its first two
    // curvatures, and does in another. Without trying orderings this fails.
    const r = rootFromCurvatures([-6, 11, 14, 15]);
    assert.ok(r.ok, r.ok ? '' : r.reason);
  });

  describe('rejections', () => {
    test('names the Descartes failure with both sides', () => {
      const r = rootFromCurvatures([-1, 2, 2, 4]);
      assert.ok(!r.ok);
      assert.match(r.reason, /not a Descartes quadruple/);
      assert.match(r.reason, /49/);
      assert.match(r.reason, /50/);
    });

    test('rejects the wrong number of curvatures', () => {
      const r = rootFromCurvatures([1, 2, 3]);
      assert.ok(!r.ok);
      assert.match(r.reason, /expected 4/);
    });

    test('declines quadruples containing a line', () => {
      const r = rootFromCurvatures([0, 0, 1, 1]);
      assert.ok(!r.ok);
      assert.match(r.reason, /line/);
    });

    test('a valid but non-integral quadruple is refused, not rounded', () => {
      // Descartes holds, but the placement has no rational solution.
      const r = rootFromCurvatures([1, 1, 1, 1]);
      assert.ok(!r.ok);
    });
  });

  test('every named root passes full validation', () => {
    for (const [key, root] of Object.entries(ROOTS)) {
      const check = validateQuad(root.quad);
      assert.ok(check.ok, `${key}: ${check.errors.join('; ')}`);
    }
  });
});

describe('generating quadruples', () => {
  test('the root circles have no parents', () => {
    const p = generate(ROOTS.apollonian.quad, { maxCurvature: 200n });
    for (let i = 0; i < 4; i++) {
      assert.deepEqual(p.parentsOf(i), []);
    }
  });

  test('every other circle records the triple it was reflected in', () => {
    const p = generate(ROOTS.apollonian.quad, { maxCurvature: 400n });
    let checked = 0;
    for (let i = 4; i < p.count; i++) {
      const parents = p.parentsOf(i);
      assert.equal(parents.length, 3, `circle ${i} has no parents`);
      for (const j of parents) {
        assert.ok(j >= 0 && j < p.count, `parent index ${j} out of range`);
        assert.ok(j !== i, 'a circle cannot be its own parent');
      }
      // The recorded triple plus the circle really is a Descartes quadruple.
      const quad = [...parents.map((j) => p.circles[j]), p.circles[i]];
      const check = validateQuad(quad);
      assert.ok(check.ok, `circle ${i}: ${check.errors.join('; ')}`);
      checked++;
    }
    assert.ok(checked > 100, `only checked ${checked}`);
  });

  test('parents are always shallower than their child', () => {
    const p = generate(ROOTS.apollonian.quad, { maxCurvature: 400n });
    for (let i = 4; i < p.count; i++) {
      for (const j of p.parentsOf(i)) {
        assert.ok(p.depth[j] < p.depth[i], `parent ${j} is not shallower than ${i}`);
      }
    }
  });
});

describe('picking', () => {
  const p = generate(ROOTS.apollonian.quad, { maxCurvature: 400n });

  test('finds the circle a point falls inside', () => {
    // The curvature-3 circle sits at (0, 2/3) with radius 1/3.
    const i = p.pick(0, 0.667);
    assert.ok(i >= 0);
    assert.equal(p.circles[i].b, 3n);
  });

  test('a point in a gap returns the bounding circle', () => {
    // Rather than guess a point in an interstice, sample the disk and check the
    // property: every point inside the boundary resolves either to the circle that
    // genuinely contains it, or to the boundary itself.
    // A sparse packing, so the interstices are large enough for a coarse grid to
    // land in one.
    const sparse = generate(ROOTS.apollonian.quad, { maxCurvature: 30n });
    let gaps = 0;
    let hits = 0;

    for (let a = -0.95; a <= 0.95; a += 0.05) {
      for (let b = -0.95; b <= 0.95; b += 0.05) {
        if (a * a + b * b > 0.9) continue;
        const i = sparse.pick(a, b);
        assert.ok(i >= 0, `(${a}, ${b}) is inside the packing but matched nothing`);

        const c = sparse.circles[i];
        const f = c.toFloat();
        const inside = Math.hypot(a - f.x, b - f.y) <= Math.abs(f.r) + 1e-12;
        assert.ok(inside, `(${a}, ${b}) resolved to a circle not containing it`);

        if (c.b < 0n) gaps++;
        else hits++;
      }
    }

    assert.ok(hits > 100, `only ${hits} points landed in a circle`);
    assert.ok(gaps > 0, 'some sampled points should land in an interstice');
  });

  test('a point outside everything finds nothing', () => {
    assert.equal(p.pick(5, 5), -1);
  });

  test('prefers an ordinary circle over the bounding one', () => {
    const i = p.pick(0.5, 0);
    assert.ok(i >= 0);
    assert.equal(p.circles[i].b, 2n, 'should be the curvature-2 disk, not the boundary');
  });

  test('honors a restricted candidate list', () => {
    const all = p.pick(0, 0.667);
    const restricted = p.pick(0, 0.667, [0, 1, 2]);
    assert.notEqual(all, restricted);
    assert.ok([0, 1, 2, -1].includes(restricted));
  });
});

describe('readout formatting', () => {
  const p = generate(ROOTS.apollonian.quad, { maxCurvature: 400n });
  const find = (/** @type {bigint} */ b) => {
    for (let i = 0; i < p.count; i++) if (p.circles[i].b === b) return i;
    throw new Error(`no circle of curvature ${b}`);
  };

  test('exact centers are reduced', () => {
    assert.equal(exactCenter(p.circles[find(3n)]), '2/3i');
    assert.equal(exactCenter(p.circles[find(-1n)]), '0');
  });

  test('a center with both parts reads as a Gaussian rational', () => {
    const i = find(6n);
    const s = exactCenter(p.circles[i]);
    assert.match(s, /^-?\d+(\/\d+)? [+−] \d+(\/\d+)?i$/, `got "${s}"`);
  });

  test('exact radii', () => {
    assert.equal(exactRadius(p.circles[find(3n)]), '1/3');
    assert.equal(exactRadius(p.circles[find(-1n)]), '−1');
  });

  test('describe reports the generating quadruple', () => {
    const rows = describeCircle(p, find(15n));
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
    assert.equal(byLabel.curvature, '15');
    assert.equal(byLabel.radius, '1/15');
    assert.equal(byLabel['reflected in'], '2, 2, 3');
    assert.equal(byLabel.quadruple, '2, 2, 3, 15');
  });

  test('describe marks the root circles as such', () => {
    const rows = describeCircle(p, 0);
    assert.ok(rows.some((r) => r.value === 'root quadruple'));
  });

  test('lines are described without a center', () => {
    const strip = generate(ROOTS.strip.quad, { maxDepth: 3 });
    let line = -1;
    for (let i = 0; i < strip.count; i++) if (strip.circles[i].isLine()) line = i;
    assert.ok(line >= 0);
    const rows = describeCircle(strip, line);
    assert.ok(rows.some((r) => r.label === 'line'));
  });
});
