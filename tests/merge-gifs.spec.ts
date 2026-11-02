// @webkit-project
import { test, expect, type Download, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Merge GIFs, in Chromium and WebKit. The GIFs are made in Node with gifenc and the result is
// read back with gifuct-js, composited the way a player would, so no extra tools are needed.

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  // The site skips analytics in automated browsers; the stub keeps the run offline.
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) => route.fulfill({ contentType: 'text/javascript', body: 'window.umami={track:()=>{}};' }));
  await page.goto('/tools/merge-gifs');
  await expect(page.locator('#tool')).toBeVisible();
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  return errors;
}

async function addFiles(page: Page, files: string[]) {
  await page.locator('#file-input').setInputFiles(files);
  await expect(page.locator('#tool')).toHaveAttribute('data-count', String(files.length));
}

/** Press Merge and wait for the one download. */
async function merge(page: Page, downloads: Download[]): Promise<Uint8Array> {
  const before = downloads.length;
  await page.locator('#run').click();
  await expect.poll(() => downloads.length, { timeout: 60_000 }).toBe(before + 1);
  return new Uint8Array(readFileSync((await downloads[before]!.path())!));
}

interface Shown {
  size: number[];
  loop: number;
  delays: number[];
  frames: Uint8ClampedArray[];
}

/** A GIF read the way a player shows it: each frame's full RGBA, honouring disposal 1 and 2 (all the writer uses). */
async function readGif(bytes: Uint8Array): Promise<Shown> {
  const mod = await import('gifuct-js');
  const { parseGIF, decompressFrame } = ((mod as unknown as { default?: typeof mod }).default ?? mod);
  const gif = parseGIF(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  const { width, height } = gif.lsd;
  let loop = -1;
  const shown = new Uint8ClampedArray(width * height * 4);
  const out: Shown = { size: [width, height], loop, delays: [], frames: [] };
  for (const f of gif.frames as any[]) {
    if (f.application?.id?.startsWith('NETSCAPE')) out.loop = f.application.blocks[1] | (f.application.blocks[2] << 8);
    if (!('image' in f)) continue;
    const d = decompressFrame(f, gif.gct, true);
    const { left, top, width: w, height: h } = d.dims;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const s = (y * w + x) * 4;
        if (d.patch[s + 3] === 0) continue;
        shown.set(d.patch.subarray(s, s + 4), ((top + y) * width + left + x) * 4);
      }
    }
    out.frames.push(shown.slice());
    out.delays.push(d.delay);
    if (d.disposalType === 2) {
      for (let y = 0; y < h; y++) shown.fill(0, ((top + y) * width + left) * 4, ((top + y) * width + left + w) * 4);
    }
  }
  return out;
}

const at = (g: Shown, k: number, x: number, y: number) => [...g.frames[k]!.subarray((y * g.size[0]! + x) * 4, (y * g.size[0]! + x) * 4 + 4)];

type RawFrame = { w: number; h: number; delay: number; dispose?: number; pixel: (x: number, y: number) => number[] };

/** A GIF from frames whose pixels are given as RGBA; a frame with a see-through pixel is stored with a transparent index. The first frame sets the screen size. */
async function rawGif(frames: RawFrame[], repeat: number, name: string): Promise<string> {
  const mod = await import('gifenc');
  const { GIFEncoder, quantize, applyPalette } = ((mod as unknown as { default?: typeof mod }).default ?? mod);
  const gif = GIFEncoder();
  for (const f of frames) {
    const rgba = new Uint8Array(f.w * f.h * 4);
    let see = false;
    for (let y = 0; y < f.h; y++) {
      for (let x = 0; x < f.w; x++) {
        const c = f.pixel(x, y);
        if (c[3] === 0) see = true;
        rgba.set(c.length === 4 ? c : [c[0]!, c[1]!, c[2]!, 255], (y * f.w + x) * 4);
      }
    }
    const dispose = f.dispose ?? 1;
    if (see) {
      const palette = quantize(rgba, 256, { format: 'rgba4444', oneBitAlpha: true });
      const index = applyPalette(rgba, palette, 'rgba4444');
      gif.writeFrame(index, f.w, f.h, { palette, delay: f.delay, repeat, transparent: true, transparentIndex: palette.findIndex((c: number[]) => c[3] === 0), dispose });
    } else {
      const palette = quantize(rgba, 256);
      gif.writeFrame(applyPalette(rgba, palette), f.w, f.h, { palette, delay: f.delay, repeat, dispose });
    }
  }
  gif.finish();
  const file = join(mkdtempSync(join(tmpdir(), 'stayput-')), name);
  writeFileSync(file, gif.bytes());
  return file;
}

