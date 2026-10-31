/**
 * What a file really is, from its first bytes. No imports and no browser calls, so a spec can run it in Node.
 * A name or a MIME type is whatever the phone or the visitor chose; the first bytes are what the file is.
 */

export type Container =
  | 'mp4' | 'mov' | '3gp' | 'm4a' | 'webm' | 'mkv' | 'mpegts' | 'avi' | 'flv' | 'asf'
  | 'ogg' | 'mp3' | 'aac' | 'wav' | 'flac' | 'aiff' | 'caf' | 'amr' | 'midi'
  | 'jpeg' | 'png' | 'gif' | 'webp' | 'bmp' | 'tiff' | 'heic' | 'avif'
  | 'pdf' | 'zip'
  | 'zeros' | 'unknown';

export type Kind = 'video' | 'audio' | 'image' | 'other' | 'zeros' | 'unknown';

/** How many bytes sniffing needs: enough for three 188-byte transport-stream packets and an EBML header. */
export const SNIFF_BYTES = 4096;

const KINDS: Record<Container, Kind> = {
  mp4: 'video', mov: 'video', '3gp': 'video', m4a: 'audio', webm: 'video', mkv: 'video', mpegts: 'video', avi: 'video', flv: 'video', asf: 'video',
  ogg: 'audio', mp3: 'audio', aac: 'audio', wav: 'audio', flac: 'audio', aiff: 'audio', caf: 'audio', amr: 'audio', midi: 'audio',
  jpeg: 'image', png: 'image', gif: 'image', webp: 'image', bmp: 'image', tiff: 'image', heic: 'image', avif: 'image',
  pdf: 'other', zip: 'other', zeros: 'zeros', unknown: 'unknown',
};

export function kindOf(container: Container): Kind {
  return KINDS[container];
}

const ascii = (b: Uint8Array, at: number, text: string) => {
  if (at + text.length > b.length) return false;
  for (let i = 0; i < text.length; i++) if (b[at + i] !== text.charCodeAt(i)) return false;
  return true;
};
const hasBytes = (b: Uint8Array, at: number, bytes: number[]) => at + bytes.length <= b.length && bytes.every((v, i) => b[at + i] === v);
const find = (b: Uint8Array, text: string, from: number, to: number) => {
  for (let i = from; i + text.length <= Math.min(to, b.length); i++) if (ascii(b, i, text)) return true;
  return false;
};

/** MPEG transport stream: the 0x47 sync byte every 188 bytes (every 192 in M2TS, after a 4-byte timestamp). */
function isTransportStream(b: Uint8Array): boolean {
  for (const [start, step] of [[0, 188], [4, 192]] as const) {
    const need = Math.min(3, Math.floor((b.length - start) / step) + 1);
    if (need < 2) continue;
    let ok = true;
    for (let i = 0; i < need && ok; i++) ok = b[start + i * step] === 0x47;
    if (ok) return true;
  }
  return false;
}

const ASF_GUID = [0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11, 0xa6, 0xd9, 0x00, 0xaa, 0x00, 0x62, 0xce, 0x6c];

/** The container of a file, from the first bytes of it (up to SNIFF_BYTES). A file of nothing but zero bytes is 'zeros'. */
export function sniffBytes(b: Uint8Array): Container {
  if (b.length === 0) return 'unknown';
  if (b.length >= 16 && b.every((v) => v === 0)) return 'zeros';

  if (ascii(b, 4, 'ftyp')) {
    const brand = String.fromCharCode(b[8] ?? 0, b[9] ?? 0, b[10] ?? 0, b[11] ?? 0);
    if (brand === 'qt  ') return 'mov';
    if (/^3g[p2gr]/.test(brand)) return '3gp';
    if (brand === 'M4A ' || brand === 'M4B ' || brand === 'M4P ') return 'm4a';
    if (brand === 'avif' || brand === 'avis') return 'avif';
    if (/^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(brand)) return 'heic';
    return 'mp4';
  }
  if (hasBytes(b, 0, [0x1a, 0x45, 0xdf, 0xa3])) return find(b, 'webm', 4, 64) ? 'webm' : 'mkv';
  if (ascii(b, 0, 'RIFF')) {
    if (ascii(b, 8, 'AVI ')) return 'avi';
    if (ascii(b, 8, 'WAVE')) return 'wav';
    if (ascii(b, 8, 'WEBP')) return 'webp';
  }
  if (ascii(b, 0, 'FLV') && b[3] === 1) return 'flv';
  if (hasBytes(b, 0, ASF_GUID)) return 'asf';
  if (isTransportStream(b)) return 'mpegts';
  if (ascii(b, 0, 'OggS')) return 'ogg';
  if (ascii(b, 0, 'fLaC')) return 'flac';
  if (ascii(b, 0, 'FORM') && (ascii(b, 8, 'AIFF') || ascii(b, 8, 'AIFC'))) return 'aiff';
  if (ascii(b, 0, 'caff')) return 'caf';
  if (ascii(b, 0, '#!AMR')) return 'amr';
  if (ascii(b, 0, 'MThd')) return 'midi';
  if (ascii(b, 0, 'ID3')) return 'mp3';
  if (b[0] === 0xff && ((b[1] ?? 0) & 0xf0) === 0xf0 && ((b[1] ?? 0) & 0x06) === 0) return 'aac';
  if (b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0 && ((b[1] ?? 0) & 0x06) !== 0) return 'mp3';
  if (hasBytes(b, 0, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (hasBytes(b, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (ascii(b, 0, 'GIF8')) return 'gif';
  if (ascii(b, 0, 'BM') && b.length > 14) return 'bmp';
  if (hasBytes(b, 0, [0x49, 0x49, 0x2a, 0x00]) || hasBytes(b, 0, [0x4d, 0x4d, 0x00, 0x2a])) return 'tiff';
  if (ascii(b, 0, '%PDF')) return 'pdf';
  if (ascii(b, 0, 'PK\x03\x04')) return 'zip';
  return 'unknown';
}
