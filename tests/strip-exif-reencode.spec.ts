import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { inspect, sniffFormat, strip, stripJpeg, jpegExifTiff, jpegWithExif, withNormalOrientation, parseTiff, pngExifTiff, webpExifTiff } from '../src/lib/exif';
import { tools } from '../src/data/tools';
import { presets } from '../src/data/presets';

/**
 * Pins what the Remove EXIF Data copy says about re-encoding to what the tool does:
 * image data is copied unchanged for every JPEG without a rotation tag and for all
 * PNG and WebP files; only a JPEG with an orientation tag other than 1 is decoded
 * and saved again, and only while "Apply orientation" is ticked (the default).
 */
const fixtures = fileURLToPath(new URL('./fixtures/generated/', import.meta.url));
const read = (name: string) => new Uint8Array(readFileSync(fixtures + name));

test.beforeAll(() => {
  if (!existsSync(fixtures + 'photo.jpg')) execSync('python3 tests/fixtures/make-fixtures.py', { stdio: 'inherit' });
});

/** Everything from the start-of-scan marker on: the entropy-coded picture and its end marker. */
function jpegScan(b: Uint8Array): Uint8Array {
  let p = 2;
  while (p + 4 <= b.length) {
    const marker = b[p + 1]!;
    if (marker === 0xda) return b.subarray(p);
    p += 2 + ((b[p + 2]! << 8) | b[p + 3]!);
  }
  throw new Error('no scan');
}

/** Every JPEG segment before the scan except the metadata ones (APP1 to APP15, comments). */
function jpegCodingTables(b: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = [];
  let p = 2;
  while (p + 4 <= b.length && b[p + 1] !== 0xda) {
    const end = p + 2 + ((b[p + 2]! << 8) | b[p + 3]!);
    const m = b[p + 1]!;
    if (m === 0xdb || m === 0xc4 || (m >= 0xc0 && m <= 0xcf)) out.push(b.subarray(p, end));
    p = end;
  }
  return out;
}

function chunkData(b: Uint8Array, start: number, fourcc: string, big: boolean): Uint8Array[] {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out: Uint8Array[] = [];
  let p = start;
  while (p + 8 <= b.length) {
    const [len, type] = big ? [dv.getUint32(p), String.fromCharCode(...b.subarray(p + 4, p + 8))] : [dv.getUint32(p + 4, true), String.fromCharCode(...b.subarray(p, p + 4))];
    const dataStart = p + 8;
    if (type === fourcc) out.push(b.subarray(dataStart, dataStart + len));
    p = dataStart + len + (big ? 4 : len & 1);
  }
  return out;
}
const pngIdat = (b: Uint8Array) => chunkData(b, 8, 'IDAT', true);
const webpBitstream = (b: Uint8Array) => [...chunkData(b, 12, 'VP8 ', false), ...chunkData(b, 12, 'VP8L', false)];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function setOrientation(tiff: Uint8Array, value: number) {
  const info = parseTiff(tiff);
  const dv = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  dv.setUint16(info.orientationValueOffset!, value, tiff[0] === 0x49);
}

/** A copy of the PNG fixture whose eXIf chunk says "rotated 90 degrees". */
function rotatedPng(): Uint8Array {
  const b = read('graphic.png').slice();
  const tiff = pngExifTiff(b)!;
  setOrientation(tiff, 6);
  const start = tiff.byteOffset - 8;
  const crc = crc32(b.subarray(start + 4, tiff.byteOffset + tiff.length));
  new DataView(b.buffer).setUint32(tiff.byteOffset + tiff.length, crc);
  return b;
}

function rotatedWebp(): Uint8Array {
  const b = read('picture.webp').slice();
  setOrientation(webpExifTiff(b)!, 6);
  return b;
}

/** The sideways fixture with its rotation tag reset to "upright", GPS and camera data left in. */
function uprightJpegWithExif(): Uint8Array {
  const photo = read('photo.jpg');
  return jpegWithExif(stripJpeg(photo).bytes, withNormalOrientation(jpegExifTiff(photo)!));
}

async function runTool(page: Page, name: string, mimeType: string, buffer: Uint8Array, opts: { applyOrientation?: boolean; keepIcc?: boolean } = {}) {
  await page.goto('/tools/strip-exif');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles({ name, mimeType, buffer: Buffer.from(buffer) });
  await expect(page.locator('#tool')).toHaveAttribute('data-count', '1');
  if (opts.applyOrientation === false) await page.locator('#apply-orientation').uncheck();
  else await expect(page.locator('#apply-orientation')).toBeChecked();
  if (opts.keepIcc === false) await page.locator('#keep-icc').uncheck();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#run').click()]);
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 30_000 });
  const out = new Uint8Array(readFileSync((await download.path())!));
  return { out, note: (await page.locator('.result-item .meta').first().textContent()) ?? '' };
}

