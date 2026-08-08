// @ts-check

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { draw } from '../src/render/renderer.js';
import { bucket, BUCKETS, FILLS } from '../src/render/palette.js';
import { Viewport } from '../src/render/viewport.js';
import { generate } from '../src/math/packing.js';
import { ROOTS } from '../src/math/descartes.js';

/**
 * The renderer is exercised against a recording stub rather than a real canvas.
 * That is enough to catch the things worth catching without a browser: that it
 * culls what it should, that it batches, and that it never asks the canvas to draw
 * a NaN — which is how an invisible page usually happens.
 */
function stubContext() {
  /** @type {{op: string, args: number[]}[]} */
  const calls = [];
  const fills = [];
  let current = '';

  return {
    calls,
    fills,
    get arcs() {
      return calls.filter((c) => c.op === 'arc');
    },
    get fillStyle() {
      return current;
    },
    set fillStyle(v) {
      current = v;
    },
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: '',
    textBaseline: '',
    save() {},
    restore() {},
    beginPath() {
      calls.push({ op: 'beginPath', args: [] });
    },
    moveTo(/** @type {number} */ x, /** @type {number} */ y) {
      calls.push({ op: 'moveTo', args: [x, y] });
    },
    lineTo(/** @type {number} */ x, /** @type {number} */ y) {
      calls.push({ op: 'lineTo', args: [x, y] });
    },
    arc(/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ r) {
      calls.push({ op: 'arc', args: [x, y, r] });
    },
    fillRect(/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ w, /** @type {number} */ h) {
      calls.push({ op: 'fillRect', args: [x, y, w, h] });
    },
    fill() {
      fills.push(current);
      calls.push({ op: 'fill', args: [] });
    },
    stroke() {
      calls.push({ op: 'stroke', args: [] });
    },
    fillText(/** @type {string} */ t, /** @type {number} */ x, /** @type {number} */ y) {
      calls.push({ op: 'fillText', args: [x, y] });
    },
  };
}

/** @returns {{view: Viewport, packing: import('../src/math/packing.js').Packing}} */
function scene() {
  const view = new Viewport(800, 600);
  view.fit({ minX: -1.05, minY: -1.05, maxX: 1.05, maxY: 1.05 });
  const packing = generate(ROOTS.apollonian.quad, { maxCurvature: 600n });
  return { view, packing };
}

describe('palette', () => {
  test('buckets stay in range for any curvature', () => {
    for (const b of [-1n, 0n, 2n, 23n, 24n, 10n ** 30n]) {
      const i = bucket(b, 0, 'curvature');
      assert.ok(Number.isInteger(i) && i >= 0 && i < BUCKETS, `bucket ${i} for ${b}`);
    }
  });

  test('equal curvatures get equal colours', () => {
    assert.equal(bucket(38n, 3, 'curvature'), bucket(38n, 9, 'curvature'));
  });

  test('depth mode ignores curvature', () => {
    assert.equal(bucket(7n, 5, 'depth'), bucket(999n, 5, 'depth'));
  });

  test('every fill is a usable colour string', () => {
    assert.equal(FILLS.length, BUCKETS);
    for (const f of FILLS) assert.match(f, /^hsl\(/);
  });
});

describe('renderer', () => {
  test('draws the packing and reports what it did', () => {
    const { view, packing } = scene();
    const ctx = stubContext();
    const stats = draw(/** @type {any} */ (ctx), packing, view);

    assert.ok(stats.drawn > 100, `only drew ${stats.drawn}`);
    assert.ok(stats.drawn + stats.skipped <= packing.count);
    assert.ok(ctx.arcs.length > 100);
  });

  test('never emits a NaN or a negative radius to the canvas', () => {
    const { view, packing } = scene();
    const ctx = stubContext();
    draw(/** @type {any} */ (ctx), packing, view);

    for (const call of ctx.calls) {
      for (const a of call.args) {
        assert.ok(Number.isFinite(a), `${call.op} got ${a}`);
      }
      if (call.op === 'arc') assert.ok(call.args[2] >= 0, 'negative arc radius');
    }
  });

  test('batches into at most one fill per colour, plus the background', () => {
    const { view, packing } = scene();
    const ctx = stubContext();
    draw(/** @type {any} */ (ctx), packing, view);

    // Background, the bounding circle, and one per occupied colour bucket.
    assert.ok(
      ctx.fills.length <= BUCKETS + 2,
      `${ctx.fills.length} fills for ${packing.count} circles`,
    );
  });

  test('culls circles outside the viewport', () => {
    const { packing } = scene();
    const wide = new Viewport(800, 600);
    wide.fit({ minX: -1.05, minY: -1.05, maxX: 1.05, maxY: 1.05 });

    const near = new Viewport(800, 600);
    near.fit({ minX: 0.9, minY: 0.9, maxX: 0.95, maxY: 0.95 });

    const a = draw(/** @type {any} */ (stubContext()), packing, wide);
    const b = draw(/** @type {any} */ (stubContext()), packing, near);
    assert.ok(b.drawn < a.drawn, 'a tighter view should draw fewer circles');
  });

  test('skips circles below the pixel threshold', () => {
    const { view, packing } = scene();
    const coarse = draw(/** @type {any} */ (stubContext()), packing, view, {
      minPixels: 20,
    });
    const fine = draw(/** @type {any} */ (stubContext()), packing, view, {
      minPixels: 0.1,
    });
    assert.ok(coarse.drawn < fine.drawn);
  });

  test('labels only circles big enough to hold a numeral', () => {
    const { view, packing } = scene();
    const on = draw(/** @type {any} */ (stubContext()), packing, view, { labels: true });
    const off = draw(/** @type {any} */ (stubContext()), packing, view, { labels: false });

    assert.ok(on.labelled > 0, 'something should be labelled at this zoom');
    assert.equal(off.labelled, 0);
    assert.ok(on.labelled < on.drawn, 'not every circle can fit a numeral');
  });

  test('draws the lines of the strip packing', () => {
    const view = new Viewport(800, 600);
    view.fit({ minX: -3, minY: -0.5, maxX: 3, maxY: 2.5 });
    const packing = generate(ROOTS.strip.quad, { maxDepth: 7, maxCurvature: 400n });

    const ctx = stubContext();
    draw(/** @type {any} */ (ctx), packing, view);

    assert.ok(
      ctx.calls.some((c) => c.op === 'lineTo'),
      'the two bounding lines should have been stroked',
    );
    for (const call of ctx.calls) {
      for (const a of call.args) assert.ok(Number.isFinite(a), `${call.op} got ${a}`);
    }
  });

  test('an empty packing still clears the background', () => {
    const view = new Viewport(800, 600);
    const packing = generate(ROOTS.apollonian.quad, { maxDepth: 0 });
    const ctx = stubContext();
    draw(/** @type {any} */ (ctx), packing, view);
    assert.ok(ctx.calls.some((c) => c.op === 'fillRect'));
  });
});
