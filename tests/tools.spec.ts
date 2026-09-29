import { test, expect, type Page, type Download, type Locator } from '@playwright/test';
import { readFileSync, existsSync, writeFileSync, mkdtempSync, copyFileSync } from 'node:fs';
import { execSync, execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
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

/**
 * Tick a visually hidden radio or checkbox. Once a file is in, the Run bar is
 * pinned over the bottom of the screen; scrolling the input to the middle first
 * keeps the forced click from landing on the bar instead.
 */
async function choose(input: Locator) {
  await input.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await input.check({ force: true });
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
  expect(await page.locator('.tool-card').count()).toBe(64);
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
    await choose(page.locator('input[name="format"][value="png"]'));
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

/** Open an image with Pillow (installed for the fixtures) to prove other software reads our output. */
function pillowReads(bytes: Uint8Array, ext: string): { format: string; size: [number, number]; frames?: number } {
  const dir = mkdtempSync(join(tmpdir(), 'stayput-'));
  const file = join(dir, `out.${ext}`);
  writeFileSync(file, bytes);
  const out = execFileSync('python3', ['-c', 'import sys,json;from PIL import Image;im=Image.open(sys.argv[1]);im.load();print(json.dumps({"format":im.format,"size":im.size,"sizes":sorted(im.info.get("sizes",[]))}))', file], { encoding: 'utf8' });
  return JSON.parse(out);
}

test('Image converter detects the real format when the extension lies', async ({ page }) => {
  const errors = await open(page, 'convert-image');
  const dir = mkdtempSync(join(tmpdir(), 'stayput-'));
  const renamed = join(dir, 'holiday.jpg');
  copyFileSync(fx('iphone.heic'), renamed);
  const { downloads } = await run(page, [renamed], async () => {
    await expect(page.locator('#detected')).toContainText('HEIC');
    await expect(page.locator('#detected')).toContainText('named .jpg, but it is really HEIC');
    await page.locator('#format').selectOption('image/png');
  });
  const png = await bytesOf(downloads[0]!);
  expect(sniffFormat(png)).toBe('png');
  expect(pngSize(png)).toEqual({ width: 1200, height: 900 });
  expect(errors).toEqual([]);
});

test('Image converter format picker searches aliases and works from the keyboard', async ({ page }) => {
  await open(page, 'convert-image');
  await expect(page.locator('#picker-button')).toBeVisible();
  await expect(page.locator('#picker-button')).toContainText('JPG');
  await page.locator('#picker-button').click();
  await expect(page.locator('#picker-search')).toBeFocused();
  await page.locator('#picker-search').fill('favicon');
  await expect(page.locator('#picker-list [role="option"]')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(page.locator('#format')).toHaveValue('image/x-icon');
  await expect(page.locator('#picker-button')).toContainText('ICO');
  await expect(page.locator('#picker-button')).toBeFocused();
  await expect(page.locator('#quality-field')).toBeHidden();

  // Typing on the closed picker starts a search; arrows move, Enter picks.
  await page.keyboard.type('ti');
  await expect(page.locator('#picker-search')).toHaveValue('ti');
  await expect(page.locator('#picker-list [role="option"]').first()).toContainText('TIFF');
  await page.keyboard.press('Enter');
  await expect(page.locator('#format')).toHaveValue('image/tiff');

  await page.locator('#picker-button').click();
  await page.locator('#picker-search').fill('zzz');
  await expect(page.locator('#picker-empty')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#picker-pop')).toBeHidden();
  await expect(page.locator('#format')).toHaveValue('image/tiff');
});

test('Image converter writes PDF, ICO, GIF, BMP and TIFF that other software opens', async ({ page }) => {
  const errors = await open(page, 'convert-image');
  const net = watchNetwork(page);
  const cases: [string, string, string, (r: ReturnType<typeof pillowReads>) => void][] = [
    ['application/pdf', 'pdf', '', () => {}],
    ['image/x-icon', 'ico', 'ICO', (r) => expect(r.size).toEqual([256, 256])],
    ['image/gif', 'gif', 'GIF', (r) => expect(r.size).toEqual([800, 600])],
    ['image/bmp', 'bmp', 'BMP', (r) => expect(r.size).toEqual([800, 600])],
    ['image/tiff', 'tiff', 'TIFF', (r) => expect(r.size).toEqual([800, 600])],
  ];
  for (const [type, ext, pillowFormat, check] of cases) {
    if (await page.locator('#clear').isVisible()) await page.locator('#clear').click();
    const { downloads } = await run(page, ['plain.jpg'], async () => {
      await page.locator('#format').selectOption(type);
    });
    const bytes = await bytesOf(downloads[0]!);
    expect(downloads[0]!.suggestedFilename()).toBe(`plain.${ext}`);
    if (ext === 'pdf') {
      expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe('%PDF-');
      const doc = await PDFDocument.load(bytes);
      expect(doc.getPageCount()).toBe(1);
      expect(doc.getPage(0).getSize()).toEqual({ width: 800, height: 600 });
      continue;
    }
    const read = pillowReads(bytes, ext);
    expect(read.format).toBe(pillowFormat);
    check(read);
  }
  net.assertNothingLeft(['plain.jpg']);
  expect(errors).toEqual([]);
});

test('Image converter keeps transparency in ICO and TIFF', async ({ page }) => {
  await open(page, 'convert-image');
  // A 300x200 logo: opaque disc on a fully transparent background.
  const logo = join(mkdtempSync(join(tmpdir(), 'stayput-')), 'logo.png');
  execFileSync('python3', ['-c', 'import sys;from PIL import Image,ImageDraw;im=Image.new("RGBA",(300,200),(0,0,0,0));ImageDraw.Draw(im).ellipse((50,0,250,200),fill=(30,110,90,255));im.save(sys.argv[1])', logo]);
  for (const [type, ext] of [['image/x-icon', 'ico'], ['image/tiff', 'tiff']] as const) {
    if (await page.locator('#clear').isVisible()) await page.locator('#clear').click();
    const { downloads } = await run(page, [logo], async () => {
      await page.locator('#format').selectOption(type);
    });
    const dir = mkdtempSync(join(tmpdir(), 'stayput-'));
    const file = join(dir, `out.${ext}`);
    writeFileSync(file, await bytesOf(downloads[0]!));
    const alpha = execFileSync('python3', ['-c', 'import sys;from PIL import Image;im=Image.open(sys.argv[1]).convert("RGBA");print(im.getextrema()[3][0])', file], { encoding: 'utf8' }).trim();
    expect(Number(alpha), `${ext} keeps transparent pixels`).toBe(0);
  }
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

test('EXIF viewer shows location, device and every field without sending the photo', async ({ page }) => {
  await open(page, 'exif-viewer');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  const net = watchNetwork(page);
  const names = ['photo.jpg', 'graphic.png', 'picture.webp', 'iphone.heic', 'plain.jpg'];
  await page.locator('#file-input').setInputFiles(names.map(fx));
  const cards = page.locator('#exif-report .exif-card');
  await expect(cards).toHaveCount(5);
  for (const i of [0, 1, 2, 3]) {
    await expect(cards.nth(i).locator('.exif-facts')).toContainText('40.446111, -79.982222');
    await expect(cards.nth(i).locator('.exif-facts')).toContainText('TestCam Model X');
  }
  await expect(cards.nth(0).locator('.exif-facts')).toContainText('25 Sep 2026, 12:00:00');
  await expect(cards.nth(0).locator('.exif-table')).toContainText('Rotated 90° right');
  await expect(cards.nth(0).locator('header')).toContainText('Comment');
  await expect(cards.nth(4).locator('.exif-facts')).toContainText('None stored');
  await expect(cards.nth(4).locator('.exif-facts')).toContainText('carries no metadata');
  const map = cards.nth(0).getByRole('link', { name: 'Open map' });
  await expect(map).toHaveAttribute('href', /mlat=40\.446111&mlon=-79\.982222/);

  const download = page.waitForEvent('download');
  await page.locator('#run').click();
  const csv = Buffer.from(await bytesOf(await download)).toString();
  expect(csv.split('\r\n')[0]).toBe('file,group,field,value');
  expect(csv).toContain('photo.jpg,Location,Latitude,40.446111');
  expect(csv).toContain('iphone.heic,Camera,Model,Model X');
  expect(csv).toContain('plain.jpg,,,no EXIF data');
  net.assertNothingLeft(names);
});

test('EXIF viewer reads a stripped photo as clean', async ({ page }) => {
  await open(page, 'strip-exif');
  await page.locator('#apply-orientation').uncheck();
  const { downloads } = await run(page, ['photo.jpg']);
  const cleaned = join(mkdtempSync(join(tmpdir(), 'exif-')), 'cleaned.jpg');
  writeFileSync(cleaned, await bytesOf(downloads[0]!));
  await open(page, 'exif-viewer');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles([cleaned]);
  await expect(page.locator('.exif-facts')).toContainText('None stored');
  await expect(page.locator('.exif-facts')).toContainText('carries no metadata');
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

  await choose(page.locator('input[name="split-mode"][value="each"]'));
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

  await choose(page.locator('input[name="mode"][value="lossless"]'));
  const downloads: Download[] = [];
  page.on('download', (d) => downloads.push(d));
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/);
  await expect.poll(() => downloads.length).toBe(1);
  expect((await PDFDocument.load(await bytesOf(downloads[0]!))).getPageCount()).toBe(2);

  await choose(page.locator('input[name="mode"][value="flatten"]'));
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
    await choose(page.locator('input[name="pages"][value="range"]'));
    await page.locator('#range').fill('1-2');
    await page.locator('#dpi').selectOption('72');
  });
  expect(items).toBe(2);
  const zip = await zipAll(page);
  expect(Object.keys(zip).sort()).toEqual(['text-page-1.png', 'text-page-2.png']);
  expect(pngSize(zip['text-page-1.png']!)).toEqual({ width: 612, height: 792 });
});

test('every tool page renders with structured data and no errors', async ({ page }) => {
  const slugs = ['heic-to-jpg', 'convert-image', 'compress-image', 'strip-exif', 'merge-pdf', 'split-pdf', 'compress-pdf', 'rotate-pdf', 'image-to-pdf', 'pdf-to-image', 'reorder-pdf', 'sign-pdf', 'pdf-page-numbers', 'pdf-to-word', 'crop-image', 'favicon-generator', 'unlock-pdf', 'protect-pdf', 'exif-viewer', 'video-to-gif', 'blur-image', 'rotate-image', 'video-to-mp3', 'image-to-text', 'color-picker', 'gif-to-mp4', 'compress-video', 'video-to-mp4', 'compress-png', 'trim-video', 'mute-video', 'resize-video', 'rotate-video', 'compress-gif', 'crop-video', 'video-speed', 'merge-videos', 'add-audio-to-video', 'reverse-video', 'video-to-jpg', 'remove-background', 'trim-audio', 'passport-photo', 'audio-converter', 'watermark-image', 'watermark-pdf', 'qr-code-generator', 'screen-recorder', 'voice-recorder', 'remove-pdf-metadata', 'sticker-maker', 'profile-picture-maker', 'volume-booster', 'redact-pdf', 'merge-audio', 'mic-test', 'crop-pdf', 'webcam-test', 'grayscale-pdf', 'audio-to-video', 'compress-audio', 'add-text-to-image', 'split-image', 'collage-maker'];
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
  const pairs = ['heic-to-png', 'png-to-jpg', 'jpg-to-png', 'webp-to-png', 'webp-to-jpg', 'png-to-webp', 'jpg-to-webp', 'avif-to-jpg', 'avif-to-png', 'svg-to-png', 'jxl-to-png', 'jxl-to-jpg', 'jfif-to-jpg', 'jfif-to-png', 'svg-to-jpg', 'gif-to-png', 'gif-to-jpg', 'png-to-ico', 'jpg-to-ico', 'bmp-to-png', 'bmp-to-jpg', 'png-to-bmp', 'tiff-to-jpg', 'tiff-to-png', 'webp-to-gif', 'png-to-gif', 'jpg-to-gif', 'jpg-to-tiff', 'png-to-tiff', 'ico-to-png'];
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
    const expected = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', ico: 'image/x-icon', bmp: 'image/bmp', gif: 'image/gif', tiff: 'image/tiff' }[to!];
    await expect(page.locator('#format')).toHaveValue(expected!);
    expect(errors, slug).toEqual([]);
  }
});

test('PNG to TIFF, JPG to TIFF and PNG to GIF pages write files other software opens, and no bytes leave the tab', async ({ page }) => {
  await stubAnalytics(page);
  const net = watchNetwork(page);
  for (const [slug, file, ext, format] of [['png-to-tiff', 'graphic.png', 'tiff', 'TIFF'], ['jpg-to-tiff', 'plain.jpg', 'tiff', 'TIFF'], ['png-to-gif', 'graphic.png', 'gif', 'GIF'], ['jpg-to-gif', 'plain.jpg', 'gif', 'GIF']] as const) {
    await page.goto(`/${slug}`);
    const { downloads } = await run(page, [file]);
    expect(downloads[0]!.suggestedFilename(), slug).toBe(`${file.split('.')[0]}.${ext}`);
    const read = pillowReads(await bytesOf(downloads[0]!), ext);
    expect(read.format, slug).toBe(format);
  }
  net.assertNothingLeft(['graphic.png', 'plain.jpg']);
});

test('ICO to PNG page takes the largest image in a multi-size icon and keeps transparency', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/ico-to-png');
  // app.ico holds 16, 32, 48 and 256 pixel versions of a circle on a transparent square.
  const { downloads } = await run(page, [staticFx('app.ico')]);
  expect(downloads[0]!.suggestedFilename()).toBe('app.png');
  const [w, h, cornerAlpha] = await page.evaluate(async (b) => {
    const bm = await createImageBitmap(new Blob([new Uint8Array(b)], { type: 'image/png' }));
    const c = new OffscreenCanvas(bm.width, bm.height);
    const ctx = c.getContext('2d')!;
    ctx.drawImage(bm, 0, 0);
    return [bm.width, bm.height, ctx.getImageData(0, 0, 1, 1).data[3]];
  }, [...(await bytesOf(downloads[0]!))]);
  expect([w, h]).toEqual([256, 256]);
  expect(cornerAlpha).toBe(0);
});

test('Screenshot to PDF page puts each screenshot on its own page at its own size', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/screenshot-to-pdf');
  const { downloads } = await run(page, ['stripes.png', 'graphic.png']);
  const doc = await PDFDocument.load(await bytesOf(downloads[0]!));
  expect(doc.getPageCount()).toBe(2);
  // Fit to each image with no margin: one point per pixel.
  expect([0, 1].map((i) => doc.getPage(i).getSize())).toEqual([{ width: 400, height: 300 }, { width: 640, height: 480 }]);
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
  // Centre the pad so the pinned run bar at the bottom of the screen cannot sit over it.
  await pad.evaluate((el) => el.scrollIntoView({ block: 'center' }));
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
  await choose(page.locator('input[name="sig-mode"][value="type"]'));
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
  await choose(page.locator('input[name="sig-mode"][value="type"]'));
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
    ['webp-to-pdf', 'image-to-pdf', async () => expect(page.locator('#file-input')).toHaveAttribute('accept', /webp/)],
    ['gif-to-pdf', 'image-to-pdf', async () => expect(page.locator('#file-input')).toHaveAttribute('accept', /gif/)],
    ['combine-images-into-pdf', 'image-to-pdf', async () => {
      await expect(page.locator('#page-size')).toHaveValue('a4');
      await expect(page.locator('#margin')).toHaveValue('10');
    }],
    ['tiff-to-pdf', 'image-to-pdf', async () => expect(page.locator('#file-input')).toHaveAttribute('accept', /tif/)],
    ['add-signature-to-pdf', 'sign-pdf', async () => expect(page.locator('#sig-pad')).toBeAttached()],
    ['resize-image-for-instagram', 'crop-image', async () => {
      await expect(page.locator('#aspect')).toHaveValue('4:5');
      await expect(page.locator('#format')).toHaveValue('image/jpeg');
    }],
    ['mp4-to-gif', 'video-to-gif', async () => expect(page.locator('#vg-panel')).toBeAttached()],
    ['mov-to-gif', 'video-to-gif', async () => expect(page.locator('#fps')).toHaveValue('10')],
    ['pixelate-image', 'blur-image', async () => {
      await expect(page.locator('input[name="area"][value="whole"]')).toBeChecked();
      await expect(page.locator('input[name="effect"][value="pixelate"]')).toBeChecked();
    }],
    ['blur-face', 'blur-image', async () => expect(page.locator('#strength')).toHaveValue('6')],
    ['mp4-to-mp3', 'video-to-mp3', async () => expect(page.locator('#bitrate')).toHaveValue('192')],
    ['m4a-to-mp3', 'video-to-mp3', async () => expect(page.locator('#bitrate')).toHaveValue('128')],
    ['wav-to-mp3', 'video-to-mp3', async () => expect(page.locator('#bitrate')).toHaveValue('256')],
    ['mov-to-mp3', 'video-to-mp3', async () => expect(page.locator('#format')).toHaveValue('mp3')],
    ['mp4-to-wav', 'video-to-mp3', async () => {
      await expect(page.locator('#format')).toHaveValue('wav');
      await expect(page.locator('#bitrate-field')).toBeHidden();
    }],
    ['ogg-to-mp3', 'video-to-mp3', async () => {
      await expect(page.locator('#bitrate')).toHaveValue('192');
      await expect(page.locator('#file-input')).toHaveAttribute('accept', /ogg/);
    }],
    ['flac-to-mp3', 'video-to-mp3', async () => expect(page.locator('#bitrate')).toHaveValue('320')],
    ['webm-to-mp3', 'video-to-mp3', async () => expect(page.locator('#bitrate')).toHaveValue('128')],
    ['opus-to-mp3', 'video-to-mp3', async () => {
      await expect(page.locator('#bitrate')).toHaveValue('96');
      await expect(page.locator('input[name="channels"][value="mono"]')).toBeChecked();
    }],
    ['ogg-to-wav', 'video-to-mp3', async () => expect(page.locator('#format')).toHaveValue('wav')],
    ['flac-to-wav', 'video-to-mp3', async () => expect(page.locator('#format')).toHaveValue('wav')],
    ['mp3-to-wav', 'video-to-mp3', async () => {
      await expect(page.locator('#format')).toHaveValue('wav');
      await expect(page.locator('#file-input')).toHaveAttribute('accept', /mp3/);
    }],
    ['m4a-to-wav', 'video-to-mp3', async () => expect(page.locator('#format')).toHaveValue('wav')],
    ['mkv-to-mp3', 'video-to-mp3', async () => {
      await expect(page.locator('#bitrate')).toHaveValue('192');
      await expect(page.locator('#file-input')).toHaveAttribute('accept', /mkv/);
    }],
    ['aac-to-mp3', 'video-to-mp3', async () => expect(page.locator('#file-input')).toHaveAttribute('accept', /aac/)],
    ['screenshot-to-pdf', 'image-to-pdf', async () => {
      await expect(page.locator('#page-size')).toHaveValue('fit');
      await expect(page.locator('#margin')).toHaveValue('0');
      await expect(page.locator('#file-input')).toHaveAttribute('accept', /heic/);
    }],
    ['mov-to-wav', 'video-to-mp3', async () => {
      await expect(page.locator('#format')).toHaveValue('wav');
      await expect(page.locator('#file-input')).toHaveAttribute('accept', /mov/);
    }],
    ['webm-to-gif', 'video-to-gif', async () => expect(page.locator('#file-input')).toHaveAttribute('accept', /webm/)],
    ['blur-text-in-image', 'blur-image', async () => {
      await expect(page.locator('input[name="area"][value="areas"]')).toBeChecked();
      await expect(page.locator('input[name="effect"][value="box"]')).toBeChecked();
    }],
    ...['extract-text-from-image', 'picture-to-text', 'screenshot-to-text', 'jpg-to-text', 'png-to-text'].map(
      (slug): [string, string, () => Promise<void>] => [slug, 'image-to-text', async () => expect(page.locator('input[name="lines"][value="keep"]')).toBeChecked()],
    ),
    ['flip-image', 'rotate-image', async () => {
      await expect(page.locator('input[name="rotate"][value="0"]')).toBeChecked();
      await expect(page.locator('#flip-h')).toBeChecked();
    }],
    ['color-picker-from-image', 'color-picker', async () => expect(page.locator('#colors')).toHaveValue('6')],
    ['make-background-transparent', 'remove-background', async () => {
      await expect(page.locator('input[name="bg"][value="transparent"]')).toBeChecked();
      await expect(page.locator('#format')).toHaveValue('image/png');
    }],
    ['white-background', 'remove-background', async () => {
      await expect(page.locator('input[name="bg"][value="white"]')).toBeChecked();
      await expect(page.locator('#format')).toHaveValue('image/jpeg');
    }],
    ['blur-background', 'remove-background', async () => {
      await expect(page.locator('input[name="bg"][value="blur"]')).toBeChecked();
      await expect(page.locator('#strength-field')).toBeVisible();
      await expect(page.locator('#format')).toHaveValue('image/jpeg');
    }],
    ['2x2-photo', 'passport-photo', async () => expect(page.locator('#size')).toHaveValue('us')],
    ['35x45-photo', 'passport-photo', async () => expect(page.locator('#size')).toHaveValue('eu')],
    ['linkedin-profile-picture', 'profile-picture-maker', async () => expect(page.locator('input[name="shape"][value="square"]')).toBeChecked()],
    ['whatsapp-sticker-maker', 'sticker-maker', async () => expect(page.locator('#size')).toHaveValue('512')],
    ['pdf-metadata-viewer', 'remove-pdf-metadata', async () => expect(page.locator('#run')).toContainText('Remove metadata')],
    ['black-and-white-pdf', 'grayscale-pdf', async () => expect(page.locator('#run')).toContainText('Make black and white')],
    ['confidential-watermark', 'watermark-pdf', async () => expect(page.locator('#wm-text')).toHaveValue('CONFIDENTIAL')],
    ['watermark-id-copy', 'watermark-image', async () => expect(page.locator('input[name="layout"][value="tiled"]')).toBeChecked()],
    ['color-palette-from-image', 'color-picker', async () => expect(page.locator('#colors')).toHaveValue('8')],
    ['hex-color-from-image', 'color-picker', async () => expect(page.locator('#colors')).toHaveValue('6')],
    ['gif-to-video', 'gif-to-mp4', async () => expect(page.locator('#repeat')).toHaveValue('auto')],
    ['animated-gif-to-mp4', 'gif-to-mp4', async () => expect(page.locator('#repeat')).toHaveValue('1')],
    ['video-compressor', 'compress-video', async () => {
      await expect(page.locator('#mode')).toHaveValue('balanced');
      await expect(page.locator('#size-field')).toBeHidden();
    }],
    ['compress-video-for-discord', 'compress-video', async () => {
      await expect(page.locator('#mode')).toHaveValue('size');
      await expect(page.locator('#size')).toHaveValue('10');
      await expect(page.locator('#size-field')).toBeVisible();
    }],
    ['compress-video-for-email', 'compress-video', async () => expect(page.locator('#size')).toHaveValue('25')],
    ...(['mov', 'mkv', 'webm'] as const).map(
      (ext): [string, string, () => Promise<void>] => [`${ext}-to-mp4`, 'video-to-mp4', async () => {
        await expect(page.locator('#mute')).not.toBeChecked();
        expect(await page.locator('#file-input').getAttribute('accept')).toContain(`.${ext}`);
      }],
    ),
    ['png-compressor', 'compress-png', async () => expect(page.locator('#colors')).toHaveValue('256')],
    ['reduce-png-size', 'compress-png', async () => expect(page.locator('#colors')).toHaveValue('256')],
    ['cut-video', 'trim-video', async () => expect(page.locator('#exact')).not.toBeChecked()],
    ['trim-mp4', 'trim-video', async () => expect(page.locator('#exact')).not.toBeChecked()],
    ['pdf-to-tiff', 'pdf-to-image', async () => {
      await expect(page.locator('#format')).toHaveValue('image/tiff');
      await expect(page.locator('#dpi')).toHaveValue('300');
      await expect(page.locator('#quality-field')).toBeHidden();
    }],
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

test('Add signature landing page loads the signing stage and signs a PDF', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/add-signature-to-pdf');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  const net = watchNetwork(page);
  await page.locator('#file-input').setInputFiles([fx('text.pdf')]);
  await expect(page.locator('#sign-panel')).toBeVisible();
  await choose(page.locator('input[name="sig-mode"][value="type"]'));
  await page.locator('#sig-text').fill('Ada Lovelace');
  await page.locator('#add-signature').click();
  await expect(page.locator('.stamp-signature')).toHaveCount(1);
  await page.locator('#add-date').click();
  await expect(page.locator('.stamp')).toHaveCount(2);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#run').click()]);
  expect(download.suggestedFilename()).toBe('text-signed.pdf');
  const doc = await PDFDocument.load(await bytesOf(download));
  expect(doc.getPageCount()).toBe(3);
  net.assertNothingLeft(['text.pdf']);
});

test('TIFF to PDF keeps every page of a multi-page TIFF and a fax page, and no bytes leave the tab', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/tiff-to-pdf');
  const net = watchNetwork(page);
  const { downloads } = await run(page, ['scan.tiff', 'fax.tif']);
  const doc = await PDFDocument.load(await bytesOf(downloads[0]!));
  expect(doc.getPageCount()).toBe(3);
  expect(doc.getPage(0).getSize()).toEqual({ width: 800, height: 1000 });
  expect(doc.getPage(2).getSize()).toEqual({ width: 1728, height: 600 });
  net.assertNothingLeft(['scan.tiff', 'fax.tif']);
});

