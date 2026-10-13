import { test, expect, type Page } from '@playwright/test';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFString, PDFArray, PDFDict, PDFStream, decodePDFRawStream, type PDFObject } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';

const nodeModules = fileURLToPath(new URL('../node_modules/', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'gray-pdf-'));

/* ---------- fixtures ---------- */

function python(code: string) {
  execFileSync('python3', ['-c', code], { stdio: 'inherit' });
}

/** Small JPEGs written by Pillow: an RGB photo-like gradient, a solid CMYK one, and a progressive one. */
function makeJpegs() {
  const rgb = join(dir, 'rgb.jpg');
  const cmyk = join(dir, 'cmyk.jpg');
  const prog = join(dir, 'prog.jpg');
  python(`
from PIL import Image
import numpy as np
x = np.linspace(0, 255, 200)[None, :].repeat(150, 0)
y = np.linspace(0, 255, 150)[:, None].repeat(200, 1)
img = np.stack([x, y, 255 - x], -1).astype('uint8')
im = Image.fromarray(img)
im.save(${JSON.stringify(rgb)}, quality=92)
im.save(${JSON.stringify(prog)}, quality=92, progressive=True)
Image.new('CMYK', (64, 48), (128, 0, 0, 51)).save(${JSON.stringify(cmyk)}, quality=95)
`);
  return { rgb: readFileSync(rgb), cmyk: readFileSync(cmyk), prog: readFileSync(prog) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Res = Record<string, any>;

async function builder() {
  const doc = await PDFDocument.create();
  const ctx = doc.context;
  const font = ctx.register(ctx.obj({ Type: 'Font', Subtype: 'Type1', BaseFont: 'Helvetica' }));
  const addPage = (content: string | Uint8Array, res: Res = {}, extra: Record<string, PDFObject> = {}) => {
    const page = doc.addPage([300, 300]);
    page.node.set(PDFName.of('Contents'), ctx.register(ctx.stream(content)));
    page.node.set(PDFName.of('Resources'), ctx.obj({ Font: { F1: font }, ...res }));
    for (const [k, v] of Object.entries(extra)) page.node.set(PDFName.of(k), v);
    return page;
  };
  return { doc, ctx, font, addPage };
}

const link = (ctx: PDFDocument['context']) =>
  ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: [20, 250, 200, 280], Border: [0, 0, 0], A: { Type: 'Action', S: 'URI', URI: PDFString.of('https://example.com/') } }));

async function rgbFixture(): Promise<Uint8Array> {
  const { doc, ctx, addPage } = await builder();
  const head = Buffer.from(
    [
      'BT /F1 18 Tf 1 0 0 rg 20 260 Td (RGB red heading) Tj ET',
      '0 0.6 0 rg 20 150 100 60 re f',
      '0 0 1 RG 4 w 20 100 m 200 100 l S',
      '0.2 0.4 0.8 rg 150 150 50 50 re f',
      'q 50 0 0 50 200 20 cm BI /W 2 /H 2 /CS /RGB /BPC 8 ID ',
    ].join('\n'),
  );
  const raw = Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0]);
  const content = Buffer.concat([head, raw, Buffer.from('\nEI Q\n')]);
  // A highlight whose appearance stream is red, as a PDF reader would write it.
  const ap = ctx.register(ctx.stream('1 0 0 RG 1 1 0 rg 0 0 100 20 re B', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 100, 20] }));
  const square = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Square', Rect: [20, 20, 120, 40], C: [1, 0, 0], IC: [1, 1, 0], AP: { N: ap } }));
  const page = addPage(content);
  page.node.set(PDFName.of('Annots'), ctx.obj([link(ctx), square]));
  return doc.save({ useObjectStreams: false });
}

async function cmykFixture(): Promise<Uint8Array> {
  const { doc, ctx, addPage } = await builder();
  const page = addPage(
    ['BT /F1 18 Tf 0 0 0 1 k 20 260 Td (CMYK black text) Tj ET', '1 0 0 0 k 20 150 100 60 re f', '0 1 1 0 K 4 w 20 100 m 200 100 l S', '0.5 0.5 0 0.1 k 150 150 50 50 re f'].join('\n'),
  );
  page.node.set(PDFName.of('Annots'), ctx.obj([link(ctx)]));
  return doc.save({ useObjectStreams: false });
}

