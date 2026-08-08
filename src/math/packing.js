// @ts-check

import { Circle } from './circle.js';

/**
 * Generation of an Apollonian packing by Descartes reflection.
 *
 * This is the real generator. Three things distinguish it from the naive recursion
 * in the test helpers:
 *
 *   - It uses an explicit stack. Depth 25+ in a wide packing would overflow the JS
 *     call stack, and an explicit stack is also what makes generation *resumable*.
 *   - Work is budgeted. `grow(n)` expands at most n frames and returns, so the
 *     caller can spread generation across animation frames without blocking.
 *   - Branches pruned by resolution or viewport are *deferred*, not discarded. When
 *     the user zooms in, `refine()` requeues them rather than restarting from the
 *     root. This is what makes deep zoom affordable.
 *
 * Nothing here imports from the renderer. The generator is told a minimum world
 * radius and a world-space rectangle; converting pixels into those is the caller's
 * job. The module runs under bare Node with no DOM.
 */

/**
 * @typedef {{minX: number, minY: number, maxX: number, maxY: number}} Bounds
 */

/**
 * @typedef {object} Limits
 * @property {number} [maxDepth] maximum reflection depth
 * @property {bigint|null} [maxCurvature] stop at curvatures beyond this
 * @property {number} [minRadius] stop when a circle is smaller than this, in world units
 * @property {Bounds|null} [bounds] world rectangle to generate within; null for everywhere
 */

/**
 * @typedef {object} Frame
 * @property {Circle[]} quad the four circles
 * @property {number} born index of the circle this frame introduced, -1 for the root
 * @property {number} depth
 */

const DEFAULT_LIMITS = {
  maxDepth: 64,
  maxCurvature: /** @type {bigint|null} */ (null),
  minRadius: 0,
  bounds: /** @type {Bounds|null} */ (null),
};

/**
 * Where two circles touch.
 *
 *     T = (b1*z1 + b2*z2) / (b1 + b2)
 *
 * which falls straight out of substituting z = bz/b and r = 1/b into the usual
 * weighted midpoint. It needs no special case for lines or for a bounding circle of
 * negative curvature — the only degenerate case is b1 + b2 = 0, which means two
 * parallel lines meeting at infinity.
 *
 * Computed in floats: this feeds culling decisions, not the packing itself.
 *
 * @param {Circle} c1
 * @param {Circle} c2
 * @returns {{x: number, y: number}|null} null when the touch point is at infinity
 */
export function tangencyPoint(c1, c2) {
  const denom = c1.b + c2.b;
  if (denom === 0n) return null;
  const d = Number(denom);
  return {
    x: Number(c1.bz.re + c2.bz.re) / d,
    y: Number(c1.bz.im + c2.bz.im) / d,
  };
}

/**
 * A conservative world-space box containing everything a branch can ever produce.
 *
 * Every circle descended from a triple lies in the curvilinear triangle between
 * those three circles. When all three curve *away* from that region — that is, when
 * every curvature is non-negative — each of its three boundary arcs bulges inward,
 * so the region is contained in the flat triangle joining the three tangency points.
 * The bounding box of those points is therefore a bound on the whole subtree.
 *
 * The argument fails if any of the three has negative curvature: a bounding circle's
 * arc bulges the wrong way and the region escapes the triangle. In that case we
 * return null and the caller declines to cull. That costs nothing in practice — only
 * branches within a step or two of the root involve the bounding circle.
 *
 * @param {Circle} c1
 * @param {Circle} c2
 * @param {Circle} c3
 * @returns {Bounds|null} null when no bound is available
 */
export function branchBounds(c1, c2, c3) {
  if (c1.b < 0n || c2.b < 0n || c3.b < 0n) return null;

  const t12 = tangencyPoint(c1, c2);
  const t23 = tangencyPoint(c2, c3);
  const t31 = tangencyPoint(c3, c1);
  if (t12 === null || t23 === null || t31 === null) return null;

  return {
    minX: Math.min(t12.x, t23.x, t31.x),
    minY: Math.min(t12.y, t23.y, t31.y),
    maxX: Math.max(t12.x, t23.x, t31.x),
    maxY: Math.max(t12.y, t23.y, t31.y),
  };
}

