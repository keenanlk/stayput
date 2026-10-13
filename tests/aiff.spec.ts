import { test, expect } from '@playwright/test';
import { parseAiff, readExtended } from '../src/lib/aiff';
import { aiff, extended } from './aiff-helpers';

const ab = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) as ArrayBuffer;
const rms = (c: Float32Array) => Math.sqrt(c.reduce((s, v) => s + v * v, 0) / c.length);

test('the 80-bit sample rate is read exactly for common rates', () => {
  for (const rate of [8000, 11025, 22050, 32000, 44100, 48000, 88200, 96000, 192000]) {
    const v = new DataView(new Uint8Array(extended(rate)).buffer);
    expect(readExtended(v, 0), String(rate)).toBe(rate);
  }
});

test('each sample type reads as the same half-scale tone', () => {
  const cases = [
    { bits: 8 as const }, { bits: 16 as const }, { bits: 24 as const }, { bits: 32 as const },
    { bits: 16 as const, aifc: 'NONE' as const }, { bits: 16 as const, aifc: 'twos' as const },
    { bits: 16 as const, aifc: 'sowt' as const }, { bits: 24 as const, aifc: 'sowt' as const },
    { bits: 32 as const, aifc: 'fl32' as const },
  ];
  for (const c of cases) {
    const out = parseAiff(ab(aiff({ channels: 2, rate: 44100, seconds: 0.5, ...c })));
    const label = `${c.bits}-bit ${c.aifc ?? 'AIFF'}`;
    expect(out, label).not.toBeNull();
    expect(out!.sampleRate).toBe(44100);
    expect(out!.channels).toHaveLength(2);
    expect(out!.channels[0]!.length).toBe(22050);
    // sine at amplitude 0.5 has an RMS of about 0.354
    expect(rms(out!.channels[0]!), label).toBeGreaterThan(0.33);
    expect(rms(out!.channels[0]!), label).toBeLessThan(0.38);
  }
});

test('the values match the source samples, with the sign and byte order right', () => {
  const be = parseAiff(ab(aiff({ channels: 1, rate: 8000, seconds: 0.1, bits: 16 })))!;
  const le = parseAiff(ab(aiff({ channels: 1, rate: 8000, seconds: 0.1, bits: 16, aifc: 'sowt' })))!;
  const f = parseAiff(ab(aiff({ channels: 1, rate: 8000, seconds: 0.1, bits: 32, aifc: 'fl32' })))!;
  for (let i = 0; i < 800; i += 37) {
    const x = Math.sin((2 * Math.PI * 440 * i) / 8000) * 0.5;
    expect(be.channels[0]![i]).toBeCloseTo(x, 3);
    expect(le.channels[0]![i]).toBeCloseTo(x, 3);
    expect(f.channels[0]![i]).toBeCloseTo(x, 5);
  }
});

test('an odd-length chunk before COMM is padded, and the SSND offset is skipped', () => {
  const plain = parseAiff(ab(aiff({ channels: 1, rate: 8000, seconds: 0.1, bits: 16 })))!;
  const padded = parseAiff(ab(aiff({ channels: 1, rate: 8000, seconds: 0.1, bits: 16, oddChunk: true, offset: 6 })));
  expect(padded).not.toBeNull();
  expect(padded!.channels[0]).toEqual(plain.channels[0]);
});

test('other compression types and damaged files are refused, never turned into noise', () => {
  const good = aiff({ channels: 2, rate: 44100, seconds: 0.2, bits: 16 });
  expect(parseAiff(ab(aiff({ channels: 2, rate: 44100, seconds: 0.2, bits: 16, aifc: 'ulaw' })))).toBeNull();
  expect(parseAiff(ab(Buffer.from('RIFF....WAVE')))).toBeNull();
  expect(parseAiff(ab(good.subarray(0, 20)))).toBeNull(); // cut inside COMM
  expect(parseAiff(ab(good.subarray(0, 12)))).toBeNull(); // no chunks
  expect(parseAiff(ab(good.subarray(0, 50)))).toBeNull(); // SSND header but no samples
  const zeroRate = Buffer.from(good);
  zeroRate.fill(0, 20, 30);
  expect(parseAiff(ab(zeroRate))).toBeNull();
  const wrongBits = Buffer.from(good);
  wrongBits.writeUInt16BE(12, 12 + 8 + 6);
  expect(parseAiff(ab(wrongBits))).toBeNull();
  const hugeOffset = Buffer.from(good);
  hugeOffset.writeUInt32BE(0x7fffffff, 12 + 8 + 18 + 8);
  expect(parseAiff(ab(hugeOffset))).toBeNull();
});

test('a file cut short plays as far as it goes', () => {
  const good = aiff({ channels: 2, rate: 44100, seconds: 1, bits: 16 });
  const out = parseAiff(ab(good.subarray(0, good.length - 4 * 20000)))!;
  expect(out.channels[0]!.length).toBe(44100 - 20000);
});