async function jpegFixture(jpeg: Buffer, space: 'DeviceRGB' | 'DeviceCMYK', w: number, h: number): Promise<Uint8Array> {
  const { doc, ctx, addPage } = await builder();
  const dict: Res = { Type: 'XObject', Subtype: 'Image', Width: w, Height: h, ColorSpace: space, BitsPerComponent: 8, Filter: 'DCTDecode' };
  if (space === 'DeviceCMYK') dict.Decode = [1, 0, 1, 0, 1, 0, 1, 0];
  const img = ctx.register(ctx.stream(jpeg, dict));
  addPage(`BT /F1 18 Tf 0 g 20 260 Td (Photo page text) Tj ET\nq 200 0 0 150 20 80 cm /Im1 Do Q`, { XObject: { Im1: img } });
  return doc.save({ useObjectStreams: false });
}

async function flateFixture(): Promise<Uint8Array> {
  const { doc, ctx, addPage } = await builder();
  const w = 64;
  const h = 64;
  const px = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      px[(y * w + x) * 3] = x * 4;
      px[(y * w + x) * 3 + 1] = y * 4;
      px[(y * w + x) * 3 + 2] = 255 - x * 4;
    }
  const img = ctx.register(ctx.flateStream(px, { Type: 'XObject', Subtype: 'Image', Width: w, Height: h, ColorSpace: 'DeviceRGB', BitsPerComponent: 8 }));
  // 4-bit indexed picture: three palette colours in a row of stripes.
  const idx = Buffer.alloc(8 * 8);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (x % 2 === 0) idx[y * 4 + (x >> 1)] = ((x % 3) << 4) | ((x + 1) % 3);
  const indexed = ctx.register(
    ctx.flateStream(idx.subarray(0, 32), { Type: 'XObject', Subtype: 'Image', Width: 8, Height: 8, ColorSpace: ['Indexed', 'DeviceRGB', 2, PDFString.of('\xff\x00\x00\x00\xff\x00\x00\x00\xff')], BitsPerComponent: 4 }),
  );
  // An RGB image with a soft mask: the mask must stay as it is.
  const mask = ctx.register(ctx.flateStream(Buffer.alloc(w * h, 128), { Type: 'XObject', Subtype: 'Image', Width: w, Height: h, ColorSpace: 'DeviceGray', BitsPerComponent: 8 }));
  const masked = ctx.register(ctx.flateStream(px, { Type: 'XObject', Subtype: 'Image', Width: w, Height: h, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, SMask: mask }));
  addPage('q 128 0 0 128 20 140 cm /Im1 Do Q\nq 64 0 0 64 180 140 cm /Im2 Do Q\nq 64 0 0 64 180 40 cm /Im3 Do Q\nBT /F1 14 Tf 20 260 Td (Flate images) Tj ET', {
    XObject: { Im1: img, Im2: indexed, Im3: masked },
  });
  return doc.save({ useObjectStreams: false });
}

