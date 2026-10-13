import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readAvcConfig } from '../src/lib/h264-sps';

/** The AVC sequence header (avcC) of the first video tag of an FLV. */
function avcCOf(file: string): Uint8Array {
  const d = readFileSync(fileURLToPath(new URL(`./fixtures/static/${file}`, import.meta.url)));
  let pos = 13;
  while (pos + 11 <= d.length) {
    const size = d.readUIntBE(pos + 1, 3);
    // Video tag, codec 7 (AVC), packet type 0 (sequence header): 5 header bytes, then the record.
    if (d[pos] === 9 && (d[pos + 11]! & 15) === 7 && d[pos + 12] === 0) return new Uint8Array(d.subarray(pos + 16, pos + 11 + size));
    pos += 11 + size + 4;
  }
  throw new Error('no AVC sequence header');
}

test('reads picture size and codec string from an FLV’s avcC', () => {
  const info = readAvcConfig(avcCOf('h264-aac.flv'));
  expect(info).not.toBeNull();
  expect(info!.width).toBe(320);
  expect(info!.height).toBe(240);
  expect(info!.codec).toMatch(/^avc1\.64[0-9a-f]{4}$/);
});

test('rejects bytes that are not an avcC', () => {
  expect(readAvcConfig(new Uint8Array([0, 1, 2, 3]))).toBeNull();
  expect(readAvcConfig(new Uint8Array(40))).toBeNull();
});

test('applies frame cropping (1080p is coded as 1088 rows)', () => {
  // The avcC of a 1920x1080 baseline-profile x264 stream, as an FLV carries it.
  const record = Uint8Array.from([
    0x01, 0x42, 0xc0, 0x28, 0xff, 0xe1, 0x00, 0x19, 0x67, 0x42, 0xc0, 0x28, 0xda, 0x01, 0xe0, 0x08, 0x9f, 0x97, 0x01, 0x10, 0x00, 0x00, 0x03, 0x00, 0x10, 0x00, 0x00, 0x03, 0x00, 0x20, 0xf1, 0x83, 0x2a,
    0x01, 0x00, 0x04, 0x68, 0xce, 0x0f, 0xc8,
  ]);
  const info = readAvcConfig(record);
  expect(info?.width).toBe(1920);
  expect(info?.height).toBe(1080);
  expect(info?.codec).toBe('avc1.42c028');
});
