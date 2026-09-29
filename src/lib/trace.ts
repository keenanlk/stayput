/**
 * Turn a bitmap into an SVG of filled shapes with imagetracerjs (public
 * domain): the colours are reduced to a small palette, the edge of each
 * colour's areas is traced, and the edges are smoothed into lines and curves.
 * Runs in a worker (trace.worker.ts); the image never leaves the tab.
 */
// @ts-expect-error imagetracerjs ships no types.
import ImageTracer from 'imagetracerjs';

export type TraceMode = 'bw' | 'logo' | 'detailed';

export interface TraceOptions {
  mode: TraceMode;
  /** Drop white areas, for a transparent background. */
  dropWhite: boolean;
  /** Scale from the traced pixels up to the output size. */
  scale: number;
}

interface Colour {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface TraceData {
  layers: unknown[][];
  palette: Colour[];
  width: number;
  height: number;
}

const MODES: Record<TraceMode, Record<string, unknown>> = {
  // Two colours from a fixed palette, for cutting machines and stencils.
  bw: { colorsampling: 0, numberofcolors: 2, pal: [{ r: 0, g: 0, b: 0, a: 255 }, { r: 255, g: 255, b: 255, a: 255 }], pathomit: 8, blurradius: 0 },
  // Flat artwork: a handful of colours, small specks left out.
  logo: { colorsampling: 2, numberofcolors: 8, colorquantcycles: 3, pathomit: 8, rightangleenhance: true },
  // Illustrations and photos: many colours, every detail kept.
  detailed: { colorsampling: 2, numberofcolors: 32, colorquantcycles: 3, pathomit: 0, ltres: 0.5, qtres: 0.5, roundcoords: 2 },
};

export interface TraceResult {
  svg: string;
  paths: number;
  colours: number;
}

/** Pixels to trace: an ImageData, or anything shaped like one. */
export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/**
 * Trace `img` into an SVG. For the black-and-white mode, hand it pixels that
 * are already pure black and white (see toMono in mono.ts).
 */
export function traceToSvg(img: Pixels, opts: TraceOptions): TraceResult {
  // imagetracerjs fills defaults into the options object it is given, so hand it a fresh one.
  const options = { ...MODES[opts.mode], scale: opts.scale, roundcoords: 1, viewbox: false, desc: false, strokewidth: 0 };
  const td = ImageTracer.imagedataToTracedata(img, options) as TraceData;
  let paths = 0;
  let colours = 0;
  td.palette.forEach((c, i) => {
    const white = c.r > 245 && c.g > 245 && c.b > 245;
    // Fully transparent areas, and white ones when asked, are left out rather than drawn.
    if (c.a < 8 || (opts.dropWhite && white)) td.layers[i] = [];
    if (td.layers[i]!.length) colours++;
    paths += td.layers[i]!.length;
  });
  return { svg: ImageTracer.getsvgstring(td, options) as string, paths, colours };
}
