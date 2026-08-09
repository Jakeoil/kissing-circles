// @ts-check

import { gcd } from '../math/rational.js';

/**
 * Formatting a circle for the hover readout.
 *
 * The point of this project is exactness, so the readout shows exact values: the
 * center as a reduced Gaussian rational rather than a decimal, the curvature and
 * co-curvature as integers however large, and the quadruple the circle was
 * reflected out of. Decimals appear only as a secondary line, for orientation.
 */

/**
 * @typedef {import('../math/circle.js').Circle} Circle
 */

/**
 * The center as an exact Gaussian rational in lowest terms.
 *
 * A circle is stored as (b, b*z), so its center is the quotient b*z / b. Reducing by
 * the common divisor gives the shortest honest way to write it.
 *
 * @param {Circle} c
 * @returns {string}
 */
export function exactCenter(c) {
  if (c.isLine()) return '—';

  const { re, im } = c.bz;
  let b = c.b;
  let x = re;
  let y = im;

  const g = gcd(gcd(x, y), b) || 1n;
  x /= g;
  y /= g;
  b /= g;
  if (b < 0n) {
    x = -x;
    y = -y;
    b = -b;
  }

  const part = (/** @type {bigint} */ n) => (b === 1n ? `${n}` : `${n}/${b}`);

  if (y === 0n) return part(x);
  if (x === 0n) return `${part(y)}i`;
  return y < 0n ? `${part(x)} − ${part(-y)}i` : `${part(x)} + ${part(y)}i`;
}

/**
 * The radius as an exact fraction, 1/b.
 * @param {Circle} c
 * @returns {string}
 */
export function exactRadius(c) {
  if (c.isLine()) return '∞';
  if (c.b === 1n) return '1';
  if (c.b === -1n) return '−1';
  return c.b < 0n ? `−1/${-c.b}` : `1/${c.b}`;
}

/**
 * A decimal rendering of the center, for orientation alongside the exact form.
 * @param {Circle} c
 * @returns {string}
 */
export function approxCenter(c) {
  if (c.isLine()) return '—';
  const f = c.toFloat();
  return `(${f.x.toFixed(6)}, ${f.y.toFixed(6)})`;
}

/**
 * Everything worth saying about one circle.
 *
 * @param {import('../math/packing.js').Packing} packing
 * @param {number} i index into the packing
 * @returns {{label: string, value: string}[]}
 */
export function describe(packing, i) {
  const c = packing.circles[i];
  /** @type {{label: string, value: string}[]} */
  const rows = [];

  if (c.isLine()) {
    rows.push({ label: 'line', value: `normal ${c.bz}, offset ${c.lineOffset()}` });
  } else {
    rows.push({ label: 'curvature', value: c.b.toLocaleString() });
    rows.push({ label: 'radius', value: exactRadius(c) });
    rows.push({ label: 'center', value: exactCenter(c) });
    rows.push({ label: '', value: approxCenter(c) });
  }

  rows.push({ label: 'co-curvature', value: c.bbar.toLocaleString() });
  rows.push({ label: 'depth', value: String(packing.depth[i]) });

  const parents = packing.parentsOf(i);
  if (parents.length === 3) {
    const curvatures = parents.map((p) => packing.circles[p].b);
    rows.push({
      label: 'reflected in',
      value: curvatures.map((b) => b.toLocaleString()).join(', '),
    });
    rows.push({
      label: 'quadruple',
      value: [...curvatures, c.b].map((b) => b.toLocaleString()).join(', '),
    });
  } else {
    rows.push({ label: 'origin', value: 'root quadruple' });
  }

  return rows;
}
