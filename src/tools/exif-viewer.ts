import { createShell, type ShellFile, type Skipped } from '../lib/shell';
import { extractExifTiff, inspect, sniffFormat } from '../lib/exif';
import { readExif, type ExifField, type ExifReport } from '../lib/exif-read';

const panel = document.getElementById('exif-panel')!;
const reportEl = document.getElementById('exif-report')!;

interface Reading {
  report: ExifReport;
  /** Metadata blocks the file carries besides EXIF (XMP, ICC, comments). */
  kinds: string[];
}
const readings = new Map<number, Reading | Error>();

const isTiff = (b: Uint8Array) => b.length > 4 && ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 42) || (b[0] === 0x4d && b[1] === 0x4d && b[3] === 42));

function read(bytes: Uint8Array): Reading {
  if (isTiff(bytes)) return { report: readExif(bytes), kinds: ['EXIF'] };
  if (sniffFormat(bytes) === 'unknown') throw new Error('Not a JPG, PNG, WebP, HEIC or TIFF image.');
  const tiff = extractExifTiff(bytes);
  let kinds: string[] = [];
  try {
    kinds = inspect(bytes).kinds;
  } catch {
    kinds = tiff ? ['EXIF'] : [];
  }
  return { report: tiff ? readExif(tiff) : { fields: [], hasThumbnail: false }, kinds };
}

const get = (r: ExifReport, label: string) => r.fields.find((f) => f.label === label)?.value;

/** "2026:09:25 12:00:00" -> "25 Sep 2026, 12:00:00" without involving time zones. */
function prettyDate(s: string | undefined): string | undefined {
  const m = s?.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/);
  if (!m) return s;
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month} ${m[1]}, ${m[4]}` : s;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...kids);
  return node;
}

function fact(label: string, value: Node | string, tone?: 'alert' | 'clear') {
  const li = el('li', { className: tone ?? '' }, el('span', { className: 'k' }, label), el('span', { className: 'v' }, value));
  return li;
}

function locationValue(r: ExifReport): Node {
  const { lat, lon } = r.gps!;
  const coords = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  const wrap = el('span', {}, coords);
  const copy = el('button', { type: 'button', className: 'btn btn-sm' }, 'Copy');
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(coords);
      copy.textContent = 'Copied';
    } catch {
      copy.textContent = 'Copy failed';
    }
  });
  const map = el('a', {
    className: 'btn btn-sm',
    href: `https://www.openstreetmap.org/?mlat=${lat.toFixed(6)}&mlon=${lon.toFixed(6)}#map=17/${lat.toFixed(6)}/${lon.toFixed(6)}`,
    target: '_blank',
    rel: 'noopener noreferrer',
    title: 'Opens openstreetmap.org with only these coordinates',
  }, 'Open map');
  wrap.append(el('span', { className: 'field-row' }, copy, map));
  return wrap;
}

