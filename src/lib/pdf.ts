/**
 * PDF helpers. pdf-lib edits document structure; pdf.js renders pages.
 * Both are loaded on demand so tool pages stay light until a file is dropped.
 */
import type * as PdfLib from 'pdf-lib';
import type * as PdfJs from 'pdfjs-dist';
import type { TextContent } from 'pdfjs-dist/types/src/display/api';
import { canvasToBlob } from './image';
import { unlockPdf } from './unlock';

let pdfLibPromise: Promise<typeof PdfLib> | undefined;
export function loadPdfLib(): Promise<typeof PdfLib> {
  pdfLibPromise ??= import('pdf-lib');
  return pdfLibPromise;
}

type PdfJsBundle = { lib: typeof PdfJs; PdfWorker: new () => Worker };
let pdfJsPromise: Promise<PdfJsBundle> | undefined;
export function loadPdfJs(): Promise<PdfJsBundle> {
  pdfJsPromise ??= (async () => {
    const [lib, { default: PdfWorker }] = await Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker'),
    ]);
    return { lib, PdfWorker };
  })();
  return pdfJsPromise;
}

const workers = new WeakMap<PdfJs.PDFDocumentProxy, { worker: PdfJs.PDFWorker; port: Worker }>();

/**
 * Open a PDF with pdf.js on its own dedicated web worker. Call `closePdfJs`
 * when done so the worker is terminated and memory is released.
 */
export async function openWithPdfJs(source: Uint8Array): Promise<PdfJs.PDFDocumentProxy> {
  assertPdfHeader(source);
  const { bytes } = await unlockPdf(source);
  const { lib, PdfWorker } = await loadPdfJs();
  const port = new PdfWorker();
  const worker = lib.PDFWorker.create({ port });
  try {
    // pdf.js transfers the buffer to its worker, so hand it a copy.
    const doc = await lib.getDocument({ data: bytes.slice(), worker }).promise;
    workers.set(doc, { worker, port });
    return doc;
  } catch (e) {
    worker.destroy();
    port.terminate();
    throw new Error(`This file could not be opened as a PDF${e instanceof Error && e.message ? ` (${e.message})` : ''}.`);
  }
}

export async function closePdfJs(doc: PdfJs.PDFDocumentProxy): Promise<void> {
  const owned = workers.get(doc);
  workers.delete(doc);
  try {
    await doc.loadingTask.destroy();
  } finally {
    owned?.worker.destroy();
    owned?.port.terminate();
  }
}

export interface RenderedPage {
  canvas: HTMLCanvasElement;
  /** Page size in PDF points (1/72 inch). */
  widthPt: number;
  heightPt: number;
}

export async function renderPage(doc: PdfJs.PDFDocumentProxy, pageNumber: number, scale: number): Promise<RenderedPage> {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available in this browser.');
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  page.cleanup();
  return { canvas, widthPt: base.width, heightPt: base.height };
}

/**
 * `page.getTextContent()` without async iteration. pdf.js 6 collects the text
 * stream with `for await (... of readableStream)`, which Safari before 26
 * lacks (it throws "undefined is not a function"). Reading the stream with a
 * reader works everywhere and returns the same shape.
 */
export async function getTextContent(page: PdfJs.PDFPageProxy): Promise<TextContent> {
  const reader = page.streamTextContent().getReader();
  const out: TextContent = { items: [], styles: Object.create(null), lang: null };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out.lang ??= value.lang;
    Object.assign(out.styles, value.styles);
    for (const item of value.items) out.items.push(item);
  }
  return out;
}

/** Render a page to a small thumbnail data URL. */
export async function pageThumbnail(doc: PdfJs.PDFDocumentProxy, pageNumber: number, maxPx = 160): Promise<string> {
  const page = await doc.getPage(pageNumber);
  const vp = page.getViewport({ scale: 1 });
  const scale = maxPx / Math.max(vp.width, vp.height);
  const { canvas } = await renderPage(doc, pageNumber, scale);
  return canvas.toDataURL('image/png');
}

