import { test, expect, type Page } from '@playwright/test';
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { detectPitch, instrumentById, nearestString, noteFor, noteLabel } from '../src/lib/tuner';
import { svgFallbackSize } from '../src/lib/svg-size';

const RATE = 48000;
const tone = (partials: [freq: number, amp: number][], n = 4096) => {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) for (const [f, a] of partials) out[i]! += a * Math.sin((2 * Math.PI * f * i) / RATE + f);
  return out;
};
const noisy = (buf: Float32Array, level: number) => {
  let seed = 11;
  return buf.map((v) => v + (((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2) * level);
};
const cents = (a: number, b: number) => 1200 * Math.log2(a / b);

/** Stand in for the microphone with a sine tone whose frequency the test can change. */
async function fakeTone(page: Page, hz: number) {
  await page.addInitScript((f) => {
    navigator.mediaDevices.getUserMedia = async () => {
      const ac = new AudioContext();
      const osc = ac.createOscillator();
      osc.frequency.value = f;
      const gain = ac.createGain();
      gain.gain.value = 0.3;
      const dest = ac.createMediaStreamDestination();
      osc.connect(gain).connect(dest);
      osc.start();
      (window as unknown as { __osc: OscillatorNode }).__osc = osc;
      return dest.stream;
    };
  }, hz);
}
const setHz = (page: Page, hz: number) => page.evaluate((f) => (window as unknown as { __osc: OscillatorNode }).__osc.frequency.setValueAtTime(f, 0), hz);

test('flute top octave: the detector reads up to 1,500 Hz and nothing above it', () => {
  // A flute's notes by octave: C5 to B5 and C6 to F♯6 are read; G6 up to C7 (2,093 Hz) is above the detector's range.
  for (const f of [523.25, 880, 1046.5, 1318.5, 1480]) {
    const p = detectPitch(tone([[f, 0.25], [f * 2, 0.05]]), RATE);
    expect(p, String(f)).toBeDefined();
    expect(Math.abs(cents(p!.freq, f)), String(f)).toBeLessThan(3);
  }
  for (const f of [1760, 2093]) {
    const p = detectPitch(tone([[f, 0.25]]), RATE);
    // Out of range: either nothing, or not the note played, so the page does not claim it.
    expect(p === undefined || Math.abs(cents(p.freq, f)) > 50, String(f)).toBe(true);
  }
});

test('viola low C3 reads as C3 with its weak fundamental and in light noise, with and without a strong second harmonic', () => {
  const strings = instrumentById('viola').strings;
  expect(strings.map(noteLabel)).toEqual(['C3', 'G3', 'D4', 'A4']);
  const c3 = 130.81;
  for (const level of [0, 0.02, 0.05]) {
    for (const partials of [
      [[c3, 0.2], [c3 * 2, 0.1], [c3 * 3, 0.05]],
      [[c3, 0.05], [c3 * 2, 0.25], [c3 * 3, 0.15], [c3 * 4, 0.1]],
    ] as [number, number][][]) {
      const p = detectPitch(noisy(tone(partials, 8192), level), RATE);
      expect(p, `noise ${level}`).toBeDefined();
      expect(Math.abs(cents(p!.freq, c3)), `noise ${level}`).toBeLessThan(5);
      expect(nearestString(p!.freq, strings)!.index).toBe(0);
    }
  }
});

test('svgFallbackSize sizes a viewBox-only SVG and leaves SVGs with a size alone', () => {
  expect(svgFallbackSize('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"></svg>')).toEqual({ width: 1024, height: 512 });
  expect(svgFallbackSize('<?xml version="1.0"?><svg viewBox="0 0 20 40" width="100%"></svg>')).toEqual({ width: 512, height: 1024 });
  expect(svgFallbackSize('<svg width="200" height="100" viewBox="0 0 10 10"></svg>')).toBeUndefined();
  expect(svgFallbackSize('<svg></svg>')).toBeUndefined();
});

test('Flute tuner page opens as a chromatic tuner with no string buttons and names A4 and C6', async ({ page }) => {
  await fakeTone(page, 440);
  await page.goto('/flute-tuner');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('h1')).toHaveText('Flute tuner');
  await expect(page.locator('#instrument')).toHaveValue('chromatic');
  await expect(page.locator('.tuner-string')).toHaveCount(0);
  await expect(page.locator('.hero-lead')).toContainText('not uploaded');
  await page.locator('#tuner-start').click();
  await expect(page.locator('#tuner-name')).toHaveText('A');
  await expect(page.locator('#tuner-octave')).toHaveText('4');
  await expect(page.locator('#tuner-hint')).toHaveText('In tune');
  // A 442 reference: 442 Hz is then in tune.
  await page.locator('#a4').fill('442');
  await setHz(page, 442);
  await expect(page.locator('#tuner-hint')).toHaveText('In tune');
  await page.locator('#a4').fill('440');
  await setHz(page, 1046.5);
  await expect(page.locator('#tuner-name')).toHaveText('C');
  await expect(page.locator('#tuner-octave')).toHaveText('6');
  await setHz(page, 466.16);
  await expect(page.locator('#tuner-name')).toHaveText('A♯');
});

test('Viola tuner page lists C3 G3 D4 A4 and lights the right string for each open string', async ({ page }) => {
  await fakeTone(page, 130.81);
  await page.goto('/viola-tuner');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('h1')).toHaveText('Viola tuner');
  await expect(page.locator('#instrument')).toHaveValue('viola');
  await expect(page.locator('.tuner-string')).toHaveText(['C3', 'G3', 'D4', 'A4']);
  await page.locator('#tuner-start').click();
  const wanted: [number, string, string][] = [[130.81, 'C', '3'], [196, 'G', '3'], [293.66, 'D', '4'], [440, 'A', '4']];
  for (const [i, [hz, name, octave]] of wanted.entries()) {
    await setHz(page, hz);
    await expect(page.locator('#tuner-name')).toHaveText(name);
    await expect(page.locator('#tuner-octave')).toHaveText(octave);
    await expect(page.locator('.tuner-string').nth(i)).toHaveAttribute('data-active', 'true');
    await expect(page.locator('#tuner-hint')).toHaveText('In tune');
  }
  expect(noteFor(130.81).name).toBe('C');
});

