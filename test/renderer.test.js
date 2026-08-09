// @ts-check

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { draw } from '../src/render/renderer.js';
import {
  resetFontMetrics,
  NUMERAL_FONT,
  numeralSize,
  digitMetrics,
  setNumeralFont,
} from '../src/render/labels.js';
import { FONTS, DEFAULT_FONT, font } from '../src/render/fonts.js';
import { bucket, BUCKETS, THEMES, theme, HUE_STEP } from '../src/render/palette.js';
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
    rectFills: /** @type {string[]} */ ([]),
    fillRect(/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ w, /** @type {number} */ h) {
      calls.push({ op: 'fillRect', args: [x, y, w, h] });
      this.rectFills.push(current);
    },
    fill() {
      fills.push(current);
      calls.push({ op: 'fill', args: [] });
    },
    stroke() {
      calls.push({ op: 'stroke', args: [] });
    },
    fillText(/** @type {string} */ t, /** @type {number} */ x, /** @type {number} */ y) {
      calls.push({ op: 'fillText', args: [x, y], text: t, font: this.font });
    },
    // Stand-in for a real font: half-em digit advances, cap height 0.7 em, no
    // descender — close enough to a lining-figure serif for the geometry to matter.
    measureText(/** @type {string} */ t) {
      const match = /(\d+(?:\.\d+)?)px/.exec(this.font);
      const size = match ? parseFloat(match[1]) : 100;
      return {
        width: t.length * size * 0.5,
        actualBoundingBoxAscent: size * 0.7,
        actualBoundingBoxDescent: 0,
      };
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

  test('equal curvatures get equal colors', () => {
    assert.equal(bucket(38n, 3, 'curvature'), bucket(38n, 9, 'curvature'));
  });

  test('depth mode ignores curvature', () => {
    assert.equal(bucket(7n, 5, 'depth'), bucket(999n, 5, 'depth'));
  });

  test('both themes are complete', () => {
    for (const [name, t] of Object.entries(THEMES)) {
      assert.equal(t.fills.length, BUCKETS, name);
      assert.equal(t.labels.length, BUCKETS, name);
      for (const c of [...t.fills, ...t.labels]) assert.match(c, /^hsl\(/);
      for (const c of [t.background, t.interior, t.line]) assert.match(c, /^#/);
    }
  });

  test('the residues an Apollonian packing actually uses are far apart in hue', () => {
    // Buckets are curvature mod 24, and the classic packing only produces eight of
    // those residues. A hue map has to separate *those*, not all 24 evenly — the
    // golden angle left residues 2 and 23 under 8 degrees apart.
    const admissible = [2, 3, 6, 11, 14, 15, 18, 23];
    const hues = admissible.map((i) => (i * HUE_STEP) % 360);

    let closest = 360;
    let pair = [];
    for (let a = 0; a < hues.length; a++) {
      for (let b = a + 1; b < hues.length; b++) {
        const d = Math.min(
          Math.abs(hues[a] - hues[b]),
          360 - Math.abs(hues[a] - hues[b]),
        );
        if (d < closest) {
          closest = d;
          pair = [admissible[a], admissible[b]];
        }
      }
    }
    assert.ok(closest >= 25, `residues ${pair} are only ${closest.toFixed(1)}° apart`);
  });

  test('all 24 buckets stay distinguishable, for coloring by depth', () => {
    const hues = Array.from({ length: BUCKETS }, (_, i) => (i * HUE_STEP) % 360);
    assert.equal(new Set(hues.map((h) => h.toFixed(3))).size, BUCKETS);

    let closest = 360;
    for (let a = 0; a < BUCKETS; a++) {
      for (let b = a + 1; b < BUCKETS; b++) {
        const d = Math.min(
          Math.abs(hues[a] - hues[b]),
          360 - Math.abs(hues[a] - hues[b]),
        );
        if (d < closest) closest = d;
      }
    }
    assert.ok(closest >= 12, `closest pair of all 24 is ${closest.toFixed(1)}°`);
  });

  test('a label is always much darker than the disk it sits on', () => {
    // Contrast that holds in both themes, so numerals read against their own
    // circle rather than against the page.
    for (const [name, t] of Object.entries(THEMES)) {
      for (let i = 0; i < BUCKETS; i++) {
        const fill = Number(/(\d+)%\)$/.exec(t.fills[i])[1]);
        const label = Number(/(\d+)%\)$/.exec(t.labels[i])[1]);
        assert.ok(fill - label >= 30, `${name} bucket ${i}: ${fill}% vs ${label}%`);
      }
    }
  });

  test('the two themes differ in background', () => {
    assert.notEqual(THEMES.light.background, THEMES.dark.background);
  });

  test('theme() falls back to dark for anything unrecognized', () => {
    assert.equal(theme('light'), THEMES.light);
    assert.equal(theme('dark'), THEMES.dark);
    assert.equal(theme('chartreuse'), THEMES.dark);
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

  test('batches into at most one fill per color, plus the background', () => {
    const { view, packing } = scene();
    const ctx = stubContext();
    draw(/** @type {any} */ (ctx), packing, view);

    // Background, the bounding circle, and one per occupied color bucket.
    assert.ok(
      ctx.fills.length <= BUCKETS + 2,
      `${ctx.fills.length} fills for ${packing.count} circles`,
    );
  });

  test('honors the theme it is given', () => {
    const { view, packing } = scene();
    const dark = stubContext();
    const light = stubContext();
    draw(/** @type {any} */ (dark), packing, view, { theme: 'dark' });
    draw(/** @type {any} */ (light), packing, view, { theme: 'light' });

    assert.equal(dark.rectFills[0], THEMES.dark.background);
    assert.equal(light.rectFills[0], THEMES.light.background);
    assert.ok(dark.fills.includes(THEMES.dark.interior));
    assert.ok(light.fills.includes(THEMES.light.interior));
    assert.notDeepEqual(dark.fills, light.fills);
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

    assert.ok(on.labeled > 0, 'something should be labeled at this zoom');
    assert.equal(off.labeled, 0);
    assert.ok(on.labeled < on.drawn, 'not every circle can fit a numeral');
  });

  describe('numerals', () => {
    /**
     * Index the drawn circles so a label can be matched back to the circle it
     * belongs to. Keying on screen x alone is not enough — this packing is
     * symmetric, so many circles share an x. Curvature disambiguates, and the few
     * genuine collisions (a curvature-3 circle above and below the axis) agree on
     * radius anyway.
     *
     * @param {import('../src/math/packing.js').Packing} p
     * @param {Viewport} v
     */
    function indexCircles(p, v) {
      /** @type {Map<string, {cy: number, r: number}[]>} */
      const map = new Map();
      for (let i = 0; i < p.count; i++) {
        if (!Number.isFinite(p.r[i]) || p.r[i] <= 0) continue;
        const key = `${(p.x[i] * v.scale + v.tx).toFixed(4)}|${p.circles[i].b}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push({ cy: p.y[i] * v.scale + v.ty, r: p.r[i] * v.scale });
      }
      return map;
    }

    /** @param {{op: string, args: number[], font?: string}} call */
    const sizeOf = (call) => parseFloat(/(\d+(?:\.\d+)?)px/.exec(call.font)[1]);

    test('every numeral fits inside its circle', () => {
      // The measured fit is the whole point: a four-digit curvature must shrink
      // rather than spill over the edge of a small circle.
      const { view, packing } = scene();
      const ctx = stubContext();
      resetFontMetrics();
      draw(/** @type {any} */ (ctx), packing, view, { labels: true });

      const circles = indexCircles(packing, view);
      let checked = 0;

      for (const call of ctx.calls) {
        if (call.op !== 'fillText') continue;
        const entries = circles.get(`${call.args[0].toFixed(4)}|${call.text}`);
        assert.ok(entries, `label "${call.text}" drawn where there is no such circle`);

        const size = sizeOf(call);
        // Stub metrics: 0.5 em per digit, 0.7 em tall.
        const w = call.text.length * 0.5 * size;
        const h = 0.7 * size;
        assert.ok(
          Math.hypot(w, h) / 2 <= entries[0].r + 1e-9,
          `"${call.text}" at ${size}px overflows a circle of radius ${entries[0].r}`,
        );
        checked++;
      }
      assert.ok(checked > 5, `only checked ${checked} numerals`);
    });

    test('longer curvatures are set smaller than short ones in equal circles', () => {
      const ctx = stubContext();
      resetFontMetrics();
      const { view, packing } = scene();
      draw(/** @type {any} */ (ctx), packing, view, { labels: true });

      /** @type {Map<number, number[]>} */
      const byLength = new Map();
      for (const call of ctx.calls) {
        if (call.op !== 'fillText') continue;
        const size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(call.font)[1]);
        const n = call.text.length;
        if (!byLength.has(n)) byLength.set(n, []);
        byLength.get(n).push(size);
      }
      assert.ok(byLength.size > 1, 'need numerals of differing length to compare');
      const lengths = [...byLength.keys()].sort((a, b) => a - b);
      assert.ok(
        Math.max(...byLength.get(lengths[0])) >
          Math.max(...byLength.get(lengths[lengths.length - 1])),
        'a one-digit numeral should be able to be set larger than a long one',
      );
    });

    test('the baseline is dropped to the digits’ optical center', () => {
      // Canvas 'middle' centers the em box, which leaves digits riding high. The
      // measured offset puts the middle of the digit box on the circle's center:
      // for the stub font that is half of a 0.7 em cap height, so 0.35 em.
      const ctx = stubContext();
      resetFontMetrics();
      const { view, packing } = scene();
      draw(/** @type {any} */ (ctx), packing, view, { labels: true });

      const circles = indexCircles(packing, view);
      let checked = 0;

      for (const call of ctx.calls) {
        if (call.op !== 'fillText') continue;
        const entries = circles.get(`${call.args[0].toFixed(4)}|${call.text}`);
        if (!entries) continue;

        const expected = 0.35 * sizeOf(call);
        // A curvature can occur twice at the same x — above and below the axis —
        // so match against whichever center this label was actually drawn from.
        const matched = entries.find(
          (e) => Math.abs(call.args[1] - e.cy - expected) < 1e-6,
        );
        assert.ok(
          matched,
          `baseline ${call.args[1]} is not ${expected} below any center for "${call.text}"`,
        );
        assert.ok(call.args[1] > matched.cy, 'baseline must sit below the center');
        checked++;
      }
      assert.ok(checked > 5, `only checked ${checked} numerals`);
    });

    test('a numeral is set as large as it can be and still fit', () => {
      // The intended look: the numeral bears a constant relation to its circle,
      // filling it rather than sitting inside it as a small caption.
      const metrics = { center: 0.35, height: 0.7, advance: 0.5 };
      const r = 200;
      const size = numeralSize(r, 1, metrics);
      const w = 1 * metrics.advance * size;
      const h = metrics.height * size;

      assert.ok(h / (2 * r) > 0.6, `a single digit spans only ${(h / (2 * r)) * 100}%`);
      assert.ok(Math.hypot(w, h) / 2 <= r, 'and must still fit');
    });

    test('the ratio to the circle is the same at any scale', () => {
      const metrics = { center: 0.35, height: 0.7, advance: 0.5 };
      const small = numeralSize(50, 2, metrics) / 50;
      const large = numeralSize(500, 2, metrics) / 500;
      assert.ok(Math.abs(small - large) < 1e-3, `${small} vs ${large}`);
    });

    test('a long numeral shrinks to fit rather than overflowing', () => {
      const metrics = { center: 0.35, height: 0.7, advance: 0.5 };
      const r = 200;
      const long = numeralSize(r, 6, metrics);
      assert.ok(long < numeralSize(r, 1, metrics));
      const w = 6 * metrics.advance * long;
      const h = metrics.height * long;
      assert.ok(Math.hypot(w, h) / 2 <= r, 'must still fit inside the circle');
    });

    test('numeral size is capped by nothing at all', () => {
      // Once a numeral fills its circle, that relation must hold however far you
      // zoom: a ceiling would show up as the numeral detaching from its circle
      // partway through a zoom. An earlier viewport cap did exactly that, and
      // because it worked out to about 91px it was clamping ordinary numerals, not
      // just oversized ones.
      const metrics = { center: 0.35, height: 0.7, advance: 0.5 };
      const ratio = (/** @type {number} */ r) => numeralSize(r, 1, metrics) / r;
      const base = ratio(100);
      for (const r of [500, 5000, 50000, 500000]) {
        // The tolerance covers only the 2-decimal rounding of the font size; a
        // cap of any kind would move the ratio by orders of magnitude.
        assert.ok(
          Math.abs(ratio(r) - base) < 1e-3,
          `ratio drifted to ${ratio(r)} at radius ${r}, from ${base}`,
        );
      }
    });

    test('zooming grows the numeral exactly as it grows the circle', () => {
      const packing = generate(ROOTS.apollonian.quad, { maxCurvature: 600n });
      const sizeOfBiggest = (/** @type {number} */ zoom) => {
        const view = new Viewport(800, 600);
        view.fit({ minX: -1.05, minY: -1.05, maxX: 1.05, maxY: 1.05 });
        view.zoomAt(400, 300, zoom);
        const ctx = stubContext();
        resetFontMetrics();
        draw(/** @type {any} */ (ctx), packing, view, { labels: true });
        return Math.max(
          ...ctx.calls
            .filter((c) => c.op === 'fillText')
            .map((c) => parseFloat(/(\d+(?:\.\d+)?)px/.exec(c.font)[1])),
        );
      };

      const one = sizeOfBiggest(1);
      const four = sizeOfBiggest(4);
      assert.ok(four / one > 3.9, `numerals grew only ${four / one}x for a 4x zoom`);
    });

    test('tiny circles get no numeral at all', () => {
      const metrics = { center: 0.35, height: 0.7, advance: 0.5 };
      assert.equal(numeralSize(4, 2, metrics), 0);
      assert.equal(numeralSize(11, 2, metrics), 0);
      assert.ok(numeralSize(40, 2, metrics) > 0);
    });

    test('digitMetrics reads the font rather than assuming it', () => {
      const ctx = stubContext();
      resetFontMetrics();
      const m = digitMetrics(/** @type {any} */ (ctx));
      assert.ok(Math.abs(m.height - 0.7) < 1e-12, 'cap height from the stub font');
      assert.ok(Math.abs(m.advance - 0.5) < 1e-12, 'digit advance from the stub font');
      assert.ok(Math.abs(m.center - 0.35) < 1e-12, 'optical center from the stub font');
    });

    test('the default numeral font is the one already deployed, and every stack ends in serif', () => {
      // plan.md 7.2: adding a control must not change the default view.
      assert.equal(DEFAULT_FONT, 'caladea');
      assert.match(NUMERAL_FONT, /^Caladea/);
      for (const f of FONTS) assert.match(f.stack, /serif$/, f.id);
    });

    test('choosing a font changes the stack and clears the metrics', () => {
      const before = NUMERAL_FONT;
      setNumeralFont('garamond');
      assert.notEqual(NUMERAL_FONT, before);
      assert.match(NUMERAL_FONT, /EB Garamond/);

      // Metrics must be re-measured against the new face rather than carried over.
      const ctx = stubContext();
      const m = digitMetrics(/** @type {any} */ (ctx));
      assert.ok(m.height > 0);

      setNumeralFont(DEFAULT_FONT);
      assert.equal(NUMERAL_FONT, before);
    });

    test('an unknown font id falls back rather than throwing', () => {
      setNumeralFont('nonesuch');
      assert.match(NUMERAL_FONT, /Caladea/);
    });

    test('the catalogue is well formed', () => {
      assert.ok(FONTS.length >= 4);
      assert.equal(new Set(FONTS.map((f) => f.id)).size, FONTS.length, 'ids are unique');
      assert.ok(FONTS.some((f) => f.oldstyle), 'at least one oldstyle option');
      assert.ok(FONTS.some((f) => !f.oldstyle), 'at least one lining option');
      assert.ok(font(DEFAULT_FONT), 'the default resolves');
    });

    test('metrics are cached, and resetFontMetrics clears them', () => {
      const ctx = stubContext();
      const { view, packing } = scene();

      resetFontMetrics();
      draw(/** @type {any} */ (ctx), packing, view, { labels: true });
      const first = ctx.calls.filter((c) => c.op === 'fillText').length;

      const again = stubContext();
      draw(/** @type {any} */ (again), packing, view, { labels: true });
      assert.equal(again.calls.filter((c) => c.op === 'fillText').length, first);

      resetFontMetrics();
      const third = stubContext();
      draw(/** @type {any} */ (third), packing, view, { labels: true });
      assert.equal(third.calls.filter((c) => c.op === 'fillText').length, first);
    });
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
