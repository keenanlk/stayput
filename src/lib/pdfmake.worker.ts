/**
 * Runs pdfmake (MIT) off the main thread: line breaking and pagination of a
 * whole book takes seconds, and would freeze the page. Receives a document
 * definition (plain data), sends back the PDF bytes.
 *
 * Two keys of the message are instructions, not part of the definition:
 * `__footer` picks the page-number footer ('epub', the default, from page 2 on;
 * 'n-of-N', "3 of 12" on every page of a document with more than one; 'none'),
 * and `__monoFont` carries the bytes of a monospace TrueType font to register as "Mono".
 */
import pdfMake from 'pdfmake/build/pdfmake';
import vfs from 'pdfmake/build/vfs_fonts';

pdfMake.addVirtualFileSystem(vfs);

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const footers: Record<string, (page: number, count: number) => unknown> = {
  none: () => '',
  // The first page stays clean.
  epub: (page) => (page === 1 ? '' : { text: String(page), alignment: 'center', fontSize: 8, color: '#666' }),
  'n-of-N': (page, count) => (count < 2 ? '' : { text: `${page} of ${count}`, alignment: 'center', fontSize: 8, color: '#666' }),
};

self.onmessage = async (e: MessageEvent<Record<string, unknown>>) => {
  try {
    const { __footer, __monoFont, ...rest } = e.data;
    if (__monoFont instanceof ArrayBuffer) {
      const file = 'DejaVuSansMono.ttf';
      pdfMake.addVirtualFileSystem({ [file]: base64(new Uint8Array(__monoFont)) });
      pdfMake.addFonts({ Mono: { normal: file, bold: file, italics: file, bolditalics: file } });
    }
    // Functions cannot be posted, so the page-number footer is added here.
    const def = { ...rest, footer: footers[typeof __footer === 'string' && __footer in footers ? __footer : 'epub'] };
    const doc = pdfMake.createPdf(def);
    const bytes = new Uint8Array(await doc.getBuffer());
    (self as unknown as Worker).postMessage({ type: 'done', bytes }, [bytes.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
