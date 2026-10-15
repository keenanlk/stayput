/**
 * Builds the small test PDFs for the PDF to SVG tool. Nothing third-party: every file is drawn
 * here from content-stream operators with pdf-lib, and the one embedded font is the DejaVu Sans
 * Mono subset the site already ships (public/fonts, free licence).
 *
 *   node scripts/make-pdf-svg-fixtures.mjs <out-dir>     write the PDFs
 *   import { buildFixtures } from './make-pdf-svg-fixtures.mjs'   use the bytes in a test
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { PDFDocument, PDFName } from 'pdf-lib';
import { createRequire } from 'node:module';

const opentype = createRequire(import.meta.url)('opentype.js');

const FONT_FILE = fileURLToPath(new URL('../public/fonts/DejaVuSansMono-subset.ttf', import.meta.url));

/** Latin-1 range plus the Windows-1252 extras, for the font's /Widths array. */
function widthsFor(font) {
  const out = [];
  for (let c = 32; c <= 255; c++) {
    const g = font.charToGlyph(String.fromCharCode(c));
    out.push(Math.round((g.advanceWidth * 1000) / font.unitsPerEm));
  }
  return out;
}

async function newDoc() {
  const doc = await PDFDocument.create();
  const ctx = doc.context;
  const bytes = readFileSync(FONT_FILE);
  const font = opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
  const file = ctx.register(ctx.flateStream(bytes, { Length1: bytes.length }));
  const descriptor = ctx.register(
    ctx.obj({
      Type: 'FontDescriptor',
      FontName: 'ABCDEF+DejaVuSansMono',
      Flags: 33,
      FontBBox: [-1000, -400, 1500, 1200],
      ItalicAngle: 0,
      Ascent: 930,
      Descent: -236,
      CapHeight: 729,
      StemV: 80,
      FontFile2: file,
    }),
  );
  const mono = ctx.register(
    ctx.obj({
      Type: 'Font',
      Subtype: 'TrueType',
      BaseFont: 'ABCDEF+DejaVuSansMono',
      FirstChar: 32,
      LastChar: 255,
      Widths: widthsFor(font),
      FontDescriptor: descriptor,
      Encoding: 'WinAnsiEncoding',
    }),
  );
  const helv = ctx.register(ctx.obj({ Type: 'Font', Subtype: 'Type1', BaseFont: 'Helvetica', Encoding: 'WinAnsiEncoding' }));
  const addPage = (content, resources = {}, size = [300, 300], extra = {}) => {
    const page = doc.addPage(size);
    page.node.set(PDFName.of('Contents'), ctx.register(ctx.stream(content)));
    page.node.set(PDFName.of('Resources'), ctx.obj({ Font: { F1: mono, F2: helv }, ...resources }));
    for (const [k, v] of Object.entries(extra)) page.node.set(PDFName.of(k), v);
    return page;
  };
  return { doc, ctx, addPage };
}

/** A raw RGB (or RGB + soft mask) picture as a Flate image XObject. */
function rgbImage(ctx, width, height, pixel, alpha) {
  const rgb = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) rgb.set(pixel(x, y), (y * width + x) * 3);
  const dict = { Type: 'XObject', Subtype: 'Image', Width: width, Height: height, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'FlateDecode' };
  if (alpha) {
    const a = Buffer.alloc(width * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) a[y * width + x] = alpha(x, y);
    dict.SMask = ctx.register(
      ctx.stream(deflateSync(a), { Type: 'XObject', Subtype: 'Image', Width: width, Height: height, ColorSpace: 'DeviceGray', BitsPerComponent: 8, Filter: 'FlateDecode' }),
    );
  }
  return ctx.register(ctx.stream(deflateSync(rgb), dict));
}

const fixed = (n) => String(Math.round(n * 100) / 100);

