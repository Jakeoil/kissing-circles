// @ts-check

/**
 * The world-to-screen transform.
 *
 *     screen = world * scale + translation
 *
 * Both spaces are y-down, matching the canvas and the "y-down cartesian" the Kotlin
 * DynamicView aimed at, so the transform stays a uniform scale plus a translation
 * with no flip to keep track of.
 *
 * This is a port of DynamicView.Trans with its two bugs left behind: zooming here
 * adjusts both axes about the cursor (the Android onScale adjusted only yOffset and
 * carried a comment wondering about it), and the initial fit does not mix width into
 * a vertical offset.
 *
 * No DOM: this module is pure arithmetic and is unit-tested under Node.
 */

/**
 * @typedef {{minX: number, minY: number, maxX: number, maxY: number}} Bounds
 */

export class Viewport {
  /**
   * @param {number} width in CSS pixels
   * @param {number} height in CSS pixels
   */
  constructor(width = 1, height = 1) {
    /** @type {number} */
    this.width = width;
    /** @type {number} */
    this.height = height;
    /** @type {number} pixels per world unit */
    this.scale = 1;
    /** @type {number} */
    this.tx = width / 2;
    /** @type {number} */
    this.ty = height / 2;
  }

  /**
   * Resize while keeping the world point at the center of the view centered.
   * @param {number} width
   * @param {number} height
   */
  resize(width, height) {
    const center = this.screenToWorld(this.width / 2, this.height / 2);
    this.width = width;
    this.height = height;
    this.centerOn(center.x, center.y);
  }

  /**
   * @param {number} x
   * @param {number} y
   * @returns {{x: number, y: number}}
   */
  worldToScreen(x, y) {
    return { x: x * this.scale + this.tx, y: y * this.scale + this.ty };
  }

  /**
   * @param {number} sx
   * @param {number} sy
   * @returns {{x: number, y: number}}
   */
  screenToWorld(sx, sy) {
    return { x: (sx - this.tx) / this.scale, y: (sy - this.ty) / this.scale };
  }

  /**
   * Put a world point at the center of the view.
   * @param {number} x
   * @param {number} y
   */
  centerOn(x, y) {
    this.tx = this.width / 2 - x * this.scale;
    this.ty = this.height / 2 - y * this.scale;
  }

  /**
   * Drag the view by a screen-space delta.
   * @param {number} dx
   * @param {number} dy
   */
  panBy(dx, dy) {
    this.tx += dx;
    this.ty += dy;
  }

  /**
   * Zoom about a fixed screen point — the point under the cursor stays under it.
   * @param {number} sx
   * @param {number} sy
   * @param {number} factor greater than 1 zooms in
   */
  zoomAt(sx, sy, factor) {
    const w = this.screenToWorld(sx, sy);
    this.scale *= factor;
    this.tx = sx - w.x * this.scale;
    this.ty = sy - w.y * this.scale;
  }

  /**
   * Frame a world rectangle, with a little room around it.
   * @param {Bounds} bounds
   * @param {number} [padding] fraction of the view to leave empty
   */
  fit(bounds, padding = 0.06) {
    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;
    const sx = w > 0 ? this.width / w : 1;
    const sy = h > 0 ? this.height / h : 1;
    this.scale = Math.min(sx, sy) * (1 - padding);
    this.centerOn((bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2);
  }

  /**
   * The world rectangle currently on screen.
   * @param {number} [margin] fraction of the view to extend by on each side, so a
   *   small pan does not immediately expose ungenerated space
   * @returns {Bounds}
   */
  visibleBounds(margin = 0) {
    const a = this.screenToWorld(0, 0);
    const b = this.screenToWorld(this.width, this.height);
    const mx = (b.x - a.x) * margin;
    const my = (b.y - a.y) * margin;
    return {
      minX: a.x - mx,
      minY: a.y - my,
      maxX: b.x + mx,
      maxY: b.y + my,
    };
  }

  /**
   * The world radius corresponding to a given number of screen pixels. This is what
   * the generator wants as its resolution limit.
   * @param {number} pixels
   * @returns {number}
   */
  worldRadius(pixels) {
    return pixels / this.scale;
  }

  /** @returns {{scale: number, tx: number, ty: number}} */
  snapshot() {
    return { scale: this.scale, tx: this.tx, ty: this.ty };
  }

  /** @param {{scale: number, tx: number, ty: number}} s */
  restore(s) {
    this.scale = s.scale;
    this.tx = s.tx;
    this.ty = s.ty;
  }
}
