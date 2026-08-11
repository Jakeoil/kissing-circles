// @ts-check

import { Packing } from './math/packing.js';
import {
  ROOTS,
  rootFromCurvatures,
  fourthCurvature,
  descartesReal,
  primitiveForm,
} from './math/descartes.js';
import { Viewport } from './render/viewport.js';
import { draw, resetFontMetrics } from './render/renderer.js';
import { setNumeralFont } from './render/labels.js';
import { FONTS, DEFAULT_FONT, font as fontById, ensureLoaded } from './render/fonts.js';
import { describe } from './ui/readout.js';
import { analyze } from './math/analysis.js';
import { encode, decode, encodeCurvatures, decodeCurvatures } from './ui/share.js';
import { toPNG, toSVG, download } from './ui/export.js';
import { BUILD } from './build.js';

/**
 * The viewer.
 *
 * Drag to pan, wheel or pinch to zoom, and the packing refines itself into whatever
 * you zoom into. Phase 4 is where this becomes a proper research tool — hover
 * readouts giving a circle's exact curvature and generating quadruple, custom root
 * entry, and shareable URLs.
 */

/**
 * Framing for a root, since a packing does not carry its own view.
 *
 * For a bounded packing the bounding circle is the frame. For the strip, and for
 * anything else without one, fall back to a fixed window.
 *
 * @param {import('./math/circle.js').Circle[]} quad
 * @returns {{minX: number, minY: number, maxX: number, maxY: number}}
 */
function framing(quad) {
  const bounding = quad.find((c) => c.b < 0n);
  if (bounding) {
    const f = bounding.toFloat();
    const r = Math.abs(f.r) * 1.05;
    return { minX: f.x - r, minY: f.y - r, maxX: f.x + r, maxY: f.y + r };
  }
  return { minX: -3.2, minY: -0.6, maxX: 3.2, maxY: 2.6 };
}

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
const fontSelect = /** @type {HTMLSelectElement} */ (document.getElementById('font'));
const labelToggle = /** @type {HTMLInputElement} */ (document.getElementById('labels'));
const customInput = /** @type {HTMLInputElement} */ (document.getElementById('custom'));
const errorBox = /** @type {HTMLElement} */ (document.getElementById('error'));
const offersBox = /** @type {HTMLElement} */ (document.getElementById('custom-offers'));
const readout = /** @type {HTMLElement} */ (document.getElementById('readout'));
const depthReadout = /** @type {HTMLElement} */ (document.getElementById('depth-readout'));
const buildBox = /** @type {HTMLElement} */ (document.getElementById('build'));
const analyzeButton = /** @type {HTMLButtonElement} */ (document.getElementById('analyze'));
const analysisPanel = /** @type {HTMLElement} */ (document.getElementById('analysis'));
const analysisBody = /** @type {HTMLElement} */ (document.getElementById('analysis-body'));
const analysisClose = /** @type {HTMLButtonElement} */ (document.getElementById('analysis-close'));
const shareButton = /** @type {HTMLButtonElement} */ (document.getElementById('share'));
const pngButton = /** @type {HTMLButtonElement} */ (document.getElementById('png'));
const svgButton = /** @type {HTMLButtonElement} */ (document.getElementById('svg'));
const shareRow = /** @type {HTMLElement} */ (document.getElementById('share-row'));
const shareField = /** @type {HTMLInputElement} */ (document.getElementById('share-url'));
const shareNote = /** @type {HTMLElement} */ (document.getElementById('share-note'));
const shareClose = /** @type {HTMLButtonElement} */ (document.getElementById('share-close'));

buildBox.textContent = `build ${BUILD}`;

const view = new Viewport(canvas.clientWidth, canvas.clientHeight);

/** @type {Packing} */
let packing;
/** @type {import('./math/circle.js').Circle[]} */
let rootQuad = ROOTS.apollonian.quad;
/** How the current root is named in a shared link. */
let rootId = 'apollonian';
/** @type {{minX: number, minY: number, maxX: number, maxY: number}} */
let home = framing(rootQuad);
let viewDirty = true;
let refineAt = 0;