async function formFixture(): Promise<Uint8Array> {
  const { doc, ctx, font, addPage } = await builder();
  const inner = ctx.register(ctx.stream('0 1 0 rg 0 0 30 30 re f', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 30, 30] }));
  const form = ctx.register(
    ctx.stream('0 0 1 rg 0 0 120 40 re f\n1 g BT /F1 14 Tf 4 14 Td (Inside a form) Tj ET\nq 1 0 0 1 90 5 cm /Inner Do Q', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 130, 40],
      Resources: { Font: { F1: font }, XObject: { Inner: inner } },
    }),
  );
  // A coloured tiling pattern.
  const tile = ctx.register(ctx.stream('1 0.5 0 rg 0 0 5 5 re f 0 0.5 1 rg 5 5 5 5 re f', { Type: 'Pattern', PatternType: 1, PaintType: 1, TilingType: 1, BBox: [0, 0, 10, 10], XStep: 10, YStep: 10, Resources: {} }));
  // Shadings: exponential, stitching and sampled functions, as a plain shading and a pattern.
  const fn2 = { FunctionType: 2, Domain: [0, 1], C0: [1, 0, 0], C1: [0, 0, 1], N: 1 };
  const stitch = { FunctionType: 3, Domain: [0, 1], Bounds: [0.5], Encode: [0, 1, 0, 1], Functions: [{ FunctionType: 2, Domain: [0, 1], C0: [1, 0, 0], C1: [0, 1, 0], N: 1 }, { FunctionType: 2, Domain: [0, 1], C0: [0, 1, 0], C1: [0, 0, 1], N: 1 }] };
  const sampled = ctx.register(ctx.stream(Buffer.from([255, 0, 0, 0, 255, 0]), { FunctionType: 0, Domain: [0, 1], Range: [0, 1, 0, 1, 0, 1], Size: [2], BitsPerSample: 8 }));
  const shA = ctx.register(ctx.obj({ ShadingType: 2, ColorSpace: 'DeviceRGB', Coords: [20, 0, 120, 0], Function: fn2, Extend: [true, true] }));
  const shB = ctx.register(ctx.obj({ ShadingType: 2, ColorSpace: 'DeviceRGB', Coords: [20, 0, 120, 0], Function: stitch }));
  const shC = ctx.register(ctx.obj({ ShadingType: 2, ColorSpace: 'DeviceRGB', Coords: [20, 0, 120, 0], Function: sampled }));
  const patSh = ctx.register(ctx.obj({ Type: 'Pattern', PatternType: 2, Shading: shA }));
  const page = addPage(
    [
      'q 20 200 m 150 200 l 150 260 l 20 260 l h W n /ShA sh Q',
      'q 1 0 0 1 20 140 cm /Fm1 Do Q',
      '/Pattern cs /P1 scn 170 200 100 60 re f',
      '/Pattern cs /P2 scn 170 120 100 60 re f',
      'q 20 60 100 30 re W n /ShB sh Q',
      'q 150 20 100 30 re W n /ShC sh Q',
    ].join('\n'),
    { XObject: { Fm1: form }, Pattern: { P1: tile, P2: patSh }, Shading: { ShA: shA, ShB: shB, ShC: shC } },
  );
  // A widget-like annotation with its own default appearance string.
  const widget = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Widget', FT: 'Tx', T: PDFString.of('f1'), Rect: [20, 10, 120, 30], DA: PDFString.of('0 0 1 rg /Helv 12 Tf'), MK: { BC: [1, 0, 0], BG: [0, 1, 0] } }));
  page.node.set(PDFName.of('Annots'), ctx.obj([widget]));
  return doc.save({ useObjectStreams: false });
}

/** Page 1 converts; page 2 uses a Separation spot colour, which falls back to the overlay. */
async function separationFixture(): Promise<Uint8Array> {
  const { doc, addPage } = await builder();
  addPage('BT /F1 18 Tf 1 0 0 rg 20 260 Td (Page one in colour) Tj ET\n0 0.5 0 rg 20 100 100 100 re f');
  addPage('BT /F1 18 Tf 0 0 1 rg 20 260 Td (Page two has a spot colour) Tj ET\n/CS0 cs 1 scn 20 100 100 100 re f\n0.5 0 0 rg 150 100 50 50 re f', {
    ColorSpace: { CS0: ['Separation', 'Spot', 'DeviceRGB', { FunctionType: 2, Domain: [0, 1], C0: [1, 1, 1], C1: [0.9, 0.1, 0.1], N: 1 }] },
  });
  addPage('BT /F1 18 Tf 0 0 0 rg 20 260 Td (Page three is black text) Tj ET');
  return doc.save({ useObjectStreams: false });
}

/* ---------- inspection helpers ---------- */

async function loadOut(bytes: Uint8Array) {
  return PDFDocument.load(bytes);
}

/** Decode a stream: Flate, then a PNG predictor if there is one. */
function decodeStream(s: PDFRawStream): Uint8Array {
  let data = decodePDFRawStream(s).decode();
  const parms = s.dict.lookup(PDFName.of('DecodeParms'));
  if (parms instanceof PDFDict && parms.lookup(PDFName.of('Predictor')) instanceof PDFNumber) {
    const cols = (parms.lookup(PDFName.of('Columns')) as PDFNumber).asNumber();
    const rows = data.length / (cols + 1);
    const out = new Uint8Array(rows * cols);
    for (let r = 0; r < rows; r++) {
      const type = data[r * (cols + 1)]!;
      for (let i = 0; i < cols; i++) {
        const x = data[r * (cols + 1) + 1 + i]!;
        out[r * cols + i] = type === 2 && r > 0 ? (x + out[(r - 1) * cols + i]!) & 255 : x;
      }
    }
    data = out;
  }
  return data;
}

