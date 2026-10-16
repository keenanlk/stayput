// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readGif } from './gif-helpers';

/**
 * Sprite sheet maker: a 12-frame GIF becomes a sheet and is cut back into a GIF with the same pixels and
 * delays; transparency is kept in the PNG; a sheet that is too big is refused before drawing; the presets
 * are on the site. Chromium and WebKit.
 */

const dir = mkdtempSync(join(tmpdir(), 'sprite-sheet-'));
const W = 24;
const H = 16;
const N = 12;
const DELAY = 80;
// Colour 0 is transparent in the second GIF; the rest are solid.
const PALETTE = Array.from({ length: 16 }, (_, i) => [i * 16, 255 - i * 16, (i * 53) % 256]);

/** Frame i: a solid fill (colour i + 1 when opaque) with a 6 x 6 square of another colour that moves along the frame. */
function frameIndex(i: number, transparentBackground: boolean): Uint8Array {
  const px = new Uint8Array(W * H).fill(transparentBackground ? 0 : (i % 14) + 1);
  const sx = i * 1;
  for (let y = 4; y < 10; y++) for (let x = sx; x < sx + 6; x++) px[y * W + x] = 15;
  return px;
}

async function build(delays: number[], transparentBackground: boolean): Promise<Uint8Array> {
  const mod = await import('gifenc');
  const { GIFEncoder } = (mod as unknown as { default?: typeof mod }).default ?? mod;
  const gif = GIFEncoder();
  for (let i = 0; i < N; i++) {
    gif.writeFrame(frameIndex(i, transparentBackground), W, H, { palette: PALETTE, delay: delays[i]!, repeat: 0, transparent: transparentBackground, transparentIndex: 0, dispose: 2 });
  }
  gif.finish();
  return gif.bytes();
}

/** A big GIF: `frames` frames of `size` px, every pixel one colour. */
async function big(frames: number, size: number): Promise<Uint8Array> {
  const mod = await import('gifenc');
  const { GIFEncoder } = (mod as unknown as { default?: typeof mod }).default ?? mod;
  const gif = GIFEncoder();
  const px = new Uint8Array(size * size);
  for (let i = 0; i < frames; i++) gif.writeFrame(px, size, size, { palette: PALETTE, delay: 40, repeat: 0 });
  gif.finish();
  return gif.bytes();
}

const files: Record<string, string> = {};
const DELAYS = Array.from({ length: N }, (_, i) => 40 + i * 10);
test.beforeAll(async () => {
  files.plain = join(dir, 'plain.gif');
  writeFileSync(files.plain, await build(Array(N).fill(DELAY), false));
  files.varied = join(dir, 'varied.gif');
  writeFileSync(files.varied, await build(DELAYS, false));
  files.clear = join(dir, 'clear.gif');
  writeFileSync(files.clear, await build(Array(N).fill(DELAY), true));
  files.big = join(dir, 'big.gif');
  writeFileSync(files.big, await big(200, 512));
});

const isPng = (b: Buffer) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

async function open(page: Page, path: string) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(path);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  return errors;
}

async function addFile(page: Page, path: string) {
  await page.locator('#file-input').setInputFiles(path);
  await expect(page.locator('#tool')).toHaveAttribute('data-count', '1');
}

/** Make a sheet from a GIF; returns the PNG and JSON bytes. */
async function makeSheet(page: Page, gif: string): Promise<{ png: Buffer; json: { frames: { x: number; y: number; w: number; h: number; delay: number }[]; width: number; height: number; columns: number } }> {
  await addFile(page, gif);
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveAttribute('data-count', '2', { timeout: 60_000 });
  const get = async (n: number) => {
    const dl = page.waitForEvent('download');
    await page.locator('#results-list .result-item').nth(n).getByRole('button', { name: 'Download' }).click();
    return readFileSync((await (await dl).path())!);
  };
  const png = await get(0);
  const json = JSON.parse((await get(1)).toString('utf8'));
  return { png, json };
}

/** RGBA of the pixels of a PNG, read by the browser. */
async function pixels(page: Page, png: Buffer, at: [number, number][]): Promise<{ size: [number, number]; px: number[][] }> {
  return page.evaluate(
    async ({ b64, at }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const c = document.createElement('canvas');
      c.width = bmp.width;
      c.height = bmp.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      return { size: [bmp.width, bmp.height] as [number, number], px: at.map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data]) };
    },
    { b64: png.toString('base64'), at },
  );
}