function card(entry: ShellFile, reading: Reading | Error, open: boolean): HTMLElement {
  const article = el('article', { className: 'exif-card' });
  if (reading instanceof Error) {
    article.append(el('header', {}, el('strong', {}, entry.file.name), el('span', {}, reading.message)));
    return article;
  }
  const { report, kinds } = reading;
  const count = report.fields.length;
  article.append(
    el('header', {}, el('strong', {}, entry.file.name), el('span', {}, kinds.length ? `Carries ${kinds.join(', ')}` : 'No metadata blocks found')),
  );

  const facts = el('ul', { className: 'exif-facts' });
  facts.append(report.gps ? fact('Location', locationValue(report), 'alert') : fact('Location', 'None stored', 'clear'));
  const taken = get(report, 'Taken') ?? get(report, 'Digitized');
  const when = prettyDate(taken ?? get(report, 'Modified'));
  if (when) facts.append(fact(taken ? 'Taken' : 'Last saved', [when, get(report, taken ? 'Time zone (taken)' : 'Time zone (modified)')].filter(Boolean).join(' '), 'alert'));
  const device = [get(report, 'Make'), get(report, 'Model')].filter(Boolean).join(' ');
  if (device) facts.append(fact('Device', device));
  const lens = get(report, 'Lens model');
  if (lens) facts.append(fact('Lens', lens));
  const shot = [get(report, 'Aperture'), get(report, 'Exposure time'), get(report, 'ISO') && `ISO ${get(report, 'ISO')}`, get(report, 'Focal length')].filter(Boolean).join(' · ');
  if (shot) facts.append(fact('Settings', shot));
  for (const label of ['Camera serial number', 'Camera owner', 'Artist', 'Unique image ID', 'Host computer']) {
    const v = get(report, label);
    if (v) facts.append(fact(label, v, 'alert'));
  }
  const sw = get(report, 'Software');
  if (sw) facts.append(fact('Edited with', sw));
  if (report.hasThumbnail) facts.append(fact('Thumbnail', 'A small preview copy is embedded. It can show the photo before it was cropped.', 'alert'));
  if (count === 0 && kinds.length === 0) facts.append(fact('EXIF', 'Nothing here. This photo carries no metadata.', 'clear'));
  article.append(facts);

  if (count > 0) {
    const details = el('details', { open });
    details.append(el('summary', {}, `All ${count} field${count === 1 ? '' : 's'}`));
    const table = el('table', { className: 'exif-table' });
    const groups = new Map<string, ExifField[]>();
    for (const f of report.fields) groups.set(f.group, [...(groups.get(f.group) ?? []), f]);
    for (const [group, fields] of groups) {
      const body = el('tbody');
      body.append(el('tr', {}, el('th', { scope: 'rowgroup', colSpan: 2 } as Partial<HTMLTableCellElement>, group)));
      for (const f of fields) {
        const tr = el('tr', { className: f.sensitive ? 'sensitive' : '' }, el('th', { scope: 'row' } as Partial<HTMLTableCellElement>, f.label), el('td', {}, f.value));
        body.append(tr);
      }
      table.append(body);
    }
    details.append(table);
    article.append(details);
  }
  return article;
}

async function render(files: ShellFile[]) {
  panel.hidden = files.length === 0;
  reportEl.replaceChildren();
  for (const entry of files) {
    if (!readings.has(entry.id)) {
      try {
        readings.set(entry.id, read(new Uint8Array(await entry.file.arrayBuffer())));
      } catch (e) {
        readings.set(entry.id, e instanceof Error ? e : new Error(String(e)));
      }
    }
    reportEl.append(card(entry, readings.get(entry.id)!, files.length === 1));
  }
}

const csvCell = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

createShell({
  onFilesChanged: render,
  resultsTitle: () => 'Report ready',
  async process(files, progress) {
    const rows: string[][] = [['file', 'group', 'field', 'value']];
    const skipped: Skipped[] = [];
    for (const [i, entry] of files.entries()) {
      progress.set(`Reading ${entry.file.name} (${i + 1} of ${files.length})`, i / files.length);
      let reading = readings.get(entry.id);
      if (!reading) {
        try {
          reading = read(new Uint8Array(await entry.file.arrayBuffer()));
        } catch (e) {
          reading = e instanceof Error ? e : new Error(String(e));
        }
        readings.set(entry.id, reading);
      }
      if (reading instanceof Error) {
        skipped.push({ name: entry.file.name, reason: reading.message });
        continue;
      }
      if (reading.report.fields.length === 0) rows.push([entry.file.name, '', '', 'no EXIF data']);
      for (const f of reading.report.fields) rows.push([entry.file.name, f.group, f.label, f.value]);
    }
    if (skipped.length === files.length) throw new Error(`${skipped[0]!.name}: ${skipped[0]!.reason}`);
    progress.set('Done', 1);
    const csv = rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const name = files.length === 1 ? `${files[0]!.file.name.replace(/\.[^.]+$/, '')}-exif.csv` : 'exif-report.csv';
    return { outputs: [{ name, blob, badge: 'CSV', note: `${rows.length - 1} rows` }], skipped };
  },
});
