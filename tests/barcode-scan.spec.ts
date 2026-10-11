import { test, expect, type Download, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { readBarcodes } from 'zxing-wasm/reader';

// A barcode that does not scan is worthless, so these tests read the files the
// page saves back with an open-source barcode reader (ZXing, test-only, not
// shipped to the site) and compare what it reads with the number we meant.
// The SVG is drawn to a bitmap by the browser first, then read the same way.

// `expect` is what the reader returns. ZXing reports a UPC-A as its 13-digit GTIN
// (a leading 0 on the 12 digits), and a UPC-E as the UPC-A it expands to; every
// other type comes back exactly as typed. `reports` is the symbology it names.
const TYPES = [
  { id: 'code128', value: 'Stayput 12345', expect: 'Stayput 12345', format: 'Code128', reports: 'Code128' },
  { id: 'code39', value: 'STAYPUT-123', expect: 'STAYPUT-123', format: 'Code39', reports: 'Code39' },
  { id: 'upca', value: '012345678905', expect: '0012345678905', format: 'UPCA', reports: 'UPCA' },
  { id: 'upce', value: '01234565', expect: '0012345000065', format: 'UPCE', reports: 'UPCE' },
  { id: 'ean13', value: '5901234123457', expect: '5901234123457', format: 'EAN13', reports: 'EAN13' },
  { id: 'ean8', value: '55123457', expect: '55123457', format: 'EAN8', reports: 'EAN8' },
  { id: 'itf14', value: '15901234123454', expect: '15901234123454', format: 'ITF14', reports: 'ITF' },
  { id: 'itf', value: '12345678', expect: '12345678', format: 'ITF', reports: 'ITF' },
  { id: 'isbn', value: '9780306406157', expect: '9780306406157', format: 'EAN13', reports: 'EAN13' },
] as const;

type Format = (typeof TYPES)[number]['format'];

/** Read the image as one given symbology (so a UPC-A is reported as 12 digits, not as an EAN-13 with a leading 0). */
async function read(bytes: Uint8Array, format: Format): Promise<{ text: string; format: string }> {
  const found = await readBarcodes(bytes, { formats: [format], tryHarder: true, maxNumberOfSymbols: 2 });
  expect(found.length, 'the reader found exactly one barcode').toBe(1);
  return { text: found[0]!.text, format: found[0]!.format };
}

async function bytesOf(d: Download): Promise<Uint8Array> {
  return new Uint8Array(readFileSync((await d.path())!));
}

/** The browser draws the saved SVG onto a white canvas, and the PNG of that is what gets read. */
async function svgToPng(page: Page, svg: string): Promise<Uint8Array> {
  const b64 = await page.evaluate(async (markup) => {
    const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0);
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/png'));
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (const v of buf) s += String.fromCharCode(v);
    return btoa(s);
  }, svg);
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

async function open(page: Page, path = '/tools/barcode-generator') {
  await page.goto(path);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
}

async function type(page: Page, id: string, value: string) {
  await page.locator('#bc-type').selectOption(id);
  await page.locator('#bc-value').fill(value);
  await expect(page.locator('#bc-frame')).toHaveAttribute('data-state', 'ready');
}

/** Save the PNG and the SVG, read both back, and return what the reader saw. */
async function scanBoth(page: Page, format: Format): Promise<{ png: { text: string; format: string }; svg: { text: string; format: string }; svgText: string }> {
  const [png] = await Promise.all([page.waitForEvent('download'), page.locator('#bc-png').click()]);
  const pngRead = await read(await bytesOf(png), format);
  const [svg] = await Promise.all([page.waitForEvent('download'), page.locator('#bc-svg').click()]);
  const svgText = Buffer.from(await bytesOf(svg)).toString();
  const svgRead = await read(await svgToPng(page, svgText), format);
  return { png: pngRead, svg: svgRead, svgText };
}

for (const t of TYPES) {
  test(`${t.id}: the saved PNG and SVG scan back as ${t.expect}`, async ({ page }) => {
    await open(page);
    await type(page, t.id, t.value);
    const r = await scanBoth(page, t.format);
    expect(r.png.text).toBe(t.expect);
    expect(r.svg.text).toBe(t.expect);
    expect(r.png.format).toBe(t.reports);
    expect(r.svg.format).toBe(t.reports);
  });
}

test('a number typed without its check digit scans back with it', async ({ page }) => {
  await open(page);
  for (const [id, typed, full, format] of [
    ['upca', '03600029145', '0036000291452', 'UPCA'],
    ['ean13', '590123412345', '5901234123457', 'EAN13'],
    ['ean8', '9638507', '96385074', 'EAN8'],
    ['itf14', '1590123412345', '15901234123454', 'ITF14'],
    ['isbn', '0-306-40615-2', '9780306406157', 'EAN13'],
  ] as const) {
    await type(page, id, typed);
    const r = await scanBoth(page, format);
    expect(r.png.text, id).toBe(full);
    expect(r.svg.text, id).toBe(full);
  }
});

test('ITF-14 with bearer bars scans back, as PNG and as SVG, and so does it without', async ({ page }) => {
  await open(page);
  await type(page, 'itf14', '1234567890123');
  await page.locator('.bc-look summary').click();
  const bearer = page.locator('#bc-bearer');
  await expect(bearer).toBeVisible();
  for (const on of [true, false]) {
    await bearer.setChecked(on);
    const r = await scanBoth(page, 'ITF14');
    expect(r.png.text, `bearer ${on}`).toBe('12345678901231');
    expect(r.svg.text, `bearer ${on}`).toBe('12345678901231');
    expect(r.png.format).toBe('ITF');
  }
});

test('the ITF-14 page opens with bearer bars on and its barcode scans back', async ({ page }) => {
  await open(page, '/itf-14-barcode-generator');
  await expect(page.locator('#bc-type')).toHaveValue('itf14');
  await expect(page.locator('#bc-bearer')).toBeChecked();
  await page.locator('#bc-value').fill('15901234123454');
  await expect(page.locator('#bc-frame')).toHaveAttribute('data-state', 'ready');
  const r = await scanBoth(page, 'ITF14');
  expect(r.png.text).toBe('15901234123454');
  expect(r.svg.text).toBe('15901234123454');
});

test('Code 39 with a check character scans back with it, and colours and sizes do not break the scan', async ({ page }) => {
  await open(page);
  await type(page, 'code39', 'hello');
  await page.locator('.bc-look summary').click();
  await page.locator('#bc-mod43').check();
  let r = await scanBoth(page, 'Code39');
  expect(r.png.text).toBe('HELLOB');
  expect(r.svg.text).toBe('HELLOB');
  // Dark blue on pale yellow, narrow bars, tall, no number under it.
  await page.locator('#bc-mod43').uncheck();
  await page.locator('#bc-dark').fill('#102a56');
  await page.locator('#bc-light').fill('#fff8d6');
  await page.locator('#bc-bar').selectOption('2');
  await page.locator('#bc-height').fill('140');
  await page.locator('#bc-text').uncheck();
  await expect(page.locator('#bc-frame')).toHaveAttribute('data-state', 'ready');
  r = await scanBoth(page, 'Code39');
  expect(r.png.text).toBe('HELLO');
  expect(r.svg.text).toBe('HELLO');
});
