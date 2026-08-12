// @ts-check

/**
 * The numeral fonts on offer.
 *
 * Nothing else in `src/` names a font. The renderer measures whatever is in use and
 * derives sizing and placement from that measurement, so adding an entry here (plus
 * an `@font-face` in index.html if it is self-hosted) is the whole job.
 *
 * `oldstyle` means the figures have ascenders and descenders — 3, 4, 7, 9 drop below
 * the baseline while 1, 2, 8 sit on it. Canvas cannot select the `onum` OpenType
 * feature, so the self-hosted faces have it frozen in; see assets/FONTS.md.
 */

/**
 * @typedef {object} NumeralFont
 * @property {string} id
 * @property {string} label shown in the picker
 * @property {string} stack CSS font-family list
 * @property {boolean} oldstyle whether its figures descend
 * @property {boolean} hosted whether the project ships the file
 * @property {number} weight the CSS weight it is drawn at. 700 for everything that
 *   predates the field, which is how adding it changed no existing picture; Latin
 *   Modern is drawn at 400 because bold coarsens exactly what one picks it for.
 */

/** @type {NumeralFont[]} */
export const FONTS = [
  {
    id: 'caladea',
    label: 'Caladea',
    stack: 'Caladea, Cambria, Georgia, serif',
    oldstyle: false,
    hosted: true,
    weight: 700,
  },
  {
    id: 'times',
    label: 'Times New Roman',
    stack: '"Times New Roman", Times, "Liberation Serif", serif',
    oldstyle: false,
    hosted: false,
    weight: 700,
  },
  {
    id: 'georgia',
    label: 'Georgia (oldstyle)',
    stack: 'Georgia, "Liberation Serif", serif',
    oldstyle: true,
    hosted: false,
    weight: 700,
  },
  {
    id: 'garamond',
    label: 'EB Garamond (oldstyle)',
    stack: '"EB Garamond", Georgia, serif',
    oldstyle: true,
    hosted: true,
    weight: 700,
  },
  {
    id: 'crimson',
    label: 'Crimson Pro (oldstyle)',
    stack: '"Crimson Pro", Georgia, serif',
    oldstyle: true,
    hosted: true,
    weight: 700,
  },
  {
    id: 'stix',
    label: 'STIX Two Text (oldstyle)',
    stack: '"STIX Two Text", Georgia, serif',
    oldstyle: true,
    hosted: true,
    weight: 700,
  },
  {
    // GUST's OpenType successor to Computer Modern — the face TeX has set mathematics
    // in since 1978, and the reason the numerals in a TeX-drawn gasket look the way
    // they do. Drawn at 400: see the weight property above.
    id: 'lmroman',
    label: 'Latin Modern Roman',
    stack: '"LMRoman10", Georgia, serif',
    oldstyle: false,
    hosted: true,
    weight: 400,
  },
  {
    id: 'lmroman-onum',
    label: 'Latin Modern Roman (oldstyle)',
    stack: '"LMRoman10 Oldstyle", Georgia, serif',
    oldstyle: true,
    hosted: true,
    weight: 400,
  },
];

/**
 * The one used unless something says otherwise.
 *
 * Caladea, because that is what the deployed site already draws with, and the legacy
 * guarantee in plan.md §7.2 says the default view does not change when a control is
 * added. A new face may be offered; it may not arrive uninvited.
 */
export const DEFAULT_FONT = 'caladea';

/**
 * @param {string} id
 * @returns {NumeralFont}
 */
export function font(id) {
  return FONTS.find((f) => f.id === id) ?? FONTS.find((f) => f.id === DEFAULT_FONT) ?? FONTS[0];
}

/**
 * Wait for a font to be usable before drawing with it.
 *
 * A self-hosted face is not fetched until something asks for it, and canvas silently
 * falls back rather than waiting — so switching fonts without this draws one frame in
 * the wrong typeface and, worse, measures it.
 *
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function ensureLoaded(id) {
  const f = font(id);
  if (typeof document === 'undefined' || !document.fonts) return;
  const family = f.stack.split(',')[0].trim();
  try {
    await Promise.all([
      document.fonts.load(`400 100px ${family}`),
      document.fonts.load(`700 100px ${family}`),
    ]);
  } catch {
    // An unavailable family is not fatal: the stack falls back on its own.
  }
}