/**
 * @param {Bounds} a
 * @param {Bounds} b
 * @returns {boolean}
 */
function overlaps(a, b) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

/**
 * A growing packing.
 *
 * Circles are held twice: once exactly, as Circle objects, and once as parallel
 * Float64Arrays of centers and radii for the renderer to walk without ever touching
 * a BigInt. A tree of a million small objects would thrash the collector during
 * pan; flat arrays do not.
 */
export class Packing {
  /**
   * @param {Circle[]} root a valid Descartes quadruple
   * @param {Limits} [limits]
   */
  constructor(root, limits = {}) {
    /** @type {Circle[]} */
    this.root = root;
    /** @type {Required<Limits>} */
    this.limits = { ...DEFAULT_LIMITS, ...limits };

    /** @type {Circle[]} exact representation, indexed alongside the typed arrays */
    this.circles = [];
    /** @type {Float64Array} center x, world units */
    this.x = new Float64Array(1024);
    /** @type {Float64Array} center y, world units */
    this.y = new Float64Array(1024);
    /** @type {Float64Array} signed radius; Infinity for a line */
    this.r = new Float64Array(1024);
    /** @type {Int32Array} */
    this.depth = new Int32Array(1024);
    /** @type {number} */
    this.count = 0;

    /** @type {Set<string>} */
    this._seen = new Set();
    /** @type {Frame[]} branches still to expand */
    this._stack = [];
    /** @type {Frame[]} branches pruned by resolution or viewport, kept for refine() */
    this._deferred = [];
    /** @type {number} */
    this.maxDepthReached = 0;
    /** @type {bigint} */
    this.maxCurvatureReached = 0n;

    this._stack.push({ quad: root, born: -1, depth: 0 });
  }

  /** @returns {boolean} true when nothing is left to expand under the current limits */
  get done() {
    return this._stack.length === 0;
  }

  /** @returns {number} branches deferred by the current limits */
  get deferredCount() {
    return this._deferred.length;
  }

  /** @returns {number} branches waiting to be expanded */
  get pendingCount() {
    return this._stack.length;
  }

  /**
   * Expand up to `budget` branches.
   *
   * Returns the number of new circles produced, so a caller can keep going until it
   * has enough or until its frame time is spent.
   *
   * @param {number} [budget] maximum branches to expand
   * @returns {{added: number, expanded: number, done: boolean}}
   */
  grow(budget = Infinity) {
    let added = 0;
    let expanded = 0;

    while (this._stack.length > 0 && expanded < budget) {
      const frame = /** @type {Frame} */ (this._stack.pop());
      expanded++;
      added += this._expand(frame);
    }

    return { added, expanded, done: this._stack.length === 0 };
  }

  /**
   * Widen or move the limits and requeue everything they now admit.
   *
   * Generation continues from the deferred branches rather than from the root, so
   * zooming in costs only the newly visible detail. Circles already produced stay
   * produced.
   *
   * @param {Limits} limits fields to change; omitted fields keep their current value
   * @returns {number} branches requeued
   */
  refine(limits) {
    this.limits = { ...this.limits, ...limits };

    // Re-test every deferred branch rather than requeueing blindly. A branch held
    // back by the curvature limit must stay held back when only the viewport moved,
    // and a frame on the stack is expanded unconditionally — so admission has to be
    // decided here, not later.
    const pending = this._deferred;
    this._deferred = [];
    let requeued = 0;

    for (const frame of pending) {
      if (this._admits(frame)) {
        this._stack.push(frame);
        requeued++;
      } else {
        this._deferred.push(frame);
      }
    }

    return requeued;
  }