/** A page's content as text, whether Contents is one stream or an array of them. */
function pageContent(doc: PDFDocument, i: number): string {
  const c = doc.getPages()[i]!.node.lookup(PDFName.of('Contents'));
  const streams = c instanceof PDFArray ? Array.from({ length: c.size() }, (_, k) => c.lookup(k) as PDFRawStream) : [c as PDFRawStream];
  return streams.map((s) => latin1(decodePDFRawStream(s).decode())).join('\n');
}

function latin1(b: Uint8Array) {
  return Buffer.from(b).toString('latin1');
}

/** Every content stream: page contents, forms, tiling patterns. Inline image data is cut out. */
function contentStreams(doc: PDFDocument): string[] {
  const out: string[] = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const d = obj.dict;
    const isImage = d.get(PDFName.of('Subtype')) === PDFName.of('Image');
    const isFunction = d.has(PDFName.of('FunctionType'));
    const isFont = d.has(PDFName.of('Length1')) || d.get(PDFName.of('Subtype')) === PDFName.of('Type1C');
    if (isImage || isFunction || isFont) continue;
    out.push(latin1(decodePDFRawStream(obj).decode()).replace(/\bBI\b[\s\S]*?\bID\b[\s\S]*?\bEI\b/g, 'BI-EI'));
  }
  return out;
}

function assertNoColourOperators(streams: string[]) {
  expect(streams.length).toBeGreaterThan(0);
  for (const s of streams) {
    // rg RG k K as whole operators, and sc/scn with more than one number.
    expect(s, s).not.toMatch(/(^|\s)(rg|RG|k|K)(\s|$)/);
    expect(s, s).not.toMatch(/(-?[\d.]+\s+){2,}(sc|scn|SC|SCN)(\s|$)/);
  }
}

function imageStreams(doc: PDFDocument) {
  const out: { dict: PDFDict; stream: PDFRawStream }[] = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects())
    if (obj instanceof PDFRawStream && obj.dict.get(PDFName.of('Subtype')) === PDFName.of('Image')) out.push({ dict: obj.dict, stream: obj });
  return out;
}

function assertImagesGray(doc: PDFDocument, expected: number) {
  const imgs = imageStreams(doc);
  expect(imgs.length).toBeGreaterThanOrEqual(expected);
  for (const { dict } of imgs) expect(String(dict.get(PDFName.of('ColorSpace')))).toBe('/DeviceGray');
}

async function pageText(bytes: Uint8Array, n: number): Promise<string> {
  const doc = await getDocument({ data: bytes.slice(), useWorkerFetch: false, standardFontDataUrl: nodeModules + 'pdfjs-dist/standard_fonts/' }).promise;
  const page = await doc.getPage(n);
  const text = (await page.getTextContent()).items
    .filter((i): i is TextItem => 'str' in i)
    .map((i) => i.str)
    .join(' ');
  await doc.loadingTask.destroy();
  return text;
}

function linkCount(doc: PDFDocument): number {
  let n = 0;
  for (const p of doc.getPages()) {
    const annots = p.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
    for (let i = 0; i < (annots?.size() ?? 0); i++) {
      const a = annots!.lookup(i, PDFDict);
      if (a.get(PDFName.of('Subtype')) === PDFName.of('Link')) n++;
    }
  }
  return n;
}

/** Run the Grayscale PDF tool on a fixture and return the converted bytes, its note, and the page errors. */
async function convert(page: Page, name: string, bytes: Uint8Array) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const file = join(dir, name);
  writeFileSync(file, bytes);
  await page.goto('/tools/grayscale-pdf');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles([file]);
  await expect(page.locator('#tool')).toHaveAttribute('data-count', '1');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#run').click()]);
  const out = new Uint8Array(readFileSync((await download.path())!));
  await expect(page.locator('#results-list .result-item')).toHaveCount(1);
  const note = await page.locator('#results-list .result-item').innerText();
  expect(errors).toEqual([]);
  return { out, note, suggested: download.suggestedFilename() };
}

