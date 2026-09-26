import { test, expect, type Page, type Download } from '@playwright/test';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { PDFDocument, PDFName, PDFArray, PDFRawStream, decodePDFRawStream, degrees } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import { inspect, sniffFormat } from '../src/lib/exif';

const fixtures = fileURLToPath(new URL('./fixtures/generated/', import.meta.url));
const fx = (name: string) => fixtures + name;
const staticFx = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));
const nodeModules = fileURLToPath(new URL('../node_modules/', import.meta.url));

/**
 * Record every request the tab makes from now on. `assertNothingLeft` then
 * checks that no request could have carried file bytes: only GETs without a
 * body to this site (which serves its own decoders), plus the small anonymous
 * usage ping. Any other host fails, a code CDN included.
 */
function watchNetwork(page: Page) {
  const seen: { url: string; method: string; body: string | null }[] = [];
  page.on('request', (r) => seen.push({ url: r.url(), method: r.method(), body: r.postData() }));
  return {
    reset: () => seen.splice(0),
    assertNothingLeft(fixtureNames: string[]) {
      for (const r of seen) {
        if (r.url.startsWith('blob:') || r.url.startsWith('data:')) continue;
        const host = new URL(r.url).hostname;
        if (host === 'stats.keenankaufman.com') {
          // The usage ping is tiny and names only the tool and size bucket.
          expect((r.body ?? '').length, r.url).toBeLessThan(2048);
          for (const n of fixtureNames) expect(r.body ?? '', 'usage ping must not name the file').not.toContain(n);
          continue;
        }
        expect(host, `unexpected host ${host}`).toBe('localhost');
        expect(r.method, `${r.url} must be a plain GET`).toBe('GET');
        expect(r.body, `${r.url} must carry no body`).toBeNull();
      }
    },
  };
}

test.beforeAll(() => {
  if (!existsSync(fx('text.pdf'))) {
    execSync('python3 tests/fixtures/make-fixtures.py && node tests/fixtures/make-pdf.mjs', { stdio: 'inherit' });
  }
});

/** Replace the self-hosted Umami script with a stub that records events on window. */
async function stubAnalytics(page: Page) {
  // The site skips analytics in automated browsers; pretend to be a person so the stub loads.
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: 'window.__events=[];window.umami={track:(n,d)=>window.__events.push({n,d})};',
    }),
  );
}

async function open(page: Page, slug: string) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await stubAnalytics(page);
  await page.goto(`/tools/${slug}`);
  await expect(page.locator('#tool')).toBeVisible();
  return errors;
}

async function run(page: Page, files: string[], configure?: () => Promise<void>): Promise<{ downloads: Download[]; items: number }> {
  // Landing pages load their tool module on demand, so wait for the shell before dropping files.
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(files.map((f) => (f.includes('/') ? f : fx(f))));
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

/** Width and height from a JPEG's first SOF marker. */
function jpegSize(b: Uint8Array) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) throw new Error('bad jpeg');
    const marker = b[i + 1]!;
    const len = dv.getUint16(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: dv.getUint16(i + 5), width: dv.getUint16(i + 7) };
    }
    i += 2 + len;
  }
  throw new Error('no SOF');
}

/** Decode an image in the page and read one pixel's RGBA. */
async function pixelAt(page: Page, bytes: Uint8Array, x: number, y: number): Promise<number[]> {
  return page.evaluate(
    async ([b64, px, py]) => {
      const bin = atob(b64 as string);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const bmp = await createImageBitmap(new Blob([arr]));
      const c = document.createElement('canvas');
      c.width = bmp.width;
      c.height = bmp.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      return Array.from(ctx.getImageData(px as number, py as number, 1, 1).data);
    },
    [Buffer.from(bytes).toString('base64'), x, y],
  );
}

function pngSize(b: Uint8Array) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { width: dv.getUint32(16), height: dv.getUint32(20) };
}

test('home page lists every tool and has no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await stubAnalytics(page);
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('Your files stay put.');
  expect(await page.locator('.tool-card').count()).toBe(15);
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

test('Compress and resize shrinks a large photo and records a bucketed event', async ({ page }) => {
  await open(page, 'compress-image');
  const { downloads } = await run(page, ['big.jpg']);
  const all = await page.evaluate(() => (window as unknown as { __events: { n: string; d: Record<string, string> }[] }).__events);
  expect(all.map((e) => e.n)).toEqual(['visit_start', 'files_added', 'tool_run']);
  const events = all.filter((e) => e.n === 'tool_run');
  expect(events[0]!.d).toMatchObject({ tool: 'compress-image', outcome: 'ok', files: '1', input: '<1MB', output: '<1MB' });
  expect(JSON.stringify(events[0]!.d)).not.toContain('big.jpg');
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
  const slugs = ['heic-to-jpg', 'convert-image', 'compress-image', 'strip-exif', 'merge-pdf', 'split-pdf', 'compress-pdf', 'rotate-pdf', 'image-to-pdf', 'pdf-to-image', 'reorder-pdf', 'sign-pdf', 'pdf-page-numbers', 'pdf-to-word', 'crop-image'];
  for (const slug of slugs) {
    const errors = await open(page, slug);
    expect(await page.locator('script[type="application/ld+json"]').count()).toBe(3);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://stayput.dev/tools/${slug}`);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', `https://stayput.dev/og/${slug}.png`);
    expect((await page.request.get(`/og/${slug}.png`)).status(), `og image for ${slug}`).toBe(200);
    expect(errors, slug).toEqual([]);
  }
});

test('format-pair pages render, preset the converter and link a social image', async ({ page }) => {
  const pairs = ['heic-to-png', 'png-to-jpg', 'jpg-to-png', 'webp-to-png', 'webp-to-jpg', 'png-to-webp', 'jpg-to-webp', 'avif-to-jpg', 'avif-to-png', 'svg-to-png', 'jxl-to-png', 'jxl-to-jpg', 'jfif-to-jpg', 'jfif-to-png', 'svg-to-jpg', 'gif-to-png', 'gif-to-jpg'];
  for (const slug of pairs) {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await stubAnalytics(page);
    await page.goto(`/${slug}`);
    await expect(page.locator('#tool')).toBeVisible();
    expect(await page.locator('script[type="application/ld+json"]').count()).toBe(3);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://stayput.dev/${slug}`);
    const og = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(og).toBe(`https://stayput.dev/og/${slug}.png`);
    const res = await page.request.get(`/og/${slug}.png`);
    expect(res.status(), `og image for ${slug}`).toBe(200);
    const [, to] = slug.split('-to-');
    const expected = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[to!];
    await expect(page.locator('#format')).toHaveValue(expected!);
    expect(errors, slug).toEqual([]);
  }
});

test('JFIF to JPG page renames and re-encodes a .jfif as .jpg', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/jfif-to-jpg');
  const { downloads } = await run(page, ['download.jfif']);
  expect(downloads[0]!.suggestedFilename()).toBe('download.jpg');
  expect(sniffFormat(await bytesOf(downloads[0]!))).toBe('jpeg');
});

