// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

// A flat blue 320x240 video (#305fa8, 3 s, with a tone): any watermark pixel is easy to find, and a colour cast
// on the untouched picture shows up as a drift from that blue.
const video = fileURLToPath(new URL('./fixtures/static/flat-blue-tone.mp4', import.meta.url));
const logo = fileURLToPath(new URL('./fixtures/static/logo-red.png', import.meta.url));
const BLUE = [0x30, 0x5f, 0xa8];

async function open(page: Page) {
  await page.goto('/tools/add-watermark-to-video');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(video);
}

async function run(page: Page): Promise<Buffer> {
  const download = page.waitForEvent('download');
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 120_000 });
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  return readFileSync(await (await download).path());
}

interface Look {
  width: number;
  height: number;
  duration: number;
  hasAudio: boolean;
  /** Per sampled time: pixels in each quadrant that differ strongly from the blue, and how far the plain middle strip is from it. */
  frames: { t: number; marked: { tl: number; tr: number; bl: number; br: number; mid: number }; drift: number }[];
}

/** Decode the output in the page and measure the sampled frames. */
async function look(page: Page, bytes: Buffer, times: number[], mark: 'white' | 'red'): Promise<Look> {
  return page.evaluate(
    async ({ data, times, markSrc, blue }) => {
      const isMark = (r: number, g: number, b: number) => (markSrc === 'white' ? r > 190 && g > 190 && b > 190 : r > 180 && g < 110 && b < 110);
      const v = document.createElement('video');
      v.muted = true;
      v.src = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: 'video/mp4' }));
      await new Promise((ok, bad) => {
        v.onloadeddata = ok;
        v.onerror = () => bad(new Error('the output does not play'));
      });
      const frames = [];
      for (const t of times) {
        await new Promise<void>((ok) => {
          let done = false;
          const finish = () => {
            if (!done) {
              done = true;
              setTimeout(ok, 50);
            }
          };
          v.onseeked = finish;
          if ('requestVideoFrameCallback' in v) v.requestVideoFrameCallback(finish);
          setTimeout(finish, 3000);
          v.currentTime = t;
        });
        const c = document.createElement('canvas');
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        const ctx = c.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(v, 0, 0);
        const { data: px } = ctx.getImageData(0, 0, c.width, c.height);
        const marked: Record<'tl' | 'tr' | 'bl' | 'br' | 'mid', number> = { tl: 0, tr: 0, bl: 0, br: 0, mid: 0 };
        let drift = 0;
        let n = 0;
        for (let y = 0; y < c.height; y++) {
          for (let x = 0; x < c.width; x++) {
            const i = (y * c.width + x) * 4;
            const r = px[i]!, g = px[i + 1]!, b = px[i + 2]!;
            const inMiddle = x > c.width * 0.4 && x < c.width * 0.6 && y > c.height * 0.35 && y < c.height * 0.65;
            if (isMark(r, g, b)) {
              const key = (inMiddle ? 'mid' : (y < c.height / 2 ? 't' : 'b') + (x < c.width / 2 ? 'l' : 'r')) as keyof typeof marked;
              marked[key]++;
            } else if (y > c.height * 0.4 && y < c.height * 0.6 && x < c.width * 0.3) {
              // A strip the watermarks never reach: the plain picture, to check for a colour cast.
              drift += Math.abs(r - blue[0]!) + Math.abs(g - blue[1]!) + Math.abs(b - blue[2]!);
              n++;
            }
          }
        }
        frames.push({ t, marked, drift: n ? drift / n / 3 : 999 });
      }
      return { width: v.videoWidth, height: v.videoHeight, duration: v.duration, hasAudio: true, frames };
    },
    { data: [...bytes], times, markSrc: mark, blue: BLUE },
  );
}

function isMp4(b: Buffer) {
  expect(b.subarray(4, 8).toString('latin1')).toBe('ftyp');
  expect(b.includes(Buffer.from('mdat')) && b.includes(Buffer.from('moov'))).toBe(true);
  // A sound track is still there: an 'mp4a' sample entry.
  expect(b.includes(Buffer.from('mp4a'))).toBe(true);
}

test('text watermark lands in the chosen corner on every sampled frame, sound kept, colours unchanged', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit' && !!process.env.CI, 'Linux WebKit in CI stalls decoding the clip; Chromium covers it there and macOS WebKit runs it locally');
  await open(page);
  await page.locator('#wm-text').fill('MARK');
  await page.locator('#wm-place').selectOption('bottom-right');
  await page.locator('#wm-size').fill('8');
  await page.locator('#wm-opacity').fill('100');
  const out = await run(page);
  isMp4(out);
  const r = await look(page, out, [0.3, 1.5, 2.6], 'white');
  expect(r.width).toBe(320);
  expect(r.height).toBe(240);
  expect(Math.abs(r.duration - 3)).toBeLessThan(0.3);
  for (const f of r.frames) {
    expect(f.marked.br, `bottom right at ${f.t}s`).toBeGreaterThan(40);
    expect(f.marked.tl + f.marked.tr + f.marked.bl, `other corners at ${f.t}s`).toBe(0);
    expect(f.drift, `colour cast at ${f.t}s`).toBeLessThan(10);
  }
});

test('logo watermark lands in the chosen corner', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit' && !!process.env.CI, 'Linux WebKit in CI stalls decoding the clip; Chromium covers it there and macOS WebKit runs it locally');
  await open(page);
  await page.locator('label:has(input[name="kind"][value="image"])').click();
  await page.locator('#wm-logo').setInputFiles(logo);
  await page.locator('#wm-place').selectOption('top-left');
  await page.locator('#wm-size').fill('6');
  await page.locator('#wm-opacity').fill('100');
  const out = await run(page);
  isMp4(out);
  const r = await look(page, out, [0.3, 2.6], 'red');
  expect(Math.abs(r.duration - 3)).toBeLessThan(0.3);
  for (const f of r.frames) {
    expect(f.marked.tl, `top left at ${f.t}s`).toBeGreaterThan(500);
    expect(f.marked.tr + f.marked.bl + f.marked.br, `other corners at ${f.t}s`).toBe(0);
    expect(f.drift, `colour cast at ${f.t}s`).toBeLessThan(10);
  }
});

test('image mode without a logo says what is missing', async ({ page }) => {
  await open(page);
  await page.locator('label:has(input[name="kind"][value="image"])').click();
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 30_000 });
  await expect(page.locator('#error')).toContainText(/logo/i);
});
