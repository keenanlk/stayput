// Generates the hard scanner images (STAA-677). Test-only: zxing-wasm writes the codes, sharp degrades them.
// Run: node tests/make-scanner-fixtures.mjs   -> tests/fixtures/scanners/*.{png,jpg}
import sharp from 'sharp';
import { writeBarcode } from 'zxing-wasm/writer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('./fixtures/scanners/', import.meta.url));
mkdirSync(out, { recursive: true });

const QR = 'https://stayput.dev/qr-test?id=staa677';
async function code(format, text, scale = 4, extra = {}) {
  const r = await writeBarcode(text, { format, scale, withQuietZones: true, ecLevel: '', ...extra });
  return Buffer.from(await r.image.arrayBuffer());
}
const png = (buf) => sharp(buf).flatten({ background: '#fff' });
async function place(codeBuf, W, H, { x, y, w, rotate = 0, blur = 0, contrast = 1, invert = false, bg = '#ffffff' }) {
  let c = sharp(codeBuf).flatten({ background: '#fff' }).resize({ width: w, kernel: 'nearest' }).rotate(rotate, { background: bg });
  if (invert) c = c.negate();
  let b = await c.png().toBuffer();
  if (blur) b = await sharp(b).blur(blur).png().toBuffer();
  if (contrast < 1) b = await sharp(b).linear(contrast, 255 * (1 - contrast) / 2).png().toBuffer();
  return { input: b, left: x, top: y };
}
const canvas = (W, H, bg = '#ffffff') => sharp({ create: { width: W, height: H, channels: 3, background: bg } });
const save = async (name, img, jpg) => {
  const file = out + name;
  await (jpg ? img.jpeg({ quality: jpg }) : img.png()).toFile(file);
};

const qr = await code('QRCode', QR, 6);
const ean = await code('EAN-13', '5901234123457', 4);
const upc = await code('UPC-A', '012345678905', 4);
const c128 = await code('Code128', 'Stayput 12345', 4);

// Noise so the 12 MP photo is not a trivially flat canvas.
const noise = (W, H) => sharp({ create: { width: W, height: H, channels: 3, noise: { type: 'gaussian', mean: 200, sigma: 18 } } });

const specs = [
  ['qr-small.png', async () => canvas(400, 400).composite([await place(qr, 400, 400, { x: 150, y: 150, w: 90 })])],
  ['qr-tiny-crop.png', async () => canvas(120, 120).composite([await place(qr, 120, 120, { x: 15, y: 15, w: 62 })])],
  ['qr-tilt15.png', async () => canvas(700, 700).composite([await place(qr, 700, 700, { x: 120, y: 120, w: 300, rotate: 15 })])],
  ['qr-tilt30-jpeg.jpg', async () => canvas(700, 700).composite([await place(qr, 700, 700, { x: 120, y: 120, w: 300, rotate: 30 })]), 40],
  ['qr-blur.png', async () => canvas(600, 600).composite([await place(qr, 600, 600, { x: 100, y: 100, w: 300, blur: 2.2 })])],
  ['qr-lowcontrast.png', async () => canvas(600, 600).composite([await place(qr, 600, 600, { x: 100, y: 100, w: 300, })]).linear(0.18, 255 * 0.41)],
  ['qr-inverted.png', async () => canvas(600, 600, '#000000').composite([await place(qr, 600, 600, { x: 100, y: 100, w: 300, invert: true, bg: '#000000' })])],
  ['qr-jpeg-q15.jpg', async () => canvas(600, 600).composite([await place(qr, 600, 600, { x: 100, y: 100, w: 220 })]), 15],
  ['qr-in-12mp.jpg', async () => noise(4000, 3000).composite([await place(qr, 4000, 3000, { x: 2900, y: 2100, w: 330, rotate: 8 })]), 85],
  ['qr-in-12mp-small.jpg', async () => noise(4000, 3000).composite([await place(qr, 4000, 3000, { x: 1800, y: 1400, w: 150 })]), 85],
  ['qr-multi.png', async () => canvas(900, 500).composite([
    await place(await code('QRCode', 'one-111', 6), 900, 500, { x: 40, y: 100, w: 220 }),
    await place(await code('QRCode', 'two-222', 6), 900, 500, { x: 340, y: 100, w: 220 }),
    await place(await code('QRCode', 'three-333', 6), 900, 500, { x: 640, y: 100, w: 220 })])],
  ['ean13-small.png', async () => canvas(500, 300).composite([await place(ean, 500, 300, { x: 150, y: 100, w: 190 })])],
  ['ean13-tilt20.png', async () => canvas(800, 700).composite([await place(ean, 800, 700, { x: 200, y: 200, w: 400, rotate: 20 })])],
  ['ean13-blur.png', async () => canvas(700, 400).composite([await place(ean, 700, 400, { x: 100, y: 100, w: 400, blur: 1.6 })])],
  ['ean13-jpeg.jpg', async () => canvas(700, 400).composite([await place(ean, 700, 400, { x: 100, y: 100, w: 300 })]), 20],
  ['ean13-in-12mp.jpg', async () => noise(4000, 3000).composite([await place(ean, 4000, 3000, { x: 2000, y: 1500, w: 420, rotate: 5 })]), 85],
  ['upca-inverted.png', async () => canvas(700, 400, '#000').composite([await place(upc, 700, 400, { x: 100, y: 100, w: 400, invert: true, bg: '#000' })])],
  ['upca-lowcontrast.png', async () => canvas(700, 400).composite([await place(upc, 700, 400, { x: 100, y: 100, w: 400 })]).linear(0.2, 255 * 0.4)],
  ['code128-tilt-small.png', async () => canvas(600, 500).composite([await place(c128, 600, 500, { x: 150, y: 150, w: 340, rotate: -25 })])],
  ['code128-in-12mp.jpg', async () => noise(4000, 3000).composite([await place(c128, 4000, 3000, { x: 600, y: 2200, w: 500 })]), 85],
  // A screenshot-like picture with text, a gradient and shapes, and no code in it.
  ['no-code.png', async () => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e8eef7"/><stop offset="1" stop-color="#9fb4d6"/></linearGradient></defs><rect width="900" height="600" fill="url(#g)"/><circle cx="650" cy="220" r="110" fill="#33507a"/><rect x="60" y="80" width="360" height="26" rx="6" fill="#223"/><rect x="60" y="130" width="300" height="14" rx="6" fill="#556"/><rect x="60" y="160" width="330" height="14" rx="6" fill="#556"/><text x="60" y="400" font-family="Helvetica, Arial, sans-serif" font-size="44" fill="#112">No code in this picture</text></svg>`))],
];
for (const [name, make, jpg] of specs) { await save(name, await make(), jpg); console.log(name); }
