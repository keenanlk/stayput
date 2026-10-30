// @webkit-project
import { test, expect, type Page, type Download } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';

/**
 * Image to Word: a JPG and a PNG of printed English each give a .docx that unzips, has
 * word/document.xml and holds the words; two images give one document with both in order.
 * No host is hard-coded, so this runs against localhost or https://stayput.dev unchanged.
 */

const fx = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));

interface Ev { n: string; d?: Record<string, unknown> }

async function open(page: Page, path: string) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // The site skips analytics in automated browsers; pretend to be a person and capture the events.
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: 'window.__events=[];window.umami={track:(n,d)=>window.__events.push({n,d})};' }),
  );
  const requests: { url: string; method: string; body: string | null }[] = [];
  page.on('request', (r) => requests.push({ url: r.url(), method: r.method(), body: r.postData() }));
  await page.goto(path);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  return { errors, requests };
}

/** Convert and return the document.xml text of the downloaded .docx, plus its file name. */
async function convert(page: Page, files: string[]) {
  await page.locator('#file-input').setInputFiles(files);
  await expect(page.locator('#tool')).toHaveAttribute('data-count', String(files.length));
  const downloads: Download[] = [];
  page.on('download', (d) => downloads.push(d));
  await page.locator('#run').click();
  // The first run loads the OCR engine and English model from /vendor/.
  await expect.poll(() => downloads.length, { timeout: 120_000 }).toBe(1);
  const zip = unzipSync(new Uint8Array(readFileSync((await downloads[0]!.path())!)));
  expect(Object.keys(zip)).toContain('word/document.xml');
  const xml = strFromU8(zip['word/document.xml']!);
  const text = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(' ');
  return { name: downloads[0]!.suggestedFilename(), xml, text };
}

/** The fields every tool event already carries (see the privacy page); this tool adds none. */
const FIELDS = ['tool', 'files', 'input', 'output', 'duration', 'outcome', 'attempt', 'format', 'error_class', 'landing', 'ref', 'from', 'visit', 'prev_tool', 'run_n', 'tools_used', 'run_gap', 'ns', 'variant'];

test.describe.configure({ timeout: 180_000 });

test('a JPG becomes a .docx holding its words, via /jpg-to-word', async ({ page }) => {
  const { errors } = await open(page, '/jpg-to-word');
  const doc = await convert(page, [fx('ocr-letter.jpg')]);
  expect(doc.name).toBe('ocr-letter.docx');
  expect(doc.text).toContain('quick brown fox');
  await expect(page.locator('#text-preview')).toContainText('quick brown fox');
  expect(errors).toEqual([]);
});

test('a PNG becomes a .docx with paragraphs and line breaks, via /png-to-word', async ({ page }) => {
  const { errors } = await open(page, '/png-to-word');
  const doc = await convert(page, [fx('ocr-note.png')]);
  expect(doc.name).toBe('ocr-note.docx');
  expect(doc.text).toContain('Stayput reads text on your device.');
  expect(doc.text).toContain('Invoice number 48213');
  expect(doc.text).toContain('Total due: $1,250.00');
  // Kept line breaks: the image's three lines are one paragraph with line breaks, or several paragraphs.
  expect(doc.xml.match(/<w:br\/>/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  expect(errors).toEqual([]);
});

test('two images give one document with both texts in order, a page break between, and a clean analytics payload', async ({ page }) => {
  const { errors, requests } = await open(page, '/tools/image-to-word');
  const doc = await convert(page, [fx('ocr-note.png'), fx('ocr-letter.jpg')]);
  expect(doc.name).toBe('images.docx');
  const a = doc.text.indexOf('Invoice number 48213');
  const b = doc.text.indexOf('quick brown fox');
  expect(a).toBeGreaterThanOrEqual(0);
  expect(b).toBeGreaterThan(a);
  expect(doc.xml.match(/<w:pageBreakBefore\/>/g)).toHaveLength(1);
  await expect(page.locator('#text-preview')).toContainText('Image 2');

  // Analytics: names, counts and sizes only. No file name, text or file content.
  await expect.poll(() => page.evaluate(() => (window as unknown as { __events: unknown[] }).__events.length)).toBeGreaterThan(0);
  const events = await page.evaluate(() => (window as unknown as { __events: Ev[] }).__events);
  console.log('analytics payload:', JSON.stringify(events));
  const blob = JSON.stringify(events);
  for (const leak of ['ocr-note', 'ocr-letter', 'Invoice', 'quick brown fox', 'Stayput reads']) expect(blob).not.toContain(leak);
  for (const e of events) {
    for (const [k] of Object.entries(e.d ?? {})) expect(FIELDS, k).toContain(k);
    for (const v of Object.values(e.d ?? {})) expect(typeof v === 'string' ? v.length : 0).toBeLessThan(40);
  }
  for (const q of requests) {
    if (q.url.startsWith('blob:') || q.url.startsWith('data:')) continue;
    expect(q.method, q.url).toBe('GET');
    expect(q.body, q.url).toBeNull();
    expect(q.url).not.toContain('ocr-note');
  }
  expect(errors).toEqual([]);
});

test('an image with no text says so instead of making an empty document', async ({ page }) => {
  await open(page, '/tools/image-to-word');
  await page.locator('#file-input').setInputFiles(fx('ocr-texture.jpg'));
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 120_000 });
  await expect(page.locator('#error')).toContainText('No clear text found');
});