test('The violin tuner page sends violists to the viola tuner', async ({ page }) => {
  await page.goto('/violin-tuner');
  await expect(page.locator('a[href="/viola-tuner"]').first()).toBeVisible();
});

async function toPdf(page: Page, svg: string, opts: { pageSize?: string } = {}) {
  await page.goto('/svg-to-pdf');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('h1')).toHaveText('Convert SVG to PDF');
  if (opts.pageSize) await page.locator('#page-size').selectOption(opts.pageSize);
  await page.locator('#file-input').setInputFiles({ name: 'drawing.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) });
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), page.locator('#run').click()]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return { name: download.suggestedFilename(), bytes: new Uint8Array(Buffer.concat(chunks)) };
}

/** Decode the page's embedded picture in the browser and sample the pixel at a fraction of its width and height. */
async function samplePdf(page: Page, bytes: Uint8Array, points: [number, number][]) {
  const doc = await PDFDocument.load(bytes);
  const pdfPage = doc.getPages()[0]!;
  const xobjects = pdfPage.node.Resources()!.lookup(PDFName.of('XObject'));
  // @ts-expect-error pdf-lib typing for dict values
  const img = doc.context.lookup(xobjects.values()[0]) as PDFRawStream;
  const filter = img.dict.get(PDFName.of('Filter'))?.toString();
  const size = pdfPage.getSize();
  let png: string;
  if (filter === '/DCTDecode') {
    const b64 = Buffer.from(img.contents).toString('base64');
    const px = await page.evaluate(async ({ b64, points }) => {
      const blob = new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'image/jpeg' });
      const bmp = await createImageBitmap(blob);
      const c = document.createElement('canvas');
      c.width = bmp.width;
      c.height = bmp.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      return { w: bmp.width, h: bmp.height, px: points.map(([x, y]) => [...ctx.getImageData(Math.floor(x * bmp.width), Math.floor(y * bmp.height), 1, 1).data]) };
    }, { b64, points });
    return { size, ...px };
  }
  png = filter ?? 'none';
  throw new Error(`unexpected image filter ${png}`);
}

const near = (px: number[], rgb: [number, number, number]) => px.slice(0, 3).every((v, i) => Math.abs(v - rgb[i]!) < 24);

test('SVG to PDF draws the SVG on a page of its own size', async ({ page }) => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="150"><rect width="300" height="150" fill="#ffffff"/><rect x="0" y="0" width="150" height="150" fill="#ff0000"/><rect x="150" y="0" width="150" height="150" fill="#0000ff"/></svg>';
  const { name, bytes } = await toPdf(page, svg);
  expect(name).toBe('drawing.pdf');
  const doc = await PDFDocument.load(bytes);
  expect(doc.getPageCount()).toBe(1);
  const s = await samplePdf(page, bytes, [[0.25, 0.5], [0.75, 0.5]]);
  expect(s.size.width / s.size.height).toBeCloseTo(2, 1);
  expect(s.w / s.h).toBeCloseTo(2, 1);
  expect(near(s.px[0]!, [255, 0, 0])).toBe(true);
  expect(near(s.px[1]!, [0, 0, 255])).toBe(true);
});

test('SVG to PDF gives a viewBox-only SVG a sensible size, transparent areas white', async ({ page }) => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><circle cx="25" cy="25" r="20" fill="#00aa00"/></svg>';
  const { bytes } = await toPdf(page, svg);
  const s = await samplePdf(page, bytes, [[0.25, 0.5], [0.9, 0.5]]);
  expect(s.w).toBe(1024);
  expect(s.h).toBe(512);
  expect(s.size.width / s.size.height).toBeCloseTo(2, 1);
  expect(near(s.px[0]!, [0, 170, 0])).toBe(true);
  expect(near(s.px[1]!, [255, 255, 255])).toBe(true);
});

test('SVG to PDF on A4 fills an A4 page, and a linked image in the SVG is not fetched', async ({ page }) => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="200" height="100"><rect width="200" height="100" fill="#ffffff"/><image href="https://example.invalid/pic.png" x="0" y="0" width="100" height="100"/><rect x="100" width="100" height="100" fill="#000000"/></svg>';
  const { bytes } = await toPdf(page, svg, { pageSize: 'a4' });
  const doc = await PDFDocument.load(bytes);
  const { width, height } = doc.getPages()[0]!.getSize();
  expect(Math.round(Math.min(width, height))).toBe(595);
  expect(Math.round(Math.max(width, height))).toBe(842);
  // The linked picture is not fetched (the browser draws a placeholder there), and the rest of the drawing is intact.
  const s = await samplePdf(page, bytes, [[0.75, 0.5]]);
  expect(near(s.px[0]!, [0, 0, 0])).toBe(true);
});
