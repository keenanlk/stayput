/**
 * Grayscale PDFs without turning pages into pictures. The colour is really
 * taken out of the file, and the text stays text:
 *
 * - Content streams (pages, form XObjects, tiling patterns, Type 3 glyphs and
 *   annotation appearances) have every colour operator rewritten to DeviceGray
 *   with the luminance 0.299 R + 0.587 G + 0.114 B (CMYK uses the PostScript
 *   conversion, which keeps plain black exactly black). Text-showing operators
 *   are copied byte for byte.
 * - RGB, CMYK, ICC and indexed images become 8-bit DeviceGray. Flate images
 *   stay lossless; JPEGs are decoded in the tab and written as grayscale JPEGs
 *   (or Flate when that is smaller). Soft masks and stencils are left alone.
 * - Shadings with exponential, stitching or sampled functions get gray colours.
 *
 * Anything that can't be converted (Separation and DeviceN colours, Lab,
 * uncoloured patterns, JPX images, PostScript functions, unreadable streams)
 * is counted, and that page alone keeps the older approach: a full-page grey
 * rectangle drawn with the Saturation blend mode, which looks grey but leaves
 * the stored colour in place. The result reports those pages, so nothing
 * claims "no colour left" when the overlay was needed.
 */
import { unzlibSync, zlibSync } from 'fflate';
import type * as PdfLib from 'pdf-lib';
import { loadDocument, loadPdfLib, visibleBox } from './pdf';
import { cmykToGray, rgbToGray, rewriteContent, type ColorSpace, type ContentEnv } from './gray-content';
import { encodeGrayJpeg } from './gray-jpeg';
import { UnreadableFile, NamedError } from './input-error';

export interface GrayscaleResult {
  bytes: Uint8Array;
  pages: number;
  /** Pages that still had colour we couldn't convert and got the grey overlay. */
  overlaidPages: number;
  imagesConverted: number;
  /** Images that could not be converted (JPX, Separation, masks by colour key). */
  imagesUnsupported: number;
}

type Obj = PdfLib.PDFObject;

export async function grayscalePdf(source: Uint8Array): Promise<GrayscaleResult> {
  const lib = await loadPdfLib();
  const doc = await loadDocument(source);
  const job = new Job(lib, doc);
  await job.convertImages();
  const pages = doc.getPages();
  // pdf-lib's drawing options only allow the separable blend modes, so the
  // graphics state is written by hand: one shared /BM /Saturation state.
  let gs: PdfLib.PDFRef | undefined;
  let overlaid = 0;
  for (const page of pages) {
    if (job.convertPage(page)) continue;
    overlaid++;
    gs ??= doc.context.register(doc.context.obj({ Type: 'ExtGState', BM: 'Saturation' }));
    const { pushGraphicsState, popGraphicsState, setGraphicsState, setFillingGrayscaleColor, rectangle, fill } = lib;
    const box = visibleBox(page);
    const name = page.node.newExtGState('GS', gs);
    page.pushOperators(
      pushGraphicsState(),
      setGraphicsState(name),
      setFillingGrayscaleColor(0.5),
      rectangle(box.x, box.y, box.width, box.height),
      fill(),
      popGraphicsState(),
    );
  }
  job.convertFormDefaults();
  job.dropReplaced();
  const bytes = await doc.save({ useObjectStreams: true, updateFieldAppearances: false });
  return { bytes, pages: pages.length, overlaidPages: overlaid, imagesConverted: job.imagesConverted, imagesUnsupported: job.imagesUnsupported };
}

class Job {
  imagesConverted = 0;
  imagesUnsupported = 0;
  private readonly N: typeof PdfLib.PDFName;
  private imageOk = new Map<string, boolean>();
  private formOk = new Map<string, boolean>();
  private patternOk = new Map<string, boolean>();
  private shadingOk = new Map<string, boolean>();
  private fontOk = new Map<string, boolean>();
  private fnDone = new Map<string, boolean>();
  /** Content streams we replaced; dropped at the end so the old colour doesn't ride along. */
  private orphans: PdfLib.PDFRef[] = [];

  constructor(
    private readonly lib: typeof PdfLib,
    private readonly doc: PdfLib.PDFDocument,
  ) {
    this.N = lib.PDFName;
  }

  private get ctx(): PdfLib.PDFContext {
    return this.doc.context;
  }

  private name(s: string): PdfLib.PDFName {
    return this.N.of(s);
  }

  /* ---------------- generic object helpers ---------------- */

  private lookup(o: Obj | undefined): Obj | undefined {
    return o === undefined ? undefined : this.ctx.lookup(o);
  }

  private dictOf(o: Obj | undefined): PdfLib.PDFDict | undefined {
    const v = this.lookup(o);
    if (v instanceof this.lib.PDFDict) return v;
    if (v instanceof this.lib.PDFStream) return v.dict;
    return undefined;
  }

  private num(o: Obj | undefined, fallback: number): number {
    const v = this.lookup(o);
    return v instanceof this.lib.PDFNumber ? v.asNumber() : fallback;
  }