/** 6 bars, a dashed trend line, a circle from Bézier curves, axes, small labels, a clipped panel. */
async function vectorChart() {
  const { doc, addPage } = await newDoc();
  const colours = ['0.85 0.25 0.2', '0.95 0.6 0.1', '0.9 0.8 0.15', '0.3 0.7 0.35', '0.2 0.5 0.85', '0.55 0.3 0.75'];
  const heights = [60, 95, 80, 130, 110, 150];
  let c = 'q\n0.97 0.97 0.97 rg 0 0 400 300 re f\nQ\n';
  c += '0.2 w 0 G 40 40 m 40 270 l S 40 40 m 380 40 l S\n';
  colours.forEach((col, i) => {
    c += `${col} rg ${60 + i * 52} 40 36 ${heights[i]} re f\n`;
    c += `0 0 0 RG 0.8 w ${60 + i * 52} 40 36 ${heights[i]} re S\n`;
  });
  c += 'q 0.15 0.15 0.15 RG 2 w [6 4] 0 d 1 J 1 j 60 100 m 120 140 l 190 120 l 250 190 l 320 170 l 360 230 l S Q\n';
  // Circle: four Bézier arcs (kappa 0.5523).
  const k = 0.5523 * 24;
  c += `q 0.9 0.3 0.5 rg 0.1 0.1 0.1 RG 1.5 w 340 250 m 340 ${250 + k} ${316 + k} 274 316 274 c ${316 - k} 274 292 ${250 + k} 292 250 c 292 ${250 - k} ${316 - k} 226 316 226 c ${316 + k} 226 340 ${250 - k} 340 250 c h B Q\n`;
  // Clipped panel: a big triangle only shows inside a small box.
  c += 'q 280 50 90 60 re W n 0.2 0.6 0.9 rg 260 40 m 330 160 l 400 40 l h f Q\n';
  c += 'BT /F1 8 Tf 0 g 50 22 Td (Jan  Feb  Mar  Apr  May  Jun) Tj ET\n';
  c += 'BT /F1 10 Tf 0 g 46 282 Td (Monthly totals) Tj ET\n';
  addPage(c, {}, [400, 300]);
  return doc.save();
}

/** Embedded-font text with spacing operators, accents, justification, rotation and an outline mode. */
async function textFonts() {
  const { doc, addPage } = await newDoc();
  const win = (s) => s; // content stream is written as latin1
  let c = '';
  c += 'BT /F1 18 Tf 40 360 Td (Embedded font text) Tj ET\n';
  c += 'BT /F1 11 Tf 14 TL 40 330 Td (The quick brown fox jumps over the lazy dog.) Tj T* ';
  c += '(Accents: \\351\\350\\352\\353 \\344\\366\\374 \\361 \\347  Symbols: \\275 \\273 \\200 \\251) Tj T* ';
  c += '[(Kerned) -350 (pairs) 120 ( and ) -60 (TJ)] TJ T* ';
  c += '2 Tc (Character spacing) Tj 0 Tc T* 8 Tw (Word spacing is wide here) Tj 0 Tw T* ';
  c += '150 Tz (Stretched horizontally) Tj 100 Tz T* ';
  c += '(Normal ) Tj 5 Ts (raised) Tj -4 Ts ( lowered) Tj 0 Ts ET\n';
  c += 'BT /F1 14 Tf 0.1 0.3 0.7 rg 40 220 Td (Coloured text in blue) Tj ET\n';
  c += 'BT /F1 40 Tf 1 Tr 0.8 0.1 0.1 RG 0.8 w 40 170 Td (Outline) Tj ET\n';
  c += 'BT /F1 12 Tf 0.866 0.5 -0.5 0.866 220 90 Tm 0 g (Rotated thirty degrees) Tj ET\n';
  c += 'BT /F2 12 Tf 40 60 Td (Helvetica is not embedded in this file.) Tj ET\n';
  addPage(win(c), {}, [400, 400]);
  return doc.save();
}

/** One full-page picture and no text: a scan. Big enough (over 400,000 pixels) to take the JPEG path. */
async function scannedImage() {
  const { doc, ctx, addPage } = await newDoc();
  const w = 600;
  const h = 800;
  const k = 2.5; // the layout below is drawn on a 240 x 320 grid
  const img = rgbImage(ctx, w, h, (px, py) => {
    const x = px / k;
    const y = py / k;
    // A "document": cream paper, dark text-like rows, a stamp-like box and a soft shadow.
    let v = 238 - Math.round(((x - 120) ** 2 + (y - 160) ** 2) / 900);
    const row = Math.floor((y - 40) / 12);
    if (y > 40 && y < 260 && (y - 40) % 12 > 3 && (y - 40) % 12 < 8 && x > 24 && x < 216 - ((row * 37) % 70)) v = 40;
    if (x > 150 && x < 210 && y > 270 && y < 305 && (x < 151.5 || x > 207.5 || y < 271.5 || y > 302.5)) return [170, 30, 30];
    return [v, v - 6, v - 22];
  });
  addPage('q 300 0 0 400 0 0 cm /Im0 Do Q\n', { XObject: { Im0: img } }, [300, 400]);
  return doc.save();
}

