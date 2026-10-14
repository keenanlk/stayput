// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * RAW preview extractor: hand-made TIFF and CR3-like files holding a small JPEG. The page reports the
 * preview's size before download, saves the JPEG's bytes unchanged, refuses a thumbnail, a non-RAW file
 * and a cut-short file with a clear message, and sends nothing but requests to its own origin.
 */

const BIG = readFileSync('tests/fixtures/static/raw-preview-800x600.jpg');
const THUMB = readFileSync('tests/fixtures/static/raw-preview-160x120.jpg');

type Tag = [tag: number, type: number, count: number, value: number];
const SHORT = 3;
const LONG = 4;

/** A little-endian TIFF: IFD0 at 8, then the blobs; `build` lays out IFDs and returns the whole file. */
function ifd(entries: Tag[], next = 0): Buffer {
  const sorted = [...entries].sort((a, b) => a[0] - b[0]);
  const b = Buffer.alloc(2 + sorted.length * 12 + 4);
  b.writeUInt16LE(sorted.length, 0);
  sorted.forEach(([tag, type, count, value], i) => {
    const o = 2 + i * 12;
    b.writeUInt16LE(tag, o);
    b.writeUInt16LE(type, o + 2);
    b.writeUInt32LE(count, o + 4);
    if (type === SHORT && count === 1) b.writeUInt16LE(value, o + 8);
    else b.writeUInt32LE(value, o + 8);
  });
  b.writeUInt32LE(next, 2 + sorted.length * 12);
  return b;
}

/** IFD0 (orientation, a SubIFD pointer, and a thumbnail JPEG) plus a SubIFD that holds `main` as given. */
function tiff(opts: { main: Buffer; orientation?: number; strips?: boolean; thumbOnly?: boolean; cutAt?: number }): Buffer {
  const head = Buffer.from([0x49, 0x49, 0x2a, 0, 8, 0, 0, 0]);
  const ifd0Len = 2 + 4 * 12 + 4;
  const subLen = 2 + (opts.thumbOnly ? 1 : opts.strips ? 3 : 2) * 12 + 4;
  const subAt = 8 + ifd0Len;
  const thumbAt = subAt + subLen;
  const mainAt = thumbAt + THUMB.length;
  const ifd0 = ifd([
    [0x112, SHORT, 1, opts.orientation ?? 1],
    [0x14a, LONG, 1, subAt],
    [0x201, LONG, 1, thumbAt],
    [0x202, LONG, 1, THUMB.length],
  ]);
  const sub = opts.thumbOnly
    ? ifd([[0x100, LONG, 1, 160]])
    : opts.strips
      ? ifd([[0x103, SHORT, 1, 7], [0x111, LONG, 1, mainAt], [0x117, LONG, 1, opts.main.length]])
      : ifd([[0x201, LONG, 1, mainAt], [0x202, LONG, 1, opts.main.length]]);
  const all = Buffer.concat([head, ifd0, sub, THUMB, opts.main]);
  return opts.cutAt ? all.subarray(0, opts.cutAt) : all;
}

const box = (type: string, ...body: Buffer[]) => {
  const payload = Buffer.concat(body);
  const h = Buffer.alloc(8);
  h.writeUInt32BE(payload.length + 8, 0);
  h.write(type, 4, 'latin1');
  return Buffer.concat([h, payload]);
};
const full = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};

/** A CR3-like file: ftyp, a moov with one JPEG track (stsz + stco), and the JPEG in mdat. */
function cr3(main: Buffer): Buffer {
  const ftyp = box('ftyp', Buffer.concat([Buffer.from('crx ', 'latin1'), full(1), Buffer.from('crx isom', 'latin1')]));
  const build = (offset: number) =>
    box('moov', box('trak', box('mdia', box('minf', box('stbl', box('stsz', full(0), full(main.length), full(1)), box('stco', full(0), full(1), full(offset)))))));
  const moovLen = build(0).length;
  const mdatAt = ftyp.length + moovLen + 8;
  return Buffer.concat([ftyp, build(mdatAt), box('mdat', main)]);
}

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.goto('/tools/raw-preview');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  return { errors, requests };
}

