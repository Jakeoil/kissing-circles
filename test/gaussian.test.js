// @ts-check

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Gaussian, ZERO, ONE, I, sum } from '../src/math/gaussian.js';

describe('Gaussian', () => {
  test('addition', () => {
    // The case the Kotlin GausseanTest tried to make, before it failed to compile.
    const a = Gaussian.of(1, 2);
    const b = Gaussian.of(2, 1);
    assert.ok(a.add(b).equals(Gaussian.of(3, 3)));
  });

  test('subtraction actually subtracts', () => {
    // SoddyCircle.minus in the Kotlin original computed `b + c.b`. Guard against
    // reintroducing that.
    const a = Gaussian.of(5, 7);
    const b = Gaussian.of(2, 3);
    assert.ok(a.sub(b).equals(Gaussian.of(3, 4)));
    assert.ok(a.sub(a).equals(ZERO));
  });

  test('complex multiplication', () => {
    assert.ok(I.mul(I).equals(Gaussian.of(-1, 0)), 'i^2 = -1');
    assert.ok(Gaussian.of(1, 2).mul(Gaussian.of(3, 4)).equals(Gaussian.of(-5, 10)));
    assert.ok(Gaussian.of(7, -3).mul(ONE).equals(Gaussian.of(7, -3)));
  });

  test('square matches multiplication by self', () => {
    const g = Gaussian.of(2, 3);
    assert.ok(g.square().equals(g.mul(g)));
    assert.ok(g.square().equals(Gaussian.of(-5, 12)));
  });

  test('scaling by a rational integer', () => {
    assert.ok(Gaussian.of(2, -3).scale(4n).equals(Gaussian.of(8, -12)));
  });

  test('squared modulus', () => {
    assert.equal(Gaussian.of(3, 4).normSq(), 25n);
    assert.equal(ZERO.normSq(), 0n);
    assert.equal(Gaussian.of(-3, -4).normSq(), 25n);
  });

  test('conjugate and negation', () => {
    assert.ok(Gaussian.of(3, 4).conj().equals(Gaussian.of(3, -4)));
    assert.ok(Gaussian.of(3, 4).neg().equals(Gaussian.of(-3, -4)));
  });

  test('keys do not collide on the anti-diagonal', () => {
    // Gaussean.hashCode() in Kotlin returned (re + im), so 1+3i, 2+2i and 3+i all
    // hashed identically. Deduplication during generation depends on this working.
    const keys = new Set([
      Gaussian.of(1, 3).key(),
      Gaussian.of(2, 2).key(),
      Gaussian.of(3, 1).key(),
      Gaussian.of(4, 0).key(),
      Gaussian.of(0, 4).key(),
    ]);
    assert.equal(keys.size, 5);
  });

  test('immutability', () => {
    const g = Gaussian.of(1, 1);
    assert.throws(() => {
      // @ts-expect-error deliberately violating the frozen instance
      g.re = 99n;
    });
    g.add(Gaussian.of(5, 5));
    assert.ok(g.equals(Gaussian.of(1, 1)), 'operations return new instances');
  });

  test('exactness past the float integer limit', () => {
    // 2^53 + 1 is not representable as a double. This is the entire reason the
    // representation is BigInt rather than Number.
    const big = 9007199254740993n;
    const g = Gaussian.of(big, big);
    assert.equal(g.add(Gaussian.of(1, 0)).re, big + 1n);
    assert.notEqual(g.add(Gaussian.of(1, 0)).re, g.re);
    assert.equal(g.normSq(), 2n * big * big);
  });

  test('sum of many', () => {
    assert.ok(
      sum(Gaussian.of(1, 1), Gaussian.of(2, 2), Gaussian.of(3, 3)).equals(
        Gaussian.of(6, 6),
      ),
    );
    assert.ok(sum().equals(ZERO));
  });
});
