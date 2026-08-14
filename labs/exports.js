// @ts-check

/**
 * PNG and SVG buttons for a lab.
 *
 * The workbench has had these since Phase 6; the labs never did, which meant the one
 * place where the interesting pictures get made was the one place you could not get a
 * file out of.
 *
 * The two are not equally general, and it is worth being clear why:
 *
 *   - **PNG works anywhere.** It snapshots the lab's own canvas at its backing
 *     resolution, so whatever the lab drew — regions, a partition, four circles — comes
 *     out exactly as seen. No lab has to describe its contents.
 *   - **SVG needs a packing.** `toSVG` walks a packing's parallel arrays and emits one
 *     `<circle>` each. A lab that draws filled *regions* bounded by arcs has nothing of
 *     that shape to hand over, so it gets PNG only rather than a wrong SVG.
 *
 * @param {object} spec
 * @param {HTMLElement} spec.into where to put the buttons
 * @param {HTMLCanvasElement} spec.canvas the lab's canvas, for PNG
 * @param {string} spec.name stem of the downloaded filename
 * @param {() => ({packing: any, view: any, options?: object})|null} [spec.svg]
 *   supply a packing and viewport to enable SVG, or return null when the current view
 *   has nothing circle-shaped to export
 */
export async function addExportButtons(spec) {
  const { toSVG, download } = await import('../src/ui/export.js');

  const png = document.createElement('button');
  png.type = 'button';
  png.textContent = 'PNG';
  png.addEventListener('click', () => {
    spec.canvas.toBlob((blob) => {
      if (blob !== null) download(blob, `${spec.name}.png`);
    }, 'image/png');
  });
  spec.into.append(png);

  if (!spec.svg) return;

  const svg = document.createElement('button');
  svg.type = 'button';
  svg.textContent = 'SVG';
  svg.addEventListener('click', () => {
    const source = spec.svg?.();
    if (source === null || source === undefined) {
      svg.textContent = 'no SVG here';
      setTimeout(() => { svg.textContent = 'SVG'; }, 1600);
      return;
    }
    const ctx = /** @type {CanvasRenderingContext2D} */ (spec.canvas.getContext('2d'));
    const text = toSVG(source.packing, source.view, source.options ?? {}, ctx);
    download(new Blob([text], { type: 'image/svg+xml' }), `${spec.name}.svg`);
  });
  spec.into.append(svg);
}
