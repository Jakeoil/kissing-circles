// @ts-check

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Packing, generate, tangencyPoint, branchBounds } from '../src/math/packing.js';
import { ROOTS, areTangent } from '../src/math/descartes.js';
import { generate as reference } from './helpers/reference-packing.js';

/**
 * Sorted list of circle keys, for comparing two packings as sets.
 * @param {Packing} p
 * @returns {string[]}
 */
function keysOf(p) {
  return p.circles
    .slice(0, p.count)
    .map((c) => c.key())
    .sort();
}

describe('tangency points', () => {
  test('where the unit circle touches a curvature-2 circle', () => {
    const [outer, left] = ROOTS.apollonian.quad;
    const t = tangencyPoint(outer, left);
    assert.ok(t);
    assert.equal(t.x, -1);
    assert.equal(t.y, 0);
  });

  test('where a line touches a circle resting on it', () => {
    const [line0, , unit] = ROOTS.strip.quad;
    const t = tangencyPoint(line0, unit);
    assert.ok(t);
    assert.equal(t.x, 0);
    assert.equal(t.y, 0);
  });

  test('parallel lines touch at infinity', () => {
    const [line0, line2] = ROOTS.strip.quad;
    assert.equal(tangencyPoint(line0, line2), null);
  });

  test('the touch point lies on both circles', () => {
    const quad = ROOTS.apollonian.quad;
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) {
        const t = tangencyPoint(quad[i], quad[j]);
        if (t === null) continue;
        for (const c of [quad[i], quad[j]]) {
          const f = c.toFloat();
          const d = Math.hypot(t.x - f.x, t.y - f.y);
          assert.ok(
            Math.abs(d - Math.abs(f.r)) < 1e-12,
            `touch point is ${d} from the center of ${c}, radius ${f.r}`,
          );
        }
      }
    }
  });
});

describe('branch bounds', () => {
  test('declines to bound a triple containing a bounding circle', () => {
    const [outer, left, right] = ROOTS.apollonian.quad;
    assert.equal(branchBounds(outer, left, right), null);
  });

  test('bounds a positive-curvature triple', () => {
    const quad = ROOTS.apollonian.quad;
    const box = branchBounds(quad[1], quad[2], quad[3]);
    assert.ok(box);
    assert.ok(box.maxX > box.minX && box.maxY > box.minY);
  });

  test('actually contains every descendant of the branch', () => {
    // The claim the culling rests on: everything a branch produces stays inside the
    // triangle of its parents' tangency points. If this is wrong, zooming drops
    // circles that should be visible.
    const quad = ROOTS.apollonian.quad;
    const triple = [quad[1], quad[2], quad[3]];
    const box = branchBounds(triple[0], triple[1], triple[2]);
    assert.ok(box);

    // Descend only the one branch, never reflecting back out through the circle we
    // arrived by. A full generation from this quadruple would also expand outward
    // past the triple, which is not what the bound claims to cover.
    const eps = 1e-9;
    let checked = 0;

    /**
     * @param {import('../src/math/circle.js').Circle[]} q
     * @param {number} born
     */
    function descend(q, born) {
      const c = q[born];
      if (c.b > 5000n) return;
      const f = c.toFloat();
      const r = Math.abs(f.r);
      assert.ok(
        f.x - r >= box.minX - eps &&
          f.x + r <= box.maxX + eps &&
          f.y - r >= box.minY - eps &&
          f.y + r <= box.maxY + eps,
        `circle ${c} escapes the branch bound`,
      );
      checked++;
      for (let i = 0; i < 4; i++) {
        if (i === born) continue;
        const next = q[i].spawn(q[(i + 1) & 3], q[(i + 2) & 3], q[(i + 3) & 3]);
        const child = q.slice();
        child[i] = next;
        descend(child, i);
      }
    }

    const born = quad[0].spawn(triple[0], triple[1], triple[2]);
    descend([triple[0], triple[1], triple[2], born], 3);

    assert.ok(checked > 100, `only checked ${checked} circles`);
  });
});

