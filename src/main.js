// @ts-check

import { Packing } from './math/packing.js';
import { ROOTS } from './math/descartes.js';
import { Viewport } from './render/viewport.js';
import { draw, resetFontMetrics } from './render/renderer.js';

/**
 * The viewer.
 *
 * Drag to pan, wheel or pinch to zoom, and the packing refines itself into whatever
 * you zoom into. Phase 4 is where this becomes a proper research tool — hover
 * readouts giving a circle's exact curvature and generating quadruple, custom root
 * entry, and shareable URLs.
 */

/** Initial framing for each root, since a packing does not carry its own view. */
const VIEWS = {
  apollonian: { minX: -1.05, minY: -1.05, maxX: 1.05, maxY: 1.05 },
  strip: { minX: -3.2, minY: -0.6, maxX: 3.2, maxY: 2.6 },
};

/** Screen pixels below which a circle is not worth generating. */
const RESOLUTION = 0.4;

/** How far beyond the viewport to generate, as a fraction, so panning is not empty. */
const MARGIN = 0.35;

/** Branch expansions per animation frame. */
const BUDGET = 1200;

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('view'));
const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
const hud = /** @type {HTMLElement} */ (document.getElementById('hud'));
const rootSelect = /** @type {HTMLSelectElement} */ (document.getElementById('root'));
const colorSelect = /** @type {HTMLSelectElement} */ (document.getElementById('color'));
const themeSelect = /** @type {HTMLSelectElement} */ (document.getElementById('theme'));
const labelToggle = /** @type {HTMLInputElement} */ (document.getElementById('labels'));

const view = new Viewport(canvas.clientWidth, canvas.clientHeight);

/** @type {Packing} */
let packing;
/** @type {keyof typeof VIEWS} */
let rootName = 'apollonian';
let viewDirty = true;
let refineAt = 0;

/**
 * Start over from a named root.
 * @param {keyof typeof VIEWS} name
 */
function load(name) {
  rootName = name;
  packing = new Packing(ROOTS[name].quad, limits());
  view.fit(VIEWS[name], 0.11);
  packing.refine(limits());
  viewDirty = true;
}

/** The generation limits implied by the current view. */
function limits() {
  return {
    minRadius: view.worldRadius(RESOLUTION),
    bounds: view.visibleBounds(MARGIN),
  };
}

// ----------------------------------------------------------------------- theme

const THEME_KEY = 'kc-theme';
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

/** @returns {'auto'|'light'|'dark'} */
function themePreference() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'auto') return saved;
  } catch {
    // Private browsing, or storage disabled. Fall through to the default.
  }
  return 'auto';
}

/** @returns {'light'|'dark'} the theme actually in force */
function activeTheme() {
  const pref = /** @type {'auto'|'light'|'dark'} */ (themeSelect.value);
  if (pref === 'auto') return prefersDark.matches ? 'dark' : 'light';
  return pref;
}

/** Push the current preference to the document and to storage. */
function applyTheme() {
  document.documentElement.dataset.theme = activeTheme();
  try {
    localStorage.setItem(THEME_KEY, themeSelect.value);
  } catch {
    // Not fatal — the theme still applies for this session.
  }
  viewDirty = true;
}

/** Match the backing store to the display size and pixel density. */
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  view.resize(w, h);
  viewDirty = true;
}

/** Note that the view moved; generation catches up shortly afterwards. */
function moved() {
  viewDirty = true;
  refineAt = performance.now() + 90;
}

// ---------------------------------------------------------------- interaction

/** @type {Map<number, {x: number, y: number}>} */
const pointers = new Map();
let pinchSpan = 0;

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) pinchSpan = span();
});

canvas.addEventListener('pointermove', (e) => {
  const prev = pointers.get(e.pointerId);
  if (!prev) return;
  const next = { x: e.clientX, y: e.clientY };

  if (pointers.size === 1) {
    view.panBy(next.x - prev.x, next.y - prev.y);
    pointers.set(e.pointerId, next);
    moved();
    return;
  }

  pointers.set(e.pointerId, next);
  if (pointers.size === 2) {
    const now = span();
    const mid = midpoint();
    if (pinchSpan > 0 && now > 0) {
      const rect = canvas.getBoundingClientRect();
      view.zoomAt(mid.x - rect.left, mid.y - rect.top, now / pinchSpan);
    }
    pinchSpan = now;
    moved();
  }
});

for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
  canvas.addEventListener(type, (e) => {
    pointers.delete(/** @type {PointerEvent} */ (e).pointerId);
    pinchSpan = pointers.size === 2 ? span() : 0;
  });
}

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const factor = Math.exp(-e.deltaY * 0.0016);
    view.zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
    moved();
  },
  { passive: false },
);

