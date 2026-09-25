import { createShell } from '../lib/shell';
import { closePdfJs, loadDocument, openWithPdfJs, pageThumbnail, rotatePages } from '../lib/pdf';
import { suffixName, type OutputFile } from '../lib/files';

const panel = document.getElementById('pages')!;
const grid = document.getElementById('page-grid')!;
let base: number[] = [];
let delta: number[] = [];

function paint() {
  grid.querySelectorAll<HTMLImageElement>('img').forEach((img, i) => {
    img.style.transform = `rotate(${delta[i] ?? 0}deg)`;
  });
}

function rotateAll(by: number) {
  delta = delta.map((d) => d + by);
  paint();
}
document.getElementById('rotate-all-cw')!.addEventListener('click', () => rotateAll(90));
document.getElementById('rotate-all-ccw')!.addEventListener('click', () => rotateAll(-90));
document.getElementById('rotate-all-180')!.addEventListener('click', () => rotateAll(180));

createShell({
  async onFilesChanged(files) {
    grid.innerHTML = '';
    base = [];
    delta = [];
    panel.hidden = true;
    const f = files[0];
    if (!f) return;
    const bytes = new Uint8Array(await f.file.arrayBuffer());
    const doc = await loadDocument(bytes);
    base = doc.getPages().map((p) => p.getRotation().angle);
    delta = base.map(() => 0);
    panel.hidden = false;
    const pdf = await openWithPdfJs(bytes);
    for (let i = 0; i < pdf.numPages; i++) {
      const cell = document.createElement('div');
      cell.className = 'page-thumb';
      const img = document.createElement('img');
      img.alt = `Page ${i + 1}`;
      img.src = await pageThumbnail(pdf, i + 1, 150);
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = `Page ${i + 1}`;
      const controls = document.createElement('div');
      controls.className = 'controls';
      const ccw = document.createElement('button');
      ccw.type = 'button';
      ccw.className = 'btn btn-icon btn-ghost';
      ccw.textContent = '↺';
      ccw.setAttribute('aria-label', `Rotate page ${i + 1} counter-clockwise`);
      ccw.addEventListener('click', () => {
        delta[i] = (delta[i] ?? 0) - 90;
        paint();
      });
      const cw = document.createElement('button');
      cw.type = 'button';
      cw.className = 'btn btn-icon btn-ghost';
      cw.textContent = '↻';
      cw.setAttribute('aria-label', `Rotate page ${i + 1} clockwise`);
      cw.addEventListener('click', () => {
        delta[i] = (delta[i] ?? 0) + 90;
        paint();
      });
      controls.append(ccw, cw);
      cell.append(img, label, controls);
      grid.append(cell);
    }
    await closePdfJs(pdf);
    paint();
  },
  async process(files, progress) {
    const entry = files[0]!;
    if (delta.every((d) => d % 360 === 0)) throw new Error('Rotate at least one page first.');
    progress.set('Rotating pages', 0.3);
    const bytes = await rotatePages(new Uint8Array(await entry.file.arrayBuffer()), base.map((b, i) => b + (delta[i] ?? 0)));
    progress.set('Done', 1);
    const out: OutputFile = { name: suffixName(entry.file.name, '-rotated', 'pdf'), blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }) };
    return [out];
  },
  resultsTitle: () => 'Rotated',
});
