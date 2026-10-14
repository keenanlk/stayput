import { test, expect, type Page, type Download } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';

// Runs in Chromium and WebKit (see playwright.config.ts): the worker, the font fetch and the PDF must work in both.

const nodeModules = fileURLToPath(new URL('../node_modules/', import.meta.url));

async function stubAnalytics(page: Page) {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: 'window.__events=[];window.umami={track:(n,d)=>window.__events.push({n,d})};' }),
  );
}

async function open(page: Page, path = '/tools/text-to-pdf') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await stubAnalytics(page);
  const requests: { url: string; method: string; body: string | null }[] = [];
  page.on('request', (r) => requests.push({ url: r.url(), method: r.method(), body: r.postData() }));
  await page.goto(path);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  return { errors, requests };
}

const bytesOf = async (d: Download) => new Uint8Array(readFileSync((await d.path())!));

/** Text per page, read back with pdf.js. */
async function pages(bytes: Uint8Array): Promise<string[]> {
  const doc = await getDocument({ data: bytes.slice(), useWorkerFetch: false, standardFontDataUrl: nodeModules + 'pdfjs-dist/standard_fonts/' }).promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    out.push(content.items.filter((x): x is TextItem => 'str' in x).map((x) => x.str).join('\n'));
  }
  await doc.loadingTask.destroy();
  return out;
}

async function convertFiles(page: Page, files: { name: string; buffer: Buffer }[]) {
  await page.locator('#file-input').setInputFiles(files.map((f) => ({ name: f.name, mimeType: 'text/plain', buffer: f.buffer })));
  const downloads: Download[] = [];
  page.on('download', (d) => downloads.push(d));
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 60_000 });
  if (files.length === 1) await expect.poll(() => downloads.length, { timeout: 10_000 }).toBe(1);
  return downloads;
}

async function expectError(page: Page, file: { name: string; buffer: Buffer }, text: string | RegExp) {
  await page.locator('#file-input').setInputFiles([{ name: file.name, mimeType: 'text/plain', buffer: file.buffer }]);
  await page.locator('#run').click();
  await expect(page.locator('#error')).toContainText(text, { timeout: 30_000 });
}

const buf = (s: string) => Buffer.from(s, 'utf8');

test('typed text becomes text.pdf with its lines, a tab expanded and no bytes leave the tab', async ({ page }) => {
  const { errors, requests } = await open(page);
  await expect(page.locator('#tp-make')).toBeDisabled();
  await page.locator('#tp-text').fill('Hello world\n\tindented line');
  await expect(page.locator('#tp-count')).toHaveText('26 characters');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#tp-make').click()]);
  expect(download.suggestedFilename()).toBe('text.pdf');
  const bytes = await bytesOf(download);
  expect(Buffer.from(bytes.subarray(0, 4)).toString()).toBe('%PDF');
  const doc = await PDFDocument.load(bytes);
  expect(doc.getPageCount()).toBe(1);
  const text = (await pages(bytes))[0]!;
  expect(text).toContain('Hello world');
  expect(text).toContain('indented line');
  await expect(page.locator('#results-list')).toContainText('1 page, Roboto');
  for (const r of requests) {
    expect(new URL(r.url).hostname === 'localhost' || r.url.startsWith('blob:') || r.url.startsWith('data:') || new URL(r.url).hostname === 'stats.keenankaufman.com', r.url).toBe(true);
    expect(r.body ?? '', r.url).not.toContain('indented');
  }
  expect(errors).toEqual([]);
});

test('a UTF-16 file with a byte-order mark is read correctly', async ({ page }) => {
  await open(page);
  const text = 'Café Ελληνικά naïve';
  const body = Buffer.from(text, 'utf16le');
  const [d] = await convertFiles(page, [{ name: 'notes.txt', buffer: Buffer.concat([Buffer.from([0xff, 0xfe]), body]) }]);
  expect(d!.suggestedFilename()).toBe('notes.pdf');
  const out = (await pages(await bytesOf(d!)))[0]!;
  expect(out).toContain('Café');
  expect(out).toContain('Ελληνικά');
});

test('a Windows-1252 file is read as Western European and the result says so', async ({ page }) => {
  await open(page);
  const [d] = await convertFiles(page, [{ name: 'old.txt', buffer: Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x20, 0x93, 0x71, 0x75, 0x6f, 0x74, 0x65, 0x94]) }]);
  const out = (await pages(await bytesOf(d!)))[0]!;
  expect(out).toContain('café');
  expect(out).toContain('“quote”');
  await expect(page.locator('#results-list')).toContainText('Windows-1252');
});

test('long lines wrap at the margin, even an unbroken string, and nothing is lost', async ({ page }) => {
  await open(page);
  const long = 'A'.repeat(400);
  const [d] = await convertFiles(page, [{ name: 'long.txt', buffer: buf(`${long}\nshort`) }]);
  const bytes = await bytesOf(d!);
  const text = (await pages(bytes))[0]!;
  const lines = text.split('\n').filter((l) => /^A+$/.test(l));
  expect(lines.length).toBeGreaterThan(1);
  expect(lines.join('').length).toBe(400);
  expect(text).toContain('short');
});

test('page size and form feeds: A4 and Letter widths, and a form feed starts a page', async ({ page }) => {
  await open(page);
  await page.locator('#paper').selectOption('letter');
  const [d] = await convertFiles(page, [{ name: 'two.txt', buffer: buf('first page\fsecond page') }]);
  const bytes = await bytesOf(d!);
  const doc = await PDFDocument.load(bytes);
  expect(doc.getPageCount()).toBe(2);
  expect(Math.round(doc.getPage(0).getWidth())).toBe(612);
  const text = await pages(bytes);
  expect(text[0]).toContain('first page');
  expect(text[0]).not.toContain('second page');
  expect(text[1]).toContain('second page');
  expect(text[0]).toContain('1 of 2');
  expect(text[1]).toContain('2 of 2');
});