/** Axial and radial shadings, a shading used as a fill pattern, and 50 % alpha shapes over a picture. */
async function gradientTransparency() {
  const { doc, ctx, addPage } = await newDoc();
  const fn = (c0, c1) => ctx.obj({ FunctionType: 2, Domain: [0, 1], C0: c0, C1: c1, N: 1 });
  const axial = ctx.register(ctx.obj({ ShadingType: 2, ColorSpace: 'DeviceRGB', Coords: [20, 0, 220, 0], Function: fn([1, 0.2, 0.1], [0.1, 0.3, 1]), Extend: [true, true] }));
  const radial = ctx.register(
    ctx.obj({ ShadingType: 3, ColorSpace: 'DeviceRGB', Coords: [70, 0, 5, 70, 0, 60], Function: fn([1, 1, 0.3], [0.1, 0.5, 0.2]), Extend: [false, false] }),
  );
  const pat = ctx.register(
    ctx.obj({ Type: 'Pattern', PatternType: 2, Shading: ctx.register(ctx.obj({ ShadingType: 2, ColorSpace: 'DeviceRGB', Coords: [0, 0, 0, 120], Function: fn([0.9, 0.9, 0.2], [0.8, 0.1, 0.6]), Extend: [true, true] })) }),
  );
  const alphaHalf = ctx.register(ctx.obj({ Type: 'ExtGState', ca: 0.5, CA: 0.5 }));
  const alphaQuarter = ctx.register(ctx.obj({ Type: 'ExtGState', ca: 0.25 }));
  const picture = rgbImage(
    ctx,
    64,
    64,
    (x, y) => [x * 4, y * 4, 128],
    (x, y) => Math.min(255, Math.round(Math.hypot(x - 32, y - 32) < 30 ? 255 : 40)),
  );
  let c = '';
  c += 'q 20 250 200 40 re W n /Sh1 sh Q\n';
  c += 'q 1 0 0 1 120 150 cm 0 0 0 RG 1 w -70 -60 140 120 re W n /Sh2 sh Q\n';
  c += 'q /Pattern cs /P1 scn 20 20 90 100 re f Q\n';
  c += 'q 100 0 0 100 130 20 cm /Im0 Do Q\n';
  c += 'q /A1 gs 1 0 0 rg 150 40 m 150 70 190 70 190 40 l 190 10 150 10 150 40 l f Q\n';
  c += 'q /A1 gs 0 0.4 1 rg 175 55 50 50 re f Q\n';
  c += 'q /A2 gs 0 0 0 rg 20 130 120 40 re f Q\n';
  c += 'BT /F1 12 Tf 1 g 26 146 Td (Gradient and transparency) Tj ET\n';
  addPage(c, { Shading: { Sh1: axial, Sh2: radial }, Pattern: { P1: pat }, ExtGState: { A1: alphaHalf, A2: alphaQuarter }, XObject: { Im0: picture } }, [300, 300]);
  return doc.save();
}

/** Four pages of boxes and text. */
async function multiPage() {
  const { doc, addPage } = await newDoc();
  const shades = ['0.9 0.4 0.3', '0.3 0.7 0.4', '0.3 0.5 0.9', '0.8 0.6 0.2'];
  shades.forEach((s, i) => {
    let c = `${s} rg 30 ${180 - i * 20} 140 ${60 + i * 20} re f\n`;
    c += `0 G 1 w 20 20 160 260 re S\n`;
    c += `BT /F1 14 Tf 0 g 30 260 Td (Page ${i + 1} of 4) Tj ET\n`;
    c += `BT /F1 9 Tf 12 TL 30 120 Td (Line one on page ${i + 1}) Tj T* (Line two, with numbers ${i * 111}) Tj ET\n`;
    addPage(c, {}, [200, 300]);
  });
  return doc.save();
}

/** Features the converter does not reproduce as vectors: a blend mode, a Type 3 font and a tiling pattern. */
async function unsupported() {
  const { doc, ctx, addPage } = await newDoc();
  const multiply = ctx.register(ctx.obj({ Type: 'ExtGState', BM: 'Multiply' }));
  const tiling = ctx.register(
    ctx.stream('0 0.5 0 rg 0 0 5 5 re f 0.9 0.5 0 rg 5 5 5 5 re f', {
      Type: 'Pattern', PatternType: 1, PaintType: 1, TilingType: 1, BBox: [0, 0, 10, 10], XStep: 10, YStep: 10, Resources: {},
    }),
  );
  const glyph = ctx.register(ctx.stream('500 0 0 0 500 700 d1 0 0 500 700 re f'));
  const t3 = ctx.register(
    ctx.obj({
      Type: 'Font',
      Subtype: 'Type3',
      FontBBox: [0, 0, 500, 700],
      FontMatrix: [0.001, 0, 0, 0.001, 0, 0],
      CharProcs: { box: glyph },
      Encoding: { Type: 'Encoding', Differences: [65, 'box'] },
      FirstChar: 65,
      LastChar: 65,
      Widths: [600],
    }),
  );
  let c = '0.9 0.2 0.2 rg 20 100 120 120 re f\n';
  c += 'q /M1 gs 0.2 0.4 0.9 rg 80 60 120 120 re f Q\n';
  c += 'q /Pattern cs /P1 scn 20 230 120 50 re f Q\n';
  c += 'BT /F3 24 Tf 0 g 160 240 Td (AAA) Tj ET\n';
  c += 'BT /F1 11 Tf 20 30 Td (Page with unsupported features) Tj ET\n';
  const page = addPage(c, { ExtGState: { M1: multiply }, Pattern: { P1: tiling } }, [260, 300]);
  const res = page.node.get(PDFName.of('Resources'));
  res.get(PDFName.of('Font')).set(PDFName.of('F3'), t3);
  return doc.save();
}


