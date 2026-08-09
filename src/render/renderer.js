// @ts-check

import { BUCKETS, bucket, theme as themeFor } from './palette.js';

/**
 * Canvas 2D rendering of a packing.
 *
 * Provisional — this is the Phase 2 checkpoint renderer, enough to see that
 * generation is correct. Phase 3 replaces it with proper level-of-detail handling.
 *
 * Two things it already gets right. Circles are batched into one path per color, so
 * a frame costs a couple of dozen canvas state changes rather than one per circle.
 * And it walks the packing's parallel Float64Arrays, never touching a BigInt in the
 * draw loop — the exact representation stays out of the hot path entirely.
 *
 * Draw order does not matter among ordinary circles: the interiors of an Apollonian
 * packing are disjoint, so nothing occludes anything. The one exception is a
 * bounding circle, which contains the whole packing and so is filled first.
 */

const TAU = Math.PI * 2;

/**
 * The numeral font. Caladea is metric-compatible with Cambria and ships with the
 * project; the rest of the stack is what a browser falls back to if it somehow does
 * not load. Nothing below depends on which one wins — the metrics are measured.
 */
export const NUMERAL_FONT =
  '"Caladea", Cambria, Charter, "Source Serif 4", Georgia, "Times New Roman", serif';

/** How much of a circle's radius a numeral is allowed to span. */
const SNUGNESS = 0.86;

/** Below this screen radius, no numeral is attempted. */
const MIN_LABEL_RADIUS = 11;

/** Below this pixel size, a numeral is not worth drawing. */
const MIN_LABEL_SIZE = 7;

/** @type {{center: number, height: number, advance: number}|null} */
let cachedMetrics = null;
/** @type {string} */
let cachedFor = '';

/**
 * Forget the measured font metrics.
 *
 * Necessary because `font-display: swap` renders the fallback first and switches when the
 * webfont arrives. Metrics measured against the fallback would then be wrong for
 * every subsequent frame, so the caller invalidates them once fonts are ready.
 */
export function resetFontMetrics() {
  cachedMetrics = null;
  cachedFor = '';
}

/**
 * Measure where digits actually sit, in em units.
 *
 * Canvas `textBaseline = 'middle'` centers on the font's em box, not on the digits,
 * which leaves numerals visibly high inside a circle. The Kotlin original noticed
 * this and measured the bounding box of "0123456789" to correct it; this does the
 * same, and also records the digit advance so a numeral can be fitted to the circle
 * by width as well as by height.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} family
 * @returns {{center: number, height: number, advance: number}}
 */
function digitMetrics(ctx, family) {
  if (cachedMetrics !== null && cachedFor === family) return cachedMetrics;

  const probe = 100;
  const saved = ctx.font;
  ctx.font = `700 ${probe}px ${family}`;
  const m = ctx.measureText('0123456789');
  ctx.font = saved;

  // Fall back to typical serif proportions if the browser withholds the box.
  const ascent = m.actualBoundingBoxAscent ?? probe * 0.7;
  const descent = m.actualBoundingBoxDescent ?? 0;

  cachedMetrics = {
    center: (ascent - descent) / 2 / probe,
    height: (ascent + descent) / probe,
    advance: m.width / 10 / probe,
  };
  cachedFor = family;
  return cachedMetrics;
}

/**
 * @typedef {object} DrawOptions
 * @property {'curvature'|'depth'} [colorMode]
 * @property {'light'|'dark'} [theme]
 * @property {boolean} [labels] draw curvature numerals in circles large enough
 * @property {number} [minPixels] skip circles smaller than this on screen
 */

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../math/packing.js').Packing} packing
 * @param {import('./viewport.js').Viewport} view
 * @param {DrawOptions} [options]
 * @returns {{drawn: number, skipped: number, labeled: number}}
 */
