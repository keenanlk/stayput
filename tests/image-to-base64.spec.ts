// @webkit-project
import { test, expect, type Page } from '@playwright/test';

/**
 * Image to Base64: for a known PNG the data URI is exactly "data:image/png;base64," + the Base64 of the
 * file bytes; the copy buttons, HTML and CSS snippets and the .txt download work; several files and the
 * over-1-MB warning are handled; and no file bytes or names leave the tab.
 */

// A 1x1 transparent PNG.
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const png = Buffer.from(PNG_B64, 'base64');
const PNG_URI = `data:image/png;base64,${PNG_B64}`;

async function open(page: Page, path: string) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const requests: { url: string; method: string; body: string | null }[] = [];
  page.on('request', (r) => requests.push({ url: r.url(), method: r.method(), body: r.postData() }));
  await page.addInitScript(() => {
    (window as unknown as { __copied: string[] }).__copied = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (t: string) => void (window as unknown as { __copied: string[] }).__copied.push(t) },
    });
  });
  await page.goto(path);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  return { errors, requests };
}

const files = (...f: { name: string; mimeType: string; buffer: Buffer }[]) => f;

async function encode(page: Page, input: { name: string; mimeType: string; buffer: Buffer }[]) {
  await page.locator('#file-input').setInputFiles(input);
  await expect(page.locator('#tool')).toHaveAttribute('data-count', String(input.length));
  await page.locator('#run').click();
  await expect(page.locator('.b64-card')).toHaveCount(input.length, { timeout: 30_000 });
}

test('a PNG gives the exact data URI, raw Base64, HTML and CSS snippets, and copy buttons work', async ({ page }) => {
  const { errors, requests } = await open(page, '/tools/image-to-base64');
  await encode(page, files({ name: 'secret-logo.png', mimeType: 'image/png', buffer: png }));
  await expect(page.locator('#b64-uri-0')).toHaveValue(PNG_URI);
  await expect(page.locator('#b64-raw-0')).toHaveValue(PNG_B64);
  await expect(page.locator('#b64-html-0')).toHaveValue(`<img src="${PNG_URI}" alt="">`);
  await expect(page.locator('#b64-css-0')).toHaveValue(`background-image: url("${PNG_URI}");`);
  await expect(page.locator('.b64-size')).toContainText(`Original ${png.length} B`);
  await expect(page.locator('.b64-warn')).toHaveCount(0);

  for (const [key, want] of [['uri', PNG_URI], ['raw', PNG_B64], ['html', `<img src="${PNG_URI}" alt="">`], ['css', `background-image: url("${PNG_URI}");`]] as const) {
    await page.locator(`#b64-copy-${key}-0`).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __copied: string[] }).__copied.at(-1))).toBe(want);
  }

  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.result-item button', { hasText: 'Download' }).first().click()]);
  expect(download.suggestedFilename()).toBe('secret-logo-base64.txt');
  const { readFileSync } = await import('node:fs');
  expect(readFileSync((await download.path())!, 'utf8')).toBe(PNG_URI);

  for (const q of requests) {
    if (q.url.startsWith('blob:') || q.url.startsWith('data:')) continue;
    expect(q.method, q.url).toBe('GET');
    expect(q.body, q.url).toBeNull();
    expect(q.url).not.toContain('secret-logo');
    expect(q.url).not.toContain(PNG_B64.slice(20, 60));
  }
  expect(errors).toEqual([]);
});

test('several files each get a card, and an SVG is typed image/svg+xml', async ({ page }) => {
  await open(page, '/png-to-base64');
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4"/></svg>');
  await encode(page, files({ name: 'a.png', mimeType: 'image/png', buffer: png }, { name: 'b.svg', mimeType: 'image/svg+xml', buffer: svg }));
  await expect(page.locator('#b64-uri-0')).toHaveValue(PNG_URI);
  await expect(page.locator('#b64-uri-1')).toHaveValue(`data:image/svg+xml;base64,${svg.toString('base64')}`);
});

test('an image over 1 MB shows the bloat warning', async ({ page }) => {
  await open(page, '/tools/image-to-base64');
  const big = Buffer.concat([png, Buffer.alloc(1_200_000, 7)]);
  await encode(page, files({ name: 'big.png', mimeType: 'image/png', buffer: big }));
  await expect(page.locator('.b64-warn')).toContainText('over 1 MB');
  await expect(page.locator('#b64-uri-0')).toHaveValue(`data:image/png;base64,${big.toString('base64')}`);
});
