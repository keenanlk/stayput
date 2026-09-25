/**
 * PDF helpers. pdf-lib edits document structure; pdf.js renders pages.
 * Both are loaded on demand so tool pages stay light until a file is dropped.
 */
import type * as PdfLib from 'pdf-lib';
import type * as PdfJs from 'pdfjs-dist';
import { canvasToBlob } from './image';

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
export async function openWithPdfJs(bytes: Uint8Array): Promise<PdfJs.PDFDocumentProxy> {
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

/** Render a page to a small thumbnail data URL. */
export async function pageThumbnail(doc: PdfJs.PDFDocumentProxy, pageNumber: number, maxPx = 160): Promise<string> {
  const page = await doc.getPage(pageNumber);
  const vp = page.getViewport({ scale: 1 });
  const scale = maxPx / Math.max(vp.width, vp.height);
  const { canvas } = await renderPage(doc, pageNumber, scale);
  return canvas.toDataURL('image/png');
}

export async function loadDocument(bytes: Uint8Array): Promise<PdfLib.PDFDocument> {
  const { PDFDocument } = await loadPdfLib();
  try {
    return await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  } catch (e) {
    throw new Error(`This file could not be read as a PDF${e instanceof Error && e.message ? ` (${e.message})` : ''}.`);
  }
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
