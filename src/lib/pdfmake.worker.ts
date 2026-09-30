/**
 * Runs pdfmake (MIT) off the main thread: line breaking and pagination of a
 * whole book takes seconds, and would freeze the page. Receives a document
 * definition (plain data), sends back the PDF bytes.
 */
import pdfMake from 'pdfmake/build/pdfmake';
import vfs from 'pdfmake/build/vfs_fonts';

pdfMake.addVirtualFileSystem(vfs);

self.onmessage = async (e: MessageEvent<Record<string, unknown>>) => {
  try {
    const def = {
      ...e.data,
      // Functions cannot be posted, so the page-number footer is added here. The first page stays clean.
      footer: (page: number) => (page === 1 ? '' : { text: String(page), alignment: 'center', fontSize: 8, color: '#666' }),
    };
    const doc = pdfMake.createPdf(def);
    const bytes = new Uint8Array(await doc.getBuffer());
    (self as unknown as Worker).postMessage({ type: 'done', bytes }, [bytes.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