test('GIF to PNG page converts the first frame of an animated GIF', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/gif-to-png');
  const { downloads } = await run(page, ['banner.gif']);
  expect(downloads[0]!.suggestedFilename()).toBe('banner.png');
  expect(sniffFormat(await bytesOf(downloads[0]!))).toBe('png');
});

test('WebP to PNG page converts with the preset format', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/webp-to-png');
  const { downloads } = await run(page, ['picture.webp']);
  expect(downloads[0]!.suggestedFilename()).toBe('picture.png');
  expect(sniffFormat(await bytesOf(downloads[0]!))).toBe('png');
});

test('no request carries a file: the network stays empty after files are added', async ({ page }) => {
  await open(page, 'strip-exif');
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await run(page, ['photo.jpg']);
  const external = requests.filter((u) => !u.startsWith('blob:') && !u.startsWith('data:'));
  // The only request allowed after files are added is the analytics call, which our stub answers.
  expect(external.filter((u) => !u.startsWith('https://stats.keenankaufman.com/'))).toEqual([]);
  await expect(page.locator('#netproof')).toBeVisible();
  await expect(page.locator('#netproof-summary')).toContainText(/Since you added files, this tab made \d+ network requests?/);
  await expect(page.locator('#netproof-summary')).not.toContainText('unexpected');
});

/* ------------------------------------------------------------------ */
/* Launch tools                                                        */
/* ------------------------------------------------------------------ */

/** Text items on a page with their user-space position, via pdf.js in Node. */
async function textItems(bytes: Uint8Array, pageNumber: number): Promise<{ str: string; x: number; y: number }[]> {
  const doc = await getDocument({ data: bytes.slice(), useWorkerFetch: false, standardFontDataUrl: nodeModules + 'pdfjs-dist/standard_fonts/' }).promise;
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  const items = content.items.filter((i): i is TextItem => 'str' in i).map((i) => ({ str: i.str, x: i.transform[4]!, y: i.transform[5]! }));
  await doc.loadingTask.destroy();
  return items;
}

test('Image converter decodes JPEG XL and AVIF, with the JXL decoder fetched as code only', async ({ page }) => {
  const errors = await open(page, 'convert-image');
  const net = watchNetwork(page);
  const { items } = await run(page, [staticFx('checker.jxl'), staticFx('checker.avif')], async () => {
    await page.locator('#format').selectOption('image/png');
  });
  expect(items).toBe(2);
  const zip = await zipAll(page);
  // Both inputs share a base name, so the zip de-duplicates with a suffix.
  expect(Object.keys(zip).sort()).toEqual(['checker (2).png', 'checker.png']);
  for (const name of Object.keys(zip)) expect(pngSize(zip[name]!), name).toEqual({ width: 320, height: 240 });
  net.assertNothingLeft(['checker.jxl', 'checker.avif']);
  expect(errors).toEqual([]);
});

/** Paths in the service worker's asset cache. */
function cachedPaths(page: Page) {
  return page.evaluate(async () => (await (await caches.open('stayput-assets')).keys()).map((r) => new URL(r.url).pathname));
}

/** Wait for the page's report that the service worker holds its decoders ("none" when it needs none). */
async function decoderCache(page: Page, expected: 'cached' | 'none') {
  const state = () => page.evaluate(() => {
    const d = document.documentElement.dataset;
    return d.decoders === 'failed' ? `failed: ${d.decodersError}` : d.decoders;
  });
  await expect.poll(state, { timeout: 30_000 }).toBe(expected);
}

test.describe('decoder caching', () => {
  test.use({ serviceWorkers: 'allow' });
  test('Decoders are cached only by pages that can need them, from this site, and only when the browser lacks one', async ({ page }) => {
    await stubAnalytics(page);
    // A PDF tool never needs an image decoder, so a visit costs none of those bytes.
    await page.goto('/tools/merge-pdf');
    await decoderCache(page, 'none');
    expect((await cachedPaths(page)).filter((p) => p.startsWith('/vendor/'))).toEqual([]);
    // The image converter caches HEIC and JPEG XL; Chromium decodes AVIF itself, so that decoder is skipped.
    await page.goto('/tools/convert-image');
    await decoderCache(page, 'cached');
    const vendor = (await cachedPaths(page)).filter((p) => p.startsWith('/vendor/'));
    expect(vendor.some((p) => p.endsWith('/heic-to.min.js'))).toBe(true);
    expect(vendor.some((p) => p.endsWith('/jxl_dec.wasm'))).toBe(true);
    expect(vendor.filter((p) => p.includes('avif'))).toEqual([]);
  });
});

