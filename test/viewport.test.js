// @ts-check

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Viewport } from '../src/render/viewport.js';

describe('Viewport', () => {
  test('round-trips world to screen and back', () => {
    const v = new Viewport(800, 600);
    v.scale = 137.5;
    v.tx = 42;
    v.ty = -17;

    for (const [x, y] of [[0, 0], [1, -1], [-0.375, 2.5]]) {
      const s = v.worldToScreen(x, y);
      const w = v.screenToWorld(s.x, s.y);
      assert.ok(Math.abs(w.x - x) < 1e-12);
      assert.ok(Math.abs(w.y - y) < 1e-12);
    }
  });

  test('zoom holds the point under the cursor fixed', () => {
    // The Android onScale adjusted yOffset only and left xOffset alone, with a
    // comment wondering whether that was a bug. It was.
    const v = new Viewport(800, 600);
    const sx = 640;
    const sy = 120;
    const before = v.screenToWorld(sx, sy);

    v.zoomAt(sx, sy, 2.5);
    const after = v.screenToWorld(sx, sy);

    assert.ok(Math.abs(after.x - before.x) < 1e-12, 'x drifted');
    assert.ok(Math.abs(after.y - before.y) < 1e-12, 'y drifted');
  });

  test('repeated zoom about a corner still holds it', () => {
    const v = new Viewport(1000, 800);
    const before = v.screenToWorld(0, 0);
    for (let i = 0; i < 40; i++) v.zoomAt(0, 0, 1.15);
    const after = v.screenToWorld(0, 0);
    assert.ok(Math.abs(after.x - before.x) < 1e-9);
    assert.ok(Math.abs(after.y - before.y) < 1e-9);
  });

  test('panning moves the world by the screen delta', () => {
    const v = new Viewport(800, 600);
    v.scale = 200;
    const before = v.worldToScreen(0.25, -0.5);
    v.panBy(30, -70);
    const after = v.worldToScreen(0.25, -0.5);
    assert.ok(Math.abs(after.x - before.x - 30) < 1e-12);
    assert.ok(Math.abs(after.y - before.y + 70) < 1e-12);
  });

  test('fit frames the bounds and centers them', () => {
    const v = new Viewport(800, 400);
    v.fit({ minX: -1, minY: -1, maxX: 1, maxY: 1 }, 0);

    // The short axis governs.
    assert.ok(Math.abs(v.scale - 200) < 1e-12);
    const c = v.screenToWorld(400, 200);
    assert.ok(Math.abs(c.x) < 1e-12);
    assert.ok(Math.abs(c.y) < 1e-12);
  });

  test('fit leaves padding around the bounds', () => {
    // A tenth of the view left empty, split evenly: content spans 30..570 of 600.
    const v = new Viewport(600, 600);
    v.fit({ minX: -1, minY: -1, maxX: 1, maxY: 1 }, 0.1);
    const lo = v.worldToScreen(-1, -1);
    const hi = v.worldToScreen(1, 1);
    assert.ok(Math.abs(lo.x - 30) < 1e-9, `left edge at ${lo.x}`);
    assert.ok(Math.abs(hi.x - 570) < 1e-9, `right edge at ${hi.x}`);
    assert.ok(Math.abs(lo.y - 30) < 1e-9 && Math.abs(hi.y - 570) < 1e-9);
  });

  test('visibleBounds covers exactly the screen', () => {
    const v = new Viewport(800, 600);
    v.fit({ minX: -2, minY: -2, maxX: 2, maxY: 2 }, 0);
    const b = v.visibleBounds();
    const tl = v.worldToScreen(b.minX, b.minY);
    const br = v.worldToScreen(b.maxX, b.maxY);
    assert.ok(Math.abs(tl.x) < 1e-9 && Math.abs(tl.y) < 1e-9);
    assert.ok(Math.abs(br.x - 800) < 1e-9 && Math.abs(br.y - 600) < 1e-9);
  });

  test('visibleBounds margin widens symmetrically', () => {
    const v = new Viewport(800, 600);
    const tight = v.visibleBounds(0);
    const loose = v.visibleBounds(0.25);
    const w = tight.maxX - tight.minX;
    assert.ok(Math.abs(loose.minX - (tight.minX - w * 0.25)) < 1e-9);
    assert.ok(Math.abs(loose.maxX - (tight.maxX + w * 0.25)) < 1e-9);
  });

  test('worldRadius converts pixels to world units', () => {
    const v = new Viewport(800, 600);
    v.scale = 400;
    assert.equal(v.worldRadius(0.5), 0.00125);
  });

  test('resize keeps the center of the view put', () => {
    const v = new Viewport(800, 600);
    v.fit({ minX: -1, minY: -1, maxX: 1, maxY: 1 });
    const before = v.screenToWorld(400, 300);
    v.resize(1200, 500);
    const after = v.screenToWorld(600, 250);
    assert.ok(Math.abs(after.x - before.x) < 1e-9);
    assert.ok(Math.abs(after.y - before.y) < 1e-9);
  });

  test('snapshot and restore round-trip', () => {
    const v = new Viewport(800, 600);
    v.zoomAt(100, 200, 3);
    const s = v.snapshot();
    const p = v.worldToScreen(0.3, 0.7);
    v.panBy(500, -300);
    v.zoomAt(0, 0, 0.2);
    v.restore(s);
    const q = v.worldToScreen(0.3, 0.7);
    assert.ok(Math.abs(p.x - q.x) < 1e-12 && Math.abs(p.y - q.y) < 1e-12);
  });
});
