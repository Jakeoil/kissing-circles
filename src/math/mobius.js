// @ts-check

import { Gaussian, ZERO, ONE, I as IMAG } from './gaussian.js';
import { Circle } from './circle.js';

/**
 * Möbius transformations over the Gaussian integers, and their action on circles.
 *
 * The Apollonian recursion never needed matrices: reflecting a circle in a triple is
 * subtraction. Schmidt's construction is nothing but matrices, so this module exists,
 * and it has to be exact — an arrangement that drifts off Z[i] is worthless within a
 * few generations.
 *
 * The trick that makes it exact is representing a circle as a Hermitian matrix. A
 * circle or line is the solution set of
 *
 *     A|z|² + conj(B)·z + B·conj(z) + C = 0,      A, C real
 *
 * which is the matrix `[[A, B], [conj(B), C]]`. Our augmented coordinates are already
 * exactly that:
 *
 *     A = b        B = −b·z        C = b̄
 *
 * A Möbius map then acts by conjugation. Using the **adjugate** rather than the
 * inverse avoids dividing by the determinant, so every entry stays a Gaussian integer:
 *
 *     M ↦ adj(g)* · M · adj(g)
 *
 * For Schmidt's generators this preserves `|bz|² − b·b̄ = 1` exactly, with no scaling
 * factor — so `Circle.isValid` is a free check on every step. See plan.md §8.2.
 *
 * Nothing here touches the DOM, and nothing here is float.
 */

export class Mobius {
  /**
   * The map `z ↦ (a·z + b) / (c·z + d)`.
   * @param {Gaussian} a
   * @param {Gaussian} b
   * @param {Gaussian} c
   * @param {Gaussian} d
   */
  constructor(a, b, c, d) {
    /** @type {Gaussian} */ this.a = a;
    /** @type {Gaussian} */ this.b = b;
    /** @type {Gaussian} */ this.c = c;
    /** @type {Gaussian} */ this.d = d;
    Object.freeze(this);
  }

  /**
   * Convenience constructor from eight integers, entry by entry.
   * @param {number|bigint} ar @param {number|bigint} ai
   * @param {number|bigint} br @param {number|bigint} bi
   * @param {number|bigint} cr @param {number|bigint} ci
   * @param {number|bigint} dr @param {number|bigint} di
   * @returns {Mobius}
   */
  static of(ar, ai, br, bi, cr, ci, dr, di) {
    return new Mobius(
      Gaussian.of(ar, ai),
      Gaussian.of(br, bi),
      Gaussian.of(cr, ci),
      Gaussian.of(dr, di),
    );
  }

  /** @returns {Gaussian} ad − bc */
  det() {
    return this.a.mul(this.d).sub(this.b.mul(this.c));
  }

  /**
   * The adjugate: the inverse scaled by the determinant, so it stays integral.
   * @returns {Mobius}
   */
  adjugate() {
    return new Mobius(this.d, this.b.neg(), this.c.neg(), this.a);
  }

  /** @param {Mobius} m @returns {Mobius} this ∘ m, as matrix multiplication */
  mul(m) {
    return new Mobius(
      this.a.mul(m.a).add(this.b.mul(m.c)),
      this.a.mul(m.b).add(this.b.mul(m.d)),
      this.c.mul(m.a).add(this.d.mul(m.c)),
      this.c.mul(m.b).add(this.d.mul(m.d)),
    );
  }

  /** @returns {Mobius} entrywise complex conjugate */
  conjugate() {
    return new Mobius(this.a.conj(), this.b.conj(), this.c.conj(), this.d.conj());
  }

  /** @returns {Mobius} conjugate transpose */
  star() {
    return new Mobius(this.a.conj(), this.c.conj(), this.b.conj(), this.d.conj());
  }

  /** @param {Gaussian} k @returns {Mobius} */
  scale(k) {
    return new Mobius(
      this.a.mul(k),
      this.b.mul(k),
      this.c.mul(k),
      this.d.mul(k),
    );
  }

  /** @param {Mobius} m @returns {boolean} equal entry by entry */
  equals(m) {
    return (
      this.a.equals(m.a) && this.b.equals(m.b) && this.c.equals(m.c) && this.d.equals(m.d)
    );
  }

  /**
   * Equal as Möbius maps, which is equality up to a scalar.
   *
   * `[[1,0],[0,1]]` and `[[i,0],[0,i]]` are different matrices and the same map — a
   * distinction that matters, since Schmidt's identities in Lemma 1.1 hold
   * projectively, not entrywise.
   *
   * @param {Mobius} m
   * @returns {boolean}
   */
  equalsProjective(m) {
    for (const k of [ONE, ONE.neg(), IMAG, IMAG.neg()]) {
      if (this.equals(m.scale(k))) return true;
    }
    return false;
  }