test('JXL to PNG page converts with the preset format and lists the decoder in the network proof', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/jxl-to-png');
  await expect(page.locator('#format')).toHaveValue('image/png');
  const net = watchNetwork(page);
  const { downloads } = await run(page, [staticFx('checker.jxl')]);
  expect(downloads[0]!.suggestedFilename()).toBe('checker.png');
  expect(pngSize(await bytesOf(downloads[0]!))).toEqual({ width: 320, height: 240 });
  net.assertNothingLeft(['checker.jxl']);
  await expect(page.locator('#netproof-summary')).toContainText('none carrying your files');
  await expect(page.locator('#netproof-list')).toContainText('decoder program');
  await expect(page.locator('#netproof-summary')).not.toContainText('unexpected');
});

test('Reorder PDF moves, deletes and duplicates pages and no bytes leave the tab', async ({ page }) => {
  const errors = await open(page, 'reorder-pdf');
  const net = watchNetwork(page);
  await page.locator('#file-input').setInputFiles([fx('text.pdf')]);
  await expect(page.locator('#page-grid .reorder-cell')).toHaveCount(3);
  await expect(page.locator('#order')).toHaveValue('1, 2, 3');
  await page.getByLabel('Move page 3 left').click();
  await expect(page.locator('#order')).toHaveValue('1, 3, 2');
  await page.getByLabel('Delete page 1').click();
  await expect(page.locator('#order')).toHaveValue('3, 2');
  await expect(page.locator('#page-info')).toContainText('1 deleted');
  // Typing an order wins over the grid, and a repeated page duplicates it.
  await page.locator('#order').fill('3, 1, 1');
  await page.locator('#order').dispatchEvent('change');
  await expect(page.locator('#page-grid .reorder-cell')).toHaveCount(3);
  await expect(page.locator('#page-grid .reorder-cell .label').first()).toHaveText('1. was page 3');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#run').click()]);
  await expect(page.locator('#results')).toHaveClass(/is-active/);
  expect(download.suggestedFilename()).toBe('text-reordered.pdf');
  const out = await bytesOf(download);
  expect((await PDFDocument.load(out)).getPageCount()).toBe(3);
  expect((await textItems(out, 1)).map((t) => t.str).join(' ')).toContain('Page 3 of the fixture');
  expect((await textItems(out, 2)).map((t) => t.str).join(' ')).toContain('Page 1 of the fixture');
  expect((await textItems(out, 3)).map((t) => t.str).join(' ')).toContain('Page 1 of the fixture');
  net.assertNothingLeft(['text.pdf']);
  expect(errors).toEqual([]);
});

test('Sign PDF places a drawn and a typed signature on two pages and no bytes leave the tab', async ({ page }) => {
  const errors = await open(page, 'sign-pdf');
  const net = watchNetwork(page);
  await page.locator('#file-input').setInputFiles([fx('text.pdf')]);
  await expect(page.locator('#sign-panel')).toBeVisible();
  await expect(page.locator('#page-label')).toHaveText('Page 1 of 3');
  // Running without a signature is an error, not a silent no-op.
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/);
  // Draw a squiggle.
  const pad = page.locator('#sig-pad');
  await pad.scrollIntoViewIfNeeded();
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 80);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) await page.mouse.move(box.x + 40 + i * 12, box.y + 80 + Math.sin(i / 2) * 30);
  await page.mouse.up();
  await page.locator('#add-signature').click();
  await expect(page.locator('.stamp-signature')).toHaveCount(1);
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  // Drag it up and to the left.
  const stamp = page.locator('.stamp-signature');
  await stamp.scrollIntoViewIfNeeded();
  const before = (await stamp.boundingBox())!;
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 - 120, before.y + before.height / 2 - 200, { steps: 8 });
  await page.mouse.up();
  const after = (await stamp.boundingBox())!;
  expect(after.x).toBeLessThan(before.x - 100);
  expect(after.y).toBeLessThan(before.y - 150);
  // Second page: typed signature plus the date.
  await page.locator('#next-page').click();
  await expect(page.locator('#page-label')).toHaveText('Page 2 of 3');
  await expect(page.locator('.stamp')).toHaveCount(0);
  await page.locator('input[name="sig-mode"][value="type"]').check({ force: true });
  await page.locator('#sig-text').fill('Keenan Example');
  await page.locator('#add-signature').click();
  await page.locator('#add-date').click();
  await expect(page.locator('.stamp')).toHaveCount(2);
  await expect(page.locator('#placement-count')).toHaveText('3 items placed on 2 pages');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#run').click()]);
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 60_000 });
  expect(download.suggestedFilename()).toBe('text-signed.pdf');
  const doc = await PDFDocument.load(await bytesOf(download));
  expect(doc.getPageCount()).toBe(3);
  const imagesOn = (i: number) => {
    const res = doc.getPage(i).node.Resources();
    const xo = res?.lookup(PDFName.of('XObject'));
    return xo ? (xo as unknown as { keys(): unknown[] }).keys().length : 0;
  };
  expect(imagesOn(0)).toBe(1);
  expect(imagesOn(1)).toBe(2);
  expect(imagesOn(2)).toBe(0);
  net.assertNothingLeft(['text.pdf']);
  // The only console error is the deliberate "no signature yet" run above.
  expect(errors.filter((e) => !e.includes('Add your signature to a page first'))).toEqual([]);
});

