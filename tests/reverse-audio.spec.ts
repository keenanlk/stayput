import { test, expect, type Page } from '@playwright/test';

const RATE = 44100;
const SECONDS = 1.5;
const N = Math.round(RATE * SECONDS);

/** A stereo 16-bit WAV with asymmetric envelopes: left is an 880 Hz tone that fades out, right a 440 Hz tone that swells in, so the order of every sample is unambiguous. */
function makeWav() {
  const buf = Buffer.alloc(44 + N * 4);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + N * 4, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(N * 4, 40);
  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i < N; i++) {
    const l = Math.round(Math.sin((2 * Math.PI * 880 * i) / RATE) * 24000 * (1 - i / N) ** 2);
    const r = Math.round(Math.sin((2 * Math.PI * 440 * i) / RATE) * 24000 * (i / N) ** 2);
    left.push(l);
    right.push(r);
    buf.writeInt16LE(l, 44 + i * 4);
    buf.writeInt16LE(r, 46 + i * 4);
  }
  return { buf, left, right };
}

async function run(page: Page, url: string, name: string, buffer: Buffer, pick?: (page: Page) => Promise<void>) {
  const sent: string[] = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET' && r.method() !== 'HEAD') sent.push(r.postData() ?? '');
  });
  await page.goto(url);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  if (pick) await pick(page);
  await page.locator('#file-input').setInputFiles({ name, mimeType: 'audio/wav', buffer });
  const download = page.waitForEvent('download', { timeout: 30_000 });
  await page.locator('#run').click();
  const got = await download;
  const chunks: Buffer[] = [];
  for await (const c of await got.createReadStream()) chunks.push(c as Buffer);
  // Nothing but the small usage ping may leave the page, and none of it holds the audio.
  for (const body of sent) {
    expect(body.length).toBeLessThan(2048);
    expect(body).not.toContain('RIFF');
    expect(body).not.toContain(name);
  }
  return { filename: got.suggestedFilename(), bytes: Buffer.concat(chunks) };
}

/** Duration of an OGG Opus file from its OpusHead pre-skip and the last page's granule position. */
function oggOpusSeconds(b: Buffer) {
  const head = b.indexOf('OpusHead');
  const preSkip = b.readUInt16LE(head + 10);
  const last = b.lastIndexOf('OggS');
  const granule = Number(b.readBigUInt64LE(last + 6));
  return (granule - preSkip) / 48000;
}

/** Decoded left channel and the browser's rate, or null when this browser cannot decode OGG Opus. */
async function decodeLeft(page: Page, bytes: Buffer) {
  return page.evaluate(async (b64) => {
    const arr = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    try {
      const buf = await new OfflineAudioContext(2, 1, 48000).decodeAudioData(arr.buffer);
      return { rate: buf.sampleRate, left: Array.from(buf.getChannelData(0)), right: Array.from(buf.getChannelData(1)) };
    } catch {
      return null;
    }
  }, bytes.toString('base64'));
}

const rms = (a: ArrayLike<number>, from: number, to: number) => {
  let s = 0;
  for (let i = from; i < to; i++) s += a[i]! * a[i]!;
  return Math.sqrt(s / Math.max(1, to - from));
};

test.describe('Reverse audio', () => {
  test('WAV output is the input samples in reverse order, within one step', async ({ page }) => {
    const { buf, left, right } = makeWav();
    const out = await run(page, '/reverse-audio', 'ramp.wav', buf);
    expect(out.filename).toBe('ramp-reversed.wav');
    const wav = out.bytes;
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.readUInt32LE(24)).toBe(RATE);
    const frames = (wav.length - 44) / 4;
    expect(frames).toBe(N);
    let worst = 0;
    for (let i = 0; i < N; i++) {
      worst = Math.max(worst, Math.abs(wav.readInt16LE(44 + i * 4) - left[N - 1 - i]!), Math.abs(wav.readInt16LE(46 + i * 4) - right[N - 1 - i]!));
    }
    expect(worst).toBeLessThanOrEqual(1);
    // The left tone faded out; reversed, its loud part is at the end.
    const peak = (from: number, to: number) => {
      let m = 0;
      for (let i = from; i < to; i++) m = Math.max(m, Math.abs(wav.readInt16LE(44 + i * 4)));
      return m;
    };
    expect(peak(N - 4410, N)).toBeGreaterThan(peak(0, 4410) * 10);
  });

  test('OGG output is mirrored in loudness', async ({ page }) => {
    const { buf } = makeWav();
    const out = await run(page, '/tools/audio-reverser', 'swell.wav', buf, async (p) => {
      await p.locator('#format').selectOption('ogg');
    });
    expect(out.filename).toBe('swell-reversed.ogg');
    expect(out.bytes.toString('ascii', 0, 4)).toBe('OggS');
    expect(out.bytes.includes('OpusHead')).toBe(true);
    expect(Math.abs(oggOpusSeconds(out.bytes) - SECONDS)).toBeLessThan(0.1);
    const pcm = await decodeLeft(page, out.bytes);
    test.skip(!pcm, 'This browser cannot decode OGG Opus');
    // Right swelled towards the end, so reversed it is loud first; left faded out, so reversed it is loud last. Opus runs at 48 kHz.
    const { left, right } = pcm!;
    const half = Math.floor(right.length / 2);
    expect(rms(right, 0, half)).toBeGreaterThan(rms(right, half, right.length) * 2);
    expect(rms(left, half, left.length)).toBeGreaterThan(rms(left, 0, half) * 2);
  });
});

test.describe('WAV to OGG', () => {
  test('writes an OGG with Opus audio that has the right length and is not silent', async ({ page }) => {
    const { buf } = makeWav();
    const out = await run(page, '/wav-to-ogg', 'ramp.wav', buf);
    expect(out.filename).toBe('ramp.ogg');
    expect(out.bytes.toString('ascii', 0, 4)).toBe('OggS');
    expect(out.bytes.includes('OpusHead')).toBe(true);
    expect(out.bytes.includes('vorbis')).toBe(false);
    expect(Math.abs(oggOpusSeconds(out.bytes) - SECONDS)).toBeLessThan(0.1);
    expect(out.bytes.length).toBeLessThan(buf.length / 4);
    const pcm = await decodeLeft(page, out.bytes);
    if (pcm) {
      expect(Math.abs(pcm.left.length / pcm.rate - SECONDS)).toBeLessThan(0.1);
      expect(rms(pcm.right, 0, pcm.right.length)).toBeGreaterThan(0.02);
    }
  });
});
