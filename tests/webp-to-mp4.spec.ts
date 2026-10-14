// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * WebP to MP4: the downloaded video is played back in the page. Safari cannot encode WebP, so the
 * inputs are committed fixtures: a 40-frame animation (64x48, 50 ms each) and a three-frame one
 * built with blend and dispose modes (red 64x64; half-transparent blue 32x32 at 16,16 that is
 * disposed to background; opaque green 16x16 at 0,0, no blend).
 */
const staticFx = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: 'window.__events=[];window.umami={track:(n,d)=>window.__events.push({n,d})};' }),
  );
  await page.goto('/webp-to-mp4');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  return errors;
}

async function convert(page: Page, file: string) {
  await page.locator('#file-input').setInputFiles(file);
  await expect(page.locator('#tool')).toHaveAttribute('data-count', '1');
  const download = page.waitForEvent('download', { timeout: 90_000 });
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 90_000 });
  return new Uint8Array(readFileSync((await (await download).path())!));
}

/** Length, size and mean colour of a small patch at each point and moment. */
async function probe(page: Page, bytes: Uint8Array, shots: { t: number; x: number; y: number }[]) {
  return page.evaluate(async ({ data, shots }) => {
    const v = document.createElement('video');
    v.muted = true;
    v.src = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: 'video/mp4' }));
    await new Promise((ok, bad) => { v.onloadeddata = ok; v.onerror = () => bad(new Error('video will not load')); });
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    const colours: number[][] = [];
    for (const s of shots) {
      await new Promise<void>((ok) => {
        let seeked = false;
        let presented = false;
        const done = () => seeked && presented && ok();
        v.requestVideoFrameCallback(() => ((presented = true), done()));
        v.onseeked = () => {
          seeked = true;
          setTimeout(() => ((presented = true), done()), 1000);
          done();
        };
        v.currentTime = s.t;
      });
      ctx.drawImage(v, 0, 0);
      const d = ctx.getImageData(s.x - 1, s.y - 1, 3, 3).data;
      const sum = [0, 0, 0];
      for (let i = 0; i < 9; i++) for (let k = 0; k < 3; k++) sum[k]! += d[i * 4 + k]!;
      colours.push(sum.map((n) => Math.round(n / 9)));
    }
    return { duration: v.duration, width: v.videoWidth, height: v.videoHeight, colours };
  }, { data: [...bytes], shots });
}

const near = (got: number[], want: number[], tol = 45) => got.forEach((g, i) => expect(Math.abs(g - want[i]!), `${got} vs ${want}`).toBeLessThanOrEqual(tol));

test('a 40-frame animated WebP becomes an MP4 as long as its frame delays, at its own even size', async ({ page }) => {
  const errors = await open(page);
  const requests: string[] = [];
  page.on('request', (r) => { if (r.method() !== 'GET' || r.postData()) requests.push(`${r.method()} ${r.url()}`); });
  const mp4 = await convert(page, staticFx('anim-40.webp'));
  await expect(page.locator('#results-list .result-item')).toContainText('64×48, 2.0 s');
  const info = await probe(page, mp4, [{ t: 0.05, x: 32, y: 40 }]);
  expect(Math.abs(info.duration - 2)).toBeLessThanOrEqual(0.2);
  expect([info.width, info.height]).toEqual([64, 48]);
  expect(requests.filter((r) => !r.includes('stats.keenankaufman.com'))).toEqual([]);
  expect(errors).toEqual([]);
});

test('blend and dispose modes render as the file says, and transparency takes the chosen colour', async ({ page }) => {
  await open(page);
  const mp4 = await convert(page, staticFx('blend-dispose.webp'));
  const r = await probe(page, mp4, [
    { t: 0.05, x: 32, y: 32 }, // frame 1: red
    { t: 0.15, x: 32, y: 32 }, // frame 2: half-transparent blue over red
    { t: 0.15, x: 4, y: 60 }, // frame 2: still red outside the blue patch
    { t: 0.25, x: 2, y: 2 }, // frame 3: green, written without blending
    { t: 0.25, x: 40, y: 40 }, // frame 3: the disposed patch is transparent, so the white background
    { t: 0.25, x: 60, y: 60 }, // frame 3: red remains
  ]);
  expect(Math.abs(r.duration - 0.3)).toBeLessThanOrEqual(0.2);
  near(r.colours[0]!, [255, 0, 0]);
  near(r.colours[1]!, [128, 0, 128], 60);
  near(r.colours[2]!, [255, 0, 0]);
  near(r.colours[3]!, [0, 255, 0]);
  near(r.colours[4]!, [255, 255, 255]);
  near(r.colours[5]!, [255, 0, 0]);
});

test('a still WebP points to WebP to PNG, and a file that is not a WebP gets a clear message', async ({ page }) => {
  await open(page);
  await page.locator('#file-input').setInputFiles(staticFx('tiny.webp'));
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/);
  await expect(page.locator('#error')).toContainText('This WebP has one frame');
  await expect(page.locator('#error a')).toHaveAttribute('href', '/webp-to-png');
  await page.reload();
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles({ name: 'fake.webp', mimeType: 'image/webp', buffer: Buffer.from('not an image at all, just some text') });
  await page.locator('#run').click();
  await expect(page.locator('#error')).toContainText('This file is not a WebP image.');
});
