// @ts-check

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Circle } from '../src/math/circle.js';
import { Gaussian } from '../src/math/gaussian.js';
import { ROOTS, validateQuad, areTangent } from '../src/math/descartes.js';

describe('Circle', () => {
  test('the augmented invariant holds for every root circle', () => {
    for (const root of Object.values(ROOTS)) {
      for (const c of root.quad) {
        assert.ok(
          c.isValid(),
          `${root.name}: ${c} violates |bz|^2 - b*bbar = 1`,
        );
      }
    }
  });

  test('fromCurvature derives the co-curvature', () => {
    // The curvature-3 circle of the classic packing: center (0, 2/3), so bz = 2i.
    const c = Circle.fromCurvature(3, 0, 2);
    assert.equal(c.bbar, 1n);
    assert.ok(c.isValid());
    assert.ok(c.equals(Circle.of(1, 3, 0, 2)));
  });

  test('fromCurvature rejects non-integral co-curvature', () => {
    assert.throws(() => Circle.fromCurvature(5, 0, 2), /not divisible/);
  });

  test('fromCurvature refuses lines', () => {
    assert.throws(() => Circle.fromCurvature(0, 0, 1), /not determined/);
  });

  describe('spawn — the Descartes reflection', () => {
    const [outer, left, right, top] = ROOTS.apollonian.quad;

    test('reflects the curvature-3 circle onto its mirror image', () => {
      const bottom = top.spawn(outer, left, right);
      assert.equal(bottom.b, 3n);
      assert.ok(bottom.bz.equals(Gaussian.of(0, -2)), 'center (0, -2/3)');
      assert.ok(bottom.isValid());
    });

    test('replacing the bounding circle gives curvature 15', () => {
      const c = outer.spawn(left, right, top);
      assert.equal(c.b, 15n);
      assert.ok(c.bz.equals(Gaussian.of(0, 4)), 'center (0, 4/15)');
      assert.ok(c.isValid());
    });

    test('replacing a curvature-2 circle gives curvature 6', () => {
      const c = left.spawn(outer, right, top);
      assert.equal(c.b, 6n);
      assert.ok(c.isValid());
    });

    test('the spawned circle is tangent to all three of its parents', () => {
      const quad = ROOTS.apollonian.quad;
      for (let i = 0; i < 4; i++) {
        const rest = quad.filter((_, j) => j !== i);
        const born = quad[i].spawn(rest[0], rest[1], rest[2]);
        for (const parent of rest) {
          assert.ok(
            areTangent(born, parent),
            `spawned ${born} is not tangent to ${parent}`,
          );
        }
      }
    });

    test('the spawned circle forms a valid quadruple with its parents', () => {
      const quad = ROOTS.apollonian.quad;
      for (let i = 0; i < 4; i++) {
        const rest = quad.filter((_, j) => j !== i);
        const born = quad[i].spawn(rest[0], rest[1], rest[2]);
        const result = validateQuad([...rest, born]);
        assert.ok(result.ok, result.errors.join('; '));
      }
    });

    test('spawning twice returns the original circle', () => {
      const quad = ROOTS.apollonian.quad;
      for (let i = 0; i < 4; i++) {
        const rest = quad.filter((_, j) => j !== i);
        const there = quad[i].spawn(rest[0], rest[1], rest[2]);
        const back = there.spawn(rest[0], rest[1], rest[2]);
        assert.ok(back.equals(quad[i]), 'the jump is an involution');
      }
    });
  });

  describe('lines', () => {
    const [line0, line2, unit] = ROOTS.strip.quad;

    test('a line is recognized and has infinite radius', () => {
      assert.ok(line0.isLine());
      assert.equal(line0.toFloat().r, Infinity);
      assert.ok(!unit.isLine());
    });

    test('line offsets place the strip at y = 0 and y = 2', () => {
      assert.equal(line0.lineOffset(), 0);
      assert.equal(line2.lineOffset(), 2);
    });

    test('lineOffset refuses actual circles', () => {
      assert.throws(() => unit.lineOffset(), /only defined for lines/);
    });

    test('lines survive the recursion without a special case', () => {
      // This is what the Kotlin render() bailed out of with `// do something here`.
      const quad = ROOTS.strip.quad;
      const born = quad[2].spawn(quad[0], quad[1], quad[3]);
      assert.ok(born.isValid());
      assert.ok(validateQuad([quad[0], quad[1], quad[3], born]).ok);
    });
  });

  describe('float view', () => {
    test('center and radius of a curvature-3 circle', () => {
      const f = Circle.of(1, 3, 0, 2).toFloat();
      assert.equal(f.x, 0);
      assert.ok(Math.abs(f.y - 2 / 3) < 1e-15);
      assert.ok(Math.abs(f.r - 1 / 3) < 1e-15);
    });

    test('the bounding circle has negative radius', () => {
      const f = ROOTS.apollonian.quad[0].toFloat();
      assert.equal(f.r, -1);
      assert.equal(f.x, 0);
      assert.equal(f.y, 0);
    });

    test('the result is cached', () => {
      const c = Circle.of(1, 3, 0, 2);
      assert.equal(c.toFloat(), c.toFloat(), 'same object identity');
    });

    test('float conversion stays sane past 2^53', () => {
      // Generation is exact here; only the rendered radius loses precision, and it
      // is far below a pixel by this point.
      const b = 9007199254740993n;
      const c = new Circle(0n, b, new Gaussian(1n, 0n));
      const f = c.toFloat();
      assert.ok(f.r > 0 && f.r < 1e-15);
      assert.ok(Number.isFinite(f.x));
    });
  });

  test('componentwise arithmetic', () => {
    const a = Circle.of(1, 2, 3, 4);
    const b = Circle.of(5, 6, 7, 8);
    assert.ok(a.add(b).equals(Circle.of(6, 8, 10, 12)));
    assert.ok(b.sub(a).equals(Circle.of(4, 4, 4, 4)));
    assert.ok(a.scale(3n).equals(Circle.of(3, 6, 9, 12)));
  });

  test('keys distinguish circles that share a curvature', () => {
    const keys = new Set(
      [
        Circle.of(0, 2, -1, 0),
        Circle.of(0, 2, 1, 0),
        Circle.of(1, 3, 0, 2),
        Circle.of(1, 3, 0, -2),
      ].map((c) => c.key()),
    );
    assert.equal(keys.size, 4);
  });
});