test('TIFF to JPG and TIFF to PNG decode TIFFs the browser cannot open', async ({ page }) => {
  for (const [slug, type] of [['tiff-to-jpg', 'image/jpeg'], ['tiff-to-png', 'image/png']] as const) {
    await stubAnalytics(page);
    await page.goto(`/${slug}`);
    const { downloads } = await run(page, ['scan.tiff']);
    const bytes = await bytesOf(downloads[0]!);
    const dims = await page.evaluate(async ([b, t]) => {
      const bmp = await createImageBitmap(new Blob([new Uint8Array(b)], { type: t }));
      return [bmp.width, bmp.height];
    }, [Array.from(bytes), type] as const);
    expect(dims, slug).toEqual([800, 1000]);
  }
});

test('WebP to GIF keeps every frame, the timing and the compositing of animated WebPs', async ({ page }) => {
  for (const file of ['anim.webp', 'anim-lossless.webp']) {
    await stubAnalytics(page);
    await page.goto('/webp-to-gif');
    const net = watchNetwork(page);
    const { downloads } = await run(page, [file]);
    await expect(page.locator('#results')).toContainText('4 frames');
    const bytes = await bytesOf(downloads[0]!);
    const frames = await page.evaluate(async (b) => {
      const dec = new ImageDecoder({ data: new Uint8Array(b), type: 'image/gif' });
      await dec.tracks.ready;
      const out: { red: boolean; clearBehind: boolean; ms: number }[] = [];
      for (let i = 0; i < dec.tracks.selectedTrack!.frameCount; i++) {
        const { image } = await dec.decode({ frameIndex: i });
        const c = new OffscreenCanvas(image.displayWidth, image.displayHeight);
        const ctx = c.getContext('2d')!;
        ctx.drawImage(image, 0, 0);
        // Centre of this frame's dot, and where the first frame's dot was.
        const [r, , , a] = ctx.getImageData(30 + i * 30, 40, 1, 1).data;
        const behind = ctx.getImageData(30, 40, 1, 1).data[3]!;
        out.push({ red: r! > 180 && a! > 200, clearBehind: i === 0 || behind === 0, ms: (image.duration ?? 0) / 1000 });
        image.close();
      }
      return out;
    }, Array.from(bytes));
    expect(frames.length, file).toBe(4);
    expect(frames.every((f) => f.red && f.clearBehind), file).toBe(true);
    if (file === 'anim.webp') expect(frames.map((f) => f.ms)).toEqual([100, 150, 200, 250]);
    net.assertNothingLeft([file]);
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
    // Covers the tool cards under the article too, which once pointed at /tools/<preset>.
    const internal = await page.locator('main a[href^="/"]').evaluateAll((as) => [...new Set(as.map((a) => (a as HTMLAnchorElement).getAttribute('href')!))]);
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
    await choose(page.locator('input[name="sig-mode"][value="type"]'));
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
  test('Returning visitors get pages from the browser\'s own request, and missing pages still 404', async ({ page }) => {
    // The worker used to re-fetch every page itself, and Chrome showed ERR_FAILED on
    // the first open of each page for returning visitors. Navigation preload hands the
    // page request back to the browser.
    await stubAnalytics(page);
    await page.goto('/');
    const preload = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
      return (await reg.navigationPreload.getState()).enabled;
    });
    expect(preload).toBe(true);
    for (const path of ['/tools/image-to-pdf', '/tools/merge-pdf', '/']) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      expect(res?.fromServiceWorker(), path).toBe(true);
    }
    const missing = await page.goto('/no-such-page');
    expect(missing?.status()).toBe(404);
  });

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

/** Sizes of the PNG images inside an ICO, from its directory. */
function icoSizes(b: Uint8Array): number[] {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  expect(dv.getUint16(2, true)).toBe(1);
  return Array.from({ length: dv.getUint16(4, true) }, (_, i) => b[6 + i * 16] || 256);
}

test('Favicon generator builds the full icon set and manifest, and no bytes leave the tab', async ({ page }) => {
  const errors = await open(page, 'favicon-generator');
  const net = watchNetwork(page);
  await page.locator('#app-name').fill('Test Site');
  const { items } = await run(page, ['graphic.png']);
  expect(items).toBe(8);
  const zip = await zipAll(page);
  expect(Object.keys(zip).sort()).toEqual([
    'apple-touch-icon.png', 'favicon-16x16.png', 'favicon-32x32.png', 'favicon.ico',
    'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'site.webmanifest',
  ]);
  expect(icoSizes(zip['favicon.ico']!)).toEqual([16, 32, 48]);
  expect(pngSize(zip['favicon-16x16.png']!)).toEqual({ width: 16, height: 16 });
  expect(pngSize(zip['favicon-32x32.png']!)).toEqual({ width: 32, height: 32 });
  expect(pngSize(zip['apple-touch-icon.png']!)).toEqual({ width: 180, height: 180 });
  expect(pngSize(zip['icon-192.png']!)).toEqual({ width: 192, height: 192 });
  expect(pngSize(zip['icon-512.png']!)).toEqual({ width: 512, height: 512 });
  expect(pngSize(zip['icon-maskable-512.png']!)).toEqual({ width: 512, height: 512 });
  const manifest = JSON.parse(new TextDecoder().decode(zip['site.webmanifest']!));
  expect(manifest.name).toBe('Test Site');
  expect(manifest.icons.map((i: { src: string; sizes: string; purpose?: string }) => `${i.src} ${i.sizes} ${i.purpose ?? 'any'}`)).toEqual([
    '/icon-192.png 192x192 any', '/icon-512.png 512x512 any', '/icon-maskable-512.png 512x512 maskable',
  ]);
  const snippet = page.locator('#favicon-snippet pre code');
  await expect(snippet).toContainText('<link rel="icon" href="/favicon.ico" sizes="32x32">');
  await expect(snippet).toContainText('<link rel="apple-touch-icon" href="/apple-touch-icon.png">');
  await expect(snippet).toContainText('<link rel="manifest" href="/site.webmanifest">');
  await expect(snippet).not.toContainText('favicon.svg');
  net.assertNothingLeft(['graphic.png']);
  expect(errors).toEqual([]);
});

test('Favicon generator keeps an SVG source as favicon.svg and links it', async ({ page }) => {
  const errors = await open(page, 'favicon-generator');
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#1f6f5f"/></svg>';
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles([{ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) }]);
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 60_000 });
  const zip = await zipAll(page);
  expect(new TextDecoder().decode(zip['favicon.svg']!)).toBe(svg);
  expect(pngSize(zip['icon-512.png']!)).toEqual({ width: 512, height: 512 });
  await expect(page.locator('#favicon-snippet pre code')).toContainText('<link rel="icon" href="/favicon.svg" type="image/svg+xml">');
  expect(errors).toEqual([]);
});

test('PNG to ICO page writes a multi-size icon and links the favicon generator', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/png-to-ico');
  const net = watchNetwork(page);
  const { downloads } = await run(page, ['graphic.png']);
  expect(downloads[0]!.suggestedFilename()).toBe('graphic.ico');
  expect(icoSizes(await bytesOf(downloads[0]!))).toEqual([16, 24, 32, 48, 64, 128, 256]);
  await expect(page.locator('.prose-wide a[href="/tools/favicon-generator"]')).toHaveText('favicon generator');
  net.assertNothingLeft(['graphic.png']);
});

test('Run stays on screen once a file is in, even when the tool panel is taller than a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [slug, file] of [['crop-image', 'plain.jpg'], ['strip-exif', 'plain.jpg'], ['sign-pdf', 'text.pdf']] as const) {
    await open(page, slug);
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    await page.locator('#file-input').setInputFiles([fx(file)]);
    await expect(page.locator('#tool')).toHaveAttribute('data-count', '1');
    await expect(page.locator('#run'), `${slug}: Run must be visible without scrolling`).toBeInViewport({ ratio: 1 });
    // Still reachable halfway down the tool.
    await page.evaluate(() => window.scrollTo(0, 300));
    await expect(page.locator('#run'), `${slug}: Run must follow the scroll`).toBeInViewport({ ratio: 1 });
  }
});

test('Sign PDF says what is needed before Run until a signature is placed', async ({ page }) => {
  await open(page, 'sign-pdf');
  await expect(page.locator('#run-hint')).toBeHidden();
  await page.locator('#file-input').setInputFiles([fx('text.pdf')]);
  await expect(page.locator('#run-hint')).toBeVisible();
  await expect(page.locator('#run-hint')).toContainText('Add signature to this page');
  await choose(page.locator('input[name="sig-mode"][value="type"]'));
  await page.locator('#sig-text').fill('Keenan Example');
  await page.locator('#add-signature').click();
  await expect(page.locator('.stamp-signature')).toHaveCount(1);
  await expect(page.locator('#run-hint')).toBeHidden();
  await page.locator('.stamp-signature .stamp-remove').dispatchEvent('click');
  await expect(page.locator('#run-hint')).toBeVisible();
});

test('Unlock PDF removes an open password with the password field and no bytes leave the tab', async ({ page }) => {
  const errors = await open(page, 'unlock-pdf');
  const net = watchNetwork(page);
  page.on('dialog', (d) => void d.dismiss());
  const { downloads } = await run(page, [staticFx('user-locked.pdf')], async () => {
    await page.locator('#password').fill('stayput');
  });
  const out = await bytesOf(downloads[0]!);
  expect(new TextDecoder('latin1').decode(out)).not.toContain('/Encrypt');
  expect((await PDFDocument.load(out)).getPageCount()).toBe(3);
  await expect(page.locator('#results-list')).toContainText('password removed');
  net.assertNothingLeft(['user-locked.pdf']);
  expect(errors).toEqual([]);
});

test('Unlock PDF strips owner-only restrictions without asking and says so for an open PDF', async ({ page }) => {
  const errors = await open(page, 'unlock-pdf');
  let asked = false;
  page.on('dialog', (d) => {
    asked = true;
    void d.dismiss();
  });
  const { downloads } = await run(page, [staticFx('owner-locked.pdf'), 'text.pdf']);
  expect(asked).toBe(false);
  expect(downloads).toHaveLength(0);
  const files = await zipAll(page);
  expect(Object.keys(files)).toHaveLength(2);
  for (const b of Object.values(files)) expect(new TextDecoder('latin1').decode(b)).not.toContain('/Encrypt');
  await expect(page.locator('#results-list')).toContainText('restrictions removed');
  await expect(page.locator('#results-list')).toContainText('had no password');
  expect(errors).toEqual([]);
});

test('Protect PDF encrypts with AES-256 so the file needs the password to open', async ({ page }) => {
  const errors = await open(page, 'protect-pdf');
  const net = watchNetwork(page);
  // Mismatched passwords block the run with a clear message.
  await page.locator('#file-input').setInputFiles(fx('text.pdf'));
  await page.locator('#password').fill('correct horse');
  await page.locator('#password-confirm').fill('correct hose');
  await page.locator('#run').click();
  await expect(page.locator('#error')).toContainText('do not match');
  await page.locator('#password-confirm').fill('correct horse');
  await page.locator('#clear').click();
  errors.splice(0); // the shell logs the mismatch it just showed
  const { downloads } = await run(page, ['text.pdf']);
  const out = await bytesOf(downloads[0]!);
  const raw = new TextDecoder('latin1').decode(out);
  expect(raw).toContain('/Encrypt');
  expect(raw).toMatch(/\/V 5/);
  // pdf.js refuses it without the password and opens it with the right one.
  await expect(getDocument({ data: out.slice() }).promise).rejects.toThrow(/password/i);
  const doc = await getDocument({ data: out.slice(), password: 'correct horse' }).promise;
  expect(doc.numPages).toBe(3);
  net.assertNothingLeft(['text.pdf']);
  expect(errors).toEqual([]);
});

/** Frame count, size and loop flag of a GIF, walked block by block. */
function gifInfo(b: Uint8Array) {
  expect(new TextDecoder().decode(b.slice(0, 6))).toBe('GIF89a');
  const width = b[6]! | (b[7]! << 8);
  const height = b[8]! | (b[9]! << 8);
  let i = 13 + (b[10]! & 0x80 ? 3 * (2 << (b[10]! & 7)) : 0);
  let frames = 0;
  let loops = false;
  const skipSubBlocks = () => {
    while (b[i]! !== 0) i += b[i]! + 1;
    i++;
  };
  while (i < b.length && b[i] !== 0x3b) {
    if (b[i] === 0x21) {
      if (b[i + 1] === 0xff && new TextDecoder().decode(b.slice(i + 3, i + 14)) === 'NETSCAPE2.0') loops = true;
      i += 2;
      skipSubBlocks();
    } else if (b[i] === 0x2c) {
      frames++;
      const packed = b[i + 9]!;
      i += 10 + (packed & 0x80 ? 3 * (2 << (packed & 7)) : 0);
      i++; // LZW minimum code size
      skipSubBlocks();
    } else throw new Error(`bad GIF block 0x${b[i]!.toString(16)} at ${i}`);
  }
  return { width, height, frames, loops };
}

test('Video to GIF trims a clip into an animated GIF, and no bytes leave the tab', async ({ page }) => {
  const errors = await open(page, 'video-to-gif');
  const net = watchNetwork(page);
  // A 3 second 320x240 WebM recorded by MediaRecorder: red, then green, then blue,
  // one second each. Such files store no duration, which the tool has to find.
  const { downloads } = await run(page, [staticFx('clip.webm')], async () => {
    await expect(page.locator('#vg-panel')).toBeVisible();
    await expect.poll(async () => Number(await page.locator('#vg-panel').getAttribute('data-duration'))).toBeGreaterThan(2.5);
    await page.locator('#vg-start').fill('0.4');
    await page.locator('#vg-end').fill('2.4');
    await page.locator('#fps').selectOption('10');
    await page.locator('#width').selectOption('640');
    await expect(page.locator('#vg-estimate')).toContainText('320 × 240 GIF, 20 frames');
    await choose(page.locator('input[name="loop"][value="forever"]'));
  });
  expect(downloads).toHaveLength(1);
  expect(downloads[0]!.suggestedFilename()).toBe('clip.gif');
  const gif = await bytesOf(downloads[0]!);
  expect(gifInfo(gif)).toEqual({ width: 320, height: 240, frames: 20, loops: true });
  // The first frame is from the red second and the last from the blue one.
  const colours = await page.evaluate(async (bytes) => {
    const dec = new ImageDecoder({ data: new Uint8Array(bytes), type: 'image/gif' });
    await dec.tracks.ready;
    const pick = async (frameIndex: number) => {
      const { image } = await dec.decode({ frameIndex });
      const c = new OffscreenCanvas(image.displayWidth, image.displayHeight);
      const ctx = c.getContext('2d')!;
      ctx.drawImage(image, 0, 0);
      image.close();
      return Array.from(ctx.getImageData(20, 20, 1, 1).data.slice(0, 3));
    };
    return [await pick(0), await pick(19)];
  }, Array.from(gif));
  const [first, last] = colours as [number[], number[]];
  expect(first[0]).toBeGreaterThan(180);
  expect(first[2]).toBeLessThan(80);
  expect(last[2]).toBeGreaterThan(180);
  expect(last[0]).toBeLessThan(80);
  net.assertNothingLeft(['clip.webm']);
  expect(errors).toEqual([]);
});

test('Video to GIF refuses an end time before the start with a clear message', async ({ page }) => {
  await open(page, 'video-to-gif');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles([staticFx('clip.webm')]);
  await expect(page.locator('#vg-panel')).toBeVisible();
  await page.locator('#vg-end').fill('0');
  await expect(page.locator('#vg-estimate')).toHaveText('The end must come after the start.');
  await page.locator('#run').click();
  await expect(page.locator('#error')).toContainText('end time must come after the start');
});

/** Drag across the blur stage between two points given as fractions of the image. */
async function markArea(page: Page, from: [number, number], to: [number, number]) {
  const canvas = page.locator('#blur-canvas');
  // Keep the whole image clear of the Run bar pinned to the bottom of the screen.
  await canvas.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const b = (await canvas.boundingBox())!;
  await page.mouse.move(b.x + b.width * from[0], b.y + b.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * to[0], b.y + b.height * to[1], { steps: 5 });
  await page.mouse.up();
}

test('Blur image hides only the marked areas, per effect, and no bytes leave the tab', async ({ page }) => {
  const errors = await open(page, 'blur-image');
  const net = watchNetwork(page);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles([fx('stripes.png')]);
  await expect(page.locator('#blur-panel')).toBeVisible();
  // Running with no area marked explains what to do instead of saving an unchanged copy.
  await page.locator('#run').click();
  await expect(page.locator('#error')).toContainText('Mark at least one area');
  // Two areas on the 400x300 stripes: left quarter and bottom-right corner; a tap adds nothing.
  await markArea(page, [0.05, 0.1], [0.25, 0.5]);
  await markArea(page, [0.6, 0.6], [0.9, 0.9]);
  await markArea(page, [0.5, 0.2], [0.5, 0.2]);
  await expect(page.locator('.blur-area:not(.is-drawing)')).toHaveCount(2);
  // Undo drops the last area; draw it again.
  await page.locator('#blur-undo').click();
  await expect(page.locator('.blur-area:not(.is-drawing)')).toHaveCount(1);
  await markArea(page, [0.6, 0.6], [0.9, 0.9]);
  // Outlines redraw on the next frame, so wait for the recorded areas themselves.
  await expect.poll(async () => (await page.locator('#blur-panel').getAttribute('data-areas'))!.split(';').length).toBe(2);
  const areas = (await page.locator('#blur-panel').getAttribute('data-areas'))!.split(';').map((a) => a.split(',').map(Number));
  expect(areas).toHaveLength(2);
  const [ax, ay, aw, ah] = areas[0]!;
  const inside: [number, number] = [Math.round(ax! + aw! / 2), Math.round(ay! + ah! / 2)];
  const outside: [number, number] = [200, 20];

  const grey = (px: number[]) => px[0]! > 90 && px[0]! < 165;
  const pure = (px: number[]) => px[0]! < 10 || px[0]! > 245;
  for (const [effect, name, check] of [
    ['blur', 'stripes-blurred.png', grey],
    ['pixelate', 'stripes-pixelated.png', grey],
    ['box', 'stripes-redacted.png', (px: number[]) => px[0] === 0 && px[1] === 0 && px[2] === 0],
  ] as const) {
    await choose(page.locator(`input[name="effect"][value="${effect}"]`));
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#run').click()]);
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 60_000 });
    expect(download.suggestedFilename()).toBe(name);
    const png = await bytesOf(download);
    expect(pngSize(png)).toEqual({ width: 400, height: 300 });
    expect(check(await pixelAt(page, png, ...inside)), `${effect} inside`).toBe(true);
    expect(pure(await pixelAt(page, png, ...outside)), `${effect} outside`).toBe(true);
  }
  net.assertNothingLeft(['stripes.png']);
  // The shell logs failed runs; the only one here is the deliberate run with no area.
  expect(errors.filter((e) => !e.includes('Mark at least one area'))).toEqual([]);
});

