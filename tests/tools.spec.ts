import { test, expect, type Page, type Download } from '@playwright/test';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { PDFDocument, PDFName, degrees } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import { inspect, sniffFormat } from '../src/lib/exif';

const fixtures = fileURLToPath(new URL('./fixtures/generated/', import.meta.url));
const fx = (name: string) => fixtures + name;
const HEIC_URL = 'https://cdn.jsdelivr.net/npm/heic-to@1.5.2/dist/csp/heic-to.min.js';
const heicLocal = fileURLToPath(new URL('../node_modules/heic-to/dist/csp/heic-to.min.js', import.meta.url));
const staticFx = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));
const nodeModules = fileURLToPath(new URL('../node_modules/', import.meta.url));

/** Serve the jSquash decoders (normally fetched from jsDelivr) from node_modules so tests stay offline. */
async function serveLocalCodecs(page: Page) {
  await page.route('https://cdn.jsdelivr.net/npm/@jsquash/**', (route) => {
    const m = /\/npm\/(@jsquash\/[a-z]+)@[\d.]+\/(.+)$/.exec(route.request().url());
    if (!m) return route.abort();
    const file = nodeModules + m[1] + '/' + m[2];
    const type = file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript';
    return route.fulfill({ path: file, contentType: type });
  });
}

/**
 * Record every request the tab makes from now on. `assertNothingLeft` then
 * checks that no request could have carried file bytes: only GETs without a
 * body to this site or the code CDN, plus the small anonymous usage ping.
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
        expect(['localhost', 'cdn.jsdelivr.net'], `unexpected host ${host}`).toContain(host);
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
  // Serve the HEIC decoder locally so tests do not depend on the network.
  await page.route(HEIC_URL, (route) => route.fulfill({ path: heicLocal, contentType: 'text/javascript' }));
  await serveLocalCodecs(page);
  await stubAnalytics(page);
  await page.goto(`/tools/${slug}`);
  await expect(page.locator('#tool')).toBeVisible();
  return errors;
}

async function run(page: Page, files: string[], configure?: () => Promise<void>): Promise<{ downloads: Download[]; items: number }> {
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
  expect(await page.locator('.tool-card').count()).toBe(13);
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
  const events = await page.evaluate(() => (window as unknown as { __events: { n: string; d: Record<string, string> }[] }).__events);
  expect(events).toHaveLength(1);
  expect(events[0]!.n).toBe('tool_run');
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
  const slugs = ['heic-to-jpg', 'convert-image', 'compress-image', 'strip-exif', 'merge-pdf', 'split-pdf', 'compress-pdf', 'rotate-pdf', 'image-to-pdf', 'pdf-to-image', 'reorder-pdf', 'sign-pdf', 'pdf-page-numbers'];
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
  const pairs = ['heic-to-png', 'png-to-jpg', 'jpg-to-png', 'webp-to-png', 'webp-to-jpg', 'png-to-webp', 'jpg-to-webp', 'avif-to-jpg', 'avif-to-png', 'svg-to-png', 'jxl-to-png', 'jxl-to-jpg'];
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

test('JXL to PNG page converts with the preset format and lists the decoder in the network proof', async ({ page }) => {
  await serveLocalCodecs(page);
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