  /**
   * Carry a circle along this map.
   *
   * Returns null if the image is not a circle in our sense — which should not happen
   * for a unimodular map, and is worth surfacing rather than silently rounding if it
   * ever does.
   *
   * @param {Circle} circle
   * @returns {Circle|null}
   */
  applyTo(circle) {
    // M = [[b, −bz], [−conj(bz), bbar]]
    const m11 = new Gaussian(circle.b, 0n);
    const m12 = circle.bz.neg();
    const m21 = circle.bz.conj().neg();
    const m22 = new Gaussian(circle.bbar, 0n);

    const h = this.adjugate();
    const hs = h.star();

    // hs · M
    const p11 = hs.a.mul(m11).add(hs.b.mul(m21));
    const p12 = hs.a.mul(m12).add(hs.b.mul(m22));
    const p21 = hs.c.mul(m11).add(hs.d.mul(m21));
    const p22 = hs.c.mul(m12).add(hs.d.mul(m22));

    // (hs · M) · h
    const q11 = p11.mul(h.a).add(p12.mul(h.c));
    const q12 = p11.mul(h.b).add(p12.mul(h.d));
    const q22 = p21.mul(h.b).add(p22.mul(h.d));

    // The diagonal must come back real, or this is not a circle.
    if (q11.im !== 0n || q22.im !== 0n) return null;

    return new Circle(q22.re, q11.re, q12.neg());
  }

  /**
   * Where this map sends a point, in floating point.
   *
   * Everything else here is exact; this is not, and is not meant to be. It exists to
   * answer orientation questions — which side of a boundary a region lies on — where
   * a sample point somewhere in the interior settles the matter and precision is
   * irrelevant. Never use it to place a circle.
   *
   * @param {number} px
   * @param {number} py
   * @returns {{x: number, y: number}|null} null at the pole
   */
  applyToPoint(px, py) {
    const ar = Number(this.a.re), ai = Number(this.a.im);
    const br = Number(this.b.re), bi = Number(this.b.im);
    const cr = Number(this.c.re), ci = Number(this.c.im);
    const dr = Number(this.d.re), di = Number(this.d.im);

    const nr = ar * px - ai * py + br;
    const ni = ar * py + ai * px + bi;
    const mr = cr * px - ci * py + dr;
    const mi = cr * py + ci * px + di;

    const q = mr * mr + mi * mi;
    if (q === 0) return null;
    return { x: (nr * mr + ni * mi) / q, y: (ni * mr - nr * mi) / q };
  }

  /** @returns {string} */
  toString() {
    return `[[${this.a}, ${this.b}], [${this.c}, ${this.d}]]`;
  }
}

const i = IMAG;
const one = ONE;
const zero = ZERO;

/**
 * Schmidt's generators, from §1.1 of *Diophantine approximation of complex numbers*
 * (Acta Mathematica 134, 1975), p. 4.
 *
 * V₁, V₂, V₃ and C subdivide a triangular region into three triangles and a circle.
 * E₁, E₂, E₃ belong to the subdivision of a circular region. S is not a subdivision
 * generator: it is the non-Euclidean rotation by 2π/3 that relates the three V's to
 * each other, and the three E's.
 *
 * The Android original transcribed six of these correctly and got E₃ wrong — it had
 * `[[i,0],[0,i]]`, which is i·I and therefore the identity map. Lemma 1.1(iii) settles
 * it: `det Eⱼ = i`, and that matrix has determinant −1. The test suite below checks
 * every identity in Lemma 1.1, so a transcription error cannot survive here.
 */

/** `[[1, i], [0, 1]]` */
export const V1 = new Mobius(one, i, zero, one);
/** `[[1, 0], [−i, 1]]` */
export const V2 = new Mobius(one, zero, i.neg(), one);
/** `[[1−i, i], [−i, 1+i]]` */
export const V3 = new Mobius(one.sub(i), i, i.neg(), one.add(i));

/** `[[1, 0], [1−i, i]]` */
export const E1 = new Mobius(one, zero, one.sub(i), i);
/** `[[1, −1+i], [0, i]]` */
export const E2 = new Mobius(one, i.sub(one), zero, i);
/** `[[i, 0], [0, 1]]` */
export const E3 = new Mobius(i, zero, zero, one);

/** `[[1, −1+i], [1−i, i]]` */
export const C = new Mobius(one, i.sub(one), one.sub(i), i);

/** `[[0, −1], [1, −1]]` — the 2π/3 rotation; S³ = I */
export const S = new Mobius(zero, one.neg(), one, one.neg());

/** The identity. */
export const IDENTITY = new Mobius(one, zero, zero, one);

/**
 * The seven maps that subdivide, by name. S and the identity are excluded: they move
 * regions around rather than splitting them.
 *
 * @type {Record<string, Mobius>}
 */
export const GENERATORS = { V1, V2, V3, E1, E2, E3, C };

/**
 * Compose a word in the generators, left to right.
 *
 * A continued fraction expansion in Schmidt's sense *is* such a word — the article's
 * expansion of e^i begins `C C V3 C C V3 V3 V3 …` — so this is how an expansion turns
 * into a region.
 *
 * @param {string[]|string} letters names, or a space-separated string
 * @returns {Mobius}
 */
export function word(letters) {
  const names = typeof letters === 'string' ? letters.trim().split(/\s+/) : letters;
  let m = IDENTITY;
  for (const name of names) {
    if (name === '') continue;
    const g = GENERATORS[name] ?? (name === 'S' ? S : name === 'I' ? IDENTITY : null);
    if (g === null) throw new Error(`unknown generator "${name}"`);
    m = m.mul(g);
  }
  return m;
}
