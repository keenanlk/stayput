import { decodeHeic } from './heic';
import { decodeWithWasm, sniffWasmCodec, type WasmCodec } from './codecs';
import { extOf, isHeicFile, readHead } from './files';
import { decodePsd, isPsdFile } from './psd';
import { decodeTiffPages, isTiffFile } from './tiff';
import { svgFallbackSize } from './svg-size';
import { vendorDir, vendorEntry } from './vendor';

export type EncodeType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface Decoded {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  /** True when the source was HEIC/HEIF and went through libheif. */
  heic: boolean;
}

async function loadViaImageElement(file: Blob): Promise<ImageBitmap> {
  const isSvg = file.type === 'image/svg+xml' || (file instanceof File && /\.svg$/i.test(file.name));
  const fallback = isSvg ? svgFallbackSize(await file.text()) : undefined;
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = 'async';
    img.onload = async () => {
      try {
        // SVGs without intrinsic size render at 300x150; give them a sane size.
        const w = fallback?.width ?? (img.naturalWidth || 1024);
        const h = fallback?.height ?? (img.naturalHeight || 1024);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas is not available in this browser.');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(await createImageBitmap(canvas));
      } catch (e) {
        reject(e);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This file could not be decoded as an image.'));
    };
    img.src = url;
  });
}

function wasmCodecFor(file: Blob, ext: string): WasmCodec | undefined {
  if (ext === 'jxl' || file.type === 'image/jxl') return 'jxl';
  if (ext === 'avif' || file.type === 'image/avif') return 'avif';
  return undefined;
}

/** Decode any supported image into an ImageBitmap with EXIF orientation applied. */
export async function decodeImage(file: File): Promise<Decoded> {
  const ext = extOf(file.name);
  const heic = ext === 'heic' || ext === 'heif' || file.type === 'image/heic' || file.type === 'image/heif' || (await isHeicFile(file));
  if (heic) {
    const bitmap = await decodeHeic(file);
    return { bitmap, width: bitmap.width, height: bitmap.height, heic: true };
  }
  let bitmap: ImageBitmap;
  if (ext === 'svg' || file.type === 'image/svg+xml') {
    bitmap = await loadViaImageElement(file);
  } else if (await isPsdFile(file)) {
    // Browsers have no PSD decoder (Safari's behaviour varies), so ag-psd reads the saved composite everywhere.
    bitmap = await decodePsd(file);
  } else {
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // AVIF and JPEG XL fall back to a WebAssembly decoder when the browser
      // has no native one (JPEG XL everywhere but Safari, AVIF in old browsers).
      // TIFF opens natively only in Safari; elsewhere UTIF.js decodes the first page.
      const codec = wasmCodecFor(file, ext) ?? sniffWasmCodec(await readHead(file, 12));
      if (codec) bitmap = await decodeWithWasm(file, codec);
      else if (await isTiffFile(file)) bitmap = (await decodeTiffPages(file, 1))[0]!;
      else bitmap = await loadViaImageElement(file);
    }
  }
  return { bitmap, width: bitmap.width, height: bitmap.height, heic: false };
}

export interface FitOptions {
  maxWidth?: number;
  maxHeight?: number;
  /** 0 < scale <= 1, applied before max limits. */
  scale?: number;
}

export function fitSize(width: number, height: number, opts: FitOptions): { width: number; height: number } {
  let w = width;
  let h = height;
  if (opts.scale && opts.scale > 0 && opts.scale !== 1) {
    w = Math.round(w * opts.scale);
    h = Math.round(h * opts.scale);
  }
  const maxW = opts.maxWidth && opts.maxWidth > 0 ? opts.maxWidth : Infinity;
  const maxH = opts.maxHeight && opts.maxHeight > 0 ? opts.maxHeight : Infinity;
  const ratio = Math.min(1, maxW / w, maxH / h);
  if (ratio < 1) {
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }
  return { width: Math.max(1, w), height: Math.max(1, h) };
}

export interface EncodeOptions {
  type: EncodeType;
  /** 0..1 for JPEG and WebP. */
  quality?: number;
  width?: number;
  height?: number;
  /** Fill color for formats without transparency (JPEG). */
  background?: string;
}

/**
 * WebP encoder for browsers whose canvas cannot write WebP (Safari). Loaded on
 * first use from this site's own /vendor/ directory, so Chrome and Firefox,
 * which encode natively, never download it.
 */
interface WebpEncoderModule {
  encode(data: Uint8ClampedArray, width: number, height: number, options: Record<string, number>): Uint8Array | null;
}
let webpEncoder: Promise<{ module: WebpEncoderModule; defaults: Record<string, number> }> | undefined;

