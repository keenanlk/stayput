import { createShell, bool, type ShellFile } from '../lib/shell';
import { inspect, strip, sniffFormat, type MetadataSummary } from '../lib/exif';
import { decodeImage, encodeBitmap, thumbnail } from '../lib/image';
import { formatBytes, type OutputFile } from '../lib/files';

const report = document.getElementById('meta-report')!;
const summaries = new Map<number, MetadataSummary | Error>();

function describe(s: MetadataSummary): string {
  const bits: string[] = [];
  if (s.kinds.length === 0) bits.push('No removable metadata found');
  else bits.push(`${s.kinds.join(', ')} (${formatBytes(s.bytes)})`);
  bits.push(s.hasGps ? 'GPS location: yes' : 'GPS location: no');
  const camera = [s.make, s.model].filter(Boolean).join(' ');
  if (camera) bits.push(`Camera: ${camera}`);
  if (s.dateTime) bits.push(`Taken: ${s.dateTime}`);
  if (s.software) bits.push(`Software: ${s.software}`);
  if (s.orientation && s.orientation !== 1) bits.push(`Orientation tag: ${s.orientation}`);
  return bits.join(' · ');
}

async function renderReport(files: ShellFile[]) {
  report.innerHTML = '';
  report.hidden = files.length === 0;
  for (const entry of files) {
    if (!summaries.has(entry.id)) {
      try {
        summaries.set(entry.id, inspect(new Uint8Array(await entry.file.arrayBuffer())));
      } catch (e) {
        summaries.set(entry.id, e instanceof Error ? e : new Error(String(e)));
      }
    }
    const s = summaries.get(entry.id)!;
    const row = document.createElement('div');
    row.className = 'meta-row';
    const name = document.createElement('strong');
    name.textContent = entry.file.name;
    const detail = document.createElement('span');
    if (s instanceof Error) {
      detail.textContent = s.message;
      detail.className = 'muted';
    } else {
      detail.textContent = describe(s);
      if (s.hasGps) row.classList.add('has-gps');
    }
    row.append(name, document.createElement('br'), detail);
    report.append(row);
  }
}

createShell({
  onFilesChanged: renderReport,
  async process(files, progress) {
    const keepIcc = bool('keep-icc');
    const applyOrientation = bool('apply-orientation');
    const outs: OutputFile[] = [];
    for (const [i, entry] of files.entries()) {
      progress.set(`Cleaning ${entry.file.name} (${i + 1} of ${files.length})`, i / files.length);
      const bytes = new Uint8Array(await entry.file.arrayBuffer());
      const format = sniffFormat(bytes);
      const before = inspect(bytes);
      let blob: Blob;
      let note: string;
      if (applyOrientation && before.orientation && before.orientation > 1 && format === 'jpeg') {
        // Bake the rotation into the pixels, which drops all metadata, then
        // re-attach nothing. Colour profile is lost in this path.
        const decoded = await decodeImage(entry.file);
        blob = await encodeBitmap(decoded.bitmap, { type: 'image/jpeg', quality: 0.95 });
        decoded.bitmap.close();
        note = 'rotation applied, re-encoded';
      } else {
        const { bytes: out, summary } = strip(bytes, { keepIcc });
        blob = new Blob([out as BlobPart], { type: entry.file.type || 'application/octet-stream' });
        note = summary.kinds.length ? `removed ${summary.kinds.join(', ')}` : 'nothing to remove';
      }
      let previewUrl: string | undefined;
      try {
        const bmp = await createImageBitmap(blob);
        previewUrl = await thumbnail(bmp);
        bmp.close();
      } catch {
        previewUrl = undefined;
      }
      outs.push({ name: entry.file.name, blob, originalSize: entry.file.size, previewUrl, note });
    }
    progress.set('Done', 1);
    return outs;
  },
});