const RED = [220, 30, 30];
const GREEN = [30, 200, 40];
const BLUE = [30, 40, 220];
const WHITE = [255, 255, 255, 255];
const solid = (c: number[]) => () => c;

const near = (got: number[], want: number[]) => {
  const w = want.length === 3 ? [...want, 255] : want;
  for (let i = 0; i < 4; i++) expect(Math.abs(got[i]! - w[i]!), `${got} vs ${w}`).toBeLessThanOrEqual(12);
};

test('Merge GIFs joins every input in order with each frame’s timing, and fits other sizes with white bars', async ({ page }) => {
  const errors = await open(page);
  const wide = await rawGif(
    [
      { w: 40, h: 20, delay: 100, pixel: solid(RED) },
      { w: 40, h: 20, delay: 200, pixel: solid(GREEN) },
    ],
    3,
    'wide.gif',
  );
  const square = await rawGif(
    [
      { w: 20, h: 20, delay: 300, pixel: solid(BLUE) },
      { w: 20, h: 20, delay: 400, pixel: (x) => (x < 10 ? BLUE : RED) },
    ],
    0,
    'square.gif',
  );
  const requests: string[] = [];
  page.on('request', (r) => requests.push(`${r.method()} ${r.postData() ?? ''}`));
  await addFiles(page, [wide, square]);
  const downloads: Download[] = [];
  page.on('download', (d) => downloads.push(d));
  const out = await readGif(await merge(page, downloads));
  expect(downloads[0]!.suggestedFilename()).toBe('merged.gif');
  expect(out).toMatchObject({ size: [40, 20], loop: 3, delays: [100, 200, 300, 400] });
  // Frames of both inputs are there, in order: red, green, then the square fitted in the middle with white bars.
  near(at(out, 0, 20, 10), RED);
  near(at(out, 1, 20, 10), GREEN);
  near(at(out, 2, 2, 10), WHITE);
  near(at(out, 2, 20, 10), BLUE);
  near(at(out, 2, 37, 10), WHITE);
  near(at(out, 3, 12, 10), BLUE);
  near(at(out, 3, 28, 10), RED);
  expect(requests.filter((r) => r.startsWith('POST') && r.includes('wide.gif'))).toEqual([]);
  expect(errors).toEqual([]);
});

for (const dispose of [3, 1]) {
  test(`Merge GIFs does not carry the previous GIF's last frame (disposal ${dispose}) into the next GIF`, async ({ page }) => {
    await open(page);
    // The first GIF ends on a small patch, restored to the red frame (3) or kept on top of it (1) on its own canvas.
    const first = await rawGif(
      [
        { w: 20, h: 20, delay: 100, pixel: solid(RED) },
        { w: 6, h: 6, delay: 100, dispose, pixel: solid(GREEN) },
      ],
      0,
      'first.gif',
    );
    // The second starts on a mostly see-through frame: only a blue patch in a corner.
    const second = await rawGif(
      [
        { w: 20, h: 20, delay: 100, pixel: (x, y) => (x < 5 && y < 5 ? BLUE : [0, 0, 0, 0]) },
        { w: 20, h: 20, delay: 100, pixel: solid(BLUE) },
      ],
      0,
      'second.gif',
    );
    await addFiles(page, [first, second]);
    const downloads: Download[] = [];
    page.on('download', (d) => downloads.push(d));
    const out = await readGif(await merge(page, downloads));
    expect(out.size).toEqual([20, 20]);
    expect(out.frames).toHaveLength(4);
    // Frame 3 is the second GIF's first: blue in its corner and the white fill elsewhere, with no red or green left over.
    near(at(out, 2, 2, 2), BLUE);
    near(at(out, 2, 15, 15), WHITE);
    near(at(out, 2, 3, 3), BLUE);
    near(at(out, 2, 10, 3), WHITE);
    // The first GIF's own frames are unchanged: the patch sits on red.
    near(at(out, 1, 2, 2), GREEN);
    near(at(out, 1, 15, 15), RED);
  });
}

