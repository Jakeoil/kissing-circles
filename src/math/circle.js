// @ts-check

import { Gaussian } from './gaussian.js';

/**
 * A circle (or line) in augmented curvature-center coordinates.
 *
 *     (bbar, b, bz)   where bz = b * z is a Gaussian integer
 *
 *   b    curvature, 1/r. Signed: negative for a circle containing the packing,
 *        zero for a straight line.
 *   bz   curvature times center. Held exactly in Z[i].
 *   bbar co-curvature: the curvature of this circle's image under inversion in the
 *        unit circle, z -> 1/conj(z).
 *
 * Every circle satisfies the invariant
 *
 *     |bz|^2 - b * bbar = 1
 *
 * The old Kotlin SoddyCircle carried only (b, bz) and gave up on b = 0 with a
 * `// do something here` comment. Carrying bbar as well costs one BigInt per circle
 * and makes lines fall out of the recursion with no special case at all — a line is
 * simply a row with b = 0, and bz is then its unit normal.
 *
 * Instances are immutable.
 */
export class Circle {
  /**
   * @param {bigint} bbar co-curvature
   * @param {bigint} b curvature
   * @param {Gaussian} bz curvature times center
   */
  constructor(bbar, b, bz) {
    /** @type {bigint} */
    this.bbar = bbar;
    /** @type {bigint} */
    this.b = b;
    /** @type {Gaussian} */
    this.bz = bz;
    /** @type {{x: number, y: number, r: number}|null} */
    this._float = null;
    Object.seal(this);
  }

  /**
   * Convenience constructor from plain numbers.
   * @param {number|bigint} bbar
   * @param {number|bigint} b
   * @param {number|bigint} re real part of b*z
   * @param {number|bigint} im imaginary part of b*z
   * @returns {Circle}
   */
  static of(bbar, b, re, im) {
    return new Circle(BigInt(bbar), BigInt(b), Gaussian.of(re, im));
  }

  /**
   * Build a circle from its curvature and center, deriving bbar from the invariant.
   * Only valid when b != 0 and the invariant divides exactly; throws otherwise.
   * @param {number|bigint} b
   * @param {number|bigint} re real part of b*z
   * @param {number|bigint} im imaginary part of b*z
   * @returns {Circle}
   */
  static fromCurvature(b, re, im) {
    const bb = BigInt(b);
    if (bb === 0n) {
      throw new Error('bbar is not determined by (b, bz) for a line; use Circle.of');
    }
    const bz = Gaussian.of(re, im);
    const num = bz.normSq() - 1n;
    if (num % bb !== 0n) {
      throw new Error(
        `no integral co-curvature for b=${bb}, bz=${bz}: (|bz|^2-1) is not divisible by b`,
      );
    }
    return new Circle(num / bb, bb, bz);
  }

  /**
   * The Descartes reflection, and the engine of the whole project.
   *
   * Given a Descartes quadruple containing `this` and the three circles c1, c2, c3,
   * returns the *other* circle tangent to all of c1, c2, c3 — the reflection of
   * `this` in that triple:
   *
   *     w' = 2*(w1 + w2 + w3) - w
   *
   * componentwise across all of (bbar, b, bz).
   *
   * This is Vieta jumping. Both circles tangent to a given triple are roots of the
   * same Descartes quadratic, and the roots sum to 2*(w1+w2+w3), so the second root
   * follows from the first by subtraction alone. No square root, no division, no
   * floating point — which is why an integral packing stays exactly integral to
   * unlimited depth.
   *
   * This is `SoddyCircle.complement()` from the Kotlin original, extended to the
   * augmented row.
   *
   * @param {Circle} c1
   * @param {Circle} c2
   * @param {Circle} c3
   * @returns {Circle}
   */
  spawn(c1, c2, c3) {
    return new Circle(
      2n * (c1.bbar + c2.bbar + c3.bbar) - this.bbar,
      2n * (c1.b + c2.b + c3.b) - this.b,
      c1.bz.add(c2.bz).add(c3.bz).scale(2n).sub(this.bz),
    );
  }