  private numbers(o: Obj | undefined): number[] | undefined {
    const v = this.lookup(o);
    if (!(v instanceof this.lib.PDFArray)) return undefined;
    const out: number[] = [];
    for (let i = 0; i < v.size(); i++) {
      const n = this.lookup(v.get(i));
      if (!(n instanceof this.lib.PDFNumber)) return undefined;
      out.push(n.asNumber());
    }
    return out;
  }

  private nameStr(o: Obj | undefined): string | undefined {
    const v = this.lookup(o);
    return v instanceof this.N ? v.decodeText() : undefined;
  }

  private refKey(o: Obj | undefined): string | undefined {
    return o instanceof this.lib.PDFRef ? o.toString() : undefined;
  }

  private numArray(values: number[]): PdfLib.PDFArray {
    return this.ctx.obj(values) as PdfLib.PDFArray;
  }

  /* ---------------- stream decoding ---------------- */

  private filters(dict: PdfLib.PDFDict): { names: string[]; parms: (PdfLib.PDFDict | undefined)[] } {
    const f = this.lookup(dict.get(this.name('Filter')));
    const p = this.lookup(dict.get(this.name('DecodeParms')) ?? dict.get(this.name('DP')));
    const names: string[] = [];
    const parms: (PdfLib.PDFDict | undefined)[] = [];
    if (f instanceof this.N) {
      names.push(f.decodeText());
      parms.push(this.dictOf(p instanceof this.lib.PDFArray ? p.get(0) : p));
    } else if (f instanceof this.lib.PDFArray) {
      for (let i = 0; i < f.size(); i++) {
        names.push(this.nameStr(f.get(i)) ?? '');
        parms.push(p instanceof this.lib.PDFArray ? this.dictOf(p.get(i)) : i === 0 ? this.dictOf(p) : undefined);
      }
    }
    return { names, parms };
  }

  /**
   * Decode a stream through its filter chain. Stops at an image filter
   * (DCT, JPX, CCITT, JBIG2) and says which one in `rest`.
   */
  private decode(stream: PdfLib.PDFRawStream): { data: Uint8Array; rest?: string } {
    const { names, parms } = this.filters(stream.dict);
    let data = stream.contents;
    for (let i = 0; i < names.length; i++) {
      const n = names[i]!;
      if (n === 'DCTDecode' || n === 'JPXDecode' || n === 'CCITTFaxDecode' || n === 'JBIG2Decode' || n === 'Crypt') return { data, rest: n };
      if (n === 'FlateDecode' || n === 'Fl') {
        try {
          data = unzlibSync(data);
        } catch {
          data = this.pdfLibDecode(data, 'FlateDecode');
        }
        data = this.predict(data, parms[i]);
      } else if (n === 'LZWDecode' || n === 'LZW') {
        data = this.pdfLibDecode(data, 'LZWDecode', parms[i]);
        data = this.predict(data, parms[i]);
      } else if (n === 'ASCII85Decode' || n === 'A85') data = this.pdfLibDecode(data, 'ASCII85Decode');
      else if (n === 'ASCIIHexDecode' || n === 'AHx') data = this.pdfLibDecode(data, 'ASCIIHexDecode');
      else if (n === 'RunLengthDecode' || n === 'RL') data = this.pdfLibDecode(data, 'RunLengthDecode');
      else throw new UnreadableFile(`unsupported filter ${n}`);
    }
    return { data };
  }

  private pdfLibDecode(data: Uint8Array, filter: string, parms?: PdfLib.PDFDict): Uint8Array {
    const dict = this.ctx.obj({ Filter: this.name(filter) });
    if (parms) dict.set(this.name('DecodeParms'), parms);
    return this.lib.decodePDFRawStream(this.lib.PDFRawStream.of(dict, data)).decode();
  }

  private predict(data: Uint8Array, parms: PdfLib.PDFDict | undefined): Uint8Array {
    if (!parms) return data;
    const predictor = this.num(parms.get(this.name('Predictor')), 1);
    if (predictor <= 1) return data;
    const colors = this.num(parms.get(this.name('Colors')), 1);
    const bpc = this.num(parms.get(this.name('BitsPerComponent')), 8);
    const columns = this.num(parms.get(this.name('Columns')), 1);
    const bpp = Math.max(1, Math.ceil((colors * bpc) / 8));
    const rowBytes = Math.ceil((colors * bpc * columns) / 8);
    if (predictor === 2) {
      if (bpc !== 8) throw new UnreadableFile('unsupported TIFF predictor');
      const out = data.slice();
      for (let r = 0; r + rowBytes <= out.length; r += rowBytes) for (let i = bpp; i < rowBytes; i++) out[r + i] = (out[r + i]! + out[r + i - bpp]!) & 255;
      return out;
    }
    const rows = Math.ceil(data.length / (rowBytes + 1));
    const out = new Uint8Array(rows * rowBytes);
    for (let r = 0; r < rows; r++) {
      const src = r * (rowBytes + 1);
      const type = data[src] ?? 0;
      const dst = r * rowBytes;
      for (let i = 0; i < rowBytes; i++) {
        const x = data[src + 1 + i] ?? 0;
        const a = i >= bpp ? out[dst + i - bpp]! : 0;
        const b = r > 0 ? out[dst - rowBytes + i]! : 0;
        const c = r > 0 && i >= bpp ? out[dst - rowBytes + i - bpp]! : 0;
        let v: number;
        if (type === 0) v = x;
        else if (type === 1) v = x + a;
        else if (type === 2) v = x + b;
        else if (type === 3) v = x + ((a + b) >> 1);
        else {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
        }
        out[dst + i] = v & 255;
      }
    }
    return out;
  }

