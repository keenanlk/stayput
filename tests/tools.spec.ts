import { test, expect, type Page, type Download } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import { inspect, sniffFormat } from '../src/lib/exif';

const fixtures = fileURLToPath(new URL('./fixtures/generated/', import.meta.url));
const fx = (name: string) => fixtures + name;
const HEIC_URL = 'https://cdn.jsdelivr.net/npm/heic-to@1.5.2/dist/csp/heic-to.min.js';
const heicLocal = fileURLToPath(new URL('../node_modules/heic-to/dist/csp/heic-to.min.js', import.meta.url));

test.beforeAll(() => {
  if (!existsSync(fx('text.pdf'))) {
    execSync('python3 tests/fixtures/make-fixtures.py && node tests/fixtures/make-pdf.mjs', { stdio: 'inherit' });
  }
});

async function open(page: Page, slug: string) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  // Serve the HEIC decoder locally so tests do not depend on the network.
  await page.route(HEIC_URL, (route) => route.fulfill({ path: heicLocal, contentType: 'text/javascript' }));
  await page.goto(`/tools/${slug}`);
  await expect(page.locator('#tool')).toBeVisible();
  return errors;
}

async function run(page: Page, files: string[], configure?: () => Promise<void>): Promise<{ downloads: Download[]; items: number }> {
  await page.locator('#file-input').setInputFiles(files.map(fx));
  await expect(page.locator('#tool')).toHaveAttribute('data-count', String(Math.min(files.length, (await page.locator('#tool').getAttribute('data-multiple')) === 'true' ? files.length : 1)));
  await configure?.();
  const downloads: Download[] = [];
  page.on('download', (d) => downloads.push(d));
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 60_000 });
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  const items = await page.locator('#results-list .result-item').count();
  // Give the single-file auto download a moment to register.
  if (items === 1) await expect.poll(() => downloads.length, { timeout: 10_000 }).toBe(1);
  return { downloads, items };
}

async function bytesOf(d: Download): Promise<Uint8Array> {
  const p = await d.path();
  return new Uint8Array(readFileSync(p!));
}

async function zipAll(page: Page): Promise<Record<string, Uint8Array>> {
  const [d] = await Promise.all([page.waitForEvent('download'), page.locator('#download-all').click()]);
  return unzipSync(await bytesOf(d));
}

function pngSize(b: Uint8Array) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { width: dv.getUint32(16), height: dv.getUint32(20) };
}

test('home page lists every tool and has no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('Your files stay put.');
  expect(await page.locator('.tool-card').count()).toBe(10);
  expect(errors).toEqual([]);
});

test('HEIC to JPG converts and can keep EXIF with GPS', async ({ page }) => {
  const errors = await open(page, 'heic-to-jpg');
  const { downloads, items } = await run(page, ['iphone.heic'], async () => {
    await page.locator('#keep-exif').check();
  });
  expect(items).toBe(1);
  expect(downloads[0]!.suggestedFilename()).toBe('iphone.jpg');
  const jpg = await bytesOf(downloads[0]!);
  expect(sniffFormat(jpg)).toBe('jpeg');
  const meta = inspect(jpg);
  expect(meta.kinds).toContain('EXIF');
  expect(meta.hasGps).toBe(true);
  expect(meta.make).toBe('TestCam');
  expect(meta.orientation).toBe(1);
  expect(errors).toEqual([]);
});

test('HEIC to PNG without EXIF', async ({ page }) => {
  await open(page, 'heic-to-jpg');
  const { downloads } = await run(page, ['iphone.heic'], async () => {
    await page.locator('input[name="format"][value="png"]').check({ force: true });
  });
  const png = await bytesOf(downloads[0]!);
  expect(sniffFormat(png)).toBe('png');
  expect(pngSize(png)).toEqual({ width: 1200, height: 900 });
  expect(inspect(png).kinds).toEqual([]);
});