test('Sign PDF draw pad and typed preview stay paper-bright and legible in dark mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await open(page, 'sign-pdf');
  await page.locator('#file-input').setInputFiles([fx('text.pdf')]);
  await expect(page.locator('#sign-panel')).toBeVisible();

  const luminance = (rgb: string) => {
    const [r, g, b] = rgb.match(/\d+/g)!.map(Number) as [number, number, number];
    const chan = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
    return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
  };
  const contrast = (a: number, bLum: number) => (Math.max(a, bLum) + 0.05) / (Math.min(a, bLum) + 0.05);

  const padBg = await page.locator('#sig-pad').evaluate((el) => getComputedStyle(el).backgroundColor);
  const padLum = luminance(padBg);
  expect(padLum, `sig-pad background ${padBg} must read as paper (light) in dark mode`).toBeGreaterThan(0.6);

  for (const [value, label] of [
    ['#111111', 'Black'],
    ['#1a3f8f', 'Blue'],
    ['#5a2d0c', 'Brown'],
  ] as const) {
    await page.locator('#sig-color').selectOption(value);
    const inkLum = luminance(
      await page.locator('#sig-color').evaluate((el, v) => {
        const p = document.createElement('div');
        p.style.color = v;
        document.body.append(p);
        const c = getComputedStyle(p).color;
        p.remove();
        return c;
      }, value),
    );
    expect(contrast(padLum, inkLum), `${label} ink must be readable against the pad`).toBeGreaterThan(4.5);
  }

  // Typed preview: same paper background, and the chosen ink stays legible on it.
  await page.locator('input[name="sig-mode"][value="type"]').check({ force: true });
  await page.locator('#sig-text').fill('Keenan Example');
  const previewBg = await page.locator('#sig-preview').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(luminance(previewBg)).toBeGreaterThan(0.6);
  const previewInk = luminance(await page.locator('#sig-preview').evaluate((el) => getComputedStyle(el).color));
  expect(contrast(luminance(previewBg), previewInk)).toBeGreaterThan(4.5);
});

test('Page numbers land in the chosen corner, skip the cover, and follow page rotation', async ({ page }) => {
  const errors = await open(page, 'pdf-page-numbers');
  const net = watchNetwork(page);
  const { downloads } = await run(page, ['text.pdf'], async () => {
    await expect(page.locator('#preview-panel')).toBeVisible();
    await page.locator('#format').selectOption('Page {n} of {total}');
    await page.locator('#first-page').fill('2');
    await page.locator('#first-page').dispatchEvent('change');
    await expect(page.locator('#number-sample')).toHaveText('Page 1 of 2');
    await expect(page.locator('#page-info')).toContainText('numbering 2 of them, starting on page 2');
  });
  expect(downloads[0]!.suggestedFilename()).toBe('text-numbered.pdf');
  const out = await bytesOf(downloads[0]!);
  const p1 = (await textItems(out, 1)).map((t) => t.str).join(' ');
  expect(p1).not.toContain('Page 1 of 2');
  const p2 = await textItems(out, 2);
  const num = p2.find((t) => t.str === 'Page 1 of 2');
  expect(num, 'page 2 carries the first number').toBeTruthy();
  expect(num!.y).toBeCloseTo(36, 0); // bottom margin
  expect(num!.x).toBeGreaterThan(250); // centred on a 612 pt page
  expect(num!.x).toBeLessThan(320);
  expect((await textItems(out, 3)).some((t) => t.str === 'Page 2 of 2')).toBe(true);
  await expect(page.locator('.result-item .meta')).toContainText('2 pages numbered');
  net.assertNothingLeft(['text.pdf']);
  expect(errors).toEqual([]);

  // A page rotated 90 degrees: the number must sit at the *displayed* bottom
  // centre, which in user space is the right-hand edge, running upwards.
  const rotated = await PDFDocument.create();
  rotated.addPage([612, 792]).setRotation(degrees(90));
  const rotatedPath = fx('rotated.pdf');
  writeFileSync(rotatedPath, await rotated.save());
  await page.locator('#clear').click();
  const second = await run(page, ['rotated.pdf'], async () => {
    await page.locator('#format').selectOption('{n}');
    await page.locator('#first-page').fill('1');
    await page.locator('#first-page').dispatchEvent('change');
  });
  const items = await textItems(await bytesOf(second.downloads[0]!), 1);
  const one = items.find((t) => t.str === '1');
  expect(one, 'rotated page is numbered').toBeTruthy();
  expect(one!.x).toBeCloseTo(612 - 36, 0);
  expect(one!.y).toBeGreaterThan(380);
  expect(one!.y).toBeLessThan(400);
});

/* ------------------------------------------------------------------ */
/* Growth: preset landing pages and guides                             */
/* ------------------------------------------------------------------ */

test('preset landing pages render, run their base tool with the preset options and link a social image', async ({ page }) => {
  const presets: [string, string, () => Promise<void>][] = [
    ['jpg-to-pdf', 'image-to-pdf', async () => expect(page.locator('#page-size')).toHaveValue('fit')],
    ['png-to-pdf', 'image-to-pdf', async () => expect(page.locator('#page-size')).toHaveValue('fit')],
    ['heic-to-pdf', 'image-to-pdf', async () => expect(page.locator('#file-input')).toHaveAttribute('accept', /heic/)],
    ['pdf-to-jpg', 'pdf-to-image', async () => expect(page.locator('#format')).toHaveValue('image/jpeg')],
    ['pdf-to-png', 'pdf-to-image', async () => expect(page.locator('#format')).toHaveValue('image/png')],
    ['combine-pdf', 'merge-pdf', async () => expect(page.locator('#run')).toHaveText('Combine')],
    ['extract-pages-from-pdf', 'split-pdf', async () => expect(page.locator('input[name="split-mode"][value="range"]')).toBeChecked()],
    ['delete-pdf-pages', 'reorder-pdf', async () => expect(page.locator('#order')).toBeAttached()],
    ['resize-image', 'compress-image', async () => expect(page.locator('#max-width')).toHaveValue('1920')],
    ['compress-jpg', 'compress-image', async () => expect(page.locator('#quality')).toHaveValue('75')],
    ['remove-location-from-photos', 'strip-exif', async () => expect(page.locator('#keep-icc')).toBeChecked()],
    ['pdf-to-text', 'pdf-to-word', async () => expect(page.locator('#format')).toHaveValue('txt')],
    ['crop-image-to-circle', 'crop-image', async () => {
      await expect(page.locator('input[name="shape"][value="circle"]')).toBeChecked();
      await expect(page.locator('#format')).toHaveValue('image/png');
    }],
    ['crop-image-to-square', 'crop-image', async () => expect(page.locator('#aspect')).toHaveValue('1:1')],
  ];
  for (const [slug, base, check] of presets) {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await stubAnalytics(page);
    await page.goto(`/${slug}`);
    await expect(page.locator('#tool')).toBeVisible();
    await expect(page.locator('#tool')).toHaveAttribute('data-base', base);
    expect(await page.locator('script[type="application/ld+json"]').count()).toBe(3);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://stayput.dev/${slug}`);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', `https://stayput.dev/og/${slug}.png`);
    expect((await page.request.get(`/og/${slug}.png`)).status(), `og image for ${slug}`).toBe(200);
    await check();
    expect(errors, slug).toEqual([]);
  }
});

