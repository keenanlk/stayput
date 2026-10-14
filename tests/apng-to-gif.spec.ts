// @webkit-project
import { test, expect, type Download, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { readGif } from './gif-helpers';

/**
 * APNG to GIF: an APNG built here with mixed dispose and blend values and partial-rect frames is
 * converted in the page; the GIF's composited frames, delays and loop count are compared with a
 * reference compositor written from the APNG spec. Runs in Chromium and WebKit.
 */

const dir = mkdtempSync(join(tmpdir(), 'apng-to-gif-'));
const W = 40;
const H = 30;

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc(b: Buffer): number {
  let c = 0xffffffff;
  for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}
const u32 = (...n: number[]) => {
  const b = Buffer.alloc(n.length * 4);
  n.forEach((v, i) => b.writeUInt32BE(v, i * 4));
  return b;
};

interface F {
  x: number;
  y: number;
  w: number;
  h: number;
  /** RGBA, w*h*4. */
  rgba: Uint8Array;
  delayMs: number;
  dispose: 0 | 1 | 2;
  blend: 0 | 1;
}

function rawRows(f: F): Buffer {
  const rows: Buffer[] = [];
  for (let y = 0; y < f.h; y++) rows.push(Buffer.concat([Buffer.from([0]), Buffer.from(f.rgba.subarray(y * f.w * 4, (y + 1) * f.w * 4))]));
  return deflateSync(Buffer.concat(rows));
}

function apng(frames: F[], plays: number): Buffer {
  const parts: Buffer[] = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])];
  parts.push(chunk('IHDR', Buffer.concat([u32(W, H), Buffer.from([8, 6, 0, 0, 0])])));
  parts.push(chunk('acTL', u32(frames.length, plays)));
  let seq = 0;
  frames.forEach((f, i) => {
    const fc = Buffer.alloc(26);
    fc.writeUInt32BE(seq++, 0);
    fc.writeUInt32BE(f.w, 4);
    fc.writeUInt32BE(f.h, 8);
    fc.writeUInt32BE(f.x, 12);
    fc.writeUInt32BE(f.y, 16);
    fc.writeUInt16BE(f.delayMs, 20);
    fc.writeUInt16BE(1000, 22);
    fc[24] = f.dispose;
    fc[25] = f.blend;
    parts.push(chunk('fcTL', fc));
    const z = rawRows(f);
    if (i === 0) parts.push(chunk('IDAT', z));
    else parts.push(chunk('fdAT', Buffer.concat([u32(seq++), z])));
  });
  parts.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

/** Reference compositor from the APNG spec; returns the canvas shown for each frame. */
function composite(frames: F[]): Uint8Array[] {
  let canvas = new Uint8Array(W * H * 4);
  const shown: Uint8Array[] = [];
  let prev: { f: F; saved: Uint8Array } | undefined;
  for (const [i, f] of frames.entries()) {
    if (prev) {
      const d = prev.f.dispose;
      if (d === 1) clear(canvas, prev.f);
      else if (d === 2) canvas = prev.saved.slice();
    }
    // The first frame's dispose 2 is treated as 1.
    const saved = canvas.slice();
    for (let y = 0; y < f.h; y++) {
      for (let x = 0; x < f.w; x++) {
        const s = (y * f.w + x) * 4;
        const o = ((f.y + y) * W + f.x + x) * 4;
        if (f.blend === 0 || f.rgba[s + 3] === 255) canvas.set(f.rgba.subarray(s, s + 4), o);
        // blend over with alpha 0 leaves the canvas as it was (all test pixels are alpha 0 or 255)
      }
    }
    shown.push(canvas.slice());
    prev = { f: i === 0 && f.dispose === 2 ? { ...f, dispose: 1 } : f, saved };
  }
  return shown;
}
function clear(c: Uint8Array, f: F) {
  for (let y = 0; y < f.h; y++) c.fill(0, ((f.y + y) * W + f.x) * 4, ((f.y + y) * W + f.x + f.w) * 4);
}

