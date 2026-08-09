// @ts-check

/**
 * Color for circles, in a light theme and a dark one.
 *
 * The Kotlin CircleColor enum had eighteen entries, two of which (Fuchsia and
 * Magenta) were the same value, and several — AntiqueWhite, Azure, BlanchedAlmond,
 * LemonChiffon — that were near-invisible against the white background it drew on.
 * This replaces it with a generated ramp: fixed saturation and lightness, hues
 * spread by the golden angle so consecutive indices land far apart on the wheel.
 *
 * A small fixed number of colors matters for more than looks. The renderer batches
 * circles by color into one path per bucket, so the bucket count is also the number
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

/**
 * @typedef {object} Theme
 * @property {string} background behind everything
 * @property {string} interior inside a bounding circle, before its contents
 * @property {string} line straight lines, in packings that have them
 * @property {string[]} fills one per bucket
 * @property {string[]} labels numerals, one per bucket
 */

/**
 * @param {object} spec
 * @param {string} spec.background
 * @param {string} spec.interior
 * @param {string} spec.line
 * @param {number} spec.fillS
 * @param {number} spec.fillL
 * @param {number} spec.labelS
 * @param {number} spec.labelL
 * @returns {Theme}
 */
function build(spec) {
  return {
    background: spec.background,
    interior: spec.interior,
    line: spec.line,
    fills: Array.from({ length: BUCKETS }, (_, i) => hue(i, spec.fillS, spec.fillL)),
    labels: Array.from({ length: BUCKETS }, (_, i) => hue(i, spec.labelS, spec.labelL)),
  };
}

/**
 * Both themes keep the numeral much darker than the disk it sits on, so a label
 * always reads against its own fill rather than against the page.
 *
 * @type {Record<'light'|'dark', Theme>}
 */
export const THEMES = {
  dark: build({
    background: '#0d1117',
    interior: '#161b22',
    line: '#8b949e',
    fillS: 62,
    fillL: 58,
    labelS: 72,
    labelL: 13,
  }),
  light: build({
    background: '#eef1f5',
    interior: '#ffffff',
    line: '#57606a',
    fillS: 66,
    fillL: 74,
    labelS: 78,
    labelL: 25,
  }),
};

/**
 * @param {string} mode
 * @returns {Theme}
 */
export function theme(mode) {
  return mode === 'light' ? THEMES.light : THEMES.dark;
}

/**
 * Which color bucket a circle falls in.
 *
 * By curvature is the research-useful mode: circles sharing a curvature share a
 * color, so the arithmetic structure of the packing is visible directly. By depth
 * shows the shape of the recursion instead.
 *
 * @param {bigint} curvature
 * @param {number} depth
 * @param {'curvature'|'depth'} mode
 * @returns {number} an index into a theme's fills
 */
export function bucket(curvature, depth, mode) {
  if (mode === 'depth') return depth % BUCKETS;
  const b = curvature < 0n ? -curvature : curvature;
  return Number(b % BigInt(BUCKETS));
}
