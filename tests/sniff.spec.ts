import { test, expect } from '@playwright/test';
import { sniffBytes, kindOf, SNIFF_BYTES, type Container } from '../src/lib/sniff';

// The sniff module runs in Node on generated headers: what a file is comes from its first bytes, never its name.
const text = (s: string) => [...s].map((c) => c.charCodeAt(0));
const pad = (bytes: number[], to = 64) => Uint8Array.from([...bytes, ...new Array(Math.max(0, to - bytes.length)).fill(1)]);
const ftyp = (brand: string) => pad([0, 0, 0, 0x18, ...text('ftyp'), ...text(brand), 0, 0, 0, 0]);
const riff = (kind: string) => pad([...text('RIFF'), 0x24, 0, 0, 0, ...text(kind)]);
const ebml = (doctype: string) => pad([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84, ...text(doctype)]);
/** A transport stream: sync byte 0x47 at the start of each packet. */
const ts = (packet: number, lead = 0) => {
  const b = new Uint8Array(lead + packet * 4);
  for (let i = 0; i < 4; i++) b[lead + i * packet] = 0x47;
  return b;
};

const cases: [string, Uint8Array, Container][] = [
  ['MP4 (isom)', ftyp('isom'), 'mp4'],
  ['MP4 (mp42)', ftyp('mp42'), 'mp4'],
  ['MOV', ftyp('qt  '), 'mov'],
  ['3GP', ftyp('3gp4'), '3gp'],
  ['3G2', ftyp('3g2a'), '3gp'],
  ['M4A', ftyp('M4A '), 'm4a'],
  ['HEIC', ftyp('heic'), 'heic'],
  ['AVIF', ftyp('avif'), 'avif'],
  ['WebM', ebml('webm'), 'webm'],
  ['MKV', ebml('matroska'), 'mkv'],
  ['MPEG-TS (.ts)', ts(188), 'mpegts'],
  ['MPEG-TS (M2TS, 192-byte packets)', ts(192, 4), 'mpegts'],
  ['AVI', riff('AVI '), 'avi'],
  ['WAV', riff('WAVE'), 'wav'],
  ['WebP', riff('WEBP'), 'webp'],
  ['FLV', pad([...text('FLV'), 1, 5, 0, 0, 0, 9]), 'flv'],
  ['ASF (WMV/WMA)', pad([0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11, 0xa6, 0xd9, 0x00, 0xaa, 0x00, 0x62, 0xce, 0x6c]), 'asf'],
  ['Ogg', pad(text('OggS')), 'ogg'],
  ['FLAC', pad(text('fLaC')), 'flac'],
  ['AIFF', pad([...text('FORM'), 0, 0, 0, 0, ...text('AIFF')]), 'aiff'],
  ['MP3 with ID3', pad(text('ID3')), 'mp3'],
  ['MP3 frame', pad([0xff, 0xfb, 0x90, 0x00]), 'mp3'],
  ['AAC (ADTS)', pad([0xff, 0xf1, 0x50, 0x80]), 'aac'],
  ['JPEG', pad([0xff, 0xd8, 0xff, 0xe0]), 'jpeg'],
  ['PNG', pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'png'],
  ['GIF', pad(text('GIF89a')), 'gif'],
  ['PDF', pad(text('%PDF-1.7')), 'pdf'],
  ['all zeros (a cloud placeholder)', new Uint8Array(SNIFF_BYTES), 'zeros'],
  ['random bytes with a video name', Uint8Array.from({ length: 512 }, (_, i) => (i * 131 + 7) % 251 || 9), 'unknown'],
  ['an empty read', new Uint8Array(0), 'unknown'],
];

for (const [label, bytes, want] of cases) {
  test(`sniff: ${label} is ${want}`, () => {
    expect(sniffBytes(bytes)).toBe(want);
  });
}

test('sniff: a short run of zeros is not called a placeholder', () => {
  expect(sniffBytes(new Uint8Array(8))).not.toBe('zeros');
});

test('sniff: MPEG-TS needs the sync byte on every packet, not just the first', () => {
  const broken = ts(188);
  broken[188] = 0;
  expect(sniffBytes(broken)).not.toBe('mpegts');
});

test('sniff: the kind of each container', () => {
  expect(kindOf('mpegts')).toBe('video');
  expect(kindOf('avi')).toBe('video');
  expect(kindOf('wav')).toBe('audio');
  expect(kindOf('jpeg')).toBe('image');
  expect(kindOf('zeros')).toBe('zeros');
});

test('sniff: a video renamed .mp3 and an MP4 that is really WebM are named by their bytes', () => {
  expect(sniffBytes(ftyp('isom'))).toBe('mp4');
  expect(sniffBytes(ebml('webm'))).toBe('webm');
});
