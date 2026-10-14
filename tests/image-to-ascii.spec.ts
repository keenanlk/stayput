// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gridSize, rampFor, toAscii, CHARSETS } from '../src/lib/ascii-art';

/**
 * Image to ASCII art: the text helpers are unit-tested, then images built in the page
 * (Safari can't encode WebP) are dropped in to check the text box, copy, downloads and sizes.
 */

test('a 100-column white-to-black gradient gives a monotone ramp', () => {
  const cols = 100;
  const rgba = new Uint8ClampedArray(cols * 4);
  for (let x = 0; x < cols; x++) {
    const v = Math.round(255 * (1 - x / (cols - 1)));
    rgba.set([v, v, v, 255], x * 4);
  }
  const ramp = rampFor('classic');
  const line = toAscii(rgba, cols, 1, ramp, false);
  expect(line.length).toBe(cols);
  const idx = Array.from(line).map((c) => ramp.indexOf(c));
  expect(idx.every((i) => i >= 0)).toBe(true);
  for (let i = 1; i < idx.length; i++) expect(idx[i]!).toBeGreaterThanOrEqual(idx[i - 1]!);
  expect(line[0]).toBe(' ');
  expect(line[cols - 1]).toBe('@');
  const inv = toAscii(rgba, cols, 1, ramp, true);
  expect(inv[0]).toBe('@');
  expect(inv[cols - 1]).toBe(' ');
});

test('output only ever holds characters from the set, never markup from the file', () => {
  const rgba = new Uint8ClampedArray(16 * 4).map((_, i) => (i * 37) % 256);
  const text = toAscii(rgba, 4, 4, rampFor('classic'), false);
  expect(text.replace(/\n/g, '').split('').every((c) => CHARSETS.classic!.includes(c))).toBe(true);
  expect(rampFor('custom', '<b>&<b>')).toEqual(['<', 'b', '>', '&']);
  expect(rampFor('custom', 'a')).toEqual(Array.from(CHARSETS.classic!));
});

test('grid size halves the rows and caps very tall pictures', () => {
  expect(gridSize(100, 100, 100)).toEqual({ cols: 100, rows: 50 });
  expect(gridSize(6000, 4000, 100)).toEqual({ cols: 100, rows: 33 });
  const tall = gridSize(10, 5000, 200);
  expect(tall.rows).toBeLessThanOrEqual(600);
});

async function makePng(page: Page, w: number, h: number): Promise<Buffer> {
  const bytes = await page.evaluate(async ([w, h]) => {
    const c = document.createElement('canvas');
    c.width = w!;
    c.height = h!;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, w!, 0);
    g.addColorStop(0, '#fff');
    g.addColorStop(1, '#000');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w!, h!);
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/png'));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }, [w, h]);
  return Buffer.from(bytes);
}

async function open(page: Page) {
  const errors: string[] = [];
  const hosts = new Set<string>();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => hosts.add(new URL(r.url()).host));
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) => route.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.goto('/tools/image-to-ascii');
  await expect(page.locator('#tool[data-ready="true"]')).toBeVisible();
  return { errors, hosts };
}

async function convert(page: Page, buf: Buffer) {
  await page.setInputFiles('#file-input', [{ name: 'private-name.png', mimeType: 'image/png', buffer: buf }]);
  await page.locator('#run').click();
  await expect(page.locator('#ascii-panel')).toBeVisible({ timeout: 90_000 });
}

test('square input: text, square PNG, exact copy, matching .txt, no upload', async ({ page, context, browserName }) => {
  const { errors, hosts } = await open(page);
  const origin = new URL(page.url()).host;
  await convert(page, await makePng(page, 300, 300));
  const text = await page.locator('#ascii-out').inputValue();
  const lines = text.split('\n');
  expect(lines.length).toBe(50);
  expect(lines.every((l) => l.length === 100)).toBe(true);
  expect(text).not.toContain('private-name');
  expect(text.trim().length).toBeGreaterThan(0);

  const [txt] = await Promise.all([page.waitForEvent('download'), page.locator('#ascii-txt').click()]);
  expect(txt.suggestedFilename()).toBe('private-name-ascii.txt');
  expect(readFileSync((await txt.path())!, 'utf8')).toBe(text);

  const [png] = await Promise.all([page.waitForEvent('download'), page.locator('#ascii-png').click()]);
  const b = readFileSync((await png.path())!);
  const w = b.readUInt32BE(16);
  const h = b.readUInt32BE(20);
  expect(Math.abs(w / h - 1)).toBeLessThan(0.05);

  if (browserName === 'chromium') {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.locator('#ascii-copy').click();
    await expect(page.locator('#ascii-copy')).toHaveText('Copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);
  } else {
    await page.locator('#ascii-copy').click();
    await expect(page.locator('#ascii-copy')).toHaveText(/Cop/);
  }
  expect([...hosts].filter((h) => h !== origin && h !== 'stats.keenankaufman.com')).toEqual([]);
  expect(errors).toEqual([]);
});

test('a 24 megapixel image is shrunk to the character grid before sampling', async ({ page }) => {
  await open(page);
  await convert(page, await makePng(page, 6000, 4000));
  const info = page.locator('#ascii-info');
  await expect(info).toHaveAttribute('data-source', '6000x4000');
  await expect(info).toHaveAttribute('data-sampled', '100x33');
  expect((await page.locator('#ascii-out').inputValue()).split('\n').length).toBe(33);
});

test('width, invert and a custom set change the text', async ({ page }) => {
  await open(page);
  const png = await makePng(page, 200, 100);
  await page.locator('#cols').fill('40');
  await page.locator('#invert').check();
  await page.locator('#charset').selectOption('custom');
  await page.locator('#custom').fill('.#');
  await convert(page, png);
  const lines = (await page.locator('#ascii-out').inputValue()).split('\n');
  expect(lines[0]!.length).toBe(40);
  expect(lines.length).toBe(10);
  expect(lines[0]!.startsWith('.')).toBe(false);
  expect(lines[0]!.endsWith('.')).toBe(true);
});
