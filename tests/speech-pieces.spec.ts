// @webkit-project
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cutPoints } from '../src/lib/captions';
import { piecesOf, type Piece } from '../src/lib/speech-pieces';

/** Cutting a recording into pieces a chunk at a time must find the same cut points as cutting the whole array did (`cutPoints`). */
const RATE = 16000;

/** The 16-bit mono samples of a WAV file. */
function wavSamples(path: string): Float32Array {
  const buf = readFileSync(fileURLToPath(new URL(path, import.meta.url)));
  const at = buf.indexOf('data', 12, 'latin1');
  const n = buf.readUInt32LE(at + 4) >> 1;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = buf.readInt16LE(at + 8 + i * 2) / 32768;
  return out;
}

async function* inChunks(samples: Float32Array, size: number) {
  for (let i = 0; i < samples.length; i += size) yield samples.subarray(i, Math.min(samples.length, i + size));
}

async function pieces(samples: Float32Array, size: number): Promise<Piece[]> {
  const out: Piece[] = [];
  for await (const p of piecesOf(inChunks(samples, size), RATE)) out.push(p);
  return out;
}

test.describe('a recording cut a chunk at a time', () => {
  const jfk = wavSamples('./fixtures/static/jfk.wav');

  test('a short file (jfk.wav) is one piece: no cut points, all its samples', async () => {
    expect(cutPoints(jfk, RATE)).toEqual([]);
    for (const size of [jfk.length, 16000, 4096, 777]) {
      const got = await pieces(jfk, size);
      expect(got).toHaveLength(1);
      expect(got[0]!.from).toBe(0);
      expect(got[0]!.samples.length).toBe(jfk.length);
      expect(got[0]!.samples).toEqual(jfk);
    }
  });

  test('a longer recording of the same speech is cut where cutPoints cut it, however the chunks fall', async () => {
    const long = new Float32Array(jfk.length * 7);
    for (let i = 0; i < 7; i++) long.set(jfk, i * jfk.length);
    const cuts = cutPoints(long, RATE);
    expect(cuts.length).toBeGreaterThan(0);
    for (const size of [long.length, 48000, 16000, 5000, 1234]) {
      const got = await pieces(long, size);
      expect(got.map((p) => p.from)).toEqual([0, ...cuts]);
      expect(got.map((p) => p.samples.length)).toEqual([...cuts, long.length].map((c, i) => c - (i ? cuts[i - 1]! : 0)));
      const joined = new Float32Array(long.length);
      for (const p of got) joined.set(p.samples, p.from);
      expect(joined).toEqual(long);
    }
  });
});
