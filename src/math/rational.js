// @ts-check

/**
 * Exact rationals over BigInt.
 *
 * Needed in exactly one place: constructing a root quadruple from four curvatures.
 * The circles of a packing live in Z and Z[i], but the intermediate placement —
 * distances between centers, and the coordinates before the configuration is
 * translated into its integral position — passes through the rationals. Doing that
 * arithmetic in floating point would leave the integrality test at the end deciding
 * on rounding noise rather than on arithmetic.
 *
 * Values are always normalized: denominator positive, numerator and denominator
 * coprime. Instances are immutable.
 */

/**
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint} greatest common divisor, non-negative
 */
export function gcd(a, b) {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

/**
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint} least common multiple, non-negative
 */
export function lcm(a, b) {
  if (a === 0n || b === 0n) return 0n;
  const g = gcd(a, b);
  const l = (a / g) * b;
  return l < 0n ? -l : l;
}

/**
 * Integer square root of a non-negative BigInt.
 * @param {bigint} n
 * @returns {bigint}
 */
function isqrt(n) {
  if (n < 0n) throw new Error('isqrt of a negative number');
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}

export class Rational {
  /**
   * @param {bigint} n numerator
   * @param {bigint} d denominator
   */
  constructor(n, d = 1n) {
    if (d === 0n) throw new Error('rational with zero denominator');
    if (d < 0n) {
      n = -n;
      d = -d;
    }
    const g = gcd(n, d) || 1n;
    /** @type {bigint} */
    this.n = n / g;
    /** @type {bigint} */
    this.d = d / g;
    Object.freeze(this);
  }

  /** @param {number|bigint} v @returns {Rational} */
  static of(v) {
    return new Rational(BigInt(v), 1n);
  }

  /** @param {Rational} o @returns {Rational} */
  add(o) {
    return new Rational(this.n * o.d + o.n * this.d, this.d * o.d);
  }

  /** @param {Rational} o @returns {Rational} */
  sub(o) {
    return new Rational(this.n * o.d - o.n * this.d, this.d * o.d);
  }

  /** @param {Rational} o @returns {Rational} */
  mul(o) {
    return new Rational(this.n * o.n, this.d * o.d);
  }

  /** @param {Rational} o @returns {Rational} */
  div(o) {
    if (o.n === 0n) throw new Error('division by zero');
    return new Rational(this.n * o.d, this.d * o.n);
  }

  /** @returns {Rational} */
  neg() {
    return new Rational(-this.n, this.d);
  }

  /** @returns {Rational} */
  abs() {
    return this.n < 0n ? this.neg() : this;
  }

  /** @returns {Rational} */
  square() {
    return this.mul(this);
  }

  /**
   * Exact square root, or null when the value is not the square of a rational.
   * @returns {Rational|null}
   */
  sqrt() {
    if (this.n < 0n) return null;
    const rn = isqrt(this.n);
    const rd = isqrt(this.d);
    if (rn * rn !== this.n || rd * rd !== this.d) return null;
    return new Rational(rn, rd);
  }

  /** @returns {boolean} */
  isZero() {
    return this.n === 0n;
  }

  /** @returns {boolean} */
  isInteger() {
    return this.d === 1n;
  }

  /** @param {Rational} o @returns {boolean} */
  equals(o) {
    return this.n === o.n && this.d === o.d;
  }

  /** @returns {number} lossy */
  toNumber() {
    return Number(this.n) / Number(this.d);
  }

  /** @returns {string} */
  toString() {
    return this.d === 1n ? `${this.n}` : `${this.n}/${this.d}`;
  }
}

export const ZERO = new Rational(0n, 1n);
export const ONE = new Rational(1n, 1n);
