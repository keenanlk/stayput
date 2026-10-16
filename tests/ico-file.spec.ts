import { test, expect } from '@playwright/test';
import { buildIconFile, hotspotFor, CUR_SIZES } from '../src/lib/ico-file';

/** A stand-in for a PNG entry: the container does not look inside it. */
const png = (n: number) => new Uint8Array(n).fill(7);

function readHeader(b: Uint8Array) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return {
    reserved: v.getUint16(0, true),
    type: v.getUint16(2, true),
    count: v.getUint16(4, true),
    entries: Array.from({ length: v.getUint16(4, true) }, (_, i) => {
      const p = 6 + i * 16;
      return { size: b[p]! || 256, x: v.getUint16(p + 4, true), y: v.getUint16(p + 6, true), length: v.getUint32(p + 8, true), offset: v.getUint32(p + 12, true) };
    }),
  };
}

test('a CUR has header type 2 and the hotspot in each directory entry', () => {
  const sizes = [32, 48, 64, 128];
  const hotspots = sizes.map((s) => hotspotFor({ kind: 'custom', x: 5, y: 7 }, s));
  const file = buildIconFile(sizes.map((s) => png(s)), sizes, hotspots);
  const h = readHeader(file);
  expect(h.reserved).toBe(0);
  expect(h.type).toBe(2);
  expect(h.count).toBe(4);
  expect(h.entries.map((e) => [e.size, e.x, e.y])).toEqual([[32, 5, 7], [48, 8, 11], [64, 10, 14], [128, 20, 28]]);
  // Each entry points at its own image, one after the other.
  let offset = 6 + 16 * 4;
  for (const e of h.entries) {
    expect(e.offset).toBe(offset);
    offset += e.length;
  }
  expect(file.length).toBe(offset);
});

test('top left puts the hotspot at 0,0 and centre in the middle pixel of every size', () => {
  for (const s of CUR_SIZES) {
    expect(hotspotFor({ kind: 'top-left' }, s)).toEqual({ x: 0, y: 0 });
    expect(hotspotFor({ kind: 'centre' }, s)).toEqual({ x: Math.floor((s - 1) / 2), y: Math.floor((s - 1) / 2) });
  }
});

test('a custom hotspot is kept inside the picture at every size', () => {
  expect(hotspotFor({ kind: 'custom', x: 99, y: -4 }, 32)).toEqual({ x: 31, y: 0 });
  expect(hotspotFor({ kind: 'custom', x: 31, y: 31 }, 128)).toEqual({ x: 124, y: 124 });
});

test('an ICO is still type 1 with one colour plane and 32 bits', () => {
  const file = buildIconFile([png(10), png(20)], [16, 256]);
  const h = readHeader(file);
  expect(h.type).toBe(1);
  expect(h.entries.map((e) => [e.size, e.x, e.y])).toEqual([[16, 1, 32], [256, 1, 32]]);
});
