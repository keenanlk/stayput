// @webkit-project
import { test, expect, type Page, type Download } from '@playwright/test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { buildFixtures } from '../scripts/make-pdf-svg-fixtures.mjs';

/**
 * PDF to SVG: each page of each generated test PDF is converted by the real tool page, then the SVG,
 * drawn as an <img>, is compared with pdf.js's own canvas render of the same page at 2x.
 *
 * Three numbers per page, 0-255 per channel:
 *   mean = mean absolute RGB difference over the whole page
 *   bad  = percent of the page's pixels where any channel differs by more than 40
 *   lost = percent of the reference's dark pixels that are plain white in the SVG (content that went missing)
 * Anti-aliasing noise alone sits around 0-3 mean. The ceilings come from the spike that chose this
 * approach (a pdf.js operator-list converter measured 0.26-0.32 mean on vector pages and 2.7 / 6.6 on
 * embedded-font text in Chromium / WebKit) with about 2x headroom for engine differences. Small glyph
 * outlines are rasterised differently by WebKit and Chromium than by a canvas font, so the text page
 * gets a looser mean and a `lost` allowance for thin-stroke anti-aliasing; every other page is held tight.
 */
const LIMITS: Record<string, { mean: number; bad: number; lost: number }> = {
  'vector-chart': { mean: 1.0, bad: 1.0, lost: 2 },
  'text-fonts': { mean: 4.0, bad: 4.0, lost: 15 },
  'text-cff': { mean: 2.5, bad: 2.5, lost: 8 },
  'scanned-image': { mean: 1.0, bad: 1.0, lost: 2 },
  'gradient-transparency': { mean: 1.5, bad: 1.5, lost: 2 },
  'multi-page': { mean: 1.0, bad: 1.0, lost: 3 },
  unsupported: { mean: 1.5, bad: 1.5, lost: 3 },
};

const pdfjsDir = fileURLToPath(new URL('../node_modules/pdfjs-dist/legacy/build/', import.meta.url));

let files: Record<string, string> = {};
test.beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pdf-svg-'));
  for (const [name, bytes] of Object.entries(await buildFixtures())) {
    files[name] = join(dir, name);
    writeFileSync(files[name], bytes);
  }
});

async function openTool(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const requests: { url: string; method: string; body: string | null }[] = [];
  page.on('request', (r) => requests.push({ url: r.url(), method: r.method(), body: r.postData() }));
  await page.goto('/tools/pdf-to-svg');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  return { errors, requests };
}

/** Drop a PDF, press Run and return every SVG the run produced, by file name. */
async function convert(page: Page, file: string): Promise<{ svgs: Record<string, string>; notes: string[] }> {
  const downloads: Download[] = [];
  page.on('download', (d) => downloads.push(d));
  await page.locator('#file-input').setInputFiles(file);
  await expect(page.locator('#tool')).toHaveAttribute('data-count', '1');
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 60_000 });
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  const items = page.locator('#results-list .result-item');
  const notes = await items.allInnerTexts();
  const svgs: Record<string, string> = {};
  if ((await items.count()) === 1) {
    await expect.poll(() => downloads.length, { timeout: 10_000 }).toBe(1);
    const d = downloads[0]!;
    svgs[d.suggestedFilename()] = readFileSync((await d.path())!, 'utf8');
  } else {
    const [zip] = await Promise.all([page.waitForEvent('download'), page.locator('#download-all').click()]);
    const entries = unzipSync(new Uint8Array(readFileSync((await zip.path())!)));
    for (const [name, bytes] of Object.entries(entries)) svgs[name] = new TextDecoder().decode(bytes);
  }
  return { svgs, notes };
}

/**
 * Render page `pageNumber` of the PDF with pdf.js on a canvas, draw the SVG as an <img> at the same size, and
 * measure how far apart the two are. Runs in the tab, so it is the same browser engine as the tool.
 */
