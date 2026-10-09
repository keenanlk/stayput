/**
 * Writes the two layered PSD fixtures in static/ with ag-psd (the same library
 * the site reads them with; Pillow checks them independently in the spec).
 * Run from the repo root: node tests/fixtures/make-psd.mjs
 *  - layered.psd: 160x120, opaque. White background, blue sky layer, yellow sun layer.
 *  - transparent.psd: 160x120, no background layer. A red disc and a green bar on nothing,
 *    so its saved composite carries an alpha channel like Photoshop's.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeCanvas, writePsdUint8Array } from 'ag-psd';

initializeCanvas((w, h) => ({
  width: w,
  height: h,
  getContext: () => ({ createImageData: (cw, ch) => ({ width: cw, height: ch, data: new Uint8ClampedArray(cw * ch * 4) }), putImageData() {}, getImageData() {} }),
}));

const W = 160;
const H = 120;
const out = (name) => fileURLToPath(new URL(`./static/${name}`, import.meta.url));

const blank = (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
function paint(img, left, top, test, rgba) {
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++)
      if (test(x + left, y + top)) img.data.set(rgba, (y * img.width + x) * 4);
}
const disc = (cx, cy, r) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
const rect = (x0, y0, x1, y1) => (x, y) => x >= x0 && x < x1 && y >= y0 && y < y1;

// layered.psd
{
  const bg = blank(W, H);
  paint(bg, 0, 0, () => true, [255, 255, 255, 255]);
  const sky = blank(W, 60);
  paint(sky, 0, 0, () => true, [40, 110, 220, 255]);
  const sun = blank(60, 60);
  paint(sun, 50, 30, disc(80, 60, 24), [250, 210, 40, 255]);
  const composite = blank(W, H);
  paint(composite, 0, 0, () => true, [255, 255, 255, 255]);
  paint(composite, 0, 0, rect(0, 0, W, 60), [40, 110, 220, 255]);
  paint(composite, 0, 0, disc(80, 60, 24), [250, 210, 40, 255]);
  const psd = {
    width: W,
    height: H,
    imageData: composite,
    children: [
      { name: 'Background', top: 0, left: 0, imageData: bg },
      { name: 'Sky', top: 0, left: 0, imageData: sky },
      { name: 'Sun', top: 30, left: 50, imageData: sun },
    ],
  };
  writeFileSync(out('layered.psd'), writePsdUint8Array(psd, { generateThumbnail: false }));
}

// transparent.psd
{
  const disc60 = blank(60, 60);
  paint(disc60, 0, 0, disc(30, 30, 29), [220, 40, 40, 255]);
  const bar = blank(100, 16);
  paint(bar, 0, 0, () => true, [30, 160, 70, 255]);
  const composite = blank(W, H);
  paint(composite, 0, 0, disc(80, 50, 29), [220, 40, 40, 255]);
  paint(composite, 0, 0, rect(30, 90, 130, 106), [30, 160, 70, 255]);
  const psd = {
    width: W,
    height: H,
    imageData: composite,
    children: [
      { name: 'Badge', top: 20, left: 50, imageData: disc60 },
      { name: 'Bar', top: 90, left: 30, imageData: bar },
    ],
  };
  writeFileSync(out('transparent.psd'), writePsdUint8Array(psd, { generateThumbnail: false }));
}