test('a 12-frame GIF made into a sheet and cut back by columns gives the same frames and delays', async ({ page }) => {
  const errors = await open(page, '/tools/sprite-sheet-maker');
  const { png, json } = await makeSheet(page, files.plain!);
  expect(isPng(png)).toBe(true);
  // 12 frames of 24 x 16 fall into 3 columns by 4 rows: the closest to a square sheet (72 x 64).
  expect(json).toMatchObject({ width: 72, height: 64, columns: 3 });
  expect(json.frames).toHaveLength(N);
  expect(json.frames[5]).toEqual({ x: 48, y: 16, w: 24, h: 16, delay: DELAY });
  expect(json.frames.every((f) => f.delay === DELAY)).toBe(true);
  const sheetFile = join(dir, 'sheet.png');
  writeFileSync(sheetFile, png);

  // Back to a GIF: sprite sheet to GIF mode, 3 columns, 4 rows, the same delay.
  await page.goto('/tools/sprite-sheet-maker');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('label:has(input[name="mode"][value="gif"])').click();
  await page.locator('#ss-cols').fill('3');
  await page.locator('#ss-rows').fill('4');
  await page.locator('#ss-delay').fill(String(DELAY));
  await addFile(page, sheetFile);
  // The preview plays before anything is saved.
  await expect(page.locator('#ss-panel')).toBeVisible();
  await expect(page.locator('#ss-hint')).toContainText('12 frames of 24 × 16 px');
  const dl = page.waitForEvent('download');
  await page.locator('#run').click();
  const back = readGif(readFileSync((await (await dl).path())!));
  const original = readGif(readFileSync(files.plain!));
  expect(back.width).toBe(W);
  expect(back.height).toBe(H);
  expect(back.frames).toHaveLength(N);
  expect(back.loop).toBe(0);
  for (let i = 0; i < N; i++) {
    let diff = 0;
    for (let p = 0; p < W * H; p++) {
      if (original.frames[i]![p * 4 + 3] === 0) continue;
      for (let k = 0; k < 4; k++) if (original.frames[i]![p * 4 + k] !== back.frames[i]![p * 4 + k]) diff++;
    }
    expect(diff, `frame ${i}`).toBe(0);
    expect(Math.abs(back.delays[i]! - original.delays[i]!)).toBeLessThanOrEqual(20);
  }
  expect(errors).toEqual([]);
});

test('the JSON carries each frame’s own delay, and the frame step keeps the animation’s length', async ({ page }) => {
  await open(page, '/tools/sprite-sheet-maker');
  const { json } = await makeSheet(page, files.varied!);
  expect(json.frames.map((f) => f.delay)).toEqual(DELAYS);

  await open(page, '/tools/sprite-sheet-maker');
  await page.locator('#ss-step').selectOption('2');
  const stepped = await makeSheet(page, files.varied!);
  expect(stepped.json.frames).toHaveLength(6);
  // Each kept frame takes the time of the frame dropped after it.
  expect(stepped.json.frames.map((f) => f.delay)).toEqual([DELAYS[0]! + DELAYS[1]!, DELAYS[2]! + DELAYS[3]!, DELAYS[4]! + DELAYS[5]!, DELAYS[6]! + DELAYS[7]!, DELAYS[8]! + DELAYS[9]!, DELAYS[10]! + DELAYS[11]!]);
});

test('a transparent GIF keeps its transparency in the PNG, and a white background fills it', async ({ page }) => {
  await open(page, '/tools/sprite-sheet-maker');
  const { png, json } = await makeSheet(page, files.clear!);
  // Frame 0 sits at the sheet's top left: its corner is clear and its square (colour 15) is solid.
  const f0 = json.frames[0]!;
  const { size, px } = await pixels(page, png, [[f0.x + 20, f0.y + 1], [f0.x + 2, f0.y + 5]]);
  expect(size).toEqual([json.width, json.height]);
  expect(px[0]![3]).toBe(0);
  expect(px[1]).toEqual([...PALETTE[15]!, 255]);

  await open(page, '/tools/sprite-sheet-maker');
  await page.locator('#ss-bg').selectOption('#ffffff');
  const white = await makeSheet(page, files.clear!);
  const w0 = (await pixels(page, white.png, [[f0.x + 20, f0.y + 1]])).px[0];
  expect(w0).toEqual([255, 255, 255, 255]);
});

test('a 200-frame 512 px GIF is refused before anything is drawn, with a clear message', async ({ page }) => {
  const errors = await open(page, '/tools/sprite-sheet-maker');
  await addFile(page, files.big!);
  const started = Date.now();
  await page.locator('#run').click();
  await expect(page.locator('#error')).toContainText('would make a', { timeout: 30_000 });
  await expect(page.locator('#error')).toContainText('Nothing was drawn');
  await expect(page.locator('#error')).toContainText('Frame step');
  await expect(page.locator('#results')).not.toHaveAttribute('data-count', /[1-9]/);
  expect(Date.now() - started).toBeLessThan(20_000);
  expect(errors).toEqual([]);
});

