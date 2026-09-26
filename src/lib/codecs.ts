/**
 * WebAssembly fallbacks for image formats a browser may not decode natively.
 *
 * AVIF is decoded by every current browser, and JPEG XL by Safari 17+. When
 * `createImageBitmap` refuses a file, the matching jSquash decoder (the Squoosh
 * codecs repackaged as ES modules, Apache-2.0) is loaded on demand from this
 * site's /vendor/ directory (see vendor.ts). The request fetches only the
 * decoder program; the image itself is decoded in this tab and never leaves it.
 */
import { vendorEntry } from './vendor';

export type WasmCodec = 'jxl' | 'avif';

interface DecoderModule {
  default(buffer: ArrayBuffer): Promise<ImageData>;
}

const modules = new Map<WasmCodec, Promise<DecoderModule>>();

export function loadDecoder(codec: WasmCodec): Promise<DecoderModule> {
  let p = modules.get(codec);
  if (!p) {
    p = import(/* @vite-ignore */ vendorEntry(codec)).catch((err) => {
      modules.delete(codec);
      throw new Error(
        `The ${codec.toUpperCase()} decoder could not be loaded (${err instanceof Error ? err.message : String(err)}). Check your connection and try again.`,
      );
    });
    modules.set(codec, p);
  }
  return p;
}

/** Decode an AVIF or JPEG XL file with the WebAssembly decoder. */
export async function decodeWithWasm(file: Blob, codec: WasmCodec): Promise<ImageBitmap> {
  const mod = await loadDecoder(codec);
  let data: ImageData;
  try {
    data = await mod.default(await file.arrayBuffer());
  } catch (e) {
    throw new Error(`This file could not be decoded as ${codec === 'jxl' ? 'JPEG XL' : 'AVIF'}${e instanceof Error && e.message ? ` (${e.message})` : ''}.`);
  }
  return createImageBitmap(data);
}

/** Sniff AVIF (ISO BMFF brand) and JPEG XL (codestream or container) signatures. */
export function sniffWasmCodec(head: Uint8Array): WasmCodec | undefined {
  if (head.length >= 12 && String.fromCharCode(...head.subarray(4, 8)) === 'ftyp') {
    const brand = String.fromCharCode(...head.subarray(8, 12));
    if (brand === 'avif' || brand === 'avis') return 'avif';
  }
  if (head.length >= 2 && head[0] === 0xff && head[1] === 0x0a) return 'jxl';
  if (head.length >= 12 && head[0] === 0 && head[1] === 0 && head[2] === 0 && head[3] === 0x0c && String.fromCharCode(...head.subarray(4, 8)) === 'JXL ') return 'jxl';
  return undefined;
}
