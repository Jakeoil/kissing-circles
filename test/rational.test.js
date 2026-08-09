// @ts-check

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Rational, gcd, lcm } from '../src/math/rational.js';

describe('gcd and lcm', () => {
  test('gcd', () => {
    assert.equal(gcd(12n, 18n), 6n);
    assert.equal(gcd(-12n, 18n), 6n);
    assert.equal(gcd(7n, 13n), 1n);
    assert.equal(gcd(0n, 5n), 5n);
  });

  test('lcm', () => {
    assert.equal(lcm(4n, 6n), 12n);
    assert.equal(lcm(3n, 5n), 15n);
    assert.equal(lcm(0n, 5n), 0n);
    assert.equal(lcm(-4n, 6n), 12n);
  });
});

describe('Rational', () => {
  test('normalizes on construction', () => {
    const r = new Rational(6n, -8n);
    assert.equal(r.n, -3n);
    assert.equal(r.d, 4n);
  });

  test('rejects a zero denominator', () => {
    assert.throws(() => new Rational(1n, 0n));
  });

  test('arithmetic', () => {
    const a = new Rational(1n, 3n);
    const b = new Rational(1n, 6n);
    assert.ok(a.add(b).equals(new Rational(1n, 2n)));
    assert.ok(a.sub(b).equals(new Rational(1n, 6n)));
    assert.ok(a.mul(b).equals(new Rational(1n, 18n)));
    assert.ok(a.div(b).equals(new Rational(2n, 1n)));
    assert.ok(a.neg().equals(new Rational(-1n, 3n)));
    assert.ok(a.neg().abs().equals(a));
  });

  test('division by zero is refused', () => {
    assert.throws(() => Rational.of(1).div(Rational.of(0)));
  });

  test('exact square roots', () => {
    assert.ok(new Rational(4n, 9n).sqrt()?.equals(new Rational(2n, 3n)));
    assert.ok(new Rational(0n, 1n).sqrt()?.equals(new Rational(0n, 1n)));
    assert.ok(new Rational(1n, 1n).sqrt()?.equals(new Rational(1n, 1n)));
  });

  test('non-squares give null rather than a rounded answer', () => {
    assert.equal(new Rational(2n, 1n).sqrt(), null);
    assert.equal(new Rational(1n, 2n).sqrt(), null);
    assert.equal(new Rational(-4n, 1n).sqrt(), null);
  });

  test('stays exact past the double integer limit', () => {
    const big = 9007199254740993n;
    const r = new Rational(big, 1n).add(new Rational(1n, 1n));
    assert.equal(r.n, big + 1n);
  });

  test('isInteger', () => {
    assert.ok(new Rational(8n, 4n).isInteger());
    assert.ok(!new Rational(1n, 3n).isInteger());
  });
});