/* ---------- tests ---------- */

test('RGB text, vectors, an inline image and annotations become gray; text stays text and links stay', async ({ page }) => {
  const src = await rgbFixture();
  const { out, note, suggested } = await convert(page, 'rgb.pdf', src);
  expect(suggested).toBe('rgb-grayscale.pdf');
  expect(note).toContain('1 page converted to grayscale');
  expect(note).not.toContain('greyed on top');
  const doc = await loadOut(out);
  expect(doc.getPageCount()).toBe(1);
  assertNoColourOperators(contentStreams(doc));
  // No overlay was needed.
  expect(pageContent(doc, 0)).not.toContain('/GS');
  expect(JSON.stringify(Buffer.from(out).toString('latin1').includes('/Saturation'))).toBe('false');
  expect(await pageText(out, 1)).toContain('RGB red heading');
  expect(linkCount(doc)).toBe(1);
  // The inline image is now a gray one, and the annotation colours are single values.
  const content = pageContent(doc, 0);
  expect(content).toContain('/CS /G');
  expect(content).toContain('0.299 g');
  expect(content).toMatch(/BT\s*\/F1 18 Tf\s*0\.299 g/);
  const annots = doc.getPages()[0]!.node.lookup(PDFName.of('Annots'), PDFArray);
  const square = annots.lookup(1, PDFDict);
  expect((square.lookup(PDFName.of('C')) as PDFArray).size()).toBe(1);
  expect((square.lookup(PDFName.of('IC')) as PDFArray).size()).toBe(1);
});

test('CMYK text and drawings become gray, with plain black staying black', async ({ page }) => {
  const { out, note } = await convert(page, 'cmyk.pdf', await cmykFixture());
  expect(note).toContain('1 page converted to grayscale');
  const doc = await loadOut(out);
  assertNoColourOperators(contentStreams(doc));
  const content = pageContent(doc, 0);
  // 0 0 0 1 k is exactly black; 100% cyan is 1 - 0.3 = 0.7.
  expect(content).toMatch(/0 g\s*20 260 Td/);
  expect(content).toContain('0.7 g');
  expect(await pageText(out, 1)).toContain('CMYK black text');
  expect(linkCount(doc)).toBe(1);
});

test('an RGB JPEG becomes a grayscale JPEG that still decodes, and the file shrinks', async ({ page }) => {
  const { rgb } = makeJpegs();
  const src = await jpegFixture(rgb, 'DeviceRGB', 200, 150);
  const { out, note } = await convert(page, 'jpeg.pdf', src);
  expect(note).toContain('converted to grayscale');
  const doc = await loadOut(out);
  assertImagesGray(doc, 1);
  const img = imageStreams(doc)[0]!;
  expect(String(img.dict.get(PDFName.of('Filter')))).toBe('/DCTDecode');
  expect(img.dict.lookup(PDFName.of('BitsPerComponent'))).toEqual(PDFNumber.of(8));
  const jpg = join(dir, 'out.jpg');
  writeFileSync(jpg, img.stream.contents);
  // One component, the right size, and gray values near the luminance of the first pixel (0, 0, 255).
  const info = execFileSync('python3', ['-c', `from PIL import Image; im = Image.open(${JSON.stringify(jpg)}); print(im.mode, im.size, im.getpixel((0, 0)), im.getpixel((199, 149)))`]).toString();
  expect(info).toMatch(/^L \(200, 150\) /);
  const nums = info.match(/\) (\d+) (\d+)/)!;
  // Pixel (0,0) is r=0,g=0,b=255 -> Y = 29; the opposite corner is r=255,g=255,b=0 -> Y = 226.
  expect(Math.abs(Number(nums[1]) - 29)).toBeLessThan(8);
  expect(Math.abs(Number(nums[2]) - 226)).toBeLessThan(8);
  expect(await pageText(out, 1)).toContain('Photo page text');
  expect(out.length).toBeLessThan(src.length);
});