const drop = async (page: Page, ...files: { name: string; buffer: Buffer }[]) => {
  await page.locator('#file-input').setInputFiles(files.map((f) => ({ ...f, mimeType: 'application/octet-stream' })));
  await expect(page.locator('#tool')).toHaveAttribute('data-count', String(files.length));
};

async function extract(page: Page): Promise<Buffer> {
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#run').click()]);
  return readFileSync((await download.path())!);
}

const sofSize = (jpeg: Buffer) => {
  for (let i = 2; i < jpeg.length - 9; ) {
    const m = jpeg[i + 1]!;
    if (m >= 0xc0 && m <= 0xc2) return [jpeg.readUInt16BE(i + 7), jpeg.readUInt16BE(i + 5)];
    i += 2 + jpeg.readUInt16BE(i + 2);
  }
  return [0, 0];
};

test('a TIFF RAW with the full preview in a SubIFD is reported at its size and saved unchanged', async ({ page }) => {
  const { errors, requests } = await open(page);
  await drop(page, { name: 'IMG_0001.NEF', buffer: tiff({ main: BIG }) });
  await expect(page.locator('.raw-item')).toContainText('800 x 600 preview found');
  await expect(page.locator('.raw-item')).toContainText('no EXIF');
  expect((await extract(page)).equals(BIG)).toBe(true);
  expect(errors).toEqual([]);
  const own = new URL(page.url()).host;
  expect(requests.filter((u) => !u.startsWith('data:') && !u.startsWith('blob:') && new URL(u).host !== own)).toEqual([]);
});

test('a preview stored as a JPEG strip is found too', async ({ page }) => {
  await open(page);
  await drop(page, { name: 'a.dng', buffer: tiff({ main: BIG, strips: true }) });
  await expect(page.locator('.raw-item')).toContainText('800 x 600 preview found');
  expect((await extract(page)).equals(BIG)).toBe(true);
});

test('a CR3-like file is read from its track in mdat', async ({ page }) => {
  await open(page);
  await drop(page, { name: 'R6.CR3', buffer: cr3(BIG) });
  await expect(page.locator('.raw-item')).toContainText('800 x 600 preview found');
  expect((await extract(page)).equals(BIG)).toBe(true);
});

test('a file holding only a thumbnail is refused', async ({ page }) => {
  await open(page);
  await drop(page, { name: 'thumb.dng', buffer: tiff({ main: BIG, thumbOnly: true }) });
  await expect(page.locator('.raw-item')).toContainText('160 x 120');
  await expect(page.locator('.raw-item')).toContainText('thumbnail');
  await page.locator('#run').click();
  await expect(page.locator('#error')).toContainText('thumbnail');
});

test('a non-RAW file and a cut-short RAW get a clear message', async ({ page }) => {
  await open(page);
  await drop(page, { name: 'notes.nef', buffer: Buffer.from('this is plain text, not a camera file at all') }, { name: 'cut.cr2', buffer: tiff({ main: BIG, cutAt: 600 }) });
  const items = page.locator('.raw-item');
  await expect(items.nth(0)).toContainText('does not look like a RAW');
  await expect(items.nth(1)).toContainText('cut short');
});

test('turning upright re-encodes a picture the camera marked rotated, and says so', async ({ page }) => {
  await open(page);
  await drop(page, { name: 'portrait.arw', buffer: tiff({ main: BIG, orientation: 6 }) });
  await expect(page.locator('.raw-item')).toContainText('marked it as rotated');
  await page.locator('#upright').check();
  const out = await extract(page);
  expect(out.equals(BIG)).toBe(false);
  expect(sofSize(out)).toEqual([600, 800]);
  await expect(page.locator('#results-list')).toContainText('re-encoded at quality 95');
});