test('Dragging on the picture in whole-image mode switches to marked areas', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/pixelate-image');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles([fx('stripes.png')]);
  await expect(page.locator('#blur-panel')).toBeVisible();
  await expect(page.locator('input[name="area"][value="whole"]')).toBeChecked();
  await markArea(page, [0.1, 0.1], [0.4, 0.5]);
  await expect(page.locator('input[name="area"][value="areas"]')).toBeChecked();
  await expect(page.locator('.blur-area:not(.is-drawing)')).toHaveCount(1);
  const download = page.waitForEvent('download');
  await page.locator('#run').click();
  expect((await download).suggestedFilename()).toBe('stripes-pixelated.png');
  await expect(page.locator('#results-list')).toContainText('pixelate, 1 area');
});

test('Pixelate image page pixelates the whole picture into blocks', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/pixelate-image');
  await expect(page.locator('#tool')).toBeVisible();
  const net = watchNetwork(page);
  const { downloads } = await run(page, ['stripes.png']);
  expect(downloads[0]!.suggestedFilename()).toBe('stripes-pixelated.png');
  const png = await bytesOf(downloads[0]!);
  // Every block averages black and white stripes to grey, at the edges too.
  for (const [x, y] of [[0, 0], [199, 150], [399, 299]] as const) {
    const px = await pixelAt(page, png, x, y);
    expect(px[0]).toBeGreaterThan(90);
    expect(px[0]).toBeLessThan(165);
  }
  net.assertNothingLeft(['stripes.png']);
});

const dark = (px: number[]) => px[0]! < 70 && px[1]! < 70 && px[2]! < 70;

test('Rotate image turns a batch a quarter right, keeps the preview in step, and no bytes leave the tab', async ({ page }) => {
  const errors = await open(page, 'rotate-image');
  const net = watchNetwork(page);
  // plain.jpg is 800x600 with a dark block in its top-left corner.
  const { items } = await run(page, ['plain.jpg', 'graphic.png'], async () => {
    await expect(page.locator('#rotate-panel')).toBeVisible();
    await expect(page.locator('#rotate-panel')).toHaveAttribute('data-transform', '90,');
    // The quick buttons drive the same options: left then right is back to 90.
    await page.locator('#rotate-left').click();
    await expect(page.locator('#rotate-panel')).toHaveAttribute('data-transform', '0,');
    await page.locator('#rotate-right').click();
    await expect(page.locator('#rotate-panel')).toHaveAttribute('data-transform', '90,');
    await expect(page.locator('#rotate-hint')).toContainText('all 2 images');
  });
  expect(items).toBe(2);
  const files = await zipAll(page);
  expect(Object.keys(files).sort()).toEqual(['graphic-rotated.png', 'plain-rotated.jpg']);
  const jpg = files['plain-rotated.jpg']!;
  expect(jpegSize(jpg)).toEqual({ width: 600, height: 800 });
  // A quarter turn right carries the top-left corner to the top-right.
  expect(dark(await pixelAt(page, jpg, 590, 10))).toBe(true);
  expect(dark(await pixelAt(page, jpg, 10, 10))).toBe(false);
  expect(pngSize(files['graphic-rotated.png']!)).toEqual({ width: 480, height: 640 });
  net.assertNothingLeft(['plain.jpg', 'graphic.png']);
  expect(errors).toEqual([]);
});

test('Flip image page mirrors left to right, and a no-op is refused', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/flip-image');
  await expect(page.locator('#tool')).toBeVisible();
  const net = watchNetwork(page);
  const { downloads } = await run(page, ['plain.jpg']);
  expect(downloads[0]!.suggestedFilename()).toBe('plain-flipped.jpg');
  const jpg = await bytesOf(downloads[0]!);
  expect(jpegSize(jpg)).toEqual({ width: 800, height: 600 });
  expect(dark(await pixelAt(page, jpg, 790, 10))).toBe(true);
  expect(dark(await pixelAt(page, jpg, 10, 10))).toBe(false);
  net.assertNothingLeft(['plain.jpg']);
  // Untick the flip: nothing would change, so the tool says so instead of saving a copy.
  await choose(page.locator('#flip-h'));
  await page.locator('#flip-h').uncheck({ force: true });
  await page.locator('#run').click();
  await expect(page.locator('#error')).toContainText('Pick a rotation or a flip first');
});

test('Find faces marks every face, even small ones in a group, with a detector served by the site', async ({ page }) => {
  const errors = await open(page, 'blur-image');
  const net = watchNetwork(page);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  // Four small copies of one face on a 2400x1600 canvas, at known places.
  await page.locator('#file-input').setInputFiles([fx('group.jpg')]);
  await expect(page.locator('#blur-panel')).toBeVisible();
  // On the general blur tool the search waits for the button.
  await expect(page.locator('#blur-panel')).not.toHaveAttribute('data-finding', 'true');
  await expect(page.locator('#blur-panel')).not.toHaveAttribute('data-faces', /.*/);
  await page.locator('#blur-find').click();
  await expect(page.locator('#blur-panel')).toHaveAttribute('data-faces', '4', { timeout: 60_000 });
  await expect(page.locator('#blur-hint')).toContainText('Found 4 faces');
  const areas = (await page.locator('#blur-panel').getAttribute('data-areas'))!.split(';').map((a) => a.split(',').map(Number));
  // Each pasted face is 205x256 with the face itself around (65..145, 20..110) inside it.
  for (const [x, y] of [[150, 200], [800, 1100], [1400, 300], [2000, 1150]] as const) {
    const cx = x + 105;
    const cy = y + 70;
    expect(areas.some(([ax, ay, aw, ah]) => ax! <= cx && cx <= ax! + aw! && ay! <= cy && cy <= ay! + ah!), `face at ${x},${y}`).toBe(true);
  }
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#run').click()]);
  expect(download.suggestedFilename()).toBe('group-blurred.jpg');

  // A single portrait: one face, and no hand or fabric mistaken for another.
  await page.locator('#file-input').setInputFiles([staticFx('face.jpg')]);
  await expect(page.locator('#blur-panel')).not.toHaveAttribute('data-faces', '4');
  await page.locator('#blur-find').click();
  await expect(page.locator('#blur-panel')).toHaveAttribute('data-faces', '1', { timeout: 60_000 });
  net.assertNothingLeft(['group.jpg', 'face.jpg']);
  // MediaPipe logs its CPU delegate start-up as a console error; that line is expected.
  expect(errors.filter((e) => !e.includes('XNNPACK'))).toEqual([]);
});

test('Blur image can cover areas with an emoji picked or pasted', async ({ page }) => {
  const errors = await open(page, 'blur-image');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles([fx('stripes.png')]);
  await expect(page.locator('#blur-panel')).toBeVisible();
  await markArea(page, [0.3, 0.2], [0.7, 0.8]);
  await expect.poll(async () => (await page.locator('#blur-panel').getAttribute('data-areas'))!.length).toBeGreaterThan(0);
  const [ax, ay, aw, ah] = (await page.locator('#blur-panel').getAttribute('data-areas'))!.split(',').map(Number);
  await expect(page.locator('#emoji-field')).toBeHidden();
  await choose(page.locator('input[name="effect"][value="emoji"]'));
  await expect(page.locator('#emoji-field')).toBeVisible();
  await page.locator('.emoji-pick[data-emoji="🐱"]').click();
  await expect(page.locator('#emoji')).toHaveValue('🐱');
  await expect(page.locator('.emoji-pick[data-emoji="🐱"]')).toHaveAttribute('aria-pressed', 'true');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#run').click()]);
  expect(download.suggestedFilename()).toBe('stripes-emoji.png');
  await expect(page.locator('#results-list')).toContainText('emoji 🐱');
  // The stripes are black and white; a colour emoji puts colour in the middle of the area.
  const png = await bytesOf(download);
  const colourful: boolean[] = [];
  for (const fy of [0.2, 0.35, 0.5, 0.65, 0.8]) {
    for (const fx_ of [0.2, 0.35, 0.5, 0.65, 0.8]) {
      const px = await pixelAt(page, png, Math.round(ax! + aw! * fx_), Math.round(ay! + ah! * fy));
      colourful.push(Math.max(px[0]!, px[1]!, px[2]!) - Math.min(px[0]!, px[1]!, px[2]!) > 40);
    }
  }
  // Most of a 5x5 grid inside the area lands on the emoji's colour (eyes and mouth are dark).
  expect(colourful.filter(Boolean).length, `colour inside the area: ${colourful}`).toBeGreaterThanOrEqual(13);
  const outsidePx = await pixelAt(page, png, 5, 5);
  expect(Math.max(...outsidePx.slice(0, 3)) - Math.min(...outsidePx.slice(0, 3))).toBeLessThan(10);
  // Pasting text keeps only the first emoji.
  await page.locator('#emoji').fill('🦊🦊 fox');
  await page.locator('#emoji').blur();
  await expect(page.locator('#emoji')).toHaveValue('🦊');
  expect(errors).toEqual([]);
});

test('Blur face page finds faces as soon as the photo loads, and the boxes stay editable', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await stubAnalytics(page);
  await page.goto('/blur-face');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles([fx('group.jpg')]);
  // No button press: the search starts by itself and says so while it runs.
  await expect(page.locator('#blur-find')).toHaveText('Finding faces…');
  await expect(page.locator('#blur-panel')).toHaveAttribute('data-faces', '4', { timeout: 60_000 });
  await expect(page.locator('#blur-find')).toHaveText('Find faces');
  await expect(page.locator('#blur-find')).toBeEnabled();
  await expect(page.locator('.blur-area:not(.is-drawing)')).toHaveCount(4);
  // Remove one box with its ×; the rest stay.
  await page.locator('.blur-area button').first().click({ force: true });
  await expect(page.locator('.blur-area:not(.is-drawing)')).toHaveCount(3);
  expect(errors).toEqual([]);
});

/** Decode audio bytes in the page: duration, channel count and loudness (RMS of the first channel). */
async function audioInfo(page: Page, bytes: Uint8Array) {
  return page.evaluate(async (arr) => {
    const ctx = new OfflineAudioContext(2, 1, 44100);
    const buf = await ctx.decodeAudioData(new Uint8Array(arr).buffer);
    const d = buf.getChannelData(0);
    let sum = 0;
    for (let i = 0; i < d.length; i++) sum += d[i]! * d[i]!;
    return { duration: buf.duration, channels: buf.numberOfChannels, rms: Math.sqrt(sum / d.length) };
  }, Array.from(bytes));
}

test('Video to MP3 converts a video and a WAV in one batch, and no bytes leave the tab', async ({ page }) => {
  const errors = await open(page, 'video-to-mp3');
  const net = watchNetwork(page);
  // A 2.2 s WebM with a 440 Hz Opus sound track, and a 1.5 s stereo 48 kHz WAV.
  const { items } = await run(page, [staticFx('talk.webm'), 'tone.wav']);
  expect(items).toBe(2);
  const files = await zipAll(page);
  expect(Object.keys(files).sort()).toEqual(['talk.mp3', 'tone.mp3']);
  for (const [name, seconds] of [['talk.mp3', 2.2], ['tone.mp3', 1.5]] as const) {
    const mp3 = files[name]!;
    // An MP3 starts with a frame sync (11 set bits); this encoder writes no ID3 tag.
    expect(mp3[0]).toBe(0xff);
    expect(mp3[1]! & 0xe0).toBe(0xe0);
    const info = await audioInfo(page, mp3);
    expect(info.channels).toBe(2);
    expect(info.duration).toBeGreaterThan(seconds - 0.4);
    expect(info.duration).toBeLessThan(seconds + 0.4);
    expect(info.rms, `${name} is not silent`).toBeGreaterThan(0.05);
  }
  net.assertNothingLeft(['talk.webm', 'tone.wav']);
  expect(errors).toEqual([]);
});

test('MP4 to WAV page writes a 44.1 kHz WAV, mono on request, and a video without sound gets a clear error', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/mp4-to-wav');
  await expect(page.locator('#tool')).toBeVisible();
  const net = watchNetwork(page);
  const { downloads } = await run(page, [staticFx('talk.webm')], async () => {
    await choose(page.locator('input[name="channels"][value="mono"]'));
  });
  expect(downloads[0]!.suggestedFilename()).toBe('talk.wav');
  const wav = await bytesOf(downloads[0]!);
  const dv = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  expect(new TextDecoder().decode(wav.slice(0, 4))).toBe('RIFF');
  expect(new TextDecoder().decode(wav.slice(8, 12))).toBe('WAVE');
  expect(dv.getUint16(22, true)).toBe(1); // mono
  expect(dv.getUint32(24, true)).toBe(44100);
  expect(dv.getUint16(34, true)).toBe(16);
  const info = await audioInfo(page, wav);
  expect(info.duration).toBeGreaterThan(1.8);
  expect(info.rms).toBeGreaterThan(0.05);
  net.assertNothingLeft(['talk.webm']);

  // clip.webm has video only.
  await page.goto('/tools/video-to-mp3');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles([staticFx('clip.webm')]);
  await page.locator('#run').click();
  await expect(page.locator('#error')).toContainText('No audio could be read from this file');
});

test('OGG, Opus, FLAC, MP3 and MKV landing pages turn real files into MP3 and WAV, and no bytes leave the tab', async ({ page }) => {
  await stubAnalytics(page);
  const net = watchNetwork(page);
  // 1 s 440 Hz tones: OGG Vorbis, Opus in Ogg, FLAC, MP3, and Opus in an MKV with video.
  // (The test Chromium has no AAC decoder, so AAC and M4A pages are checked in the preset test only.)
  for (const [slug, file, out] of [
    ['ogg-to-mp3', 'song.ogg', 'song.mp3'],
    ['opus-to-mp3', 'voice.opus', 'voice.mp3'],
    ['flac-to-wav', 'song.flac', 'song.wav'],
    ['mp3-to-wav', 'song.mp3', 'song.wav'],
    ['mkv-to-mp3', 'show.mkv', 'show.mp3'],
  ] as const) {
    await page.goto(`/${slug}`);
    await expect(page.locator('#tool')).toBeVisible();
    const { downloads } = await run(page, [staticFx(file)]);
    expect(downloads[0]!.suggestedFilename(), slug).toBe(out);
    const bytes = await bytesOf(downloads[0]!);
    if (out.endsWith('.wav')) expect(new TextDecoder().decode(bytes.slice(8, 12))).toBe('WAVE');
    else expect(bytes[0]).toBe(0xff);
    const info = await audioInfo(page, bytes);
    expect(info.duration, slug).toBeGreaterThan(0.7);
    expect(info.duration, slug).toBeLessThan(1.4);
    expect(info.rms, `${slug} is not silent`).toBeGreaterThan(0.05);
  }
  net.assertNothingLeft(['song.ogg', 'voice.opus', 'song.flac', 'song.mp3', 'show.mkv']);
});

test('Surround audio is mixed down to stereo with the centre channel kept', async ({ page }) => {
  // A 5.1 WAV with a tone on the centre channel only: taking just the front
  // left and right channels would give silence.
  await stubAnalytics(page);
  await page.goto('/mp4-to-wav');
  const { downloads } = await run(page, [staticFx('film-5.1.wav')]);
  const wav = await bytesOf(downloads[0]!);
  expect(new DataView(wav.buffer, wav.byteOffset).getUint16(22, true)).toBe(2);
  const info = await audioInfo(page, wav);
  expect(info.channels).toBe(2);
  expect(info.rms).toBeGreaterThan(0.05);
});

test('Image to text reads a PNG and a JPG in one batch, shows the text to copy, and no bytes leave the tab', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors = await open(page, 'image-to-text');
  const net = watchNetwork(page);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles([staticFx('ocr-note.png'), staticFx('ocr-letter.jpg')]);
  await page.locator('#run').click();
  // The first run loads the OCR engine and English model from /vendor/.
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 90_000 });
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  const texts = page.locator('#results-list .result-text');
  await expect(texts).toHaveCount(2);
  const note = await texts.nth(0).inputValue();
  expect(note).toContain('Stayput reads text on your device.');
  expect(note).toContain('Invoice number 48213');
  expect(note).toContain('Total due: $1,250.00');
  // Kept line breaks: one line per line of the image.
  expect(note.split('\n')).toHaveLength(3);
  expect(await texts.nth(1).inputValue()).toContain('quick brown fox');
  await page.locator('#results-list .result-item').first().getByRole('button', { name: 'Copy text' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(note);
  const files = await zipAll(page);
  expect(Object.keys(files).sort()).toEqual(['ocr-letter.txt', 'ocr-note.txt']);
  expect(new TextDecoder().decode(files['ocr-note.txt'])).toBe(note + '\n');
  net.assertNothingLeft(['ocr-note.png', 'ocr-letter.jpg']);
  expect(errors).toEqual([]);
});

test('Extract text page joins lines into paragraphs, and an image without text gets a clear error', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/extract-text-from-image');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(staticFx('ocr-letter.jpg'));
  await choose(page.locator('input[name="lines"][value="join"]'));
  let downloads = 0;
  page.on('download', () => downloads++);
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 90_000 });
  const text = await page.locator('#results-list .result-text').inputValue();
  const paragraphs = text.split('\n\n');
  expect(paragraphs).toHaveLength(2);
  expect(paragraphs[0]).toMatch(/^The quick brown fox jumps over the lazy dog while the wind carries leaves across the quiet morning field\.$/);
  expect(paragraphs[1]).toBe('A second paragraph starts here.');
  // The text is shown to copy; nothing downloads until asked.
  expect(downloads).toBe(0);

  await page.reload();
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(fx('plain.jpg'));
  await page.locator('#run').click();
  await expect(page.locator('#error')).toContainText('No text was found', { timeout: 60_000 });
});

test('Color picker reads the pixel under a click, finds the main colours, saves a palette, and no bytes leave the tab', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors = await open(page, 'color-picker');
  const net = watchNetwork(page);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  // swatches.png: left half #E63946, top right #1D3557, bottom right #A8DADC.
  await page.locator('#file-input').setInputFiles(fx('swatches.png'));
  const panel = page.locator('#color-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('data-palette', '#E63946,#1D3557,#A8DADC');
  // The card opens on the most common colour.
  await expect(page.locator('#val-hex')).toHaveText('#E63946');
  const canvas = page.locator('#color-canvas');
  // Centre the image so the pinned Run bar is not over it.
  await canvas.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const box = (await canvas.boundingBox())!;
  // Click the bottom right quarter.
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.8);
  await expect(panel).toHaveAttribute('data-picked', '#A8DADC');
  await expect(page.locator('#val-rgb')).toHaveText('rgb(168, 218, 220)');
  await expect(page.locator('#val-hsl')).toHaveText('hsl(182, 43%, 76%)');
  await page.locator('.color-copy[data-copy="val-hex"]').click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('#A8DADC');
  // The keyboard moves the cursor from there and picks with Enter: up 80 px lands in navy.
  await canvas.focus();
  for (let i = 0; i < 8; i++) await page.keyboard.press('Shift+ArrowUp');
  await page.keyboard.press('Enter');
  await expect(panel).toHaveAttribute('data-picked', '#1D3557');
  await expect(panel).toHaveAttribute('data-picks', '#1D3557,#A8DADC');
  // Fewer colours than asked for: flat blocks merge to three, whatever the setting.
  await page.locator('#colors').selectOption('4');
  await expect(panel).toHaveAttribute('data-palette', '#E63946,#1D3557,#A8DADC');
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/);
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  const text = await page.locator('#results-list .result-text').inputValue();
  expect(text).toBe('Main colours\n#E63946  rgb(230, 57, 70)\n#1D3557  rgb(29, 53, 87)\n#A8DADC  rgb(168, 218, 220)\n\nPicked\n#1D3557  rgb(29, 53, 87)\n#A8DADC  rgb(168, 218, 220)');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#results-list .result-item').getByText('Download', { exact: true }).click()]);
  expect(download.suggestedFilename()).toBe('swatches-palette.png');
  const png = await bytesOf(download);
  expect(pngSize(png)).toEqual({ width: 64 + 3 * 160, height: 32 + 2 * 200 + 16 });
  // The first swatch of the main row is the red.
  const px = await pixelAt(page, png, 32 + 80, 32 + 36 + 60);
  expect(px.slice(0, 3)).toEqual([0xe6, 0x39, 0x46]);
  net.assertNothingLeft(['swatches.png']);
  expect(errors).toEqual([]);
});

/** Walk an MP4's boxes: the video's width and height from tkhd, and its sample count from stsz. */
function mp4Info(b: Uint8Array) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const type = (o: number) => String.fromCharCode(b[o + 4]!, b[o + 5]!, b[o + 6]!, b[o + 7]!);
  const info = { brand: String.fromCharCode(...b.subarray(8, 12)), width: 0, height: 0, samples: 0, codec: '' };
  const walk = (start: number, end: number) => {
    for (let o = start; o + 8 <= end; ) {
      const size = v.getUint32(o);
      const t = type(o);
      if (size < 8) break;
      if (['moov', 'trak', 'mdia', 'minf', 'stbl'].includes(t)) walk(o + 8, o + size);
      if (t === 'tkhd') {
        const version = b[o + 8]!;
        const off = o + 8 + (version === 1 ? 88 : 76);
        info.width = v.getUint32(off) >>> 16;
        info.height = v.getUint32(off + 4) >>> 16;
      }
      if (t === 'stsz') info.samples = v.getUint32(o + 16);
      if (t === 'stsd') info.codec = type(o + 16);
      o += size;
    }
  };
  walk(0, b.length);
  return info;
}