canvas.addEventListener('dblclick', (e) => {
  const rect = canvas.getBoundingClientRect();
  view.zoomAt(e.clientX - rect.left, e.clientY - rect.top, 2);
  moved();
});

window.addEventListener('keydown', (e) => {
  const step = 60;
  switch (e.key) {
    case '0':
      view.fit(VIEWS[rootName], 0.11);
      break;
    case '+':
    case '=':
      view.zoomAt(view.width / 2, view.height / 2, 1.3);
      break;
    case '-':
      view.zoomAt(view.width / 2, view.height / 2, 1 / 1.3);
      break;
    case 'ArrowLeft':
      view.panBy(step, 0);
      break;
    case 'ArrowRight':
      view.panBy(-step, 0);
      break;
    case 'ArrowUp':
      view.panBy(0, step);
      break;
    case 'ArrowDown':
      view.panBy(0, -step);
      break;
    case 'l':
      labelToggle.checked = !labelToggle.checked;
      break;
    case 't':
      themeSelect.value = activeTheme() === 'dark' ? 'light' : 'dark';
      applyTheme();
      break;
    default:
      return;
  }
  e.preventDefault();
  moved();
});

/** @returns {number} distance between the two active pointers */
function span() {
  const [a, b] = [...pointers.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** @returns {{x: number, y: number}} midpoint of the two active pointers */
function midpoint() {
  const [a, b] = [...pointers.values()];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

rootSelect.addEventListener('change', () =>
  load(/** @type {keyof typeof VIEWS} */ (rootSelect.value)),
);
colorSelect.addEventListener('change', () => {
  viewDirty = true;
});
labelToggle.addEventListener('change', () => {
  viewDirty = true;
});
themeSelect.addEventListener('change', applyTheme);
prefersDark.addEventListener('change', () => {
  if (themeSelect.value === 'auto') applyTheme();
});
window.addEventListener('resize', resize);

// font-display: swap paints the fallback first. Once the real font arrives the
// measured digit metrics are stale, so throw them away and redraw.
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => {
    resetFontMetrics();
    viewDirty = true;
  });
}

// ------------------------------------------------------------------ the loop

let lastFrame = performance.now();
/** Recent frame intervals; the HUD reports their median. */
const intervals = new Float64Array(30);
let intervalAt = 0;
let intervalCount = 0;

/**
 * Median of the recent frame intervals, as frames per second.
 *
 * An exponential average was misleading here: it starts at zero and takes hundreds
 * of frames to climb, so the HUD read 17 fps during the first seconds after load
 * while the page was in fact drawing at well over 60. A median over a short window
 * settles immediately and ignores the occasional long generation frame.
 *
 * @returns {number}
 */
function fps() {
  if (intervalCount < 5) return 0;
  const n = Math.min(intervalCount, intervals.length);
  const sorted = Array.prototype.slice.call(intervals, 0, n).sort((a, b) => a - b);
  return 1000 / sorted[n >> 1];
}

function frame() {
  const now = performance.now();
  intervals[intervalAt] = Math.max(now - lastFrame, 0.001);
  intervalAt = (intervalAt + 1) % intervals.length;
  intervalCount++;
  lastFrame = now;

  // Let the view settle before asking the generator to chase it.
  if (refineAt !== 0 && now >= refineAt) {
    refineAt = 0;
    packing.refine(limits());
  }

  let grew = 0;
  if (!packing.done) {
    grew = packing.grow(BUDGET).added;
    if (grew > 0) viewDirty = true;
  }

  if (viewDirty) {
    viewDirty = false;
    const stats = draw(ctx, packing, view, {
      colorMode: /** @type {'curvature'|'depth'} */ (colorSelect.value),
      theme: activeTheme(),
      labels: labelToggle.checked,
    });
    report(stats);
  }

  requestAnimationFrame(frame);
}

/** @param {{drawn: number, skipped: number, labeled: number}} stats */
function report(stats) {
  const s = packing.stats();
  hud.textContent = [
    `circles ${s.count.toLocaleString()}`,
    `drawn ${stats.drawn.toLocaleString()}`,
    `depth ${s.maxDepth}`,
    `max curvature ${s.maxCurvature.toLocaleString()}`,
    `zoom ${view.scale.toPrecision(4)}`,
    `labels ${stats.labeled}`,
    s.done ? (s.deferred > 0 ? `${s.deferred.toLocaleString()} deferred` : 'complete') : 'generating…',
    intervalCount < 5 ? '' : `${fps().toFixed(0)} fps`,
  ]
    .filter(Boolean)
    .join('   ');
}

themeSelect.value = themePreference();
applyTheme();
resize();
load('apollonian');
requestAnimationFrame(frame);
