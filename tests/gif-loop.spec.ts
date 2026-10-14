// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gifFrom, readGif } from './gif-helpers';

/** Loop GIF: the loop block of the downloaded GIF, read from its bytes, and what stays the same. */

const dir = mkdtempSync(join(tmpdir(), 'gif-loop-'));
const COLOURS = [[200, 30, 30], [30, 200, 30], [30, 30, 200]] as const;
const delays = [40, 70, 100];

async function makeGif(repeat: number) {
  const frames = COLOURS.map((c) => {
    const px = new Uint8Array(40 * 30 * 4);
    for (let p = 0; p < 40 * 30; p++) px.set([c[0], c[1], c[2], 255], p * 4);
    return { rgba: px };
  });
  const bytes = await gifFrom({ w: 40, h: 30, frames, delays, repeat });
  const file = join(dir, 'clip.gif');
  writeFileSync(file, bytes);
  return file;
}

async function run(page: Page, url: string, file: string, set?: () => Promise<void>) {
  await page.goto(url);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(file);
  await expect(page.locator('#tool')).toHaveAttribute('data-count', '1');
  await set?.();
  const downloads: import('@playwright/test').Download[] = [];
  page.on('download', (d) => downloads.push(d));
  await page.locator('#run').click();
  await expect.poll(() => downloads.length, { timeout: 60_000 }).toBe(1);
  return { out: readGif(new Uint8Array(readFileSync((await downloads[0]!.path())!))), name: downloads[0]!.suggestedFilename() };
}

test('Loop GIF sets forever (count 0) and keeps frames, size and delays', async ({ page }) => {
  const { out, name } = await run(page, '/loop-gif', await makeGif(-1));
  expect(name).toBe('clip-looped.gif');
  expect(out.loop).toBe(0);
  expect(out.frames).toHaveLength(3);
  expect(out.delays).toEqual(delays);
  expect({ w: out.width, h: out.height }).toEqual({ w: 40, h: 30 });
});

test('Loop GIF plays a set number of times: N plays is a count of N - 1', async ({ page }) => {
  const { out } = await run(page, '/loop-gif', await makeGif(0), async () => {
    await page.locator('#loops').selectOption('times');
    await page.locator('#loop-times').fill('5');
  });
  expect(out.loop).toBe(4);
  expect(out.delays).toEqual(delays);
});

test('Loop GIF set to once leaves the loop block out', async ({ page }) => {
  const { out } = await run(page, '/loop-gif', await makeGif(0), async () => {
    await page.locator('#loops').selectOption('once');
  });
  expect(out.loop).toBeUndefined();
  expect(out.frames).toHaveLength(3);
  expect(out.delays).toEqual(delays);
});

test('Forward and back adds the middle frames in reverse', async ({ page }) => {
  const { out } = await run(page, '/loop-gif', await makeGif(0), async () => {
    await page.locator('#pingpong').check();
  });
  expect(out.frames).toHaveLength(4);
  expect(out.delays).toEqual([40, 70, 100, 70]);
  expect(out.loop).toBe(0);
});

test('The speed tool keeps the source loop setting by default', async ({ page }) => {
  const { out } = await run(page, '/tools/gif-speed', await makeGif(3));
  expect(out.loop).toBe(3);
});
