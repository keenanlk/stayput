import { createShell, str } from '../lib/shell';
import { closePdfJs, loadDocument, openWithPdfJs, pageThumbnail, reorderPages } from '../lib/pdf';
import { describePages, parsePageRange } from '../lib/ranges';
import { suffixName, type OutputFile } from '../lib/files';

const panel = document.getElementById('pages')!;
const grid = document.getElementById('page-grid')!;
const info = document.getElementById('page-info')!;
const orderInput = document.getElementById('order') as HTMLInputElement;

let total = 0;
/** Zero-based source page indexes, in the output order. Missing = deleted. */
let order: number[] = [];
let thumbs: string[] = [];
let dragFrom = -1;

function syncInput() {
  orderInput.value = order.map((i) => i + 1).join(', ');
  const deleted = total - new Set(order).size;
  info.textContent = `${total} page${total === 1 ? '' : 's'}${deleted > 0 ? `, ${deleted} deleted` : ''}${order.length !== total || order.some((p, i) => p !== i) ? '' : ' (original order)'}`;
}

function move(from: number, to: number) {
  if (from === to || from < 0 || to < 0 || from >= order.length || to >= order.length) return;
  const [item] = order.splice(from, 1);
  order.splice(to, 0, item!);
  paint();
}

function paint() {
  grid.innerHTML = '';
  order.forEach((src, pos) => {
    const cell = document.createElement('div');
    cell.className = 'page-thumb reorder-cell';
    cell.setAttribute('role', 'listitem');
    cell.draggable = true;
    cell.dataset.pos = String(pos);
    const img = document.createElement('img');
    img.alt = `Page ${src + 1}`;
    img.src = thumbs[src] ?? '';
    img.draggable = false;
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = `${pos + 1}. was page ${src + 1}`;
    const controls = document.createElement('div');
    controls.className = 'controls';
    controls.append(
      button('←', `Move page ${src + 1} left`, () => move(pos, pos - 1), pos === 0),
      button('→', `Move page ${src + 1} right`, () => move(pos, pos + 1), pos === order.length - 1),
      button('×', `Delete page ${src + 1}`, () => {
        order.splice(pos, 1);
        paint();
      }),
    );
    cell.addEventListener('dragstart', (e) => {
      dragFrom = pos;
      cell.classList.add('is-dragging');
      e.dataTransfer?.setData('text/plain', String(pos));
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    });
    cell.addEventListener('dragend', () => {
      dragFrom = -1;
      grid.querySelectorAll('.is-dragging, .is-target').forEach((el) => el.classList.remove('is-dragging', 'is-target'));
    });
    cell.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      cell.classList.add('is-target');
    });
    cell.addEventListener('dragleave', () => cell.classList.remove('is-target'));
    cell.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const from = dragFrom >= 0 ? dragFrom : Number(e.dataTransfer?.getData('text/plain'));
      if (Number.isFinite(from)) move(from, pos);
    });
    cell.append(img, label, controls);
    grid.append(cell);
  });
  syncInput();
}

function button(text: string, label: string, onClick: () => void, disabled = false) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn btn-icon btn-ghost';
  b.textContent = text;
  b.setAttribute('aria-label', label);
  b.title = label;
  b.disabled = disabled;
  b.addEventListener('click', onClick);
  return b;
}

document.getElementById('reverse')!.addEventListener('click', () => {
  order.reverse();
  paint();
});
document.getElementById('restore')!.addEventListener('click', () => {
  order = Array.from({ length: total }, (_, i) => i);
  paint();
});
orderInput.addEventListener('change', () => {
  if (!total) return;
  try {
    order = parsePageRange(orderInput.value, total);
    shell.hideError();
    paint();
  } catch (e) {
    shell.showError(e instanceof Error ? e.message : String(e));
  }
});

const shell = createShell({
  async onFilesChanged(files) {
    grid.innerHTML = '';
    total = 0;
    order = [];
    thumbs = [];
    panel.hidden = true;
    orderInput.value = '';
    const f = files[0];
    if (!f) return;
    const bytes = new Uint8Array(await f.file.arrayBuffer());
    const pdf = await openWithPdfJs(bytes);
    total = pdf.numPages;
    order = Array.from({ length: total }, (_, i) => i);
    panel.hidden = false;
    paint();
    for (let i = 0; i < total; i++) {
      thumbs[i] = await pageThumbnail(pdf, i + 1, 150);
      grid.querySelectorAll<HTMLImageElement>('img').forEach((el) => {
        if (el.alt === `Page ${i + 1}`) el.src = thumbs[i]!;
      });
    }
    await closePdfJs(pdf);
  },
  async process(files, progress) {
    const entry = files[0]!;
    if (total === 0) await loadDocument(new Uint8Array(await entry.file.arrayBuffer()));
    if (order.length === 0) throw new Error('Keep at least one page.');
    if (order.length === total && order.every((p, i) => p === i)) throw new Error('The pages are still in their original order. Move or delete a page first.');
    progress.set('Writing pages', 0.3);
    const bytes = await reorderPages(new Uint8Array(await entry.file.arrayBuffer()), order);
    progress.set('Done', 1);
    const deleted = total - new Set(order).size;
    const out: OutputFile = {
      name: suffixName(entry.file.name, '-reordered', 'pdf'),
      blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
      note: `${order.length} page${order.length === 1 ? '' : 's'}${deleted ? `, ${deleted} deleted` : ''}: ${describePages(order)}`,
    };
    return [out];
  },
  resultsTitle: () => 'Saved',
});