/** Display-only depth limit; 0 means show everything. */
let displayDepth = 0;
/** Generation is paused, so the packing can be watched at a fixed level of detail. */
let paused = false;
/** Index of the circle under the cursor, or -1. */
let hovered = -1;
/** Indices drawn last frame, for hit-testing against what is actually on screen. */
let visible = /** @type {number[]} */ ([]);
/** Last cursor position in screen coordinates, or null when it left the canvas. */
let cursor = /** @type {{x: number, y: number}|null} */ (null);

for (const [key, root] of Object.entries(ROOTS)) {
  const option = document.createElement('option');
  option.value = key;
  option.textContent = root.name;
  rootSelect.append(option);
}
rootSelect.value = 'apollonian';

/**
 * Start over from a root quadruple.
 * @param {import('./math/circle.js').Circle[]} quad
 */
function load(quad, id = rootId) {
  rootQuad = quad;
  rootId = id;
  home = framing(quad);
  packing = new Packing(quad, limits());
  view.fit(home, 0.11);
  packing.refine(limits());
  hovered = -1;
  displayDepth = 0;
  viewDirty = true;
}

/** The generation limits implied by the current view. */
function limits() {
  return {
    minRadius: view.worldRadius(RESOLUTION),
    bounds: view.visibleBounds(MARGIN),
  };
}

// ------------------------------------------------------------------ numerals

const FONT_KEY = 'kc-font';

for (const f of FONTS) {
  const option = document.createElement('option');
  option.value = f.id;
  option.textContent = f.label;
  fontSelect.append(option);
}

/** @returns {string} */
function fontPreference() {
  try {
    const saved = localStorage.getItem(FONT_KEY);
    if (saved && FONTS.some((f) => f.id === saved)) return saved;
  } catch {
    // Storage unavailable; the default is fine.
  }
  return DEFAULT_FONT;
}

/**
 * Switch the numeral face.
 *
 * A self-hosted face is not fetched until something asks for it, and canvas falls
 * back silently rather than waiting — so the font has to be loaded before the first
 * draw, or that frame is both drawn and *measured* in the wrong typeface.
 *
 * @param {string} id
 */
async function applyFont(id) {
  const chosen = fontById(id);
  fontSelect.value = chosen.id;
  document.documentElement.style.setProperty('--numeral-font', chosen.stack);
  try {
    localStorage.setItem(FONT_KEY, chosen.id);
  } catch {
    // Not fatal.
  }

  await ensureLoaded(chosen.id);
  setNumeralFont(chosen.id);
  resetFontMetrics();
  viewDirty = true;
}

fontSelect.addEventListener('change', () => {
  applyFont(fontSelect.value);
});

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

// --------------------------------------------------------------------- readout

/**
 * Update the panel describing the circle under the cursor.
 *
 * Hit-testing runs against the indices drawn last frame rather than the whole
 * packing: that is bounded by what is on screen — a few thousand — instead of the
 * hundreds of thousands a deep zoom accumulates, and it can never report a circle
 * the user cannot see.
 */
function updateReadout() {
  if (cursor === null || packing === undefined) {
    hovered = -1;
    readout.hidden = true;
    return;
  }

  const w = view.screenToWorld(cursor.x, cursor.y);
  const found = packing.pick(w.x, w.y, visible);

  if (found === hovered) return;
  hovered = found;
  viewDirty = true;

  if (found < 0) {
    readout.hidden = true;
    return;
  }

  const rows = describe(packing, found);
  const table = document.createElement('table');
  for (const row of rows) {
    const tr = document.createElement('tr');
    if (row.label === 'curvature') tr.className = 'curvature';
    const th = document.createElement('th');
    th.textContent = row.label;
    const td = document.createElement('td');
    td.textContent = row.value;
    tr.append(th, td);
    table.append(tr);
  }
  readout.replaceChildren(table);
  readout.hidden = false;
}

/** @param {string} message */
function showError(message) {
  errorBox.textContent = message;
}

