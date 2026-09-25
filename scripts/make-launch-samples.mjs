// Realistic-looking sample documents for the launch screenshots (not test fixtures).
// Writes PDFs into launch/assets/samples/. Images come from make-launch-samples.py.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../launch/assets/samples/', import.meta.url));
mkdirSync(out, { recursive: true });

const lorem = [
  'This Agreement is entered into as of the Effective Date by and between the parties named below, who agree as follows.',
  '1. Services. The Provider will perform the services described in Schedule A with reasonable skill and care, and will keep the Client informed of progress at the intervals set out there.',
  '2. Fees. The Client will pay the fees in Schedule B within thirty days of each invoice. Late amounts accrue interest at the rate stated in Schedule B.',
  '3. Confidentiality. Each party will keep the other party’s confidential information secret and will use it only for the purposes of this Agreement.',
  '4. Term. This Agreement starts on the Effective Date and continues until the services are complete, unless ended earlier under clause 5.',
  '5. Termination. Either party may end this Agreement on thirty days’ written notice. Sections 3, 6 and 7 survive termination.',
  '6. Liability. Neither party is liable for indirect or consequential loss. Each party’s total liability is limited to the fees paid in the twelve months before the claim.',
  '7. General. This Agreement is the whole agreement between the parties and may be changed only in writing signed by both.',
];

async function textPdf(name, title, pages, { signature = false } = {}) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  for (let p = 0; p < pages; p++) {
    const page = doc.addPage([612, 792]);
    let y = 720;
    if (p === 0) {
      page.drawText(title, { x: 72, y, size: 20, font: bold });
      y -= 40;
    }
    const paras = p === 0 ? lorem : [...lorem.slice(2), ...lorem.slice(0, 2)];
    for (const para of paras) {
      const words = para.split(' ');
      let line = '';
      for (const w of words) {
        const t = line ? line + ' ' + w : w;
        if (font.widthOfTextAtSize(t, 11.5) > 468) {
          page.drawText(line, { x: 72, y, size: 11.5, font });
          y -= 16;
          line = w;
        } else line = t;
      }
      page.drawText(line, { x: 72, y, size: 11.5, font });
      y -= 28;
    }
    if (signature && p === pages - 1) {
      y -= 30;
      page.drawText('Signed for the Client:', { x: 72, y, size: 11.5, font });
      page.drawLine({ start: { x: 200, y: y - 4 }, end: { x: 420, y: y - 4 }, thickness: 0.8, color: rgb(0.2, 0.2, 0.2) });
      page.drawText('Date:', { x: 72, y: y - 40, size: 11.5, font });
      page.drawLine({ start: { x: 200, y: y - 44 }, end: { x: 420, y: y - 44 }, thickness: 0.8, color: rgb(0.2, 0.2, 0.2) });
    }
    page.drawText(`${title} · page ${p + 1} of ${pages}`, { x: 72, y: 40, size: 9, font, color: rgb(0.45, 0.45, 0.45) });
  }
  writeFileSync(out + name, await doc.save());
}

await textPdf('services-agreement.pdf', 'Services Agreement', 3, { signature: true });
await textPdf('schedule-a.pdf', 'Schedule A: Services', 2);
await textPdf('schedule-b.pdf', 'Schedule B: Fees', 1);
console.log('sample PDFs written to', out);
