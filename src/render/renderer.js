// @ts-check

import { BUCKETS, bucket, theme as themeFor } from './palette.js';
import { drawLabels, LABEL_MIN_RADIUS } from './labels.js';

/**
 * Canvas 2D rendering of a packing.
 *
 * Three things keep a frame cheap:
 *
 *   - Circles are batched into one path per color, so a frame costs a couple of
 *     dozen canvas state changes rather than one per circle.
 *   - The draw loop reads only the packing's parallel Float64Arrays. Color buckets
 *     are derived from curvature once per circle, ever, and cached — so no BigInt is
 *     touched while drawing.
 *   - Scratch arrays are reused between frames instead of reallocated.
 *
 * Draw order does not matter among ordinary circles: the interiors of an Apollonian
 * packing are disjoint, so nothing occludes anything. The one exception is a
 * bounding circle, which contains the whole packing and so is filled first.
 *
 * That freedom is exactly what `style: 'stroke'` exists for. A Schmidt arrangement's
 * circles *nest*, so filling them paints the whole picture into a solid mass — the
 * assumption above simply does not hold there. Outlines have no such problem, need no
 * ordering, and are how these arrangements are conventionally drawn.
 */

const TAU = Math.PI * 2;

/**
 * Color buckets by curvature, computed once per circle and kept alongside the
 * packing. A packing only ever grows, so the cache is extended rather than rebuilt.
 *
 * @type {WeakMap<object, {arr: Uint8Array, filled: number}>}
 */
const bucketCache = new WeakMap();

/**
 * @param {import('../math/packing.js').Packing} packing
 * @returns {Uint8Array}
 */
function curvatureBuckets(packing) {
  let entry = bucketCache.get(packing);
  if (entry === undefined) {
    entry = { arr: new Uint8Array(Math.max(1024, packing.count)), filled: 0 };
    bucketCache.set(packing, entry);
  }
  if (entry.arr.length < packing.count) {
    const grown = new Uint8Array(Math.max(packing.count, entry.arr.length * 2));
    grown.set(entry.arr);
    entry.arr = grown;
  }
  for (let i = entry.filled; i < packing.count; i++) {
    entry.arr[i] = bucket(packing.circles[i].b, 0, 'curvature');
  }
  entry.filled = packing.count;
  return entry.arr;
}

/** Reused between frames so a redraw allocates nothing. */
const scratchBuckets = Array.from({ length: BUCKETS }, () => /** @type {number[]} */ ([]));
/** @type {number[]} */
const scratchLines = [];
/** @type {number[]} */
const scratchLabels = [];
/** Indices actually drawn last frame, for hit-testing against what the user sees. */
const scratchVisible = /** @type {number[]} */ ([]);
/** @type {Uint8Array} */
let scratchDepthBuckets = new Uint8Array(1024);

/**
 * @typedef {object} DrawOptions
 * @property {'curvature'|'depth'} [colorMode]
 * @property {'light'|'dark'} [theme]
 * @property {boolean} [labels] draw curvature numerals in circles large enough
 * @property {number} [minPixels] skip circles smaller than this on screen
 * @property {number} [maxDepth] hide circles deeper than this; 0 for no limit
 * @property {number} [highlight] index of a circle to outline, or -1
 * @property {'fill'|'stroke'} [style] how circles are drawn
 * @property {string|null} [background] colour to clear with; `null` to draw over what is
 *   already on the canvas. Defaults to the theme's background.
 */

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../math/packing.js').Packing} packing
 * @param {import('./viewport.js').Viewport} view
 * @param {DrawOptions} [options]
 * @returns {{drawn: number, skipped: number, labeled: number, visible: number[]}}
 */
