import { test, expect, type Page, type Download, type Request } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// /psd-to-jpg and /psd-to-png read the flattened image saved in a Photoshop file (ag-psd) and write
// a JPG or PNG. The fixtures are layered PSDs written by tests/fixtures/make-psd.mjs; their composite
// is known pixel for pixel. Runs in the chromium project and in the webkit project (Safari's engine).
const fx = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));
const W = 160;
const H = 120;

async function bytesOf(d: Download): Promise<Uint8Array> {
  return new Uint8Array(readFileSync((await d.path())!));
}

/** Every request must be a plain same-site GET: nothing that could carry the file. */
function watchRequests(page: Page) {
  const seen: Request[] = [];
  page.on('request', (r) => seen.push(r));
  return () => {
    expect(seen.length).toBeGreaterThan(0);
    for (const r of seen) {
      if (r.url().startsWith('blob:') || r.url().startsWith('data:')) continue;
      const u = new URL(r.url());
      if (u.hostname === 'stats.keenankaufman.com') {
        expect((r.postData() ?? '').length, 'usage ping is tiny').toBeLessThan(2048);
        expect(r.postData() ?? '').not.toMatch(/\.psd|layered|transparent/);
        continue;
      }
      expect(u.hostname, r.url()).toBe('localhost');
      expect(r.method(), r.url()).toBe('GET');
      expect(r.postData(), r.url()).toBeNull();
    }
  };
}

async function convert(page: Page, slug: string, file: string | { name: string; mimeType: string; buffer: Buffer }) {
  await page.goto(`/${slug}`);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(file);
  await expect(page.locator('#tool')).toHaveAttribute('data-count', '1');
  const downloads: Download[] = [];
  page.on('download', (d) => downloads.push(d));
  await page.locator('#run').click();
  return downloads;
}

/** Decode the image in the page and read a few pixels. */
async function pixels(page: Page, bytes: Uint8Array, type: string, at: [number, number][]) {
  return page.evaluate(
    async ([b, t, pts]) => {
      const bm = await createImageBitmap(new Blob([new Uint8Array(b as number[])], { type: t as string }));
      const c = new OffscreenCanvas(bm.width, bm.height);
      const ctx = c.getContext('2d')!;
      ctx.drawImage(bm, 0, 0);
      return { width: bm.width, height: bm.height, px: (pts as [number, number][]).map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data]) };
    },
    [[...bytes], type, at] as const,
  );
}

