// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const fx = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));
/** A large photo for local runs (AVIF_PHOTO=/path/to/12mp.jpg); CI uses the small committed one. */
const PHOTO = process.env.AVIF_PHOTO ?? fx('pug.jpg');

function jpegSize(buf: Buffer): { width: number; height: number } {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) throw new Error('bad JPEG');
    const marker = buf[i + 1]!;
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  throw new Error('no SOF');
}

async function setUp(page: Page, slug: string) {
  const requests: { url: string; method: string; body: string | null }[] = [];
  page.on('request', (r) => requests.push({ url: r.url(), method: r.method(), body: r.postData() }));
  await page.goto(`/${slug}`);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  return requests;
}

/** True where the browser's own canvas writes AVIF (Safari's WebKit does; Chromium returns a PNG). */
async function nativeAvif(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = c.height = 2;
    const blob: Blob | null = await new Promise((r) => c.toBlob(r, 'image/avif'));
    return blob?.type === 'image/avif';
  });
}

async function convert(page: Page, file: string, timeout = 240_000): Promise<Buffer> {
  await page.locator('#file-input').setInputFiles(file);
  const download = page.waitForEvent('download', { timeout });
  await page.locator('#run').click();
  const path = await (await download).path();
  return readFileSync(path);
}

/** Decode with the site's own WebAssembly decoder, whatever the browser can do natively. */
async function decodeWithSite(page: Page, bytes: Buffer) {
  return page.evaluate(async (b64) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const url = '/vendor/jsquash-avif@2.1.1/decode.js';
    const mod = await import(/* @vite-ignore */ url);
    const img = (await mod.default(bin.buffer)) as ImageData;
    let minAlpha = 255;
    for (let i = 3; i < img.data.length; i += 4) minAlpha = Math.min(minAlpha, img.data[i]!);
    return { width: img.width, height: img.height, minAlpha, first: Array.from(img.data.slice(0, 4)) };
  }, bytes.toString('base64'));
}

test('JPG to AVIF: encodes at the same size, reads back, fetches the encoder only on Run, sends no file data', async ({ page }) => {
  test.setTimeout(300_000);
  const requests = await setUp(page, 'jpg-to-avif');
  await expect(page.locator('#quality')).toHaveValue('60');
  await expect(page.locator('#quality')).toHaveAttribute('min', '1');
  await expect(page.locator('#avif-field')).toBeVisible();
  expect(requests.filter((r) => /avif_enc/.test(r.url)), 'encoder not fetched before a conversion').toEqual([]);
  const source = readFileSync(PHOTO);
  const before = requests.length;
  const out = await convert(page, PHOTO);
  expect(out.subarray(4, 12).toString('latin1')).toMatch(/^ftypavi[fs]/);
  expect(out.length).toBeLessThan(source.length);
  const wasm = requests.filter((r) => /avif_enc\.wasm/.test(r.url));
  // Where the browser writes AVIF itself the WebAssembly encoder is not needed, so it is not fetched.
  if (await nativeAvif(page)) expect(wasm, 'native AVIF needs no encoder download').toEqual([]);
  else expect(wasm.length, 'the encoder is fetched when the conversion starts').toBeGreaterThan(0);
  for (const r of requests.slice(before).filter((r) => /^https?:/.test(r.url))) {
    expect(r.method, r.url).toBe('GET');
    expect(r.body, r.url).toBeNull();
    expect(new URL(r.url).host, r.url).toBe(new URL(page.url()).host);
  }
  const dims = jpegSize(source);
  const back = await decodeWithSite(page, out);
  expect({ width: back.width, height: back.height }).toEqual(dims);
  console.log(`AVIF_RESULT ${page.context().browser()?.browserType().name()} ${dims.width}x${dims.height} source=${source.length} avif=${out.length}`);
});

test('PNG to AVIF keeps transparency', async ({ page }) => {
  test.setTimeout(240_000);
  await setUp(page, 'png-to-avif');
  const png = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 160;
    c.height = 120;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#d33';
    ctx.fillRect(40, 30, 80, 60);
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/png'));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  });
  const file = join(mkdtempSync(join(tmpdir(), 'avif-')), 'alpha.png');
  writeFileSync(file, Buffer.from(png, 'base64'));
  const out = await convert(page, file);
  const back = await decodeWithSite(page, out);
  expect(back.width).toBe(160);
  expect(back.height).toBe(120);
  expect(back.minAlpha, 'transparent corners stay transparent').toBeLessThan(10);
  expect(back.first[3], 'top-left pixel is transparent').toBeLessThan(10);
});

test('Cancel ends a running AVIF encode', async ({ page }) => {
  test.setTimeout(120_000);
  await setUp(page, 'png-to-avif');
  test.skip(await nativeAvif(page), 'the browser writes AVIF itself, which is too fast to cancel');
  // Noise is the slowest thing to compress, so the encode is still running when Cancel is pressed.
  const png = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = c.height = 2600;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(c.width, c.height);
    for (let i = 0; i < img.data.length; i++) img.data[i] = i % 4 === 3 ? 255 : (Math.random() * 256) | 0;
    ctx.putImageData(img, 0, 0);
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/png'));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  });
  const file = join(mkdtempSync(join(tmpdir(), 'avif-')), 'noise.png');
  writeFileSync(file, Buffer.from(png, 'base64'));
  await page.locator('#file-input').setInputFiles(file);
  await page.locator('#run').click();
  await expect(page.locator('#avif-cancel')).toBeVisible();
  await page.locator('#avif-cancel').click();
  await expect(page.locator('#error')).toContainText(/cancel/i, { timeout: 20_000 });
  await expect(page.locator('#avif-cancel-field')).toBeHidden();
  await expect(page.locator('#run')).toBeEnabled();
});
