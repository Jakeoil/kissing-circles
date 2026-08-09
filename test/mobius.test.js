// @ts-check

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  Mobius,
  V1, V2, V3, E1, E2, E3, C, S, IDENTITY,
  GENERATORS,
  word,
} from '../src/math/mobius.js';
import { Gaussian, ONE, I as IMAG } from '../src/math/gaussian.js';
import { Circle } from '../src/math/circle.js';
import { ROOTS } from '../src/math/descartes.js';
import { generate } from '../src/math/packing.js';

/**
 * Schmidt's Lemma 1.1 is a gift: it states enough identities among the generators to
 * pin every entry down. If the transcription were wrong anywhere, these would fail —
 * which is exactly how the Android original's E3 would have been caught.
 */
describe("Schmidt's generators satisfy Lemma 1.1", () => {
  const V = [V1, V2, V3];
  const E = [E1, E2, E3];

  test('(iii) determinants: det V = 1, det E = i, det C = −i', () => {
    for (const [n, v] of V.entries()) {
      assert.ok(v.det().equals(ONE), `det V${n + 1} is ${v.det()}`);
    }
    for (const [n, e] of E.entries()) {
      assert.ok(e.det().equals(IMAG), `det E${n + 1} is ${e.det()}`);
    }
    assert.ok(C.det().equals(IMAG.neg()), `det C is ${C.det()}`);
  });

  test('E3 is not the identity in disguise', () => {
    // The Android original had [[i,0],[0,i]] here, which is i times the identity and
    // therefore subdivides nothing at all.
    assert.ok(!E3.equalsProjective(IDENTITY), 'E3 must not be a scalar matrix');
    assert.ok(E3.det().equals(IMAG));
  });

  test('(i) S³ = I', () => {
    assert.ok(S.mul(S).mul(S).equalsProjective(IDENTITY));
    assert.ok(!S.equalsProjective(IDENTITY), 'and S itself is not the identity');
    assert.ok(!S.mul(S).equalsProjective(IDENTITY), 'nor is S²');
  });

  test('(ii) S conjugates each generator to the next', () => {
    // V_{j+1} = S V_j S⁻¹, indices mod 3. S⁻¹ is the adjugate, up to a scalar.
    const Sinv = S.adjugate();
    for (let j = 0; j < 3; j++) {
      const conjugated = S.mul(V[j]).mul(Sinv);
      assert.ok(
        conjugated.equalsProjective(V[(j + 1) % 3]),
        `S V${j + 1} S⁻¹ should be V${((j + 1) % 3) + 1}, got ${conjugated}`,
      );
    }
    for (let j = 0; j < 3; j++) {
      const conjugated = S.mul(E[j]).mul(Sinv);
      assert.ok(
        conjugated.equalsProjective(E[(j + 1) % 3]),
        `S E${j + 1} S⁻¹ should be E${((j + 1) % 3) + 1}, got ${conjugated}`,
      );
    }
  });

  test('(ii) C is fixed by that conjugation', () => {
    assert.ok(S.mul(C).mul(S.adjugate()).equalsProjective(C));
  });

  test('(iv) inverses are the complex conjugates', () => {
    // V_j⁻¹ = conj(V_j), E_j⁻¹ = conj(E_j), C⁻¹ = −conj(C).
    for (const [n, v] of V.entries()) {
      assert.ok(
        v.adjugate().equalsProjective(v.conjugate()),
        `V${n + 1}⁻¹ should be its conjugate`,
      );
    }
    for (const [n, e] of E.entries()) {
      assert.ok(
        e.adjugate().equalsProjective(e.conjugate()),
        `E${n + 1}⁻¹ should be its conjugate`,
      );
    }
    assert.ok(C.adjugate().equalsProjective(C.conjugate().scale(ONE.neg())));
  });
});

describe('Mobius arithmetic', () => {
  test('multiplication by the identity changes nothing', () => {
    for (const g of Object.values(GENERATORS)) {
      assert.ok(g.mul(IDENTITY).equals(g));
      assert.ok(IDENTITY.mul(g).equals(g));
    }
  });

  test('adjugate times the matrix is the determinant times the identity', () => {
    for (const g of Object.values(GENERATORS)) {
      const p = g.mul(g.adjugate());
      assert.ok(p.equals(IDENTITY.scale(g.det())), `${g} · adj = det · I`);
    }
  });

  test('determinant is multiplicative', () => {
    const m = V1.mul(E2).mul(C);
    assert.ok(m.det().equals(V1.det().mul(E2.det()).mul(C.det())));
  });

  test('projective equality is equality up to a unit', () => {
    assert.ok(IDENTITY.equalsProjective(IDENTITY.scale(IMAG)));
    assert.ok(IDENTITY.equalsProjective(IDENTITY.scale(ONE.neg())));
    assert.ok(!IDENTITY.equalsProjective(IDENTITY.scale(Gaussian.of(2, 0))));
  });

  test('words compose left to right', () => {
    assert.ok(word('V1 V2').equals(V1.mul(V2)));
    assert.ok(word(['C', 'C', 'V3']).equals(C.mul(C).mul(V3)));
    assert.ok(word('').equals(IDENTITY));
    assert.ok(word([]).equals(IDENTITY));
  });

  test('an unknown letter is refused rather than ignored', () => {
    assert.throws(() => word('V1 Q'), /unknown generator/);
  });
});