/** Header facts read straight from the bytes. */
function jpegInfo(b: Uint8Array) {
  expect([b[0], b[1]]).toEqual([0xff, 0xd8]);
  let i = 2;
  let size: [number, number] | undefined;
  let icc: string | false = false;
  while (i + 4 < b.length) {
    if (b[i] !== 0xff) break;
    const m = b[i + 1]!;
    const len = (b[i + 2]! << 8) | b[i + 3]!;
    if (m === 0xe2 && String.fromCharCode(...b.subarray(i + 4, i + 15)) === 'ICC_PROFILE') icc = String.fromCharCode(...b.subarray(i + 18, i + 2 + len));
    if (m >= 0xc0 && m <= 0xc2) size = [(b[i + 7]! << 8) | b[i + 8]!, (b[i + 5]! << 8) | b[i + 6]!];
    if (m === 0xda) break;
    i += 2 + len;
  }
  return { size, icc };
}
function pngInfo(b: Uint8Array) {
  expect(Array.from(b.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const chunks: string[] = [];
  for (let i = 8; i + 8 <= b.length; i += 12 + dv.getUint32(i)) chunks.push(String.fromCharCode(...b.subarray(i + 4, i + 8)));
  return { size: [dv.getUint32(16), dv.getUint32(20)] as [number, number], colourType: b[25]!, chunks };
}

const near = (px: number[] | undefined, want: number[], tol: number) => px!.slice(0, want.length).every((v, i) => Math.abs(v - want[i]!) <= tol);

for (const [fixture, opaque] of [['layered.psd', true], ['transparent.psd', false]] as const) {
  test(`PSD to JPG converts ${fixture} to a valid JPG at its size, and nothing leaves the tab`, async ({ page }) => {
    const assertQuiet = watchRequests(page);
    const downloads = await convert(page, 'psd-to-jpg', fx(fixture));
    await expect.poll(() => downloads.length, { timeout: 30_000 }).toBe(1);
    expect(downloads[0]!.suggestedFilename()).toBe(fixture.replace('.psd', '.jpg'));
    const out = await bytesOf(downloads[0]!);
    const info = jpegInfo(out);
    expect(info.size).toEqual([W, H]);
    // The PSD's own profile is not carried over; the browser may tag its output with a standard RGB display profile.
    if (info.icc) expect(info.icc).toContain('mntrRGB');
    const got = await pixels(page, out, 'image/jpeg', [[5, 5], [80, 60], [5, 115], [155, 5]]);
    expect([got.width, got.height]).toEqual([W, H]);
    if (opaque) {
      expect(near(got.px[0], [40, 110, 220], 12), `sky ${got.px[0]}`).toBe(true);
      expect(near(got.px[1], [250, 210, 40], 12), `sun ${got.px[1]}`).toBe(true);
      expect(near(got.px[2], [255, 255, 255], 6), `ground ${got.px[2]}`).toBe(true);
    } else {
      // JPG has no alpha: the see-through areas take the background colour, white by default.
      expect(near(got.px[0], [255, 255, 255], 6), `corner ${got.px[0]}`).toBe(true);
      expect(near(got.px[3], [255, 255, 255], 6)).toBe(true);
      expect(near([...got.px[1]!].slice(0, 3), [220, 40, 40], 12), `disc ${got.px[1]}`).toBe(true);
    }
    assertQuiet();
  });

  test(`PSD to PNG converts ${fixture} to a valid PNG${opaque ? '' : ' that keeps its transparency'}`, async ({ page }) => {
    const assertQuiet = watchRequests(page);
    const downloads = await convert(page, 'psd-to-png', fx(fixture));
    await expect.poll(() => downloads.length, { timeout: 30_000 }).toBe(1);
    expect(downloads[0]!.suggestedFilename()).toBe(fixture.replace('.psd', '.png'));
    const out = await bytesOf(downloads[0]!);
    const info = pngInfo(out);
    expect(info.size).toEqual([W, H]);
    expect(info.chunks, 'the PSD’s colour profile is not written').not.toContain('iCCP');
    const got = await pixels(page, out, 'image/png', [[5, 5], [80, 60], [80, 50], [5, 115], [155, 5]]);
    expect([got.width, got.height]).toEqual([W, H]);
    if (opaque) {
      expect(got.px[0]).toEqual([40, 110, 220, 255]);
      expect(got.px[1]).toEqual([250, 210, 40, 255]);
      expect(got.px[3]).toEqual([255, 255, 255, 255]);
    } else {
      expect(info.colourType, 'RGBA').toBe(6);
      expect(got.px[0]![3], 'corner is see-through').toBe(0);
      expect(got.px[4]![3]).toBe(0);
      expect(got.px[3]![3]).toBe(0);
      expect(got.px[2]).toEqual([220, 40, 40, 255]);
    }
    assertQuiet();
  });
}

test('A file that is not a readable PSD says what to do, and a PSB is declined', async ({ page }) => {
  const notPsd = await convert(page, 'psd-to-jpg', { name: 'broken.psd', mimeType: 'image/vnd.adobe.photoshop', buffer: Buffer.from('8BPS\x00\x01 this is not a photoshop document') });
  await expect(page.locator('#results-list, #error').first()).toContainText(/Maximize PSD and PSB File Compatibility|could not be/i, { timeout: 30_000 });
  expect(notPsd.length).toBe(0);
  const psb = Buffer.concat([Buffer.from('8BPS\x00\x02'), Buffer.alloc(40)]);
  await convert(page, 'psd-to-png', { name: 'big.psd', mimeType: 'image/vnd.adobe.photoshop', buffer: psb });
  await expect(page.locator('#results-list, #error').first()).toContainText(/PSB/, { timeout: 30_000 });
});
