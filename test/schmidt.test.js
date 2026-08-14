// @ts-check

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  arrangement,
  regionCount,
  REAL_LINE,
  seed,
  subdivide,
  regionBox,
  canReach,
  regionsAt,
  geometry,
} from '../src/math/schmidt.js';
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

describe('pruning the traversal', () => {
  test('a child region never leaves its parent box', () => {
    // The whole basis of the pruning: subdivision is a partition, so one box bounds a
    // subtree's position and its size at once. If this fails, pruning silently loses
    // regions and every picture drawn from a windowed walk is wrong.
    let frontier = [seed()];
    let pairs = 0;
    for (let g = 0; g < 6; g++) {
      const next = [];
      for (const parent of frontier) {
        const pb = regionBox(parent);
        for (const child of subdivide(parent)) {
          next.push(child);
          const cb = regionBox(child);
          if (pb === null || cb === null) continue;
          pairs++;
          assert.ok(
            cb.minX >= pb.minX - 1e-9 && cb.maxX <= pb.maxX + 1e-9 &&
            cb.minY >= pb.minY - 1e-9 && cb.maxY <= pb.maxY + 1e-9,
            `child box escapes parent at generation ${g}`,
          );
        }
      }
      frontier = next;
    }
    assert.ok(pairs > 20000, `only checked ${pairs} pairs`);
  });

  test('a windowed walk terminates instead of expanding 5^n', () => {
    // Unpruned this is 5^n forever; the failure it replaces was a 4 GB heap death.
    const bounds = { minX: 0.3, minY: 0.05, maxX: 0.7, maxY: 0.45 };
    let regions = [seed()];
    let generations = 0;
    let peak = 0;
    while (regions.length > 0 && generations < 200) {
      generations++;
      const next = [];
      for (const region of regions) {
        for (const child of subdivide(region)) {
          if (canReach(child, bounds, 0.01)) next.push(child);
        }
      }
      regions = next;
      peak = Math.max(peak, regions.length);
    }
    assert.equal(regions.length, 0, `still expanding after ${generations} generations`);
    // A 0.4-wide window holds about (0.4/0.01)^2 = 1,600 regions of that size; the
    // frontier should stay within a small factor of what actually fits.
    assert.ok(peak < 8000, `frontier peaked at ${peak}`);
  });

  test('a pruned walk still returns a partition, with no holes', () => {
    // The regression this guards against: pruning a branch at the resolution floor and
    // dropping it, which leaves gaps in a picture whose whole point is that it covers
    // the plane. Regions that stop early have to come back as leaves.
    const bounds = { minX: 0.3, minY: 0.05, maxX: 0.7, maxY: 0.45 };
    const regions = regionsAt(30, { bounds, minSize: 0.03 });
    assert.ok(regions.length > 0, 'walk returned nothing at all');

    // Same rule the renderer fills by: inside every constraint, on the interior's side.
    const contains = (region, x, y) => {
      const g = geometry(region);
      if (g === null) return false;
      return g.constraints.every((c) => {
        if (c.isLine()) {
          const nx = Number(c.bz.re);
          const ny = Number(c.bz.im);
          const off = c.lineOffset();
          return (nx * x + ny * y - off) * (nx * g.interior.x + ny * g.interior.y - off) >= 0;
        }
        const f = c.toFloat();
        const r = Math.abs(f.r);
        return (
          (Math.hypot(x - f.x, y - f.y) - r) *
            (Math.hypot(g.interior.x - f.x, g.interior.y - f.y) - r) >= 0
        );
      });
    };

    let uncovered = 0;
    for (let i = 1; i < 12; i++) {
      for (let j = 1; j < 12; j++) {
        const x = bounds.minX + ((bounds.maxX - bounds.minX) * i) / 12;
        const y = bounds.minY + ((bounds.maxY - bounds.minY) * j) / 12;
        if (!regions.some((region) => contains(region, x, y))) uncovered++;
      }
    }
    assert.equal(uncovered, 0, `${uncovered} of 121 sample points fell in no region`);
  });

  test('the walk saturates rather than growing without end', () => {
    // Once every branch has hit the resolution floor, deeper generations add nothing.
    // This is what makes a generation control safe to hand a user.
    const bounds = { minX: 0.3, minY: 0.05, maxX: 0.7, maxY: 0.45 };
    // The floor is reached at generation 15 here; 20 and 30 are both past it.
    const at20 = regionsAt(20, { bounds, minSize: 0.03 }).length;
    const at30 = regionsAt(30, { bounds, minSize: 0.03 }).length;
    assert.ok(at20 > 0);
    assert.equal(at20, at30, 'region count still changing between generations 20 and 30');
  });

  test('pruning does not change what an unwindowed walk produces', () => {
    // With no window and no size floor, canReach must admit everything — otherwise the
    // pruning is not a filter on the limits but a change to the arrangement itself.
    for (const n of [3, 4, 5]) {
      let unpruned = [seed()];
      for (let g = 0; g < n; g++) {
        unpruned = unpruned.flatMap((region) => subdivide(region));
      }
      assert.equal(regionsAt(n).length, unpruned.length, `generation ${n}`);
    }
  });

  test('maxRegions stops rather than exhausting the heap', () => {
    const held = regionsAt(12, { maxRegions: 1000 });
    // The valve overshoots by one generation, on purpose: it has to return a state that
    // is a partition, and the only two are the generation it started from and the one it
    // just finished. It returns the finished one, so the bound is the branching factor —
    // at most 7 children per region — times the limit, not the limit itself. This test
    // asserted `<= 1000` and passed only because the valve was returning the *previous*
    // frontier alongside the current generation's leaves, which double-covered.
    assert.ok(held.length <= 7 * 1000, `returned ${held.length} regions`);
    assert.ok(held.length < regionCount(12) / 1000, 'stopped well short of generation 12');
  });
});