export async function loadDocument(source: Uint8Array): Promise<PdfLib.PDFDocument> {
  assertPdfHeader(source);
  // Encrypted files are decrypted in the tab first (see unlock.ts); pdf-lib
  // cannot read encrypted streams and would otherwise write broken output.
  const { bytes } = await unlockPdf(source);
  const { PDFDocument } = await loadPdfLib();
  let doc: PdfLib.PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  } catch (e) {
    throw new Error(`This file could not be read as a PDF. It may be damaged${e instanceof Error && e.message ? ` (${e.message.split('\n')[0]})` : ''}.`);
  }
  if (doc.isEncrypted) throw new Error('This PDF uses an encryption method that could not be removed in the browser.');
  return doc;
}

function assertPdfHeader(bytes: Uint8Array): void {
  if (bytes.length === 0) throw new Error('This file is empty.');
  if (!isPdfHeader(bytes)) throw new Error('This file is not a PDF. It does not start with a PDF header.');
}

/** True when the first 1 KB contains "%PDF-" (some producers prepend junk). */
export function isPdfHeader(bytes: Uint8Array): boolean {
  const head = bytes.subarray(0, 1024);
  for (let i = 0; i + 5 <= head.length; i++) {
    if (head[i] === 0x25 && head[i + 1] === 0x50 && head[i + 2] === 0x44 && head[i + 3] === 0x46 && head[i + 4] === 0x2d) return true;
  }
  return false;
}

/**
 * The area a viewer shows: the CropBox clipped to the MediaBox (what pdf.js
 * renders), with its origin, which is not always 0,0. Placement maths must
 * use this box, not `page.getSize()`, or content lands off the visible page
 * on files whose boxes are offset or cropped.
 */
export function visibleBox(page: PdfLib.PDFPage): { x: number; y: number; width: number; height: number } {
  const m = page.getMediaBox();
  const c = page.getCropBox();
  const x0 = Math.max(m.x, c.x);
  const y0 = Math.max(m.y, c.y);
  const x1 = Math.min(m.x + m.width, c.x + c.width);
  const y1 = Math.min(m.y + m.height, c.y + c.height);
  if (x1 - x0 <= 0 || y1 - y0 <= 0) return { x: m.x, y: m.y, width: m.width, height: m.height };
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export async function mergePdfs(sources: Uint8Array[], onProgress?: (done: number) => void): Promise<Uint8Array> {
  const { PDFDocument } = await loadPdfLib();
  const out = await PDFDocument.create();
  for (let i = 0; i < sources.length; i++) {
    const src = await loadDocument(sources[i]!);
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const p of pages) out.addPage(p);
    onProgress?.(i + 1);
  }
  return out.save({ useObjectStreams: true });
}

export async function extractPages(source: Uint8Array, indexes: number[]): Promise<Uint8Array> {
  const { PDFDocument } = await loadPdfLib();
  const src = await loadDocument(source);
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, indexes);
  for (const p of pages) out.addPage(p);
  return out.save({ useObjectStreams: true });
}

/** Apply absolute rotations (degrees, multiples of 90) per page index. */
export async function rotatePages(source: Uint8Array, rotations: number[]): Promise<Uint8Array> {
  const { degrees } = await loadPdfLib();
  const doc = await loadDocument(source);
  doc.getPages().forEach((page, i) => {
    const r = rotations[i];
    if (r !== undefined) page.setRotation(degrees(((r % 360) + 360) % 360));
  });
  return doc.save({ useObjectStreams: true });
}

export type PageSize = 'fit' | 'a4' | 'letter';
export interface ImagesToPdfOptions {
  pageSize: PageSize;
  orientation: 'auto' | 'portrait' | 'landscape';
  /** Margin in points. */
  margin: number;
}

const PAGE_SIZES: Record<Exclude<PageSize, 'fit'>, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

export interface EmbeddableImage {
  kind: 'jpg' | 'png';
  bytes: Uint8Array;
}