/** Play an MP4 in the page and read its length, size and the colour at a few moments. */
async function videoProbe(page: Page, bytes: Uint8Array, times: number[], type = 'video/mp4') {
  return page.evaluate(async ({ data, times, type }) => {
    const v = document.createElement('video');
    v.muted = true;
    v.src = URL.createObjectURL(new Blob([new Uint8Array(data)], { type }));
    await new Promise((ok, bad) => { v.onloadeddata = ok; v.onerror = () => bad(new Error('video will not load')); });
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext('2d')!;
    const colours: number[][] = [];
    for (const t of times) {
      // 'seeked' can fire before the new frame is on screen, and drawing then reads the
      // previous frame. Wait for both 'seeked' and the frame callback for the new frame.
      await new Promise<void>((ok) => {
        let seeked = false;
        let presented = false;
        const done = () => seeked && presented && ok();
        v.requestVideoFrameCallback(() => ((presented = true), done()));
        v.onseeked = () => {
          seeked = true;
          // A seek that lands on the frame already shown presents nothing new.
          setTimeout(() => ((presented = true), done()), 1000);
          done();
        };
        v.currentTime = t;
      });
      ctx.drawImage(v, 0, 0);
      colours.push([...ctx.getImageData(c.width >> 1, c.height >> 1, 1, 1).data].slice(0, 3));
    }
    return { duration: v.duration, width: v.videoWidth, height: v.videoHeight, colours };
  }, { data: [...bytes], times, type });
}

const dominant = (px: number[]) => ['red', 'green', 'blue'][px.indexOf(Math.max(...px))];

test('GIF to MP4 keeps each frame and its timing, repeats a short loop to 3 seconds, and no bytes leave the tab', async ({ page }) => {
  const errors = await open(page, 'gif-to-mp4');
  const net = watchNetwork(page);
  const { downloads } = await run(page, ['anim.gif']);
  expect(downloads[0]!.suggestedFilename()).toBe('anim.mp4');
  await expect(page.locator('#results-list .result-item')).toContainText('242×162, 3.0 s (3 loops)');
  const mp4 = await bytesOf(downloads[0]!);
  const info = mp4Info(mp4);
  expect(info.brand).toMatch(/isom|mp41|mp42/);
  // A 121x81 GIF is enlarged 2x and rounded to even sides, as encoders require; 3 frames played 3 times.
  expect(info).toMatchObject({ width: 242, height: 162, samples: 9 });
  expect(['avc1', 'vp09', 'av01']).toContain(info.codec);
  const probe = await videoProbe(page, mp4, [0.1, 0.35, 0.7, 1.1, 2.9]);
  expect(probe.duration).toBeCloseTo(3, 1);
  expect(probe.colours.map(dominant)).toEqual(['red', 'green', 'blue', 'red', 'blue']);
  net.assertNothingLeft(['anim.gif']);
  expect(errors).toEqual([]);
});

test('Animated GIF to MP4 page plays once, and a file that is not a GIF gets a clear error', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/animated-gif-to-mp4');
  await expect(page.locator('#tool')).toBeVisible();
  const { downloads } = await run(page, ['anim.gif']);
  const info = mp4Info(await bytesOf(downloads[0]!));
  expect(info.samples).toBe(3);
  await page.reload();
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles({ name: 'fake.gif', mimeType: 'image/gif', buffer: readFileSync(fx('swatches.png')) });
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/);
  await expect(page.locator('#error')).toContainText('This file is not a GIF.');
});

/** Every track in an MP4: its sample entry (avc1, vp09, mp4a, Opus...) and, for video, its size. */
function mp4Tracks(b: Uint8Array) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const type = (o: number) => String.fromCharCode(b[o + 4]!, b[o + 5]!, b[o + 6]!, b[o + 7]!);
  const tracks: { codec: string; width: number; height: number }[] = [];
  const walk = (start: number, end: number) => {
    for (let o = start; o + 8 <= end; ) {
      const size = v.getUint32(o);
      const t = type(o);
      if (size < 8) break;
      if (t === 'trak') tracks.push({ codec: '', width: 0, height: 0 });
      if (['moov', 'trak', 'mdia', 'minf', 'stbl'].includes(t)) walk(o + 8, o + size);
      const track = tracks[tracks.length - 1];
      if (t === 'tkhd' && track) {
        const off = o + 8 + (b[o + 8] === 1 ? 88 : 76);
        track.width = v.getUint32(off) >>> 16;
        track.height = v.getUint32(off + 4) >>> 16;
      }
      if (t === 'stsd' && track) track.codec = type(o + 16);
      o += size;
    }
  };
  walk(0, b.length);
  return tracks;
}

/**
 * A 3 second 1280x720 WebM with a tone, recorded in the page at 8 Mbps: busy
 * enough that a real compressor has something to save, and made the way
 * browser screen recorders make files (no duration in the header).
 */
let recorded: string | undefined;
async function recordClip(page: Page): Promise<string> {
  if (recorded) return recorded;
  const bytes = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 1280;
    c.height = 720;
    const ctx = c.getContext('2d')!;
    const ac = new AudioContext();
    const osc = ac.createOscillator();
    const dest = ac.createMediaStreamDestination();
    osc.connect(dest);
    osc.start();
    const stream = new MediaStream([...c.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus', videoBitsPerSecond: 8e6 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.start();
    const t0 = performance.now();
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    await new Promise<void>((done) => {
      const frame = () => {
        const t = performance.now() - t0;
        for (let i = 0; i < 40; i++) {
          ctx.fillStyle = `hsl(${(i * 37 + t / 5) % 360},80%,${30 + ((i * 13) % 50)}%)`;
          ctx.fillRect((i * 97 + t / 3) % 1280, (i * 53) % 720, 200, 120);
        }
        ctx.fillStyle = '#000';
        for (let k = 0; k < 300; k++) ctx.fillRect(rand() * 1280, rand() * 720, 3, 3);
        if (t < 3000) requestAnimationFrame(frame);
        else done();
      };
      frame();
    });
    rec.stop();
    await new Promise((r) => (rec.onstop = r));
    return [...new Uint8Array(await new Blob(chunks).arrayBuffer())];
  });
  recorded = join(mkdtempSync(join(tmpdir(), 'stayput-')), 'recording.webm');
  writeFileSync(recorded, Buffer.from(bytes));
  return recorded;
}

test('Compress video shrinks a recording to an MP4 with picture and sound, and no bytes leave the tab', async ({ page }) => {
  const errors = await open(page, 'compress-video');
  const clip = await recordClip(page);
  const net = watchNetwork(page);
  const { downloads } = await run(page, [clip]);
  expect(downloads[0]!.suggestedFilename()).toBe('recording-compressed.mp4');
  const mp4 = await bytesOf(downloads[0]!);
  expect(mp4.length).toBeLessThan(readFileSync(clip).length / 2);
  const tracks = mp4Tracks(mp4);
  expect(tracks).toHaveLength(2);
  expect(['avc1', 'vp09', 'av01']).toContain(tracks[0]!.codec);
  expect(tracks[0]).toMatchObject({ width: 1280, height: 720 });
  expect(['mp4a', 'Opus']).toContain(tracks[1]!.codec);
  await expect(page.locator('#results-list .result-item')).toContainText('smaller');
  const probe = await videoProbe(page, mp4, [1.5]);
  expect(probe.duration).toBeGreaterThan(2.5);
  expect(probe.width).toBe(1280);
  net.assertNothingLeft(['recording.webm']);
  expect(errors).toEqual([]);
});

test('Compress video fits a size limit by lowering the resolution, drops the sound on request, and refuses a limit it cannot meet', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/compress-video-for-discord');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  const clip = await recordClip(page);
  // The page offers 8 MB and up; a 3 second clip needs a tiny limit to show the squeeze.
  await page.locator('#size').evaluate((el: HTMLSelectElement) => el.add(new Option('0.3 MB', '0.3')));
  const { downloads } = await run(page, [clip], async () => {
    await page.locator('#size').selectOption('0.3');
    await choose(page.locator('#mute'));
  });
  const mp4 = await bytesOf(downloads[0]!);
  expect(mp4.length).toBeLessThanOrEqual(300_000);
  const tracks = mp4Tracks(mp4);
  expect(tracks).toHaveLength(1);
  // About 720 kbps cannot fill 720p with detail, so the picture steps down.
  expect(tracks[0]!.height).toBeLessThan(720);
  expect(tracks[0]!.width / tracks[0]!.height).toBeCloseTo(16 / 9, 1);
  await expect(page.locator('#results-list .result-item')).toContainText('no sound');

  await page.locator('#size').evaluate((el: HTMLSelectElement) => el.add(new Option('0.01 MB', '0.01')));
  await page.locator('#size').selectOption('0.01');
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/);
  await expect(page.locator('#error')).toContainText('too long to fit in 0.01 MB');
});

test('Video to MP4 re-encodes a WebM recording, copies a stream that is already right, and no bytes leave the tab', async ({ page }) => {
  const errors = await open(page, 'video-to-mp4');
  const clip = await recordClip(page);
  const net = watchNetwork(page);
  const { downloads } = await run(page, [clip]);
  expect(downloads[0]!.suggestedFilename()).toBe('recording.mp4');
  const mp4 = await bytesOf(downloads[0]!);
  const tracks = mp4Tracks(mp4);
  expect(tracks).toHaveLength(2);
  expect(['avc1', 'vp09', 'av01']).toContain(tracks[0]!.codec);
  expect(tracks[0]).toMatchObject({ width: 1280, height: 720 });
  await expect(page.locator('#results-list .result-item')).toContainText('re-encoded to');
  // The recording had no length in its header; the MP4 has the real one.
  const probe = await videoProbe(page, mp4, [1]);
  expect(probe.duration).toBeGreaterThan(2.5);
  expect(probe.duration).toBeLessThan(4);
  net.assertNothingLeft(['recording.webm']);

  // Feed the MP4 back in: its video is already in the best codec this browser writes, so it is copied.
  const dir = mkdtempSync(join(tmpdir(), 'stayput-'));
  writeFileSync(join(dir, 'again.mp4'), mp4);
  await page.reload();
  await choose(page.locator('#mute'));
  const second = await run(page, [join(dir, 'again.mp4')]);
  await expect(page.locator('#results-list .result-item')).toContainText('copied, no quality loss');
  const copied = mp4Tracks(await bytesOf(second.downloads[0]!));
  expect(copied).toHaveLength(1);
  expect(copied[0]!.codec).toBe(tracks[0]!.codec);
  expect(errors).toEqual([]);
});

/** Pillow's view of a PNG: its mode (P for palette) and whether its pixels equal another PNG's. */
function pngCompare(a: Uint8Array, b: string): { mode: string; same: boolean } {
  const dir = mkdtempSync(join(tmpdir(), 'stayput-'));
  const file = join(dir, 'out.png');
  writeFileSync(file, a);
  const script = 'import sys,json;from PIL import Image,ImageChops;x=Image.open(sys.argv[1]);m=x.mode;x=x.convert("RGBA");y=Image.open(sys.argv[2]).convert("RGBA");print(json.dumps({"mode":m,"same":ImageChops.difference(x,y).getbbox() is None}))';
  return JSON.parse(execFileSync('python3', ['-c', script, file, b], { encoding: 'utf8' }));
}

test('Compress PNG cuts a PNG down with a palette, keeps transparency, and no bytes leave the tab', async ({ page }) => {
  const errors = await open(page, 'compress-png');
  const net = watchNetwork(page);
  const { downloads } = await run(page, ['gradient.png']);
  expect(downloads[0]!.suggestedFilename()).toBe('gradient-compressed.png');
  const png = await bytesOf(downloads[0]!);
  expect(pillowReads(png, 'png')).toMatchObject({ format: 'PNG', size: [600, 400] });
  expect(png.length).toBeLessThan(readFileSync(fx('gradient.png')).length * 0.5);
  expect(pngCompare(png, fx('gradient.png')).mode).toBe('P');
  // The transparent corner stays transparent, a flat shape keeps its colour, and the half-transparent ellipse stays half transparent.
  expect((await pixelAt(page, png, 5, 5))[3]).toBe(0);
  const navy = await pixelAt(page, png, 400, 100);
  expect(Math.abs(navy[0]! - 29) + Math.abs(navy[1]! - 53) + Math.abs(navy[2]! - 87)).toBeLessThan(12);
  expect(navy[3]).toBe(255);
  const ellipseAlpha = (await pixelAt(page, png, 450, 300))[3]!;
  expect(ellipseAlpha).toBeGreaterThan(180);
  expect(ellipseAlpha).toBeLessThan(220);
  await expect(page.locator('#results-list .result-item')).toContainText('256 colours');
  net.assertNothingLeft(['gradient.png']);
  expect(errors).toEqual([]);
});

test('Compress PNG lossless keeps every pixel, and a JPG gets a clear error', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/reduce-png-size');
  await expect(page.locator('#tool')).toBeVisible();
  const { downloads } = await run(page, ['gradient.png'], async () => {
    await page.locator('#colors').selectOption('0');
  });
  const png = await bytesOf(downloads[0]!);
  expect(pngCompare(png, fx('gradient.png')).same).toBe(true);
  expect(png.length).toBeLessThanOrEqual(readFileSync(fx('gradient.png')).length);
  await page.reload();
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: readFileSync(fx('photo.jpg')) });
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/);
  await expect(page.locator('#error')).toContainText('This file is not a PNG.');
});

/** Probe a saved clip's length by playing it; recordings made by MediaRecorder need a seek to learn it. */
async function clipLength(page: Page, bytes: Uint8Array, type: string): Promise<number> {
  return page.evaluate(async ({ data, type }) => {
    const v = document.createElement('video');
    v.muted = true;
    v.src = URL.createObjectURL(new Blob([new Uint8Array(data)], { type }));
    await new Promise((ok, bad) => { v.onloadedmetadata = ok; v.onerror = () => bad(new Error('clip will not load')); });
    if (!Number.isFinite(v.duration)) {
      await new Promise((ok) => { v.onseeked = ok; v.currentTime = 1e7; });
    }
    return v.duration;
  }, { data: [...bytes], type });
}

test('Trim video copies the part between start and end, keeps the format, and no bytes leave the tab', async ({ page }) => {
  const errors = await open(page, 'trim-video');
  const clip = await recordClip(page);
  const net = watchNetwork(page);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(clip);
  // The recording has no length in its header; the page finds it anyway.
  await expect(page.locator('#vg-panel')).toBeVisible();
  const length = Number(await page.locator('#vg-panel').getAttribute('data-duration'));
  expect(length).toBeGreaterThan(2.5);
  await expect(page.locator('#vg-end')).toHaveValue(String(length));
  await page.locator('#vg-start').fill('1');
  await page.locator('#vg-end').fill('2.5');
  await expect(page.locator('#vg-estimate')).toContainText('Keeps 0:01.5');
  const downloads: Download[] = [];
  page.on('download', (d) => downloads.push(d));
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 60_000 });
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  await expect.poll(() => downloads.length).toBe(1);
  expect(downloads[0]!.suggestedFilename()).toBe('recording-trimmed.webm');
  const webm = await bytesOf(downloads[0]!);
  const seconds = await clipLength(page, webm, 'video/webm');
  // Copied cuts may start up to half a second early.
  expect(seconds).toBeGreaterThan(1.4);
  expect(seconds).toBeLessThan(2.1);
  net.assertNothingLeft(['recording.webm']);
  expect(errors).toEqual([]);
});

test('Trim video cuts exactly on request, and an end before the start is refused', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/cut-video');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  const clip = await recordClip(page);
  await page.locator('#file-input').setInputFiles(clip);
  await expect(page.locator('#vg-panel')).toBeVisible();
  await page.locator('#vg-start').fill('2');
  await page.locator('#vg-end').fill('1');
  await expect(page.locator('#vg-estimate')).toHaveText('The end must come after the start.');
  await page.locator('#run').click();
  await expect(page.locator('#error')).toContainText('The end time must come after the start time.');
  await page.locator('#vg-start').fill('0.5');
  await page.locator('#vg-end').fill('2');
  await choose(page.locator('#exact'));
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.locator('#run').click()]);
  const seconds = await clipLength(page, await bytesOf(download), 'video/webm');
  expect(seconds).toBeGreaterThan(1.35);
  expect(seconds).toBeLessThan(1.65);
  await expect(page.locator('#results-list .result-item')).toContainText('cut exactly');
});

test('PDF to TIFF writes every page into one multi-page TIFF that Pillow reads, and no bytes leave the tab', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/pdf-to-tiff');
  await expect(page.locator('#tool')).toBeVisible();
  const net = watchNetwork(page);
  const { downloads } = await run(page, ['text.pdf'], async () => {
    await page.locator('#dpi').selectOption('72');
  });
  expect(downloads[0]!.suggestedFilename()).toBe('text.tiff');
  const tiff = await bytesOf(downloads[0]!);
  const dir = mkdtempSync(join(tmpdir(), 'stayput-'));
  writeFileSync(join(dir, 'out.tiff'), tiff);
  const script = 'import sys,json;from PIL import Image;im=Image.open(sys.argv[1]);pages=[];\nwhile True:\n  im.load();pages.append({"size":im.size,"mode":im.mode,"compression":im.info.get("compression"),"dpi":[round(x) for x in im.info.get("dpi",(0,0))],"dark":sum(1 for p in im.convert("L").getdata() if p<128)})\n  try: im.seek(im.tell()+1)\n  except EOFError: break\nprint(json.dumps(pages))';
  const pages = JSON.parse(execFileSync('python3', ['-c', script, join(dir, 'out.tiff')], { encoding: 'utf8' }));
  // text.pdf has three pages.
  expect(pages).toHaveLength(3);
  for (const p of pages) {
    expect(p).toMatchObject({ size: [612, 792], mode: 'RGB', compression: 'tiff_adobe_deflate', dpi: [72, 72] });
    // Real text was rendered, not a blank page.
    expect(p.dark).toBeGreaterThan(100);
  }
  net.assertNothingLeft(['text.pdf']);
});

/** The tracks in any video file, read in Node with the same library the page uses. */
async function videoTracks(bytes: Uint8Array): Promise<{ video: { codec: string | null; width: number; height: number } | null; audio: number }> {
  const { Input, BufferSource, ALL_FORMATS } = await import('mediabunny');
  const input = new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS });
  const v = await input.getPrimaryVideoTrack();
  const audio = (await input.getAudioTracks()).length;
  return { video: v ? { codec: v.codec, width: v.displayWidth, height: v.displayHeight } : null, audio };
}

/** A 1 second 640x360 WebM, red on the left half and blue on the right, so turns and flips can be told apart. */
async function halvesClip(page: Page): Promise<string> {
  const bytes = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 640;
    c.height = 360;
    const ctx = c.getContext('2d')!;
    const rec = new MediaRecorder(c.captureStream(30), { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 2e6 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.start();
    const t0 = performance.now();
    await new Promise<void>((done) => {
      const frame = () => {
        ctx.fillStyle = '#e00000';
        ctx.fillRect(0, 0, 320, 360);
        ctx.fillStyle = '#0000e0';
        ctx.fillRect(320, 0, 320, 360);
        // A small white mark in the top left corner tells a vertical flip from a turn.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 80, 60);
        if (performance.now() - t0 < 1000) requestAnimationFrame(frame);
        else done();
      };
      frame();
    });
    rec.stop();
    await new Promise((r) => (rec.onstop = r));
    return [...new Uint8Array(await new Blob(chunks).arrayBuffer())];
  });
  const file = join(mkdtempSync(join(tmpdir(), 'stayput-')), 'halves.webm');
  writeFileSync(file, Buffer.from(bytes));
  return file;
}

/** Colours at points given as fractions of the frame, half a second in. */
async function frameColours(page: Page, bytes: Uint8Array, points: [number, number][]) {
  return page.evaluate(async ({ data, points }) => {
    const v = document.createElement('video');
    v.muted = true;
    v.src = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: 'video/mp4' }));
    await new Promise((ok, bad) => { v.onloadeddata = ok; v.onerror = () => bad(new Error('video will not load')); });
    await new Promise<void>((ok) => { v.requestVideoFrameCallback(() => ok()); v.currentTime = 0.5; });
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(v, 0, 0);
    const name = ([r, g, b]: number[]) => (r! > 180 && g! > 180 && b! > 180 ? 'white' : r! > 150 && b! < 90 ? 'red' : b! > 150 && r! < 90 ? 'blue' : `rgb(${r},${g},${b})`);
    return { width: v.videoWidth, height: v.videoHeight, at: points.map(([x, y]) => name([...ctx.getImageData(Math.floor(x * c.width), Math.floor(y * c.height), 1, 1).data])) };
  }, { data: [...bytes], points });
}

test('Mute video copies the picture into the same format without its sound, and no bytes leave the tab', async ({ page }) => {
  const errors = await open(page, 'mute-video');
  const clip = await recordClip(page);
  const before = await videoTracks(readFileSync(clip));
  expect(before.audio).toBe(1);
  const net = watchNetwork(page);
  const { downloads } = await run(page, [clip]);
  expect(downloads[0]!.suggestedFilename()).toBe('recording-muted.webm');
  const out = await bytesOf(downloads[0]!);
  const after = await videoTracks(out);
  expect(after.audio).toBe(0);
  // Still VP8, which this page never encodes: the picture was copied, not re-encoded.
  expect(after.video).toMatchObject({ codec: 'vp8', width: 1280, height: 720 });
  await expect(page.locator('#results-list .result-item')).toContainText('copied, no quality loss');
  await expect(page.locator('#results-list .result-item')).toContainText('no sound');
  net.assertNothingLeft(['recording.webm']);
  expect(errors).toEqual([]);
});

test('Resize video sets the short side, keeps the sound, and takes a custom width', async ({ page }) => {
  const errors = await open(page, 'resize-video');
  const clip = await recordClip(page);
  const net = watchNetwork(page);
  const { downloads } = await run(page, [clip], async () => {
    await page.locator('#size').selectOption('360');
  });
  expect(downloads[0]!.suggestedFilename()).toBe('recording-resized.mp4');
  const mp4 = await bytesOf(downloads[0]!);
  const tracks = await videoTracks(mp4);
  expect(tracks.video).toMatchObject({ width: 640, height: 360 });
  expect(tracks.audio).toBe(1);
  await expect(page.locator('#results-list .result-item')).toContainText('640×360');
  net.assertNothingLeft(['recording.webm']);

  await page.reload();
  const second = await run(page, [clip], async () => {
    await page.locator('#size').selectOption('custom');
    await expect(page.locator('#custom-size')).toBeVisible();
    await page.locator('#width').fill('320');
  });
  expect((await videoTracks(await bytesOf(second.downloads[0]!))).video).toMatchObject({ width: 320, height: 180 });
  expect(errors).toEqual([]);
});

