// @ts-check

import { BUCKETS, FILLS, LABELS, BACKGROUND, INTERIOR, LINE, bucket } from './palette.js';

/**
 * Canvas 2D rendering of a packing.
 *
 * Provisional — this is the Phase 2 checkpoint renderer, enough to see that
 * generation is correct. Phase 3 replaces it with proper level-of-detail handling
 * and typography.
 *
 * Two things it already gets right. Circles are batched into one path per colour,
 * so a frame costs a couple of dozen canvas state changes rather than one per
 * circle. And it walks the packing's parallel Float64Arrays, never touching a
 * BigInt in the draw loop — the exact representation stays out of the hot path
 * entirely.
 *
 * Draw order does not matter among ordinary circles: the interiors of an Apollonian
 * packing are disjoint, so nothing occludes anything. The one exception is a
 * bounding circle, which contains the whole packing and so is filled first.
 */

const TAU = Math.PI * 2;

/**
 * @typedef {object} DrawOptions
 * @property {'curvature'|'depth'} [colorMode]
 * @property {boolean} [labels] draw curvature numerals in circles large enough
 * @property {number} [minPixels] skip circles smaller than this on screen
 */

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../math/packing.js').Packing} packing
 * @param {import('./viewport.js').Viewport} view
 * @param {DrawOptions} [options]
 * @returns {{drawn: number, skipped: number, labelled: number}}
 */
export function draw(ctx, packing, view, options = {}) {
  const colorMode = options.colorMode ?? 'curvature';
  const labels = options.labels ?? true;
  const minPixels = options.minPixels ?? 0.35;

  const { width, height } = view;
  const { scale, tx, ty } = view;

  ctx.save();
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, width, height);

  const n = packing.count;
  const xs = packing.x;
  const ys = packing.y;
  const rs = packing.r;
  const depths = packing.depth;

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

    // Cull against the viewport.
    if (sx + sr < 0 || sx - sr > width || sy + sr < 0 || sy - sr > height) {
      skipped++;
      continue;
    }

    if (r < 0) {
      // A bounding circle: fill it as the backdrop its contents sit on.
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, TAU);
      ctx.fillStyle = INTERIOR;
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
    ctx.fillStyle = FILLS[b];
    ctx.fill();
  }

  if (lines.length > 0) drawLines(ctx, packing, view, lines);

  let labelled = 0;
  if (labels) labelled = drawLabels(ctx, packing, view, buckets, colorMode);

  ctx.restore();
  return { drawn, skipped, labelled };
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
 */
function drawLines(ctx, packing, view, indices) {
  const reach = (view.width + view.height) / view.scale;

  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.5;
  ctx.beginPath();

  for (const i of indices) {
    const c = packing.circles[i];
    const nx = packing.x[i];
    const ny = packing.y[i];
    const d = c.lineOffset();

    // A point on the line, and the direction along it.
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
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../math/packing.js').Packing} packing
 * @param {import('./viewport.js').Viewport} view
 * @param {number[][]} buckets
 * @param {'curvature'|'depth'} colorMode
 * @returns {number}
 */
function drawLabels(ctx, packing, view, buckets, colorMode) {
  const { scale, tx, ty } = view;
  let labelled = 0;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let b = 0; b < BUCKETS; b++) {
    let opened = false;
    for (const i of buckets[b]) {
      const sr = packing.r[i] * scale;
      if (sr < 16) continue;

      const text = packing.circles[i].b.toString();
      // Keep the numeral inside the circle whatever its length.
      const size = Math.min(sr * 0.95, (sr * 1.7) / Math.max(text.length, 1.6));
      if (size < 8) continue;

      if (!opened) {
        ctx.fillStyle = LABELS[b];
        opened = true;
      }
      ctx.font = `600 ${size.toFixed(1)}px ui-monospace, "SF Mono", Menlo, monospace`;
      ctx.fillText(text, packing.x[i] * scale + tx, packing.y[i] * scale + ty);
      labelled++;
    }
  }

  return labelled;
}
