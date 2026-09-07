// @ts-check

import { ROOTS, reflectQuad, validateQuad } from '../math/descartes.js';
import { Packing } from '../math/packing.js';
import { Viewport } from '../render/viewport.js';
import { draw } from '../render/renderer.js';
import { theme as themeFor } from '../render/palette.js';
import { drawNumeral, digitMetrics } from '../render/labels.js';

/**
 * Turning a packing inside out — as a canvas module.
 *
 * The drawing half of `labs/outward.html`, packaged so a page is a container element, a
 * config object and some controls. See MODULES.md: it takes a `container` rather than
 * looking its own DOM up, owns and sizes its canvas, needs no stylesheet, and hands back
 * verbs rather than state.
 *
 * The experiment itself: the Vieta recursion only ever goes inward. Reflect a whole
 * quadruple in one of its own circles and you go the other way, out through the strip and
 * on. `X ↦ X + 2⟨X,C⟩·C`, linear in the augmented coordinates, so it never leaves
 * `ℤ × ℤ[i]` and the bends stay exact however far out the walk goes.
 *
 * What is deliberately *not* in here: the trail, the HUD, the root picker, the note. Those
 * are a page's business, and `onChange` gives a page everything it needs to render them.
 */

/**
 * @typedef {object} OutwardConfig
 * @property {HTMLElement} container where to mount
 * @property {import('../math/circle.js').Circle[]} [quad] the quadruple to start from
 * @property {boolean} [showPacking] draw the packing it generates, faintly, behind
 * @property {'light'|'dark'} [theme]
 * @property {number} [width] pins the size; omit to follow the container
 * @property {number} [height]
 * @property {(state: OutwardState) => void} [onChange] called after every move
 */

/**
 * @typedef {object} OutwardState
 * @property {import('../math/circle.js').Circle[][]} chain every quadruple visited
 * @property {import('../math/circle.js').Circle[]} quad the one showing now
 * @property {number} step how many moves in
 * @property {number} arrivedThrough index of the circle arrived through, or −1
 * @property {boolean} canGoBack
 */

/**
 * @typedef {object} OutwardHandle
 * @property {(patch: {quad?: import('../math/circle.js').Circle[], showPacking?: boolean,
 *   theme?: 'light'|'dark'}) => void} set
 * @property {(i: number) => boolean} reflect turn inside out through circle `i`
 * @property {() => void} back
 * @property {(quad?: import('../math/circle.js').Circle[]) => void} reset
 * @property {() => OutwardState} getState a copy, not the live chain
 * @property {() => {packing: object, view: Viewport, options: object}} exportSpec
 * @property {() => HTMLCanvasElement} getCanvas
 * @property {() => void} redraw
 * @property {() => void} destroy
 */

const HOVER = '#ffd479';
const CAME = '#8b949e';

/**
 * @param {OutwardConfig} config
 * @returns {OutwardHandle}
 */
