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

// A two-page article: heading, subheading, wrapped body paragraphs and a hyphenated line break.
const article = await PDFDocument.create();
const bodyFont = await article.embedFont(StandardFonts.TimesRoman);
const boldFont = await article.embedFont(StandardFonts.HelveticaBold);
const wrap = (text, size, width) => {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? line + ' ' + w : w;
    if (bodyFont.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
};
{
  const page = article.addPage([612, 792]);
  let y = 720;
  page.drawText('Fixture Article Title', { x: 72, y, size: 26, font: boldFont });
  y -= 44;
  page.drawText('First section', { x: 72, y, size: 16, font: boldFont });
  y -= 28;
  const p1 = 'The quick brown fox jumps over the lazy dog while the committee deliberates at length about the extraordinary circumstances of the meeting and the unprecedented turnout of members from every district.';
  for (const l of wrap(p1, 12, 468)) { page.drawText(l, { x: 72, y, size: 12, font: bodyFont }); y -= 16; }
  y -= 12;
  const p2 = 'Second paragraph begins here and keeps going for long enough to wrap onto several lines so that paragraph detection has something to work with in the test.';
  for (const l of wrap(p2, 12, 468)) { page.drawText(l, { x: 72, y, size: 12, font: bodyFont }); y -= 16; }
  y -= 12;
  page.drawText('This line ends with a hyphen because the word extra-', { x: 72, y, size: 12, font: bodyFont }); y -= 16;
  page.drawText('ordinary was split across two lines.', { x: 72, y, size: 12, font: bodyFont });
}
{
  const page = article.addPage([612, 792]);
  page.drawText('Second page', { x: 72, y: 720, size: 16, font: boldFont });
  page.drawText('Text on the second page of the article.', { x: 72, y: 690, size: 12, font: bodyFont });
}
await writeFile(new URL('article.pdf', out), await article.save());

const scan = await PDFDocument.create();
const jpg = await scan.embedJpg(await readFile(new URL('big.jpg', out)));
for (let i = 0; i < 2; i++) {
  const page = scan.addPage([612, 792]);
  page.drawImage(jpg, { x: 0, y: 0, width: 612, height: 792 });
}
await writeFile(new URL('scan.pdf', out), await scan.save());
console.log('pdf fixtures written');