test('a CMYK JPEG and a progressive JPEG are decoded, converted and written as one-component JPEGs', async ({ page }) => {
  const { cmyk, prog } = makeJpegs();
  const a = await convert(page, 'cmyk-jpeg.pdf', await jpegFixture(cmyk, 'DeviceCMYK', 64, 48));
  const doc = await loadOut(a.out);
  assertImagesGray(doc, 1);
  const img = imageStreams(doc)[0]!;
  const f = join(dir, 'cmyk-out.bin');
  writeFileSync(f, String(img.dict.get(PDFName.of('Filter'))) === '/DCTDecode' ? img.stream.contents : decodeStream(img.stream));
  // C = 0.5, K = 0.2: 1 - (0.15 + 0.2) = 0.65 -> 166.
  const mode = String(img.dict.get(PDFName.of('Filter')));
  let value: number;
  if (mode === '/DCTDecode') value = Number(execFileSync('python3', ['-c', `from PIL import Image; print(Image.open(${JSON.stringify(f)}).getpixel((10, 10)))`]).toString());
  else value = readFileSync(f)[10 * 64 + 10]!;
  expect(Math.abs(value - 166)).toBeLessThan(10);

  const b = await convert(page, 'prog-jpeg.pdf', await jpegFixture(prog, 'DeviceRGB', 200, 150));
  assertImagesGray(await loadOut(b.out), 1);
  expect(b.note).toContain('converted to grayscale');
});

test('Flate RGB, indexed and soft-masked images become DeviceGray, and the soft mask is untouched', async ({ page }) => {
  const src = await flateFixture();
  const { out, note } = await convert(page, 'flate.pdf', src);
  expect(note).toContain('converted to grayscale');
  const doc = await loadOut(out);
  assertImagesGray(doc, 4);
  const imgs = imageStreams(doc);
  // The big gradient: pixel (x=10, y=20) was (40, 80, 215) -> Y = 0.299*40 + 0.587*80 + 0.114*215 = 83.5.
  const gradient = imgs.find((i) => i.dict.lookup(PDFName.of('Width'), PDFNumber).asNumber() === 64 && !i.dict.has(PDFName.of('SMask')) && decodeStream(i.stream).length === 64 * 64 && decodeStream(i.stream)[20 * 64 + 10] !== 128)!;
  const v = decodeStream(gradient.stream)[20 * 64 + 10]!;
  expect(Math.abs(v - 84)).toBeLessThan(2);
  // The soft mask is still a 64x64 gray image of 128s.
  const masked = imgs.find((i) => i.dict.has(PDFName.of('SMask')))!;
  const maskRef = masked.dict.get(PDFName.of('SMask')) as PDFRef;
  const mask = doc.context.lookup(maskRef) as PDFRawStream;
  expect(new Set(decodeStream(mask))).toEqual(new Set([128]));
  // Indexed picture: gray palette values of red, green, blue.
  const indexed = imgs.find((i) => i.dict.lookup(PDFName.of('Width'), PDFNumber).asNumber() === 8)!;
  expect(new Set(decodeStream(indexed.stream))).toEqual(new Set([76, 150, 29]));
  expect(await pageText(out, 1)).toContain('Flate images');
});

test('forms, patterns, shadings, Type 3-free appearances and field defaults are all rewritten', async ({ page }) => {
  const { out, note } = await convert(page, 'form.pdf', await formFixture());
  expect(note).toContain('1 page converted to grayscale');
  expect(note).not.toContain('greyed on top');
  const doc = await loadOut(out);
  assertNoColourOperators(contentStreams(doc));
  // Shadings: every ColorSpace is DeviceGray and every function gives one value.
  let shadings = 0;
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFDict && obj.has(PDFName.of('ShadingType'))) {
      shadings++;
      expect(String(obj.get(PDFName.of('ColorSpace')))).toBe('/DeviceGray');
    }
    if (obj instanceof PDFDict && obj.get(PDFName.of('FunctionType')) === PDFNumber.of(2)) {
      expect((obj.lookup(PDFName.of('C0')) as PDFArray).size()).toBe(1);
      expect((obj.lookup(PDFName.of('C1')) as PDFArray).size()).toBe(1);
    }
    if (obj instanceof PDFStream && obj.dict.has(PDFName.of('FunctionType'))) {
      // The sampled function: two gray samples, 76 (red) then 150 (green).
      expect(Array.from(decodePDFRawStream(obj as PDFRawStream).decode())).toEqual([76, 150]);
      expect((obj.dict.lookup(PDFName.of('Range')) as PDFArray).size()).toBe(2);
    }
  }
  expect(shadings).toBe(3);
  // The widget's default appearance and border colours.
  const widget = doc.getPages()[0]!.node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
  expect(String(widget.lookup(PDFName.of('DA')))).toContain('0.114 g');
  expect((widget.lookup(PDFName.of('MK'), PDFDict).lookup(PDFName.of('BG')) as PDFArray).size()).toBe(1);
  expect(await pageText(out, 1)).toContain('Inside a form');
});