export function createOutwardView(config) {
  const box = config.container;

  // Private state, in the closure.
  let showPacking = config.showPacking ?? true;
  let palette = themeFor(config.theme ?? 'dark');
  let chain = [config.quad ?? ROOTS.apollonian.quad];
  let arrivedThrough = -1;
  let hovered = -1;
  /** @type {{i: number, line: boolean, x?: number, y?: number, r?: number, nx?: number, ny?: number, d?: number}[]} */
  let hits = [];

  // Own the canvas, and position it without help from any stylesheet. A container left
  // `static` cannot hold an absolutely positioned child where we want it, so it is nudged
  // to `relative` — but a container the page already positioned is left alone.
  if (getComputedStyle(box).position === 'static') box.style.position = 'relative';
  const canvas = document.createElement('canvas');
  canvas.style.position = 'absolute';
  canvas.style.inset = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  canvas.style.touchAction = 'none';
  canvas.style.cursor = 'crosshair';
  box.appendChild(canvas);
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));

  const view = new Viewport(1, 1);

  /** A size named in the config pins the view; otherwise the container decides. */
  const pinned = config.width !== undefined && config.height !== undefined;

  function measure() {
    if (pinned) return { w: /** @type {number} */ (config.width), h: /** @type {number} */ (config.height) };
    const r = box.getBoundingClientRect();
    return { w: Math.round(r.width) || 400, h: Math.round(r.height) || 400 };
  }

  function fitCanvas() {
    const { w, h } = measure();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    if (pinned) {
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    view.resize(w, h);
  }

  /** Frame the quadruple: its bounding circle, or a window round it when it has none. */
  function frame(quad) {
    const bounding = quad.find((c) => c.b < 0n);
    if (bounding) {
      const f = bounding.toFloat();
      const r = Math.abs(f.r) * 1.08;
      return { minX: f.x - r, minY: f.y - r, maxX: f.x + r, maxY: f.y + r };
    }
    // A strip has no bounding circle, and its orientation is whatever the reflection left
    // it in — the first one out of (−1, 2, 2, 3) is vertical — so frame a square window
    // round the finite circles rather than assuming it lies flat.
    const finite = quad.filter((c) => c.b !== 0n).map((c) => c.toFloat());
    if (finite.length === 0) return { minX: -2, minY: -2, maxX: 2, maxY: 2 };
    const cx = finite.reduce((s, f) => s + f.x, 0) / finite.length;
    const cy = finite.reduce((s, f) => s + f.y, 0) / finite.length;
    const rr = Math.max(...finite.map((f) => Math.abs(f.r)));
    const reach = 3.4 * rr;
    return { minX: cx - reach, minY: cy - reach, maxX: cx + reach, maxY: cy + reach };
  }

  const bucket = (b) => Number(((b % 24n) + 24n) % 24n);

  function redraw() {
    const quad = chain[chain.length - 1];
    view.fit(frame(quad), 0.06);

    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, view.width, view.height);

    // The packing this quadruple generates, faint, for context: the outward move reads
    // far better when you can see what it is turning inside out.
    if (showPacking) {
      const pk = new Packing(quad, {
        minRadius: view.worldRadius(0.6),
        bounds: view.visibleBounds(0.2),
      });
      pk.grow(Infinity);
      ctx.save();
      ctx.globalAlpha = 0.32;
      draw(ctx, pk, view, { colorMode: 'curvature', theme: 'dark', labels: false, background: null });
      ctx.restore();
    }

    // The four circles themselves, on top and unmissable.
    hits = [];
    const metrics = digitMetrics(ctx);
    quad.forEach((c, i) => {
      const f = c.toFloat();
      const came = i === arrivedThrough;
      if (!Number.isFinite(f.r)) {
        // A line is a circle of bend 0 here, and just as clickable as the others.
        const nx = f.x;
        const ny = f.y;
        const d = c.lineOffset();
        const reach = (view.width + view.height) / view.scale;
        const a = view.worldToScreen(nx * d - ny * reach, ny * d + nx * reach);
        const b = view.worldToScreen(nx * d + ny * reach, ny * d - nx * reach);
        ctx.strokeStyle = i === hovered ? HOVER : (came ? CAME : '#7ee2b8');
        ctx.lineWidth = i === hovered ? 4 : 2.5;
        if (came) ctx.setLineDash([7, 6]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.setLineDash([]);
        hits.push({ i, line: true, nx, ny, d });
        return;
      }
      const p = view.worldToScreen(f.x, f.y);
      const sr = Math.abs(f.r) * view.scale;
      ctx.beginPath();
      ctx.arc(p.x, p.y, sr, 0, Math.PI * 2);
      ctx.strokeStyle = i === hovered ? HOVER : came ? CAME : palette.fills[bucket(c.b)];
      ctx.lineWidth = i === hovered ? 3.5 : 2;
      if (came) ctx.setLineDash([7, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
      if (i === hovered) { ctx.fillStyle = 'rgba(255, 212, 121, 0.12)'; ctx.fill(); }
      drawNumeral(ctx, view, c, String(c.b),
        i === hovered ? HOVER : palette.fills[bucket(c.b)], metrics);
      hits.push({ i, line: false, x: p.x, y: p.y, r: sr });
    });
  }

  function state() {
    return {
      // Copies. The chain is the module's own record of where the walk has been, and a
      // page that could splice it would be able to invalidate `arrivedThrough`.
      chain: chain.map((q) => q.slice()),
      quad: chain[chain.length - 1].slice(),
      step: chain.length - 1,
      arrivedThrough,
      canGoBack: chain.length > 1,
    };
  }

  function announce() {
    redraw();
    if (config.onChange) config.onChange(state());
  }

  /** Nearest boundary wins, so a small circle inside a big one is still reachable. */
  function pick(sx, sy) {
    let best = -1;
    let bestD = 14;
    for (const h of hits) {
      const d = h.line
        ? Math.abs((sx - view.tx) / view.scale * /** @type {number} */ (h.nx)
            + (sy - view.ty) / view.yScale * /** @type {number} */ (h.ny)
            - /** @type {number} */ (h.d)) * view.scale
        : Math.abs(Math.hypot(sx - /** @type {number} */ (h.x), sy - /** @type {number} */ (h.y))
            - /** @type {number} */ (h.r));
      if (d < bestD) { bestD = d; best = h.i; }
    }
    return best;
  }

  function reflect(i) {
    if (i < 0 || i > 3) return false;
    const out = reflectQuad(chain[chain.length - 1], i);
    if (!validateQuad(out).ok) return false;
    chain.push(out);
    arrivedThrough = i;
    hovered = -1;
    announce();
    return true;
  }

  const onMove = (e) => {
    const r = canvas.getBoundingClientRect();
    const next = pick(e.clientX - r.left, e.clientY - r.top);
    if (next !== hovered) { hovered = next; redraw(); }
  };
  const onLeave = () => { if (hovered !== -1) { hovered = -1; redraw(); } };
  const onClick = (e) => {
    const r = canvas.getBoundingClientRect();
    reflect(pick(e.clientX - r.left, e.clientY - r.top));
  };
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('click', onClick);

  // Follow the container, unless the page named a size. A ResizeObserver rather than a
  // window listener: the module has no idea why its box changed, only that it did.
  const ro = new ResizeObserver(() => {
    if (pinned) return;
    const r = box.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return;
    fitCanvas();
    redraw();
  });
  ro.observe(box);

  fitCanvas();
  redraw();

  return {
    set(patch) {
      if (patch.showPacking !== undefined) showPacking = patch.showPacking;
      if (patch.theme !== undefined) palette = themeFor(patch.theme);
      if (patch.quad !== undefined) { chain = [patch.quad]; arrivedThrough = -1; hovered = -1; }
      announce();
    },
    reflect,
    back() {
      if (chain.length > 1) chain.pop();
      arrivedThrough = -1;
      announce();
    },
    reset(quad) {
      chain = [quad ?? chain[0]];
      arrivedThrough = -1;
      hovered = -1;
      announce();
    },
    getState: state,
    exportSpec() {
      // Everything `toSVG` needs, with a *copy* of the viewport rather than the live one.
      const quad = chain[chain.length - 1];
      const f = quad.map((c) => c.toFloat());
      const shot = new Viewport(view.width, view.height);
      shot.restore(view.snapshot());
      return {
        packing: {
          circles: quad, count: 4,
          x: Float64Array.from(f.map((v) => v.x)),
          y: Float64Array.from(f.map((v) => v.y)),
          r: Float64Array.from(f.map((v) => v.r)),
          depth: Int32Array.from([0, 0, 0, 0]),
        },
        view: shot,
        options: { colorMode: 'curvature', theme: 'dark', labels: true },
      };
    },
    getCanvas: () => canvas,
    redraw,
    destroy() {
      ro.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('click', onClick);
      canvas.remove();
    },
  };
}