export function draw(ctx, packing, view, options = {}) {
  const colorMode = options.colorMode ?? 'curvature';
  const palette = themeFor(options.theme ?? 'dark');
  const labels = options.labels ?? true;
  const minPixels = options.minPixels ?? 0.35;

  const { width, height, scale, tx, ty } = view;

  ctx.save();
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, width, height);

  const xs = packing.x;
  const ys = packing.y;
  const rs = packing.r;
  const depths = packing.depth;
  const n = packing.count;

  /** @type {number[][]} */
  const buckets = Array.from({ length: BUCKETS }, () => []);
  /** @type {number[]} */
  const lines = [];
  let drawn = 0;
  let skipped = 0;

  for (let i = 0; i < n; i++) {
    const r = rs[i];

    if (!Number.isFinite(r)) {
      lines.push(i);
      continue;
    }

    const sr = Math.abs(r) * scale;
    if (sr < minPixels) {
      skipped++;
      continue;
    }

    const sx = xs[i] * scale + tx;
    const sy = ys[i] * scale + ty;

    if (sx + sr < 0 || sx - sr > width || sy + sr < 0 || sy - sr > height) {
      skipped++;
      continue;
    }

    if (r < 0) {
      // A bounding circle: fill it as the backdrop its contents sit on.
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, TAU);
      ctx.fillStyle = palette.interior;
      ctx.fill();
      drawn++;
      continue;
    }

    buckets[bucket(packing.circles[i].b, depths[i], colorMode)].push(i);
    drawn++;
  }

  for (let b = 0; b < BUCKETS; b++) {
    const indices = buckets[b];
    if (indices.length === 0) continue;

    ctx.beginPath();
    for (const i of indices) {
      const sr = rs[i] * scale;
      const sx = xs[i] * scale + tx;
      const sy = ys[i] * scale + ty;
      // moveTo before each arc, or the subpaths get joined by stray line segments.
      ctx.moveTo(sx + sr, sy);
      ctx.arc(sx, sy, sr, 0, TAU);
    }
    ctx.fillStyle = palette.fills[b];
    ctx.fill();
  }

  if (lines.length > 0) drawLines(ctx, packing, view, lines, palette.line);

  let labeled = 0;
  if (labels) labeled = drawLabels(ctx, packing, view, buckets, palette);

  ctx.restore();
  return { drawn, skipped, labeled };
}

/**
 * Straight lines have infinite radius, so they are drawn as a chord across the
 * viewport rather than as an arc. A line is the set of points p with p.n = d, where
 * n is the unit normal held in bz and d is half the co-curvature.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../math/packing.js').Packing} packing
 * @param {import('./viewport.js').Viewport} view
 * @param {number[]} indices
 * @param {string} color
 */
function drawLines(ctx, packing, view, indices, color) {
  const reach = (view.width + view.height) / view.scale;

  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();

  for (const i of indices) {
    const c = packing.circles[i];
    const nx = packing.x[i];
    const ny = packing.y[i];
    const d = c.lineOffset();

    const px = nx * d;
    const py = ny * d;
    const dx = -ny;
    const dy = nx;

    const a = view.worldToScreen(px - dx * reach, py - dy * reach);
    const b = view.worldToScreen(px + dx * reach, py + dy * reach);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }

  ctx.stroke();
}

/**
 * Curvature numerals, in circles big enough to hold them. This is the feature the
 * whole tool exists for — reading the integer curvatures straight off the picture.
 *
 * A numeral is sized so its measured bounding box fits inside the circle: with box
 * width w and height h in em, the largest size whose half-diagonal stays within the
 * radius is 2*r/hypot(w, h). Long curvatures therefore shrink to fit instead of
 * spilling over the edge.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../math/packing.js').Packing} packing
 * @param {import('./viewport.js').Viewport} view
 * @param {number[][]} buckets
 * @param {import('./palette.js').Theme} palette
 * @returns {number}
 */
function drawLabels(ctx, packing, view, buckets, palette) {
  const { scale, tx, ty } = view;
  const metrics = digitMetrics(ctx, NUMERAL_FONT);
  let labeled = 0;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  for (let b = 0; b < BUCKETS; b++) {
    let opened = false;

    for (const i of buckets[b]) {
      const sr = packing.r[i] * scale;
      if (sr < MIN_LABEL_RADIUS) continue;

      const text = packing.circles[i].b.toString();
      const w = text.length * metrics.advance;
      const exact = (2 * sr * SNUGNESS) / Math.hypot(w, metrics.height);
      if (exact < MIN_LABEL_SIZE) continue;

      // The font string carries a rounded size, so the baseline offset has to be
      // computed from the rounded value too — otherwise the numeral is positioned
      // for a size it is not actually set at.
      const size = Math.round(exact * 100) / 100;

      if (!opened) {
        ctx.fillStyle = palette.labels[b];
        opened = true;
      }

      ctx.font = `700 ${size}px ${NUMERAL_FONT}`;
      ctx.fillText(
        text,
        packing.x[i] * scale + tx,
        packing.y[i] * scale + ty + metrics.center * size,
      );
      labeled++;
    }
  }

  return labeled;
}