export async function imagesToPdf(images: EmbeddableImage[], opts: ImagesToPdfOptions, onProgress?: (done: number) => void): Promise<Uint8Array> {
  const { PDFDocument } = await loadPdfLib();
  const doc = await PDFDocument.create();
  for (let i = 0; i < images.length; i++) {
    const img = images[i]!;
    const embedded = img.kind === 'jpg' ? await doc.embedJpg(img.bytes) : await doc.embedPng(img.bytes);
    const { width: iw, height: ih } = embedded;
    if (opts.pageSize === 'fit') {
      const page = doc.addPage([iw + opts.margin * 2, ih + opts.margin * 2]);
      page.drawImage(embedded, { x: opts.margin, y: opts.margin, width: iw, height: ih });
    } else {
      let [pw, ph] = PAGE_SIZES[opts.pageSize];
      const landscape = opts.orientation === 'landscape' || (opts.orientation === 'auto' && iw > ih);
      if (landscape) [pw, ph] = [ph, pw];
      const page = doc.addPage([pw, ph]);
      const availW = pw - opts.margin * 2;
      const availH = ph - opts.margin * 2;
      const scale = Math.min(availW / iw, availH / ih);
      const w = iw * scale;
      const h = ih * scale;
      page.drawImage(embedded, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
    }
    onProgress?.(i + 1);
  }
  return doc.save({ useObjectStreams: true });
}

/* ------------------------------------------------------------------ */
/* Compression                                                         */
/* ------------------------------------------------------------------ */

export type CompressMode = 'lossless' | 'images' | 'flatten';

export interface CompressOptions {
  mode: CompressMode;
  /** JPEG quality 0..1 for image recompression and flattening. */
  quality: number;
  /** Longest side cap in pixels for embedded images (0 = no cap). */
  maxImagePx: number;
  /** DPI used when flattening pages. */
  flattenDpi: number;
  /** Convert color to grayscale when flattening. */
  grayscale?: boolean;
}

export interface CompressStats {
  imagesSeen: number;
  imagesRecompressed: number;
  imagesSkipped: number;
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new Error('unsupported');
  const ds = new DecompressionStream('deflate');
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

interface ImageSource {
  kind: 'jpeg' | 'raw';
  bytes: Uint8Array;
  width: number;
  height: number;
  channels: 1 | 3;
}

/**
 * Recompress images embedded in the PDF. Only DCT (JPEG) images and simple
 * 8-bit Flate RGB/Gray images are touched. Anything with masks, unusual color
 * spaces or predictors is left untouched so the document stays correct.
 */
export async function compressPdf(source: Uint8Array, opts: CompressOptions, onProgress?: (msg: string) => void): Promise<{ bytes: Uint8Array; stats: CompressStats }> {
  const stats: CompressStats = { imagesSeen: 0, imagesRecompressed: 0, imagesSkipped: 0 };
  if (opts.mode === 'flatten') {
    return { bytes: await flattenPdf(source, opts, onProgress), stats };
  }
  const lib = await loadPdfLib();
  const { PDFName, PDFRawStream, PDFNumber, PDFArray, PDFDict, PDFStream } = lib;
  const doc = await loadDocument(source);

  if (opts.mode === 'images') {
    const ctx = doc.context;
    // Collect soft-mask targets so we never recompress an alpha channel.
    const maskRefs = new Set<string>();
    for (const [, obj] of ctx.enumerateIndirectObjects()) {
      if (obj instanceof PDFStream) {
        const sm = obj.dict.get(PDFName.of('SMask'));
        if (sm instanceof lib.PDFRef) maskRefs.add(sm.toString());
      }
    }
    const entries = ctx.enumerateIndirectObjects();
    for (const [ref, obj] of entries) {
      if (!(obj instanceof PDFRawStream)) continue;
      const dict = obj.dict;
      if (dict.get(PDFName.of('Subtype')) !== PDFName.of('Image')) continue;
      stats.imagesSeen++;
      onProgress?.(`Recompressing image ${stats.imagesSeen}`);
      if (maskRefs.has(ref.toString())) {
        stats.imagesSkipped++;
        continue;
      }
      const src = describeImage(lib, doc, obj);
      if (!src) {
        stats.imagesSkipped++;
        continue;
      }
      try {
        const bitmap = await decodePdfImage(src);
        let w = bitmap.width;
        let h = bitmap.height;
        if (opts.maxImagePx > 0) {
          const ratio = Math.min(1, opts.maxImagePx / Math.max(w, h));
          w = Math.max(1, Math.round(w * ratio));
          h = Math.max(1, Math.round(h * ratio));
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const c2d = canvas.getContext('2d')!;
        c2d.imageSmoothingQuality = 'high';
        c2d.fillStyle = '#fff';
        c2d.fillRect(0, 0, w, h);
        c2d.drawImage(bitmap, 0, 0, w, h);
        bitmap.close?.();
        const jpeg = new Uint8Array(await (await canvasToBlob(canvas, 'image/jpeg', opts.quality)).arrayBuffer());
        if (jpeg.length >= obj.contents.length * 0.95 && w === src.width && h === src.height) {
          stats.imagesSkipped++;
          continue;
        }
        const newDict = dict.clone(ctx) as PdfLib.PDFDict;
        newDict.set(PDFName.of('Filter'), PDFName.of('DCTDecode'));
        newDict.delete(PDFName.of('DecodeParms'));
        newDict.delete(PDFName.of('Decode'));
        newDict.set(PDFName.of('Width'), PDFNumber.of(w));
        newDict.set(PDFName.of('Height'), PDFNumber.of(h));
        newDict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8));
        newDict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB'));
        ctx.assign(ref, PDFRawStream.of(newDict, jpeg));
        stats.imagesRecompressed++;
      } catch {
        stats.imagesSkipped++;
      }
    }
    void PDFArray;
    void PDFDict;
  }
  onProgress?.('Writing PDF');
  const bytes = await doc.save({ useObjectStreams: true });
  return { bytes, stats };
}

function describeImage(lib: typeof PdfLib, doc: PdfLib.PDFDocument, stream: PdfLib.PDFRawStream): ImageSource | undefined {
  const { PDFName, PDFNumber, PDFArray, PDFStream, PDFBool } = lib;
  const ctx = doc.context;
  const dict = stream.dict;
  const lookup = (key: string) => {
    const v = dict.get(PDFName.of(key));
    return v === undefined ? undefined : ctx.lookup(v);
  };
  if (lookup('ImageMask') === PDFBool.True) return undefined;
  if (dict.has(PDFName.of('Mask')) || dict.has(PDFName.of('Decode'))) return undefined;
  const width = lookup('Width');
  const height = lookup('Height');
  if (!(width instanceof PDFNumber) || !(height instanceof PDFNumber)) return undefined;
  const w = width.asNumber();
  const h = height.asNumber();
  if (w < 64 || h < 64) return undefined; // Tiny images: not worth the risk.

  let filter = lookup('Filter');
  if (filter instanceof PDFArray) {
    if (filter.size() !== 1) return undefined;
    filter = ctx.lookup(filter.get(0));
  }
  const filterName = filter instanceof PDFName ? filter.decodeText() : undefined;

  // Resolve colour space to a channel count.
  let cs = lookup('ColorSpace');
  let channels: 1 | 3 | 4 | undefined;
  if (cs instanceof PDFName) {
    const n = cs.decodeText();
    channels = n === 'DeviceRGB' || n === 'CalRGB' ? 3 : n === 'DeviceGray' || n === 'CalGray' ? 1 : n === 'DeviceCMYK' ? 4 : undefined;
  } else if (cs instanceof PDFArray && cs.size() >= 2) {
    const family = ctx.lookup(cs.get(0));
    if (family instanceof PDFName && family.decodeText() === 'ICCBased') {
      const icc = ctx.lookup(cs.get(1));
      if (icc instanceof PDFStream) {
        const n = ctx.lookup(icc.dict.get(PDFName.of('N')));
        if (n instanceof PDFNumber) channels = n.asNumber() === 3 ? 3 : n.asNumber() === 1 ? 1 : n.asNumber() === 4 ? 4 : undefined;
      }
    }
  }

  if (filterName === 'DCTDecode') {
    if (channels === 4) return undefined; // CMYK JPEGs decode inconsistently across browsers.
    return { kind: 'jpeg', bytes: stream.contents, width: w, height: h, channels: channels === 1 ? 1 : 3 };
  }
  if (filterName === 'FlateDecode') {
    const bpc = lookup('BitsPerComponent');
    if (!(bpc instanceof PDFNumber) || bpc.asNumber() !== 8) return undefined;
    if (dict.has(PDFName.of('DecodeParms'))) return undefined; // Predictors: leave alone.
    if (channels !== 1 && channels !== 3) return undefined;
    return { kind: 'raw', bytes: stream.contents, width: w, height: h, channels };
  }
  return undefined;
}

async function decodePdfImage(src: ImageSource): Promise<ImageBitmap> {
  if (src.kind === 'jpeg') {
    return createImageBitmap(new Blob([src.bytes as BlobPart], { type: 'image/jpeg' }));
  }
  const raw = await inflate(src.bytes);
  const expected = src.width * src.height * src.channels;
  if (raw.length < expected) throw new Error('short image data');
  const rgba = new Uint8ClampedArray(src.width * src.height * 4);
  if (src.channels === 3) {
    for (let i = 0, o = 0; o < rgba.length; i += 3, o += 4) {
      rgba[o] = raw[i]!;
      rgba[o + 1] = raw[i + 1]!;
      rgba[o + 2] = raw[i + 2]!;
      rgba[o + 3] = 255;
    }
  } else {
    for (let i = 0, o = 0; o < rgba.length; i++, o += 4) {
      rgba[o] = rgba[o + 1] = rgba[o + 2] = raw[i]!;
      rgba[o + 3] = 255;
    }
  }
  return createImageBitmap(new ImageData(rgba, src.width, src.height));
}

async function flattenPdf(source: Uint8Array, opts: CompressOptions, onProgress?: (msg: string) => void): Promise<Uint8Array> {
  const { PDFDocument } = await loadPdfLib();
  const pdf = await openWithPdfJs(source);
  const out = await PDFDocument.create();
  const scale = opts.flattenDpi / 72;
  for (let p = 1; p <= pdf.numPages; p++) {
    onProgress?.(`Rendering page ${p} of ${pdf.numPages}`);
    const { canvas, widthPt, heightPt } = await renderPage(pdf, p, scale);
    if (opts.grayscale) {
      const ctx = canvas.getContext('2d')!;
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const y = (d[i]! * 299 + d[i + 1]! * 587 + d[i + 2]! * 114) / 1000;
        d[i] = d[i + 1] = d[i + 2] = y;
      }
      ctx.putImageData(img, 0, 0);
    }
    const jpeg = new Uint8Array(await (await canvasToBlob(canvas, 'image/jpeg', opts.quality)).arrayBuffer());
    const img = await out.embedJpg(jpeg);
    const page = out.addPage([widthPt, heightPt]);
    page.drawImage(img, { x: 0, y: 0, width: widthPt, height: heightPt });
    canvas.width = canvas.height = 0;
  }
  await closePdfJs(pdf);
  return out.save({ useObjectStreams: true });
}

