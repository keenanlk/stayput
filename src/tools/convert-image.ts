import { createShell, bindRange, num, str, bool, processEach, type ShellFile } from '../lib/shell';
import { decodeImage, supportsWebpEncoding, thumbnail } from '../lib/image';
import { writeAnimatedGif, writeImage } from '../lib/encoders';
import { parseAnimatedWebp } from '../lib/webp-anim';
import { detectKind, kindFromName, KIND_LABEL, type ImageKind } from '../lib/detect';
import { GROUPS, outputFormat, searchFormats, type OutputFormat, type OutputType } from '../lib/formats';
import { extractExifTiff, jpegWithExif, withNormalOrientation } from '../lib/exif';
import { extOf, replaceExt, type OutputFile } from '../lib/files';

bindRange('quality', 'quality-out');

const formatSel = document.getElementById('format') as HTMLSelectElement;
/** Formats this browser cannot write, with the reason shown in the picker. */
const unavailable = new Map<OutputType, string>();
/** Real formats of the files in the list, from their bytes. */
let detected: { kind: ImageKind | undefined; renamed: boolean }[] = [];

void supportsWebpEncoding().then((ok) => {
  if (ok) return;
  unavailable.set('image/webp', 'This browser cannot save WebP. Chrome, Edge and Firefox can.');
  const opt = formatSel.querySelector<HTMLOptionElement>('option[value="image/webp"]');
  if (opt) {
    opt.disabled = true;
    opt.textContent = 'WebP (not supported by this browser)';
  }
  if (formatSel.value === 'image/webp') setFormat('image/jpeg');
  render();
});

/** Why a format is a poor or impossible choice for the current files, or undefined when it is fine. */
function caveat(f: OutputFormat): string | undefined {
  const kinds = new Set(detected.map((d) => d.kind).filter(Boolean));
  if (kinds.size === 1 && kinds.has(f.kind)) return `Same format as your file${detected.length > 1 ? 's' : ''}: it is re-encoded${f.quality ? ' at the quality you pick' : ''}.`;
  const transparentSources = [...kinds].some((k) => k === 'png' || k === 'webp' || k === 'gif' || k === 'svg' || k === 'avif' || k === 'ico' || k === 'tiff' || k === 'jxl' || k === 'psd');
  if (!f.alpha && transparentSources) return 'Transparent areas get the background colour.';
  if (f.type === 'image/gif' && kinds.has('gif')) return 'Keeps only the first frame of an animation.';
  return undefined;
}

function syncFields() {
  const f = outputFormat(formatSel.value);
  document.getElementById('quality-field')!.hidden = !f.quality;
  document.getElementById('background-field')!.hidden = f.alpha;
  document.getElementById('exif-field')!.hidden = f.type !== 'image/jpeg';
  document.getElementById('format-note')!.textContent = [f.blurb, caveat(f)].filter(Boolean).join(' ');
}

function setFormat(type: OutputType) {
  if (formatSel.value === type) return;
  formatSel.value = type;
  formatSel.dispatchEvent(new Event('change', { bubbles: true }));
}

/* ---------- Searchable picker ---------- */

const field = formatSel.closest('.format-field') as HTMLElement;
const picker = document.getElementById('picker')!;
const button = document.getElementById('picker-button') as HTMLButtonElement;
const pop = document.getElementById('picker-pop')!;
const search = document.getElementById('picker-search') as HTMLInputElement;
const list = document.getElementById('picker-list')!;
const empty = document.getElementById('picker-empty')!;
let active = -1;
let shown: OutputFormat[] = [];

field.classList.add('is-enhanced');
formatSel.tabIndex = -1;
formatSel.setAttribute('aria-hidden', 'true');
document.getElementById('format-label')!.setAttribute('for', 'picker-button');
picker.hidden = false;

