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

/**
 * The numeral font. Caladea is metric-compatible with Cambria and ships with the
 * project; the rest is what a browser falls back to if it somehow fails to load.
 */
export const NUMERAL_FONT =
  '"Caladea", Cambria, Charter, "Source Serif 4", Georgia, "Times New Roman", serif';

/**
 * Cap height of a numeral as a fraction of the circle's radius.
 *
 * Fitting purely by the bounding box — the obvious approach — makes a single digit
 * enormous, because one narrow glyph leaves room to grow until it hits the circle
 * diagonally. At that point a numeral spans about 70% of the diameter and the
 * picture reads as digits with circles around them rather than a packing. Driving
 * the size from cap height instead keeps every numeral to the same visual weight
 * regardless of how many digits it has.
 */
const CAP_FRACTION = 0.8;

/** How much of the radius the whole numeral box may span, as a safety constraint. */
const BOX_FRACTION = 0.92;

/** Screen radius below which no numeral is attempted. */
const MIN_RADIUS = 12;

/** Rendered size below which a numeral is not worth drawing. */
const MIN_SIZE = 8;

/** Most numerals to draw in one frame, largest first. */
const MAX_LABELS = 800;

/**
 * A numeral may never exceed this fraction of the viewport's shorter side.
 *
 * Without it, zooming inside a big circle scales its numeral with the circle: at
 * 1600x the containing circle is many screens wide and its curvature is drawn as a
 * glyph sprawling across the whole view, obscuring the packing. A label for a circle
 * larger than the window should stay a label.
 */
const VIEWPORT_FRACTION = 0.12;

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
 * Three constraints, whichever is tightest:
 *   - cap height is a fixed fraction of the radius, so all numerals read alike
 *   - the whole box fits within the circle, measured by its half-diagonal, so a long
 *     curvature shrinks rather than spilling over the edge
 *   - the numeral stays a modest fraction of the viewport, so a circle bigger than
 *     the window does not get a numeral bigger than the window
 *
 * @param {number} radius screen radius
 * @param {number} digits how many characters the numeral has
 * @param {DigitMetrics} metrics
 * @param {number} [ceiling] largest permitted size in pixels
 * @returns {number} font size in pixels, rounded; 0 means do not draw
 */
export function numeralSize(radius, digits, metrics, ceiling = Infinity) {
  if (radius < MIN_RADIUS) return 0;

  const byCap = (CAP_FRACTION * radius) / metrics.height;
  const byBox =
    (2 * radius * BOX_FRACTION) /
    Math.hypot(digits * metrics.advance, metrics.height);

  const size = Math.round(Math.min(byCap, byBox, ceiling) * 100) / 100;
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
  const ceiling = VIEWPORT_FRACTION * Math.min(view.width, view.height);

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
    const size = numeralSize(radius, text.length, metrics, ceiling);
    if (size === 0) continue;

    const style = palette.labels[buckets[i]];
    if (style !== lastStyle) {
      ctx.fillStyle = style;
      lastStyle = style;
    }

    ctx.font = `700 ${size}px ${NUMERAL_FONT}`;
    ctx.fillText(
      text,
      packing.x[i] * scale + tx,
      packing.y[i] * scale + ty + metrics.center * size,
    );
    drawn++;
  }

  return drawn;
}

/** Exposed for tests and for callers that want to match the renderer's threshold. */
export const LABEL_MIN_RADIUS = MIN_RADIUS;