test('JPG to PDF page builds a PDF and no bytes leave the tab', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/jpg-to-pdf');
  await expect(page.locator('#tool')).toBeVisible();
  const net = watchNetwork(page);
  const { downloads } = await run(page, ['photo.jpg', 'plain.jpg']);
  expect(downloads[0]!.suggestedFilename()).toBe('images.pdf');
  const doc = await PDFDocument.load(await bytesOf(downloads[0]!));
  expect(doc.getPageCount()).toBe(2);
  net.assertNothingLeft(['photo.jpg', 'plain.jpg']);
});

test('PDF to JPG page renders pages as JPG with the preset format', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/pdf-to-jpg');
  await expect(page.locator('#tool')).toBeVisible();
  const { items } = await run(page, ['text.pdf']);
  expect(items).toBe(3);
  const zip = await zipAll(page);
  expect(Object.keys(zip).sort()).toEqual(['text-page-1.jpg', 'text-page-2.jpg', 'text-page-3.jpg']);
  expect(sniffFormat(zip['text-page-1.jpg']!)).toBe('jpeg');
});

test('Delete PDF pages page drops a page and no bytes leave the tab', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/delete-pdf-pages');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  const net = watchNetwork(page);
  await page.locator('#file-input').setInputFiles([fx('text.pdf')]);
  await expect(page.locator('#page-grid .reorder-cell')).toHaveCount(3);
  await page.getByLabel('Delete page 2').click();
  await expect(page.locator('#order')).toHaveValue('1, 3');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#run').click()]);
  const out = await bytesOf(download);
  expect((await PDFDocument.load(out)).getPageCount()).toBe(2);
  expect((await textItems(out, 2)).map((t) => t.str).join(' ')).toContain('Page 3 of the fixture');
  net.assertNothingLeft(['text.pdf']);
});

test('Remove location page reports GPS and strips it losslessly', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/remove-location-from-photos');
  await expect(page.locator('#tool')).toBeVisible();
  const { downloads } = await run(page, ['photo.jpg'], async () => {
    await expect(page.locator('#meta-report')).toContainText('GPS location: yes');
  });
  const out = await bytesOf(downloads[0]!);
  expect(inspect(out).hasGps).toBe(false);
  expect(inspect(out).kinds).not.toContain('EXIF');
});

test('guide pages render with article structured data, a social image and tool links', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await stubAnalytics(page);
  await page.goto('/guides');
  await expect(page.locator('h1')).toHaveText('Guides');
  const links = await page.locator('.guide-index a').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href')!));
  expect(links.length).toBeGreaterThanOrEqual(10);
  for (const href of links) {
    await page.goto(href);
    const slug = href.replace('/guides/', '');
    await expect(page.locator('article h1')).toBeVisible();
    const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(ld.map((s) => JSON.parse(s)['@type']).sort()).toEqual(['Article', 'BreadcrumbList', 'FAQPage']);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://stayput.dev${href}`);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', `https://stayput.dev/og/guide-${slug}.png`);
    expect((await page.request.get(`/og/guide-${slug}.png`)).status(), `og image for ${slug}`).toBe(200);
    // Every guide links to at least one tool, and every internal link resolves.
    expect(await page.locator('.guide-cta a.btn').count()).toBe(1);
    const internal = await page.locator('article a[href^="/"]').evaluateAll((as) => [...new Set(as.map((a) => (a as HTMLAnchorElement).getAttribute('href')!))]);
    for (const l of internal) expect((await page.request.get(l)).status(), `${slug} links ${l}`).toBe(200);
    // No leftover markup from the inline formatter.
    expect(await page.locator('article').textContent()).not.toMatch(/\]\(|\*\*/);
  }
  expect(errors).toEqual([]);
});

test('tool pages link to related guides and preset landing pages', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/tools/strip-exif');
  await expect(page.locator('a[href="/guides/remove-location-data-from-photos"]').first()).toBeVisible();
  await page.goto('/tools/image-to-pdf');
  await expect(page.locator('a[href="/jpg-to-pdf"]').first()).toBeVisible();
  await page.goto('/tools/reorder-pdf');
  await expect(page.locator('a[href="/delete-pdf-pages"]').first()).toBeVisible();
  await page.goto('/jfif-to-jpg');
  // Pair pages list the pairs sharing a format first, ahead of the footer.
  await expect(page.locator('main a[href="/jfif-to-png"]').first()).toBeVisible();
});

/* ------------------------------------------------------------------ */
/* PDF to Word                                                         */
/* ------------------------------------------------------------------ */

