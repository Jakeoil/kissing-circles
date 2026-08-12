# Numeral fonts

Eight choices, selectable in the app. Six are self-hosted; two come from the system.

| Font | Figures | Weight | Source | Licence |
|---|---|---|---|---|
| Times New Roman | lining | 700 | system (macOS, Windows, iOS) | — |
| Georgia | **oldstyle** | 700 | system (macOS, Windows, iOS) | — |
| EB Garamond | **oldstyle** | 700 | `ebgaramond-onum.woff2` | SIL OFL 1.1 |
| Crimson Pro | **oldstyle** | 700 | `crimsonpro-onum.woff2` | SIL OFL 1.1 |
| STIX Two Text | **oldstyle** | 700 | `stixtwotext-onum.woff2` | SIL OFL 1.1 |
| Caladea | lining | 700 | `caladea-*.woff2` | Apache 2.0 |
| Latin Modern Roman | lining | **400** | `lmroman10.woff2` | GUST Font Licence |
| Latin Modern Roman | **oldstyle** | **400** | `lmroman10-onum.woff2` | GUST Font Licence |

## Why Latin Modern is drawn at 400

Every other face here is drawn bold, and until this one was added that was a literal
`700` in `labels.js`. Latin Modern at 700 loses the hairline on the `5` and the flag on
the `1` — most of what one picks it for — so `src/render/fonts.js` carries a `weight` per
face and `labels.js` reads it. Everything that predates the field says 700, so adding it
changed no existing picture.

Both files are the **regular** cut, declared across `font-weight: 100 900` in
`index.html`. Covering the whole range with one file means a request for any weight draws
these glyphs rather than a synthetic bold. Nothing asks for bold today; this makes that
safe rather than merely true.

Latin Modern is GUST's OpenType successor to Computer Modern, the typeface TeX has set
mathematics in since 1978. `10` is the optical size — the family is cut separately for
5, 6, 7, 8, 9, 10, 12 and 17 point, and 10 is the text cut. The licence is in
`GUST-FONT-LICENSE.txt`, and requires that it travel with the fonts.

## Why the files say `-onum`

Canvas cannot ask for oldstyle figures. `ctx.font` takes a CSS font shorthand, which has
no room for `font-feature-settings`, and the `@font-face` descriptor form is ignored —
measured directly in Chrome, a family declared with `font-feature-settings: 'onum' 1`
produces byte-identical metrics to the same family without it.

So the feature is **frozen into the font**: `pyftfeatfreeze -f onum` rewrites the glyph
table so the oldstyle set is the default, and no feature selection is needed at draw
time. Verified by measurement — in the frozen faces `3479` descends about 18–23 units
per 100 while `128` stays near 1, which is the signature of oldstyle figures; in the
unfrozen ones both are flat.

Georgia needs no such treatment: its figures are oldstyle by default, which is why it is
the one system font here that gives the effect for free.

Latin Modern freezes cleanly. `pyftfeatfreeze` warns that it cannot remap `seven.prop`,
`eight.prop` and `nine.prop` — those are proportional variants with no Unicode value, and
they are not what the digits map to. Measured after freezing, `3 4 7 9` descend to
−216, −194, −213 and −216 per 1000-unit em while `1 2 8` stay on the baseline, so the
substitution reached the glyphs that matter.

## Regenerating

The frozen faces were built from the full OTFs (Google Fonts' subset woff2 files carry
lining figures only, so they cannot be used):

```sh
pip install brotli fonttools opentype-feature-freezer
pyftfeatfreeze -f onum -S -U OS  EBGaramond-Regular.otf  EBGaramond-onum.otf
pyftfeatfreeze -f onum -S -U OS  lmroman10-regular.otf   lmroman10-onum.otf
python -c "from fontTools.ttLib import TTFont; f=TTFont('EBGaramond-onum.otf'); f.flavor='woff2'; f.save('ebgaramond-onum.woff2')"
```

## Adding one

`src/render/fonts.js` is the catalogue. Add an entry, add an `@font-face` in
`index.html` if it is self-hosted, and nothing else needs to change: the renderer
measures whatever font is in use and derives sizing and placement from that.