test('the same big GIF works at a smaller frame size', async ({ page }) => {
  await open(page, '/tools/sprite-sheet-maker');
  await page.locator('#ss-scale').selectOption('0.25');
  await addFile(page, files.big!);
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveAttribute('data-count', '2', { timeout: 90_000 });
  await expect(page.locator('#results-list .result-item').first().locator('.meta')).toContainText('200 frames');
});

test('cutting by cell size gives the same GIF as by columns and rows', async ({ page }) => {
  await open(page, '/tools/sprite-sheet-maker');
  const { png } = await makeSheet(page, files.plain!);
  const sheetFile = join(dir, 'sheet-size.png');
  writeFileSync(sheetFile, png);
  await page.goto('/sprite-sheet-to-gif');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#ss-by').selectOption('size');
  await page.locator('#ss-cw').fill('24');
  await page.locator('#ss-ch').fill('16');
  await addFile(page, sheetFile);
  await expect(page.locator('#ss-hint')).toContainText('12 frames of 24 × 16 px');
  const dl = page.waitForEvent('download');
  await page.locator('#run').click();
  const gif = readGif(readFileSync((await (await dl).path())!));
  expect(gif.frames).toHaveLength(12);
});

test('the presets set their own mode and the site map lists all three pages', async ({ page, request }) => {
  await page.goto('/gif-to-sprite-sheet');
  await expect(page.locator('h1')).toHaveText('Turn a GIF into a sprite sheet');
  await expect(page.locator('input[name="mode"][value="sheet"]')).toBeChecked();
  await expect(page.locator('#ss-a')).toBeVisible();
  await expect(page.locator('#file-input')).toHaveAttribute('accept', 'image/gif,.gif');
  await page.goto('/sprite-sheet-to-gif');
  await expect(page.locator('h1')).toHaveText('Turn a sprite sheet into a GIF');
  await expect(page.locator('input[name="mode"][value="gif"]')).toBeChecked();
  await expect(page.locator('#ss-b')).toBeVisible();
  await expect(page.locator('#ss-a')).toBeHidden();
  await page.goto('/tools/sprite-sheet-maker');
  await expect(page.locator('h1')).toHaveText('Make a sprite sheet');
  const map = await (await request.get('/sitemap-0.xml')).text();
  for (const p of ['/tools/sprite-sheet-maker', '/gif-to-sprite-sheet', '/sprite-sheet-to-gif']) expect(map).toContain(`https://stayput.dev${p}<`);
});

test('several pictures make a sheet in the order listed, and nothing is sent anywhere', async ({ page }) => {
  const sent: string[] = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET' || r.postData()) sent.push(`${r.method()} ${r.url()}`);
  });
  await open(page, '/tools/sprite-sheet-maker');
  const { png } = await makeSheet(page, files.plain!);
  const a = join(dir, 'a.png');
  const b = join(dir, 'b.png');
  writeFileSync(a, png);
  writeFileSync(b, png);
  await page.goto('/tools/sprite-sheet-maker');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#ss-columns').fill('2');
  await page.locator('#ss-padding').fill('4');
  await page.locator('#file-input').setInputFiles([a, b]);
  await expect(page.locator('#tool')).toHaveAttribute('data-count', '2');
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveAttribute('data-count', '2', { timeout: 60_000 });
  const dl = page.waitForEvent('download');
  await page.locator('#results-list .result-item').nth(1).getByRole('button', { name: 'Download' }).click();
  const json = JSON.parse(readFileSync((await (await dl).path())!, 'utf8'));
  // Two 72 x 64 pictures side by side with 4 px around and between them.
  expect(json).toMatchObject({ width: 2 * 72 + 3 * 4, height: 64 + 2 * 4, columns: 2, padding: 4 });
  expect(json.frames.map((f: { x: number; y: number }) => [f.x, f.y])).toEqual([[4, 4], [80, 4]]);
  expect(sent.filter((s) => !/analytics|umami/i.test(s))).toEqual([]);
});

test('a file that is not a picture fails with a named class and a message', async ({ page }) => {
  await open(page, '/tools/sprite-sheet-maker');
  const bad = join(dir, 'bad.png');
  writeFileSync(bad, Buffer.from('not a picture at all'));
  await addFile(page, bad);
  await page.locator('#run').click();
  await expect(page.locator('#error')).not.toBeEmpty({ timeout: 30_000 });
});
