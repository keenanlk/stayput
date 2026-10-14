// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * WebP output on every browser. Chrome and Firefox encode WebP natively and must not download the
 * WebAssembly encoder; Safari (WebKit) cannot, and gets @jsquash/webp from this site's own /vendor/.
 */
async function open(page: Page, slug: string) {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: 'window.__events=[];window.umami={track:(n,d)=>window.__events.push({n,d})};' }),
  );
  await page.goto(`/${slug}`);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  return { requests, errors };
}

/** A noisy picture, so the quality setting visibly changes the size. */
async function picture(page: Page, type: 'image/png' | 'image/jpeg', w: number, h: number): Promise<Buffer> {
  const bytes = await page.evaluate(async ({ type, w, h }) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#e63946');
    g.addColorStop(1, '#1d3557');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = `hsl(${(i * 47) % 360} 70% 50%)`;
      ctx.fillRect((i * 97) % w, (i * 53) % h, 12, 9);
    }
    const blob = await new Promise<Blob>((ok) => c.toBlob((b) => ok(b!), type, 0.95));
    return [...new Uint8Array(await blob.arrayBuffer())];
  }, { type, w, h });
  return Buffer.from(bytes);
}

async function convert(page: Page, name: string, mimeType: string, buffer: Buffer, quality?: number) {
  if (quality !== undefined) await page.locator('#quality').evaluate((el: HTMLInputElement, q) => { el.value = q; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, String(quality));
  await page.locator('#file-input').setInputFiles({ name, mimeType, buffer });
  await expect(page.locator('#tool')).toHaveAttribute('data-count', '1');
  const download = page.waitForEvent('download', { timeout: 120_000 });
  const t0 = Date.now();
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 120_000 });
  const file = await download;
  const bytes = readFileSync((await file.path())!);
  return { bytes, ms: Date.now() - t0, name: file.suggestedFilename() };
}

function expectWebp(bytes: Buffer) {
  expect(bytes.subarray(0, 4).toString('latin1')).toBe('RIFF');
  expect(bytes.subarray(8, 12).toString('latin1')).toBe('WEBP');
  expect(bytes.readUInt32LE(4) + 8).toBe(bytes.length);
}

async function decodedSize(page: Page, bytes: Buffer) {
  return page.evaluate(async (data) => {
    const bmp = await createImageBitmap(new Blob([new Uint8Array(data)], { type: 'image/webp' }));
    return { w: bmp.width, h: bmp.height };
  }, [...bytes]);
}

function checkNetwork(requests: string[], browserName: string, origin: string) {
  const wasm = requests.filter((u) => u.includes('/vendor/jsquash-webp@'));
  const foreign = requests.filter((u) => !u.startsWith(`${origin}/`) && !u.startsWith('data:') && !u.startsWith('blob:') && !u.startsWith('about:') && !u.includes('stats.keenankaufman.com'));
  expect(foreign, 'only our own origin').toEqual([]);
  if (browserName === 'chromium') expect(wasm, 'native encoder, no jsquash download').toEqual([]);
  else expect(wasm.some((u) => u.endsWith('webp_enc.wasm')), 'WebAssembly encoder fetched from our origin').toBe(true);
}

for (const [slug, type, ext] of [
  ['png-to-webp', 'image/png', 'png'],
  ['jpg-to-webp', 'image/jpeg', 'jpg'],
] as const) {
  test(`${slug} writes a valid WebP at the source size`, async ({ page, browserName }) => {
    const { requests, errors } = await open(page, slug);
    await expect(page.locator('#format option[value="image/webp"]')).toBeEnabled();
    const src = await picture(page, type, 321, 203);
    const out = await convert(page, `photo.${ext}`, type, src);
    expect(out.name).toBe('photo.webp');
    expectWebp(out.bytes);
    expect(await decodedSize(page, out.bytes)).toEqual({ w: 321, h: 203 });
    checkNetwork(requests, browserName, new URL(page.url()).origin);
    expect(errors).toEqual([]);
  });
}

test('the quality setting still changes the WebP size', async ({ page }) => {
  await open(page, 'png-to-webp');
  const src = await picture(page, 'image/png', 600, 400);
  const low = await convert(page, 'a.png', 'image/png', src, 40);
  await page.reload();
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  const high = await convert(page, 'a.png', 'image/png', src, 100);
  expectWebp(low.bytes);
  expectWebp(high.bytes);
  expect(low.bytes.length).toBeLessThan(high.bytes.length);
});

test('the image converter offers WebP as an output', async ({ page }) => {
  await open(page, 'tools/convert-image');
  await expect(page.locator('#format option[value="image/webp"]')).toBeEnabled();
  await expect(page.locator('#format option[value="image/webp"]')).not.toContainText('not supported');
});

test('a 12 MP photo encodes to WebP (timing is logged)', async ({ page, browserName }) => {
  test.setTimeout(240_000);
  await open(page, 'jpg-to-webp');
  const src = await picture(page, 'image/jpeg', 4000, 3000);
  const out = await convert(page, 'big.jpg', 'image/jpeg', src);
  expectWebp(out.bytes);
  expect(await decodedSize(page, out.bytes)).toEqual({ w: 4000, h: 3000 });
  console.log(`[webp-output] ${browserName}: 12 MP JPG -> WebP in ${out.ms} ms, ${out.bytes.length} bytes`);
});