  /* ---------------- colour spaces ---------------- */

  private resolveSpace(o: Obj | undefined, resources: PdfLib.PDFDict | undefined, depth = 0): ColorSpace {
    const v = this.lookup(o);
    if (depth > 4 || v === undefined) return { kind: 'bad' };
    if (v instanceof this.N) {
      const n = v.decodeText();
      if (n === 'DeviceGray' || n === 'G') return { kind: 'gray' };
      if (n === 'DeviceRGB' || n === 'RGB') return { kind: 'rgb' };
      if (n === 'DeviceCMYK' || n === 'CMYK') return { kind: 'cmyk' };
      if (n === 'Pattern') return { kind: 'pattern' };
      const spaces = resources?.lookupMaybe(this.name('ColorSpace'), this.lib.PDFDict);
      const hit = spaces?.get(v);
      return hit === undefined ? { kind: 'bad' } : this.resolveSpace(hit, resources, depth + 1);
    }
    if (!(v instanceof this.lib.PDFArray) || v.size() === 0) return { kind: 'bad' };
    const head = this.nameStr(v.get(0));
    switch (head) {
      case 'DeviceGray':
      case 'CalGray':
      case 'G':
        return { kind: 'gray' };
      case 'DeviceRGB':
      case 'CalRGB':
      case 'RGB':
        return { kind: 'rgb' };
      case 'DeviceCMYK':
      case 'CMYK':
        return { kind: 'cmyk' };
      case 'ICCBased': {
        const n = this.num(this.dictOf(v.get(1))?.get(this.name('N')), 0);
        return n === 1 ? { kind: 'gray' } : n === 3 ? { kind: 'rgb' } : n === 4 ? { kind: 'cmyk' } : { kind: 'bad' };
      }
      case 'Pattern':
        return v.size() > 1 ? { kind: 'pattern', base: this.resolveSpace(v.get(1), resources, depth + 1) } : { kind: 'pattern' };
      case 'Indexed':
      case 'I': {
        const base = this.resolveSpace(v.get(1), resources, depth + 1);
        const hival = Math.max(0, Math.min(255, this.num(v.get(2), 0)));
        const table = this.lookup(v.get(3));
        let bytes: Uint8Array | undefined;
        if (table instanceof this.lib.PDFString || table instanceof this.lib.PDFHexString) bytes = table.asBytes();
        else if (table instanceof this.lib.PDFRawStream) {
          try {
            bytes = this.decode(table).data;
          } catch {
            bytes = undefined;
          }
        }
        if (!bytes || (base.kind !== 'gray' && base.kind !== 'rgb' && base.kind !== 'cmyk')) return { kind: 'bad' };
        const n = base.kind === 'gray' ? 1 : base.kind === 'rgb' ? 3 : 4;
        const gray = new Uint8Array(hival + 1);
        for (let i = 0; i <= hival; i++) {
          const p = i * n;
          const c = (k: number) => (bytes![p + k] ?? 0) / 255;
          gray[i] = Math.round(255 * (n === 1 ? c(0) : n === 3 ? rgbToGray(c(0), c(1), c(2)) : cmykToGray(c(0), c(1), c(2), c(3))));
        }
        return { kind: 'indexed', hival, gray };
      }
      default:
        return { kind: 'bad' };
    }
  }

  /* ---------------- images ---------------- */

  async convertImages(): Promise<void> {
    const { PDFRawStream, PDFName } = this.lib;
    const entries = [...this.ctx.enumerateIndirectObjects()];
    for (const [ref, obj] of entries) {
      if (!(obj instanceof PDFRawStream)) continue;
      if (this.nameStr(obj.dict.get(PDFName.of('Subtype'))) !== 'Image') continue;
      let result: 'gray' | 'converted' | 'unsupported';
      try {
        result = await this.convertImage(ref, obj);
      } catch {
        result = 'unsupported';
      }
      this.imageOk.set(ref.toString(), result !== 'unsupported');
      if (result === 'converted') this.imagesConverted++;
      else if (result === 'unsupported') this.imagesUnsupported++;
    }
  }