function sample(count: number): F[] {
  return Array.from({ length: count }, (_, i) => {
    const full = i === 0;
    const w = full ? W : 16;
    const h = full ? H : 12;
    const rgba = new Uint8Array(w * h * 4);
    const c = [(i * 50 + 40) % 256, (i * 90 + 100) % 256, (i * 30 + 200) % 256];
    for (let p = 0; p < w * h; p++) {
      const holed = !full && p % w % 4 === 3;
      rgba.set(holed ? [0, 0, 0, 0] : [c[0]!, c[1]!, c[2]!, 255], p * 4);
    }
    return {
      x: full ? 0 : (i * 3) % 20,
      y: full ? 0 : (i * 2) % 15,
      w,
      h,
      rgba,
      delayMs: i === 4 ? 0 : 30 + 10 * i,
      dispose: (i % 3) as 0 | 1 | 2,
      blend: (i % 2) as 0 | 1,
    };
  });
}

async function convert(page: Page, file: string): Promise<Uint8Array> {
  await page.locator('#file-input').setInputFiles(file);
  await expect(page.locator('#tool')).toHaveAttribute('data-count', '1');
  const downloads: Download[] = [];
  page.on('download', (d) => downloads.push(d));
  await page.locator('#run').click();
  await expect.poll(() => downloads.length, { timeout: 60_000 }).toBe(1);
  return new Uint8Array(readFileSync((await downloads[0]!.path())!));
}

test('APNG with mixed dispose and blend becomes a matching GIF, and no bytes leave the tab', async ({ page }) => {
  const frames = sample(10);
  const file = join(dir, 'secret-anim.png');
  writeFileSync(file, apng(frames, 0));
  const errors: string[] = [];
  const requests: { url: string; method: string; body: string | null }[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => requests.push({ url: r.url(), method: r.method(), body: r.postData() }));
  await page.goto('/apng-to-gif');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  const gif = await convert(page, file);
  const shown = readGif(gif);
  const want = composite(frames);

  expect([shown.width, shown.height]).toEqual([W, H]);
  expect(shown.frames).toHaveLength(10);
  const total = shown.delays.reduce((a, b) => a + b, 0);
  const expected = frames.reduce((a, f) => a + Math.max(20, f.delayMs), 0);
  expect(Math.abs(total - expected)).toBeLessThanOrEqual(20);
  expect(shown.loop).toBe(0);
  for (const [i, f] of shown.frames.entries()) {
    let bad = 0;
    for (let p = 0; p < W * H; p++) {
      const a = f[p * 4 + 3]!;
      const b = want[i]![p * 4 + 3]!;
      if (a !== b || (b === 255 && [0, 1, 2].some((k) => Math.abs(f[p * 4 + k]! - want[i]![p * 4 + k]!) > 8))) bad++;
    }
    expect(bad, `frame ${i} differs in ${bad} pixels`).toBe(0);
  }
  // Frame 2 is dispose 2: make sure the earlier frame's rectangle was put back.
  expect(frames[2]!.dispose).toBe(2);

  for (const q of requests) {
    if (q.url.startsWith('blob:') || q.url.startsWith('data:')) continue;
    expect(q.method, q.url).toBe('GET');
    expect(q.body, q.url).toBeNull();
    expect(q.url).not.toContain('secret-anim');
  }
  expect(errors).toEqual([]);
});

test('loop count carries over: 0 forever, 3 plays is NETSCAPE 2, 1 play has no block', async ({ page }) => {
  await page.goto('/tools/animated-png-to-gif');
  const two = sample(2);
  for (const [plays, loop] of [
    [0, 0],
    [3, 2],
    [1, undefined],
  ] as const) {
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    const file = join(dir, `plays-${plays}.png`);
    writeFileSync(file, apng(two, plays));
    const gif = await convert(page, file);
    expect(readGif(gif).loop, `num_plays ${plays}`).toBe(loop);
    expect(Buffer.from(gif).includes('NETSCAPE2.0')).toBe(loop !== undefined);
    await page.reload();
  }
});

test('a still PNG is refused with a clear message', async ({ page }) => {
  await page.goto('/apng-to-gif');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  const still = sample(1)[0]!;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', Buffer.concat([u32(W, H), Buffer.from([8, 6, 0, 0, 0])])),
    chunk('IDAT', rawRows(still)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  const file = join(dir, 'still.png');
  writeFileSync(file, png);
  await page.locator('#file-input').setInputFiles(file);
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/);
  await expect(page.locator('#error')).toContainText('not animated');
  await expect(page.locator('#error')).toContainText('/png-to-jpg');
});

test('GIF to APNG links to APNG to GIF', async ({ page }) => {
  await page.goto('/gif-to-apng');
  await expect(page.locator('a[href="/apng-to-gif"]').first()).toBeAttached();
});