test('Image converter applies EXIF orientation and converts to PNG and WebP', async ({ page }) => {
  await open(page, 'convert-image');
  const { downloads } = await run(page, ['photo.jpg'], async () => {
    await page.locator('#format').selectOption('image/png');
  });
  const png = await bytesOf(downloads[0]!);
  // photo.jpg is 1600x1200 with orientation 6, so it must come out portrait.
  expect(pngSize(png)).toEqual({ width: 1200, height: 1600 });

  await page.locator('#clear').click();
  const second = await run(page, ['graphic.png', 'plain.jpg'], async () => {
    await page.locator('#format').selectOption('image/webp');
  });
  expect(second.items).toBe(2);
  const zip = await zipAll(page);
  expect(Object.keys(zip).sort()).toEqual(['graphic.webp', 'plain.webp']);
  expect(sniffFormat(zip['graphic.webp']!)).toBe('webp');
});

test('Compress and resize shrinks a large photo', async ({ page }) => {
  await open(page, 'compress-image');
  const { downloads } = await run(page, ['big.jpg']);
  const out = await bytesOf(downloads[0]!);
  const original = readFileSync(fx('big.jpg')).length;
  expect(out.length).toBeLessThan(original / 2);
  await expect(page.locator('.result-item .meta')).toContainText('2000×1500');
  await expect(page.locator('.result-item .saving')).toBeVisible();
});

test('EXIF remover reports GPS and strips losslessly', async ({ page }) => {
  await open(page, 'strip-exif');
  await page.locator('#file-input').setInputFiles([fx('photo.jpg'), fx('graphic.png'), fx('picture.webp')]);
  await expect(page.locator('#meta-report .meta-row')).toHaveCount(3);
  await expect(page.locator('#meta-report .meta-row').first()).toContainText('GPS location: yes');
  await expect(page.locator('#meta-report .meta-row').first()).toContainText('Camera: TestCam Model X');
  await page.locator('#apply-orientation').uncheck();
  page.on('download', () => {});
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/);
  const zip = await zipAll(page);
  for (const name of ['photo.jpg', 'graphic.png', 'picture.webp']) {
    const cleaned = zip[name]!;
    const before = new Uint8Array(readFileSync(fx(name)));
    expect(cleaned.length).toBeLessThan(before.length);
    const meta = inspect(cleaned);
    expect(meta.kinds, name).toEqual([]);
    expect(meta.hasGps, name).toBe(false);
  }
  // Pixels are untouched: the entropy-coded JPEG scan is byte-identical.
  const before = new Uint8Array(readFileSync(fx('photo.jpg')));
  const after = zip['photo.jpg']!;
  expect(after.subarray(after.length - 2000)).toEqual(before.subarray(before.length - 2000));
});

test('EXIF remover bakes orientation when asked', async ({ page }) => {
  await open(page, 'strip-exif');
  const { downloads } = await run(page, ['photo.jpg']);
  const out = await bytesOf(downloads[0]!);
  expect(inspect(out).kinds).toEqual([]);
  await expect(page.locator('.result-item .meta')).toContainText('rotation applied');
});

test('Merge PDF combines files in order', async ({ page }) => {
  await open(page, 'merge-pdf');
  const { downloads } = await run(page, ['text.pdf', 'scan.pdf']);
  const doc = await PDFDocument.load(await bytesOf(downloads[0]!));
  expect(doc.getPageCount()).toBe(5);
  expect(downloads[0]!.suggestedFilename()).toBe('merged.pdf');
});

test('Split PDF extracts a range and splits every page', async ({ page }) => {
  await open(page, 'split-pdf');
  const { downloads } = await run(page, ['text.pdf'], async () => {
    await expect(page.locator('#page-info')).toHaveText('3 pages');
    await page.locator('#range').fill('3, 1');
  });
  const doc = await PDFDocument.load(await bytesOf(downloads[0]!));
  expect(doc.getPageCount()).toBe(2);
  expect(downloads[0]!.suggestedFilename()).toBe('text-pages-3,1.pdf');

  await page.locator('input[name="split-mode"][value="each"]').check({ force: true });
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/);
  expect(await page.locator('#results-list .result-item').count()).toBe(3);
  const zip = await zipAll(page);
  expect(Object.keys(zip).sort()).toEqual(['text-page-1.pdf', 'text-page-2.pdf', 'text-page-3.pdf']);
});