const xmlText = (xml: string) => [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]!);

test('PDF to Word rebuilds paragraphs and headings into a .docx and no bytes leave the tab', async ({ page }) => {
  const errors = await open(page, 'pdf-to-word');
  const net = watchNetwork(page);
  const { downloads } = await run(page, ['article.pdf'], async () => {
    await expect(page.locator('#page-info')).toHaveText('2 pages');
    await page.locator('#page-breaks').check();
  });
  expect(downloads[0]!.suggestedFilename()).toBe('article.docx');
  const zip = unzipSync(await bytesOf(downloads[0]!));
  expect(Object.keys(zip).sort()).toEqual(['[Content_Types].xml', '_rels/.rels', 'docProps/app.xml', 'docProps/core.xml', 'word/_rels/document.xml.rels', 'word/document.xml', 'word/styles.xml']);
  const doc = new TextDecoder().decode(zip['word/document.xml']!);
  const paragraphs = [...doc.matchAll(/<w:p>(.*?)<\/w:p>/g)].map((m) => ({ style: /w:pStyle w:val="([^"]+)"/.exec(m[1]!)?.[1], text: xmlText(m[1]!).join(''), pageBreak: m[1]!.includes('<w:pageBreakBefore/>') }));
  expect(paragraphs.map((p) => p.style)).toEqual(['Heading1', 'Heading2', undefined, undefined, undefined, 'Heading2', undefined]);
  expect(paragraphs[0]!.text).toBe('Fixture Article Title');
  expect(paragraphs[2]!.text).toMatch(/^The quick brown fox jumps over the lazy dog .* every district\.$/);
  expect(paragraphs[3]!.text).toMatch(/^Second paragraph begins here .* in the test\.$/);
  // The hyphenated line break is mended.
  expect(paragraphs[4]!.text).toBe('This line ends with a hyphen because the word extraordinary was split across two lines.');
  expect(paragraphs[5]).toEqual({ style: 'Heading2', text: 'Second page', pageBreak: true });
  await expect(page.locator('#text-preview')).toContainText('Fixture Article Title');
  net.assertNothingLeft(['article.pdf']);
  expect(errors).toEqual([]);
});

test('PDF to text page saves plain text and refuses a scan with a clear message', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/pdf-to-text');
  await expect(page.locator('#tool')).toBeVisible();
  const { downloads } = await run(page, ['text.pdf']);
  expect(downloads[0]!.suggestedFilename()).toBe('text.txt');
  const txt = new TextDecoder().decode(await bytesOf(downloads[0]!));
  expect(txt).toBe('Page 1 of the fixture document\n\nPage 2 of the fixture document\n\nPage 3 of the fixture document\n');
  await page.locator('#clear').click();
  await expect(page.locator('#tool')).toHaveAttribute('data-count', '0');
  await page.locator('#file-input').setInputFiles([fx('scan.pdf')]);
  await expect(page.locator('#tool')).toHaveAttribute('data-count', '1');
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/);
  await expect(page.locator('#error')).toContainText('no text layer');
});

test('Crop image crops by handle drag and by exact pixels, and no bytes leave the tab', async ({ page }) => {
  const errors = await open(page, 'crop-image');
  const net = watchNetwork(page);
  await page.locator('#file-input').setInputFiles([fx('plain.jpg')]);
  await expect(page.locator('#crop-panel')).toBeVisible();
  // Starts as the whole 800x600 image.
  await expect(page.locator('#crop-w')).toHaveValue('800');
  await expect(page.locator('#crop-h')).toHaveValue('600');
  // Locking the ratio to square centres the largest square.
  await page.locator('#aspect').selectOption('1:1');
  await expect(page.locator('#crop-panel')).toHaveAttribute('data-rect', '100,0,600,600');
  // Dragging the bottom-right handle inward keeps the square.
  const handle = page.locator('.crop-handle-se');
  await handle.scrollIntoViewIfNeeded();
  const hb = (await handle.boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 - 120, hb.y + hb.height / 2 - 60, { steps: 6 });
  await page.mouse.up();
  const w = Number(await page.locator('#crop-w').inputValue());
  const h = Number(await page.locator('#crop-h').inputValue());
  expect(w).toBeLessThan(600);
  expect(w).toBe(h);
  await expect(page.locator('#crop-x')).toHaveValue('100');
  // Dragging the box moves it without resizing.
  const box = page.locator('#crop-box');
  const bb = (await box.boundingBox())!;
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.mouse.down();
  await page.mouse.move(bb.x + bb.width / 2 - 200, bb.y + bb.height / 2 + 30, { steps: 6 });
  await page.mouse.up();
  expect(Number(await page.locator('#crop-x').inputValue())).toBeLessThan(100);
  await expect(page.locator('#crop-w')).toHaveValue(String(w));
  // Exact pixels, free ratio, and the result is a JPG of that size.
  await page.locator('#aspect').selectOption('free');
  await page.locator('#crop-x').fill('10');
  await page.locator('#crop-x').dispatchEvent('change');
  await page.locator('#crop-y').fill('20');
  await page.locator('#crop-y').dispatchEvent('change');
  await page.locator('#crop-w').fill('300');
  await page.locator('#crop-w').dispatchEvent('change');
  await page.locator('#crop-h').fill('200');
  await page.locator('#crop-h').dispatchEvent('change');
  await expect(page.locator('#crop-panel')).toHaveAttribute('data-rect', '10,20,300,200');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#run').click()]);
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 60_000 });
  expect(download.suggestedFilename()).toBe('plain-cropped.jpg');
  expect(jpegSize(await bytesOf(download))).toEqual({ width: 300, height: 200 });
  net.assertNothingLeft(['plain.jpg']);
  expect(errors).toEqual([]);
});