export async function pageCount(bytes: Uint8Array): Promise<number> {
  const doc = await loadDocument(bytes);
  return doc.getPageCount();
}

/* ------------------------------------------------------------------ */
/* Reorder, delete, number and sign                                    */
/* ------------------------------------------------------------------ */

/**
 * Write a new document whose pages are `order` (zero-based indexes into the
 * source) in that sequence. Pages missing from `order` are dropped.
 */
export async function reorderPages(source: Uint8Array, order: number[]): Promise<Uint8Array> {
  const { PDFDocument } = await loadPdfLib();
  const src = await loadDocument(source);
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, order);
  for (const p of pages) out.addPage(p);
  return out.save({ useObjectStreams: true });
}

export type NumberPosition = 'bottom-center' | 'bottom-left' | 'bottom-right' | 'top-center' | 'top-left' | 'top-right';
export type NumberFont = 'helvetica' | 'times' | 'courier';

export interface PageNumberOptions {
  position: NumberPosition;
  /** Template with {n} for the page number and {total} for the count, e.g. "Page {n} of {total}". */
  template: string;
  /** Number printed on the first numbered page. */
  start: number;
  /** Zero-based index of the first page that gets a number (pages before it are skipped). */
  firstPage: number;
  fontSize: number;
  /** Distance from the page edge in points. */
  margin: number;
  font: NumberFont;
  /** Hex colour like #333333. */
  color: string;
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0.2, 0.2, 0.2];
  const n = parseInt(m[1]!, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * Place a point given in the page's *displayed* frame (as the reader sees it,
 * rotation applied) into PDF user space, and return the rotation needed for
 * drawn text or images to appear upright. `x`/`y` are fractions 0..1 of the
 * displayed width/height measured from the bottom-left of the displayed page.
 */
