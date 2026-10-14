// @webkit-project
import { test, expect, type Download } from '@playwright/test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gifFrom, readGif } from './gif-helpers';

/**
 * GIF to APNG: the downloaded file's chunks are parsed in Node and compared with the GIF that went
 * in (frame count, loop count, delays, sequence numbers), and the browser must decode it.
 * Runs in Chromium and WebKit.
 */

const dir = mkdtempSync(join(tmpdir(), 'gif-to-apng-'));
const W = 48;
const H = 32;
const COLOURS = [
  [200, 30, 30],
  [30, 200, 30],
  [30, 30, 200],
  [200, 200, 30],
] as const;

/** A solid frame whose left 12 columns are see-through. */
function frame(c: readonly number[]): Uint8Array {
  const px = new Uint8Array(W * H * 4);
  for (let p = 0; p < W * H; p++) px.set(p % W < 12 ? [0, 0, 0, 0] : [c[0]!, c[1]!, c[2]!, 255], p * 4);
  return px;
}

interface Chunk {
  type: string;
  data: Uint8Array;
}

function chunksOf(b: Uint8Array): Chunk[] {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  expect([...b.subarray(0, 8)]).toEqual(sig);
  const out: Chunk[] = [];
  for (let o = 8; o < b.length; ) {
    const len = v.getUint32(o);
    out.push({ type: String.fromCharCode(...b.subarray(o + 4, o + 8)), data: b.subarray(o + 8, o + 8 + len) });
    o += 12 + len;
  }
  return out;
}

test('GIF to APNG keeps frame count, delays, loop count, transparency, and no bytes leave the tab', async ({ page }) => {
  const delays = [100, 250, 40, 600];
  const bytes = await gifFrom({ w: W, h: H, frames: COLOURS.map((c) => ({ rgba: frame(c) })), delays, repeat: 3, transparent: true });
  const file = join(dir, 'secret-name.gif');
  writeFileSync(file, bytes);
  const shown = readGif(bytes);

  const errors: string[] = [];
  const requests: { url: string; method: string; body: string | null }[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => requests.push({ url: r.url(), method: r.method(), body: r.postData() }));
  await page.goto('/gif-to-apng');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(file);
  await expect(page.locator('#tool')).toHaveAttribute('data-count', '1');
  const downloads: Download[] = [];
  page.on('download', (d) => downloads.push(d));
  await page.locator('#run').click();
  await expect.poll(() => downloads.length, { timeout: 60_000 }).toBe(1);
  expect(downloads[0]!.suggestedFilename()).toBe('secret-name.png');
  const apng = new Uint8Array(readFileSync((await downloads[0]!.path())!));

  const chunks = chunksOf(apng);
  const types = chunks.map((c) => c.type);
  expect(types[0]).toBe('IHDR');
  expect(types[1]).toBe('acTL');
  expect(types.at(-1)).toBe('IEND');
  // fcTL + IDAT for the first frame, fcTL + fdAT for each of the others.
  expect(types.slice(2, 4)).toEqual(['fcTL', 'IDAT']);
  expect(types.filter((t) => t === 'fcTL')).toHaveLength(shown.frames.length);
  expect(types.filter((t) => t === 'fdAT')).toHaveLength(shown.frames.length - 1);

  const actl = new DataView(chunks[1]!.data.buffer, chunks[1]!.data.byteOffset, 8);
  expect(actl.getUint32(0)).toBe(shown.frames.length);
  expect(actl.getUint32(4)).toBe(shown.loop);
  const ih = new DataView(chunks[0]!.data.buffer, chunks[0]!.data.byteOffset, 13);
  expect([ih.getUint32(0), ih.getUint32(4)]).toEqual([W, H]);

  // Sequence numbers run 0, 1, 2... across fcTL and fdAT in file order.
  let next = 0;
  const found: number[] = [];
  for (const c of chunks) {
    if (c.type !== 'fcTL' && c.type !== 'fdAT') continue;
    const v = new DataView(c.data.buffer, c.data.byteOffset, c.data.byteLength);
    expect(v.getUint32(0)).toBe(next++);
    if (c.type === 'fcTL') found.push((v.getUint16(20) / v.getUint16(22)) * 1000);
  }
  expect(found).toHaveLength(delays.length);
  found.forEach((ms, i) => expect(Math.abs(ms - shown.delays[i]!)).toBeLessThanOrEqual(10));

  // The browser decodes it at the right size, and the see-through area is still see-through.
  const probe = await page.evaluate(async (data) => {
    const url = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: 'image/png' }));
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    return { w: img.naturalWidth, h: img.naturalHeight, clear: ctx.getImageData(2, 2, 1, 1).data[3], solid: ctx.getImageData(40, 16, 1, 1).data[3] };
  }, [...apng]);
  expect(probe).toMatchObject({ w: W, h: H, clear: 0, solid: 255 });

  for (const q of requests) {
    if (q.url.startsWith('blob:') || q.url.startsWith('data:')) continue;
    expect(q.method, q.url).toBe('GET');
    expect(q.body, q.url).toBeNull();
    expect(q.url).not.toContain('secret-name');
  }
  expect(errors).toEqual([]);
});

test('a GIF with no loop setting plays once, and a file that is not a GIF gets a clear error', async ({ page }) => {
  const g = await gifFrom({ w: W, h: H, frames: COLOURS.slice(0, 2).map((c) => ({ rgba: frame(c) })), delays: [100, 100], repeat: -1 });
  const file = join(dir, 'once.gif');
  writeFileSync(file, g);
  await page.goto('/tools/gif-to-animated-png');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(file);
  const downloads: Download[] = [];
  page.on('download', (d) => downloads.push(d));
  await page.locator('#run').click();
  await expect.poll(() => downloads.length, { timeout: 60_000 }).toBe(1);
  const chunks = chunksOf(new Uint8Array(readFileSync((await downloads[0]!.path())!)));
  expect(new DataView(chunks[1]!.data.buffer, chunks[1]!.data.byteOffset, 8).getUint32(4)).toBe(1);

  await page.reload();
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles({ name: 'fake.gif', mimeType: 'image/gif', buffer: Buffer.from('not a gif at all') });
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/);
  await expect(page.locator('#error')).toContainText('This file is not a GIF.');
});