// -------------------------------------------------------------------- analysis

/**
 * Show which integers this packing actually reaches.
 *
 * Deliberately synchronous after a paint: at the default bound this is a couple of
 * hundred milliseconds, and a spinner would cost more in complexity than it buys.
 */
function runAnalysis(bound = 10000n) {
  analysisPanel.hidden = false;
  placeAnalysis();
  analysisBody.textContent = 'computing…';

  requestAnimationFrame(() => {
    const a = analyze(rootQuad, bound);
    const name = rootQuad.map((c) => c.b).join(', ');

    /** @param {string} html */
    const el = (html) => {
      const d = document.createElement('div');
      d.innerHTML = html;
      return d;
    };

    const residues = (/** @type {number[]} */ on) =>
      Array.from({ length: a.modulus }, (_, r) =>
        `<span class="${on.includes(r) ? 'on' : 'off'}">${r}</span>`,
      ).join('');

    const widest = Math.max(...a.histogram.map((b) => b.count), 1);
    const bars = a.histogram
      .map(
        (b) =>
          `<div class="bar"><span>${b.from}–${b.to}</span>` +
          `<i style="width:${(b.count / widest) * 100}%"></i>` +
          `<span>${b.count}</span></div>`,
      )
      .join('');

    analysisBody.replaceChildren(
      el(
        `<dl>` +
          `<dt>packing</dt><dd>(${name})</dd>` +
          `<dt>bound</dt><dd>curvature ≤ ${a.maxCurvature.toLocaleString()}</dd>` +
          `<dt>circles</dt><dd>${a.circles.toLocaleString()}</dd>` +
          `<dt>distinct</dt><dd>${a.distinct.toLocaleString()} curvatures</dd>` +
          `<dt>computed in</dt><dd>${a.ms} ms</dd>` +
          `</dl>` +
          `<h3>Residues mod ${a.modulus}</h3>` +
          `<div class="residues">${residues(a.present)}</div>` +
          `<p class="note">Highlighted classes occur; the other ` +
          `${a.absent.length} are impossible for this packing. Which classes are ` +
          `admissible is fixed by the quadratic form, not by how far you look.</p>` +
          `<h3>Admissible but absent (≤ ${a.maxCurvature.toLocaleString()})</h3>` +
          (a.missing.length === 0
            ? `<p class="note">None — every integer in an admissible class occurs.</p>`
            : `<div class="misses">${a.missing.slice(0, 400).join(' ')}` +
              (a.missing.length > 400 ? ` … and ${a.missing.length - 400} more` : '') +
              `</div>` +
              `<p class="note">${a.missing.length} integer` +
              `${a.missing.length === 1 ? '' : 's'} in the right residue classes that ` +
              `this packing never reaches. The local-global conjecture held that such ` +
              `exceptions were finite; it was disproved in 2023, so these are worth ` +
              `looking at rather than assuming away.</p>`) +
          `<h3>Distinct curvatures by magnitude</h3>` +
          `<div class="bars">${bars}</div>`,
      ),
    );
  });
}

/**
 * Sit the analysis panel directly under the controls rather than on top of them —
 * the controls wrap to two rows at some widths, so the offset has to be measured
 * rather than assumed.
 */
function placeAnalysis() {
  const controls = /** @type {HTMLElement} */ (document.getElementById('controls'));
  const top = controls.getBoundingClientRect().bottom + 8;
  analysisPanel.style.top = `${top}px`;
  analysisPanel.style.maxHeight = `${window.innerHeight - top - 46}px`;
}

analyzeButton.addEventListener('click', () => {
  if (analysisPanel.hidden) runAnalysis();
  else analysisPanel.hidden = true;
});
analysisClose.addEventListener('click', () => {
  analysisPanel.hidden = true;
});

// ------------------------------------------------------------ sharing, export

