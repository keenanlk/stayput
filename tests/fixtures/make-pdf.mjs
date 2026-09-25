// Create PDF fixtures: a 3-page text PDF and a PDF with a large embedded JPEG.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const out = new URL('./generated/', import.meta.url);
await mkdir(out, { recursive: true });

const text = await PDFDocument.create();
const font = await text.embedFont(StandardFonts.Helvetica);
for (let i = 1; i <= 3; i++) {
  const page = text.addPage([612, 792]);
  page.drawText(`Page ${i} of the fixture document`, { x: 60, y: 700, size: 24, font, color: rgb(0.1, 0.1, 0.1) });
  page.drawRectangle({ x: 60, y: 100, width: 200 + i * 50, height: 300, color: rgb(0.2, 0.5, 0.4) });
}
await writeFile(new URL('text.pdf', out), await text.save());

const scan = await PDFDocument.create();
const jpg = await scan.embedJpg(await readFile(new URL('big.jpg', out)));
for (let i = 0; i < 2; i++) {
  const page = scan.addPage([612, 792]);
  page.drawImage(jpg, { x: 0, y: 0, width: 612, height: 792 });
}
await writeFile(new URL('scan.pdf', out), await scan.save());
console.log('pdf fixtures written');