function render() {
  const f = outputFormat(formatSel.value);
  document.getElementById('picker-value')!.textContent = f.label;
  document.getElementById('picker-ext')!.textContent = `.${f.ext}`;
  syncFields();
  if (!pop.hidden) renderList();
}

function renderList() {
  const q = search.value;
  shown = searchFormats(q);
  list.replaceChildren();
  // Grouped when browsing, ranked by match when searching.
  const sections: [string | undefined, OutputFormat[]][] = q.trim() ? [[undefined, shown]] : GROUPS.map((g) => [g, shown.filter((f) => f.group === g)]);
  shown = sections.flatMap(([, fs]) => fs);
  let i = 0;
  for (const [group, fs] of sections) {
    if (!fs.length) continue;
    if (group) {
      const li = document.createElement('li');
      li.className = 'group';
      li.setAttribute('role', 'presentation');
      li.textContent = group;
      list.append(li);
    }
    for (const f of fs) {
      const li = document.createElement('li');
      const index = i++;
      li.id = `fmt-${f.ext}`;
      li.setAttribute('role', 'option');
      li.dataset.type = f.type;
      li.setAttribute('aria-selected', String(f.type === formatSel.value));
      const why = unavailable.get(f.type);
      if (why) li.setAttribute('aria-disabled', 'true');
      const name = Object.assign(document.createElement('span'), { className: 'name', textContent: f.label });
      const ext = Object.assign(document.createElement('span'), { className: 'ext', textContent: `.${f.ext}` });
      const blurb = Object.assign(document.createElement('span'), { className: 'blurb', textContent: why ?? f.blurb });
      li.append(name, ext, blurb);
      const flag = why ? undefined : caveat(f);
      if (flag) li.append(Object.assign(document.createElement('span'), { className: 'flag', textContent: flag }));
      li.addEventListener('pointerdown', (e) => e.preventDefault());
      li.addEventListener('click', () => choose(index));
      li.addEventListener('pointermove', () => highlight(index, false));
      list.append(li);
    }
  }
  empty.hidden = shown.length > 0;
  const selected = shown.findIndex((f) => f.type === formatSel.value);
  highlight(q.trim() ? firstEnabled(0, 1) : selected >= 0 ? selected : firstEnabled(0, 1), true);
}

function firstEnabled(from: number, step: 1 | -1): number {
  for (let i = from; i >= 0 && i < shown.length; i += step) if (!unavailable.has(shown[i]!.type)) return i;
  return -1;
}

function highlight(i: number, scroll: boolean) {
  active = i;
  list.querySelectorAll('[role="option"]').forEach((el, j) => el.classList.toggle('is-active', j === i));
  const el = i >= 0 ? list.querySelectorAll<HTMLElement>('[role="option"]')[i] : undefined;
  if (el) {
    search.setAttribute('aria-activedescendant', el.id);
    if (scroll) el.scrollIntoView({ block: 'nearest' });
  } else search.removeAttribute('aria-activedescendant');
}

function choose(i: number) {
  const f = shown[i];
  if (!f || unavailable.has(f.type)) return;
  setFormat(f.type);
  close(true);
}

function open() {
  if (!pop.hidden) return;
  pop.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  search.value = '';
  renderList();
  search.focus();
}

function close(focusButton: boolean) {
  if (pop.hidden) return;
  pop.hidden = true;
  button.setAttribute('aria-expanded', 'false');
  if (focusButton) button.focus();
}

button.addEventListener('click', () => (pop.hidden ? open() : close(true)));
button.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    open();
  } else if (e.key.length === 1 && /\S/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
    // Typing on the closed picker starts a search.
    e.preventDefault();
    open();
    search.value = e.key;
    renderList();
  }
});
search.addEventListener('input', renderList);
search.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const next = firstEnabled(active + 1, 1);
    highlight(next >= 0 ? next : firstEnabled(0, 1), true);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    const prev = firstEnabled(active - 1, -1);
    highlight(prev >= 0 ? prev : firstEnabled(shown.length - 1, -1), true);
  } else if (e.key === 'Home' || e.key === 'End') {
    e.preventDefault();
    highlight(e.key === 'Home' ? firstEnabled(0, 1) : firstEnabled(shown.length - 1, -1), true);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    choose(active);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    close(true);
  } else if (e.key === 'Tab') {
    close(false);
  }
});
document.addEventListener('pointerdown', (e) => {
  if (!picker.contains(e.target as Node)) close(false);
});
formatSel.addEventListener('change', render);
render();