test('Merge GIFs: transparent bars stay transparent, and Fill and crop covers the frame', async ({ page }) => {
  await open(page);
  const wide = await rawGif(
    [
      { w: 40, h: 20, delay: 100, pixel: solid(RED) },
      { w: 40, h: 20, delay: 100, pixel: solid(GREEN) },
    ],
    0,
    'a.gif',
  );
  const square = await rawGif([{ w: 20, h: 20, delay: 100, pixel: solid(BLUE) }], 0, 'b.gif');
  await addFiles(page, [wide, square]);
  const downloads: Download[] = [];
  page.on('download', (d) => downloads.push(d));
  await page.locator('#transparent').evaluate((el) => (el as HTMLInputElement).click());
  const bars = await readGif(await merge(page, downloads));
  expect(bars.size).toEqual([40, 20]);
  expect(bars.frames).toHaveLength(3);
  expect(at(bars, 2, 2, 10)[3]).toBe(0);
  near(at(bars, 2, 20, 10), BLUE);
  // The pictures themselves are not see-through.
  near(at(bars, 0, 2, 10), RED);

  // Fill and crop: the square covers the whole 40 by 20 frame, so there are no bars.
  await page.locator('#transparent').evaluate((el) => (el as HTMLInputElement).click());
  await page.locator('#fit').selectOption('cover');
  const covered = await readGif(await merge(page, downloads));
  near(at(covered, 2, 2, 10), BLUE);
  near(at(covered, 2, 37, 10), BLUE);
});

test('Merge GIFs asks for two GIFs and refuses a file that is not a GIF', async ({ page }) => {
  await open(page);
  const one = await rawGif([{ w: 30, h: 20, delay: 100, pixel: solid(RED) }], 0, 'one.gif');
  await addFiles(page, [one]);
  await page.locator('#run').click();
  await expect(page.locator('#error')).toContainText('Add at least two GIFs to merge.');
  await page.locator('#clear').click();
  const png = join(mkdtempSync(join(tmpdir(), 'stayput-')), 'photo.gif');
  writeFileSync(png, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]));
  await addFiles(page, [one, png]);
  await page.locator('#run').click();
  await expect(page.locator('#error')).toContainText('This file is not a GIF.');
});

test('Merge GIFs scales the result down to fit memory instead of refusing', async ({ page }) => {
  test.setTimeout(240_000);
  await open(page);
  // Two 4000 by 4000 GIFs of 9 frames each: 18 whole frames is about 1.07 GiB, over the 1 GiB budget.
  const { GIFEncoder } = ((m: any) => m.default ?? m)(await import('gifenc'));
  const big = (name: string, colour: number[]) => {
    const w = 4000;
    const enc = GIFEncoder();
    const index = new Uint8Array(w * w);
    for (let i = 0; i < 9; i++) {
      // A black block that moves each frame, so no two frames are alike.
      index.fill(0);
      for (let y = 3000; y < 3200; y++) index.fill(1, y * w + i * 400, y * w + i * 400 + 200);
      enc.writeFrame(index, w, w, { palette: [colour, [0, 0, 0]], delay: 100, repeat: 0 });
    }
    enc.finish();
    const file = join(mkdtempSync(join(tmpdir(), 'stayput-')), name);
    writeFileSync(file, enc.bytes());
    return file;
  };
  await addFiles(page, [big('a.gif', [220, 30, 30]), big('b.gif', [30, 40, 220])]);
  const downloads: Download[] = [];
  page.on('download', (d) => downloads.push(d));
  const out = await readGif(await merge(page, downloads));
  expect(out.frames).toHaveLength(18);
  expect(out.size[0]! * out.size[1]! * 4 * 18).toBeLessThanOrEqual(2 ** 30);
  expect(out.size[0]).toBeLessThan(4000);
  expect(out.size[0]! / out.size[1]!).toBeCloseTo(1, 1);
  near(at(out, 0, 100, 100), RED);
  near(at(out, 17, 100, 100), BLUE);
  await expect(page.locator('#results')).toContainText('scaled down from 4000×4000');
  await expect(page.locator('#error')).toBeHidden();
});
