import { createShell, processEach, radio } from '../lib/shell';
import { suffixName, type OutputFile } from '../lib/files';
import { thumbnail } from '../lib/image';
import { InputError } from '../lib/input-error';
import { DamagedGif, UnreadableFile, checkGif, explain, gifSize } from '../lib/gif-errors';

/**
 * Resize GIF. Each GIF is decoded and rewritten at the new size in the page
 * (see src/lib/gif-compress.ts); nothing leaves the tab. The new size always
 * goes in as an exact box, so enlarging is allowed and no edge row is left
 * unpainted.
 */

const MAX = 4096;
const TOO_LARGE = 'Try a desktop browser, or choose a smaller size and run it again.';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const percentSelect = $<HTMLSelectElement>('percent');
const percentCustom = $<HTMLInputElement>('percent-custom');
const widthField = $<HTMLInputElement>('width');
const heightField = $<HTMLInputElement>('height');
const keep = $<HTMLInputElement>('keep');
const keepNote = $('keep-note');
const fitField = $('fit-field');
const fitSelect = $<HTMLSelectElement>('fit');

/** The first dropped GIF's logical screen size, for filling the other field while proportions are kept. */
let ratio: { width: number; height: number } | undefined;
let fileCount = 0;
/** The size field typed in last; with proportions kept, the other one follows it. */
let lead: 'w' | 'h' = 'w';

const syncMode = () => {
  const pixels = radio('by', 'percent') === 'pixels';
  $('by-percent').hidden = pixels;
  $('by-pixels').hidden = !pixels;
  fitField.hidden = keep.checked;
  keepNote.hidden = fileCount < 2;
};
for (const el of document.querySelectorAll<HTMLInputElement>('input[name="by"]')) el.addEventListener('change', syncMode);
keep.addEventListener('change', syncMode);
percentSelect.addEventListener('change', () => (percentCustom.value = ''));

function follow(from: 'w' | 'h') {
  if (!keep.checked || !ratio) return;
  if (from === 'w') {
    const w = Number(widthField.value);
    heightField.value = w > 0 ? String(Math.max(1, Math.round((w * ratio.height) / ratio.width))) : '';
  } else {
    const h = Number(heightField.value);
    widthField.value = h > 0 ? String(Math.max(1, Math.round((h * ratio.width) / ratio.height))) : '';
  }
}
widthField.addEventListener('input', () => {
  lead = 'w';
  follow('w');
});
heightField.addEventListener('input', () => {
  lead = 'h';
  follow('h');
});
for (const b of document.querySelectorAll<HTMLButtonElement>('.quick-sizes button')) {
  b.addEventListener('click', () => {
    widthField.value = b.dataset.w ?? '';
    heightField.value = b.dataset.h ?? '';
    // A square preset is an exact shape; "480 px wide" keeps the proportions.
    keep.checked = !b.dataset.h;
    lead = 'w';
    if (keep.checked) follow('w');
    syncMode();
  });
}
syncMode();

interface Target {
  width: number;
  height: number;
  fit: 'stretch' | 'contain' | 'cover';
  capped: boolean;
}

/** The exact output size for one GIF, from its header size and the options. */
function target(gw: number, gh: number, batch: boolean): Target {
  const fit = 'stretch' as const;
  if (radio('by', 'percent') === 'percent') {
    const typed = percentCustom.value.trim();
    const p = typed ? Number(typed) : Number(percentSelect.value);
    if (!Number.isFinite(p) || p < 5 || p > 400) throw new InputError('Enter a percentage from 5 to 400.');
    let k = p / 100;
    let capped = false;
    if (Math.max(gw, gh) * k > MAX) {
      k = MAX / Math.max(gw, gh);
      capped = true;
    }
    return { width: Math.max(1, Math.round(gw * k)), height: Math.max(1, Math.round(gh * k)), fit, capped };
  }
  const w = Math.round(Number(widthField.value));
  const h = Math.round(Number(heightField.value));
  const hasW = widthField.value.trim() !== '' && w > 0;
  const hasH = heightField.value.trim() !== '' && h > 0;
  let width: number;
  let height: number;
  if (keep.checked) {
    if (!hasW && !hasH) throw new InputError('Type a width or a height in pixels.');
    // A single GIF follows whichever field was typed last (the other was filled from it); a batch uses the width.
    if (hasW && (batch || lead === 'w' || !hasH)) {
      width = w;
      height = Math.max(1, Math.round((gh * w) / gw));
    } else {
      height = h;
      width = Math.max(1, Math.round((gw * h) / gh));
    }
  } else {
    if (!hasW || !hasH) throw new InputError('Type both a width and a height, or tick Keep proportions.');
    width = w;
    height = h;
  }
  if (width > MAX || height > MAX) throw new InputError(`The largest size is ${MAX} pixels on a side.`);
  return { width, height, fit: keep.checked ? fit : (fitSelect.value as Target['fit']), capped: false };
}

createShell({
  outputFormat: () => 'gif',
  async onFilesChanged(files) {
    fileCount = files.length;
    ratio = undefined;
    const first = files[0];
    if (first) {
      try {
        const head = new Uint8Array(await first.file.slice(0, 16).arrayBuffer());
        const size = gifSize(head);
        if (size && size.width && size.height && String.fromCharCode(...head.subarray(0, 3)) === 'GIF') ratio = size;
      } catch {
        // The run reports an unreadable file.
      }
    }
    if (ratio && keep.checked) {
      follow(lead);
    }
    syncMode();
  },
  async process(files, progress) {
    const { compressGif, gifFrameCount } = await import('../lib/gif-compress');
    return processEach(files, progress, 'Resizing', async (entry, index) => {
      const share = (f: number) => (index + f) / files.length;
      const buffer = await entry.file.arrayBuffer().catch(() => {
        throw new UnreadableFile();
      });
      const bytes = new Uint8Array(buffer);
      checkGif(bytes, undefined, 1, 1);
      const size = gifSize(bytes)!;
      const t = target(size.width, size.height, files.length > 1);
      checkGif(
        bytes,
        () => {
          try {
            return gifFrameCount(buffer);
          } catch {
            throw new DamagedGif();
          }
        },
        1,
        1,
        t,
        TOO_LARGE,
      );
      const r = await compressGif(buffer, {
        level: 'light',
        scale: 1,
        keepEvery: 1,
        box: t,
        force: true,
        onProgress: (f) => progress.set(`Resizing ${entry.file.name}: ${Math.round(f * 100)}%`, share(f)),
      }).catch((e) => {
        throw explain(e, TOO_LARGE);
      });
      const blob = new Blob([r.bytes], { type: 'image/gif' });
      let previewUrl: string | undefined;
      try {
        const bitmap = await createImageBitmap(blob);
        previewUrl = await thumbnail(bitmap);
        bitmap.close();
      } catch {
        // A preview is a nicety; the file itself is fine.
      }
      const notes = [`${r.width}×${r.height}`, `${r.framesOut} frames`];
      if (t.capped) notes.push(`capped at ${MAX} px on the longer side`);
      const out: OutputFile = {
        name: suffixName(entry.file.name, `-${r.width}x${r.height}`, 'gif'),
        blob,
        originalSize: entry.file.size,
        previewUrl,
        note: notes.join(', '),
      };
      return out;
    });
  },
});