describe('the action on circles', () => {
  const sample = [
    ROOTS.apollonian.quad[0], // the bounding circle, b = −1
    ROOTS.apollonian.quad[1], // b = 2
    ROOTS.apollonian.quad[3], // b = 3
    Circle.of(1, 15, 0, 4),
  ];

  test('every generator carries a circle to a circle, exactly', () => {
    // This is the load-bearing claim of plan.md §8.2: the invariant survives with no
    // scaling factor, so the arrangement stays on the Gaussian integers forever.
    for (const [name, g] of Object.entries(GENERATORS)) {
      for (const circle of sample) {
        const image = g.applyTo(circle);
        assert.ok(image !== null, `${name} sent ${circle} off the variety`);
        assert.ok(
          image.isValid(),
          `${name}(${circle}) has |bz|² − b·b̄ = ${image.bz.normSq() - image.b * image.bbar}`,
        );
      }
    }
  });

  test('the image is integral, not merely valid', () => {
    for (const g of Object.values(GENERATORS)) {
      for (const circle of sample) {
        const image = /** @type {Circle} */ (g.applyTo(circle));
        assert.equal(typeof image.b, 'bigint');
        assert.equal(typeof image.bbar, 'bigint');
        assert.equal(typeof image.bz.re, 'bigint');
      }
    }
  });

  test('applying a generator and then its inverse returns the original', () => {
    for (const [name, g] of Object.entries(GENERATORS)) {
      for (const circle of sample) {
        const there = /** @type {Circle} */ (g.applyTo(circle));
        const back = /** @type {Circle} */ (g.adjugate().applyTo(there));
        assert.ok(back !== null, `${name}: round trip left the variety`);
        // The adjugate reintroduces a factor of det·conj(det) = |det|², a positive
        // integer, so the row comes back scaled rather than identical.
        const k = back.b === 0n ? null : back.b / circle.b;
        assert.ok(k !== null && k > 0n, `${name}: expected a positive scaling`);
        assert.ok(back.b === circle.b * k, `${name}: b`);
        assert.ok(back.bbar === circle.bbar * k, `${name}: bbar`);
        assert.ok(back.bz.equals(circle.bz.scale(k)), `${name}: bz`);
      }
    }
  });

  test('the identity leaves a circle alone', () => {
    for (const circle of sample) {
      const image = /** @type {Circle} */ (IDENTITY.applyTo(circle));
      assert.ok(image.equals(circle));
    }
  });

  test('a line is carried to a circle or a line, and stays valid', () => {
    for (const circle of ROOTS.strip.quad) {
      for (const [name, g] of Object.entries(GENERATORS)) {
        const image = g.applyTo(circle);
        assert.ok(image !== null, `${name} on ${circle}`);
        assert.ok(image.isValid(), `${name} on a line gave ${image}`);
      }
    }
  });

  test('holds over a long word, where drift would show', () => {
    // Fifty generators deep, with curvatures far past what a double could hold.
    let circle = ROOTS.apollonian.quad[3];
    const letters = ['C', 'V3', 'E1', 'V1', 'C', 'E2', 'V2', 'E3'];
    let biggest = 0n;

    for (let n = 0; n < 50; n++) {
      const g = GENERATORS[letters[n % letters.length]];
      circle = /** @type {Circle} */ (g.applyTo(circle));
      assert.ok(circle !== null, `step ${n} left the variety`);
      assert.ok(circle.isValid(), `step ${n}: ${circle}`);
      const mag = circle.b < 0n ? -circle.b : circle.b;
      if (mag > biggest) biggest = mag;
    }

    assert.ok(
      biggest > 9007199254740992n,
      `expected to pass 2^53, only reached ${biggest}`,
    );
  });

  test('agrees with the packing on circles it already knows', () => {
    // Every circle of the packing satisfies the invariant; carrying any of them
    // through any generator must too. A cheap broad sweep.
    const p = generate(ROOTS.apollonian.quad, { maxCurvature: 200n });
    let checked = 0;
    for (let idx = 0; idx < p.count; idx += 7) {
      for (const g of Object.values(GENERATORS)) {
        const image = g.applyTo(p.circles[idx]);
        assert.ok(image !== null && image.isValid());
        checked++;
      }
    }
    assert.ok(checked > 100, `only checked ${checked}`);
  });
});