/* ---------- Detection ---------- */

async function describeFiles(files: ShellFile[]) {
  detected = await Promise.all(
    files.map(async ({ file }) => {
      const kind = await detectKind(file).catch(() => undefined);
      const claimed = kindFromName(file.name, '');
      return { kind, renamed: !!kind && !!claimed && claimed !== kind };
    }),
  );
  const out = document.getElementById('detected')!;
  if (!files.length) {
    out.hidden = true;
    out.replaceChildren();
    render();
    return;
  }
  const counts = new Map<string, number>();
  for (const d of detected) {
    const label = d.kind ? KIND_LABEL[d.kind] : 'Unknown';
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const chips = [...counts].map(([label, n]) => Object.assign(document.createElement('span'), { className: 'kind', textContent: counts.size > 1 || n > 1 ? `${n} ${label}` : label }));
  out.replaceChildren(document.createTextNode(files.length === 1 ? 'Detected' : `Detected in ${files.length} files`), ...chips);
  const renamed = detected.filter((d) => d.renamed).length;
  if (renamed) {
    out.append(Object.assign(document.createElement('span'), { className: 'renamed', textContent: renamed === 1 && files.length === 1 ? `(named .${extOf(files[0]!.file.name)}, but it is really ${KIND_LABEL[detected[0]!.kind!]})` : `(${renamed} named with the wrong extension)` }));
  }
  if (detected.some((d) => d.kind === 'pdf')) {
    out.append(Object.assign(document.createElement('span'), { className: 'renamed', textContent: 'PDFs go through PDF to Image instead.' }));
  }
  out.hidden = false;
  render();
}

createShell({
  onFilesChanged: describeFiles,
  outputFormat: () => outputFormat(formatSel.value).ext,
  async process(files, progress) {
    const type = str('format', 'image/jpeg') as OutputType;
    const f = outputFormat(type);
    const quality = num('quality', 90) / 100;
    const background = str('background', '#ffffff');
    const keepExif = bool('keep-exif') && type === 'image/jpeg';
    return processEach(files, progress, 'Converting', async (entry) => {
      if ((await detectKind(entry.file)) === 'pdf') throw new Error('This is a PDF, not an image. Use PDF to Image to turn its pages into pictures.');
      const decoded = await decodeImage(entry.file);
      // An animated WebP stays animated as a GIF; every other path keeps the first frame.
      const anim = type === 'image/gif' && (await detectKind(entry.file)) === 'webp' ? parseAnimatedWebp(new Uint8Array(await entry.file.arrayBuffer())) : undefined;
      let blob = anim ? new Blob([(await writeAnimatedGif(anim)) as BlobPart], { type }) : await writeImage(decoded.bitmap, type, { quality, background });
      if (keepExif) {
        const tiff = extractExifTiff(new Uint8Array(await entry.file.arrayBuffer()));
        if (tiff) {
          const jpeg = new Uint8Array(await blob.arrayBuffer());
          blob = new Blob([jpegWithExif(jpeg, withNormalOrientation(tiff)) as BlobPart], { type });
        }
      }
      const out: OutputFile = { name: replaceExt(entry.file.name, f.ext), blob, originalSize: entry.file.size, previewUrl: await thumbnail(decoded.bitmap), ...(anim ? { note: `${anim.frames.length} frames, animated` } : {}) };
      decoded.bitmap.close();
      return out;
    });
  },
});
