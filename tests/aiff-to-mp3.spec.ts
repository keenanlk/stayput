import { test, expect, type Page } from '@playwright/test';

/**
 * AIFF fixtures are built here, not committed: 1.5 s of a 440 Hz tone (left)
 * and 660 Hz (right), as plain AIFF or as AIFC ('NONE' big-endian, 'sowt'
 * little-endian), at 16 or 24 bits.
 */
function extended(rate: number): number[] {
  const exp = Math.floor(Math.log2(rate));
  const mant = BigInt(Math.round((rate / 2 ** exp) * 2 ** 63));
  const out = [(16383 + exp) >> 8, (16383 + exp) & 0xff];
  for (let i = 7; i >= 0; i--) out.push(Number((mant >> BigInt(i * 8)) & 0xffn));
  return out;
}

function aiff(opts: { channels: number; bits: 16 | 24; rate: number; seconds: number; aifc?: 'NONE' | 'sowt' }): Buffer {
  const { channels, bits, rate, seconds, aifc } = opts;
  const frames = Math.round(rate * seconds);
  const bytes = bits / 8;
  const little = aifc === 'sowt';
  const data = Buffer.alloc(frames * channels * bytes);
  const max = 2 ** (bits - 1) - 1;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const v = Math.round(Math.sin((2 * Math.PI * (440 + c * 220) * i) / rate) * 0.5 * max);
      const at = (i * channels + c) * bytes;
      for (let b = 0; b < bytes; b++) {
        const shift = little ? b * 8 : (bytes - 1 - b) * 8;
        data[at + b] = (v >> shift) & 0xff;
      }
    }
  }
  const comm = Buffer.alloc(aifc ? 18 + 4 + 2 : 18);
  comm.writeUInt16BE(channels, 0);
  comm.writeUInt32BE(frames, 2);
  comm.writeUInt16BE(bits, 6);
  Buffer.from(extended(rate)).copy(comm, 8);
  if (aifc) {
    comm.write(aifc, 18, 'latin1');
    comm.writeUInt8(0, 22); // empty pascal string, padded to even length
  }
  const chunk = (id: string, body: Buffer) => {
    const head = Buffer.alloc(8);
    head.write(id, 0, 'latin1');
    head.writeUInt32BE(body.length, 4);
    return Buffer.concat([head, body, body.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
  };
  const ssnd = Buffer.concat([Buffer.alloc(8), data]);
  const parts = [Buffer.from(aifc ? 'AIFC' : 'AIFF', 'latin1')];
  if (aifc) {
    const fver = Buffer.alloc(4);
    fver.writeUInt32BE(0xa2805140, 0);
    parts.push(chunk('FVER', fver));
  }
  parts.push(chunk('COMM', comm), chunk('SSND', ssnd));
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(8);
  head.write('FORM', 0, 'latin1');
  head.writeUInt32BE(body.length, 4);
  return Buffer.concat([head, body]);
}

const CASES = [
  { name: 'stereo16.aiff', file: aiff({ channels: 2, bits: 16, rate: 44100, seconds: 1.5 }), seconds: 1.5, channels: 2 },
  { name: 'mono16-48k.aif', file: aiff({ channels: 1, bits: 16, rate: 48000, seconds: 1.5 }), seconds: 1.5, channels: 1 },
  { name: 'stereo24.aiff', file: aiff({ channels: 2, bits: 24, rate: 44100, seconds: 1.5 }), seconds: 1.5, channels: 2 },
  { name: 'sowt.aifc', file: aiff({ channels: 2, bits: 16, rate: 44100, seconds: 1.5, aifc: 'sowt' }), seconds: 1.5, channels: 2 },
  { name: 'none.aifc', file: aiff({ channels: 2, bits: 16, rate: 44100, seconds: 1.5, aifc: 'NONE' }), seconds: 1.5, channels: 2 },
];

async function convert(page: Page, name: string, buffer: Buffer) {
  await page.goto('/aiff-to-mp3');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#format')).toHaveValue('mp3');
  await page.locator('#file-input').setInputFiles({ name, mimeType: 'audio/aiff', buffer });
  const download = page.waitForEvent('download', { timeout: 30_000 }).catch(() => null);
  await page.locator('#run').click();
  const got = await Promise.race([download, page.locator('#error.is-active').waitFor({ timeout: 30_000 }).then(() => null)]);
  if (!got) return { error: await page.locator('#error').innerText() };
  const stream = await got.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return { filename: got.suggestedFilename(), bytes: Buffer.concat(chunks) };
}

async function mp3Info(page: Page, bytes: Buffer) {
  return page.evaluate(async (b64) => {
    const bin = atob(b64);
    const arr = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const buf = await new OfflineAudioContext(2, 1, 44100).decodeAudioData(arr.buffer);
    const d = buf.getChannelData(0);
    let sum = 0;
    for (let i = 0; i < d.length; i++) sum += d[i]! * d[i]!;
    return { duration: buf.duration, rms: Math.sqrt(sum / d.length) };
  }, bytes.toString('base64'));
}

test.describe('AIFF to MP3', () => {
  for (const c of CASES) {
    test(`${c.name} becomes an MP3 that plays at the right length`, async ({ page }) => {
      const out = await convert(page, c.name, c.file);
      expect('error' in out ? out.error : '', 'page reported a read error').toBe('');
      if ('error' in out) return;
      expect(out.filename).toBe(c.name.replace(/\.(aiff?|aifc)$/, '.mp3'));
      expect(out.bytes[0]).toBe(0xff);
      expect(out.bytes[1]! & 0xe0).toBe(0xe0);
      const info = await mp3Info(page, out.bytes);
      expect(info.duration).toBeGreaterThan(c.seconds - 0.15);
      expect(info.duration).toBeLessThan(c.seconds + 0.15);
      expect(info.rms).toBeGreaterThan(0.05);
    });
  }
});