function loadWebpEncoder() {
  if (!webpEncoder) {
    const dir = vendorDir('webp');
    webpEncoder = (async () => {
      const [factory, utils, meta] = await Promise.all([
        import(/* @vite-ignore */ vendorEntry('webp')),
        import(/* @vite-ignore */ `${dir}utils.js`),
        import(/* @vite-ignore */ `${dir}meta.js`),
      ]);
      const module: WebpEncoderModule = await utils.initEmscriptenModule(factory.default);
      return { module, defaults: meta.defaultOptions as Record<string, number> };
    })().catch((err) => {
      webpEncoder = undefined;
      throw new Error(`The WebP encoder could not be loaded (${err instanceof Error ? err.message : String(err)}). Check your connection and try again.`);
    });
  }
  return webpEncoder;
}

/** Encode a canvas as WebP with the WebAssembly encoder; `quality` is 0..1 like canvas.toBlob. */
async function webpFromCanvas(canvas: HTMLCanvasElement | OffscreenCanvas, quality = 0.92): Promise<Blob> {
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { module, defaults } = await loadWebpEncoder();
  const out = module.encode(img.data, img.width, img.height, { ...defaults, quality: Math.round(Math.min(1, Math.max(0, quality)) * 100) });
  if (!out) throw new Error('The browser could not encode this image.');
  return new Blob([out as BlobPart], { type: 'image/webp' });
}

export async function canvasToBlob(canvas: HTMLCanvasElement | OffscreenCanvas, type: string, quality?: number): Promise<Blob> {
  const blob = await nativeToBlob(canvas, type, quality);
  // Browsers that cannot write WebP hand back a PNG instead (or fail); use the WebAssembly encoder.
  if (type === 'image/webp' && blob?.type !== 'image/webp') return webpFromCanvas(canvas, quality);
  if (!blob) throw new Error('The browser could not encode this image.');
  return blob;
}

function nativeToBlob(canvas: HTMLCanvasElement | OffscreenCanvas, type: string, quality?: number): Promise<Blob | null> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type, quality }).catch(() => null);
  }
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/**
 * Draw a bitmap at the requested size. Large downscales are done in steps of
 * at most 2x so the result stays sharp in browsers that use bilinear sampling.
 */
export function drawScaled(bitmap: ImageBitmap, width: number, height: number, background?: string): HTMLCanvasElement | OffscreenCanvas {
  let srcW = bitmap.width;
  let srcH = bitmap.height;
  let source: ImageBitmap | HTMLCanvasElement | OffscreenCanvas = bitmap;
  while (srcW / 2 > width && srcH / 2 > height) {
    const w = Math.ceil(srcW / 2);
    const h = Math.ceil(srcH / 2);
    const step = makeCanvas(w, h);
    const ctx = step.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, w, h);
    source = step;
    srcW = w;
    srcH = h;
  }
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

export async function encodeBitmap(bitmap: ImageBitmap, opts: EncodeOptions): Promise<Blob> {
  const width = opts.width ?? bitmap.width;
  const height = opts.height ?? bitmap.height;
  const background = opts.type === 'image/jpeg' ? (opts.background ?? '#ffffff') : opts.background;
  const canvas = drawScaled(bitmap, width, height, background);
  const blob = await canvasToBlob(canvas, opts.type, opts.type === 'image/png' ? undefined : opts.quality);
  if (blob.type !== opts.type) {
    throw new Error(`This browser cannot save ${opts.type.replace('image/', '').toUpperCase()} images.`);
  }
  return blob;
}

export function extForType(type: EncodeType): string {
  return type === 'image/jpeg' ? 'jpg' : type === 'image/png' ? 'png' : 'webp';
}

/** Produce a small preview data URL for the results list. */
export async function thumbnail(bitmap: ImageBitmap, size = 96): Promise<string> {
  const { width, height } = fitSize(bitmap.width, bitmap.height, { maxWidth: size, maxHeight: size });
  const canvas = drawScaled(bitmap, width, height);
  const blob = await canvasToBlob(canvas, 'image/png');
  return URL.createObjectURL(blob);
}

export type Fit = 'cover' | 'contain' | 'stretch';

/**
 * Draw a bitmap at exactly `width`×`height`. `cover` crops the centre to the
 * new shape, `contain` fits it inside with bars of `background` (transparent
 * when none), `stretch` distorts it to fill.
 */
export async function drawExact(bitmap: ImageBitmap, width: number, height: number, fit: Fit, background?: string): Promise<HTMLCanvasElement | OffscreenCanvas> {
  if (fit === 'stretch') return drawScaled(bitmap, width, height, background);
  if (fit === 'cover') {
    const scale = Math.max(width / bitmap.width, height / bitmap.height);
    const sw = Math.min(bitmap.width, Math.round(width / scale));
    const sh = Math.min(bitmap.height, Math.round(height / scale));
    const cropped = await createImageBitmap(bitmap, Math.floor((bitmap.width - sw) / 2), Math.floor((bitmap.height - sh) / 2), sw, sh);
    try {
      return drawScaled(cropped, width, height, background);
    } finally {
      cropped.close();
    }
  }
  const scale = Math.min(width / bitmap.width, height / bitmap.height);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const inner = drawScaled(bitmap, w, h);
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(inner, Math.floor((width - w) / 2), Math.floor((height - h) / 2));
  return canvas;
}