/** The current view as a fragment, so it can be pasted anywhere. */
function shareFragment() {
  const center = view.screenToWorld(view.width / 2, view.height / 2);
  return encode({
    root: rootId,
    scale: view.scale,
    cx: center.x,
    cy: center.y,
    color: /** @type {'curvature'|'depth'} */ (colorSelect.value),
    labels: labelToggle.checked,
    depth: displayDepth,
    font: fontSelect.value,
  });
}

/**
 * The share URL for the current view.
 *
 * Deliberately *not* written to the address bar. Rewriting it as the view settled
 * meant that typing in the address bar was impossible — the page overwrote the edit
 * mid-keystroke — and it filled browser history with fragment-laden entries. A link
 * is something you ask for, not something the page imposes.
 */
function shareURL() {
  return `${location.origin}${location.pathname}#${shareFragment()}`;
}

/** Restore a view from the fragment, if there is one. */
function restoreFromURL() {
  const state = decode(location.hash);
  if (state === null) return false;

  const curvatures = decodeCurvatures(state.root);
  if (curvatures !== null) {
    const built = rootFromCurvatures(curvatures);
    if (!built.ok) {
      showError(`link could not be opened: ${built.reason}`);
      return false;
    }
    customInput.value = curvatures.join(',');
    rootSelect.selectedIndex = -1;
    load(built.quad, state.root);
  } else if (ROOTS[state.root]) {
    rootSelect.value = state.root;
    load(ROOTS[state.root].quad, state.root);
  } else {
    return false;
  }

  colorSelect.value = state.color;
  labelToggle.checked = state.labels;
  displayDepth = state.depth;
  if (state.font) applyFont(state.font);
  view.scale = state.scale;
  view.centerOn(state.cx, state.cy);
  packing.refine(limits());
  viewDirty = true;
  return true;
}

shareButton.addEventListener('click', async () => {
  const url = shareURL();
  shareField.value = url;
  shareRow.hidden = false;
  shareField.focus();
  shareField.select();
  try {
    await navigator.clipboard.writeText(url);
    shareNote.textContent = 'copied to clipboard';
  } catch {
    // Clipboard access can be refused; the field is still there to copy by hand.
    shareNote.textContent = 'select and copy';
  }
});

shareClose.addEventListener('click', () => {
  shareRow.hidden = true;
});

/** @returns {import('./ui/export.js').ExportOptions} */
function exportOptions() {
  return {
    colorMode: /** @type {'curvature'|'depth'} */ (colorSelect.value),
    theme: activeTheme(),
    labels: labelToggle.checked,
    maxDepth: displayDepth,
  };
}

/** A filename that says what the picture is. */
function exportName(extension) {
  const curvatures = rootQuad.map((c) => c.b).join(',');
  return `kissing-circles ${curvatures} at ${view.scale.toPrecision(4)}.${extension}`;
}

pngButton.addEventListener('click', () => {
  pngButton.textContent = 'rendering…';
  toPNG(packing, view, { ...exportOptions(), scale: 2 }, (blob) => {
    if (blob) download(blob, exportName('png'));
    pngButton.textContent = 'PNG';
  });
});