describe('rescale — the plane scaled about the origin', () => {
  test('halving the curvature doubles the radius and keeps the invariant', () => {
    // |bz|² − b·bbar = 9 − 8 = 1, so this is a genuine circle: bend 4, centre (3/4, 0).
    const c = Circle.of(2, 4, 3, 0);
    assert.ok(c.isValid(), 'the fixture is a circle to begin with');

    const half = /** @type {Circle} */ (c.rescale(2n));
    assert.equal(half.b, 2n, 'curvature halves');
    assert.ok(half.bz.equals(c.bz), 'the curvature-center product is unchanged');
    assert.equal(half.bbar, 4n, 'the co-curvature doubles');
    assert.ok(half.isValid(), 'and the circle is still a circle');
  });

  test('the center and radius both double', () => {
    const c = Circle.of(2, 4, 3, 0);
    const before = c.toFloat();
    const after = /** @type {Circle} */ (c.rescale(2n)).toFloat();
    assert.ok(Math.abs(after.r - 2 * before.r) < 1e-15);
    assert.ok(Math.abs(after.x - 2 * before.x) < 1e-15);
    assert.ok(Math.abs(after.y - 2 * before.y) < 1e-15);
  });

  test('refuses a scale that would leave the integers', () => {
    assert.equal(Circle.of(1, 3, 0, 2).rescale(2n), null, '3 is not divisible by 2');
    assert.equal(Circle.of(2, 4, 3, 0).rescale(0n), null);
  });

  test('a line rescales to a line', () => {
    const line = ROOTS.strip.quad[0];
    const scaled = /** @type {Circle} */ (line.rescale(1n));
    assert.ok(scaled.isLine());
    assert.ok(scaled.isValid());
  });

  test('rescaling by 1 changes nothing', () => {
    for (const c of ROOTS.apollonian.quad) {
      assert.ok(/** @type {Circle} */ (c.rescale(1n)).equals(c));
    }
  });
});
