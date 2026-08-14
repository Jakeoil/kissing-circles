// @ts-check

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { xml } from '../src/ui/export.js';
import { FONTS } from '../src/render/fonts.js';

describe('SVG attribute escaping', () => {
  test('every font stack survives being put in an attribute', () => {
    // Font stacks quote any family whose name contains a space. Interpolating one into
    // an attribute unescaped ended the attribute early and produced malformed XML for
    // every font but Caladea — which is the default, so nobody saw it.
    for (const f of FONTS) {
      const escaped = xml(f.stack);
      assert.ok(!escaped.includes('"'), `${f.id}: a bare double quote survived`);
      assert.ok(!escaped.includes("'"), `${f.id}: a bare single quote survived`);
      const attr = `font-family="${escaped}"`;
      // One opening and one closing quote, and nothing between them that could end it.
      assert.equal(attr.split('"').length, 3, `${f.id}: attribute is not well delimited`);
    }
  });

  test('it escapes the markup characters too', () => {
    assert.equal(xml('a & b'), 'a &amp; b');
    assert.equal(xml('<tag>'), '&lt;tag&gt;');
    assert.equal(xml('"Q" and \'q\''), '&quot;Q&quot; and &apos;q&apos;');
    // Ampersand first, or the escapes get escaped.
    assert.equal(xml('&"'), '&amp;&quot;');
  });
});
