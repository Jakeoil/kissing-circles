# Fonts

## Why self-hosted

Curvature numerals are the point of this tool, and they have to look the same on a
desktop browser, an iPhone, and an Android webview. Relying on a system font stack
guarantees they will not: the same CSS lands on Cambria under Windows, Charter or
Georgia on Apple platforms, and Noto Serif on Android, each with different digit
widths and heights.

A self-hosted `woff2` settles it. Both weights together are 27 KB, every platform
gets the identical file, and there is no external request to a font CDN — which also
keeps the page working under the strict CSP that GitHub Pages sites often carry.
This is the alternative to drawing numerals as SVG paths.

## Caladea

`caladea-400.woff2`, `caladea-700.woff2` — Caladea, by Huerta Tipográfica, released
under the Apache License 2.0 (`LICENSE-2.0.txt`).

Caladea was commissioned as a **metric-compatible substitute for Cambria**: the same
advance widths and vertical metrics, so text set in one occupies the same space as
the other. It is the closest thing to Cambria that can legally be redistributed.

## On using Cambria itself

Cambria is on this machine, bundled with Microsoft Office:

```
/Applications/Microsoft Word.app/Contents/Resources/DFonts/Cambria.ttc
```

It is licensed with Office and **not licensed for web embedding**, so it cannot be
committed here or served from GitHub Pages. For local work only, it can be converted
and dropped in beside the others:

```sh
pip install fonttools brotli
fonttools ttLib.woff2 compress -o assets/cambria.woff2 \
  "/Applications/Microsoft Word.app/Contents/Resources/DFonts/Cambria.ttc"
```

then add it ahead of Caladea in the `@font-face` stack in `index.html`. Keep any such
file out of version control.

## Swapping in something else

The renderer does not assume a particular font. It measures the digit bounding box at
runtime and centers and fits numerals from those measurements, so any font drops in
without adjustment — the mechanism the Kotlin `KcTestView.circleTypeface()` was
reaching for. Change the `@font-face` rules and the `--numeral-font` stack in
`index.html`; nothing in `src/` needs to know.