  private async convertImage(ref: PdfLib.PDFRef, img: PdfLib.PDFRawStream): Promise<'gray' | 'converted' | 'unsupported'> {
    const d = img.dict;
    const imageMask = this.lookup(d.get(this.name('ImageMask')));
    if (imageMask === this.lib.PDFBool.True) return 'gray';
    const csObj = d.get(this.name('ColorSpace'));
    const { names } = this.filters(d);
    const last = names[names.length - 1];
    if (csObj === undefined) return last === 'CCITTFaxDecode' || last === 'JBIG2Decode' ? 'gray' : 'unsupported';
    const cs = this.resolveSpace(csObj, undefined);
    if (cs.kind === 'gray') return 'gray';
    if (cs.kind !== 'rgb' && cs.kind !== 'cmyk' && cs.kind !== 'indexed') return 'unsupported';
    // A colour-key mask compares raw colour samples, which a gray image no longer has.
    if (this.lookup(d.get(this.name('Mask'))) instanceof this.lib.PDFArray) return 'unsupported';
    const w = this.num(d.get(this.name('Width')), 0);
    const h = this.num(d.get(this.name('Height')), 0);
    if (w < 1 || h < 1 || w * h > 120e6) return 'unsupported';
    const decodeArr = this.numbers(d.get(this.name('Decode')));
    const dec = this.decode(img);
    if (dec.rest === 'DCTDecode') {
      if (cs.kind === 'indexed') return 'unsupported';
      return this.convertJpeg(ref, img, dec.data, w, h, cs.kind === 'rgb' ? decodeArr : undefined);
    }
    if (dec.rest) return 'unsupported';
    const bpc = this.num(d.get(this.name('BitsPerComponent')), 8);
    if (![1, 2, 4, 8, 16].includes(bpc)) return 'unsupported';
    const gray = toGray8(dec.data, w, h, bpc, cs, decodeArr);
    this.writeGrayFlate(ref, img, gray, w, h);
    return 'converted';
  }

  private writeGrayFlate(ref: PdfLib.PDFRef, img: PdfLib.PDFRawStream, gray: Uint8Array, w: number, h: number): void {
    const dict = img.dict.clone(this.ctx);
    for (const k of ['DecodeParms', 'DP', 'Decode', 'D', 'Filter']) dict.delete(this.name(k));
    dict.set(this.name('ColorSpace'), this.name('DeviceGray'));
    dict.set(this.name('BitsPerComponent'), this.lib.PDFNumber.of(8));
    dict.set(this.name('Filter'), this.name('FlateDecode'));
    // Try the PNG "Up" predictor as well and keep the smaller result.
    let best = zlibSync(gray, { level: 9 });
    let predictor = false;
    if (gray.length <= 16e6) {
      const up = new Uint8Array((w + 1) * h);
      for (let y = 0; y < h; y++) {
        const o = y * (w + 1);
        up[o] = 2;
        for (let x = 0; x < w; x++) up[o + 1 + x] = (gray[y * w + x]! - (y > 0 ? gray[(y - 1) * w + x]! : 0)) & 255;
      }
      const z = zlibSync(up, { level: 9 });
      if (z.length < best.length) {
        best = z;
        predictor = true;
      }
    }
    if (predictor) dict.set(this.name('DecodeParms'), this.ctx.obj({ Predictor: 15, Colors: 1, BitsPerComponent: 8, Columns: w }));
    this.ctx.assign(ref, this.lib.PDFRawStream.of(dict, best));
  }