test('Rotate video turns and flips the picture itself, and the flip page starts on a mirror', async ({ page }) => {
  const errors = await open(page, 'rotate-video');
  const clip = await halvesClip(page);
  const net = watchNetwork(page);
  // 90° right: the left (red) half ends up on top, and the white corner at the top right.
  const { downloads } = await run(page, [clip]);
  expect(downloads[0]!.suggestedFilename()).toBe('halves-rotated.mp4');
  const turned = await frameColours(page, await bytesOf(downloads[0]!), [[0.5, 0.3], [0.5, 0.7], [0.95, 0.03]]);
  expect(turned).toMatchObject({ width: 360, height: 640, at: ['red', 'blue', 'white'] });
  net.assertNothingLeft(['halves.webm']);

  await stubAnalytics(page);
  await page.goto('/flip-video');
  await expect(page.locator('#flip-h')).toBeChecked();
  const flipped = await run(page, [clip]);
  const mirror = await frameColours(page, await bytesOf(flipped.downloads[0]!), [[0.25, 0.5], [0.75, 0.5], [0.95, 0.05]]);
  expect(mirror).toMatchObject({ width: 640, height: 360, at: ['blue', 'red', 'white'] });
  expect(errors).toEqual([]);

  await page.reload();
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(clip);
  await page.locator('input[name="rotate"][value="0"]').check({ force: true });
  await page.locator('#flip-h').uncheck({ force: true });
  await page.locator('#run').click();
  await expect(page.locator('#error')).toContainText('Choose a rotation or a flip first.');
});

/**
 * An animated GIF written the naive way many GIF makers do: 24 full frames of
 * 240x160, each with its own palette, over a noisy background that never moves,
 * with one square sliding across. Made in Node with gifenc.
 */
async function naiveGif(): Promise<string> {
  // gifenc's Node build is CommonJS, so its functions arrive on the default export.
  const mod = await import('gifenc');
  const { GIFEncoder, quantize, applyPalette } = ((mod as unknown as { default?: typeof mod }).default ?? mod);
  const w = 240;
  const h = 160;
  let seed = 11;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const bg = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const q = (y * w + x) * 4;
      const n = rand() * 40;
      bg.set([Math.min(255, 40 + x * 0.8 + n), Math.min(255, 60 + y + n), 150 + n * 0.5, 255], q);
    }
  }
  const gif = GIFEncoder();
  for (let f = 0; f < 24; f++) {
    const rgba = bg.slice();
    const sx = 10 + f * 8;
    for (let y = 60; y < 90; y++) for (let x = sx; x < sx + 30; x++) rgba.set([250, 210, 20, 255], (y * w + x) * 4);
    const palette = quantize(rgba, 256);
    gif.writeFrame(applyPalette(rgba, palette), w, h, { palette, delay: 80, repeat: 0 });
  }
  gif.finish();
  const file = join(mkdtempSync(join(tmpdir(), 'stayput-')), 'slide.gif');
  writeFileSync(file, gif.bytes());
  return file;
}

/** Pillow's view of an animated GIF: frame count, size, loop, total time, and how far frame k differs from another GIF's frame k. */
function gifCompare(a: Uint8Array, original: string, k: number): { frames: number; size: number[]; loop: number; duration: number; diff: number } {
  const dir = mkdtempSync(join(tmpdir(), 'stayput-'));
  const file = join(dir, 'out.gif');
  writeFileSync(file, a);
  const script = [
    'import sys,json',
    'from PIL import Image,ImageChops,ImageStat',
    'a=Image.open(sys.argv[1]);b=Image.open(sys.argv[2]);k=int(sys.argv[3])',
    'dur=0',
    'for i in range(a.n_frames):',
    '  a.seek(i);dur+=a.info.get("duration",0)',
    'a.seek(k);b.seek(k)',
    'x=a.convert("RGB");y=b.convert("RGB").resize(x.size)',
    'd=sum(ImageStat.Stat(ImageChops.difference(x,y)).mean)/3',
    'print(json.dumps({"frames":a.n_frames,"size":list(a.size),"loop":a.info.get("loop",-1),"duration":dur,"diff":d}))',
  ].join('\n');
  return JSON.parse(execFileSync('python3', ['-c', script, file, original, String(k)], { encoding: 'utf8' }));
}

test('Compress GIF keeps only what changes, plays the same, and no bytes leave the tab', async ({ page }) => {
  const errors = await open(page, 'compress-gif');
  const gif = await naiveGif();
  const net = watchNetwork(page);
  const { downloads } = await run(page, [gif], async () => {
    await page.locator('#level').selectOption('light');
  });
  expect(downloads[0]!.suggestedFilename()).toBe('slide-compressed.gif');
  const light = await bytesOf(downloads[0]!);
  expect(light.length).toBeLessThan(readFileSync(gif).length * 0.5);
  const l = gifCompare(light, gif, 12);
  expect(l).toMatchObject({ frames: 24, size: [240, 160], loop: 0, duration: 24 * 80 });
  expect(l.diff).toBeLessThan(2);
  await expect(page.locator('#results-list .result-item')).toContainText('24 frames');
  net.assertNothingLeft(['slide.gif']);

  // Medium is smaller still and looks nearly the same.
  await page.reload();
  const medium = await bytesOf((await run(page, [gif])).downloads[0]!);
  expect(medium.length).toBeLessThan(light.length);
  expect(gifCompare(medium, gif, 12).diff).toBeLessThan(6);
  expect(errors).toEqual([]);
});

test('Compress GIF halves the size and drops frames without changing the timing, and refuses a PNG', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/reduce-gif-size');
  await expect(page.locator('#level')).toHaveValue('strong');
  const gif = await naiveGif();
  const { downloads } = await run(page, [gif], async () => {
    await page.locator('#scale').selectOption('0.5');
    await page.locator('#frames').selectOption('2');
  });
  const small = await bytesOf(downloads[0]!);
  const s = gifCompare(small, gif, 0);
  expect(s).toMatchObject({ frames: 12, size: [120, 80], loop: 0, duration: 24 * 80 });
  expect(small.length).toBeLessThan(readFileSync(gif).length * 0.2);
  await expect(page.locator('#results-list .result-item')).toContainText('12 of 24 frames');
  await page.reload();
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles({ name: 'photo.gif', mimeType: 'image/gif', buffer: readFileSync(fx('swatches.png')) });
  await page.locator('#run').click();
  await expect(page.locator('#error')).toContainText('This file is not a GIF.');
});

test('Compress GIF hands back a GIF that is already tight unchanged', async ({ page }) => {
  await open(page, 'compress-gif');
  const { downloads } = await run(page, ['anim.gif'], async () => {
    await page.locator('#level').selectOption('light');
  });
  const out = await bytesOf(downloads[0]!);
  const original = readFileSync(fx('anim.gif'));
  expect(out.length).toBeLessThanOrEqual(original.length);
  expect(gifCompare(out, fx('anim.gif'), 2)).toMatchObject({ frames: 3, duration: 1000 });
  if (out.length === original.length) await expect(page.locator('#results-list .result-item')).toContainText('original kept');
});

test('Crop video cuts the picture to the box, snaps to 9:16 on the TikTok page, and no bytes leave the tab', async ({ page }) => {
  const errors = await open(page, 'crop-video');
  const clip = await halvesClip(page);
  const net = watchNetwork(page);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(clip);
  await expect(page.locator('#crop-panel')).toBeVisible();
  // The whole frame is not a crop.
  await page.locator('#run').click();
  await expect(page.locator('#error')).toContainText('covers the whole video');
  // The top left quarter: red, with the white mark in its corner.
  for (const [id, v] of [['crop-w', '320'], ['crop-h', '180']] as const) {
    await page.locator(`#${id}`).fill(v);
    await page.locator(`#${id}`).dispatchEvent('change');
  }
  await expect(page.locator('#crop-panel')).toHaveAttribute('data-rect', '0,0,320,180');
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.locator('#run').click()]);
  expect(download.suggestedFilename()).toBe('halves-cropped.mp4');
  const quarter = await frameColours(page, await bytesOf(download), [[0.1, 0.1], [0.5, 0.7], [0.95, 0.9]]);
  expect(quarter).toMatchObject({ width: 320, height: 180, at: ['white', 'red', 'red'] });
  net.assertNothingLeft(['halves.webm']);

  await stubAnalytics(page);
  await page.goto('/crop-video-for-tiktok');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(clip);
  // The tallest 9:16 box, centred: 203 wide from x 219, across the red and blue halves.
  await expect(page.locator('#crop-panel')).toHaveAttribute('data-rect', '219,0,203,360');
  const [tall] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.locator('#run').click()]);
  const vertical = await frameColours(page, await bytesOf(tall), [[0.1, 0.5], [0.9, 0.5]]);
  expect(vertical).toMatchObject({ width: 204, height: 360, at: ['red', 'blue'] });
  expect(errors.filter((e) => !e.includes('covers the whole video'))).toEqual([]);
});

/** How long the picture lasts (end of the last video packet), which can differ from the sound in a recording. */
async function videoSeconds(bytes: Uint8Array): Promise<number> {
  const { Input, BufferSource, ALL_FORMATS, EncodedPacketSink } = await import('mediabunny');
  const input = new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS });
  const track = (await input.getPrimaryVideoTrack())!;
  const first = await track.getFirstTimestamp();
  let end = 0;
  for await (const p of new EncodedPacketSink(track).packets()) end = Math.max(end, p.timestamp + p.duration);
  return end - first;
}

/** Length and main pitch (by zero crossings) of a file's sound, decoded in the page. */
async function soundOf(page: Page, bytes: Uint8Array): Promise<{ seconds: number; hz: number }> {
  // Base64, not a number array: a 3 MB clip as JSON numbers takes tens of seconds to pass in.
  return page.evaluate(async (b64) => {
    const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const ctx = new OfflineAudioContext(1, 1, 48000);
    const buf = await ctx.decodeAudioData(data.buffer);
    const ch = buf.getChannelData(0);
    // Skip the edges, where encoders fade in and out.
    const a = Math.floor(ch.length * 0.2);
    const b = Math.floor(ch.length * 0.8);
    let crossings = 0;
    for (let i = a + 1; i < b; i++) if (ch[i - 1]! < 0 && ch[i]! >= 0) crossings++;
    return { seconds: buf.duration, hz: crossings / ((b - a) / buf.sampleRate) };
  }, Buffer.from(bytes).toString('base64'));
}

test('Change video speed halves the length at 2×, keeps the pitch of the sound, and no bytes leave the tab', async ({ page }) => {
  const errors = await open(page, 'video-speed');
  const clip = await recordClip(page);
  const before = await soundOf(page, readFileSync(clip));
  const net = watchNetwork(page);
  const { downloads } = await run(page, [clip]);
  expect(downloads[0]!.suggestedFilename()).toBe('recording-2x.mp4');
  const mp4 = await bytesOf(downloads[0]!);
  const tracks = await videoTracks(mp4);
  expect(tracks.video).toMatchObject({ width: 1280, height: 720 });
  expect(tracks.audio).toBe(1);
  // Headless recordings can hold fewer seconds of picture than of sound; each is checked against its own.
  const pictureBefore = await videoSeconds(readFileSync(clip));
  const picture = await videoSeconds(mp4);
  expect(picture).toBeGreaterThan(pictureBefore / 2 - 0.1);
  expect(picture).toBeLessThan(pictureBefore / 2 + 0.1);
  const after = await soundOf(page, mp4);
  expect(after.seconds).toBeGreaterThan(before.seconds / 2 - 0.25);
  expect(after.seconds).toBeLessThan(before.seconds / 2 + 0.25);
  // Same note, not an octave up.
  expect(Math.abs(after.hz - before.hz)).toBeLessThan(before.hz * 0.05);
  await expect(page.locator('#results-list .result-item')).toContainText('2× speed');
  net.assertNothingLeft(['recording.webm']);
  expect(errors).toEqual([]);
});

test('Slow down video doubles the length at 0.5× and can drop the sound', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/slow-down-video');
  await expect(page.locator('#speed')).toHaveValue('0.5');
  const clip = await recordClip(page);
  const { downloads } = await run(page, [clip], async () => {
    await choose(page.locator('#mute'));
  });
  const mp4 = await bytesOf(downloads[0]!);
  expect((await videoTracks(mp4)).audio).toBe(0);
  const pictureBefore = await videoSeconds(readFileSync(clip));
  const picture = await videoSeconds(mp4);
  expect(picture).toBeGreaterThan(pictureBefore * 2 - 0.15);
  expect(picture).toBeLessThan(pictureBefore * 2 + 0.15);
});

test('Merge videos joins clips in order into one MP4 the size of the first, with sound, and no bytes leave the tab', async ({ page }) => {
  const errors = await open(page, 'merge-videos');
  const halves = await halvesClip(page);
  const clip = await recordClip(page);
  const net = watchNetwork(page);
  const { downloads } = await run(page, [halves, clip]);
  expect(downloads[0]!.suggestedFilename()).toBe('merged.mp4');
  const mp4 = await bytesOf(downloads[0]!);
  const tracks = await videoTracks(mp4);
  // The first clip sets the size; the 1280x720 recording is fitted inside it.
  expect(tracks.video).toMatchObject({ width: 640, height: 360 });
  // The second clip's sound comes through, after the silent first clip.
  expect(tracks.audio).toBe(1);
  const expected = (await videoSeconds(readFileSync(halves))) + (await videoSeconds(readFileSync(clip)));
  const picture = await videoSeconds(mp4);
  expect(picture).toBeGreaterThan(expected - 0.15);
  expect(picture).toBeLessThan(expected + 0.15);
  await expect(page.locator('#results-list .result-item')).toContainText('2 videos joined');
  net.assertNothingLeft(['halves.webm', 'recording.webm']);
  expect(errors).toEqual([]);
});

test('Add audio to video lays a song under a silent video, looped to its length, with the picture copied, and no bytes leave the tab', async ({ page }) => {
  const errors = await open(page, 'add-audio-to-video');
  const song = staticFx('song.mp3');
  const clip = staticFx('clip.webm');
  const before = await soundOf(page, readFileSync(song));
  const net = watchNetwork(page);
  // The song goes first: the tool works out which file is the video.
  const { downloads } = await run(page, [song, clip]);
  expect(downloads[0]!.suggestedFilename()).toBe('clip-with-audio.webm');
  const out = await bytesOf(downloads[0]!);
  const tracks = await videoTracks(out);
  expect(tracks.video?.codec).toBe('vp8');
  expect(tracks.audio).toBe(1);
  const picture = await videoSeconds(out);
  expect(Math.abs(picture - (await videoSeconds(readFileSync(clip))))).toBeLessThan(0.05);
  const after = await soundOf(page, out);
  // The 1 s song is repeated to fill the 3 s video, at the same note.
  expect(after.seconds).toBeGreaterThan(picture - 0.2);
  expect(after.seconds).toBeLessThan(picture + 0.2);
  expect(Math.abs(after.hz - before.hz)).toBeLessThan(before.hz * 0.05);
  await expect(page.locator('#results-list .result-item')).toContainText('sound looped');
  net.assertNothingLeft(['song.mp3', 'clip.webm']);
  expect(errors).toEqual([]);
});

test('Add music to video can keep the video’s own sound under the song', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/add-music-to-video');
  const rec = await recordClip(page);
  const { downloads } = await run(page, [rec, staticFx('song.mp3')], async () => {
    await page.locator('#mode').selectOption('mix');
  });
  const out = await bytesOf(downloads[0]!);
  const tracks = await videoTracks(out);
  expect(tracks.audio).toBe(1);
  expect(tracks.video?.codec).toBe('vp8');
  await expect(page.locator('#results-list .result-item')).toContainText('mixed in song.mp3');
});

/** A WebM that starts black and ends white, so a reversed copy can be told apart. */
async function fadeClip(page: Page): Promise<string> {
  const bytes = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 180;
    const ctx = c.getContext('2d')!;
    // Frames are pushed by hand and the clip holds black at the start and white at the end,
    // so a busy CI machine that drops frames still records a dark first and a bright last frame.
    const stream = c.captureStream(0);
    const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
    const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 1e6 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    const paint = (v: number) => {
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(0, 0, 320, 180);
      track.requestFrame();
    };
    paint(0);
    rec.start();
    const t0 = performance.now();
    await new Promise<void>((done) => {
      const frame = () => {
        const t = performance.now() - t0;
        // 250 ms black, a 1 s fade, then 250 ms white.
        paint(Math.round(255 * Math.min(1, Math.max(0, (t - 250) / 1000))));
        if (t < 1500) setTimeout(frame, 33);
        else done();
      };
      frame();
    });
    rec.stop();
    await new Promise((r) => (rec.onstop = r));
    return [...new Uint8Array(await new Blob(chunks).arrayBuffer())];
  });
  const file = join(mkdtempSync(join(tmpdir(), 'stayput-')), 'fade.webm');
  writeFileSync(file, Buffer.from(bytes));
  return file;
}

/** Brightness (0 to 255) of the first and last frames, read through a video element. */
async function firstAndLastBrightness(page: Page, bytes: Uint8Array, type: string): Promise<[number, number]> {
  return page.evaluate(async ({ b64, type }) => {
    const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const v = document.createElement('video');
    v.muted = true;
    v.src = URL.createObjectURL(new Blob([data], { type }));
    await new Promise((ok, bad) => { v.onloadeddata = ok; v.onerror = () => bad(new Error('video will not load')); });
    if (!Number.isFinite(v.duration)) {
      // MediaRecorder WebMs have no duration until the end has been seen.
      v.currentTime = 1e6;
      await new Promise((ok) => (v.ondurationchange = ok));
    }
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext('2d')!;
    const at = async (t: number) => {
      // 'seeked' can fire before the new frame is painted, so also wait for the frame itself
      // (or a short timeout when the seek lands on the frame already shown).
      await new Promise<void>((ok) => { v.onseeked = () => ok(); v.currentTime = t; });
      await new Promise<void>((ok) => { v.requestVideoFrameCallback(() => ok()); setTimeout(ok, 300); });
      ctx.drawImage(v, 0, 0);
      return ctx.getImageData(c.width >> 1, c.height >> 1, 1, 1).data[0]!;
    };
    return [await at(0), await at(Math.max(0, v.duration - 0.02))] as [number, number];
  }, { b64: Buffer.from(bytes).toString('base64'), type });
}

test('Reverse video plays the clip backwards and no bytes leave the tab', async ({ page }) => {
  const errors = await open(page, 'reverse-video');
  const clip = await fadeClip(page);
  const src = readFileSync(clip);
  const [srcFirst, srcLast] = await firstAndLastBrightness(page, src, 'video/webm');
  expect(srcLast - srcFirst).toBeGreaterThan(20);
  const net = watchNetwork(page);
  const { downloads } = await run(page, [clip]);
  expect(downloads[0]!.suggestedFilename()).toBe('fade-reversed.mp4');
  const mp4 = await bytesOf(downloads[0]!);
  expect((await videoTracks(mp4)).video).toMatchObject({ width: 320, height: 180 });
  expect(Math.abs((await videoSeconds(mp4)) - (await videoSeconds(src)))).toBeLessThan(0.1);
  const [first, last] = await firstAndLastBrightness(page, mp4, 'video/mp4');
  // Now it starts bright and ends dark.
  expect(Math.abs(first - srcLast)).toBeLessThan(12);
  expect(Math.abs(last - srcFirst)).toBeLessThan(12);
  net.assertNothingLeft(['fade.webm']);
  expect(errors).toEqual([]);
});

test('Video to JPG saves one full-size frame a second and no bytes leave the tab', async ({ page }) => {
  const errors = await open(page, 'video-to-jpg');
  const clip = staticFx('clip.webm');
  const { video } = await videoTracks(readFileSync(clip));
  const net = watchNetwork(page);
  const { items } = await run(page, [clip]);
  // clip.webm lasts just under 3 seconds: frames at 0, 1 and 2 s.
  expect(items).toBe(3);
  const files = await zipAll(page);
  expect(Object.keys(files).sort()).toEqual(['clip-0001.jpg', 'clip-0002.jpg', 'clip-0003.jpg']);
  expect(jpegSize(files['clip-0002.jpg']!)).toEqual({ width: video!.width, height: video!.height });
  // The frame on screen at 1 s, stamped with its own start time.
  await expect(page.locator('#results-list .result-item').nth(1)).toContainText(/at 0:0(0\.9\d|1\.0\d)/);
  net.assertNothingLeft(['clip.webm']);
  expect(errors).toEqual([]);
});

test('Extract frames from video can save every frame, and Video to PNG saves PNGs', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/extract-frames-from-video');
  const clip = staticFx('clip.webm');
  const { Input, BufferSource, ALL_FORMATS, EncodedPacketSink } = await import('mediabunny');
  const input = new Input({ source: new BufferSource(readFileSync(clip)), formats: ALL_FORMATS });
  let packets = 0;
  for await (const _ of new EncodedPacketSink((await input.getPrimaryVideoTrack())!).packets(undefined, undefined, { metadataOnly: true })) packets++;
  const { items } = await run(page, [clip], async () => {
    await page.locator('#every').selectOption('all');
  });
  expect(items).toBe(packets);

  await page.goto('/video-to-png');
  await expect(page.locator('#format')).toHaveValue('image/png');
  const png = await run(page, [clip]);
  expect(png.items).toBe(10);
  const files = await zipAll(page);
  expect([...files['clip-0001.png']!.subarray(1, 4)].map((c) => String.fromCharCode(c)).join('')).toBe('PNG');
});

