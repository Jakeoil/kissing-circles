# Numeral fonts

Six choices, selectable in the app. Three are self-hosted; three come from the system.

| Font | Figures | Source | Licence |
|---|---|---|---|
| Times New Roman | lining | system (macOS, Windows, iOS) | — |
| Georgia | **oldstyle** | system (macOS, Windows, iOS) | — |
| EB Garamond | **oldstyle** | `ebgaramond-onum.woff2` | SIL OFL 1.1 |
| Crimson Pro | **oldstyle** | `crimsonpro-onum.woff2` | SIL OFL 1.1 |
| STIX Two Text | **oldstyle** | `stixtwotext-onum.woff2` | SIL OFL 1.1 |
| Caladea | lining | `caladea-*.woff2` | Apache 2.0 |

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

## Regenerating

The frozen faces were built from the full OTFs (Google Fonts' subset woff2 files carry
lining figures only, so they cannot be used):

```sh
pip install brotli fonttools opentype-feature-freezer
pyftfeatfreeze -f onum -S -U OS  EBGaramond-Regular.otf  EBGaramond-onum.otf
python -c "from fontTools.ttLib import TTFont; f=TTFont('EBGaramond-onum.otf'); f.flavor='woff2'; f.save('ebgaramond-onum.woff2')"
```

## Adding one

`src/render/fonts.js` is the catalogue. Add an entry, add an `@font-face` in
`index.html` if it is self-hosted, and nothing else needs to change: the renderer
measures whatever font is in use and derives sizing and placement from that.