async function compare(page: Page, pdf: string, pageNumber: number, svg: string) {
  await page.route('**/__spec/pdf.mjs', (r) => r.fulfill({ contentType: 'text/javascript', body: readFileSync(pdfjsDir + 'pdf.mjs') }));
  await page.route('**/__spec/pdf.worker.mjs', (r) => r.fulfill({ contentType: 'text/javascript', body: readFileSync(pdfjsDir + 'pdf.worker.mjs') }));
  return page.evaluate(
    async ({ b64, pageNumber, svg }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const libUrl = '/__spec/pdf.mjs';
      const lib: any = await import(/* @vite-ignore */ libUrl);
      lib.GlobalWorkerOptions.workerSrc = '/__spec/pdf.worker.mjs';
      const doc = await lib.getDocument({ data: Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)) }).promise;
      const p = await doc.getPage(pageNumber);
      const viewport = p.getViewport({ scale: 2 });
      const w = Math.round(viewport.width);
      const h = Math.round(viewport.height);
      const a = document.createElement('canvas');
      a.width = w;
      a.height = h;
      const actx = a.getContext('2d', { willReadFrequently: true })!;
      actx.fillStyle = '#fff';
      actx.fillRect(0, 0, w, h);
      await p.render({ canvasContext: actx, viewport, canvas: a }).promise;

      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      const img = new Image();
      img.src = url;
      await img.decode();
      const b = document.createElement('canvas');
      b.width = w;
      b.height = h;
      const bctx = b.getContext('2d', { willReadFrequently: true })!;
      bctx.fillStyle = '#fff';
      bctx.fillRect(0, 0, w, h);
      bctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);

      const da = actx.getImageData(0, 0, w, h).data;
      const db = bctx.getImageData(0, 0, w, h).data;
      let sum = 0;
      let bad = 0;
      for (let i = 0; i < da.length; i += 4) {
        const dr = Math.abs(da[i]! - db[i]!);
        const dg = Math.abs(da[i + 1]! - db[i + 1]!);
        const dbl = Math.abs(da[i + 2]! - db[i + 2]!);
        sum += dr + dg + dbl;
        if (dr > 40 || dg > 40 || dbl > 40) bad++;
      }
      const px = w * h;
      // How much of the page is not white in the reference, so a blank-vs-blank pass cannot hide.
      let ink = 0;
      // Dark pixels of the reference that are plain white in the SVG: content that went missing.
      let dark = 0;
      let lost = 0;
      for (let i = 0; i < da.length; i += 4) {
        if (da[i]! < 245 || da[i + 1]! < 245 || da[i + 2]! < 245) ink++;
        if (da[i]! < 100 || da[i + 1]! < 100 || da[i + 2]! < 100) {
          dark++;
          if (db[i]! > 200 && db[i + 1]! > 200 && db[i + 2]! > 200) lost++;
        }
      }
      return { mean: sum / (px * 3), bad: (bad / px) * 100, inkPct: (ink / px) * 100, lostPct: dark ? (lost / dark) * 100 : 0, darkPct: (dark / px) * 100, width: w, height: h };
    },
    { b64: readFileSync(pdf).toString('base64'), pageNumber, svg },
  );
}

/** The SVG's structure, read with the browser's own XML parser (so a malformed file fails here). */
async function inspect(page: Page, svg: string) {
  return page.evaluate((src) => {
    const doc = new DOMParser().parseFromString(src, 'image/svg+xml');
    if (doc.querySelector('parsererror')) return { valid: false } as const;
    const texts = [...doc.querySelectorAll('text')].map((t) => t.textContent ?? '');
    return {
      valid: true,
      images: doc.querySelectorAll('image').length,
      paths: doc.querySelectorAll('path').length,
      uses: doc.querySelectorAll('use').length,
      gradients: doc.querySelectorAll('linearGradient, radialGradient').length,
      texts,
      invisibleTexts: [...doc.querySelectorAll('text')].filter((t) => t.getAttribute('fill-opacity') === '0').length,
      dasharray: doc.querySelectorAll('[stroke-dasharray]').length,
    } as const;
  }, svg);
}