export function displayedToUserSpace(page: PdfLib.PDFPage, fx: number, fy: number): { x: number; y: number; rotate: number; w: number; h: number } {
  const box = visibleBox(page);
  const { width, height } = box;
  const rot = ((page.getRotation().angle % 360) + 360) % 360;
  // Displayed size swaps for 90/270.
  const [dw, dh] = rot === 90 || rot === 270 ? [height, width] : [width, height];
  const dx = fx * dw;
  const dy = fy * dh;
  switch (rot) {
    case 90:
      // Displayed right is user-space up; displayed up is user-space left.
      return { x: box.x + width - dy, y: box.y + dx, rotate: 90, w: dw, h: dh };
    case 180:
      return { x: box.x + width - dx, y: box.y + height - dy, rotate: 180, w: dw, h: dh };
    case 270:
      return { x: box.x + dy, y: box.y + height - dx, rotate: -90, w: dw, h: dh };
    default:
      return { x: box.x + dx, y: box.y + dy, rotate: 0, w: dw, h: dh };
  }
}

/** Displayed page size in points (rotation applied), as a viewer shows it. */
export function displayedSize(page: PdfLib.PDFPage): { w: number; h: number } {
  const { width, height } = visibleBox(page);
  const rot = ((page.getRotation().angle % 360) + 360) % 360;
  return rot === 90 || rot === 270 ? { w: height, h: width } : { w: width, h: height };
}