  private async convertJpeg(ref: PdfLib.PDFRef, img: PdfLib.PDFRawStream, jpeg: Uint8Array, w: number, h: number, decode?: number[]): Promise<'converted' | 'unsupported'> {
    // Browsers undo the Adobe CMYK inversion themselves, so the pixels come
    // out the way a viewer shows them. EXIF rotation is not a PDF thing.
    const blob = new Blob([jpeg as BlobPart], { type: 'image/jpeg' });
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(blob, { imageOrientation: 'none', colorSpaceConversion: 'none' });
    } catch {
      bitmap = await createImageBitmap(blob);
    }
    if (bitmap.width !== w || bitmap.height !== h) {
      bitmap.close();
      return 'unsupported';
    }
    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
    const c2d = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!c2d) {
      bitmap.close();
      return 'unsupported';
    }
    c2d.drawImage(bitmap, 0, 0);
    bitmap.close();
    const rgba = c2d.getImageData(0, 0, w, h).data;
    const gray = new Uint8Array(w * h);
    const dmin = decode && decode.length >= 6 ? [decode[0]!, decode[2]!, decode[4]!] : undefined;
    const dscale = decode && decode.length >= 6 ? [decode[1]! - decode[0]!, decode[3]! - decode[2]!, decode[5]! - decode[4]!] : undefined;
    for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
      let r = rgba[p]! / 255;
      let g = rgba[p + 1]! / 255;
      let b = rgba[p + 2]! / 255;
      if (dmin && dscale) {
        r = dmin[0]! + r * dscale[0]!;
        g = dmin[1]! + g * dscale[1]!;
        b = dmin[2]! + b * dscale[2]!;
      }
      gray[i] = Math.round(255 * rgbToGray(r, g, b));
    }
    const encoded = encodeGrayJpeg(gray, w, h, 90);
    const dict = img.dict.clone(this.ctx);
    for (const k of ['DecodeParms', 'DP', 'Decode', 'D']) dict.delete(this.name(k));
    dict.set(this.name('ColorSpace'), this.name('DeviceGray'));
    dict.set(this.name('BitsPerComponent'), this.lib.PDFNumber.of(8));
    // Flat artwork is often smaller as Flate than as JPEG.
    if (w * h <= 4e6) {
      const z = zlibSync(gray, { level: 9 });
      if (z.length < encoded.length) {
        dict.set(this.name('Filter'), this.name('FlateDecode'));
        this.ctx.assign(ref, this.lib.PDFRawStream.of(dict, z));
        return 'converted';
      }
    }
    dict.set(this.name('Filter'), this.name('DCTDecode'));
    this.ctx.assign(ref, this.lib.PDFRawStream.of(dict, encoded));
    return 'converted';
  }

  /* ---------------- content streams ---------------- */

  /** Rewrite one content stream. Returns false when something in it can't be converted. */
  private rewriteStream(ref: PdfLib.PDFRef, stream: PdfLib.PDFRawStream, resources: PdfLib.PDFDict | undefined): boolean {
    let data: Uint8Array;
    try {
      const dec = this.decode(stream);
      if (dec.rest) return false;
      data = dec.data;
    } catch {
      return false;
    }
    const flag = { ok: true };
    const out = rewriteContent(data, this.envFor(resources, flag), (d) => zlibSync(d, { level: 6 }));
    const dict = stream.dict.clone(this.ctx);
    dict.delete(this.name('DecodeParms'));
    dict.set(this.name('Filter'), this.name('FlateDecode'));
    this.ctx.assign(ref, this.lib.PDFRawStream.of(dict, zlibSync(out, { level: 9 })));
    return flag.ok;
  }

  private envFor(resources: PdfLib.PDFDict | undefined, flag: { ok: boolean }): ContentEnv {
    const sub = (kind: string): PdfLib.PDFDict | undefined => resources?.lookupMaybe(this.name(kind), this.lib.PDFDict);
    const fail = () => {
      flag.ok = false;
    };
    return {
      colorSpace: (n) => this.resolveSpace(this.name(n), resources),
      xobject: (n) => {
        const raw = sub('XObject')?.get(this.name(n));
        const key = this.refKey(raw);
        const obj = this.lookup(raw);
        if (!key || !(obj instanceof this.lib.PDFRawStream)) return;
        const subtype = this.nameStr(obj.dict.get(this.name('Subtype')));
        if (subtype === 'Image') {
          if (this.imageOk.get(key) === false) fail();
        } else if (subtype === 'Form' && !this.processForm(raw as PdfLib.PDFRef, resources)) fail();
      },
      shading: (n) => {
        if (!this.processShading(sub('Shading')?.get(this.name(n)), resources)) fail();
      },
      pattern: (n) => {
        if (!this.processPattern(sub('Pattern')?.get(this.name(n)), resources)) fail();
      },
      extGState: (n) => {
        const gs = this.dictOf(sub('ExtGState')?.get(this.name(n)));
        const sm = this.dictOf(gs?.get(this.name('SMask')));
        const g = sm?.get(this.name('G'));
        if (g instanceof this.lib.PDFRef && !this.processForm(g, resources)) fail();
      },
      font: (n) => {
        if (!this.processType3(sub('Font')?.get(this.name(n)), resources)) fail();
      },
      unconvertible: fail,
      inlineImage: (info) => {
        try {
          let raw = info.data;
          if (info.filters.length) raw = unzlibSync(raw);
          const comps = info.space === 'rgb' ? 3 : 4;
          if (raw.length < info.width * info.height * comps) return null;
          return toGray8(raw, info.width, info.height, 8, { kind: info.space }, undefined);
        } catch {
          return null;
        }
      },
    };
  }

  private processForm(ref: PdfLib.PDFRef, parent: PdfLib.PDFDict | undefined): boolean {
    const key = ref.toString();
    const known = this.formOk.get(key);
    if (known !== undefined) return known;
    this.formOk.set(key, true);
    const stream = this.lookup(ref);
    if (!(stream instanceof this.lib.PDFRawStream)) return true;
    const own = stream.dict.lookupMaybe(this.name('Resources'), this.lib.PDFDict);
    const ok = this.rewriteStream(ref, stream, own ?? parent);
    if (ok) this.groupToGray(stream.dict);
    this.formOk.set(key, ok);
    return ok;
  }

  private groupToGray(dict: PdfLib.PDFDict): void {
    const group = dict.lookupMaybe(this.name('Group'), this.lib.PDFDict);
    const cs = group?.get(this.name('CS'));
    if (!group || cs === undefined) return;
    const space = this.resolveSpace(cs, undefined);
    if (space.kind === 'rgb' || space.kind === 'cmyk') group.set(this.name('CS'), this.name('DeviceGray'));
  }

  private processPattern(raw: Obj | undefined, parent: PdfLib.PDFDict | undefined): boolean {
    const key = this.refKey(raw);
    if (key !== undefined && this.patternOk.has(key)) return this.patternOk.get(key)!;
    if (key !== undefined) this.patternOk.set(key, true);
    const obj = this.lookup(raw);
    let ok = true;
    if (obj instanceof this.lib.PDFRawStream && raw instanceof this.lib.PDFRef) {
      const own = obj.dict.lookupMaybe(this.name('Resources'), this.lib.PDFDict);
      ok = this.rewriteStream(raw, obj, own ?? parent);
    } else if (obj instanceof this.lib.PDFDict) {
      ok = this.processShading(obj.get(this.name('Shading')), parent);
    }
    if (key !== undefined) this.patternOk.set(key, ok);
    return ok;
  }

  private processType3(raw: Obj | undefined, parent: PdfLib.PDFDict | undefined): boolean {
    const key = this.refKey(raw);
    if (key !== undefined && this.fontOk.has(key)) return this.fontOk.get(key)!;
    const font = this.lookup(raw);
    if (!(font instanceof this.lib.PDFDict) || this.nameStr(font.get(this.name('Subtype'))) !== 'Type3') return true;
    if (key !== undefined) this.fontOk.set(key, true);
    const own = font.lookupMaybe(this.name('Resources'), this.lib.PDFDict) ?? parent;
    const procs = font.lookupMaybe(this.name('CharProcs'), this.lib.PDFDict);
    let ok = true;
    for (const [, v] of procs?.entries() ?? []) {
      const s = this.lookup(v);
      if (v instanceof this.lib.PDFRef && s instanceof this.lib.PDFRawStream && !this.rewriteStream(v, s, own)) ok = false;
    }
    if (key !== undefined) this.fontOk.set(key, ok);
    return ok;
  }

  /* ---------------- shadings and functions ---------------- */

  private processShading(raw: Obj | undefined, resources: PdfLib.PDFDict | undefined): boolean {
    const key = this.refKey(raw);
    if (key !== undefined && this.shadingOk.has(key)) return this.shadingOk.get(key)!;
    const dict = this.dictOf(raw);
    if (!dict) return true;
    const cs = this.resolveSpace(dict.get(this.name('ColorSpace')), resources);
    let ok: boolean;
    if (cs.kind === 'gray') ok = true;
    else if (cs.kind === 'rgb' || cs.kind === 'cmyk') {
      const n = cs.kind === 'rgb' ? 3 : 4;
      const fn = dict.get(this.name('Function'));
      ok = fn !== undefined && this.convertFunction(fn, n, false) && this.convertFunction(fn, n, true);
      if (ok) {
        dict.set(this.name('ColorSpace'), this.name('DeviceGray'));
        const bg = this.numbers(dict.get(this.name('Background')));
        if (bg && bg.length === n) dict.set(this.name('Background'), this.numArray([this.grayOf(bg, n)]));
      }
    } else ok = false;
    if (key !== undefined) this.shadingOk.set(key, ok);
    return ok;
  }

  private grayOf(v: number[], n: number): number {
    return n === 3 ? rgbToGray(v[0]!, v[1]!, v[2]!) : cmykToGray(v[0]!, v[1]!, v[2]!, v[3]!);
  }

  /**
   * Make a function produce one gray value instead of `n` colour components.
   * With `apply` false it only checks that every part is something we can do.
   */
  private convertFunction(raw: Obj, n: number, apply: boolean): boolean {
    const key = this.refKey(raw);
    if (key !== undefined && this.fnDone.has(key)) return true;
    const fn = this.lookup(raw);
    const dict = this.dictOf(fn);
    if (!dict) return false;
    const type = this.num(dict.get(this.name('FunctionType')), -1);
    const range = this.numbers(dict.get(this.name('Range')));
    if (type === 2) {
      const c0 = this.numbers(dict.get(this.name('C0'))) ?? (n === 4 ? [0, 0, 0, 0] : [0, 0, 0]);
      const c1 = this.numbers(dict.get(this.name('C1'))) ?? (n === 4 ? [1, 1, 1, 1] : [1, 1, 1]);
      if (c0.length !== n || c1.length !== n) return false;
      if (apply) {
        dict.set(this.name('C0'), this.numArray([this.grayOf(c0, n)]));
        dict.set(this.name('C1'), this.numArray([this.grayOf(c1, n)]));
        if (range) dict.set(this.name('Range'), this.numArray([0, 1]));
      }
    } else if (type === 3) {
      const subs = this.lookup(dict.get(this.name('Functions')));
      if (!(subs instanceof this.lib.PDFArray)) return false;
      for (let i = 0; i < subs.size(); i++) if (!this.convertFunction(subs.get(i), n, apply)) return false;
      if (apply && range) dict.set(this.name('Range'), this.numArray([0, 1]));
    } else if (type === 0) {
      if (!(fn instanceof this.lib.PDFRawStream) || !(raw instanceof this.lib.PDFRef)) return false;
      const size = this.numbers(dict.get(this.name('Size')));
      const bps = this.num(dict.get(this.name('BitsPerSample')), 0);
      const decode = this.numbers(dict.get(this.name('Decode'))) ?? range;
      if (!size || !range || range.length !== n * 2 || !decode || decode.length !== n * 2 || bps !== 8) return false;
      const total = size.reduce((a, b) => a * b, 1);
      if (!Number.isFinite(total) || total < 1 || total > 4e6) return false;
      let samples: Uint8Array;
      try {
        const dec = this.decode(fn);
        if (dec.rest || dec.data.length < total * n) return false;
        samples = dec.data;
      } catch {
        return false;
      }
      if (apply) {
        const gray = new Uint8Array(total);
        const px: number[] = new Array(n);
        for (let i = 0; i < total; i++) {
          for (let c = 0; c < n; c++) {
            const lo = decode[c * 2]!;
            const hi = decode[c * 2 + 1]!;
            px[c] = Math.max(0, Math.min(1, lo + (samples[i * n + c]! / 255) * (hi - lo)));
          }
          gray[i] = Math.round(255 * this.grayOf(px, n));
        }
        const nd = fn.dict.clone(this.ctx);
        nd.set(this.name('Range'), this.numArray([0, 1]));
        nd.delete(this.name('Decode'));
        nd.delete(this.name('DecodeParms'));
        nd.set(this.name('Filter'), this.name('FlateDecode'));
        this.ctx.assign(raw, this.lib.PDFRawStream.of(nd, zlibSync(gray, { level: 9 })));
      }
    } else return false;
    if (apply && key !== undefined) this.fnDone.set(key, true);
    return true;
  }

  /* ---------------- pages and annotations ---------------- */

  /** Convert one page's colours. Returns false when the page still needs the overlay. */
  convertPage(page: PdfLib.PDFPage): boolean {
    const { PDFArray, PDFRawStream } = this.lib;
    const node = page.node;
    const resources = node.Resources();
    let ok = true;
    const rawContents = node.get(this.name('Contents'));
    const contents = node.lookup(this.name('Contents'));
    const parts: PdfLib.PDFRawStream[] = [];
    if (contents instanceof PDFRawStream) parts.push(contents);
    else if (contents instanceof PDFArray) {
      for (let i = 0; i < contents.size(); i++) {
        const s = contents.lookup(i);
        if (s instanceof PDFRawStream) parts.push(s);
        else ok = false;
      }
    } else if (contents !== undefined) ok = false;
    if (ok && parts.length) {
      const chunks: Uint8Array[] = [];
      try {
        for (const p of parts) {
          const dec = this.decode(p);
          if (dec.rest) throw new NamedError('GrayscalePdfFailed', 'image filter in content');
          chunks.push(dec.data, new Uint8Array([10]));
        }
      } catch {
        ok = false;
      }
      if (ok) {
        let n = 0;
        for (const c of chunks) n += c.length;
        const joined = new Uint8Array(n);
        let at = 0;
        for (const c of chunks) {
          joined.set(c, at);
          at += c.length;
        }
        const flag = { ok: true };
        const out = rewriteContent(joined, this.envFor(resources, flag), (d) => zlibSync(d, { level: 6 }));
        if (!flag.ok) ok = false;
        const dict = this.ctx.obj({ Filter: this.name('FlateDecode') });
        node.set(this.name('Contents'), this.ctx.register(this.lib.PDFRawStream.of(dict, zlibSync(out, { level: 9 }))));
        if (rawContents instanceof this.lib.PDFRef) this.orphans.push(rawContents);
        else if (rawContents instanceof PDFArray) for (let i = 0; i < rawContents.size(); i++) this.orphans.push(rawContents.get(i) as PdfLib.PDFRef);
      }
    }
    if (!this.convertAnnotations(node, resources)) ok = false;
    if (ok) {
      this.groupToGray(node);
      const thumb = node.get(this.name('Thumb'));
      if (thumb instanceof this.lib.PDFRef) this.orphans.push(thumb);
      node.delete(this.name('Thumb'));
    }
    return ok;
  }

  private convertAnnotations(node: PdfLib.PDFPageLeaf, resources: PdfLib.PDFDict | undefined): boolean {
    const annots = node.lookupMaybe(this.name('Annots'), this.lib.PDFArray);
    if (!annots) return true;
    let ok = true;
    for (let i = 0; i < annots.size(); i++) {
      const annot = this.dictOf(annots.get(i));
      if (!annot) continue;
      const ap = this.dictOf(annot.get(this.name('AP')));
      for (const entry of ['N', 'D', 'R']) {
        const v = ap?.get(this.name(entry));
        if (v === undefined) continue;
        const obj = this.lookup(v);
        const forms: Obj[] = [];
        if (obj instanceof this.lib.PDFRawStream) forms.push(v);
        else if (obj instanceof this.lib.PDFDict) for (const [, state] of obj.entries()) forms.push(state);
        for (const f of forms) if (f instanceof this.lib.PDFRef && !this.processForm(f, resources)) ok = false;
      }
      this.convertAnnotationColours(annot);
    }
    return ok;
  }

  /** Colour entries a viewer uses when it draws an annotation or field itself. */
  private convertAnnotationColours(annot: PdfLib.PDFDict): void {
    const arrays: [PdfLib.PDFDict, string][] = [
      [annot, 'C'],
      [annot, 'IC'],
    ];
    const mk = this.dictOf(annot.get(this.name('MK')));
    if (mk) arrays.push([mk, 'BC'], [mk, 'BG']);
    for (const [d, k] of arrays) {
      const v = this.numbers(d.get(this.name(k)));
      if (v && (v.length === 3 || v.length === 4)) d.set(this.name(k), this.numArray([this.grayOf(v, v.length)]));
    }
    this.defaultAppearance(annot);
  }

  private defaultAppearance(d: PdfLib.PDFDict): void {
    const da = this.lookup(d.get(this.name('DA')));
    if (!(da instanceof this.lib.PDFString) && !(da instanceof this.lib.PDFHexString)) return;
    const flag = { ok: true };
    const out = rewriteContent(da.asBytes(), this.envFor(undefined, flag), (x) => x);
    d.set(this.name('DA'), this.lib.PDFString.of(new TextDecoder('latin1').decode(out)));
  }

  /** Drop the replaced streams. Call after every page is done. */
  dropReplaced(): void {
    for (const ref of this.orphans) if (ref instanceof this.lib.PDFRef) this.ctx.delete(ref);
    this.orphans = [];
  }

  /** The form-wide default appearance string, used for fields without their own. */
  convertFormDefaults(): void {
    const form = this.doc.catalog.lookupMaybe(this.name('AcroForm'), this.lib.PDFDict);
    if (form) this.defaultAppearance(form);
  }
}

