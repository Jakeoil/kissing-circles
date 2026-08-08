// @ts-check

/**
 * Gaussian integers — the ring Z[i] of complex numbers a + bi with a, b integers.
 *
 * Backed by BigInt, so arithmetic is exact at any magnitude. In an integral
 * Apollonian packing the curvature-center products b*z live in this ring and stay
 * there forever under the Descartes recursion, which is the whole reason the packing
 * can be generated without a single floating-point operation.
 *
 * Instances are immutable. Every operation returns a new Gaussian.
 *
 * Ported from math/Gaussean.kt in the Android original, with two fixes: the backing
 * type is BigInt rather than Long (curvatures pass 2^53 by about depth 20), and the
 * hash/key is collision-free rather than `re + im`.
 */
export class Gaussian {
  /**
   * @param {bigint} re real part
   * @param {bigint} im imaginary part
   */
  constructor(re, im = 0n) {
    /** @type {bigint} */
    this.re = re;
    /** @type {bigint} */
    this.im = im;
    Object.freeze(this);
  }

  /**
   * Convenience constructor accepting numbers, for literals in source and tests.
   * @param {number|bigint} re
   * @param {number|bigint} im
   * @returns {Gaussian}
   */
  static of(re, im = 0) {
    return new Gaussian(BigInt(re), BigInt(im));
  }

  /** @param {Gaussian} g @returns {Gaussian} */
  add(g) {
    return new Gaussian(this.re + g.re, this.im + g.im);
  }

  /** @param {Gaussian} g @returns {Gaussian} */
  sub(g) {
    return new Gaussian(this.re - g.re, this.im - g.im);
  }

  /**
   * Complex multiplication: (a+bi)(c+di) = (ac-bd) + (ad+bc)i.
   * @param {Gaussian} g
   * @returns {Gaussian}
   */
  mul(g) {
    return new Gaussian(
      this.re * g.re - this.im * g.im,
      this.re * g.im + this.im * g.re,
    );
  }

  /**
   * Multiplication by a rational integer (not a complex one).
   * @param {bigint} n
   * @returns {Gaussian}
   */
  scale(n) {
    return new Gaussian(this.re * n, this.im * n);
  }

  /** @returns {Gaussian} */
  square() {
    return this.mul(this);
  }

  /** @returns {Gaussian} */
  neg() {
    return new Gaussian(-this.re, -this.im);
  }

  /** @returns {Gaussian} complex conjugate */
  conj() {
    return new Gaussian(this.re, -this.im);
  }

  /**
   * Squared modulus |z|^2 = re^2 + im^2. A rational integer, always exact —
   * which is what lets the tangency test in descartes.js avoid square roots.
   * @returns {bigint}
   */
  normSq() {
    return this.re * this.re + this.im * this.im;
  }

  /** @param {Gaussian} g @returns {boolean} */
  equals(g) {
    return this.re === g.re && this.im === g.im;
  }

  /** @returns {boolean} */
  isZero() {
    return this.re === 0n && this.im === 0n;
  }

  /**
   * A collision-free string key, for Set/Map deduplication of generated circles.
   * @returns {string}
   */
  key() {
    return `${this.re},${this.im}`;
  }

  /** @returns {{x: number, y: number}} lossy float view, for rendering only */
  toFloat() {
    return { x: Number(this.re), y: Number(this.im) };
  }

  /** @returns {string} */
  toString() {
    return this.im < 0n
      ? `(${this.re}-${-this.im}i)`
      : `(${this.re}+${this.im}i)`;
  }
}

/** @type {Gaussian} */
export const ZERO = Gaussian.of(0, 0);
/** @type {Gaussian} */
export const ONE = Gaussian.of(1, 0);
/** @type {Gaussian} */
export const I = Gaussian.of(0, 1);

/**
 * Sum of a list of Gaussian integers.
 * @param {...Gaussian} gs
 * @returns {Gaussian}
 */
export function sum(...gs) {
  return gs.reduce((acc, g) => acc.add(g), ZERO);
}