function expectWithin(name: string, m: { mean: number; bad: number; inkPct: number; lostPct: number; darkPct: number }) {
  const lim = LIMITS[name]!;
  test.info().annotations.push({ type: 'metric', description: `${name}: mean ${m.mean.toFixed(2)}, bad ${m.bad.toFixed(2)}%, lost ${m.lostPct.toFixed(1)}%, ink ${m.inkPct.toFixed(1)}%` });
  if (process.env.PDF_SVG_METRICS) console.log(`${name}: mean ${m.mean.toFixed(2)}, bad ${m.bad.toFixed(2)}%, lost ${m.lostPct.toFixed(1)}% of ${m.darkPct.toFixed(1)}% dark, ink ${m.inkPct.toFixed(1)}%`);
  // The reference page must actually have content, or the comparison proves nothing.
  expect(m.inkPct, `${name}: reference page is blank`).toBeGreaterThan(1);
  expect(m.mean, `${name}: mean difference ${m.mean.toFixed(2)} over ${lim.mean}`).toBeLessThanOrEqual(lim.mean);
  expect(m.bad, `${name}: ${m.bad.toFixed(2)}% of pixels clearly different, over ${lim.bad}%`).toBeLessThanOrEqual(lim.bad);
  expect(m.lostPct, `${name}: ${m.lostPct.toFixed(1)}% of the dark pixels went missing, over ${lim.lost}%`).toBeLessThanOrEqual(lim.lost);
}

test('vector chart: shapes, dashes and clipping stay vector and match the pdf.js render', async ({ page }) => {
  const { errors } = await openTool(page);
  const { svgs } = await convert(page, files['vector-chart.pdf']!);
  const [name, svg] = Object.entries(svgs)[0]!;
  expect(name).toBe('vector-chart.svg');
  const s = await inspect(page, svg!);
  expect(s.valid).toBe(true);
  if (!s.valid) return;
  expect(s.images, 'a vector page must not become a picture').toBe(0);
  expect(s.paths).toBeGreaterThan(10);
  expect(s.dasharray).toBeGreaterThan(0);
  expect(s.texts.join(' ')).toContain('Monthly totals');
  expect(s.texts.join(' ')).toContain('Jan  Feb  Mar');
  expectWithin('vector-chart', await compare(page, files['vector-chart.pdf']!, 1, svg!));
  expect(errors).toEqual([]);
});

test('embedded-font text: outlines match the render, and the text is selectable <text> with the right strings', async ({ page }) => {
  await openTool(page);
  const { svgs, notes } = await convert(page, files['text-fonts.pdf']!);
  const svg = Object.values(svgs)[0]!;
  const s = await inspect(page, svg);
  expect(s.valid).toBe(true);
  if (!s.valid) return;
  expect(s.images).toBe(0);
  // Glyphs are shared outlines drawn with <use>, not one path per letter.
  expect(s.uses).toBeGreaterThan(100);
  const all = s.texts.join('\n');
  for (const want of ['Embedded font text', 'The quick brown fox jumps over the lazy dog.', 'Accents: éèêë äöü ñ ç', '€', 'Coloured text in blue', 'Outline', 'Rotated thirty degrees']) {
    expect(all, `selectable text should contain ${want}`).toContain(want);
  }
  // Text drawn as outlines has an invisible layer; the Helvetica line (not embedded) is live text.
  expect(s.invisibleTexts).toBeGreaterThan(5);
  expect(all).toContain('Helvetica is not embedded in this file.');
  expect(notes.join(' ')).toContain('not stored in the PDF');
  expectWithin('text-fonts', await compare(page, files['text-fonts.pdf']!, 1, svg));
});

test('OpenType-CFF font text is drawn from its outlines and matches the render', async ({ page }) => {
  await openTool(page);
  const { svgs } = await convert(page, files['text-cff.pdf']!);
  const svg = Object.values(svgs)[0]!;
  const s = await inspect(page, svg);
  expect(s.valid).toBe(true);
  if (!s.valid) return;
  expect(s.images).toBe(0);
  expect(s.uses).toBeGreaterThan(30);
  expect(s.texts.join('\n')).toContain('CFF outlines in a PDF');
  expect(s.texts.join('\n')).toContain('Second line: 0123456789');
  expectWithin('text-cff', await compare(page, files['text-cff.pdf']!, 1, svg));
});

