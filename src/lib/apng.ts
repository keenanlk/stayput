/**
 * An animated PNG (APNG) writer. Every frame is a full-canvas RGBA picture written with
 * dispose none and blend source, so each one replaces the one before and transparency survives.
 * Pixel data is deflated with the browser's CompressionStream('deflate') (zlib format, which is what
 * PNG wants), so no library is needed. Nothing leaves the tab.
 */

export interface ApngFrame {
  /** Width x height x 4 bytes, straight (not premultiplied) RGBA. */
  rgba: Uint8ClampedArray | Uint8Array;
  /** How long the frame shows, in milliseconds. */
  delayMs: number;
}

export interface ApngOptions {
  width: number;
  height: number;
  frames: ApngFrame[];
  /** Times the animation plays; 0 is forever. */
  plays: number;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

let table: Uint32Array | undefined;
function crc32(parts: Uint8Array[]): number {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const p of parts) for (let i = 0; i < p.length; i++) c = table[(c ^ p[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const name = Uint8Array.from(type, (ch) => ch.charCodeAt(0));
  const out = new Uint8Array(12 + data.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  out.set(name, 4);
  out.set(data, 8);
  v.setUint32(8 + data.length, crc32([name, data]));
  return out;
}

async function deflate(raw: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([raw as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Scanlines with filter type 0 in front of each, ready to deflate. */
function scanlines(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Uint8Array {
  const stride = width * 4;
  const out = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) out.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  return out;
}

/** fcTL delay as a fraction of a second: milliseconds over 1000, rounded to whole milliseconds. */
export function frameDelayFraction(ms: number): [number, number] {
  return [Math.min(65535, Math.max(0, Math.round(ms))), 1000];
}

export async function encodeApng(o: ApngOptions): Promise<Uint8Array<ArrayBuffer>> {
  const { width, height, frames } = o;
  if (!frames.length) throw new Error('There are no frames to write.');
  const parts: Uint8Array[] = [Uint8Array.from(SIGNATURE)];
  const ihdr = new Uint8Array(13);
  const hv = new DataView(ihdr.buffer);
  hv.setUint32(0, width);
  hv.setUint32(4, height);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8 bits, RGBA, deflate, adaptive filtering, no interlace
  parts.push(chunk('IHDR', ihdr));
  const actl = new Uint8Array(8);
  const av = new DataView(actl.buffer);
  av.setUint32(0, frames.length);
  av.setUint32(4, o.plays);
  parts.push(chunk('acTL', actl));

  let seq = 0;
  for (const [i, f] of frames.entries()) {
    const fctl = new Uint8Array(26);
    const fv = new DataView(fctl.buffer);
    const [num, den] = frameDelayFraction(f.delayMs);
    fv.setUint32(0, seq++);
    fv.setUint32(4, width);
    fv.setUint32(8, height);
    // x and y offsets stay 0
    fv.setUint16(20, num);
    fv.setUint16(22, den);
    fctl[24] = 0; // dispose none
    fctl[25] = 0; // blend source
    parts.push(chunk('fcTL', fctl));
    const z = await deflate(scanlines(f.rgba, width, height));
    if (i === 0) {
      parts.push(chunk('IDAT', z));
    } else {
      const fdat = new Uint8Array(4 + z.length);
      new DataView(fdat.buffer).setUint32(0, seq++);
      fdat.set(z, 4);
      parts.push(chunk('fdAT', fdat));
    }
  }
  parts.push(chunk('IEND', new Uint8Array(0)));
  return new Uint8Array(await new Blob(parts as BlobPart[]).arrayBuffer());
}