test.describe('lossless cases: the image data is the input image data', () => {
  test('JPEG with no rotation tag, defaults: scan and coding tables are byte-identical, metadata gone', async ({ page }) => {
    const input = uprightJpegWithExif();
    expect(inspect(input).orientation).toBe(1);
    expect(inspect(input).hasGps).toBe(true);
    const { out, note } = await runTool(page, 'upright.jpg', 'image/jpeg', input);
    expect(note).toContain('removed');
    expect(note).not.toContain('re-encoded');
    expect(jpegScan(out)).toEqual(jpegScan(input));
    expect(jpegCodingTables(out)).toEqual(jpegCodingTables(input));
    expect(inspect(out).kinds).toEqual([]);
    expect(inspect(out).hasGps).toBe(false);
    expect(out.length).toBeLessThan(input.length);
  });

  test('JPEG with no EXIF at all, defaults: the output file is the input file', async ({ page }) => {
    const input = read('plain.jpg');
    const { out } = await runTool(page, 'plain.jpg', 'image/jpeg', input);
    expect(out).toEqual(input);
  });

  test('sideways JPEG with Apply orientation unticked: scan and tables are byte-identical, tag is gone', async ({ page }) => {
    const input = read('photo.jpg');
    expect(inspect(input).orientation).toBe(6);
    const { out, note } = await runTool(page, 'photo.jpg', 'image/jpeg', input, { applyOrientation: false });
    expect(note).not.toContain('re-encoded');
    expect(jpegScan(out)).toEqual(jpegScan(input));
    expect(jpegCodingTables(out)).toEqual(jpegCodingTables(input));
    expect(inspect(out).orientation).toBeUndefined();
    expect(inspect(out).kinds).toEqual([]);
  });

  test('PNG and WebP carrying a rotation tag are never re-encoded, even with Apply orientation ticked', async ({ page }) => {
    const png = rotatedPng();
    expect(inspect(png).orientation).toBe(6);
    const p = await runTool(page, 'rotated.png', 'image/png', png);
    expect(p.note).not.toContain('re-encoded');
    expect(pngIdat(p.out)).toEqual(pngIdat(png));
    expect(inspect(p.out).kinds).toEqual([]);

    const webp = rotatedWebp();
    expect(inspect(webp).orientation).toBe(6);
    const w = await runTool(page, 'rotated.webp', 'image/webp', webp);
    expect(w.note).not.toContain('re-encoded');
    expect(webpBitstream(w.out)).toEqual(webpBitstream(webp));
    expect(inspect(w.out).kinds).toEqual([]);
  });

  test('PNG and WebP with Apply orientation unticked are also copied unchanged', async ({ page }) => {
    const png = read('graphic.png');
    const p = await runTool(page, 'graphic.png', 'image/png', png, { applyOrientation: false });
    expect(pngIdat(p.out)).toEqual(pngIdat(png));
    const webp = read('picture.webp');
    const w = await runTool(page, 'picture.webp', 'image/webp', webp, { applyOrientation: false });
    expect(webpBitstream(w.out)).toEqual(webpBitstream(webp));
  });
});

test.describe('the one re-encoding case', () => {
  test('sideways JPEG with Apply orientation ticked (default) is decoded, rotated and saved again', async ({ page }) => {
    const input = read('photo.jpg');
    const { out, note } = await runTool(page, 'photo.jpg', 'image/jpeg', input);
    expect(note).toContain('re-encoded');
    expect(sniffFormat(out)).toBe('jpeg');
    expect(jpegScan(out)).not.toEqual(jpegScan(input));
    expect(inspect(out).kinds).toEqual([]);
    expect(inspect(out).orientation).toBeUndefined();
    // Sideways in the file (Pillow stores 1600 x 1200 with tag 6); upright in the output.
    const size = (b: Uint8Array) => {
      const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
      let i = 2;
      while (i < b.length) {
        const m = b[i + 1]!;
        if (m >= 0xc0 && m <= 0xc2) return [dv.getUint16(i + 7), dv.getUint16(i + 5)];
        i += 2 + dv.getUint16(i + 2);
      }
      throw new Error('no SOF');
    };
    const [iw, ih] = size(input);
    expect(size(out)).toEqual([ih, iw]);
  });
});

test.describe('library behaviour behind the table', () => {
  test('stripping a JPEG with no rotation tag copies every non-metadata byte', () => {
    const input = uprightJpegWithExif();
    const { bytes } = strip(input);
    expect(jpegScan(bytes)).toEqual(jpegScan(input));
  });

  test('HEIC is read for the report but refused for stripping', () => {
    const heic = new Uint8Array(32);
    heic.set([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63], 0);
    expect(sniffFormat(heic)).toBe('heif');
    expect(() => strip(heic)).toThrow(/Convert HEIC photos first/);
  });
});

test.describe('copy matches the behaviour', () => {
  const tool = tools.find((t) => t.slug === 'strip-exif')!;
  const preset = presets.find((p) => p.slug === 'remove-location-from-photos')!;

  test('the tool re-encodes at the quality the copy names, and only in that branch', () => {
    const src = readFileSync(fileURLToPath(new URL('../src/tools/strip-exif.ts', import.meta.url)), 'utf8');
    expect(src).toContain("type: 'image/jpeg', quality: 0.95");
    expect(src).toContain("format === 'jpeg'");
    expect(tool.faq!.map((f) => f.a).join(' ')).toContain('quality 95');
    expect(preset.faq!.map((f) => f.a).join(' ')).toContain('quality 95');
  });

  test('no strip-EXIF description claims it never re-encodes without naming the exception', () => {
    const texts = [tool.description, tool.tagline, ...(tool.faq ?? []).map((f) => f.a), preset.description, preset.tagline, ...(preset.intro ?? []), ...(preset.faq ?? []).map((f) => f.a)];
    for (const t of texts.filter((x) => /re-?encod|re-?compress|pixel-identical|byte for byte|untouched|lossless/i.test(x ?? ''))) {
      expect(t, t).toMatch(/orientation/i);
    }
  });
});