describe('the dual partition, from 𝒥*', () => {
  // Schmidt's other seed: the curvilinear triangle over [0,1] rather than the upper
  // half plane. A regular chain starts at 𝒥, a dually regular one at 𝒥*, and the
  // subdivision rules are the same — so the only thing that can go wrong is seeding.
  test('𝒥* is a triangle, and its three sides are mutually tangent', () => {
    const s = seed('T');
    assert.equal(s.type, 'T');
    assert.equal(s.name, '𝒥*');
    const g = geometry(s);
    assert.equal(g.sides.length, 3);
    // The real line is a constraint but not a side: it picks the component above the
    // semicircle rather than below it.
    assert.equal(g.constraints.length, 4);
  });

  test('counts follow (3·5ⁿ + 1)/4', () => {
    const want = [1, 4, 19, 94, 469, 2344];
    for (const [n, count] of want.entries()) {
      assert.equal(regionCount(n, 'T'), count, `formula at n=${n}`);
      assert.equal(regionsAt(n, { from: 'T' }).length, count, `walk at n=${n}`);
    }
  });

  test('neither partition is a sub-picture of the other', () => {
    // The rules swap the types — a circle makes four triangles, a triangle makes a
    // circle — so after one step each partition contains both kinds.
    for (const from of ['J', 'T']) {
      const types = new Set(regionsAt(2, { from }).map((r) => r.type));
      assert.deepEqual([...types].sort(), ['J', 'T'], `from ${from}`);
    }
  });

  test('the two are locked together at every generation', () => {
    // 𝒥 has as many circular regions as 𝒥* has triangular ones, and four times as many
    // triangular regions as 𝒥* has circular ones. Both hold exactly, not approximately.
    for (let n = 0; n <= 5; n++) {
      const plain = regionsAt(n, {});
      const dual = regionsAt(n, { from: 'T' });
      const count = (rs, t) => rs.filter((r) => r.type === t).length;
      assert.equal(count(plain, 'J'), count(dual, 'T'), `circular/triangular at n=${n}`);
      assert.equal(count(plain, 'T'), 4 * count(dual, 'J'), `triangular/circular at n=${n}`);
    }
  });

  test('seed defaults to 𝒥, and so does regionsAt', () => {
    assert.equal(seed().type, 'J');
    assert.equal(regionsAt(3, {}).length, regionCount(3));
  });
});

describe('bailing out still returns a partition', () => {
  // The maxRegions valve returned `leaves.concat(regions)`, but `leaves` had already had
  // the current generation's new leaves pushed into it — so each below-resolution child
  // came back alongside the parent it was cut from. Not a hole: a double cover, and the
  // parent is drawn over its own children, which is why fine detail stopped appearing
  // past the generation where the valve first trips.
  const isInside = (p, b) => {
    const f = b.toFloat();
    if (b.isLine()) return p.x * f.x + p.y * f.y < b.lineOffset();
    return Math.hypot(p.x - f.x, p.y - f.y) < Math.abs(f.r);
  };
  const contains = (p, r) => {
    const g = geometry(r);
    if (g === null) return false;
    return g.constraints.every((c) => isInside(p, c) === isInside(g.interior, c));
  };

  /** Deterministic points strictly inside the seed region. */
  function sample(from, count) {
    const points = [];
    let s = 20260814;
    const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
    while (points.length < count) {
      const x = rnd();
      const y = rnd() * 1.3;
      if (from === 'T') {
        // above the semicircle, between the two vertical sides
        if (y > Math.sqrt(Math.max(0, x - x * x)) + 2e-3 && x > 2e-3 && x < 1 - 2e-3) {
          points.push({ x, y });
        }
      } else if (y > 2e-3) {
        points.push({ x: x * 1.4 - 0.2, y });
      }
    }
    return points;
  }

  for (const from of /** @type {('J'|'T')[]} */ (['J', 'T'])) {
    const name = from === 'T' ? '𝒥*' : '𝒥';

    test(`${name} covers exactly once when maxRegions trips`, () => {
      const bounds = { minX: -0.4, minY: -0.4, maxX: 1.4, maxY: 1.64 };
      // Small enough that the valve trips well before the requested generation.
      const regions = regionsAt(8, { from, bounds, minSize: 8 / 600, maxRegions: 600 });
      assert.ok(regions.length > 600, `expected an overshoot, got ${regions.length}`);
      for (const p of sample(from, 120)) {
        const hits = regions.filter((r) => contains(p, r)).length;
        assert.equal(hits, 1, `(${p.x.toFixed(3)}, ${p.y.toFixed(3)}) covered ${hits} times`);
      }
    });
  }
});
