// @webkit-project
import { test, expect, type Download, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';

/**
 * GIF frame splitter: a GIF whose frames store only a patch (the rest transparent) and use disposal
 * is split in the page; the frame count, delays, ZIP and composited pixels are checked. Chromium and WebKit.
 */

const dir = mkdtempSync(join(tmpdir(), 'gif-frame-splitter-'));
const W = 32;
const H = 20;
const DELAYS = [50, 70, 90, 110];
// Palette: 0 red, 1 blue, 2 green, 3 transparent.
const PALETTE = [
  [255, 0, 0],
  [0, 0, 255],
  [0, 255, 0],
  [0, 0, 0],
];

function indexed(fill: number, square?: { x: number; y: number; c: number }) {
  const px = new Uint8Array(W * H).fill(fill);
  if (square) for (let y = square.y; y < square.y + 8; y++) for (let x = square.x; x < square.x + 8; x++) px[y * W + x] = square.c;
  return px;
}

/**
 * 1: all red, kept. 2: blue square over it (rest transparent), kept. 3: green square (rest transparent),
 * then the whole screen is cleared. 4: transparent, so the screen shows nothing.
 */
async function build(): Promise<Uint8Array> {
  const mod = await import('gifenc');
  const { GIFEncoder } = (mod as unknown as { default?: typeof mod }).default ?? mod;
  const gif = GIFEncoder();
  const frames = [
    { index: indexed(0), dispose: 1, transparent: false },
    { index: indexed(3, { x: 2, y: 2, c: 1 }), dispose: 1, transparent: true },
    { index: indexed(3, { x: 20, y: 10, c: 2 }), dispose: 2, transparent: true },
    { index: indexed(3), dispose: 1, transparent: true },
  ];
  for (const [i, f] of frames.entries()) {
    gif.writeFrame(f.index, W, H, { palette: PALETTE, delay: DELAYS[i]!, repeat: 0, transparent: f.transparent, transparentIndex: 3, dispose: f.dispose });
  }
  gif.finish();
  return gif.bytes();
}

let file: string;
test.beforeAll(async () => {
  file = join(dir, 'blocks.gif');
  writeFileSync(file, await build());
});

/** Names and bytes of a zip's entries (stored or deflated), read from its central directory. */
function unzip(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    out.set(name, method === 0 ? Buffer.from(raw) : inflateRawSync(raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const isPng = (b: Buffer) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
const pngSize = (b: Buffer) => ({ w: b.readUInt32BE(16), h: b.readUInt32BE(20) });

/** RGBA of a PNG, decoded by the browser. */
async function pixels(page: Page, png: Buffer, at: [number, number][]): Promise<number[][]> {
  return page.evaluate(
    async ({ b64, at }) => {
      const bin = atob(b64);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const c = document.createElement('canvas');
      c.width = bmp.width;
      c.height = bmp.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      return at.map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data]);
    },
    { b64: png.toString('base64'), at },
  );
}

async function split(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/split-gif');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(file);
  await expect(page.locator('#tool')).toHaveAttribute('data-count', '1');
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveAttribute('data-count', '4', { timeout: 60_000 });
  return errors;
}

test('shows the frame count, each delay and the total time', async ({ page }) => {
  const errors = await split(page);
  await expect(page.locator('#results-title')).toContainText('4 frames');
  await expect(page.locator('#results-title')).toContainText('0.32 s');
  const rows = page.locator('#results-list .result-item');
  await expect(rows).toHaveCount(4);
  for (const [i, d] of DELAYS.entries()) {
    await expect(rows.nth(i).locator('.name')).toHaveText(`frame-00${i + 1}.png`);
    await expect(rows.nth(i).locator('.meta')).toContainText(`frame ${i + 1} of 4, ${d} ms`);
    await expect(rows.nth(i).locator('.thumb img')).toHaveCount(1);
  }
  expect(errors).toEqual([]);
});

test('the zip holds exactly the frames, as whole composited PNGs', async ({ page }) => {
  await split(page);
  const dl = page.waitForEvent('download');
  await page.locator('#download-all').click();
  const entries = unzip(readFileSync((await (await dl).path())!));
  expect([...entries.keys()].sort()).toEqual(['frame-001.png', 'frame-002.png', 'frame-003.png', 'frame-004.png']);
  for (const png of entries.values()) {
    expect(isPng(png)).toBe(true);
    expect(pngSize(png)).toEqual({ w: W, h: H });
  }
  // Frame 2 is a blue square over the red of frame 1: the patch alone would be transparent elsewhere.
  const [inSquare, outside] = await pixels(page, entries.get('frame-002.png')!, [[5, 5], [28, 3]]);
  expect(inSquare).toEqual([0, 0, 255, 255]);
  expect(outside).toEqual([255, 0, 0, 255]);
  // Frame 3 keeps the blue square and adds the green one.
  const f3 = await pixels(page, entries.get('frame-003.png')!, [[5, 5], [24, 14], [0, 19]]);
  expect(f3).toEqual([[0, 0, 255, 255], [0, 255, 0, 255], [255, 0, 0, 255]]);
  // Frame 3 is disposed to the background, so frame 4 shows nothing.
  const [clear] = await pixels(page, entries.get('frame-004.png')!, [[5, 5]]);
  expect(clear[3]).toBe(0);
});

test('a single frame downloads as a valid PNG', async ({ page }) => {
  await split(page);
  const downloads: Download[] = [];
  page.on('download', (d) => downloads.push(d));
  await page.locator('#results-list .result-item').nth(1).getByRole('button', { name: 'Download' }).click();
  await expect.poll(() => downloads.length).toBe(1);
  expect(downloads[0]!.suggestedFilename()).toBe('frame-002.png');
  const png = readFileSync((await downloads[0]!.path())!);
  expect(isPng(png)).toBe(true);
  expect(pngSize(png)).toEqual({ w: W, h: H });
});