export function draw(ctx, packing, view, options = {}) {
  const colorMode = options.colorMode ?? 'curvature';
  const palette = themeFor(options.theme ?? 'dark');
  const labels = options.labels ?? true;
  const minPixels = options.minPixels ?? 0.35;
  const maxDepth = options.maxDepth ?? 0;
  const highlight = options.highlight ?? -1;
  const style = options.style ?? 'fill';

  const { width, height, scale, tx, ty } = view;
  // Not `scale`: a viewport with `flipY` set draws y upward, and its yScale is negative.
  // Using scale for y silently mirrors every circle about the horizontal midline, which
  // on a zoomed view puts nearly all of them off screen — the arrangement lab drew 1 of
  // 6,821 circles. Radii still take `scale`, since |yScale| == scale and a radius is
  // unsigned. Region drawing was never affected: it goes through view.worldToScreen.
  const yScale = view.yScale;

  // Pass `background: null` to draw onto whatever is already there. The default is the
  // theme's own colour, so every existing caller is unaffected; the arrangement needs the
  // opt-out because it is drawn *over* a partition rather than instead of one, and an
  // opaque fill would erase the picture it is meant to be compared against.
  const background = options.background === undefined ? palette.background : options.background;

  ctx.save();
  if (background !== null) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }

  const xs = packing.x;
  const ys = packing.y;
  const rs = packing.r;
  const n = packing.count;

  let colors = curvatureBuckets(packing);
  if (colorMode === 'depth') {
    if (scratchDepthBuckets.length < n) scratchDepthBuckets = new Uint8Array(n * 2);
    for (let i = 0; i < n; i++) scratchDepthBuckets[i] = packing.depth[i] % BUCKETS;
    colors = scratchDepthBuckets;
  }

  for (const b of scratchBuckets) b.length = 0;
  scratchLines.length = 0;
  scratchLabels.length = 0;
  scratchVisible.length = 0;

  let drawn = 0;
  let skipped = 0;

  for (let i = 0; i < n; i++) {
    const r = rs[i];

    if (maxDepth > 0 && packing.depth[i] > maxDepth) {
      skipped++;
      continue;
    }

    if (!Number.isFinite(r)) {
      scratchLines.push(i);
      continue;
    }

    const sr = Math.abs(r) * scale;
    if (sr < minPixels) {
      skipped++;
      continue;
    }

    const sx = xs[i] * scale + tx;
    const sy = ys[i] * yScale + ty;

    if (sx + sr < 0 || sx - sr > width || sy + sr < 0 || sy - sr > height) {
      skipped++;
      continue;
    }

    if (r < 0 && style === 'fill') {
      // A bounding circle is the backdrop its contents sit on — but it is also a circle
      // with a bend, and drawing it in one flat slate said otherwise. It now takes a
      // tint of its own class, at backdrop strength.
      //
      // The class is that of the *additive inverse*: |b| mod 24, not b mod 24. Jake's
      // call, and the measurement supports it — |b|'s class is outside the packing's
      // own class set in four of the five roots checked, so the bounding circle gets a
      // hue no other circle in the picture has. Its true residue would instead share a
      // colour with every small circle in that class. Both are defensible; this one is
      // legible. See plan.md §7.3c.
      const mag = -packing.circles[i].b;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, TAU);
      ctx.fillStyle = palette.interiors[bucket(mag, 0, 'curvature')] ?? palette.interior;
      ctx.fill();
      ctx.strokeStyle = palette.rim;
      ctx.lineWidth = 1;
      ctx.stroke();
      scratchVisible.push(i);
      drawn++;
      continue;
    }

    scratchBuckets[colors[i]].push(i);
    scratchVisible.push(i);
    if (labels && sr >= LABEL_MIN_RADIUS) scratchLabels.push(i);
    drawn++;
  }

  if (style === 'stroke') ctx.lineWidth = 1;

  for (let b = 0; b < BUCKETS; b++) {
    const indices = scratchBuckets[b];
    if (indices.length === 0) continue;

    ctx.beginPath();
    for (const i of indices) {
      const sr = Math.abs(rs[i]) * scale;
      const sx = xs[i] * scale + tx;
      const sy = ys[i] * yScale + ty;
      // moveTo before each arc, or the subpaths get joined by stray line segments.
      ctx.moveTo(sx + sr, sy);
      ctx.arc(sx, sy, sr, 0, TAU);
    }
    if (style === 'stroke') {
      ctx.strokeStyle = palette.fills[b];
      ctx.stroke();
    } else {
      ctx.fillStyle = palette.fills[b];
      ctx.fill();
    }
  }

  if (scratchLines.length > 0) {
    drawLines(ctx, packing, view, scratchLines, palette.line);
  }

  const labeled = labels
    ? drawLabels(ctx, packing, view, scratchLabels, colors, palette)
    : 0;

  if (highlight >= 0 && highlight < n && Number.isFinite(rs[highlight])) {
    const sr = Math.abs(rs[highlight]) * scale;
    ctx.beginPath();
    ctx.arc(xs[highlight] * scale + tx, ys[highlight] * yScale + ty, sr, 0, TAU);
    ctx.strokeStyle = palette.highlight;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  ctx.restore();
  return { drawn, skipped, labeled, visible: scratchVisible };
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

export { NUMERAL_FONT, resetFontMetrics } from './labels.js';