export async function addPageNumbers(source: Uint8Array, opts: PageNumberOptions, onProgress?: (done: number, total: number) => void): Promise<{ bytes: Uint8Array; numbered: number }> {
  const lib = await loadPdfLib();
  const { StandardFonts, rgb, degrees } = lib;
  const doc = await loadDocument(source);
  const fontName = opts.font === 'times' ? StandardFonts.TimesRoman : opts.font === 'courier' ? StandardFonts.Courier : StandardFonts.Helvetica;
  const font = await doc.embedFont(fontName);
  const pages = doc.getPages();
  const numberedPages = pages.slice(Math.max(0, opts.firstPage));
  const total = numberedPages.length;
  const [r, g, b] = hexToRgb(opts.color);
  const color = rgb(r, g, b);
  const size = Math.max(4, opts.fontSize);
  numberedPages.forEach((page, i) => {
    const n = opts.start + i;
    const text = opts.template.replace(/\{n\}/g, String(n)).replace(/\{total\}/g, String(opts.start + total - 1)).replace(/\{count\}/g, String(total));
    const textWidth = font.widthOfTextAtSize(text, size);
    const { w: dw, h: dh } = displayedSize(page);
    // Position of the text's baseline-left corner in the displayed frame.
    const vertical = opts.position.startsWith('top') ? dh - opts.margin - size * 0.75 : opts.margin;
    const horizontal = opts.position.endsWith('left') ? opts.margin : opts.position.endsWith('right') ? dw - opts.margin - textWidth : (dw - textWidth) / 2;
    const p = displayedToUserSpace(page, horizontal / dw, vertical / dh);
    page.drawText(text, { x: p.x, y: p.y, size, font, color, rotate: degrees(p.rotate) });
    onProgress?.(i + 1, total);
  });
  return { bytes: await doc.save({ useObjectStreams: true }), numbered: total };
}

export interface Stamp {
  /** Zero-based page index. */
  page: number;
  /** PNG bytes of the stamp (signature, initials, date text). */
  png: Uint8Array;
  /** Position and size as fractions 0..1 of the displayed page, origin top-left. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Draw PNG stamps onto pages. Coordinates come from the on-screen preview. */
export async function stampPdf(source: Uint8Array, stamps: Stamp[], onProgress?: (done: number, total: number) => void): Promise<Uint8Array> {
  const { degrees } = await loadPdfLib();
  const doc = await loadDocument(source);
  const pages = doc.getPages();
  const cache = new Map<Uint8Array, PdfLib.PDFImage>();
  for (const [i, s] of stamps.entries()) {
    const page = pages[s.page];
    if (!page) continue;
    let img = cache.get(s.png);
    if (!img) {
      img = await doc.embedPng(s.png);
      cache.set(s.png, img);
    }
    // Preview coordinates are top-left based; PDF is bottom-left based.
    const { w: dw, h: dh } = displayedSize(page);
    const w = s.width * dw;
    const h = s.height * dh;
    const fx = s.x;
    const fy = 1 - s.y - s.height; // bottom-left of the stamp in the displayed frame
    const p = displayedToUserSpace(page, fx, fy);
    // pdf-lib rotates around the drawn image's own bottom-left corner, which is
    // exactly the point we mapped, so width/height stay in displayed terms.
    page.drawImage(img, { x: p.x, y: p.y, width: w, height: h, rotate: degrees(p.rotate) });
    onProgress?.(i + 1, stamps.length);
  }
  return doc.save({ useObjectStreams: true });
}
