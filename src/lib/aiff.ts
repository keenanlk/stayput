/**
 * A small reader for uncompressed AIFF and AIFC, used when the browser's own
 * decoder and the demuxer both refuse a file (Chrome has no AIFF support).
 * Reads PCM at 8, 16, 24 and 32 bits ('NONE', 'twos' and 'in24'/'in32' as
 * big-endian, 'sowt' as little-endian) and 32-bit float ('fl32', 'FL32').
 * Anything else, or a damaged file, gives null.
 */
export interface AiffAudio {
  sampleRate: number;
  channels: Float32Array[];
}

/** Decode the 80-bit IEEE extended number AIFF stores its sample rate in. */
export function readExtended(view: DataView, at: number): number {
  const exp = view.getUint16(at) & 0x7fff;
  const hi = view.getUint32(at + 2);
  const lo = view.getUint32(at + 6);
  if (exp === 0 && hi === 0 && lo === 0) return 0;
  if (exp === 0x7fff) return NaN;
  return (hi * 2 ** 32 + lo) * 2 ** (exp - 16383 - 63);
}

const tag = (v: DataView, at: number) => String.fromCharCode(v.getUint8(at), v.getUint8(at + 1), v.getUint8(at + 2), v.getUint8(at + 3));

export function parseAiff(buffer: ArrayBuffer): AiffAudio | null {
  const view = new DataView(buffer);
  const end = buffer.byteLength;
  if (end < 12 || tag(view, 0) !== 'FORM') return null;
  const form = tag(view, 8);
  if (form !== 'AIFF' && form !== 'AIFC') return null;

  let channels = 0;
  let frames = 0;
  let bits = 0;
  let rate = 0;
  let type = 'NONE';
  let haveComm = false;
  let data: { from: number; to: number } | null = null;

  let at = 12;
  while (at + 8 <= end) {
    const id = tag(view, at);
    const size = view.getUint32(at + 4);
    const body = at + 8;
    if (id === 'COMM') {
      if (size < 18 || body + 18 > end || (form === 'AIFC' && (size < 22 || body + 22 > end))) return null;
      channels = view.getUint16(body);
      frames = view.getUint32(body + 2);
      bits = view.getUint16(body + 6);
      rate = readExtended(view, body + 8);
      if (form === 'AIFC') type = tag(view, body + 18);
      haveComm = true;
    } else if (id === 'SSND') {
      if (size < 8 || body + 8 > end) return null;
      const offset = view.getUint32(body);
      const from = body + 8 + offset;
      const to = Math.min(body + size, end);
      if (from > to) return null;
      data = { from, to };
    }
    at = body + size + (size % 2);
  }
  if (!haveComm || !data) return null;

  const known = ['NONE', 'twos', 'sowt', 'in24', 'in32', 'fl32', 'FL32'];
  if (!known.includes(type)) return null;
  const float = type === 'fl32' || type === 'FL32';
  const little = type === 'sowt';
  if (float ? bits !== 32 : ![8, 16, 24, 32].includes(bits)) return null;
  if (channels < 1 || channels > 32 || !(rate >= 3000 && rate <= 768000) || frames < 1) return null;

  const width = bits / 8;
  const available = Math.floor((data.to - data.from) / (width * channels));
  // A file cut short is read as far as it goes; one with no sound at all is not a file.
  if (available < 1) return null;
  const length = Math.min(frames, available);

  const out = Array.from({ length: channels }, () => new Float32Array(length));
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < channels; c++) {
      const p = data.from + (i * channels + c) * width;
      let v: number;
      if (float) v = view.getFloat32(p, little);
      else if (bits === 8) v = view.getInt8(p) / 128;
      else if (bits === 16) v = view.getInt16(p, little) / 32768;
      else if (bits === 24) {
        const b0 = view.getUint8(p), b1 = view.getUint8(p + 1), b2 = view.getUint8(p + 2);
        const n = little ? (b2 << 16) | (b1 << 8) | b0 : (b0 << 16) | (b1 << 8) | b2;
        v = ((n << 8) >> 8) / 8388608;
      } else v = view.getInt32(p, little) / 2147483648;
      out[c]![i] = Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;
    }
  }
  return { sampleRate: rate, channels: out };
}