test('Crop to circle page saves a transparent PNG and the square page a 1:1 crop', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/crop-image-to-circle');
  await expect(page.locator('#tool')).toBeVisible();
  const net = watchNetwork(page);
  const { downloads } = await run(page, ['plain.jpg']);
  expect(downloads[0]!.suggestedFilename()).toBe('plain-circle.png');
  const png = await bytesOf(downloads[0]!);
  expect(pngSize(png)).toEqual({ width: 600, height: 600 });
  // Corners are outside the circle and transparent; the centre keeps the photo.
  expect((await pixelAt(page, png, 2, 2))[3]).toBe(0);
  expect((await pixelAt(page, png, 300, 300))[3]).toBe(255);
  net.assertNothingLeft(['plain.jpg']);

  await page.goto('/crop-image-to-square');
  await expect(page.locator('#tool')).toBeVisible();
  const square = await run(page, ['graphic.png']);
  expect(square.downloads[0]!.suggestedFilename()).toBe('graphic-cropped.png');
  const size = pngSize(await bytesOf(square.downloads[0]!));
  expect(size.width).toBe(size.height);
});


/* ------------------------------------------------------------------ */
/* Regressions from the QA pass                                        */
/* ------------------------------------------------------------------ */

test('Encrypted PDFs (owner password only) are unlocked in the tab instead of merged into a broken file', async ({ page }) => {
  // Before the fix, pdf-lib copied still-encrypted streams into an unencrypted
  // file: the merge "succeeded" and every page of the output was blank.
  const errors = await open(page, 'merge-pdf');
  const net = watchNetwork(page);
  const { downloads } = await run(page, [staticFx('owner-locked.pdf'), 'text.pdf']);
  const out = await bytesOf(downloads[0]!);
  const doc = await PDFDocument.load(out);
  expect(doc.getPageCount()).toBe(6);
  expect(doc.isEncrypted).toBe(false);
  const firstPage = (await textItems(out, 1)).map((t) => t.str).join(' ');
  expect(firstPage).toContain('Page 1 of the fixture document');
  // The unlocker is fetched as code from this site; the PDF itself never leaves.
  net.assertNothingLeft(['owner-locked.pdf', 'text.pdf']);
  await expect(page.locator('#netproof-list')).toContainText('decoder program');
  expect(errors).toEqual([]);
});

test('A PDF with an open password asks for it, retries on a wrong one, and every PDF tool can use it', async ({ page }) => {
  const errors = await open(page, 'pdf-page-numbers');
  const prompts: string[] = [];
  const answers = ['wrong', 'stayput'];
  page.on('dialog', (d) => {
    prompts.push(d.message());
    void d.accept(answers.shift() ?? '');
  });
  const { downloads } = await run(page, [staticFx('user-locked.pdf')], async () => {
    await expect(page.locator('#page-info')).toContainText('3 pages');
  });
  expect(prompts).toHaveLength(2);
  expect(prompts[1]).toContain('did not work');
  const out = await bytesOf(downloads[0]!);
  expect((await PDFDocument.load(out)).isEncrypted).toBe(false);
  expect((await textItems(out, 2)).some((t) => t.str === '2')).toBe(true);
  expect(errors).toEqual([]);

  // Cancelling the prompt gives a clear error rather than a silent failure.
  await page.goto('/tools/split-pdf');
  page.removeAllListeners('dialog');
  page.on('dialog', (d) => void d.dismiss());
  await page.locator('#file-input').setInputFiles(staticFx('user-locked.pdf'));
  await expect(page.locator('#error')).toContainText('password-protected');
});

test('Page numbers and signatures land inside pages whose MediaBox is offset or cropped', async ({ page }) => {
  // Before the fix, placement assumed the page started at 0,0, so on these
  // pages numbers and signatures were drawn outside the visible area.
  const errors = await open(page, 'pdf-page-numbers');
  const { downloads } = await run(page, ['boxes.pdf']);
  const out = await bytesOf(downloads[0]!);
  const p1 = (await textItems(out, 1)).find((t) => t.str === '1');
  expect(p1, 'offset page is numbered').toBeTruthy();
  expect(p1!.y).toBeCloseTo(200 + 36, 0); // visible bottom (y=200) plus the margin
  expect(p1!.x).toBeGreaterThan(100 + 250);
  expect(p1!.x).toBeLessThan(100 + 320);
  const p2 = (await textItems(out, 2)).find((t) => t.str === '2');
  expect(p2!.y).toBeCloseTo(50 + 36, 0); // crop box starts at y=50
  expect(p2!.x).toBeGreaterThan(50 + 150); // centred in a 400 pt wide crop
  expect(p2!.x).toBeLessThan(50 + 250);
  expect(errors).toEqual([]);

  await page.goto('/tools/sign-pdf');
  const signed = await run(page, ['boxes.pdf'], async () => {
    await expect(page.locator('#page-label')).toHaveText('Page 1 of 2');
    await page.locator('input[name="sig-mode"][value="type"]').check({ force: true });
    await page.locator('#sig-text').fill('Keenan');
    await page.locator('#add-signature').click();
  });
  const signedDoc = await PDFDocument.load(await bytesOf(signed.downloads[0]!));
  // The image is placed with a cm operator; its translation must fall inside the offset MediaBox.
  const contents = signedDoc.getPage(0).node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  const text = refs
    .map((r) => signedDoc.context.lookup(r!))
    .filter((o): o is PDFRawStream => o instanceof PDFRawStream)
    .map((o) => new TextDecoder('latin1').decode(decodePDFRawStream(o).decode()))
    .join('\n');
  const m = /1 0 0 1 ([\d.]+) ([\d.]+) cm\s+1 0 0 1 0 0 cm\s+[\d.]+ 0 0 [\d.]+ 0 0 cm/.exec(text);
  expect(m, 'signature placement found').toBeTruthy();
  const [x, y] = [Number(m![1]), Number(m![2])];
  expect(x).toBeGreaterThan(100);
  expect(x).toBeLessThan(712);
  expect(y).toBeGreaterThan(200);
  expect(y).toBeLessThan(992);
});

