// @ts-check

/**
 * A deliberately naive reference generator, for validating the math core only.
 *
 * This is NOT the real generator. It recurses with a plain array stack, keeps every
 * quadruple it visits, and has no viewport awareness or screen-space pruning. It
 * exists so the Phase 1 primitives can be exercised over thousands of circles
 * without waiting for the real, resumable generator in src/math/packing.js.
 *
 * Keep it dumb and obviously correct. When packing.js lands, its output is checked
 * against this.
 */

/**
 * @typedef {import('../../src/math/circle.js').Circle} Circle
 */

/**
 * Walk the packing, emitting every distinct circle and every quadruple visited.
 *
 * The traversal is non-redundant: after a circle at index i is replaced, index i is
 * not replaced again in the child quadruple, since doing so would simply undo the
 * step. A key-based Set catches whatever duplicates remain.
 *
 * @param {Circle[]} root a valid Descartes quadruple
 * @param {{maxCurvature?: bigint, maxDepth?: number}} opts
 * @returns {{circles: {circle: Circle, depth: number}[], quads: Circle[][]}}
 */
export function generate(root, opts = {}) {
  const maxCurvature = opts.maxCurvature ?? 1000n;
  const maxDepth = opts.maxDepth ?? 32;

  /** @type {{circle: Circle, depth: number}[]} */
  const circles = [];
  /** @type {Circle[][]} */
  const quads = [];
  /** @type {Set<string>} */
  const seen = new Set();

  for (const c of root) {
    if (!seen.has(c.key())) {
      seen.add(c.key());
      circles.push({ circle: c, depth: 0 });
    }
  }

  /** @type {{quad: Circle[], skip: number, depth: number}[]} */
  const stack = [{ quad: root, skip: -1, depth: 0 }];

  while (stack.length > 0) {
    const { quad, skip, depth } = /** @type {any} */ (stack.pop());
    quads.push(quad);
    if (depth >= maxDepth) continue;

    for (let i = 0; i < 4; i++) {
      if (i === skip) continue;
      const rest = quad.filter((_, j) => j !== i);
      const next = quad[i].spawn(rest[0], rest[1], rest[2]);
      if (next.b > maxCurvature) continue;

      if (!seen.has(next.key())) {
        seen.add(next.key());
        circles.push({ circle: next, depth: depth + 1 });
      }
      const child = quad.slice();
      child[i] = next;
      stack.push({ quad: child, skip: i, depth: depth + 1 });
    }
  }

  return { circles, quads };
}

/**
 * The distinct curvatures in a generated packing, ascending.
 * @param {{circle: Circle, depth: number}[]} circles
 * @returns {bigint[]}
 */
export function curvatures(circles) {
  const set = new Set(circles.map((c) => c.circle.b));
  return [...set].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
