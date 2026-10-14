// @webkit-project
import { test, expect, type Page, type Download } from '@playwright/test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gifFrom, readGif, whiteIn, type Rect, type Shown } from './gif-helpers';

/**
 * Add text to GIF: the downloaded GIF is decoded in Node (gifuct-js, every frame composited the way
 * browsers play it) and compared with the GIF that went in. Runs in Chromium and WebKit.
 */

const dir = mkdtempSync(join(tmpdir(), 'add-text-to-gif-'));
const save = (name: string, bytes: Uint8Array) => {
  const file = join(dir, name);
  writeFileSync(file, bytes);
  return file;
};

const DARK = [
  [90, 20, 20],
  [20, 90, 20],
  [20, 20, 90],
  [90, 90, 20],
  [20, 90, 90],
] as const;

/** Solid dark frame, so white text cannot be mistaken for the picture. `clear` columns on the left are see-through. */
function solid(w: number, h: number, c: readonly number[], clear = 0): Uint8Array {
  const px = new Uint8Array(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    const transparent = p % w < clear;
    px.set(transparent ? [0, 0, 0, 0] : [c[0]!, c[1]!, c[2]!, 255], p * 4);
  }
  return px;
}

async function openTool(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const requests: { url: string; method: string; body: string | null }[] = [];
  page.on('request', (r) => requests.push({ url: r.url(), method: r.method(), body: r.postData() }));
  await page.goto('/tools/add-text-to-gif');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  return { errors, requests };
}

/** Drop the GIF, type the text in the plain white, no-effect style, and return the text's box (fractions of the picture). */
async function prepare(page: Page, file: string, text = 'HI', size = 20): Promise<Rect> {
  await page.locator('#file-input').setInputFiles(file);
  await expect(page.locator('#text-panel')).toBeVisible();
  await page.locator('#text1').fill(text);
  await page.locator('#text2').fill('');
  await page.locator('#effect').selectOption('none');
  await page.locator('#size').evaluate((el, v) => {
    (el as HTMLInputElement).value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, size);
  await expect.poll(async () => (await page.locator('#text-panel').getAttribute('data-boxes')) ?? '').toMatch(/^\[\[/);
  // The preview draws after the web font is ready; the box settles when the size has been applied.
  await expect(async () => {
    const [x, y, w, h] = (JSON.parse((await page.locator('#text-panel').getAttribute('data-boxes'))!) as number[][])[0]!;
    expect(w!).toBeGreaterThan(0.05);
    expect(y! + h!).toBeLessThan(1);
    expect(x!).toBeGreaterThan(0);
  }).toPass({ timeout: 10_000 });
  const [x, y, w, h] = (JSON.parse((await page.locator('#text-panel').getAttribute('data-boxes'))!) as number[][])[0]!;
  return { x: x!, y: y!, w: w!, h: h! };
}

async function addText(page: Page): Promise<{ download: Download; out: Shown }> {
  const downloads: Download[] = [];
  page.on('download', (d) => downloads.push(d));
  await page.locator('#run').click();
  await expect.poll(() => downloads.length, { timeout: 90_000 }).toBe(1);
  const path = await downloads[0]!.path();
  return { download: downloads[0]!, out: readGif(new Uint8Array(readFileSync(path!))) };
}

const px = (box: Rect, w: number, h: number, pad = 0) => ({
  x: Math.max(0, Math.floor(box.x * w) - pad),
  y: Math.max(0, Math.floor(box.y * h) - pad),
  w: Math.min(w, Math.ceil(box.w * w) + 2 * pad),
  h: Math.min(h, Math.ceil(box.h * h) + 2 * pad),
});

/** The largest channel difference between two frames over the pixels outside the rectangle, ignoring pixels see-through in both. */
function diffOutside(a: Uint8ClampedArray, b: Uint8ClampedArray, w: number, h: number, r: { x: number; y: number; w: number; h: number }): number {
  let d = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) continue;
      const q = (y * w + x) * 4;
      if (a[q + 3] === 0 && b[q + 3] === 0) continue;
      for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(a[q + c]! - b[q + c]!));
    }
  }
  return d;
}

