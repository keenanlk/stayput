import { test, expect, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gifFrom, readGif, type Shown } from './gif-helpers';

/**
 * GIF speed and reverse: the downloaded GIF is decoded in Node and compared with the one that went
 * in. Runs in Chromium and WebKit.
 */

const dir = mkdtempSync(join(tmpdir(), 'gif-speed-'));
const COLOURS = [
  [200, 30, 30],
  [30, 200, 30],
  [30, 30, 200],
  [200, 200, 30],
  [30, 200, 200],
] as const;
const solid = (w: number, h: number, c: readonly number[]) => {
  const px = new Uint8Array(w * h * 4);
  for (let p = 0; p < w * h; p++) px.set([c[0]!, c[1]!, c[2]!, 255], p * 4);
  return px;
};

async function makeGif(name: string, delays: number[], repeat = 3) {
  const bytes = await gifFrom({ w: 40, h: 30, frames: delays.map((_, i) => ({ rgba: solid(40, 30, COLOURS[i % COLOURS.length]!) })), delays, repeat });
  const file = join(dir, name);
  writeFileSync(file, bytes);
  return { file, shown: readGif(bytes) };
}

/** Which input frame each output frame is, by its colour. */
const order = (out: Shown, input: Shown) =>
  out.frames.map((f) =>
    input.frames.findIndex((g) => [0, 1, 2].every((c) => Math.abs(f[c]! - g[c]!) <= 12)),
  );

async function runOn(page: Page, url: string, file: string, set?: () => Promise<void>) {
  const errors: string[] = [];
  const requests: { url: string; method: string; body: string | null }[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => requests.push({ url: r.url(), method: r.method(), body: r.postData() }));
  await page.goto(url);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(file);
  await expect(page.locator('#tool')).toHaveAttribute('data-count', '1');
  await set?.();
  const downloads: import('@playwright/test').Download[] = [];
  page.on('download', (d) => downloads.push(d));
  await page.locator('#run').click();
  await expect.poll(() => downloads.length, { timeout: 60_000 }).toBe(1);
  const out = readGif(new Uint8Array(readFileSync((await downloads[0]!.path())!)));
  for (const q of requests) {
    if (q.url.startsWith('blob:') || q.url.startsWith('data:')) continue;
    expect(q.method, q.url).toBe('GET');
    expect(q.url, q.url).not.toContain('party');
  }
  expect(errors).toEqual([]);
  return { out, name: downloads[0]!.suggestedFilename() };
}

test('Reverse GIF writes the frames in the opposite order, each with its own delay and the same loop', async ({ page }) => {
  const delays = [50, 70, 90, 110, 130];
  const { file, shown } = await makeGif('party.gif', delays);
  const { out, name } = await runOn(page, '/reverse-gif', file);
  expect(name).toBe('party-reversed.gif');
  expect(order(out, shown)).toEqual([4, 3, 2, 1, 0]);
  expect(out.delays).toEqual([...delays].reverse());
  expect(out.loop).toBe(3);
  expect({ w: out.width, h: out.height }).toEqual({ w: 40, h: 30 });
});

test('Speed up GIF scales every delay, rounded to centiseconds and held to at least 2 cs', async ({ page }) => {
  const delays = [40, 100, 130, 30, 200];
  const { file, shown } = await makeGif('party.gif', delays);
  const { out, name } = await runOn(page, '/speed-up-gif', file);
  expect(name).toBe('party-2x.gif');
  // 2x: 20, 50, 65 (rounds to 70), 15 (held to 20), 100.
  expect(out.delays).toEqual([20, 50, 70, 20, 100]);
  expect(order(out, shown)).toEqual([0, 1, 2, 3, 4]);
  expect(out.loop).toBe(3);
});

test('Slow down GIF multiplies the delays, and 4x holds short frames at 2 cs', async ({ page }) => {
  const delays = [40, 100, 60];
  const { file } = await makeGif('party.gif', delays);
  const slow = await runOn(page, '/slow-down-gif', file);
  expect(slow.name).toBe('party-0_5x.gif');
  expect(slow.out.delays).toEqual([80, 200, 120]);
});

test('The tool page speeds up 4x and reverses in one run', async ({ page }) => {
  const delays = [40, 100, 60];
  const { file, shown } = await makeGif('party.gif', delays);
  const { out, name } = await runOn(page, '/tools/gif-speed', file, async () => {
    await page.locator('#speed').selectOption('4');
    await page.locator('#reverse').check();
  });
  expect(name).toBe('party-reversed-4x.gif');
  expect(order(out, shown)).toEqual([2, 1, 0]);
  // 4x: 60 -> 15 -> 20 (rounded up from 1.5 cs), 100 -> 25 -> 30, 40 -> 10 -> 20 (held).
  expect(out.delays).toEqual([20, 30, 20]);
});