  /**
   * Does this row describe an actual circle or line?
   *     |bz|^2 - b*bbar = 1
   * @returns {boolean}
   */
  isValid() {
    return this.bz.normSq() - this.b * this.bbar === 1n;
  }

  /** @returns {boolean} true when this is a straight line rather than a circle */
  isLine() {
    return this.b === 0n;
  }

  /**
   * True when the packing lies inside this circle rather than outside it — the
   * bounding circle of a bounded packing.
   * @returns {boolean}
   */
  isBounding() {
    return this.b < 0n;
  }

  /** @param {Circle} c @returns {Circle} componentwise sum */
  add(c) {
    return new Circle(this.bbar + c.bbar, this.b + c.b, this.bz.add(c.bz));
  }

  /** @param {Circle} c @returns {Circle} componentwise difference */
  sub(c) {
    return new Circle(this.bbar - c.bbar, this.b - c.b, this.bz.sub(c.bz));
  }

  /**
   * The same circle after scaling the plane about the origin by k, that is z ↦ k·z.
   *
   * Radius multiplies by k, so curvature divides by it. The curvature-center product
   * `b·z` is *unchanged* — b shrinks by exactly as much as z grows — and the
   * co-curvature multiplies by k. The invariant survives untouched, since
   * `(b/k)·(k·b̄) = b·b̄`.
   *
   * This is what "lowest terms" means for a configuration. Every curvature in a
   * Schmidt arrangement is even, so the whole thing is 2 × a primitive one, and
   * rescaling by 2 reduces it — the same picture at twice the size, which after
   * refitting is the same picture. Only the numbers change.
   *
   * @param {bigint} k
   * @returns {Circle|null} null when the curvature is not divisible by k
   */
  rescale(k) {
    if (k === 0n) return null;
    if (this.b % k !== 0n) return null;
    return new Circle(this.bbar * k, this.b / k, this.bz);
  }

  /** @param {bigint} n @returns {Circle} */
  scale(n) {
    return new Circle(this.bbar * n, this.b * n, this.bz.scale(n));
  }

  /** @param {Circle} c @returns {boolean} */
  equals(c) {
    return this.b === c.b && this.bbar === c.bbar && this.bz.equals(c.bz);
  }

  /**
   * Collision-free key for deduplicating generated circles.
   * @returns {string}
   */
  key() {
    return `${this.bbar}|${this.b}|${this.bz.key()}`;
  }

  /**
   * Float view for rendering: center (x, y) and radius r in world units.
   * Computed once and cached — this is the single point where exactness is traded
   * for speed, and it happens per circle rather than per operation.
   *
   * For a line, r is Infinity and (x, y) is the unit normal rather than a center;
   * see lineOffset() for the other half of a line's description.
   *
   * @returns {{x: number, y: number, r: number}}
   */
  toFloat() {
    if (this._float === null) {
      if (this.b === 0n) {
        this._float = {
          x: Number(this.bz.re),
          y: Number(this.bz.im),
          r: Infinity,
        };
      } else {
        const b = Number(this.b);
        // Dividing 0 by a negative curvature yields -0, which compares unequal to 0
        // under Object.is and reads badly in a coordinate readout. Normalise it.
        const zero = (/** @type {number} */ v) => (v === 0 ? 0 : v);
        this._float = {
          x: zero(Number(this.bz.re) / b),
          y: zero(Number(this.bz.im) / b),
          r: 1 / b,
        };
      }
    }
    return this._float;
  }

  /**
   * For a line (b = 0): its signed distance from the origin along the normal bz.
   * The line is { z : Re(conj(bz) * z) = offset }. Derived from bbar = 2 * offset.
   * @returns {number}
   */
  lineOffset() {
    if (this.b !== 0n) throw new Error('lineOffset is only defined for lines');
    return Number(this.bbar) / 2;
  }

  /** @returns {string} */
  toString() {
    if (this.isLine()) {
      return `line n=${this.bz} d=${this.lineOffset()}`;
    }
    const f = this.toFloat();
    return `b=${this.b} z=(${f.x.toFixed(6)}, ${f.y.toFixed(6)}) r=${f.r.toFixed(6)}`;
  }
}