test('every frame of the downloaded GIF carries the text; size, timing and loop count are kept', async ({ page }) => {
  const { errors, requests } = await openTool(page);
  const delays = [50, 70, 90, 110, 130];
  const input = await gifFrom({ w: 120, h: 80, frames: DARK.map((c) => ({ rgba: solid(120, 80, c) })), delays, repeat: 3 });
  const file = save('reaction.gif', input);
  const before = readGif(input);
  const box = await prepare(page, file);
  const { download, out } = await addText(page);

  expect(download.suggestedFilename()).toBe('reaction-text.gif');
  expect({ w: out.width, h: out.height, loop: out.loop, delays: out.delays }).toEqual({ w: 120, h: 80, loop: 3, delays });
  expect(out.frames).toHaveLength(5);
  const r = px(box, 120, 80);
  for (const [k, frame] of out.frames.entries()) {
    expect(whiteIn(before.frames[k]!, 120, r), `input frame ${k} has no white`).toBe(0);
    expect(whiteIn(frame, 120, r), `output frame ${k} shows the text`).toBeGreaterThan(40);
    // Away from the letters the picture is the input's, to within the colour quantizer's rounding.
    expect(diffOutside(frame, before.frames[k]!, 120, 80, px(box, 120, 80, 3)), `frame ${k} outside the text`).toBeLessThanOrEqual(8);
  }
  await expect(page.locator('#results-list .result-item')).toContainText('120×80, 5 frames, text added');
  expect(errors).toEqual([]);
  // Nothing about the GIF left the tab: only plain GETs for this site's own files.
  for (const q of requests) {
    if (q.url.startsWith('blob:') || q.url.startsWith('data:')) continue;
    expect(q.method, q.url).toBe('GET');
    expect(q.body, q.url).toBeNull();
    expect(q.url, q.url).not.toContain('reaction');
  }
});

test('a GIF with a transparent background keeps its transparent pixels and gets the text', async ({ page }) => {
  await openTool(page);
  const clear = 30;
  const frames = DARK.slice(0, 3).map((c) => ({ rgba: solid(120, 80, c, clear) }));
  const input = await gifFrom({ w: 120, h: 80, frames, delays: [80, 80, 80], repeat: 0, transparent: true });
  const box = await prepare(page, save('sticker.gif', input));
  expect(box.x * 120).toBeGreaterThan(clear + 4);
  const before = readGif(input);
  expect(before.frames.every((f) => f.filter((_, i) => i % 4 === 3 && f[i] === 0).length === clear * 80)).toBe(true);
  const { out } = await addText(page);
  expect(out.frames).toHaveLength(3);
  for (const [k, frame] of out.frames.entries()) {
    let clearPixels = 0;
    for (let i = 3; i < frame.length; i += 4) if (frame[i] === 0) clearPixels++;
    expect(clearPixels, `frame ${k} transparent pixels`).toBe(clear * 80);
    expect(whiteIn(frame, 120, px(box, 120, 80)), `frame ${k} text`).toBeGreaterThan(40);
  }
});

test('repeated frames are merged into one longer frame: fewer frames, the same total time, the text on all of them', async ({ page }) => {
  await openTool(page);
  const [a, b, c] = [solid(120, 80, DARK[0]), solid(120, 80, DARK[1]), solid(120, 80, DARK[2])] as [Uint8Array, Uint8Array, Uint8Array];
  const delays = [40, 60, 80, 100, 120, 140];
  const input = await gifFrom({ w: 120, h: 80, frames: [a, a, b, b, b, c].map((rgba) => ({ rgba })), delays, repeat: 0 });
  const box = await prepare(page, save('hold.gif', input));
  const { out } = await addText(page);
  expect(out.frames).toHaveLength(3);
  expect(out.delays).toEqual([100, 300, 140]);
  expect(out.delays.reduce((s, d) => s + d, 0)).toBe(delays.reduce((s, d) => s + d, 0));
  for (const frame of out.frames) expect(whiteIn(frame, 120, px(box, 120, 80))).toBeGreaterThan(40);
  await expect(page.locator('#results-list .result-item')).toContainText('120×80, 3 of 6 frames, text added');
});

