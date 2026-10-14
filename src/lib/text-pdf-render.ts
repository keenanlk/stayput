/**
 * Worker client for Text to PDF: sends a pdfmake definition to the pdfmake worker and reads back the
 * PDF bytes. The monospace font is fetched from this site (it is precached for offline use) and
 * handed to the worker, which registers it as "Mono".
 */
import { TEXT_ERRORS } from './text-pdf';

const MONO_FONT_URL = '/fonts/DejaVuSansMono-subset.ttf';

let monoFont: Promise<ArrayBuffer> | undefined;
function loadMonoFont(): Promise<ArrayBuffer> {
  monoFont ??= fetch(MONO_FONT_URL).then((r) => {
    if (!r.ok) throw new Error(TEXT_ERRORS.workerFailed);
    return r.arrayBuffer();
  });
  monoFont.catch(() => (monoFont = undefined));
  return monoFont;
}

export async function renderTextPdf(def: Record<string, unknown>, opts: { usesMono: boolean; numbers: boolean }): Promise<Uint8Array> {
  // A copy: the bytes are transferred to the worker and the cached buffer must stay whole.
  const font = opts.usesMono ? (await loadMonoFont()).slice(0) : undefined;
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./pdfmake.worker.ts', import.meta.url), { type: 'module' });
    const fail = (detail: unknown) => {
      worker.terminate();
      console.warn('Text to PDF:', detail);
      reject(new Error(TEXT_ERRORS.workerFailed));
    };
    worker.onmessage = (e: MessageEvent<{ type: 'done'; bytes: Uint8Array } | { type: 'error'; message: string }>) => {
      const m = e.data;
      if (m.type === 'done') {
        worker.terminate();
        resolve(m.bytes);
      } else fail(m.message);
    };
    worker.onerror = (e) => fail(e.message);
    worker.postMessage({ ...def, __footer: opts.numbers ? 'n-of-N' : 'none', __monoFont: font }, font ? [font] : []);
  });
}
