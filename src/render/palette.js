// @ts-check

/**
 * Color for circles, in a light theme and a dark one.
 *
 * The Kotlin CircleColor enum had eighteen entries, two of which (Fuchsia and
 * Magenta) were the same value, and several — AntiqueWhite, Azure, BlanchedAlmond,
 * LemonChiffon — that were near-invisible against the white background it drew on.
 * This replaces it with a generated ramp: fixed saturation and lightness, hues
 * spread by a step chosen to separate the residues a packing actually produces.
 *
 * A small fixed number of colors matters for more than looks. The renderer batches
 * circles by color into one path per bucket, so the bucket count is also the number
 * of canvas state changes per frame.
 */

/** @type {number} */
export const BUCKETS = 24;

/**
 * Degrees of hue per bucket.
 *
 * The golden angle is the usual choice for spreading an open-ended sequence, and it
 * is the wrong one here. Buckets are curvature mod 24, and an Apollonian packing
 * does not use all 24 residues — the classic (-1, 2, 2, 3) packing only ever
 * produces curvatures congruent to 2, 3, 6, 11, 14, 15, 18 or 23. The golden angle
 * happens to place residues 2 and 23 just 7.7 degrees apart, so two of the most
 * common curvatures in the picture came out the same purple.
 *
 * 173 degrees per bucket was chosen by searching for the multiplier that best
 * separates the residues that actually occur (28 degrees at the closest) while
 * keeping all 24 usable for coloring by depth (14 degrees at the closest).
 */
export const HUE_STEP = 173;

/**
 * @param {number} i
 * @param {number} saturation
 * @param {number} lightness
 * @returns {string}
 */
function hue(i, saturation, lightness) {
  const h = (i * HUE_STEP) % 360;
  // A small alternation in lightness so that any two buckets which do land near
  // each other in hue still separate.
  const l = lightness + (i % 2 === 0 ? 0 : -4);
  return `hsl(${h.toFixed(1)} ${saturation}% ${l}%)`;
}

/**
 * @typedef {object} Theme
 * @property {string} background behind everything
 * @property {string} interior inside a bounding circle, before its contents
 * @property {string} rim the edge of a bounding circle, which would otherwise be
 *   hard to pick out against the page
 * @property {string} line straight lines, in packings that have them
 * @property {string} highlight outline for the circle under the cursor
 * @property {string[]} fills one per bucket
 * @property {string[]} labels numerals, one per bucket
 */

/**
 * @param {object} spec
 * @param {string} spec.background
 * @param {string} spec.interior
 * @param {string} spec.rim
 * @param {string} spec.line
 * @param {string} spec.highlight
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
    rim: spec.rim,
    line: spec.line,
    highlight: spec.highlight,
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
    interior: '#1b222c',
    rim: '#3d4655',
    line: '#8b949e',
    highlight: '#ffffff',
    fillS: 62,
    fillL: 58,
    labelS: 72,
    labelL: 13,
  }),
  light: build({
    background: '#e7ebf0',
    interior: '#ffffff',
    rim: '#b6bfcb',
    line: '#57606a',
    highlight: '#1f2328',
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