test('a 0 ms delay is written as 100 ms, as browsers play it, and longer delays are kept', async ({ page }) => {
  await openTool(page);
  const input = await gifFrom({ w: 120, h: 80, frames: DARK.slice(0, 3).map((c) => ({ rgba: solid(120, 80, c) })), delays: [0, 10, 20], repeat: 0 });
  expect(readGif(input).delays).toEqual([0, 10, 20]);
  const box = await prepare(page, save('zero.gif', input));
  const { out } = await addText(page);
  expect(out.delays).toEqual([100, 100, 20]);
  for (const frame of out.frames) expect(whiteIn(frame, 120, px(box, 120, 80))).toBeGreaterThan(40);
});

test('a GIF that never loops stays a play-once GIF', async ({ page }) => {
  await openTool(page);
  const input = await gifFrom({ w: 120, h: 80, frames: DARK.slice(0, 2).map((c) => ({ rgba: solid(120, 80, c) })), delays: [60, 60], repeat: -1 });
  expect(readGif(input).loop).toBeUndefined();
  await prepare(page, save('once.gif', input));
  const { out } = await addText(page);
  expect(out.loop).toBeUndefined();
});

test('something that is not a GIF is refused with a message, and a run needs text', async ({ page }) => {
  await openTool(page);
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
  await page.locator('#file-input').setInputFiles(save('photo.gif', png));
  await expect(page.locator('#error')).toContainText('This file is not a GIF.');
  await page.locator('#clear').click();
  const input = await gifFrom({ w: 60, h: 40, frames: DARK.slice(0, 2).map((c) => ({ rgba: solid(60, 40, c) })), delays: [60, 60], repeat: 0 });
  await page.locator('#file-input').setInputFiles(save('plain.gif', input));
  await expect(page.locator('#text-panel')).toBeVisible();
  await page.locator('#text1').fill('');
  await page.locator('#run').click();
  await expect(page.locator('#error')).toContainText('Type some text first');
});

test.describe('a large GIF on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test.setTimeout(180_000);

  test('800 by 600 with 60 frames is written with the text on the first and last frame', async ({ page }) => {
    const { errors } = await openTool(page);
    const w = 800;
    const h = 600;
    const frames = Array.from({ length: 60 }, (_, k) => {
      const rgba = new Uint8Array(w * h * 4);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const inBlock = x >= k * 12 && x < k * 12 + 60 && y >= 400 && y < 460;
          rgba.set(inBlock ? [200, 60, 60, 255] : [20 + ((x * 90) / w) | 0, 20 + ((y * 90) / h) | 0, 110, 255], (y * w + x) * 4);
        }
      }
      return { rgba };
    });
    const input = await gifFrom({ w, h, frames, delays: Array.from({ length: 60 }, () => 60), repeat: 0 });
    const box = await prepare(page, save('big.gif', input), 'PHONE', 14);
    const { out } = await addText(page);
    expect({ w: out.width, h: out.height }).toEqual({ w, h });
    expect(out.frames).toHaveLength(60);
    expect(out.delays.every((d) => d === 60)).toBe(true);
    for (const k of [0, 59]) expect(whiteIn(out.frames[k]!, w, px(box, w, h)), `frame ${k}`).toBeGreaterThan(200);
    await expect(page.locator('#results-list .result-item')).toContainText('800×600, 60 frames');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
});