test('scanned page: the picture is embedded as an image, with a note, and matches the render', async ({ page }) => {
  await openTool(page);
  const { svgs, notes } = await convert(page, files['scanned-image.pdf']!);
  const svg = Object.values(svgs)[0]!;
  const s = await inspect(page, svg);
  expect(s.valid).toBe(true);
  if (!s.valid) return;
  expect(s.images).toBe(1);
  expect(s.texts).toEqual([]);
  expect(svg).toMatch(/href="data:image\/(png|jpeg);base64,/);
  expect(notes.join(' ')).toContain('This page is a scan');
  expectWithin('scanned-image', await compare(page, files['scanned-image.pdf']!, 1, svg));
});

test('gradients and transparency: shadings become SVG gradients, alpha is kept, and it matches the render', async ({ page }) => {
  await openTool(page);
  const { svgs, notes } = await convert(page, files['gradient-transparency.pdf']!);
  const svg = Object.values(svgs)[0]!;
  const s = await inspect(page, svg);
  expect(s.valid).toBe(true);
  if (!s.valid) return;
  expect(s.gradients, 'axial, radial and the pattern fill each need a gradient').toBeGreaterThanOrEqual(3);
  expect(svg).toMatch(/<linearGradient/);
  expect(svg).toMatch(/<radialGradient/);
  expect(svg).toContain('fill-opacity="0.5"');
  // The picture with a soft mask arrives as an image; the page is still vector otherwise, so no full-page raster.
  expect(s.images).toBe(1);
  expect(notes.join(' ')).not.toContain('saved as a picture');
  expect(s.texts.join(' ')).toContain('Gradient and transparency');
  expectWithin('gradient-transparency', await compare(page, files['gradient-transparency.pdf']!, 1, svg));
});

test('multi-page: one SVG per page in a zip, each matching its page', async ({ page }) => {
  await openTool(page);
  const { svgs } = await convert(page, files['multi-page.pdf']!);
  expect(Object.keys(svgs).sort()).toEqual(['multi-page-page-1.svg', 'multi-page-page-2.svg', 'multi-page-page-3.svg', 'multi-page-page-4.svg']);
  for (let p = 1; p <= 4; p++) {
    const svg = svgs[`multi-page-page-${p}.svg`]!;
    const s = await inspect(page, svg);
    expect(s.valid).toBe(true);
    if (!s.valid) return;
    expect(s.texts.join(' ')).toContain(`Page ${p} of 4`);
    expect(s.images).toBe(0);
    expectWithin('multi-page', await compare(page, files['multi-page.pdf']!, p, svg));
  }
});

test('unsupported features: the page is saved as a picture with a visible note, text stays selectable', async ({ page }) => {
  await openTool(page);
  const { svgs, notes } = await convert(page, files['unsupported.pdf']!);
  const svg = Object.values(svgs)[0]!;
  const s = await inspect(page, svg);
  expect(s.valid).toBe(true);
  if (!s.valid) return;
  expect(s.images).toBe(1);
  const note = notes.join(' ');
  expect(note).toContain('saved as a picture');
  expect(note).toContain('blend modes');
  expect(note).toContain('tiling patterns');
  expect(note).toContain('Type 3 fonts');
  expect(s.texts.join(' ')).toContain('Page with unsupported features');
  // The picture is the pdf.js render, so it must match closely.
  expectWithin('unsupported', await compare(page, files['unsupported.pdf']!, 1, svg));
});

test('nothing is fetched before Run, and no request carries file data or the file name', async ({ page }) => {
  const { requests } = await openTool(page);
  const converter = (u: string) => /pdf-svg/.test(u);
  expect(requests.filter((r) => converter(r.url))).toEqual([]);
  await page.locator('#file-input').setInputFiles(files['text-fonts.pdf']!);
  await expect(page.locator('#tool')).toHaveAttribute('data-count', '1');
  // Dropping the file opens it to count pages; the converter and its font reader still wait for Run.
  await expect(page.locator('#page-info')).toContainText('1 page');
  expect(requests.filter((r) => converter(r.url))).toEqual([]);
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 60_000 });
  expect(requests.some((r) => converter(r.url)), 'the converter loads on Run').toBe(true);
  for (const r of requests) {
    if (r.url.startsWith('blob:') || r.url.startsWith('data:')) continue;
    const host = new URL(r.url).hostname;
    if (host === 'stats.keenankaufman.com') {
      expect((r.body ?? '').length).toBeLessThan(2048);
      expect(r.body ?? '').not.toContain('text-fonts');
      continue;
    }
    expect(host, `unexpected host ${host}`).toBe('localhost');
    expect(r.method, `${r.url} must be a plain GET`).toBe('GET');
    expect(r.body, `${r.url} must carry no body`).toBeNull();
    expect(decodeURIComponent(r.url), 'the file name must not appear in a URL').not.toContain('text-fonts.pdf');
  }
});
