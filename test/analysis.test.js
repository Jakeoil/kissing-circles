// @ts-check

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, MODULUS } from '../src/math/analysis.js';
import { generate } from '../src/math/packing.js';
import { ROOTS, rootFromCurvatures } from '../src/math/descartes.js';

describe('curvature analysis', () => {
  const a = analyze(ROOTS.apollonian.quad, 200n);

  test('finds the residues the classic packing occupies', () => {
    assert.deepEqual(a.present, [2, 3, 6, 11, 14, 15, 18, 23]);
    assert.equal(a.present.length + a.absent.length, MODULUS);
  });

  test('the impossible residues really never occur', () => {
    const p = generate(ROOTS.apollonian.quad, { maxCurvature: 4000n });
    const seen = new Set();
    for (let i = 0; i < p.count; i++) {
      if (p.circles[i].b > 0n) seen.add(Number(p.circles[i].b % 24n));
    }
    for (const r of a.absent) {
      assert.ok(!seen.has(r), `residue ${r} was supposed to be impossible`);
    }
  });

  test('finds the local-global exceptions below 200', () => {
    // 78 and 159 are congruent to admissible classes (6 and 15 mod 24) and yet are
    // not curvatures of this packing. Exceptions like these are the reason the
    // local-global conjecture is false.
    assert.deepEqual(a.missing, [78n, 159n]);
    assert.equal(Number(78n % 24n), 6);
    assert.equal(Number(159n % 24n), 15);
    assert.ok(a.present.includes(6) && a.present.includes(15));
  });

  test('every reported miss is genuinely absent and genuinely admissible', () => {
    const p = generate(ROOTS.apollonian.quad, { maxCurvature: 200n });
    const seen = new Set();
    for (let i = 0; i < p.count; i++) if (p.circles[i].b > 0n) seen.add(p.circles[i].b);

    for (const n of a.missing) {
      assert.ok(!seen.has(n), `${n} was reported missing but does occur`);
      assert.ok(a.present.includes(Number(n % 24n)), `${n} is not in an admissible class`);
    }
  });

  test('pruning at the bound does not lose curvatures below it', () => {
    // The whole analysis rests on curvature increasing down a branch, so that
    // stopping at N still finds everything at or below N. Check it against a run
    // with twice the headroom.
    const tight = generate(ROOTS.apollonian.quad, { maxCurvature: 500n });
    const loose = generate(ROOTS.apollonian.quad, { maxCurvature: 1000n });

    const below = (/** @type {import('../src/math/packing.js').Packing} */ p) => {
      const s = new Set();
      for (let i = 0; i < p.count; i++) {
        if (p.circles[i].b > 0n && p.circles[i].b <= 500n) s.add(p.circles[i].b);
      }
      return [...s].sort((x, y) => (x < y ? -1 : 1)).join(',');
    };

    assert.equal(below(tight), below(loose));
  });

  test('per-residue tallies add up', () => {
    for (const row of a.perResidue) {
      assert.ok(a.present.includes(row.residue));
      assert.ok(row.occurring <= row.possible);
      assert.ok(row.possible > 0);
    }
    const occurring = a.perResidue.reduce((s, r) => s + r.occurring, 0);
    assert.equal(occurring, a.distinct, 'every distinct curvature lands in one class');

    const possible = a.perResidue.reduce((s, r) => s + r.possible, 0);
    assert.equal(possible - occurring, a.missing.length);
  });

  test('the histogram covers every distinct curvature exactly once', () => {
    const total = a.histogram.reduce((s, b) => s + b.count, 0);
    assert.equal(total, a.distinct);
    for (const band of a.histogram) assert.ok(band.to >= band.from);
  });

  test('reports what it generated', () => {
    assert.equal(a.maxCurvature, 200n);
    assert.ok(a.circles > a.distinct, 'many circles share a curvature');
    assert.ok(a.ms >= 0);
  });

  test('a different packing occupies different residues', () => {
    const r = rootFromCurvatures([-3, 5, 8, 8]);
    assert.ok(r.ok);
    const other = analyze(r.quad, 200n);
    assert.notDeepEqual(other.present, a.present);
    assert.ok(other.present.length > 0);
    // Same invariant: nothing outside the present classes ever shows up.
    assert.equal(other.present.length + other.absent.length, MODULUS);
  });

  test('scales to a useful bound in reasonable time', () => {
    const big = analyze(ROOTS.apollonian.quad, 5000n);
    assert.ok(big.distinct > 1000, `only ${big.distinct} distinct curvatures`);
    assert.deepEqual(big.present, a.present, 'the residues do not change with the bound');
    // Every miss below 200 is still a miss with more headroom.
    for (const n of a.missing) assert.ok(big.missing.includes(n));
  });
});
