import { createWriteStream, mkdtempSync, writeFileSync } from 'node:fs';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDeflate, crc32 } from 'node:zlib';

/** Inputs too big to commit, made when a test needs them. Each call writes into a fresh temp folder. */
const folder = () => mkdtempSync(join(tmpdir(), 'stayput-edge-'));

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)) >>> 0, 8 + data.length);
  return out;
}

/** A flat grey 8-bit PNG of any size: the rows are one repeated line, so the file is a few hundred KB however large the picture. */
export async function bigPng(width: number, height: number, name: string): Promise<string> {
  const path = join(folder(), name);
  const head = Buffer.alloc(13);
  head.writeUInt32BE(width, 0);
  head.writeUInt32BE(height, 4);
  head[8] = 8; // bit depth
  head[9] = 0; // greyscale
  const out = createWriteStream(path);
  out.write(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', head)]));
  const deflate = createDeflate({ level: 1 });
  const parts: Buffer[] = [];
  deflate.on('data', (d: Buffer) => parts.push(d));
  const row = Buffer.alloc(width + 1, 0x80);
  for (let y = 0; y < height; y++) {
    if (!deflate.write(row)) await once(deflate, 'drain');
  }
  deflate.end();
  await once(deflate, 'end');
  out.write(chunk('IDAT', Buffer.concat(parts)));
  out.write(chunk('IEND', Buffer.alloc(0)));
  out.end();
  await once(out, 'close');
  return path;
}

/** A mono 16-bit PCM WAV of `seconds` of a quiet tone. */
export function longWav(seconds: number, sampleRate: number, name: string): string {
  const path = join(folder(), name);
  const samples = Math.floor(seconds * sampleRate);
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round(Math.sin((i / sampleRate) * 2 * Math.PI * 440) * 3000), i * 2);
  const head = Buffer.alloc(44);
  head.write('RIFF', 0, 'latin1');
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVEfmt ', 8, 'latin1');
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(sampleRate, 24);
  head.writeUInt32LE(sampleRate * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36, 'latin1');
  head.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([head, data]));
  return path;
}
