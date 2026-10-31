// @webkit-project
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { siteHost } from './allowed-host';

// The scanner's image route in the engine Safari uses: the reader's wasm decodes a
// photo and a three-code picture, and nothing leaves the page but requests to this site.
// (WebKit has no fake camera, so the camera is covered in Chromium only.)

const fx = (name: string) => fileURLToPath(new URL(`./fixtures/qr/${name}`, import.meta.url));
const texts = JSON.parse(readFileSync(fx('texts.json'), 'utf8')) as Record<string, string>;

test('the QR scanner reads a photo and several codes, with every request going to this site', async ({ page }) => {
  const hosts = new Set<string>();
  const wasm: string[] = [];
  page.on('request', (r) => {
    if (r.url().startsWith('blob:') || r.url().startsWith('data:')) return;
    hosts.add(new URL(r.url()).hostname);
    if (r.url().endsWith('.wasm')) wasm.push(r.url());
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://stats.keenankaufman.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await page.goto('/tools/qr-code-scanner');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(fx('03_photo_angle35.jpg'));
  await expect(page.locator('#qs-results .qs-address')).toHaveText(texts.url!, { timeout: 30_000 });
  await page.locator('#file-input').setInputFiles(fx('09_three_codes.png'));
  await expect(page.locator('#qs-results .qs-card')).toHaveCount(3, { timeout: 30_000 });
  expect(wasm.map((u) => new URL(u).pathname)).toContain('/vendor/zxing-wasm@3.1.6/zxing_reader.wasm');
  expect([...hosts].filter((h) => h !== siteHost() && h !== 'stats.keenankaufman.com')).toEqual([]);
  expect(errors).toEqual([]);
});