describe('Packing', () => {
  test('agrees with the naive reference generator', () => {
    const limits = { maxCurvature: 500n };
    const p = generate(ROOTS.apollonian.quad, limits);
    const ref = reference(ROOTS.apollonian.quad, limits);

    const refKeys = [...new Set(ref.circles.map((c) => c.circle.key()))].sort();
    assert.deepEqual(keysOf(p), refKeys);
    assert.equal(p.count, refKeys.length);
  });

  test('agrees with the reference on the strip too', () => {
    const limits = { maxDepth: 6, maxCurvature: 10000n };
    const p = generate(ROOTS.strip.quad, limits);
    const ref = reference(ROOTS.strip.quad, limits);

    const refKeys = [...new Set(ref.circles.map((c) => c.circle.key()))].sort();
    assert.deepEqual(keysOf(p), refKeys);
  });

  test('every circle produced is valid and integral', () => {
    const p = generate(ROOTS.apollonian.quad, { maxCurvature: 2000n });
    for (let i = 0; i < p.count; i++) {
      assert.ok(p.circles[i].isValid(), `${p.circles[i]} is not a circle`);
    }
  });

  test('the parallel arrays track the exact circles', () => {
    const p = generate(ROOTS.apollonian.quad, { maxCurvature: 300n });
    for (let i = 0; i < p.count; i++) {
      const f = p.circles[i].toFloat();
      assert.equal(p.x[i], f.x);
      assert.equal(p.y[i], f.y);
      assert.equal(p.r[i], f.r);
    }
  });

  test('produces no duplicates', () => {
    const p = generate(ROOTS.apollonian.quad, { maxCurvature: 2000n });
    assert.equal(new Set(keysOf(p)).size, p.count);
  });

  describe('budgeting', () => {
    test('grow() respects its budget and can be resumed', () => {
      const p = new Packing(ROOTS.apollonian.quad, { maxCurvature: 1000n });
      let batches = 0;
      while (!p.done) {
        const { expanded } = p.grow(50);
        assert.ok(expanded <= 50);
        batches++;
        assert.ok(batches < 10000, 'grow() is not making progress');
      }
      assert.ok(batches > 1, 'the budget should have forced several batches');

      const whole = generate(ROOTS.apollonian.quad, { maxCurvature: 1000n });
      assert.deepEqual(keysOf(p), keysOf(whole));
    });

    test('an exhausted packing reports done and stays put', () => {
      const p = generate(ROOTS.apollonian.quad, { maxCurvature: 200n });
      assert.ok(p.done);
      const before = p.count;
      const { added, expanded } = p.grow(100);
      assert.equal(added, 0);
      assert.equal(expanded, 0);
      assert.equal(p.count, before);
    });
  });

  describe('refine — resuming rather than restarting', () => {
    test('widening the curvature limit matches generating it outright', () => {
      // The property the whole deep-zoom design depends on.
      const stepwise = new Packing(ROOTS.apollonian.quad, { maxCurvature: 100n });
      stepwise.grow();
      const afterFirst = stepwise.count;

      stepwise.refine({ maxCurvature: 400n });
      stepwise.grow();
      stepwise.refine({ maxCurvature: 1500n });
      stepwise.grow();

      const direct = generate(ROOTS.apollonian.quad, { maxCurvature: 1500n });

      assert.ok(afterFirst < stepwise.count, 'refining should add circles');
      assert.deepEqual(keysOf(stepwise), keysOf(direct));
    });

    test('tightening then loosening the resolution limit round-trips', () => {
      const p = new Packing(ROOTS.apollonian.quad, {
        maxCurvature: 2000n,
        minRadius: 0.01,
      });
      p.grow();
      const coarse = p.count;
      assert.ok(p.deferredCount > 0, 'branches should have been deferred');

      p.refine({ minRadius: 0 });
      p.grow();

      const direct = generate(ROOTS.apollonian.quad, { maxCurvature: 2000n });
      assert.ok(coarse < p.count);
      assert.deepEqual(keysOf(p), keysOf(direct));
    });

    test('widening the viewport matches generating unbounded', () => {
      const narrow = { minX: -0.2, minY: -0.2, maxX: 0.2, maxY: 0.2 };
      const p = new Packing(ROOTS.apollonian.quad, {
        maxCurvature: 1500n,
        bounds: narrow,
      });
      p.grow();
      const clipped = p.count;
      assert.ok(p.deferredCount > 0, 'the viewport should have deferred branches');

      p.refine({ bounds: null });
      p.grow();

      const direct = generate(ROOTS.apollonian.quad, { maxCurvature: 1500n });
      assert.ok(clipped < p.count, 'clipping should have held circles back');
      assert.deepEqual(keysOf(p), keysOf(direct));
    });

    test('a clipped packing keeps everything that overlaps the viewport', () => {
      const bounds = { minX: -0.3, minY: -0.3, maxX: 0.3, maxY: 0.3 };
      const limits = { maxCurvature: 800n };
      const clipped = generate(ROOTS.apollonian.quad, { ...limits, bounds });
      const full = generate(ROOTS.apollonian.quad, limits);

      const kept = new Set(keysOf(clipped));
      let missed = 0;
      for (let i = 0; i < full.count; i++) {
        const r = Math.abs(full.r[i]);
        const overlapsView =
          full.x[i] + r >= bounds.minX &&
          full.x[i] - r <= bounds.maxX &&
          full.y[i] + r >= bounds.minY &&
          full.y[i] - r <= bounds.maxY;
        if (overlapsView && !kept.has(full.circles[i].key())) missed++;
      }
      assert.equal(missed, 0, `${missed} visible circles were culled`);
    });
  });

  describe('limits', () => {
    test('depth', () => {
      const p = generate(ROOTS.apollonian.quad, { maxDepth: 3 });
      assert.ok(p.maxDepthReached <= 3);
      assert.ok(p.count > 4);
    });

    test('curvature, in both signs', () => {
      const p = generate(ROOTS.apollonian.quad, { maxCurvature: 100n });
      for (let i = 0; i < p.count; i++) {
        const b = p.circles[i].b;
        assert.ok(b <= 100n && b >= -100n);
      }
    });

    test('resolution', () => {
      const p = generate(ROOTS.apollonian.quad, {
        maxCurvature: 100000n,
        minRadius: 0.005,
      });
      for (let i = 0; i < p.count; i++) {
        if (p.circles[i].isLine()) continue;
        assert.ok(Math.abs(p.r[i]) >= 0.005, `radius ${p.r[i]} is below the limit`);
      }
    });
  });

  test('tangency survives generation', () => {
    // Spot-check that circles produced deep in the recursion still touch their
    // neighbors exactly.
    const p = generate(ROOTS.apollonian.quad, { maxCurvature: 400n });
    const [outer] = ROOTS.apollonian.quad;
    let touching = 0;
    for (let i = 0; i < p.count; i++) {
      if (areTangent(outer, p.circles[i])) touching++;
    }
    assert.ok(touching > 10, `only ${touching} circles touch the bounding circle`);
  });

  test('stats report the shape of the packing', () => {
    const p = generate(ROOTS.apollonian.quad, { maxCurvature: 500n });
    const s = p.stats();
    assert.equal(s.count, p.count);
    assert.ok(s.done);
    assert.equal(s.pending, 0);
    assert.ok(s.maxDepth > 3);
    assert.ok(s.maxCurvature <= 500n);
  });
});
