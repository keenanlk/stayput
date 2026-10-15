// @webkit-project
import { test, expect, type Download, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gifFrom, readGif } from './gif-helpers';
import { frameAsWebp, parseAnimatedWebp } from '../src/lib/webp-anim';

/**
 * GIF to animated WebP: the downloaded file is parsed in Node (RIFF, VP8X, ANIM, ANMF) and compared
 * with the GIF that went in: frame count, summed delay, loop count and frame pixels. The browser
 * decodes each frame's still WebP for the pixel check. Runs in Chromium and WebKit.
 *
 * Loop count: a GIF loop N (N repeats) is N + 1 plays, the WebP ANIM count; 0 is forever; none plays once.
 *
 * Lossless must match the GIF's frames exactly. Lossy at quality 90 must keep the mean absolute
 * error per colour channel at or below LOSSY_MEAN_ERROR (the fixture is flat blocks and a gradient).
 */

const dir = mkdtempSync(join(tmpdir(), 'gif-to-webp-'));
const W = 48;
const H = 32;
const LOSSY_MEAN_ERROR = 8;
const COLOURS = [
  [200, 30, 30],
  [30, 200, 30],
  [30, 30, 200],
  [200, 200, 30],
  [30, 200, 200],
  [200, 30, 200],
] as const;
/** Shown delays in the file, in milliseconds; 0 is what a browser plays as 100. */
const DELAYS = [0, 100, 250, 40, 600, 30];
const SHOWN_DELAYS = DELAYS.map((d) => (d <= 10 ? 100 : d));

/** An opaque frame: a flat colour with a horizontal gradient band and a white square. */
function frame(c: readonly number[], n: number): Uint8Array {
  const px = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      const band = y >= 20 ? Math.round((x / W) * 60) : 0;
      px.set([Math.min(255, c[0]! + band), Math.min(255, c[1]! + band), Math.min(255, c[2]! + band), 255], o);
      if (x >= 4 + n && x < 12 + n && y >= 4 && y < 12) px.set([255, 255, 255, 255], o);
    }
  }
  return px;
}

async function makeGif(name: string, repeat: number): Promise<{ file: string; bytes: Uint8Array }> {
  const bytes = await gifFrom({ w: W, h: H, frames: COLOURS.map((c, i) => ({ rgba: frame(c, i * 3) })), delays: DELAYS, repeat });
  const file = join(dir, name);
  writeFileSync(file, bytes);
  return { file, bytes };
}

/** Run a conversion on /gif-to-webp and return the downloaded WebP and every request the page made. */
async function convert(page: Page, file: string, mode: 'lossy' | 'lossless') {
  const requests: { url: string; method: string; body: string | null }[] = [];
  const errors: string[] = [];
  page.on('request', (r) => requests.push({ url: r.url(), method: r.method(), body: r.postData() }));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/gif-to-webp');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#webp-mode').selectOption(mode);
  if (mode === 'lossy') await page.locator('#quality').fill('90');
  await page.locator('#file-input').setInputFiles(file);
  await expect(page.locator('#tool')).toHaveAttribute('data-count', '1');
  // Nothing is fetched for the encoder until Run is pressed.
  expect(requests.filter((r) => /jsquash-webp|webp_enc/.test(r.url))).toEqual([]);
  const downloads: Download[] = [];
  page.on('download', (d) => downloads.push(d));
  await page.locator('#run').click();
  await expect.poll(() => downloads.length, { timeout: 90_000 }).toBe(1);
  return { download: downloads[0]!, requests, errors, bytes: new Uint8Array(readFileSync((await downloads[0]!.path())!)) };
}

