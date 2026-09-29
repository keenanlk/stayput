// Types for the parts of gifenc (MIT, https://github.com/mattdesl/gifenc) the converter uses.
declare module 'gifenc' {
  export type Palette = number[][];
  export type PaletteFormat = 'rgb565' | 'rgb444' | 'rgba4444';
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, options?: { format?: PaletteFormat; oneBitAlpha?: boolean | number; clearAlpha?: boolean }): Palette;
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: Palette, format?: PaletteFormat): Uint8Array;
  export function GIFEncoder(): {
    writeFrame(index: Uint8Array, width: number, height: number, options?: { palette?: Palette; transparent?: boolean; transparentIndex?: number; delay?: number; repeat?: number; dispose?: number }): void;
    finish(): void;
    bytes(): Uint8Array;
  };
}
declare module 'gifenc/src/lzwEncode.js' {
  /** Writes the LZW minimum code size, the data sub-blocks and the block terminator. */
  export default function lzwEncode(
    width: number,
    height: number,
    pixels: Uint8Array,
    colorDepth: number,
    outStream: { writeByte(b: number): void; writeBytesView(data: Uint8Array, offset?: number, length?: number): void; bytesView(): Uint8Array },
  ): void;
}
