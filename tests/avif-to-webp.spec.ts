// @webkit-project
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const fx = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));

/** checker.avif is 320 x 240; the output must be a WebP of the same size. */
function webpSize(b: Buffer): { width: number; height: number } {
  expect(b.subarray(0, 4).toString('latin1')).toBe('RIFF');
  expect(b.subarray(8, 12).toString('latin1')).toBe('WEBP');
  const kind = b.subarray(12, 16).toString('latin1');
  if (kind === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
  if (kind === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  if (kind === 'VP8L') {
    const v = b.readUInt32LE(21);
    return { width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1 };
  }
  throw new Error(`unexpected WebP chunk ${kind}`);
}

test('AVIF converts to a WebP of the same size, with only same-origin requests', async ({ page, baseURL }) => {
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  await page.goto('/avif-to-webp');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(fx('checker.avif'));
  const download = page.waitForEvent('download', { timeout: 120_000 });
  await page.locator('#run').click();
  const dl = await download;
  expect(dl.suggestedFilename()).toMatch(/\.webp$/);
  const bytes = readFileSync(await dl.path());
  expect(webpSize(bytes)).toEqual({ width: 320, height: 240 });

  const origin = new URL(baseURL!).origin;
  for (const u of urls) {
    if (u.startsWith('data:') || u.startsWith('blob:')) continue;
    expect(new URL(u).origin, u).toBe(origin);
    expect(u).not.toContain('checker');
  }
});

test('the WebAssembly encoder writes a valid WebP from the page', async ({ page }) => {
  // Behave like Safari: a canvas asked for WebP hands back a PNG, so the WebAssembly encoder must run.
  await page.addInitScript(() => {
    const toBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback, type?: string, q?: number) {
      return toBlob.call(this, cb, type === 'image/webp' ? 'image/png' : type, q);
    };
    const convert = OffscreenCanvas.prototype.convertToBlob;
    OffscreenCanvas.prototype.convertToBlob = function (o?: ImageEncodeOptions) {
      return convert.call(this, o?.type === 'image/webp' ? { ...o, type: 'image/png' } : o);
    };
  });
  await page.goto('/avif-to-webp');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  const encoderRequest = page.waitForRequest((r) => r.url().includes('/vendor/') && r.url().includes('webp'), { timeout: 120_000 });
  await page.locator('#file-input').setInputFiles(fx('checker.avif'));
  const download = page.waitForEvent('download', { timeout: 120_000 });
  await page.locator('#run').click();
  await encoderRequest;
  const bytes = readFileSync(await (await download).path());
  expect(webpSize(bytes)).toEqual({ width: 320, height: 240 });
});
