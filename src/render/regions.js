// @ts-check

/**
 * Filling Schmidt's regions.
 *
 * The arrangement renderer draws circles. A region is not a circle: it is the piece of
 * plane cut out by two or three of them, and the point of Schmidt's Fig. 1 and Fig. 1*
 * is the *partition*, not the curves. Drawing the curves alone is what made the lab
 * page look like the two figures melded together.
 *
 * The method is successive clipping rather than path construction. A curvilinear
 * triangle could be traced as three arcs between its tangency points, which means
 * getting three arc directions right; clipping needs only to know, for each boundary,
 * which side the region is on — and `schmidt.geometry()` hands over an interior point
 * that answers exactly that. Clipping to the *outside* of a circle uses the even-odd
 * rule against a rectangle covering the canvas.
 */

const TAU = Math.PI * 2;

/**
 * @param {{x: number, y: number}} p
 * @param {import('../math/circle.js').Circle} boundary
 * @returns {boolean} whether the point is on the inside of this boundary
 */
function isInside(p, boundary) {
  const f = boundary.toFloat();
  if (boundary.isLine()) {
    // The line is { q : q·n = d }; "inside" is whichever side p is on.
    return p.x * f.x + p.y * f.y < boundary.lineOffset();
  }
  return Math.hypot(p.x - f.x, p.y - f.y) < Math.abs(f.r);
}

/**
 * Clip the context to one side of a straight line.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./viewport.js').Viewport} view
 * @param {import('../math/circle.js').Circle} line
 * @param {boolean} keepInside keep the side the interior point was on
 */
function clipToHalfPlane(ctx, view, line, keepInside) {
  const f = line.toFloat();
  const d = line.lineOffset();
  // A point on the line, and the direction along it.
  const px = f.x * d;
  const py = f.y * d;
  const tx = -f.y;
  const ty = f.x;

  // Far enough to cover the canvas whatever the zoom.
  const reach = (view.width + view.height) * 4 / view.scale;
  const away = keepInside ? -1 : 1;

  const corners = [
    view.worldToScreen(px + tx * reach, py + ty * reach),
    view.worldToScreen(px - tx * reach, py - ty * reach),
    view.worldToScreen(px - tx * reach + f.x * away * reach, py - ty * reach + f.y * away * reach),
    view.worldToScreen(px + tx * reach + f.x * away * reach, py + ty * reach + f.y * away * reach),
  ];

  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
  ctx.closePath();
  ctx.clip();
}

/**
 * Fill one region.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./viewport.js').Viewport} view
 * @param {{constraints: import('../math/circle.js').Circle[], interior: {x: number, y: number}}} geometry
 * @param {string} fill
 */
export function fillRegion(ctx, view, geometry, fill) {
  ctx.save();

  for (const boundary of geometry.constraints) {
    const inside = isInside(geometry.interior, boundary);

    if (boundary.isLine()) {
      clipToHalfPlane(ctx, view, boundary, inside);
      continue;
    }

    const f = boundary.toFloat();
    const c = view.worldToScreen(f.x, f.y);
    const r = Math.abs(f.r) * view.scale;

    ctx.beginPath();
    if (inside) {
      ctx.arc(c.x, c.y, r, 0, TAU);
      ctx.clip();
    } else {
      // Everything except this disc: the even-odd rule against a covering rectangle.
      ctx.rect(0, 0, view.width, view.height);
      ctx.arc(c.x, c.y, r, 0, TAU);
      ctx.clip('evenodd');
    }
  }

  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.restore();
}

/**
 * Outline a region's boundary curves, which is what makes the partition legible once
 * the fills are down.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./viewport.js').Viewport} view
 * @param {{sides: import('../math/circle.js').Circle[]}} geometry
 * @param {string} stroke
 * @param {number} [width]
 */
export function outlineRegion(ctx, view, geometry, stroke, width = 1.5) {
  ctx.save();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;

  for (const boundary of geometry.sides) {
    const f = boundary.toFloat();
    ctx.beginPath();

    if (boundary.isLine()) {
      const d = boundary.lineOffset();
      const reach = (view.width + view.height) * 4 / view.scale;
      const a = view.worldToScreen(f.x * d - f.y * reach, f.y * d + f.x * reach);
      const b = view.worldToScreen(f.x * d + f.y * reach, f.y * d - f.x * reach);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    } else {
      const c = view.worldToScreen(f.x, f.y);
      ctx.arc(c.x, c.y, Math.abs(f.r) * view.scale, 0, TAU);
    }

    ctx.stroke();
  }

  ctx.restore();
}

/**
 * A label placed at the region's interior point.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./viewport.js').Viewport} view
 * @param {{interior: {x: number, y: number}}} geometry
 * @param {string} text
 * @param {string} color
 * @param {number} [size]
 */
export function labelRegion(ctx, view, geometry, text, color, size = 17) {
  const p = view.worldToScreen(geometry.interior.x, geometry.interior.y);
  if (p.x < -40 || p.x > view.width + 40 || p.y < -40 || p.y > view.height + 40) return;

  ctx.save();
  ctx.font = `600 ${size}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, p.x, p.y);
  ctx.restore();
}