svgButton.addEventListener('click', () => {
  const svg = toSVG(packing, view, exportOptions(), ctx);
  download(new Blob([svg], { type: 'image/svg+xml' }), exportName('svg'));
});

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
  const rect = canvas.getBoundingClientRect();
  cursor = { x: e.clientX - rect.left, y: e.clientY - rect.top };

  const prev = pointers.get(e.pointerId);
  if (!prev) {
    updateReadout();
    return;
  }
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
    if (type === 'pointerleave') {
      cursor = null;
      updateReadout();
    }
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
  // Leave form controls alone: a select does type-ahead on letters, and the custom
  // quadruple field needs digits, commas and minus signs to reach it intact.
  const tag = /** @type {HTMLElement|null} */ (e.target)?.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

  const step = 60;
  switch (e.key) {
    case '0':
      view.fit(home, 0.11);
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
    case 'c':
      colorSelect.value = colorSelect.value === 'curvature' ? 'depth' : 'curvature';
      break;
    case '[':
      // Peel the packing back a level at a time. This is a display filter, not a
      // generation limit — nothing is discarded, so it is instant and reversible.
      displayDepth =
        displayDepth === 0 ? Math.max(packing.maxDepthReached - 1, 0) : Math.max(displayDepth - 1, 0);
      break;
    case ']':
      displayDepth = displayDepth === 0 ? 0 : displayDepth + 1;
      if (displayDepth > packing.maxDepthReached) displayDepth = 0;
      break;
    case ' ':
      paused = !paused;
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

rootSelect.addEventListener('change', () => {
  showError('');
  customInput.value = '';
  load(ROOTS[rootSelect.value].quad, rootSelect.value);
});

/**
 * Custom root entry.
 *
 * Three bends determine the fourth to two values; four determine everything; two
 * determine nothing. So the field takes three or four, and where it cannot proceed it
 * tries to say what would work rather than only what did not — a wrong quadruple is
 * usually one arithmetic step from a right one. See story/02-the-jump.html.
 */

/** @param {bigint[]} bs @returns {string} */
const fmt = (bs) => bs.map((b) => (b < 0n ? `−${-b}` : `${b}`)).join(', ');

function clearResult() {
  showError('');
  errorBox.className = '';
  offersBox.replaceChildren();
}

/**
 * @param {string} message
 * @param {boolean} [advisory] styled as a note rather than a failure
 */
function say(message, advisory = false) {
  showError(message);
  errorBox.className = advisory ? 'note' : '';
}

/**
 * Offer a quadruple as a button. Unbuildable ones are shown too, greyed, with the
 * reason — hiding them would misrepresent how many completions exist.
 *
 * @param {bigint[]} bs
 * @param {string} [label]
 */
function offer(bs, label) {
  const built = rootFromCurvatures(bs);
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label ?? `(${fmt(bs)})`;

  if (!built.ok) {
    button.className = 'blocked';
    button.title = built.reason;
    button.disabled = true;
  } else {
    button.addEventListener('click', () => {
      customInput.value = bs.join(',');
      clearResult();
      rootSelect.selectedIndex = -1;
      load(built.quad, encodeCurvatures(bs));
    });
  }
  offersBox.append(button);
}

/** Three bends: compute both completions and let the reader choose. */
function offerCompletions(three) {
  const roots = fourthCurvature(three[0], three[1], three[2]);
  const disc = three[0] * three[1] + three[1] * three[2] + three[2] * three[0];

  if (roots === null) {
    say(
      disc < 0n
        ? `no fourth circle touches all three: b₁b₂ + b₂b₃ + b₃b₁ = ${disc}, which is negative.`
        : `b₁b₂ + b₂b₃ + b₃b₁ = ${disc}, which is not a perfect square — so the fourth ` +
          `bend is irrational. The packing exists; this program draws only integral ones.`,
      true,
    );
    return;
  }

  const distinct = roots[0] === roots[1] ? [roots[0]] : roots;
  say(
    distinct.length === 1
      ? `(${fmt(three)}) has a repeated root: both completions have bend ${roots[0]}, ` +
        `mirrored across the triple.`
      : `(${fmt(three)}) is completed by ${fmt([roots[0]])} or ${fmt([roots[1]])}. Choose one.`,
    true,
  );
  for (const r of distinct) offer([...three, r]);
}

/** Four bends: check the relation, then try to place them. */
function loadQuadruple(bs) {
  if (!descartesReal(bs[0], bs[1], bs[2], bs[3])) {
    const sum = bs.reduce((a, b) => a + b, 0n);
    const squares = bs.reduce((a, b) => a + b * b, 0n);
    say(
      `(${fmt(bs)}) is not a Descartes quadruple: the square of the sum is ${sum * sum}, ` +
        `but twice the sum of the squares is ${2n * squares}.`,
    );
    const roots = fourthCurvature(bs[0], bs[1], bs[2]);
    if (roots !== null) {
      const distinct = roots[0] === roots[1] ? [roots[0]] : roots;
      for (const r of distinct) offer([bs[0], bs[1], bs[2], r]);
    }
    return;
  }

  const built = rootFromCurvatures(bs);
  if (built.ok) {
    clearResult();
    rootSelect.selectedIndex = -1;
    load(built.quad, encodeCurvatures(bs));
    return;
  }

  // It satisfies the relation but will not place. Nearly always because it is a
  // scaled copy of a smaller packing.
  const primitive = primitiveForm(bs);
  if (primitive.factor > 1n) {
    say(
      `(${fmt(bs)}) is ${primitive.factor} × (${fmt(primitive.curvatures)}) — the same ` +
        `packing at a different size. Only the primitive one sits on the Gaussian integers.`,
      true,
    );
    offer(primitive.curvatures);
    return;
  }

  if (bs.some((b) => b === 0n)) {
    say(
      `(${fmt(bs)}) contains a straight line, which this constructor cannot place. ` +
        `The strip packing in the list is the worked example.`,
      true,
    );
    return;
  }

  say(
    `(${fmt(bs)}) satisfies Descartes' theorem, but no placement on the Gaussian ` +
      `integers was found. That is most likely a limit of the search here rather than ` +
      `of the mathematics.`,
    true,
  );
}

function applyCustom() {
  clearResult();
  const text = customInput.value.trim();
  if (text === '') return;

  const parts = text.split(/[\s,]+/).filter(Boolean);
  if (!parts.every((p) => /^-?\d+$/.test(p))) {
    say('bends must be whole numbers.');
    return;
  }
  const bs = parts.map((p) => BigInt(p));

  if (bs.length < 3) {
    say(
      `${bs.length === 1 ? 'one bend' : 'two bends'} leave a free parameter — infinitely ` +
        `many circles complete them. Give three, and both completions are determined.`,
      true,
    );
    return;
  }
  if (bs.length > 4) {
    say(`give three bends or four, not ${bs.length}.`);
    return;
  }

  if (bs.length === 3) offerCompletions(bs);
  else loadQuadruple(bs);
}

customInput.addEventListener('change', applyCustom);
customInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') applyCustom();
  e.stopPropagation();
});
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
window.addEventListener('resize', () => {
  resize();
  if (!analysisPanel.hidden) placeAnalysis();
});

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

  if (!paused && !packing.done) {
    if (packing.grow(BUDGET).added > 0) viewDirty = true;
  }

  if (viewDirty) {
    viewDirty = false;
    const stats = draw(ctx, packing, view, {
      colorMode: /** @type {'curvature'|'depth'} */ (colorSelect.value),
      theme: activeTheme(),
      labels: labelToggle.checked,
      maxDepth: displayDepth,
      highlight: hovered,
    });
    visible = stats.visible;
    // What is under the cursor changes when the view does, not only when the
    // pointer moves.
    updateReadout();
    report(stats);
  }

  requestAnimationFrame(frame);
}

/** @param {{drawn: number, skipped: number, labeled: number}} stats */
function report(stats) {
  const s = packing.stats();

  depthReadout.textContent =
    displayDepth === 0 ? `depth all` : `depth ≤ ${displayDepth}`;

  hud.textContent = [
    `circles ${s.count.toLocaleString()}`,
    `drawn ${stats.drawn.toLocaleString()}`,
    `depth ${s.maxDepth}`,
    `max curvature ${s.maxCurvature.toLocaleString()}`,
    `zoom ${view.scale.toPrecision(4)}`,
    paused ? 'paused' : '',
    s.done ? (s.deferred > 0 ? `${s.deferred.toLocaleString()} deferred` : 'complete') : 'generating…',
    intervalCount < 5 ? '' : `${fps().toFixed(0)} fps`,
  ]
    .filter(Boolean)
    .join('   ');
}

themeSelect.value = themePreference();
applyTheme();
applyFont(fontPreference());
resize();
load(ROOTS.apollonian.quad, 'apollonian');
// Reading the fragment still works, so shared links open as they should. Writing it
// is what caused trouble, and that is gone.
restoreFromURL();
requestAnimationFrame(frame);
