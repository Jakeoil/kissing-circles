// @ts-check

import { theme as themeFor, bucket } from '../render/palette.js';
import {
  digitMetrics, numeralSize, NUMERAL_FONT, NUMERAL_WEIGHT, LABEL_MIN_RADIUS,
} from '../render/labels.js';

/**
 * Getting a picture out of the tool and into a paper.
 *
 * PNG for slides and correspondence, SVG for print — an Apollonian packing is all
 * circles and numerals, so it vectorizes perfectly and stays sharp at any size,
 * which a screenshot does not.
 *
 * Both take the current view rather than the whole packing: what you export is what
 * you framed.
 */

const TAU = Math.PI * 2;

/**
 * @typedef {object} ExportOptions
 * @property {'curvature'|'depth'} [colorMode]
 * @property {'light'|'dark'} [theme]
 * @property {boolean} [labels]
 * @property {number} [maxDepth]
 * @property {number} [scale] multiplier on the current view size, for PNG
 */

/**
 * Render the current view to a PNG at a multiple of its on-screen size.
 *
 * @param {import('../math/packing.js').Packing} packing
 * @param {import('../render/viewport.js').Viewport} view
 * @param {ExportOptions} options
 * @param {(blob: Blob|null) => void} done
 */
export function toPNG(packing, view, options, done) {
  const factor = options.scale ?? 2;
  const width = Math.round(view.width * factor);
  const height = Math.round(view.height * factor);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));

  // Draw through the same path as the screen, scaled up: the viewport is untouched
  // and the transform does the enlarging, so the export matches what was framed.
  ctx.scale(factor, factor);

  // Imported lazily to avoid a cycle: the renderer does not know about exporting.
  import('../render/renderer.js').then(({ draw }) => {
    draw(ctx, packing, view, {
      colorMode: options.colorMode,
      theme: options.theme,
      labels: options.labels,
      maxDepth: options.maxDepth,
    });
    canvas.toBlob(done, 'image/png');
  });
}

/**
 * Render the current view as an SVG document.
 *
 * Circles are grouped by fill so the file stays small and so a vector editor shows
 * one layer per curvature class. Only what is on screen and above a fraction of a
 * pixel is emitted.
 *
 * @param {import('../math/packing.js').Packing} packing
 * @param {import('../render/viewport.js').Viewport} view
 * @param {ExportOptions} options
 * @param {CanvasRenderingContext2D} measuringContext for digit metrics
 * @returns {string}
 */
export function toSVG(packing, view, options, measuringContext) {
  const palette = themeFor(options.theme ?? 'dark');
  const colorMode = options.colorMode ?? 'curvature';
  const wantLabels = options.labels ?? true;
  const maxDepth = options.maxDepth ?? 0;
  const metrics = digitMetrics(measuringContext);

  const { width, height, scale, tx, ty } = view;

  /** @type {Map<string, string[]>} */
  const byFill = new Map();
  /** @type {string[]} */
  const labels = [];
  /** @type {string[]} */
  const backdrops = [];

  const num = (/** @type {number} */ v) => Number(v.toFixed(3));

  for (let i = 0; i < packing.count; i++) {
    const r = packing.r[i];
    if (!Number.isFinite(r)) continue;
    if (maxDepth > 0 && packing.depth[i] > maxDepth) continue;

    const sr = Math.abs(r) * scale;
    if (sr < 0.25) continue;

    const sx = packing.x[i] * scale + tx;
    const sy = packing.y[i] * scale + ty;
    if (sx + sr < 0 || sx - sr > width || sy + sr < 0 || sy - sr > height) continue;

    if (r < 0) {
      backdrops.push(
        `<circle cx="${num(sx)}" cy="${num(sy)}" r="${num(sr)}" ` +
          `fill="${palette.interior}" stroke="${palette.rim}" stroke-width="1"/>`,
      );
      continue;
    }

    const b = bucket(packing.circles[i].b, packing.depth[i], colorMode);
    const fill = palette.fills[b];
    if (!byFill.has(fill)) byFill.set(fill, []);
    /** @type {string[]} */ (byFill.get(fill)).push(
      `<circle cx="${num(sx)}" cy="${num(sy)}" r="${num(sr)}"/>`,
    );

    if (!wantLabels || sr < LABEL_MIN_RADIUS) continue;
    const text = packing.circles[i].b.toString();
    const size = numeralSize(sr, text.length, metrics);
    if (size === 0) continue;
    labels.push(
      `<text x="${num(sx)}" y="${num(sy + metrics.center * size)}" ` +
        `font-size="${size}" fill="${palette.labels[b]}">${text}</text>`,
    );
  }

  const groups = [...byFill.entries()].map(
    ([fill, circles]) => `<g fill="${fill}">${circles.join('')}</g>`,
  );

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
      `viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="${palette.background}"/>`,
    backdrops.join(''),
    groups.join(''),
    labels.length > 0
      ? `<g font-family="${xml(NUMERAL_FONT)}" font-weight="${NUMERAL_WEIGHT}" ` +
        `text-anchor="middle">${labels.join('')}</g>`
      : '',
    '</svg>',
  ].join('\n');
}

/**
 * Escape a string for use inside an XML attribute.
 *
 * Font stacks quote any family whose name has a space — `"Times New Roman"`,
 * `"LMRoman10 Oldstyle"` — and the previous version put that straight into a
 * single-quoted attribute after turning `"` into `'`, which produced
 *
 *     font-family=''LMRoman10', Georgia, serif'
 *
 * and ended the attribute at the second character. **Every exported SVG naming a
 * quoted family was malformed** — Times, Georgia (its stack quotes "Liberation Serif"),
 * EB Garamond, Crimson Pro, STIX and both Latin Moderns. Caladea alone was safe, and
 * Caladea is the default, which is why this went unnoticed until Jake exported one.
 *
 * @param {string} v
 * @returns {string}
 */
export function xml(v) {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Hand a generated file to the browser as a download.
 * @param {Blob} blob
 * @param {string} filename
 */
export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  // The anchor has to be in the document for the click to count as a user-initiated
  // navigation, and the object URL has to outlive the click — revoking it
  // immediately cancels the download before it starts.
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 10000);
}
