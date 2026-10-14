import { createShell, processEach } from '../lib/shell';
import { baseName, formatBytes, type OutputFile } from '../lib/files';

const results = document.getElementById('b64-results')!;

/** Above this the encoded text is worth a warning: Base64 adds a third and the page can no longer cache the image. */
const BIG = 1024 * 1024;

const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  svg: 'image/svg+xml', avif: 'image/avif', ico: 'image/x-icon', bmp: 'image/bmp',
};

function mimeOf(file: File): string {
  const ext = file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase();
  if (file.type.startsWith('image/')) return file.type;
  return MIME[ext] ?? 'application/octet-stream';
}

/** The file's bytes as Base64, via FileReader; the data URL's own header is dropped so the type can be corrected. */
function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'));
    reader.onload = () => {
      const url = String(reader.result);
      resolve(url.slice(url.indexOf(',') + 1));
    };
    reader.readAsDataURL(file);
  });
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

function block(index: number, key: string, label: string, text: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'b64-block';
  const head = document.createElement('div');
  head.className = 'b64-head';
  const lab = document.createElement('label');
  lab.textContent = label;
  lab.htmlFor = `b64-${key}-${index}`;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-small b64-copy';
  btn.id = `b64-copy-${key}-${index}`;
  btn.textContent = 'Copy';
  btn.addEventListener('click', async () => {
    const ok = await copyText(text);
    btn.textContent = ok ? 'Copied' : 'Copy failed';
    setTimeout(() => (btn.textContent = 'Copy'), 1600);
  });
  head.append(lab, btn);
  const ta = document.createElement('textarea');
  ta.id = `b64-${key}-${index}`;
  ta.readOnly = true;
  ta.rows = 3;
  ta.spellcheck = false;
  ta.value = text;
  wrap.append(head, ta);
  return wrap;
}

function card(index: number, file: File, base64: string, uri: string): HTMLElement {
  const el = document.createElement('section');
  el.className = 'b64-card';
  el.dataset.index = String(index);
  const h = document.createElement('h3');
  h.textContent = file.name;
  const size = document.createElement('p');
  size.className = 'b64-size';
  const growth = file.size > 0 ? Math.round((uri.length / file.size - 1) * 100) : 0;
  size.textContent = `Original ${formatBytes(file.size)} → data URI ${formatBytes(uri.length)} (${growth >= 0 ? '+' : ''}${growth}%)`;
  el.append(h, size);
  if (file.size > BIG) {
    const warn = document.createElement('p');
    warn.className = 'b64-warn';
    warn.setAttribute('role', 'note');
    warn.textContent = 'This image is over 1 MB. Embedding it as a data URI makes the page that holds it about a third bigger than the file itself, and the browser cannot cache it separately. Link to the image file instead, or shrink it first.';
    el.append(warn);
  }
  el.append(
    block(index, 'uri', 'Data URI', uri),
    block(index, 'raw', 'Base64 only', base64),
    block(index, 'html', 'HTML <img>', `<img src="${uri}" alt="">`),
    block(index, 'css', 'CSS background', `background-image: url("${uri}");`),
  );
  return el;
}

createShell({
  autoDownloadSingle: false,
  resultsTitle: (outs) => `Encoded ${outs.length} ${outs.length === 1 ? 'image' : 'images'}`,
  async process(files, progress) {
    results.textContent = '';
    results.hidden = true;
    const outs = await processEach(files, progress, 'Encoding', async (entry, i) => {
      const base64 = await readBase64(entry.file);
      const uri = `data:${mimeOf(entry.file)};base64,${base64}`;
      results.append(card(i, entry.file, base64, uri));
      const out: OutputFile = {
        name: `${baseName(entry.file.name)}-base64.txt`,
        blob: new Blob([uri], { type: 'text/plain' }),
        originalSize: entry.file.size,
        note: `Data URI, ${formatBytes(uri.length)}`,
      };
      return out;
    });
    results.hidden = false;
    return outs;
  },
});
