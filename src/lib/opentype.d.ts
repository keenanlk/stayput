// Types for the parts of opentype.js (MIT, https://github.com/opentypejs/opentype.js) the PDF to SVG converter uses.
declare module 'opentype.js' {
  export interface PathCommand {
    type: 'M' | 'L' | 'C' | 'Q' | 'Z';
    x?: number;
    y?: number;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
  }
  export interface Glyph {
    index: number;
    advanceWidth?: number;
    getPath(x?: number, y?: number, fontSize?: number): { commands: PathCommand[] };
  }
  export interface Font {
    unitsPerEm: number;
    outlinesFormat: string;
    charToGlyphIndex(char: string): number;
    glyphs: { get(index: number): Glyph };
  }
  export function parse(buffer: ArrayBuffer): Font;
}
