// @ts-check

import { Packing } from './packing.js';

/**
 * Arithmetic of the curvatures in a packing.
 *
 * This is the part of the tool that is actually about research rather than about
 * drawing. Which integers appear as curvatures in an integral Apollonian packing is
 * a live question, and it has two layers:
 *
 *   - **Congruence.** A primitive integral packing only ever produces curvatures in
 *     certain classes modulo 24. The classic (-1, 2, 2, 3) packing uses eight of the
 *     twenty-four; the other sixteen are impossible, for reasons visible in the
 *     quadratic form.
 *   - **Everything else.** Within the admissible classes, most integers do occur —
 *     but not all. The local-global conjecture held that only finitely many are
 *     missed. It was disproved in 2023 (Haag, Kertzer, Rickards and Stange), so the
 *     exceptions are worth being able to look at rather than assume away.
 *
 * `analyze` computes both: the residues a packing occupies, and the integers inside
 * those residues that it never reaches. In (-1, 2, 2, 3) the smallest such misses
 * are 78 and 159.
 *
 * Nothing here touches the DOM.
 */

/** Curvatures in a primitive integral packing are constrained modulo this. */
export const MODULUS = 24;

/**
 * @typedef {object} Analysis
 * @property {bigint} maxCurvature the bound the packing was generated to
 * @property {number} circles how many circles were generated
 * @property {number} distinct how many distinct positive curvatures occur
 * @property {number} modulus
 * @property {number[]} present residues that occur, ascending
 * @property {number[]} absent residues that never occur, ascending
 * @property {bigint[]} missing integers within the present residues that never occur
 * @property {{residue: number, occurring: number, possible: number}[]} perResidue
 * @property {{from: bigint, to: bigint, count: number}[]} histogram distinct
 *   curvatures per power-of-ten band
 * @property {number} ms how long the computation took
 */

/**
 * Study the curvatures of a packing up to a bound.
 *
 * Generation prunes a branch as soon as its new circle passes the bound, which is
 * sound because curvature increases monotonically down a branch — so every curvature
 * at or below the bound is found. `test/analysis.test.js` checks that against
 * generating to twice the bound.
 *
 * @param {import('./circle.js').Circle[]} root
 * @param {bigint} maxCurvature
 * @returns {Analysis}
 */
export function analyze(root, maxCurvature) {
  const started = Date.now();

  const packing = new Packing(root, { maxCurvature });
  packing.grow();

  /** @type {Set<bigint>} */
  const curvatures = new Set();
  for (let i = 0; i < packing.count; i++) {
    const b = packing.circles[i].b;
    if (b > 0n && b <= maxCurvature) curvatures.add(b);
  }

  const modulus = BigInt(MODULUS);
  /** @type {Set<number>} */
  const present = new Set();
  for (const b of curvatures) present.add(Number(b % modulus));

  /** @type {number[]} */
  const absent = [];
  for (let r = 0; r < MODULUS; r++) if (!present.has(r)) absent.push(r);

  /** @type {bigint[]} */
  const missing = [];
  /** @type {Map<number, {occurring: number, possible: number}>} */
  const perResidue = new Map();
  for (const r of present) perResidue.set(r, { occurring: 0, possible: 0 });

  for (let n = 1n; n <= maxCurvature; n++) {
    const r = Number(n % modulus);
    const tally = perResidue.get(r);
    if (tally === undefined) continue;
    tally.possible++;
    if (curvatures.has(n)) tally.occurring++;
    else missing.push(n);
  }

  return {
    maxCurvature,
    circles: packing.count,
    distinct: curvatures.size,
    modulus: MODULUS,
    present: [...present].sort((a, b) => a - b),
    absent,
    missing,
    perResidue: [...perResidue.entries()]
      .map(([residue, t]) => ({ residue, ...t }))
      .sort((a, b) => a.residue - b.residue),
    histogram: bandCounts(curvatures, maxCurvature),
    ms: Date.now() - started,
  };
}

/**
 * Distinct curvatures per power-of-ten band, which is the shape worth seeing: the
 * count grows roughly with the band, and a packing that stalls shows up as a band
 * that does not.
 *
 * @param {Set<bigint>} curvatures
 * @param {bigint} maxCurvature
 * @returns {{from: bigint, to: bigint, count: number}[]}
 */
function bandCounts(curvatures, maxCurvature) {
  /** @type {{from: bigint, to: bigint, count: number}[]} */
  const bands = [];
  for (let lo = 1n; lo <= maxCurvature; lo *= 10n) {
    const hi = lo * 10n - 1n;
    bands.push({ from: lo, to: hi > maxCurvature ? maxCurvature : hi, count: 0 });
  }
  for (const b of curvatures) {
    for (const band of bands) {
      if (b >= band.from && b <= band.to) {
        band.count++;
        break;
      }
    }
  }
  return bands;
}
