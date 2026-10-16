/**
 * The ICO and CUR container around PNG images. A CUR is an ICO with header type 2
 * and, in each directory entry, the hotspot (the pixel that clicks) in the two
 * fields ICO uses for colour planes and bit count.
 */
export interface Hotspot {
  x: number;
  y: number;
}

/** Where the hotspot sits: a corner or the middle of the picture, or exact pixels on the 32 px size. */
export type HotspotSpec = { kind: 'top-left' } | { kind: 'centre' } | { kind: 'custom'; x: number; y: number };

/** Reference size the custom X/Y are given in. */
export const CUR_REFERENCE_SIZE = 32;

/** Cursor sizes written by default; 256 is left out because large pointers are rarely wanted. */
export const CUR_SIZES = [32, 48, 64, 128];

/** The hotspot for one square size, scaled from the 32 px reference and kept inside the picture. */
export function hotspotFor(spec: HotspotSpec, size: number): Hotspot {
  const at = (v: number) => Math.max(0, Math.min(size - 1, Math.round((v * size) / CUR_REFERENCE_SIZE)));
  if (spec.kind === 'top-left') return { x: 0, y: 0 };
  if (spec.kind === 'centre') return { x: Math.floor((size - 1) / 2), y: Math.floor((size - 1) / 2) };
  return { x: at(spec.x), y: at(spec.y) };
}

/** Wraps square PNG images (one per size) in an ICO, or in a CUR when `hotspots` is given (one per image). */
export function buildIconFile(pngs: Uint8Array[], sizes: number[], hotspots?: Hotspot[]): Uint8Array {
  const header = 6 + 16 * pngs.length;
  const out = new Uint8Array(header + pngs.reduce((n, p) => n + p.length, 0));
  const v = new DataView(out.buffer);
  v.setUint16(2, hotspots ? 2 : 1, true);
  v.setUint16(4, pngs.length, true);
  let offset = header;
  pngs.forEach((png, i) => {
    const p = 6 + i * 16;
    const s = sizes[i]!;
    out[p] = s >= 256 ? 0 : s;
    out[p + 1] = s >= 256 ? 0 : s;
    v.setUint16(p + 4, hotspots ? hotspots[i]!.x : 1, true);
    v.setUint16(p + 6, hotspots ? hotspots[i]!.y : 32, true);
    v.setUint32(p + 8, png.length, true);
    v.setUint32(p + 12, offset, true);
    out.set(png, offset);
    offset += png.length;
  });
  return out;
}
