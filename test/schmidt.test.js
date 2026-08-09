// @ts-check

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { arrangement, regionCount, REAL_LINE } from '../src/math/schmidt.js';
import { GENERATORS } from '../src/math/mobius.js';

describe('the Schmidt arrangement', () => {
  const a = arrangement({ maxGeneration: 5 });

  test('the real line is a valid zero-curvature circle', () => {
    assert.ok(REAL_LINE.isValid());
    assert.ok(REAL_LINE.isLine());
    assert.equal(REAL_LINE.b, 0n);
    assert.equal(REAL_LINE.bz.normSq(), 1n, 'a line normal is a unit vector');
  });

  test('every circle it produces is exactly on the variety', () => {
    for (let i = 0; i < a.count; i++) {
      assert.ok(
        a.circles[i].isValid(),
        `circle ${i} has |bz|² − b·b̄ = ${a.circles[i].bz.normSq() - a.circles[i].b * a.circles[i].bbar}`,
      );
    }
  });

  test('every curvature is even — Schmidt ρ(F) ∈ 2ℕ₀', () => {
    // The independent check that the construction is being followed correctly. The
    // Apollonian gasket has odd curvatures, so this also pins down the factor of two
    // between the two normalizations.
    let odd = 0;
    for (let i = 0; i < a.count; i++) {
      if (a.circles[i].b % 2n !== 0n) odd++;
    }
    assert.equal(odd, 0, `${odd} circles had odd curvature`);
  });

  test('the curvatures start 0, 2, 4, 6, 8 …', () => {
    const seen = new Set();
    for (let i = 0; i < a.count; i++) {
      if (a.circles[i].b >= 0n) seen.add(a.circles[i].b);
    }
    for (const b of [0n, 2n, 4n, 6n, 8n, 10n, 12n]) {
      assert.ok(seen.has(b), `curvature ${b} missing`);
    }
  });

  test('region counts follow (3·5ⁿ − 1)/2', () => {
    assert.equal(regionCount(0), 1);
    assert.equal(regionCount(1), 7);
    assert.equal(regionCount(2), 37);
    assert.equal(regionCount(3), 187);
    assert.equal(regionCount(4), 937);
    assert.equal(regionCount(5), 4687);
    assert.equal(a.regions, regionCount(5));
  });

  test('the traversal visits exactly the regions it should', () => {
    for (const n of [1, 2, 3, 4]) {
      assert.equal(arrangement({ maxGeneration: n }).regions, regionCount(n), `n=${n}`);
    }
  });

  test('circles are deduplicated — adjacent regions share boundaries', () => {
    const keys = new Set();
    for (let i = 0; i < a.count; i++) keys.add(a.circles[i].key());
    assert.equal(keys.size, a.count);
    assert.ok(a.count < a.regions, 'far fewer circles than regions');
  });

  test('deeper generations only add', () => {
    const small = arrangement({ maxGeneration: 3 });
    const big = arrangement({ maxGeneration: 5 });
    const inBig = new Set();
    for (let i = 0; i < big.count; i++) inBig.add(big.circles[i].key());
    for (let i = 0; i < small.count; i++) {
      assert.ok(inBig.has(small.circles[i].key()), 'a circle vanished at greater depth');
    }
    assert.ok(big.count > small.count);
  });

  test('the parallel arrays track the circles', () => {
    for (let i = 0; i < a.count; i++) {
      const f = a.circles[i].toFloat();
      assert.equal(a.x[i], f.x);
      assert.equal(a.y[i], f.y);
      assert.equal(a.r[i], f.r);
      assert.ok(a.depth[i] >= 0 && a.depth[i] <= 5);
    }
  });

  test('it has the shape the renderer expects', () => {
    // The point of plan.md §7.1: one renderer, several generators. If this drifts,
    // the mode idea stops working.
    for (const key of ['circles', 'x', 'y', 'r', 'depth', 'count']) {
      assert.ok(key in a, `missing ${key}`);
    }
    assert.ok(a.x instanceof Float64Array);
    assert.ok(a.depth instanceof Int32Array);
    assert.equal(typeof a.count, 'number');
  });

  describe('limits', () => {
    test('curvature', () => {
      const limited = arrangement({ maxGeneration: 6, maxCurvature: 40n });
      for (let i = 0; i < limited.count; i++) {
        const b = limited.circles[i].b;
        assert.ok(b <= 40n && b >= -40n, `curvature ${b} exceeded the bound`);
      }
      assert.ok(limited.count > 5);
    });

    test('viewport', () => {
      const bounds = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
      const clipped = arrangement({ maxGeneration: 5, bounds });
      for (let i = 0; i < clipped.count; i++) {
        const f = clipped.circles[i].toFloat();
        if (!Number.isFinite(f.r)) continue;
        const rad = Math.abs(f.r);
        assert.ok(
          f.x + rad >= bounds.minX && f.x - rad <= bounds.maxX &&
            f.y + rad >= bounds.minY && f.y - rad <= bounds.maxY,
          'kept a circle entirely outside the bounds',
        );
      }
      assert.ok(clipped.count < arrangement({ maxGeneration: 5 }).count);
    });

    test('resolution', () => {
      const coarse = arrangement({ maxGeneration: 6, minRadius: 0.05 });
      for (let i = 0; i < coarse.count; i++) {
        const f = coarse.circles[i].toFloat();
        if (!Number.isFinite(f.r)) continue;
        assert.ok(Math.abs(f.r) >= 0.05);
      }
    });
  });

  test('stays exact where a double would not', () => {
    const deep = arrangement({ maxGeneration: 8 });
    let biggest = 0n;
    for (let i = 0; i < deep.count; i++) {
      const b = deep.circles[i].b < 0n ? -deep.circles[i].b : deep.circles[i].b;
      if (b > biggest) biggest = b;
      assert.ok(deep.circles[i].isValid());
    }
    assert.ok(biggest > 10000n, `only reached curvature ${biggest}`);
  });

  test('the seven generators are the ones used', () => {
    assert.deepEqual(Object.keys(GENERATORS).sort(), ['C', 'E1', 'E2', 'E3', 'V1', 'V2', 'V3']);
  });
});
