// @ts-check

import { DEFAULT_FONT } from '../render/fonts.js';

/**
 * View state in the URL fragment.
 *
 * A specific view of a specific packing is the unit of communication in this
 * project — "look at the cusp between the two 2s at 10^7" is not something you can
 * say in prose. Encoding it in the fragment means a view can be pasted into a paper,
 * an email, or a lab notebook and come back exactly.
 *
 * The fragment is used rather than the query string so that reloading never leaves
 * the static host, and so that changing the view does not touch the server.
 */

/**
 * @typedef {object} ShareState
 * @property {string} root a named root key, or 'q' followed by four curvatures
 * @property {number} scale
 * @property {number} cx world x at the center of the view
 * @property {number} cy world y at the center of the view
 * @property {'curvature'|'depth'} color
 * @property {boolean} labels
 * @property {number} depth display depth limit, 0 for all
 * @property {string} [font] numeral font id
 */

/**
 * Encode state as a fragment, without the leading '#'.
 * @param {ShareState} s
 * @returns {string}
 */
export function encode(s) {
  const params = new URLSearchParams();
  params.set('r', s.root);
  // Enough precision to survive a deep zoom, not so much that the URL is unreadable.
  params.set('s', s.scale.toExponential(10));
  params.set('x', s.cx.toExponential(14));
  params.set('y', s.cy.toExponential(14));
  if (s.color !== 'curvature') params.set('c', s.color);
  if (!s.labels) params.set('l', '0');
  if (s.depth > 0) params.set('d', String(s.depth));
  if (s.font && s.font !== DEFAULT_FONT) params.set('f', s.font);
  return params.toString();
}

/**
 * Decode a fragment. Returns null when there is nothing usable, so a malformed or
 * hand-edited URL falls back to the default view rather than to a broken one.
 *
 * @param {string} fragment with or without the leading '#'
 * @returns {ShareState|null}
 */
export function decode(fragment) {
  const text = fragment.startsWith('#') ? fragment.slice(1) : fragment;
  if (text === '') return null;

  const params = new URLSearchParams(text);
  const root = params.get('r');
  const scale = Number(params.get('s'));
  const cx = Number(params.get('x'));
  const cy = Number(params.get('y'));

  if (!root) return null;
  if (!Number.isFinite(scale) || scale <= 0) return null;
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;

  const color = params.get('c') === 'depth' ? 'depth' : 'curvature';
  const depth = Number(params.get('d') ?? 0);

  return {
    root,
    scale,
    cx,
    cy,
    color,
    labels: params.get('l') !== '0',
    depth: Number.isFinite(depth) && depth > 0 ? Math.floor(depth) : 0,
    font: params.get('f') ?? DEFAULT_FONT,
  };
}

/**
 * A custom root is encoded as its four curvatures, so a shared link does not depend
 * on a named key that might not exist.
 *
 * @param {(number|bigint)[]} curvatures
 * @returns {string}
 */
export function encodeCurvatures(curvatures) {
  return `q${curvatures.join('_')}`;
}

/**
 * @param {string} root
 * @returns {bigint[]|null} the four curvatures, or null when this is a named root
 */
export function decodeCurvatures(root) {
  if (!root.startsWith('q')) return null;
  const parts = root.slice(1).split('_');
  if (parts.length !== 4) return null;
  if (!parts.every((p) => /^-?\d+$/.test(p))) return null;
  return parts.map((p) => BigInt(p));
}