test('Remove background cuts out the subject at full size with a model served by the site', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = await open(page, 'remove-background');
  const net = watchNetwork(page);
  const requested: string[] = [];
  page.on('request', (r) => requested.push(new URL(r.url()).pathname));
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  // JPG has no transparency, so it is only offered with a background colour.
  await expect(page.locator('#format option[value="image/jpeg"]')).toBeDisabled();
  await page.locator('#file-input').setInputFiles([staticFx('face.jpg')]);
  const downloads: Download[] = [];
  page.on('download', (d) => downloads.push(d));
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 180_000 });
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  await expect.poll(() => downloads.length, { timeout: 10_000 }).toBe(1);
  expect(downloads[0]!.suggestedFilename()).toBe('face-no-bg.png');
  const png = await bytesOf(downloads[0]!);
  // The portrait is 410x512: the cut-out keeps its size.
  expect(pngSize(png)).toEqual({ width: 410, height: 512 });
  // Curtains and flags in the corners are gone; the suit and face are kept.
  expect((await pixelAt(page, png, 8, 8))[3]).toBe(0);
  expect((await pixelAt(page, png, 400, 60))[3]).toBe(0);
  expect((await pixelAt(page, png, 200, 350))[3]).toBe(255);
  expect((await pixelAt(page, png, 205, 110))[3]).toBe(255);
  // The model and runtime come from this site, and nothing carries the photo out.
  expect(requested).toContain('/models/isnet-general-use-int8w.onnx');
  expect(requested.some((u) => u.startsWith('/vendor/onnxruntime-web@') && u.endsWith('.wasm'))).toBe(true);

  // On white, saved as JPG: the corners are white and the model is not fetched again.
  await choose(page.locator('input[name="bg"][value="white"]'));
  await expect(page.locator('#format option[value="image/jpeg"]')).toBeEnabled();
  await page.locator('#format').selectOption('image/jpeg');
  const before = requested.filter((u) => u.endsWith('.onnx')).length;
  const [white] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }), page.locator('#run').click()]);
  expect(white.suggestedFilename()).toBe('face-no-bg.jpg');
  const jpg = await bytesOf(white);
  const corner = await pixelAt(page, jpg, 8, 8);
  expect(Math.min(...corner.slice(0, 3))).toBeGreaterThan(245);
  expect(requested.filter((u) => u.endsWith('.onnx')).length).toBe(before);
  net.assertNothingLeft(['face.jpg']);
  expect(errors).toEqual([]);
});

test('Passport photo maker crops a 2x2 photo with the head in range and a 4x6 print sheet, and no bytes leave the tab', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = await open(page, 'passport-photo');
  const net = watchNetwork(page);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles([staticFx('face.jpg')]);
  await choose(page.locator('input[name="bg"][value="white"]'));
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 180_000 });
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  const files = await zipAll(page);
  const photo = files['face-passport.jpg']!;
  const sheet = files['face-passport-4x6-print.jpg']!;
  // 2 x 2 inches at 600 pixels per inch.
  expect(jpegSize(photo)).toEqual({ width: 1200, height: 1200 });
  const s = jpegSize(sheet);
  expect([s.width, s.height].sort()).toEqual([1200, 1800]);
  // White background above the head and in the corners; the face is in the middle.
  for (const [x, y] of [[20, 20], [1180, 20], [600, 40]] as const) {
    expect(Math.min(...(await pixelAt(page, photo, x, y)).slice(0, 3))).toBeGreaterThan(235);
  }
  const face = await pixelAt(page, photo, 600, 560);
  expect(Math.min(...face.slice(0, 3))).toBeLessThan(235);
  // Head height: first non-white row down the centre line sits between 5% and 25% of the height.
  const top = await page.evaluate(async (b64) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const bmp = await createImageBitmap(new Blob([arr]));
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    const g = c.getContext('2d')!;
    g.drawImage(bmp, 0, 0);
    const d = g.getImageData(600, 0, 1, bmp.height).data;
    for (let y = 0; y < bmp.height; y++) if (Math.min(d[y * 4]!, d[y * 4 + 1]!, d[y * 4 + 2]!) < 200) return y;
    return -1;
  }, Buffer.from(photo).toString('base64'));
  expect(top).toBeGreaterThan(60);
  expect(top).toBeLessThan(300);

  // 35 x 45 mm: eight copies fit on the 4 x 6 sheet, four across two rows.
  await page.locator('#size').selectOption('eu');
  await page.locator('#run').click();
  await expect(page.locator('#results')).toContainText('8 copies', { timeout: 60_000 });
  const eu = await zipAll(page);
  expect(jpegSize(eu['face-passport.jpg']!)).toEqual({ width: 827, height: 1063 });
  net.assertNothingLeft(['face.jpg']);
  // MediaPipe logs its CPU delegate to the console as an "error".
  expect(errors.filter((e) => !e.includes('XNNPACK'))).toEqual([]);
});

test('Remove background keeps a whole pet and drops background specks', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = await open(page, 'remove-background');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  const cut = async (name: string, keep = '0') => {
    await page.reload();
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    await page.locator('#file-input').setInputFiles([staticFx(name)]);
    await choose(page.locator(`input[name="keep"][value="${keep}"]`));
    const [d] = await Promise.all([page.waitForEvent('download', { timeout: 180_000 }), page.locator('#run').click()]);
    const png = await bytesOf(d);
    return png;
  };
  const alpha = async (png: Uint8Array, x: number, y: number) => (await pixelAt(page, png, x, y))[3]!;
  /** Pixels in the top rows that are not fully transparent: specks of trees and sky. */
  const specks = (png: Uint8Array, rows: number) =>
    page.evaluate(
      async ([b64, h]) => {
        const bin = atob(b64 as string);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        const bmp = await createImageBitmap(new Blob([arr]));
        const c = document.createElement('canvas');
        c.width = bmp.width;
        c.height = h as number;
        const g = c.getContext('2d')!;
        g.drawImage(bmp, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i]! > 8) n++;
        return n;
      },
      [Buffer.from(png).toString('base64'), rows] as const,
    );
  // A small pug in a sweater against sunlit trees: the sweater stays solid and the trees go.
  const pug = await cut('pug.jpg');
  expect(await alpha(pug, 330, 310)).toBeGreaterThan(240);
  expect(await alpha(pug, 20, 20)).toBe(0);
  expect(await alpha(pug, 600, 50)).toBe(0);
  expect(await specks(pug, 200)).toBe(0);
  // A puppy held by someone in a blue top: the whole puppy is kept, the person is not.
  const frenchie = await cut('frenchie.jpg');
  expect(await alpha(frenchie, 300, 380)).toBeGreaterThan(240);
  expect(await alpha(frenchie, 240, 300)).toBeGreaterThan(240);
  expect(await alpha(frenchie, 520, 200)).toBe(0);
  expect(await alpha(frenchie, 20, 20)).toBe(0);
  // Keep more still leaves the background clean.
  const more = await cut('pug.jpg', '1');
  expect(await alpha(more, 330, 310)).toBeGreaterThan(240);
  expect(await specks(more, 200)).toBe(0);
  expect(errors).toEqual([]);
});

test('Watermark image draws the text over the whole photo at full size, and no bytes leave the tab', async ({ page }) => {
  const errors = await open(page, 'watermark-image');
  const net = watchNetwork(page);
  const { downloads } = await run(page, ['photo.jpg'], async () => {
    await expect(page.locator('#wm-panel')).toBeVisible();
    await page.locator('#wm-text').fill('SAMPLE');
    await choose(page.locator('input[name="layout"][value="tiled"]'));
    await page.locator('#wm-opacity').fill('100');
    await page.locator('#wm-color').evaluate((el: HTMLInputElement) => {
      el.value = '#ff0000';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.locator('#format').selectOption('image/png');
  });
  expect(downloads[0]!.suggestedFilename()).toBe('photo-watermarked.png');
  const png = await bytesOf(downloads[0]!);
  // Full size, turned upright by the photo's orientation tag.
  expect(pngSize(png)).toEqual({ width: 1200, height: 1600 });
  // Pure red text is spread over every quarter of the photo.
  const quarters = await page.evaluate(async (b64) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const bmp = await createImageBitmap(new Blob([arr]));
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    const g = c.getContext('2d')!;
    g.drawImage(bmp, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const q = [0, 0, 0, 0];
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        if (d[i]! > 240 && d[i + 1]! < 20 && d[i + 2]! < 20) q[(y < c.height / 2 ? 0 : 2) + (x < c.width / 2 ? 0 : 1)]!++;
      }
    }
    return q.map((n) => n / ((c.width * c.height) / 4));
  }, Buffer.from(png).toString('base64'));
  for (const share of quarters) expect(share).toBeGreaterThan(0.01);
  net.assertNothingLeft(['photo.jpg']);
  expect(errors).toEqual([]);
});

test('Watermark PDF stamps every page, keeps the text, and no bytes leave the tab', async ({ page }) => {
  const errors = await open(page, 'watermark-pdf');
  const net = watchNetwork(page);
  const source = readFileSync(fx('rotated.pdf'));
  const before = await PDFDocument.load(source);
  const { downloads } = await run(page, ['rotated.pdf'], async () => {
    await expect(page.locator('#wm-panel')).toBeVisible();
    await expect(page.locator('#wm-hint')).toContainText(`all ${before.getPageCount()} page`);
    await page.locator('#wm-text').fill('DRAFT');
  });
  expect(downloads[0]!.suggestedFilename()).toBe('rotated-watermarked.pdf');
  const out = await bytesOf(downloads[0]!);
  const doc = await PDFDocument.load(out);
  expect(doc.getPageCount()).toBe(before.getPageCount());
  for (const [i, p] of doc.getPages().entries()) {
    // Same size and rotation, and one more image than before on every page.
    expect(p.getSize()).toEqual(before.getPage(i).getSize());
    expect(p.getRotation().angle).toBe(before.getPage(i).getRotation().angle);
    const xobjects = (pg: typeof p) => (pg.node.Resources()?.lookupMaybe(PDFName.of('XObject'), Object as never) as { keys(): unknown[] } | undefined)?.keys().length ?? 0;
    expect(xobjects(p)).toBe(xobjects(before.getPage(i)) + 1);
  }
  // The original text is still there to select and search.
  const was = (await textItems(new Uint8Array(source), 1)).map((t) => t.str).join('');
  const now = (await textItems(out, 1)).map((t) => t.str).join('');
  expect(now).toBe(was);
  net.assertNothingLeft(['rotated.pdf']);
  expect(errors).toEqual([]);
});

test('Remove PDF metadata lists and strips author, XMP and file ID, keeps the pages, and no bytes leave the tab', async ({ page }) => {
  // A PDF with the kinds of metadata Word, Acrobat and Illustrator leave behind.
  const src = await PDFDocument.create({ updateMetadata: false });
  src.setTitle('Q3 layoffs draft');
  src.setAuthor('Jane Q. Whistle');
  src.setCreator('Microsoft Word for Microsoft 365');
  src.setProducer('Acrobat PDFMaker 23');
  src.setCreationDate(new Date('2026-03-04T10:00:00Z'));
  const p = src.addPage([300, 300]);
  const font = await src.embedFont('Helvetica');
  p.drawText('Visible text stays', { x: 20, y: 150, size: 14, font });
  const xmp = src.context.stream('<x:xmpmeta xmlns:x="adobe:ns:meta/"><dc:creator>Jane Q. Whistle</dc:creator></x:xmpmeta>', { Type: 'Metadata', Subtype: 'XML' });
  src.catalog.set(PDFName.of('Metadata'), src.context.register(xmp));
  p.node.set(PDFName.of('PieceInfo'), src.context.obj({ Illustrator: { Private: 'layer data by Jane' } }));
  src.context.trailerInfo.ID = src.context.obj([src.context.obj('abc'), src.context.obj('abc')]);
  const bytes = await src.save({ useObjectStreams: false });
  const dir = mkdtempSync(join(tmpdir(), 'meta-'));
  const file = join(dir, 'memo.pdf');
  writeFileSync(file, bytes);

  const errors = await open(page, 'remove-pdf-metadata');
  const net = watchNetwork(page);
  const { downloads } = await run(page, [file], async () => {
    const report = page.locator('#meta-report');
    await expect(report).toContainText('Author: Jane Q. Whistle');
    await expect(report).toContainText('Created with: Microsoft Word');
    await expect(report).toContainText('Created: 2026-03-04');
    await expect(report).toContainText('XMP metadata: 1 packet');
    await expect(report).toContainText('PieceInfo');
    await expect(report).toContainText('File ID: yes');
  });
  // Same name, so the file does not announce it was cleaned.
  expect(downloads[0]!.suggestedFilename()).toBe('memo.pdf');
  const out = await bytesOf(downloads[0]!);
  const doc = await PDFDocument.load(out, { updateMetadata: false });
  expect(doc.getAuthor()).toBeUndefined();
  expect(doc.getTitle()).toBeUndefined();
  expect(doc.getCreator()).toBeUndefined();
  expect(doc.getProducer()).toBeUndefined();
  expect(doc.catalog.get(PDFName.of('Metadata'))).toBeUndefined();
  expect(doc.getPage(0).node.get(PDFName.of('PieceInfo'))).toBeUndefined();
  expect(doc.context.trailerInfo.ID).toBeUndefined();
  // The name is gone from every byte of the file, not just unlinked.
  expect(Buffer.from(out).includes('Whistle')).toBe(false);
  expect(Buffer.from(out).includes('Jane')).toBe(false);
  expect((await textItems(out, 1)).map((t) => t.str).join('')).toBe('Visible text stays');
  net.assertNothingLeft(['memo.pdf']);
  expect(errors).toEqual([]);
});

test('Remove PDF metadata cleans restricted and scanned PDFs without losing pages', async ({ page }) => {
  const errors = await open(page, 'remove-pdf-metadata');
  const files = [staticFx('owner-locked.pdf'), fx('scan.pdf'), fx('article.pdf')];
  const { items } = await run(page, files);
  expect(items).toBe(3);
  const zipped = await zipAll(page);
  for (const f of files) {
    const name = f.split('/').pop()!;
    const pages = (await getDocument({ data: new Uint8Array(readFileSync(f)) }).promise).numPages;
    const after = await PDFDocument.load(zipped[name]!, { updateMetadata: false });
    expect(after.isEncrypted).toBe(false);
    expect(after.getPageCount()).toBe(pages);
    expect(after.getProducer()).toBeUndefined();
  }
  expect(errors).toEqual([]);
});

test('Sticker maker cuts out the subject with a white border, and makes a WhatsApp-ready WebP', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = await open(page, 'sticker-maker');
  const net = watchNetwork(page);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles([staticFx('pug.jpg')]);
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 180_000 }), page.locator('#run').click()]);
  expect(d.suggestedFilename()).toBe('pug-sticker.png');
  const png = await bytesOf(d);
  const { width, height } = pngSize(png);
  // Trimmed to the pug: much smaller than the 640 x 426 photo, taller than wide.
  expect(width).toBeLessThan(300);
  expect(height).toBeGreaterThan(width);
  // Corners are transparent; a white border runs round the subject.
  expect((await pixelAt(page, png, 1, 1))[3]).toBe(0);
  const edge = await page.evaluate(async (b64) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const bmp = await createImageBitmap(new Blob([arr]));
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    const g = c.getContext('2d')!;
    g.drawImage(bmp, 0, 0);
    // First opaque pixel along the middle row, from the left: the border.
    const y = Math.round(c.height * 0.6);
    const row = g.getImageData(0, y, c.width, 1).data;
    for (let x = 0; x < c.width; x++) if (row[x * 4 + 3]! > 250) return [...row.slice(x * 4 + 8, x * 4 + 12)];
    return [];
  }, Buffer.from(png).toString('base64'));
  expect(Math.min(...edge.slice(0, 3))).toBeGreaterThan(235);

  await page.reload();
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles([staticFx('pug.jpg')]);
  await page.locator('#size').selectOption('512');
  await page.locator('#format').selectOption('image/webp');
  const [w] = await Promise.all([page.waitForEvent('download', { timeout: 180_000 }), page.locator('#run').click()]);
  expect(w.suggestedFilename()).toBe('pug-sticker.webp');
  const webp = await bytesOf(w);
  expect(String.fromCharCode(...webp.subarray(8, 12))).toBe('WEBP');
  expect(webp.length).toBeLessThanOrEqual(100_000);
  const dims = await page.evaluate(async (b64) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const bmp = await createImageBitmap(new Blob([arr], { type: 'image/webp' }));
    return [bmp.width, bmp.height];
  }, Buffer.from(webp).toString('base64'));
  expect(dims).toEqual([512, 512]);
  net.assertNothingLeft(['pug.jpg']);
  expect(errors).toEqual([]);
});

test('Profile picture maker frames the face on a colour, as a circle, and no bytes leave the tab', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = await open(page, 'profile-picture-maker');
  const net = watchNetwork(page);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles([staticFx('face.jpg')]);
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 180_000 }), page.locator('#run').click()]);
  expect(d.suggestedFilename()).toBe('face-profile.png');
  const png = await bytesOf(d);
  expect(pngSize(png)).toEqual({ width: 1024, height: 1024 });
  // Circle: transparent corners; yellow background inside the circle beside the head.
  expect((await pixelAt(page, png, 4, 4))[3]).toBe(0);
  const bg = await pixelAt(page, png, 150, 300);
  expect(bg[3]).toBe(255);
  expect(Math.abs(bg[0]! - 0xf2) + Math.abs(bg[1]! - 0xc1) + Math.abs(bg[2]! - 0x4e)).toBeLessThan(12);
  // The face is in the middle, not background.
  const mid = await pixelAt(page, png, 512, 470);
  expect(Math.abs(mid[0]! - 0xf2) + Math.abs(mid[1]! - 0xc1) + Math.abs(mid[2]! - 0x4e)).toBeGreaterThan(60);
  net.assertNothingLeft(['face.jpg']);
  expect(errors.filter((e) => !e.includes('XNNPACK'))).toEqual([]);
});

test('Trim audio shows the waveform and cuts the chosen part to a WAV, and no bytes leave the tab', async ({ page }) => {
  const errors = await open(page, 'trim-audio');
  const net = watchNetwork(page);
  const song = staticFx('song.flac');
  const { downloads } = await run(page, [song], async () => {
    await expect(page.locator('#au-panel')).toBeVisible();
    await expect(page.locator('#au-panel')).toHaveAttribute('data-duration', /^1(\.0)?$/);
    await page.locator('#au-start').fill('0.2');
    await page.locator('#au-end').fill('0.8');
    await expect(page.locator('#au-estimate')).toContainText('Keeps 0:00.6');
    await page.locator('#format').selectOption('wav');
  });
  expect(downloads[0]!.suggestedFilename()).toBe('song-trimmed.wav');
  const wav = await bytesOf(downloads[0]!);
  const dv = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const channels = dv.getUint16(22, true);
  const rate = dv.getUint32(24, true);
  const seconds = dv.getUint32(40, true) / (channels * 2 * rate);
  expect(seconds).toBeCloseTo(0.6, 2);
  // The waveform was drawn.
  expect(await page.locator('#au-wave').evaluate((c: HTMLCanvasElement) => c.width)).toBeGreaterThan(0);
  net.assertNothingLeft(['song.flac']);
  expect(errors).toEqual([]);
});

test('MP3 cutter saves an MP3 of the chosen part, faded out by default', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/mp3-cutter');
  await expect(page.locator('#fade-out')).toBeChecked();
  const song = staticFx('song.mp3');
  const before = await soundOf(page, readFileSync(song));
  const { downloads } = await run(page, [song], async () => {
    await expect(page.locator('#au-panel')).toBeVisible();
    await page.locator('#au-end').fill('0.5');
  });
  expect(downloads[0]!.suggestedFilename()).toBe('song-trimmed.mp3');
  const after = await soundOf(page, await bytesOf(downloads[0]!));
  // MP3 frames pad the end by up to a few hundredths of a second.
  expect(after.seconds).toBeGreaterThan(0.48);
  expect(after.seconds).toBeLessThan(0.58);
  expect(Math.abs(after.hz - before.hz)).toBeLessThan(before.hz * 0.05);
  await expect(page.locator('#results-list .result-item')).toContainText('fade out');
});

test('Blur background keeps the subject sharp and softens the scene behind it', async ({ page }) => {
  test.setTimeout(240_000);
  await stubAnalytics(page);
  await page.goto('/blur-background');
  const net = watchNetwork(page);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles([staticFx('face.jpg')]);
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 180_000 }), page.locator('#run').click()]);
  expect(d.suggestedFilename()).toBe('face-blurred-bg.jpg');
  const out = await bytesOf(d);
  const src = readFileSync(staticFx('face.jpg'));
  // Local contrast in the flag stripes (top left) drops; the face keeps its detail.
  const contrast = (bytes: Uint8Array, x: number, y: number) =>
    page.evaluate(
      async ([b64, px, py]) => {
        const bin = atob(b64 as string);
        const arr = Uint8Array.from(bin, (c) => c.charCodeAt(0));
        const bmp = await createImageBitmap(new Blob([arr]));
        const c = document.createElement('canvas');
        c.width = bmp.width;
        c.height = bmp.height;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(bmp, 0, 0);
        const d = ctx.getImageData(px as number, py as number, 24, 24).data;
        let lo = 255;
        let hi = 0;
        for (let i = 0; i < d.length; i += 4) {
          const v = (d[i]! + d[i + 1]! + d[i + 2]!) / 3;
          lo = Math.min(lo, v);
          hi = Math.max(hi, v);
        }
        return hi - lo;
      },
      [Buffer.from(bytes).toString('base64'), x, y],
    );
  expect(await contrast(out, 10, 150)).toBeLessThan((await contrast(src, 10, 150)) * 0.6);
  expect(await contrast(out, 185, 110)).toBeGreaterThan((await contrast(src, 185, 110)) * 0.8);
  // Every pixel is opaque: a blurred scene, not a hole.
  expect((await pixelAt(page, out, 8, 8))[3]).toBe(255);
  net.assertNothingLeft(['face.jpg']);
});