for (const [mode, repeat, loops] of [
  ['lossless', 0, 0],
  ['lossy', 3, 4],
] as const) {
  test(`GIF to animated WebP (${mode}, GIF loop ${repeat === 0 ? 'forever' : repeat} -> ANIM ${loops}) keeps frames, delays, loop count and pixels, and nothing but the encoder is fetched`, async ({ page }) => {
    const { file, bytes: gif } = await makeGif('secret-name.gif', repeat);
    const shown = readGif(gif);
    expect(shown.delays).toEqual(DELAYS);
    expect(shown.loop).toBe(repeat);

    const r = await convert(page, file, mode);
    expect(r.download.suggestedFilename()).toBe('secret-name.webp');

    // The container: RIFF/WEBP, VP8X with the animation flag, then ANIM and one ANMF per frame.
    const b = r.bytes;
    const tag = (o: number) => String.fromCharCode(...b.subarray(o, o + 4));
    expect(tag(0)).toBe('RIFF');
    expect(tag(8)).toBe('WEBP');
    expect(tag(12)).toBe('VP8X');
    expect(b[20]! & 0x02).toBe(0x02);
    expect(new DataView(b.buffer, b.byteOffset).getUint32(4, true) + 8).toBe(b.length);
    expect(tag(30)).toBe('ANIM');

    const anim = parseAnimatedWebp(b)!;
    expect(anim).toBeTruthy();
    expect([anim.width, anim.height]).toEqual([W, H]);
    expect(anim.frames).toHaveLength(shown.frames.length);
    expect(anim.loops).toBe(loops);
    const total = anim.frames.reduce((a, f) => a + f.duration, 0);
    expect(Math.abs(total - SHOWN_DELAYS.reduce((a, d) => a + d, 0))).toBeLessThanOrEqual(20);
    anim.frames.forEach((f, i) => expect(Math.abs(f.duration - SHOWN_DELAYS[i]!), `frame ${i} delay`).toBeLessThanOrEqual(20));

    // Pixels: the browser decodes each frame's still WebP.
    const stills = await Promise.all(anim.frames.map(async (f) => [...new Uint8Array(await frameAsWebp(f).arrayBuffer())]));
    const decoded = await page.evaluate(
      async ({ stills, w, h }) => {
        const out: number[][] = [];
        for (const s of stills) {
          const bmp = await createImageBitmap(new Blob([new Uint8Array(s)], { type: 'image/webp' }));
          const c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          const ctx = c.getContext('2d', { willReadFrequently: true })!;
          ctx.drawImage(bmp, 0, 0);
          out.push([...ctx.getImageData(0, 0, w, h).data]);
        }
        return out;
      },
      { stills, w: W, h: H },
    );
    expect(decoded).toHaveLength(shown.frames.length);
    for (const [i, px] of decoded.entries()) {
      const want = shown.frames[i]!;
      let sum = 0;
      let max = 0;
      for (let p = 0; p < W * H; p++) {
        for (let k = 0; k < 4; k++) {
          const d = Math.abs(px[p * 4 + k]! - want[p * 4 + k]!);
          sum += d;
          max = Math.max(max, d);
        }
      }
      if (mode === 'lossless') expect(max, `frame ${i} max error`).toBe(0);
      else expect(sum / (W * H * 4), `frame ${i} mean error`).toBeLessThanOrEqual(LOSSY_MEAN_ERROR);
    }

    // The result row compares sizes, and no request carries the file or its name.
    await expect(page.locator('#results')).toContainText(/%/);
    expect(r.requests.some((q) => /jsquash-webp.*webp_enc.*\.wasm/.test(q.url))).toBe(true);
    for (const q of r.requests) {
      if (q.url.startsWith('blob:') || q.url.startsWith('data:')) continue;
      expect(new URL(q.url).origin, q.url).toBe(new URL(page.url()).origin);
      expect(q.method, q.url).toBe('GET');
      expect(q.body, q.url).toBeNull();
      expect(q.url).not.toContain('secret-name');
    }
    expect(r.errors).toEqual([]);
  });
}

test('a GIF with no loop setting plays once, and a file that is not a GIF is refused before the encoder loads', async ({ page }) => {
  const g = await gifFrom({ w: W, h: H, frames: COLOURS.slice(0, 2).map((c, i) => ({ rgba: frame(c, i) })), delays: [100, 100], repeat: -1 });
  const once = join(dir, 'once.gif');
  writeFileSync(once, g);
  const r = await convert(page, once, 'lossy');
  expect(parseAnimatedWebp(r.bytes)!.loops).toBe(1);

  const requests: string[] = [];
  page.on('request', (q) => requests.push(q.url()));
  await page.reload();
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles({ name: 'fake.gif', mimeType: 'image/gif', buffer: Buffer.from('not a gif at all') });
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/);
  await expect(page.locator('#error')).toContainText('This file is not a GIF.');
  expect(requests.filter((u) => /jsquash-webp/.test(u))).toEqual([]);
});

test('a one-frame GIF gives a valid WebP the browser can decode', async ({ page }) => {
  const g = await gifFrom({ w: W, h: H, frames: [{ rgba: frame(COLOURS[0], 0) }], delays: [100], repeat: -1 });
  const file = join(dir, 'still.gif');
  writeFileSync(file, g);
  const r = await convert(page, file, 'lossless');
  const b = r.bytes;
  expect(String.fromCharCode(...b.subarray(0, 4))).toBe('RIFF');
  expect(String.fromCharCode(...b.subarray(8, 12))).toBe('WEBP');
  expect(new DataView(b.buffer, b.byteOffset).getUint32(4, true) + 8).toBe(b.length);
  const anim = parseAnimatedWebp(b)!;
  expect(anim.frames).toHaveLength(1);
  const size = await page.evaluate(async (s) => {
    const bmp = await createImageBitmap(new Blob([new Uint8Array(s)], { type: 'image/webp' }));
    return [bmp.width, bmp.height];
  }, [...new Uint8Array(await frameAsWebp(anim.frames[0]!).arrayBuffer())]);
  expect(size).toEqual([W, H]);
});

test('a cut-short GIF is refused with the damaged-file message and no encoder fetch', async ({ page }) => {
  const g = await gifFrom({ w: W, h: H, frames: COLOURS.slice(0, 3).map((c, i) => ({ rgba: frame(c, i) })), delays: [100, 100, 100], repeat: 0 });
  const requests: string[] = [];
  page.on('request', (q) => requests.push(q.url()));
  await page.goto('/gif-to-webp');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles({ name: 'cut.gif', mimeType: 'image/gif', buffer: Buffer.from(g.subarray(0, 40)) });
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/);
  await expect(page.locator('#error')).toContainText(/could not be read|damaged/);
  expect(requests.filter((u) => /jsquash-webp/.test(u))).toEqual([]);
});