test('colour that can not be converted keeps the overlay on that page only, and the note says so', async ({ page }) => {
  const src = await separationFixture();
  const { out, note } = await convert(page, 'spot.pdf', src);
  expect(note).toContain('2 pages converted');
  expect(note).toContain("1 page has colour we couldn't convert and is greyed on top");
  expect(note).toContain('the colour is still stored in the file');
  const doc = await loadOut(out);
  expect(doc.getPageCount()).toBe(3);
  const hasOverlay = (i: number) => {
    const res = doc.getPages()[i]!.node.Resources()!;
    const gs = res.lookupMaybe(PDFName.of('ExtGState'), PDFDict);
    if (!gs) return false;
    return gs.values().some((v) => String(doc.context.lookup(v)).includes('/BM /Saturation'));
  };
  expect([hasOverlay(0), hasOverlay(1), hasOverlay(2)]).toEqual([false, true, false]);
  // Page two's RGB operators are still converted; only the spot colour is left to the overlay.
  const page2 = pageContent(doc, 1);
  expect(page2).not.toMatch(/(^|\s)rg(\s|$)/);
  expect(page2).toContain('/CS0 cs');
  expect(await pageText(out, 2)).toContain('Page two has a spot colour');
});

test('a text-only PDF stays about the same size, and its text and links survive', async ({ page }) => {
  const { doc, ctx, addPage } = await builder();
  void ctx;
  for (let i = 1; i <= 3; i++) {
    const p = addPage(`BT /F1 14 Tf 0.1 0.1 0.1 rg 20 200 Td (Page ${i} of the text only fixture) Tj ET\n0.2 0.5 0.4 rg 60 20 150 100 re f`);
    p.node.set(PDFName.of('Annots'), doc.context.obj([link(doc.context)]));
  }
  const src = await doc.save({ useObjectStreams: true });
  const { out, note } = await convert(page, 'textonly.pdf', src);
  expect(note).toContain('3 pages converted to grayscale');
  expect(out.length).toBeLessThanOrEqual(src.length + 400);
  const result = await loadOut(out);
  expect(result.getPageCount()).toBe(3);
  expect(linkCount(result)).toBe(3);
  for (let i = 1; i <= 3; i++) expect(await pageText(out, i)).toContain(`Page ${i} of the text only fixture`);
  assertNoColourOperators(contentStreams(result));
});

test('the converted page renders gray, not just labelled gray', async ({ page }) => {
  const { out } = await convert(page, 'render.pdf', await rgbFixture());
  const file = join(dir, 'render-out.pdf');
  writeFileSync(file, out);
  await page.goto('/tools/crop-pdf');
  await page.locator('#file-input').setInputFiles([file]);
  await expect(page.locator('#crop-panel')).toBeVisible();
  // The green box (0, 0.6, 0) sits at the lower left of the 300 x 300 page.
  const px = await page.locator('#page-canvas').evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext('2d')!.getImageData(Math.round(c.width * 0.25), Math.round(c.height * (1 - 180 / 300)), 1, 1).data;
    return [d[0]!, d[1]!, d[2]!];
  });
  expect(Math.max(...px) - Math.min(...px)).toBeLessThan(4);
  // 0.587 * 0.6 = 0.352 -> about 90.
  expect(Math.abs(px[0]! - 90)).toBeLessThan(12);
});