test('Audio converter writes lossless FLAC at the source sample rate, and no bytes leave the tab', async ({ page }) => {
  const errors = await open(page, 'audio-converter');
  const net = watchNetwork(page);
  // tone.wav: 1.5 s of stereo 16-bit 48 kHz.
  const { items } = await run(page, ['tone.wav', staticFx('song.mp3')], async () => {
    await page.locator('#format').selectOption('flac');
    await expect(page.locator('#bitrate-field')).toBeHidden();
  });
  expect(items).toBe(2);
  const files = await zipAll(page);
  expect(Object.keys(files).sort()).toEqual(['song.flac', 'tone.flac']);
  const flac = files['tone.flac']!;
  expect(Buffer.from(flac.subarray(0, 4)).toString()).toBe('fLaC');
  // STREAMINFO: 20-bit sample rate at byte 18, then 3 bits of channels - 1.
  expect((flac[18]! << 12) | (flac[19]! << 4) | (flac[20]! >> 4)).toBe(48000);
  expect(((flac[20]! >> 1) & 7) + 1).toBe(2);
  const wav = readFileSync(fx('tone.wav'));
  expect(flac.length).toBeLessThan(wav.length);
  // Decoded, the FLAC holds the same samples as the WAV.
  const diff = await page.evaluate(
    async ([a, b]) => {
      const dec = async (b64: string) => new OfflineAudioContext(2, 1, 48000).decodeAudioData(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer);
      const [x, y] = await Promise.all([dec(a as string), dec(b as string)]);
      if (x.length !== y.length) return `length ${x.length} vs ${y.length}`;
      let worst = 0;
      for (let c = 0; c < 2; c++) {
        const p = x.getChannelData(c);
        const q = y.getChannelData(c);
        for (let i = 0; i < p.length; i++) worst = Math.max(worst, Math.abs(p[i]! - q[i]!));
      }
      return worst;
    },
    [Buffer.from(flac).toString('base64'), Buffer.from(wav).toString('base64')],
  );
  expect(diff).toBeLessThan(1 / 16000);
  const song = await soundOf(page, files['song.flac']!);
  expect(song.seconds).toBeGreaterThan(0.9);
  net.assertNothingLeft(['tone.wav', 'song.mp3']);
  expect(errors).toEqual([]);
});

test('Audio converter writes OGG Opus that keeps the pitch, and explains when M4A is not available', async ({ page }) => {
  const errors = await open(page, 'audio-converter');
  const before = await soundOf(page, readFileSync(staticFx('song.mp3')));
  const { downloads } = await run(page, [staticFx('song.mp3')], async () => {
    await page.locator('#format').selectOption('ogg');
    await expect(page.locator('#bitrate-field')).toBeVisible();
  });
  expect(downloads[0]!.suggestedFilename()).toBe('song.ogg');
  const ogg = await bytesOf(downloads[0]!);
  expect(Buffer.from(ogg.subarray(0, 4)).toString()).toBe('OggS');
  expect(Buffer.from(ogg).includes(Buffer.from('OpusHead'))).toBe(true);
  const after = await soundOf(page, ogg);
  expect(Math.abs(after.seconds - before.seconds)).toBeLessThan(0.05);
  expect(Math.abs(after.hz - before.hz)).toBeLessThan(before.hz * 0.05);
  await expect(page.locator('#results-list .result-item')).toContainText('OGG (Opus), 192 kbps');
  // This test browser has no AAC encoder, so choosing M4A says so up front.
  const aac = await page.evaluate(() => AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 }).then((r) => !!r.supported));
  await page.locator('#format').selectOption('m4a');
  if (aac) await expect(page.locator('#format-note')).toBeHidden();
  else await expect(page.locator('#format-note')).toContainText('cannot write M4A');
  expect(errors).toEqual([]);
});

test('WAV to FLAC opens with FLAC chosen', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/wav-to-flac');
  await expect(page.locator('#format')).toHaveValue('flac');
  await expect(page.locator('#format-note')).toContainText('keeps every sample');
});

test('QR code generator draws a code as you type and downloads PNG and SVG, and nothing typed leaves the tab', async ({ page }) => {
  const errors = await open(page, 'qr-code-generator');
  const net = watchNetwork(page);
  await expect(page.locator('#drop')).toBeHidden();
  await expect(page.locator('#qr-png')).toBeDisabled();
  await page.locator('#qr-text').fill('https://www.example.com/menu');
  await expect(page.locator('#qr-frame')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#qr-frame')).toHaveAttribute('data-version', '3');
  await expect(page.locator('#qr-info')).toContainText('29 × 29 squares');
  const [png] = await Promise.all([page.waitForEvent('download'), page.locator('#qr-png').click()]);
  expect(png.suggestedFilename()).toBe('example-com-qr-code.png');
  const bytes = await bytesOf(png);
  expect(pngSize(bytes)).toEqual({ width: 1024, height: 1024 });
  // 29 squares plus a 4-square border each side: the top-left finder's corner is dark, the border light.
  const unit = 1024 / 37;
  expect(await pixelAt(page, bytes, Math.round(unit * 4.5), Math.round(unit * 4.5))).toEqual([0, 0, 0, 255]);
  expect(await pixelAt(page, bytes, Math.round(unit * 2), Math.round(unit * 2))).toEqual([255, 255, 255, 255]);
  await page.locator('.qr-look summary').click();
  await page.locator('#qr-clear').check();
  const [svg] = await Promise.all([page.waitForEvent('download'), page.locator('#qr-svg').click()]);
  expect(svg.suggestedFilename()).toBe('example-com-qr-code.svg');
  const text = Buffer.from(await bytesOf(svg)).toString();
  expect(text).toContain('viewBox="0 0 37 37"');
  expect(text).not.toContain('<rect');
  // Swapping the colours so the code is lighter than its background warns.
  await page.locator('#qr-clear').uncheck();
  await page.locator('#qr-dark').fill('#ffffff');
  await page.locator('#qr-light').fill('#000000');
  await expect(page.locator('#qr-info')).toContainText('lighter than its background');
  net.assertNothingLeft(['example.com']);
  expect(errors).toEqual([]);
});

test('Wi-Fi QR code page opens on Wi-Fi and keeps the password in the page', async ({ page }) => {
  await stubAnalytics(page);
  const net = watchNetwork(page);
  await page.goto('/wifi-qr-code-generator');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('input[name="qr-kind"][value="wifi"]')).toBeChecked();
  await expect(page.locator('#qr-ssid')).toBeVisible();
  await expect(page.locator('#qr-text')).toBeHidden();
  await page.locator('#qr-ssid').fill('Guest Net');
  await page.locator('#qr-pass').fill('hunter2-secret');
  await expect(page.locator('#qr-frame')).toHaveAttribute('data-state', 'ready');
  const [png] = await Promise.all([page.waitForEvent('download'), page.locator('#qr-png').click()]);
  expect(png.suggestedFilename()).toBe('wifi-qr-code.png');
  // The usage ping says a Wi-Fi code was made, never what is in it.
  await expect.poll(() => page.evaluate(() => (window as unknown as { __events: { n: string; d: Record<string, string> }[] }).__events.filter((e) => e.n === 'tool_run').length)).toBe(1);
  const run = await page.evaluate(() => (window as unknown as { __events: { n: string; d: Record<string, string> }[] }).__events.find((e) => e.n === 'tool_run')!.d);
  expect(run.tool).toBe('wifi-qr-code-generator');
  expect(run.format).toBe('wifi-png');
  expect(JSON.stringify(run)).not.toContain('hunter2');
  net.assertNothingLeft(['hunter2-secret', 'Guest Net']);
});

/**
 * Stand in for the browser's screen picker: a moving canvas, and optionally a
 * tone as the shared sound, the way getDisplayMedia hands back a tab with audio.
 */
async function fakeScreen(page: Page, opts: { sound: boolean }) {
  await page.addInitScript((sound) => {
    navigator.mediaDevices.getDisplayMedia = async (constraints?: DisplayMediaStreamOptions) => {
      (window as unknown as { __asked: unknown }).__asked = constraints;
      const c = document.createElement('canvas');
      c.width = 640;
      c.height = 360;
      const ctx = c.getContext('2d')!;
      let t = 0;
      setInterval(() => {
        ctx.fillStyle = `hsl(${(t += 7) % 360},70%,50%)`;
        ctx.fillRect(0, 0, 640, 360);
      }, 30);
      const tracks: MediaStreamTrack[] = [...c.captureStream(30).getVideoTracks()];
      if (sound && constraints?.audio) {
        const ac = new AudioContext();
        const osc = ac.createOscillator();
        const dest = ac.createMediaStreamDestination();
        osc.connect(dest);
        osc.start();
        tracks.push(...dest.stream.getAudioTracks());
      }
      return new MediaStream(tracks);
    };
  }, opts.sound);
}

test('Screen recorder records the shared screen with its sound, and no bytes leave the tab', async ({ page }) => {
  await fakeScreen(page, { sound: true });
  const errors = await open(page, 'screen-recorder');
  const net = watchNetwork(page);
  await expect(page.locator('#drop')).toBeHidden();
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#rec-start').click();
  await expect(page.locator('#rec-screen')).toHaveAttribute('data-state', 'live');
  await expect(page.locator('#rec-stop')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __asked: DisplayMediaStreamOptions }).__asked.audio)).toBe(true);
  // Pause for a moment: the clock stops while paused.
  await page.waitForTimeout(1200);
  await page.locator('#rec-pause').click();
  await expect(page.locator('#rec-screen')).toHaveAttribute('data-state', 'paused');
  const paused = await page.locator('#rec-time').textContent();
  await page.waitForTimeout(1200);
  await expect(page.locator('#rec-time')).toHaveText(paused!);
  await page.locator('#rec-pause').click();
  await page.waitForTimeout(1000);
  await page.locator('#rec-stop').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 30_000 });
  await expect(page.locator('#rec-screen')).toHaveAttribute('data-state', 'done');
  await expect(page.locator('#rec-start')).toHaveText('Record again');
  const item = page.locator('#results-list .result-item');
  await expect(item).toHaveCount(1);
  await expect(item.locator('.name')).toHaveText(/^screen-recording-\d{4}-\d{2}-\d{2}-\d{4}\.(mp4|webm)$/);
  const [download] = await Promise.all([page.waitForEvent('download'), item.getByRole('button', { name: 'Download' }).click()]);
  const bytes = await bytesOf(download);
  const tracks = await videoTracks(bytes);
  expect(tracks.video).toMatchObject({ width: 640, height: 360 });
  expect(tracks.audio).toBe(1);
  // The length is written, so the file can be seeked; paused time is left out.
  const seconds = await videoSeconds(bytes);
  expect(seconds).toBeGreaterThan(1.5);
  expect(seconds).toBeLessThan(3.2);
  // The recording plays back on the page.
  await expect(page.locator('#rec-preview')).toHaveAttribute('src', /^blob:/);
  net.assertNothingLeft(['screen-recording']);
  expect(errors).toEqual([]);
});

test('Screen recorder says when no sound was shared, and the with-audio page ticks the microphone', async ({ page }) => {
  await fakeScreen(page, { sound: false });
  await page.context().grantPermissions(['microphone']);
  await stubAnalytics(page);
  await page.goto('/screen-recorder-with-audio');
  await expect(page.locator('#rec-mic')).toBeChecked();
  await expect(page.locator('#rec-system')).toBeChecked();
  await page.locator('#rec-mic').uncheck();
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#rec-start').click();
  await expect(page.locator('#rec-note')).toContainText('No sound was shared');
  await page.waitForTimeout(800);
  await page.locator('#rec-stop').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 30_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#results-list .result-item').getByRole('button', { name: 'Download' }).click()]);
  expect((await videoTracks(await bytesOf(download))).audio).toBe(0);
});

test('Voice recorder records the microphone to an MP3 that keeps the pitch, and no bytes leave the tab', async ({ page }) => {
  // Stand in for the microphone: a 440 Hz tone.
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
      (window as unknown as { __asked: unknown }).__asked = constraints;
      const ac = new AudioContext();
      const osc = ac.createOscillator();
      osc.frequency.value = 440;
      const dest = ac.createMediaStreamDestination();
      osc.connect(dest);
      osc.start();
      return dest.stream;
    };
  });
  const errors = await open(page, 'voice-recorder');
  const net = watchNetwork(page);
  await expect(page.locator('#drop')).toBeHidden();
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#vr-start').click();
  await expect(page.locator('#vr-deck')).toHaveAttribute('data-state', 'live');
  const asked = await page.evaluate(() => (window as unknown as { __asked: { audio: MediaTrackConstraints } }).__asked.audio);
  expect(asked.noiseSuppression).toBe(true);
  await page.waitForTimeout(1500);
  await page.locator('#vr-stop').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 30_000 });
  await expect(page.locator('#vr-audio')).toBeVisible();
  const item = page.locator('#results-list .result-item');
  await expect(item.locator('.name')).toHaveText(/^voice-recording-\d{4}-\d{2}-\d{2}-\d{4}\.mp3$/);
  await expect(item).toContainText('mono');
  const [download] = await Promise.all([page.waitForEvent('download'), item.getByRole('button', { name: 'Download' }).click()]);
  const mp3 = await bytesOf(download);
  const sound = await soundOf(page, mp3);
  expect(sound.seconds).toBeGreaterThan(1.1);
  expect(sound.seconds).toBeLessThan(2.2);
  expect(Math.abs(sound.hz - 440)).toBeLessThan(22);
  net.assertNothingLeft(['voice-recording']);
  expect(errors).toEqual([]);
});

test('Redact PDF removes the text under the boxes, keeps other pages, and no bytes leave the tab', async ({ page }) => {
  const errors = await open(page, 'redact-pdf');
  const net = watchNetwork(page);
  await page.locator('#file-input').setInputFiles([fx('text.pdf')]);
  await expect(page.locator('#redact-panel')).toBeVisible();
  await expect(page.locator('#page-label')).toHaveText('Page 1 of 3');
  // Search jumps to the first page with a match and marks it.
  await page.locator('#find-text').fill('page 2');
  await page.locator('#find-form button[type="submit"]').click();
  await expect(page.locator('#find-result')).toContainText('Marked 1 match');
  await expect(page.locator('#page-label')).toHaveText('Page 2 of 3');
  await expect(page.locator('.redact-box')).toHaveCount(1);
  // The box sits over the heading, near the top of the page.
  const stageBox = (await page.locator('#stage').boundingBox())!;
  const hit = (await page.locator('.redact-box').boundingBox())!;
  expect(hit.y - stageBox.y).toBeLessThan(stageBox.height * 0.2);
  expect(hit.width).toBeGreaterThan(20);
  // Draw a second box by hand.
  await page.locator('#stage').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const s = (await page.locator('#stage').boundingBox())!;
  await page.mouse.move(s.x + s.width * 0.5, s.y + s.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(s.x + s.width * 0.9, s.y + s.height * 0.4, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('.redact-box')).toHaveCount(2);
  await expect(page.locator('#box-count')).toHaveText('2 boxes on 1 page');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#run').click()]);
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 60_000 });
  expect(download.suggestedFilename()).toBe('text-redacted.pdf');
  const out = await bytesOf(download);
  // Page 2 has no text left; pages 1 and 3 are untouched.
  expect(await textItems(out, 2)).toEqual([]);
  expect((await textItems(out, 1)).map((t) => t.str).join(' ')).toContain('Page 1 of the fixture');
  expect((await textItems(out, 3)).map((t) => t.str).join(' ')).toContain('Page 3 of the fixture');
  // The old page 2 content is not left behind in the file as an orphan object.
  const doc = await PDFDocument.load(out, { updateMetadata: false });
  expect(doc.getPageCount()).toBe(3);
  const streams = doc.context
    .enumerateIndirectObjects()
    .filter(([, o]) => o instanceof PDFRawStream && o.dict.get(PDFName.of('Filter')) !== PDFName.of('DCTDecode'))
    .map(([, o]) => Buffer.from(decodePDFRawStream(o as PDFRawStream).decode()).toString('latin1').toLowerCase());
  const hex = (t: string) => Buffer.from(t, 'latin1').toString('hex');
  expect(streams.some((c) => c.includes(hex('Page 1')))).toBe(true);
  expect(streams.some((c) => c.includes(hex('Page 2')) || c.includes('page 2'))).toBe(false);
  expect(doc.context.trailerInfo.Info).toBeUndefined();
  net.assertNothingLeft(['text.pdf']);
  expect(errors).toEqual([]);
});

test('Redact PDF finds email addresses and long numbers', async ({ page }) => {
  await open(page, 'redact-pdf');
  const src = await PDFDocument.create();
  const font = await src.embedFont('Helvetica');
  const p = src.addPage([612, 792]);
  p.drawText('Contact: jane.doe@example.com', { x: 72, y: 700, size: 12, font });
  p.drawText('Account 1234 5678 9012 3456', { x: 72, y: 680, size: 12, font });
  p.drawText('Nothing to see on this line', { x: 72, y: 660, size: 12, font });
  const file = join(mkdtempSync(join(tmpdir(), 'redact-')), 'statement.pdf');
  writeFileSync(file, await src.save());
  await page.locator('#file-input').setInputFiles([file]);
  await expect(page.locator('#redact-panel')).toBeVisible();
  await page.locator('[data-pattern="email"]').click();
  await expect(page.locator('#find-result')).toContainText('Marked 1 match for email addresses');
  await page.locator('[data-pattern="number"]').click();
  await expect(page.locator('#find-result')).toContainText('Marked 1 match for long numbers');
  // Searching again adds nothing new.
  await page.locator('[data-pattern="email"]').click();
  await expect(page.locator('#find-result')).toContainText('No text matching email addresses');
  await expect(page.locator('.redact-box')).toHaveCount(2);
  // Tapping a box removes it.
  await page.locator('.redact-box').first().click();
  await expect(page.locator('.redact-box')).toHaveCount(1);
});

async function levels(page: Page, bytes: Uint8Array): Promise<{ seconds: number; peak: number; rms: number }> {
  return page.evaluate(async (b64) => {
    const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const buf = await new OfflineAudioContext(1, 1, 48000).decodeAudioData(data.buffer);
    const ch = buf.getChannelData(0);
    // Skip the edges, where encoders fade in and out.
    const a = Math.floor(ch.length * 0.2);
    const b = Math.floor(ch.length * 0.8);
    let peak = 0;
    let sum = 0;
    for (let i = a; i < b; i++) {
      peak = Math.max(peak, Math.abs(ch[i]!));
      sum += ch[i]! * ch[i]!;
    }
    return { seconds: buf.duration, peak, rms: Math.sqrt(sum / (b - a)) };
  }, Buffer.from(bytes).toString('base64'));
}

test('Volume booster makes a WAV twice as loud at +6 dB, keeps its format, and no bytes leave the tab', async ({ page }) => {
  const errors = await open(page, 'volume-booster');
  const net = watchNetwork(page);
  const before = await levels(page, readFileSync(fx('tone.wav')));
  const { downloads } = await run(page, ['tone.wav']);
  expect(downloads[0]!.suggestedFilename()).toBe('tone-louder.wav');
  const after = await levels(page, await bytesOf(downloads[0]!));
  expect(after.rms / before.rms).toBeCloseTo(2, 1);
  expect(after.seconds).toBeCloseTo(1.5, 2);
  await expect(page.locator('#results-list .result-item')).toContainText('+6.0 dB');
  net.assertNothingLeft(['tone.wav']);
  expect(errors).toEqual([]);
});

test('Volume booster limits a +20 dB boost instead of clipping', async ({ page }) => {
  const errors = await open(page, 'volume-booster');
  const { downloads } = await run(page, ['tone.wav'], async () => {
    await page.locator('#db').selectOption('20');
    await page.locator('#format').selectOption('flac');
  });
  expect(downloads[0]!.suggestedFilename()).toBe('tone-louder.flac');
  const after = await levels(page, await bytesOf(downloads[0]!));
  // Held at -1 dBFS (0.891), and much louder than the 0.37 peak it started at.
  expect(after.peak).toBeLessThan(0.9);
  expect(after.peak).toBeGreaterThan(0.85);
  await expect(page.locator('#results-list .result-item')).toContainText('of peaks eased');
  expect(errors).toEqual([]);
});

test('Normalize audio brings a quiet and a loud file to the same loudness', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/normalize-audio');
  await expect(page.locator('#db-field')).toBeHidden();
  const { items } = await run(page, ['tone.wav', staticFx('song.flac')]);
  expect(items).toBe(2);
  const files = await zipAll(page);
  expect(Object.keys(files).sort()).toEqual(['song-normalized.flac', 'tone-normalized.wav']);
  const a = await levels(page, files['tone-normalized.wav']!);
  const b = await levels(page, files['song-normalized.flac']!);
  const db = (x: number) => 20 * Math.log10(x);
  // The tone is stereo with a louder right side, so compare the loudness of the left channels loosely.
  expect(Math.abs(db(a.rms) - db(b.rms))).toBeLessThan(3);
  expect(db(a.rms)).toBeGreaterThan(-20);
});

test('Increase video volume copies the picture and turns up the sound', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/increase-video-volume');
  const net = watchNetwork(page);
  const src = readFileSync(staticFx('talk.webm'));
  const before = await levels(page, src);
  const { downloads } = await run(page, [staticFx('talk.webm')]);
  const name = downloads[0]!.suggestedFilename();
  expect(name).toMatch(/^talk-louder\.(webm|mp4)$/);
  const out = await bytesOf(downloads[0]!);
  const after = await levels(page, out);
  expect(after.rms).toBeGreaterThan(before.rms * 1.8);
  const tracks = await videoTracks(out);
  expect(tracks.video).not.toBeNull();
  await expect(page.locator('#results-list .result-item')).toContainText('picture copied');
  net.assertNothingLeft(['talk.webm']);
});

