import { createShell, bool, processEach, type ShellFile } from '../lib/shell';
import { findRawPreview, fileReader, MIN_PREVIEW_EDGE, RawError, type RawPreview } from '../lib/raw-preview';
import { overPhoneLimit, PHONE_SAFE_BYTES } from '../lib/phone-limit';
import { formatBytes, suffixName, type OutputFile } from '../lib/files';
import { NamedError } from '../lib/input-error';

const results = document.getElementById('raw-results')!;

type Scan = { preview: RawPreview } | { problem: string };
const scans = new WeakMap<File, Promise<Scan>>();

/** Look inside a RAW file (reading only the parts it needs) and say what preview it holds. */
function scan(file: File): Promise<Scan> {
  let s = scans.get(file);
  if (!s) {
    s = (async (): Promise<Scan> => {
      if (overPhoneLimit(file.size)) return { problem: `This file is ${formatBytes(file.size)}, more than a phone can read safely (about ${formatBytes(PHONE_SAFE_BYTES)}). Use a computer.` };
      try {
        const preview = await findRawPreview(file);
        if (!preview) return { problem: 'No JPEG preview was found in this file. Some RAW files, DNGs especially, do not carry one.' };
        if (Math.max(preview.width, preview.height) < MIN_PREVIEW_EDGE) {
          return { problem: `Only a small preview (${preview.width} x ${preview.height}) is stored in this file. That is a thumbnail, not a photo, so nothing was extracted.` };
        }
        return { preview };
      } catch (e) {
        return { problem: e instanceof RawError ? e.message : 'This file could not be read as a RAW photo.' };
      }
    })();
    scans.set(file, s);
  }
  return s;
}

const exifNote = (p: RawPreview) => (p.hasExif ? 'EXIF kept (the bytes are copied unchanged)' : 'This preview has no EXIF of its own');
const needsRotation = (p: RawPreview) => p.rawOrientation > 1 && p.jpegOrientation === 1;

async function describe(files: ShellFile[]) {
  results.replaceChildren();
  results.hidden = files.length === 0;
  const items = files.map(() => {
    const li = document.createElement('li');
    li.className = 'raw-item';
    results.append(li);
    return li;
  });
  await Promise.all(
    files.map(async ({ file }, i) => {
      const s = await scan(file);
      const li = items[i]!;
      const name = Object.assign(document.createElement('strong'), { textContent: file.name });
      const line = document.createElement('span');
      if ('problem' in s) {
        li.classList.add('raw-bad');
        line.textContent = s.problem;
      } else {
        const p = s.preview;
        line.textContent = `${p.width} x ${p.height} preview found, ${formatBytes(p.length)}. ${exifNote(p)}.${needsRotation(p) ? ' The camera marked it as rotated; the JPEG itself is not.' : ''}`;
      }
      li.append(name, line);
    }),
  );
}

createShell({
  onFilesChanged: describe,
  outputFormat: () => 'jpg',
  async process(files, progress) {
    const upright = bool('upright');
    return processEach(files, progress, 'Reading', async (entry) => {
      const s = await scan(entry.file);
      if ('problem' in s) throw new NamedError('RawPreviewFailed', s.problem);
      const p = s.preview;
      const bytes = await fileReader(entry.file)(p.offset, p.length);
      let blob = new Blob([bytes as BlobPart], { type: 'image/jpeg' });
      let note = `${p.width} x ${p.height}, original JPEG bytes, not re-encoded`;
      if (upright && needsRotation(p)) {
        blob = await rotated(blob, p.rawOrientation);
        note = `${p.width} x ${p.height}, turned upright and re-encoded at quality 95`;
      }
      return { name: suffixName(entry.file.name, '-preview', 'jpg'), blob, originalSize: entry.file.size, note } satisfies OutputFile;
    });
  },
});

/** Redraw a JPEG upright from an EXIF orientation (2 to 8) and save it again at quality 95. */
async function rotated(jpeg: Blob, orientation: number): Promise<Blob> {
  const bitmap = await createImageBitmap(jpeg);
  const swap = orientation >= 5;
  const canvas = document.createElement('canvas');
  canvas.width = swap ? bitmap.height : bitmap.width;
  canvas.height = swap ? bitmap.width : bitmap.height;
  const ctx = canvas.getContext('2d')!;
  const w = bitmap.width;
  const h = bitmap.height;
  const m: Record<number, [number, number, number, number, number, number]> = {
    2: [-1, 0, 0, 1, w, 0],
    3: [-1, 0, 0, -1, w, h],
    4: [1, 0, 0, -1, 0, h],
    5: [0, 1, 1, 0, 0, 0],
    6: [0, 1, -1, 0, h, 0],
    7: [0, -1, -1, 0, h, w],
    8: [0, -1, 1, 0, 0, w],
  };
  const t = m[orientation];
  if (t) ctx.setTransform(...t);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.95));
  if (!out) throw new NamedError('RawPreviewFailed', 'This browser could not save the rotated JPEG.');
  return out;
}