/** Unpack an image's samples and write one 8-bit gray value per pixel. */
export function toGray8(data: Uint8Array, w: number, h: number, bpc: number, cs: ColorSpace, decode?: number[]): Uint8Array {
  const ncomp = cs.kind === 'rgb' ? 3 : cs.kind === 'cmyk' ? 4 : 1;
  const out = new Uint8Array(w * h);
  const rowBytes = Math.ceil((w * ncomp * bpc) / 8);
  const max = (1 << bpc) - 1;
  const identity = !decode || decode.every((v, i) => v === (i % 2 === 0 ? 0 : cs.kind === 'indexed' ? max : 1));
  // Fast path: 8-bit RGB and CMYK without a Decode array.
  if (bpc === 8 && identity && (cs.kind === 'rgb' || cs.kind === 'cmyk')) {
    if (cs.kind === 'rgb') {
      for (let i = 0, p = 0; i < out.length; i++, p += 3) out[i] = Math.round(0.299 * (data[p] ?? 0) + 0.587 * (data[p + 1] ?? 0) + 0.114 * (data[p + 2] ?? 0));
    } else {
      for (let i = 0, p = 0; i < out.length; i++, p += 4) {
        const k = (data[p + 3] ?? 0) / 255;
        out[i] = Math.round(255 * (1 - Math.min(1, 0.3 * ((data[p] ?? 0) / 255) + 0.59 * ((data[p + 1] ?? 0) / 255) + 0.11 * ((data[p + 2] ?? 0) / 255) + k)));
      }
    }
    return out;
  }
  const sample = (row: number, idx: number): number => {
    if (bpc === 8) return data[row + idx] ?? 0;
    if (bpc === 16) return ((data[row + idx * 2] ?? 0) << 8) | (data[row + idx * 2 + 1] ?? 0);
    const bit = idx * bpc;
    return ((data[row + (bit >> 3)] ?? 0) >> (8 - bpc - (bit & 7))) & max;
  };
  const dec = (v: number, c: number): number => {
    if (!decode) return cs.kind === 'indexed' ? v : v / max;
    const lo = decode[c * 2] ?? 0;
    const hi = decode[c * 2 + 1] ?? 1;
    return lo + (v / max) * (hi - lo);
  };
  const px = [0, 0, 0, 0];
  for (let y = 0; y < h; y++) {
    const row = y * rowBytes;
    for (let x = 0; x < w; x++) {
      let g: number;
      if (cs.kind === 'indexed') {
        const i = Math.max(0, Math.min(cs.hival, Math.round(dec(sample(row, x), 0))));
        out[y * w + x] = cs.gray[i] ?? 0;
        continue;
      }
      for (let c = 0; c < ncomp; c++) px[c] = Math.max(0, Math.min(1, dec(sample(row, x * ncomp + c), c)));
      if (cs.kind === 'rgb') g = rgbToGray(px[0]!, px[1]!, px[2]!);
      else if (cs.kind === 'cmyk') g = cmykToGray(px[0]!, px[1]!, px[2]!, px[3]!);
      else g = px[0]!;
      out[y * w + x] = Math.round(255 * g);
    }
  }
  return out;
}
