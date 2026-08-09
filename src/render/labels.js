// @ts-check

/**
 * Curvature numerals.
 *
 * Reading integer curvatures straight off the picture is what this tool is for, so
 * the numerals get their own module and their own sizing policy.
 *
 * Nothing here names a font. The digit box is measured at runtime and every
 * placement decision follows from that measurement, so any font substitutes without
 * adjustment — the generalization of what KcTestView.circleTypeface() was doing in
 * the Kotlin.
 */

import { font as fontById, DEFAULT_FONT } from './fonts.js';

/**
 * The font stack currently in use. Set by the caller; everything below measures it
 * rather than assuming anything about it.
 * @type {string}
 */
export let NUMERAL_FONT = fontById(DEFAULT_FONT).stack;

/**
 * Choose the numeral font. Invalidates the cached metrics, since they describe the
 * previous face.
 * @param {string} id
 */
export function setNumeralFont(id) {
  const next = fontById(id).stack;
  if (next === NUMERAL_FONT) return;
  NUMERAL_FONT = next;
  resetFontMetrics();
}

/**
 * How much of the circle a numeral spans, as a fraction of the diameter measured
 * across the numeral's bounding box.
 *
 * This is deliberately a *constant ratio to the circle*: a numeral is set as large
 * as it can be and still fit, so it always bears the same relation to the circle it
 * labels. Wider numerals are therefore set smaller — a six-digit curvature shrinks
 * until its box fits — but the numeral always fills its circle the same way.
 */
const BOX_FRACTION = 0.86;

/** Screen radius below which no numeral is attempted. */
const MIN_RADIUS = 12;

/** Rendered size below which a numeral is not worth drawing. */
const MIN_SIZE = 8;

/** Most numerals to draw in one frame, largest first. */
const MAX_LABELS = 800;

/** @typedef {{center: number, height: number, advance: number}} DigitMetrics */

/** @type {DigitMetrics|null} */
let cached = null;
/** @type {string} */
let cachedFor = '';

/**
 * Forget the measured font metrics.
 *
 * Necessary because `font-display: swap` paints the fallback first and switches when
 * the webfont arrives. Metrics measured against the fallback would otherwise be
 * wrong for every subsequent frame.
 */
export function resetFontMetrics() {
  cached = null;
  cachedFor = '';
}

/**
 * Measure where digits actually sit, in em units.
 *
 * Canvas `textBaseline = 'middle'` centers the em box rather than the digits, which
 * leaves numerals visibly riding high inside a circle. Measuring the real bounding
 * box gives the offset that puts them on their optical center, and the digit advance
 * needed to fit a numeral by width as well as by height.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} [family]
 * @returns {DigitMetrics}
 */
export function digitMetrics(ctx, family = NUMERAL_FONT) {
  if (cached !== null && cachedFor === family) return cached;

  const probe = 100;
  const saved = ctx.font;
  ctx.font = `700 ${probe}px ${family}`;
  const m = ctx.measureText('0123456789');
  ctx.font = saved;

  // Fall back to typical serif proportions if the browser withholds the box.
  const ascent = m.actualBoundingBoxAscent ?? probe * 0.7;
  const descent = m.actualBoundingBoxDescent ?? 0;

  cached = {
    center: (ascent - descent) / 2 / probe,
    height: (ascent + descent) / probe,
    advance: m.width / 10 / probe,
  };
  cachedFor = family;
  return cached;
}

/**
 * The size a numeral should be set at inside a circle, or 0 if it should be skipped.
 *
 * The numeral is set as large as it can be and still fit inside the circle: with the
 * measured box w wide and h tall, the largest size whose half-diagonal stays within
 * the radius is 2*r/hypot(w, h).
 *
 * The size is strictly proportional to the screen radius, with no ceiling of any
 * kind. Once a numeral fills its circle there is no reason to change that relation,
 * so zooming in grows the numeral exactly as it grows the circle. A cap that
 * engaged at some size would show up as the numeral quietly detaching from its
 * circle partway through a zoom, which is worse than a numeral running off screen.
 *
 * @param {number} radius screen radius
 * @param {number} digits how many characters the numeral has
 * @param {DigitMetrics} metrics
 * @returns {number} font size in pixels, rounded; 0 means do not draw
 */
export function numeralSize(radius, digits, metrics) {
  if (radius < MIN_RADIUS) return 0;

  const byBox =
    (2 * radius * BOX_FRACTION) /
    Math.hypot(digits * metrics.advance, metrics.height);

  const size = Math.round(byBox * 100) / 100;
  return size < MIN_SIZE ? 0 : size;
}

/**
 * Draw curvature numerals over an already-rendered packing.
 *
 * Candidates are drawn largest first and capped, so that when a view is dense the
 * numerals that survive are the ones a reader is most likely to want.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../math/packing.js').Packing} packing
 * @param {import('./viewport.js').Viewport} view
 * @param {number[]} candidates indices of visible circles, unordered
 * @param {Uint8Array} buckets color bucket per circle index
 * @param {import('./palette.js').Theme} palette
 * @returns {number} how many were drawn
 */
export function drawLabels(ctx, packing, view, candidates, buckets, palette) {
  if (candidates.length === 0) return 0;

  const { scale, tx, ty } = view;
  const metrics = digitMetrics(ctx);

  const ordered =
    candidates.length > MAX_LABELS
      ? candidates.slice().sort((a, b) => packing.r[b] - packing.r[a]).slice(0, MAX_LABELS)
      : candidates.slice().sort((a, b) => packing.r[b] - packing.r[a]);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  let drawn = 0;
  let lastStyle = '';

  for (const i of ordered) {
    const radius = packing.r[i] * scale;
    const text = packing.circles[i].b.toString();
    const size = numeralSize(radius, text.length, metrics);
    if (size === 0) continue;

    const style = palette.labels[buckets[i]];
    if (style !== lastStyle) {
      ctx.fillStyle = style;
      lastStyle = style;
    }

    ctx.font = `700 ${size}px ${NUMERAL_FONT}`;

    // Center on this numeral's own box, not on the average over all ten digits.
    // With oldstyle figures the difference is visible: "11" has no descender while
    // "39" has two, so a shared offset leaves one of them sitting wrong.
    const box = ctx.measureText(text);
    const rise =
      box.actualBoundingBoxAscent === undefined
        ? metrics.center * size
        : (box.actualBoundingBoxAscent - box.actualBoundingBoxDescent) / 2;

    ctx.fillText(text, packing.x[i] * scale + tx, packing.y[i] * scale + ty + rise);
    drawn++;
  }

  return drawn;
}

/** Exposed for tests and for callers that want to match the renderer's threshold. */
export const LABEL_MIN_RADIUS = MIN_RADIUS;