  /**
   * Expand one branch: emit its new circle, then push or defer its four children.
   * @param {Frame} frame
   * @returns {number} circles emitted
   */
  _expand(frame) {
    const { quad, born, depth } = frame;
    let added = 0;

    if (born < 0) {
      for (const c of quad) added += this._emit(c, depth) ? 1 : 0;
    } else {
      added += this._emit(quad[born], depth) ? 1 : 0;
    }

    for (let i = 0; i < 4; i++) {
      // Reflecting the circle we just arrived by would simply undo the step.
      if (i === born) continue;

      const next = quad[i].spawn(quad[(i + 1) & 3], quad[(i + 2) & 3], quad[(i + 3) & 3]);
      const child = quad.slice();
      child[i] = next;
      /** @type {Frame} */
      const childFrame = { quad: child, born: i, depth: depth + 1 };

      if (this._admits(childFrame)) {
        this._stack.push(childFrame);
      } else {
        this._deferred.push(childFrame);
      }
    }

    return added;
  }

  /**
   * Should this branch be expanded now, or held for a later refine()?
   *
   * Every limit is checked here, depth included, so that every exclusion is
   * reversible: a branch turned away is kept in `_deferred` and reconsidered
   * whenever the limits change. Dropping a branch outright would make the
   * corresponding limit a one-way door.
   *
   * @param {Frame} frame
   * @returns {boolean}
   */
  _admits(frame) {
    const { quad, born, depth } = frame;
    const { maxDepth, maxCurvature, minRadius, bounds } = this.limits;

    if (depth > maxDepth) return false;

    const next = quad[born];

    if (maxCurvature !== null && (next.b > maxCurvature || next.b < -maxCurvature)) {
      return false;
    }

    // Curvature grows monotonically down a branch, so a circle already below the
    // resolution limit has no visible descendants either.
    if (minRadius > 0 && !next.isLine()) {
      if (Math.abs(1 / Number(next.b)) < minRadius) return false;
    }

    if (bounds !== null) {
      const box = branchBounds(
        quad[(born + 1) & 3],
        quad[(born + 2) & 3],
        quad[(born + 3) & 3],
      );
      if (box !== null && !overlaps(box, bounds)) return false;
    }

    return true;
  }

  /**
   * Record a circle, unless an identical one is already present.
   * @param {Circle} circle
   * @param {number} depth
   * @returns {boolean} true when it was new
   */
  _emit(circle, depth) {
    const key = circle.key();
    if (this._seen.has(key)) return false;
    this._seen.add(key);

    if (this.count === this.x.length) this._grow();

    const f = circle.toFloat();
    const i = this.count;
    this.circles[i] = circle;
    this.x[i] = f.x;
    this.y[i] = f.y;
    this.r[i] = f.r;
    this.depth[i] = depth;
    this.count++;

    if (depth > this.maxDepthReached) this.maxDepthReached = depth;
    const mag = circle.b < 0n ? -circle.b : circle.b;
    if (mag > this.maxCurvatureReached) this.maxCurvatureReached = mag;

    return true;
  }

  /** Double the capacity of the parallel arrays. */
  _grow() {
    const n = this.x.length * 2;
    const x = new Float64Array(n);
    const y = new Float64Array(n);
    const r = new Float64Array(n);
    const depth = new Int32Array(n);
    x.set(this.x);
    y.set(this.y);
    r.set(this.r);
    depth.set(this.depth);
    this.x = x;
    this.y = y;
    this.r = r;
    this.depth = depth;
  }

  /** @returns {object} a summary, for the UI and for tests */
  stats() {
    return {
      count: this.count,
      pending: this._stack.length,
      deferred: this._deferred.length,
      maxDepth: this.maxDepthReached,
      maxCurvature: this.maxCurvatureReached,
      done: this.done,
    };
  }
}

/**
 * Generate a packing to completion under fixed limits. Convenience for tests and
 * for offline analysis; interactive callers should use grow() with a budget.
 *
 * @param {Circle[]} root
 * @param {Limits} limits
 * @returns {Packing}
 */
export function generate(root, limits = {}) {
  const packing = new Packing(root, limits);
  packing.grow();
  return packing;
}
