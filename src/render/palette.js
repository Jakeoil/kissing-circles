// @ts-check

/**
 * Colour for circles.
 *
 * The Kotlin CircleColor enum had eighteen entries, two of which (Fuchsia and
 * Magenta) were the same value, and several — AntiqueWhite, Azure, BlanchedAlmond,
 * LemonChiffon — that were near-invisible on the white background it drew on. This
 * replaces it with a generated ramp: fixed saturation and lightness, hues spread by
 * the golden angle so that consecutive indices land far apart on the wheel.
 *
 * A small fixed number of colours matters for more than looks. The renderer batches
 * circles by colour into one path per bucket, so the bucket count is also the number
 * of canvas state changes per frame.
 */

/** @type {number} */
export const BUCKETS = 24;

const GOLDEN_ANGLE = 137.507764;

/**
 * @param {number} i
 * @param {number} saturation
 * @param {number} lightness
 * @returns {string}
 */
function hue(i, saturation, lightness) {
  const h = (i * GOLDEN_ANGLE) % 360;
  return `hsl(${h.toFixed(1)} ${saturation}% ${lightness}%)`;
}

/** @type {string[]} */
export const FILLS = Array.from({ length: BUCKETS }, (_, i) => hue(i, 62, 58));

/** @type {string[]} */
export const LABELS = Array.from({ length: BUCKETS }, (_, i) => hue(i, 70, 14));

/**
 * Which colour bucket a circle falls in.
 *
 * By curvature is the research-useful mode: circles sharing a curvature share a
 * colour, so the arithmetic structure of the packing is visible directly. By depth
 * shows the shape of the recursion instead.
 *
 * @param {bigint} curvature
 * @param {number} depth
 * @param {'curvature'|'depth'} mode
 * @returns {number} an index into FILLS
 */
export function bucket(curvature, depth, mode) {
  if (mode === 'depth') return depth % BUCKETS;
  const b = curvature < 0n ? -curvature : curvature;
  return Number(b % BigInt(BUCKETS));
}

/** Background behind everything. */
export const BACKGROUND = '#0d1117';

/** Fill for the region inside a bounding circle, before its contents are drawn. */
export const INTERIOR = '#161b22';

/** Straight lines, in packings that have them. */
export const LINE = '#8b949e';