test('a title, no page numbers and the A4 width', async ({ page }) => {
  await open(page);
  await page.locator('#paper').selectOption('a4');
  await page.locator('#tp-title').fill('Q3 notes');
  await page.locator('#tp-numbers').uncheck();
  const [d] = await convertFiles(page, [{ name: 'draft.txt', buffer: buf('body text') }]);
  expect(d!.suggestedFilename()).toBe('Q3 notes.pdf');
  const bytes = await bytesOf(d!);
  const doc = await PDFDocument.load(bytes);
  expect(doc.getTitle()).toBe('Q3 notes');
  expect(Math.round(doc.getPage(0).getWidth())).toBe(595);
  const text = (await pages(bytes))[0]!;
  expect(text.split('\n')[0]).toBe('Q3 notes');
  expect(text).not.toContain('1 of 1');
});

test('characters the fonts cannot draw are reported, symbols are drawn, and nothing vanishes silently', async ({ page }) => {
  await open(page);
  const [d] = await convertFiles(page, [{ name: 'mixed.txt', buffer: buf('Price → 5 ✓ 中文 😀 done') }]);
  const out = (await pages(await bytesOf(d!)))[0]!;
  expect(out).toContain('→');
  expect(out).toContain('✓');
  expect(out).toContain('�');
  expect(out).not.toContain('中');
  const note = page.locator('#results-list');
  await expect(note).toContainText("3 characters can't be drawn");
  await expect(note).toContainText('U+4E2D');
  await expect(note).toContainText('emoji');
});

test('a file that is mostly CJK is refused with the print hint', async ({ page }) => {
  await open(page);
  await expectError(page, { name: 'cjk.txt', buffer: buf('中文日本語'.repeat(15) + ' ok') }, 'mostly in a script the built-in fonts cannot draw');
  await expect(page.locator('#error')).toContainText('Print, then Save as PDF');
});

test('a file over 2 MB is refused with a clear message', async ({ page }) => {
  await open(page);
  await expectError(page, { name: 'huge.txt', buffer: Buffer.alloc(2_000_001, 'a') }, 'up to 2 MB of text per file');
});

test('a PDF dropped here is refused as not plain text, and a blank file says it has no text', async ({ page }) => {
  await open(page);
  await expectError(page, { name: 'fake.txt', buffer: buf('%PDF-1.7\n1 0 obj\n') }, 'does not look like plain text');
  await page.locator('#clear').click();
  await expectError(page, { name: 'blank.txt', buffer: buf('   \n\n  ') }, 'has no text in it');
});

test('several files give one PDF each in a zip', async ({ page }) => {
  await open(page);
  await convertFiles(page, [
    { name: 'a.txt', buffer: buf('alpha file') },
    { name: 'b.log', buffer: buf('beta log\tcolumn') },
  ]);
  const [d] = await Promise.all([page.waitForEvent('download'), page.locator('#download-all').click()]);
  const zip = unzipSync(await bytesOf(d));
  expect(Object.keys(zip).sort()).toEqual(['a.pdf', 'b.pdf']);
  expect((await pages(zip['b.pdf']!))[0]!.replace(/\s+/g, ' ')).toContain('beta log column');
});

test('a .log file is set in monospace and the note says so', async ({ page }) => {
  await open(page);
  await convertFiles(page, [{ name: 'server.log', buffer: buf('12:00:01 INFO  started\n12:00:02 WARN  slow') }]);
  await expect(page.locator('#results-list')).toContainText('monospace');
});

test('analytics carry only the shell events, with the font as the format and none of the text', async ({ page }) => {
  await open(page);
  await page.locator('#tp-text').fill('Secret draft sentence for the analytics check');
  await page.locator('#tp-title').fill('Private title');
  await Promise.all([page.waitForEvent('download'), page.locator('#tp-make').click()]);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __events: { n: string }[] }).__events.some((e) => e.n === 'tool_run'))).toBe(true);
  const events = await page.evaluate(() => (window as unknown as { __events: { n: string; d: Record<string, unknown> }[] }).__events);
  const run = events.find((e) => e.n === 'tool_run')!;
  expect(run.d.format).toBe('sans');
  expect(run.d.tool).toBe('text-to-pdf');
  const wire = JSON.stringify(events);
  for (const secret of ['Secret', 'Private', 'analytics check', 'text.txt', 'text.pdf']) expect(wire).not.toContain(secret);
});

test('the /txt-to-pdf page converts a .txt file with its own title', async ({ page }) => {
  await open(page, '/txt-to-pdf');
  expect(await page.title()).toContain('TXT to PDF Converter');
  expect(await page.title()).not.toBe('Text to PDF: Paste Text or Drop a TXT File | Stayput');
  await expect(page.locator('#tp-text')).toHaveCount(0);
  const [d] = await convertFiles(page, [{ name: 'readme.txt', buffer: buf('Hello from a text file') }]);
  expect(d!.suggestedFilename()).toBe('readme.pdf');
  expect((await pages(await bytesOf(d!)))[0]).toContain('Hello from a text file');
});

test.describe('a US browser', () => {
  test.use({ locale: 'en-US' });
  test('starts on US Letter', async ({ page }) => {
    await open(page);
    await expect(page.locator('#paper')).toHaveValue('letter');
  });
});

test.describe('a German browser', () => {
  test.use({ locale: 'de-DE' });
  test('starts on A4', async ({ page }) => {
    await open(page);
    await expect(page.locator('#paper')).toHaveValue('a4');
  });
});