test('One bad file in a batch is skipped and named; the rest convert', async ({ page }) => {
  const errors = await open(page, 'convert-image');
  const bad = fx('not-an-image.jpg');
  writeFileSync(bad, 'this is text, not a JPEG');
  await page.locator('#file-input').setInputFiles([fx('plain.jpg'), bad, fx('graphic.png')]);
  await expect(page.locator('#tool')).toHaveAttribute('data-count', '3');
  await page.locator('#format').selectOption('image/png');
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 60_000 });
  expect(await page.locator('#results-list .result-item').count()).toBe(2);
  await expect(page.locator('#error')).toContainText('1 of 3 files was skipped: not-an-image.jpg');
  // The skipped file is logged as a warning, not an uncaught error.
  expect(errors).toEqual([]);
});

test('Empty files are reported instead of silently ignored', async ({ page }) => {
  await open(page, 'heic-to-jpg');
  const empty = fx('empty.heic');
  writeFileSync(empty, '');
  await page.locator('#file-input').setInputFiles(empty);
  await expect(page.locator('#error')).toContainText('empty.heic is empty (0 bytes)');
  await expect(page.locator('#run')).toBeDisabled();
});

test('A file that cannot be opened shows an error as soon as it is added', async ({ page }) => {
  // Before the fix the failure was an unhandled promise rejection: the page
  // showed nothing, or "Keep at least one page" when the user pressed run.
  await open(page, 'reorder-pdf');
  const uncaught: string[] = [];
  page.on('pageerror', (e) => uncaught.push(e.message));
  const fake = fx('notes.pdf');
  writeFileSync(fake, 'plain text with a .pdf extension\n'.repeat(20));
  await page.locator('#file-input').setInputFiles(fake);
  await expect(page.locator('#error')).toContainText('notes.pdf: This file is not a PDF');
  await page.locator('#run').click();
  await expect(page.locator('#error')).toContainText('not a PDF');
  expect(uncaught).toEqual([]);
});

test.describe('offline', () => {
  test.use({ serviceWorkers: 'allow' });
  test('After one visit every tool works offline, including code it never loaded online', async ({ page, context }) => {
    // Before the fix the service worker cached only chunks the visit happened to
    // load, so a first-time visitor who went offline could not run a PDF tool.
    await stubAnalytics(page);
    await page.goto('/');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    // Wait until the install step has put every asset in the cache.
    await expect
      .poll(async () => page.evaluate(async () => (await (await caches.open('stayput-assets')).keys()).length), { timeout: 30_000 })
      .toBeGreaterThan(20);
    await context.setOffline(true);
    await page.goto('/tools/merge-pdf');
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    const { downloads } = await run(page, ['text.pdf', 'scan.pdf']);
    expect((await PDFDocument.load(await bytesOf(downloads[0]!))).getPageCount()).toBe(5);
    await context.setOffline(false);
  });

  test('After one visit to an image tool, HEIC, JPEG XL and AVIF files convert offline', async ({ page, context }) => {
    // The decoders used to load from a CDN at the moment a file needed them, so
    // offline those formats failed even after a visit. Pretend this browser has
    // no native AVIF decoder (Chromium has one) so all three Wasm decoders run.
    await page.addInitScript(() => {
      const native = window.createImageBitmap.bind(window);
      window.createImageBitmap = (async (src: ImageBitmapSource, ...rest: unknown[]) => {
        if (src instanceof Blob) {
          const head = new Uint8Array(await src.slice(0, 12).arrayBuffer());
          if (String.fromCharCode(...head.subarray(4, 12)) === 'ftypavif') throw new DOMException('no native AVIF', 'InvalidStateError');
        }
        return (native as (...a: unknown[]) => Promise<ImageBitmap>)(src, ...rest);
      }) as typeof window.createImageBitmap;
    });
    await stubAnalytics(page);
    await page.goto('/tools/convert-image');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    // The page asks the service worker to cache the decoders it may need and reports when they are in.
    await decoderCache(page, 'cached');
    const cached = await cachedPaths(page);
    for (const file of ['heic-to.min.js', 'jxl_dec.wasm', 'avif_dec.wasm']) expect(cached.some((p) => p.startsWith('/vendor/') && p.endsWith(file)), file).toBe(true);
    // navigator.serviceWorker.ready resolved before the decoders were requested, so install has cached the site's own code.
    expect(cached.length).toBeGreaterThan(20);
    await context.setOffline(true);
    await page.goto('/tools/convert-image');
    const { items } = await run(page, ['iphone.heic', staticFx('checker.jxl'), staticFx('checker.avif')], async () => {
      await page.locator('#format').selectOption('image/png');
    });
    expect(items).toBe(3);
    const zip = await zipAll(page);
    expect(Object.keys(zip).sort()).toEqual(['checker (2).png', 'checker.png', 'iphone.png']);
    expect(pngSize(zip['iphone.png']!)).toEqual({ width: 1200, height: 900 });
    for (const name of ['checker.png', 'checker (2).png']) expect(pngSize(zip[name]!), name).toEqual({ width: 320, height: 240 });
    await context.setOffline(false);
  });
});

test('The drop zone is named by its visible text and footer links are large enough to tap', async ({ page }) => {
  await open(page, 'merge-pdf');
  const drop = page.locator('#drop');
  await expect(drop).not.toHaveAttribute('aria-label', /.*/);
  await expect(drop).toHaveAttribute('aria-describedby', 'drop-hint');
  const box = await page.locator('.site-footer .links a').first().boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(24);
});