test('Compress PDF recompresses images, cleans losslessly and flattens', async ({ page }) => {
  await open(page, 'compress-pdf');
  const original = readFileSync(fx('scan.pdf')).length;
  const first = await run(page, ['scan.pdf']);
  const out = await bytesOf(first.downloads[0]!);
  expect(out.length).toBeLessThan(original * 0.6);
  await expect(page.locator('.result-item .meta')).toContainText('1 of 1 images recompressed');
  const doc = await PDFDocument.load(out);
  expect(doc.getPageCount()).toBe(2);

  await page.locator('input[name="mode"][value="lossless"]').check({ force: true });
  const downloads: Download[] = [];
  page.on('download', (d) => downloads.push(d));
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/);
  await expect.poll(() => downloads.length).toBe(1);
  expect((await PDFDocument.load(await bytesOf(downloads[0]!))).getPageCount()).toBe(2);

  await page.locator('input[name="mode"][value="flatten"]').check({ force: true });
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 60_000 });
  await expect.poll(() => downloads.length).toBe(2);
  const flat = await PDFDocument.load(await bytesOf(downloads[1]!));
  expect(flat.getPageCount()).toBe(2);
});

test('Rotate PDF writes page rotation', async ({ page }) => {
  await open(page, 'rotate-pdf');
  await page.locator('#file-input').setInputFiles([fx('text.pdf')]);
  await expect(page.locator('#page-grid .page-thumb')).toHaveCount(3);
  await page.locator('#rotate-all-cw').click();
  await page.locator('#page-grid .page-thumb').nth(1).getByLabel('Rotate page 2 clockwise').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#run').click()]);
  const doc = await PDFDocument.load(await bytesOf(download));
  expect(doc.getPages().map((p) => p.getRotation().angle)).toEqual([90, 180, 90]);
});

test('Image to PDF builds one page per image', async ({ page }) => {
  await open(page, 'image-to-pdf');
  const { downloads } = await run(page, ['photo.jpg', 'graphic.png', 'iphone.heic'], async () => {
    await page.locator('#page-size').selectOption('a4');
    await page.locator('#margin').fill('10');
  });
  const doc = await PDFDocument.load(await bytesOf(downloads[0]!));
  expect(doc.getPageCount()).toBe(3);
  const { width, height } = doc.getPage(0).getSize();
  // photo.jpg is portrait after orientation, so page 1 should be portrait A4.
  expect(Math.round(width)).toBe(595);
  expect(Math.round(height)).toBe(842);
  expect(downloads[0]!.suggestedFilename()).toBe('images.pdf');
});

test('PDF to image renders selected pages', async ({ page }) => {
  await open(page, 'pdf-to-image');
  const { items } = await run(page, ['text.pdf'], async () => {
    await expect(page.locator('#page-info')).toHaveText('3 pages');
    await page.locator('input[name="pages"][value="range"]').check({ force: true });
    await page.locator('#range').fill('1-2');
    await page.locator('#dpi').selectOption('72');
  });
  expect(items).toBe(2);
  const zip = await zipAll(page);
  expect(Object.keys(zip).sort()).toEqual(['text-page-1.png', 'text-page-2.png']);
  expect(pngSize(zip['text-page-1.png']!)).toEqual({ width: 612, height: 792 });
});

test('every tool page renders with structured data and no errors', async ({ page }) => {
  const slugs = ['heic-to-jpg', 'convert-image', 'compress-image', 'strip-exif', 'merge-pdf', 'split-pdf', 'compress-pdf', 'rotate-pdf', 'image-to-pdf', 'pdf-to-image'];
  for (const slug of slugs) {
    const errors = await open(page, slug);
    expect(await page.locator('script[type="application/ld+json"]').count()).toBe(3);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://stayput.app/tools/${slug}`);
    expect(errors, slug).toEqual([]);
  }
});
