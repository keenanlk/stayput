// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gifFrom, readGif } from './gif-helpers';

/**
 * Rotate and flip GIF: the downloaded GIF is decoded in Node and compared with the one that went in.
 * Runs in Chromium and WebKit.
 */

const dir = mkdtempSync(join(tmpdir(), 'gif-rotate-'));
const W = 40;
const H = 24;
const COLOURS = [
  [200, 30, 30],
  [30, 200, 30],
  [30, 30, 200],
  [200, 200, 30],
] as const;
const WHITE = [255, 255, 255] as const;

/** Each frame is one colour with a white 6x6 mark in its top-left corner, so turns and flips can be told apart. */
function frame(c: readonly number[]) {
  const px = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const mark = x < 6 && y < 6;
      px.set(mark ? [255, 255, 255, 255] : [c[0]!, c[1]!, c[2]!, 255], (y * W + x) * 4);
    }
  }
  return { rgba: px };
}

async function rotate(page: Page, file: string, set: () => Promise<void>) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/rotate-gif');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(file);
  await expect(page.locator('#tool')).toHaveAttribute('data-count', '1');
  await set();
  const downloads: import('@playwright/test').Download[] = [];
  page.on('download', (d) => downloads.push(d));
  await page.locator('#run').click();
  await expect.poll(() => downloads.length, { timeout: 60_000 }).toBe(1);
  const out = readGif(new Uint8Array(readFileSync((await downloads[0]!.path())!)));
  expect(errors).toEqual([]);
  return { out, name: downloads[0]!.suggestedFilename() };
}

/** The radio is visually hidden; click the label that wraps it, as a person would. */
const pick = (page: Page, value: string) => page.locator(`label:has(input[name="rotate"][value="${value}"])`).click();

const near = (a: Uint8ClampedArray, x: number, y: number, w: number, c: readonly number[]) =>
  [0, 1, 2].every((k) => Math.abs(a[(y * w + x) * 4 + k]! - c[k]!) <= 12);

const delays = [50, 70, 90, 110];
let file: string;
test.beforeAll(async () => {
  const bytes = await gifFrom({ w: W, h: H, frames: COLOURS.map(frame), delays, repeat: 3 });
  file = join(dir, 'party.gif');
  writeFileSync(file, bytes);
});

for (const turn of ['90', '270'] as const) {
  test(`Rotate GIF ${turn}° keeps every frame and swaps width and height`, async ({ page }) => {
    const { out, name } = await rotate(page, file, async () => {
      await pick(page, turn);
    });
    expect(name).toBe(`party-rotated-${turn}.gif`);
    expect({ w: out.width, h: out.height }).toEqual({ w: H, h: W });
    expect(out.frames).toHaveLength(4);
    expect(out.delays).toEqual(delays);
    expect(out.loop).toBe(3);
    // The white mark started top-left: clockwise it ends top-right, counter-clockwise bottom-left.
    const [x, y] = turn === '90' ? [H - 3, 3] : [3, W - 3];
    expect(near(out.frames[0]!, x!, y!, H, WHITE)).toBe(true);
    expect(near(out.frames[1]!, H / 2, W / 2, H, COLOURS[1])).toBe(true);
  });
}

test('Rotate GIF 180° keeps the size and puts the mark bottom-right', async ({ page }) => {
  const { out } = await rotate(page, file, async () => {
    await pick(page, '180');
  });
  expect({ w: out.width, h: out.height }).toEqual({ w: W, h: H });
  expect(out.frames).toHaveLength(4);
  expect(near(out.frames[0]!, W - 3, H - 3, W, WHITE)).toBe(true);
});

test('Flip horizontally mirrors left to right without turning', async ({ page }) => {
  const { out, name } = await rotate(page, file, async () => {
    await pick(page, '0');
    await page.locator('#flip-h').check({ force: true });
  });
  expect(name).toBe('party-flipped-h.gif');
  expect({ w: out.width, h: out.height }).toEqual({ w: W, h: H });
  expect(out.frames).toHaveLength(4);
  expect(out.delays).toEqual(delays);
  expect(near(out.frames[0]!, W - 3, 3, W, WHITE)).toBe(true);
});

test('Flip vertically puts the mark bottom-left', async ({ page }) => {
  const { out } = await rotate(page, file, async () => {
    await pick(page, '0');
    await page.locator('#flip-v').check({ force: true });
  });
  expect(out.frames).toHaveLength(4);
  expect(near(out.frames[0]!, 3, H - 3, W, WHITE)).toBe(true);
});