/** A small CFF (OpenType-CFF) font made from the DejaVu outlines, so the converter's CFF path is exercised. */
function makeCffFont() {
  const bytes = readFileSync(FONT_FILE);
  const src = opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
  const glyphs = [new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: src.unitsPerEm / 2, path: new opentype.Path() })];
  for (let c = 32; c < 127; c++) {
    const g = src.charToGlyph(String.fromCharCode(c));
    glyphs.push(new opentype.Glyph({ name: `u${c}`, unicode: c, advanceWidth: g.advanceWidth, path: g.getPath(0, 0, src.unitsPerEm) }));
  }
  // opentype.js paths are y-down screen coordinates; flip back into font units.
  for (const g of glyphs) for (const cmd of g.path.commands) for (const k of ['y', 'y1', 'y2']) if (k in cmd) cmd[k] = -cmd[k];
  return new opentype.Font({ familyName: 'FixtureCff', styleName: 'Regular', unitsPerEm: src.unitsPerEm, ascender: src.ascender, descender: src.descender, glyphs });
}

/** Text in an OpenType-CFF font (a FontFile3 /OpenType program), the other outline format fonts come in. */
async function textCff() {
  const { doc, ctx, addPage } = await newDoc();
  const font = makeCffFont();
  const data = new Uint8Array(font.toArrayBuffer());
  const file = ctx.register(ctx.flateStream(data, { Subtype: 'OpenType' }));
  const descriptor = ctx.register(
    ctx.obj({ Type: 'FontDescriptor', FontName: 'ABCDEF+FixtureCff', Flags: 32, FontBBox: [-200, -300, 1300, 1000], ItalicAngle: 0, Ascent: 930, Descent: -236, CapHeight: 729, StemV: 80, FontFile3: file }),
  );
  const widths = [];
  for (let c = 32; c <= 126; c++) widths.push(Math.round((font.charToGlyph(String.fromCharCode(c)).advanceWidth * 1000) / font.unitsPerEm));
  const cff = ctx.register(
    ctx.obj({
      Type: 'Font',
      Subtype: 'Type1',
      BaseFont: 'ABCDEF+FixtureCff',
      FirstChar: 32,
      LastChar: 126,
      Widths: widths,
      FontDescriptor: descriptor,
      // The glyphs are named u32..u126, so say which code is which.
      Encoding: { Type: 'Encoding', Differences: [32, ...Array.from({ length: 95 }, (_, i) => `u${32 + i}`)] },
    }),
  );
  let c = 'BT /F4 20 Tf 30 150 Td (CFF outlines in a PDF) Tj ET\n';
  c += 'BT /F4 12 Tf 14 TL 30 120 Td (Second line: 0123456789 [] {} @#$%) Tj T* (Tracked) Tj ET\n';
  const page = addPage(c, {}, [320, 200]);
  page.node.get(PDFName.of('Resources')).get(PDFName.of('Font')).set(PDFName.of('F4'), cff);
  return doc.save();
}

export async function buildFixtures() {
  return {
    'vector-chart.pdf': await vectorChart(),
    'text-fonts.pdf': await textFonts(),
    'scanned-image.pdf': await scannedImage(),
    'gradient-transparency.pdf': await gradientTransparency(),
    'multi-page.pdf': await multiPage(),
    'text-cff.pdf': await textCff(),
    'unsupported.pdf': await unsupported(),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = process.argv[2];
  if (!out) {
    console.error('usage: node scripts/make-pdf-svg-fixtures.mjs <out-dir>');
    process.exit(1);
  }
  mkdirSync(out, { recursive: true });
  for (const [name, bytes] of Object.entries(await buildFixtures())) {
    writeFileSync(`${out}/${name}`, bytes);
    console.log(`${name}: ${fixed(bytes.length / 1024)} KB`);
  }
}
