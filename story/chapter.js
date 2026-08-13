// @ts-check

/**
 * Shared chapter furniture: the crumb bar, and the settings behind it.
 *
 * Chapters are read one after another, so each needs to know where it sits in the
 * sequence — and a reader who has chosen a theme or a numeral face on the workbench
 * should not have to choose it again here. Both settings live under the same
 * `localStorage` keys the workbench uses (`kc-theme`, `kc-font`), so a choice made
 * anywhere holds everywhere.
 *
 * A chapter calls `setupChapter({ prev, next, redraw })` and gets:
 *
 *   - previous and next links in the crumb bar, when they exist;
 *   - a settings popover with theme and numeral font;
 *   - `redraw` called whenever either changes, with the theme now in force.
 *
 * Labs are deliberately excluded — they are experiments with their own controls, and
 * plan.md §7.1 keeps the three page kinds separate on purpose.
 */

import { FONTS, DEFAULT_FONT, font as fontById, ensureLoaded } from '../src/render/fonts.js';
import { setNumeralFont } from '../src/render/labels.js';

const THEME_KEY = 'kc-theme';
const FONT_KEY = 'kc-font';

const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

/** @returns {'auto'|'light'|'dark'} */
function savedTheme() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'light' || v === 'dark' || v === 'auto') return v;
  } catch {
    // Storage disabled; the default is fine.
  }
  return 'auto';
}

/** @returns {string} */
function savedFont() {
  try {
    const v = localStorage.getItem(FONT_KEY);
    if (v && FONTS.some((f) => f.id === v)) return v;
  } catch {
    // As above.
  }
  return DEFAULT_FONT;
}

/**
 * @param {'auto'|'light'|'dark'} pref
 * @returns {'light'|'dark'} the theme actually in force
 */
function resolve(pref) {
  if (pref === 'auto') return prefersDark.matches ? 'dark' : 'light';
  return pref;
}

/**
 * @typedef {object} ChapterOptions
 * @property {{href: string, title: string}} [prev]
 * @property {{href: string, title: string}} [next]
 * @property {(theme: 'light'|'dark') => void} [redraw] called after any settings change
 */

/**
 * @param {ChapterOptions} options
 * @returns {{theme: () => 'light'|'dark'}}
 */
export function setupChapter(options = {}) {
  const crumbs = document.querySelector('nav.crumbs');
  if (crumbs === null) throw new Error('a chapter needs a nav.crumbs to hang settings on');

  let themePref = savedTheme();
  let fontId = savedFont();

  const applyTheme = () => {
    document.documentElement.dataset.theme = resolve(themePref);
  };

  /** The numeral face, for both the figures and any CSS that wants it. */
  const applyFont = async () => {
    const chosen = fontById(fontId);
    document.documentElement.style.setProperty('--numeral-font', chosen.stack);
    await ensureLoaded(chosen.id);
    setNumeralFont(chosen.id);
  };

  const notify = () => options.redraw?.(resolve(themePref));

  // ------------------------------------------------------------- the crumb bar

  const spacer = document.createElement('span');
  spacer.className = 'crumb-spacer';
  crumbs.append(spacer);

  if (options.prev) {
    const a = document.createElement('a');
    a.href = options.prev.href;
    a.textContent = `← ${options.prev.title}`;
    a.className = 'crumb-prev';
    crumbs.append(a);
  }
  if (options.next) {
    const a = document.createElement('a');
    a.href = options.next.href;
    a.textContent = `${options.next.title} →`;
    a.className = 'crumb-next';
    crumbs.append(a);
  }

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'crumb-settings';
  toggle.textContent = 'settings';
  toggle.setAttribute('aria-expanded', 'false');
  crumbs.append(toggle);

  const panel = document.createElement('div');
  panel.className = 'crumb-panel';
  panel.hidden = true;
  panel.innerHTML =
    '<label>theme <select data-role="theme">'
    + '<option value="auto">auto</option><option value="light">light</option>'
    + '<option value="dark">dark</option></select></label>'
    + '<label>font <select data-role="font"></select></label>';
  crumbs.append(panel);

  const themeSelect = /** @type {HTMLSelectElement} */ (panel.querySelector('[data-role=theme]'));
  const fontSelect = /** @type {HTMLSelectElement} */ (panel.querySelector('[data-role=font]'));
  for (const f of FONTS) {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.label;
    fontSelect.append(opt);
  }
  themeSelect.value = themePref;
  fontSelect.value = fontId;

  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
  });
  document.addEventListener('click', (e) => {
    const t = /** @type {Node} */ (e.target);
    if (!panel.hidden && !panel.contains(t) && t !== toggle) {
      panel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
    }
  });

  themeSelect.addEventListener('change', () => {
    themePref = /** @type {'auto'|'light'|'dark'} */ (themeSelect.value);
    try {
      localStorage.setItem(THEME_KEY, themePref);
    } catch { /* not fatal */ }
    applyTheme();
    notify();
  });

  fontSelect.addEventListener('change', async () => {
    fontId = fontSelect.value;
    try {
      localStorage.setItem(FONT_KEY, fontId);
    } catch { /* not fatal */ }
    await applyFont();
    notify();
  });

  // `auto` has to keep following the system after the page has loaded.
  prefersDark.addEventListener('change', () => {
    if (themePref !== 'auto') return;
    applyTheme();
    notify();
  });

  applyTheme();
  // The face is fetched asynchronously; redraw once it is really available, or the
  // figure measures a fallback and sizes every numeral to the wrong box.
  applyFont().then(notify);

  return { theme: () => resolve(themePref) };
}