test('Crop PDF trims white margins page by page and crops to a drawn box, and no bytes leave the tab', async ({ page }) => {
  const errors = await open(page, 'crop-pdf');
  const net = watchNetwork(page);
  await page.locator('#file-input').setInputFiles([fx('text.pdf')]);
  await expect(page.locator('#crop-panel')).toBeVisible();
  // Running before choosing anything is an error, not a silent copy.
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/);
  await page.locator('#auto-trim').click();
  await expect(page.locator('#crop-result')).toContainText('Trimmed the white margins on 3 pages');
  await expect(page.locator('.crop-box')).toHaveCount(1);
  let [download] = await Promise.all([page.waitForEvent('download'), page.locator('#run').click()]);
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 60_000 });
  expect(download.suggestedFilename()).toBe('text-cropped.pdf');
  let doc = await PDFDocument.load(await bytesOf(download));
  expect(doc.getPageCount()).toBe(3);
  // Each fixture page holds a heading at y 700 and a box from x 60, y 100, 250 to 350 pt wide:
  // the crop hugs them with a small margin, so it differs page by page.
  for (const [i, p] of doc.getPages().entries()) {
    const c = p.getCropBox();
    expect(c.x).toBeGreaterThan(40);
    expect(c.x).toBeLessThan(60);
    expect(c.y).toBeGreaterThan(80);
    expect(c.y).toBeLessThan(100);
    expect(c.y + c.height).toBeLessThan(750);
    expect(c.x + c.width).toBeGreaterThan(Math.max(260 + (i + 1) * 50, 380));
    expect(c.x + c.width).toBeLessThan(480);
    expect(p.getMediaBox()).toEqual(c);
  }
  // The text inside the box is untouched.
  expect((await textItems(await bytesOf(download), 2)).map((t) => t.str).join(' ')).toContain('Page 2 of the fixture');

  // A drawn box on one page only.
  await page.locator('#crop-reset').click();
  await expect(page.locator('.crop-box')).toHaveCount(0);
  await choose(page.locator('input[name="crop-scope"][value="page"]'));
  await page.locator('#stage').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const s = (await page.locator('#stage').boundingBox())!;
  await page.mouse.move(s.x + s.width * 0.25, s.y + s.height * 0.25);
  await page.mouse.down();
  await page.mouse.move(s.x + s.width * 0.75, s.y + s.height * 0.5, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('#crop-count')).toContainText('1 page cropped');
  [download] = await Promise.all([page.waitForEvent('download'), page.locator('#run').click()]);
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 60_000 });
  doc = await PDFDocument.load(await bytesOf(download));
  const c = doc.getPage(0).getCropBox();
  expect(Math.abs(c.width - 612 * 0.5)).toBeLessThan(8);
  expect(Math.abs(c.height - 792 * 0.25)).toBeLessThan(8);
  expect(Math.abs(c.y - 792 * 0.5)).toBeLessThan(8);
  expect(doc.getPage(1).getCropBox().height).toBe(792);
  net.assertNothingLeft(['text.pdf']);
  expect(errors.filter((e) => !e.includes('Choose what to keep first'))).toEqual([]);
});

test('Merge audio joins files of different formats in order, with silence between, and no bytes leave the tab', async ({ page }) => {
  const errors = await open(page, 'merge-audio');
  const net = watchNetwork(page);
  const { downloads } = await run(page, [staticFx('song.flac'), 'tone.wav'], async () => {
    await page.locator('#between').selectOption('gap-1');
    await page.locator('#format').selectOption('wav');
    await expect(page.locator('#bitrate-field')).toBeHidden();
  });
  expect(downloads[0]!.suggestedFilename()).toBe('merged.wav');
  const wav = await bytesOf(downloads[0]!);
  const info = await audioInfo(page, wav);
  // 1 s + 1 s of silence + 1.5 s; the mono FLAC is spread to both channels to match the stereo WAV.
  expect(info.duration).toBeCloseTo(3.5, 1);
  expect(info.channels).toBe(2);
  const silent = await page.evaluate(async (arr) => {
    const buf = await new OfflineAudioContext(2, 1, 44100).decodeAudioData(new Uint8Array(arr).buffer);
    const d = buf.getChannelData(0);
    const peak = (from: number, to: number) => d.subarray(Math.round(from * 44100), Math.round(to * 44100)).reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    return { song: peak(0.2, 0.8), gap: peak(1.1, 1.9), tone: peak(2.2, 3.3) };
  }, Array.from(wav));
  expect(silent.gap).toBe(0);
  expect(silent.song).toBeGreaterThan(0.05);
  expect(silent.tone).toBeGreaterThan(0.05);
  await expect(page.locator('#results-list .result-item')).toContainText('2 files joined');
  net.assertNothingLeft(['song.flac', 'tone.wav']);
  expect(errors).toEqual([]);
});

test('Merge MP3 joins two MP3s into one MP3', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/merge-mp3');
  await expect(page.locator('#format')).toHaveValue('mp3');
  const { downloads } = await run(page, [staticFx('song.mp3'), staticFx('song.mp3')]);
  expect(downloads[0]!.suggestedFilename()).toBe('merged.mp3');
  const sound = await soundOf(page, await bytesOf(downloads[0]!));
  expect(sound.seconds).toBeGreaterThan(1.95);
  expect(sound.seconds).toBeLessThan(2.2);
});

test('Mic test shows the level and a verdict, plays back a short recording, and sends nothing', async ({ page }) => {
  // Stand in for the microphone: a tone at about -12 dBFS.
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
      (window as unknown as { __asked: unknown }).__asked = constraints;
      const ac = new AudioContext();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      gain.gain.value = 0.25;
      const dest = ac.createMediaStreamDestination();
      osc.connect(gain).connect(dest);
      osc.start();
      return dest.stream;
    };
  });
  const errors = await open(page, 'mic-test');
  const net = watchNetwork(page);
  await expect(page.locator('#drop')).toBeHidden();
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#mic-start').click();
  await expect(page.locator('#mic-panel')).toHaveAttribute('data-verdict', 'ok');
  await expect(page.locator('#mic-verdict')).toContainText('works');
  // The raw input is tested, without the browser's clean-up.
  const asked = await page.evaluate(() => (window as unknown as { __asked: { audio: MediaTrackConstraints } }).__asked.audio);
  expect(asked.noiseSuppression).toBe(false);
  expect(asked.autoGainControl).toBe(false);
  await expect(page.locator('#mic-db')).toContainText(/-1[0-9] dB peak/);
  await expect(page.locator('#mic-facts')).toBeVisible();
  await page.locator('#mic-record').click();
  await expect(page.locator('#mic-record')).toContainText('Recording');
  await expect(page.locator('#mic-audio')).toHaveAttribute('src', /^blob:/, { timeout: 10_000 });
  await expect(page.locator('#mic-record')).toBeEnabled();
  await page.locator('#mic-stop').click();
  await expect(page.locator('#mic-start')).toBeVisible();
  await expect(page.locator('#mic-note')).toContainText('microphone is off');
  // One anonymous usage event for a working test, with no device names in it.
  const runs = await page.evaluate(() => (window as unknown as { __events: { n: string; d: Record<string, string> }[] }).__events.filter((e) => e.n === 'tool_run'));
  expect(runs).toHaveLength(1);
  expect(runs[0]!.d.format).toBe('mic');
  net.assertNothingLeft([]);
  expect(errors).toEqual([]);
});

test('Grayscale PDF lays a saturation blend over every page, keeps the text, and no bytes leave the tab', async ({ page }) => {
  const errors = await open(page, 'grayscale-pdf');
  const net = watchNetwork(page);
  const { downloads } = await run(page, [fx('text.pdf')]);
  const download = downloads[0]!;
  expect(download.suggestedFilename()).toBe('text-grayscale.pdf');
  const out = await bytesOf(download);
  const doc = await PDFDocument.load(out);
  expect(doc.getPageCount()).toBe(3);
  for (const p of doc.getPages()) {
    const gs = p.node.Resources()!.lookup(PDFName.of('ExtGState')) as unknown as { values(): Parameters<typeof doc.context.lookup>[0][] };
    const modes = gs.values().map((v) => String(doc.context.lookup(v)));
    expect(modes.some((m) => m.includes('/BM /Saturation'))).toBe(true);
  }
  expect((await textItems(out, 2)).map((t) => t.str).join(' ')).toContain('Page 2 of the fixture');
  // The green box on the page now renders grey: draw the result in the crop tool's preview and read a pixel.
  const file = join(mkdtempSync(join(tmpdir(), 'gray-')), 'gray.pdf');
  writeFileSync(file, out);
  await page.goto('/tools/crop-pdf');
  await page.locator('#file-input').setInputFiles([file]);
  await expect(page.locator('#crop-panel')).toBeVisible();
  const px = await page.locator('#page-canvas').evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext('2d')!.getImageData(Math.round(c.width * 0.3), Math.round(c.height * 0.68), 1, 1).data;
    return [d[0]!, d[1]!, d[2]!];
  });
  expect(Math.max(...px) - Math.min(...px)).toBeLessThan(6);
  expect(px[0]).toBeLessThan(200);
  net.assertNothingLeft(['text.pdf']);
});

test('Webcam test shows the camera with its real resolution and frame rate, and saves a mirrored snapshot', async ({ page }) => {
  // Stand in for the camera: a 1280x720 canvas, red on the left half and blue on the right.
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const c = document.createElement('canvas');
      c.width = 1280;
      c.height = 720;
      const g = c.getContext('2d')!;
      setInterval(() => {
        g.fillStyle = '#ff0000';
        g.fillRect(0, 0, 640, 720);
        g.fillStyle = '#0000ff';
        g.fillRect(640, 0, 640, 720);
      }, 33);
      return c.captureStream(30);
    };
  });
  const errors = await open(page, 'webcam-test');
  const net = watchNetwork(page);
  await expect(page.locator('#drop')).toBeHidden();
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#cam-start').click();
  await expect(page.locator('#cam-panel')).toHaveAttribute('data-state', 'live');
  await expect(page.locator('#cam-res')).toHaveText('1280 × 720 (720p)');
  await expect(page.locator('#cam-aspect')).toHaveText('16:9');
  await expect(page.locator('#cam-fps')).toContainText('measured', { timeout: 10_000 });
  const [shot] = await Promise.all([page.waitForEvent('download'), page.locator('#cam-snap').click()]);
  expect(shot.suggestedFilename()).toMatch(/^webcam-\d{4}-\d{2}-\d{2}-\d{6}\.jpg$/);
  const jpg = await bytesOf(shot);
  expect(jpegSize(jpg)).toEqual({ width: 1280, height: 720 });
  // Mirrored like the preview: blue now on the left.
  const left = await pixelAt(page, jpg, 100, 360);
  expect(left[2]!).toBeGreaterThan(200);
  expect(left[0]!).toBeLessThan(60);
  await page.locator('#cam-stop').click();
  await expect(page.locator('#cam-start')).toBeVisible();
  net.assertNothingLeft([]);
  expect(errors).toEqual([]);
});

test('Audio to video makes an MP4 of the sound with the picture, and no bytes leave the tab', async ({ page }) => {
  const errors = await open(page, 'audio-to-video');
  const net = watchNetwork(page);
  const { downloads } = await run(page, ['tone.wav', 'swatches.png']);
  expect(downloads[0]!.suggestedFilename()).toBe('tone.mp4');
  const mp4 = await bytesOf(downloads[0]!);
  const tracks = await videoTracks(mp4);
  expect(tracks.video).toMatchObject({ width: 1920, height: 1080 });
  expect(tracks.audio).toBe(1);
  expect(await videoSeconds(mp4)).toBeCloseTo(1.5, 1);
  const sound = await soundOf(page, mp4);
  expect(sound.seconds).toBeCloseTo(1.5, 1);
  net.assertNothingLeft(['tone.wav', 'swatches.png']);
  expect(errors).toEqual([]);
});

test('MP3 to MP4 makes a square video of each MP3, with the title when there is no picture', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/mp3-to-mp4');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await choose(page.locator('input[name="shape"][value="square"]'));
  const { downloads } = await run(page, [staticFx('song.mp3')]);
  expect(downloads[0]!.suggestedFilename()).toBe('song.mp4');
  const tracks = await videoTracks(await bytesOf(downloads[0]!));
  expect(tracks.video).toMatchObject({ width: 1080, height: 1080 });
  await expect(page.locator('#results-list .result-item')).toContainText('title on plain background');
});

test('Audio to video refuses two pictures and says why', async ({ page }) => {
  await open(page, 'audio-to-video');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles([fx('tone.wav'), fx('swatches.png'), fx('plain.jpg')]);
  await page.locator('#run').click();
  await expect(page.locator('#error')).toContainText('Add one picture');
});

test('Compress audio shrinks a WAV and an MP3 to mono 64 kbps', async ({ page }) => {
  const errors = await open(page, 'compress-audio');
  const net = watchNetwork(page);
  const { items } = await run(page, ['tone.wav', staticFx('song.mp3')], async () => {
    await page.locator('#quality').selectOption('64');
    await page.locator('#mono').check();
  });
  expect(items).toBe(2);
  const files = await zipAll(page);
  const wav = readFileSync(fx('tone.wav'));
  const small = files['tone-compressed.mp3']!;
  expect(small.length).toBeLessThan(wav.length / 10);
  const info = await audioInfo(page, small);
  expect(info.duration).toBeGreaterThan(1.45);
  await expect(page.locator('#results-list')).toContainText('64 kbps MP3, mono');
  expect(files['song-compressed.mp3']!.length).toBeLessThan(readFileSync(staticFx('song.mp3')).length);
  net.assertNothingLeft(['tone.wav', 'song.mp3']);
  expect(errors).toEqual([]);
});

test('Compress MP3 opens at 96 kbps and can write OGG Opus', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/compress-mp3');
  await expect(page.locator('#quality')).toHaveValue('96');
  const { downloads } = await run(page, ['tone.wav'], async () => {
    await page.locator('#format').selectOption('ogg');
  });
  expect(downloads[0]!.suggestedFilename()).toBe('tone-compressed.ogg');
  const ogg = await bytesOf(downloads[0]!);
  expect(Buffer.from(ogg.subarray(0, 4)).toString()).toBe('OggS');
  expect(ogg.length).toBeLessThan(readFileSync(fx('tone.wav')).length / 10);
});

test('Compress audio hands back an MP3 it cannot make smaller', async ({ page }) => {
  await open(page, 'compress-audio');
  // song.mp3 is about 135 kbps, below the 160 kbps setting.
  const { downloads } = await run(page, [staticFx('song.mp3')], async () => {
    await page.locator('#quality').selectOption('160');
  });
  expect(downloads[0]!.suggestedFilename()).toBe('song.mp3');
  expect((await bytesOf(downloads[0]!)).length).toBe(readFileSync(staticFx('song.mp3')).length);
  await expect(page.locator('#results-list')).toContainText('kept as it was');
});

test('Add text to image draws the text at full size where it was dragged, and no bytes leave the tab', async ({ page }) => {
  const errors = await open(page, 'add-text-to-image');
  const net = watchNetwork(page);
  // plain.jpg: 800x600 of flat red (200, 80, 80).
  const { downloads } = await run(page, ['plain.jpg'], async () => {
    await expect(page.locator('#text-panel')).toBeVisible();
    await page.locator('#text1').fill('HELLO');
    await page.locator('#effect').selectOption('none');
    await page.locator('#size').fill('20');
    await page.locator('#size').dispatchEvent('input');
    // Drag the text from the middle to the top left quarter.
    await page.locator('#text-canvas').evaluate((el) => el.scrollIntoView({ block: 'center' }));
    const box = (await page.locator('#text-canvas').boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3, { steps: 5 });
    await page.mouse.up();
    await expect(page.locator('#pos1')).toHaveValue(/^0\.3\d*,0\.3\d*$/);
  });
  expect(downloads[0]!.suggestedFilename()).toBe('plain-text.jpg');
  const out = await bytesOf(downloads[0]!);
  expect(jpegSize(out)).toEqual({ width: 800, height: 600 });
  // White letters near the new spot, untouched red far from it.
  const boxes = JSON.parse((await page.locator('#text-panel').getAttribute('data-boxes'))!) as number[][];
  const [bx, by, bw, bh] = boxes[0]!;
  expect(bx! + bw! / 2).toBeCloseTo(0.3, 1);
  expect(by! + bh! / 2).toBeCloseTo(0.3, 1);
  let white = 0;
  for (let i = 0; i < 40; i++) {
    const [r, g, b] = await pixelAt(page, out, Math.round((bx! + (bw! * i) / 40) * 800), Math.round((by! + bh! / 2) * 600));
    if (r! > 230 && g! > 230 && b! > 230) white++;
  }
  expect(white).toBeGreaterThan(3);
  const far = await pixelAt(page, out, 700, 550);
  expect(Math.abs(far[0]! - 200) + Math.abs(far[1]! - 80) + Math.abs(far[2]! - 80)).toBeLessThan(30);
  net.assertNothingLeft(['plain.jpg']);
  expect(errors).toEqual([]);
});

test('Meme generator opens with top and bottom text in caps and saves both on every image', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/meme-generator');
  await expect(page.locator('#font')).toHaveValue('impact');
  await expect(page.locator('#upper')).toBeChecked();
  const { items } = await run(page, ['plain.jpg', 'photo.jpg'], async () => {
    await page.locator('#text1').fill('when the build');
    await page.locator('#text2').fill('is green');
  });
  expect(items).toBe(2);
  const files = await zipAll(page);
  expect(Object.keys(files).sort()).toEqual(['photo-text.jpg', 'plain-text.jpg']);
  const boxes = JSON.parse((await page.locator('#text-panel').getAttribute('data-boxes'))!) as number[][];
  // One block near the top, one near the bottom.
  expect(boxes[0]![1]!).toBeLessThan(0.2);
  expect(boxes[1]![1]! + boxes[1]![3]!).toBeGreaterThan(0.85);
});

test('Add text to image refuses to run with no text', async ({ page }) => {
  await open(page, 'add-text-to-image');
  await page.locator('#file-input').setInputFiles([fx('plain.jpg')]);
  await expect(page.locator('#text-panel')).toBeVisible();
  await page.locator('#text1').fill('');
  await page.locator('#run').click();
  await expect(page.locator('#error')).toContainText('Type some text first');
});

test('Split image cuts a picture into a 2×2 grid of exact tiles, and no bytes leave the tab', async ({ page }) => {
  const errors = await open(page, 'split-image');
  const net = watchNetwork(page);
  // swatches.png: flat colour blocks, lossless, so tiles can be checked pixel for pixel.
  const { items } = await run(page, ['swatches.png'], async () => {
    await expect(page.locator('#grid-panel')).toBeVisible();
    await page.locator('#layout').selectOption('2x2');
    await expect(page.locator('#cols')).toHaveValue('2');
    await expect(page.locator('#grid-hint')).toContainText('4 tiles of 200 × 100 px');
  });
  expect(items).toBe(4);
  const files = await zipAll(page);
  expect(Object.keys(files).sort()).toEqual(['swatches-1.png', 'swatches-2.png', 'swatches-3.png', 'swatches-4.png']);
  for (const f of Object.values(files)) expect(pngSize(f)).toEqual({ width: 200, height: 100 });
  // Tile 2 is the top right quarter: its top left pixel is the source's pixel at (200, 0).
  const src = readFileSync(fx('swatches.png'));
  expect(await pixelAt(page, files['swatches-2.png']!, 5, 5)).toEqual(await pixelAt(page, src, 205, 5));
  expect(await pixelAt(page, files['swatches-3.png']!, 5, 5)).toEqual(await pixelAt(page, src, 5, 105));
  net.assertNothingLeft(['swatches.png']);
  expect(errors).toEqual([]);
});

test('Instagram grid maker makes 4:5 tiles numbered in posting order', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/instagram-grid-maker');
  await expect(page.locator('#shape')).toHaveValue('portrait');
  // photo.jpg shows as 1200 × 1600 (EXIF turns it): nine 4:5 tiles of 400 × 500 from the middle 1200 × 1500.
  const { items } = await run(page, ['photo.jpg']);
  expect(items).toBe(9);
  const files = await zipAll(page);
  const names = Object.keys(files).sort();
  expect(names).toHaveLength(9);
  const size = jpegSize(files[names[0]!]!);
  expect(size).toEqual({ width: 400, height: 500 });
  // Tile 1 (post first) is the bottom right piece.
  await expect(page.locator('#results-list')).toContainText('row 3, column 3');
  await expect(page.locator('#results-list .result-item').first()).toContainText('post first');
});

test('Collage maker puts pictures side by side at a shared height, and no bytes leave the tab', async ({ page }) => {
  const errors = await open(page, 'collage-maker');
  const net = watchNetwork(page);
  // swatches.png is 400 × 200 and graphic.png 640 × 480: side by side at the median height (480).
  const { downloads } = await run(page, ['swatches.png', 'graphic.png'], async () => {
    await expect(page.locator('#collage-panel')).toBeVisible();
    await choose(page.locator('input[name="layout"][value="row"]'));
    await page.locator('#gap').fill('0');
    await page.locator('#gap').dispatchEvent('input');
    await page.locator('#format').selectOption('image/png');
    await expect(page.locator('#grid-fields')).toBeHidden();
    await expect(page.locator('#collage-hint')).toContainText('2 pictures, 1600 × 480 px');
  });
  expect(downloads[0]!.suggestedFilename()).toBe('collage.png');
  const png = await bytesOf(downloads[0]!);
  expect(pngSize(png)).toEqual({ width: 1600, height: 480 });
  // The left picture is the swatches scaled 2.4×; the right picture starts at x = 960.
  const src = readFileSync(fx('swatches.png'));
  expect(await pixelAt(page, png, 24, 24)).toEqual(await pixelAt(page, src, 10, 10));
  expect(await pixelAt(page, png, 1280, 240)).toEqual(await pixelAt(page, readFileSync(fx('graphic.png')), 320, 240));
  net.assertNothingLeft(['swatches.png', 'graphic.png']);
  expect(errors).toEqual([]);
});

test('Collage maker makes a grid with spacing on a background colour, and needs two pictures', async ({ page }) => {
  await open(page, 'collage-maker');
  await page.locator('#file-input').setInputFiles([fx('plain.jpg')]);
  await expect(page.locator('#collage-hint')).toContainText('Add at least one more picture');
  await page.locator('#run').click();
  await expect(page.locator('#error')).toContainText('at least two pictures');
  // Files are added to the list, so this makes three.
  await page.locator('#file-input').setInputFiles([fx('plain.jpg'), fx('plain.jpg')]);
  await expect(page.locator('#collage-hint')).toContainText('3 pictures');
  await page.locator('#background').fill('#000000');
  const [d] = await Promise.all([page.waitForEvent('download'), page.locator('#run').click()]);
  expect(d.suggestedFilename()).toBe('collage.jpg');
  const jpg = await bytesOf(d);
  // Two columns of 800 × 600 cells with 2% (16 px) gaps; the last picture is centred.
  expect(jpegSize(jpg)).toEqual({ width: 1648, height: 1248 });
  const corner = await pixelAt(page, jpg, 4, 4);
  expect(Math.max(...corner.slice(0, 3))).toBeLessThan(30);
  const inside = await pixelAt(page, jpg, 400, 300);
  expect(inside[0]).toBeGreaterThan(170);
});
