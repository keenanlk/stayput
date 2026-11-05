import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { createWriteStream, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Long recordings on the speech pages. The sound is decoded and cut a stretch at a time, so the memory a run needs
 * depends on the size of a piece (28 s), not on the length of the recording: a 2-hour recording goes through on a
 * computer with 4 GB, and a phone is no longer held to the 32 minutes the whole-recording samples used to allow.
 * The speech worker is a stand-in that counts the pieces it is handed; the recordings are generated here.
 */
const PIECE_MAX = 28 * 16000;

type Win = { __pieces: number; __longest: number; __largest: number };

async function stub(page: Page, opts: { phone?: boolean; memory?: number; noDecoder?: boolean } = {}) {
  await page.addInitScript((o) => {
    const w = window as unknown as Win;
    w.__pieces = 0;
    w.__longest = 0;
    w.__largest = 0;
    if (o.memory !== undefined) Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => o.memory, configurable: true });
    if (o.phone) {
      // Safari says nothing about its memory.
      Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => undefined, configurable: true });
      Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1', configurable: true });
      Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5, configurable: true });
    }
    if (o.noDecoder) delete (window as unknown as { AudioDecoder?: unknown }).AudioDecoder;
    // The biggest array the page asks for: a run that holds the whole recording asks for tens of millions of samples.
    const Real = Float32Array;
    (window as unknown as { Float32Array: unknown }).Float32Array = new Proxy(Real, {
      construct(target, args) {
        if (typeof args[0] === 'number') w.__largest = Math.max(w.__largest, args[0]);
        return Reflect.construct(target, args);
      },
    });
    const RealWorker = window.Worker;
    class FakeWorker extends EventTarget {
      postMessage(msg: { id: number; audio: Float32Array }) {
        w.__pieces++;
        w.__longest = Math.max(w.__longest, msg.audio.length);
        const start = (w.__pieces - 1) * 0.1;
        setTimeout(() => this.dispatchEvent(new MessageEvent('message', { data: { id: msg.id, type: 'result', chunks: [{ start, end: start + 1, text: `Piece ${w.__pieces}` }], language: 'en' } })), 2);
      }
      terminate() {}
    }
    (window as unknown as { Worker: unknown }).Worker = function (url: string | URL, opts?: WorkerOptions) {
      return /transcribe/.test(String(url)) ? new FakeWorker() : new RealWorker(url, opts);
    };
    Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
  }, opts);
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const a=JSON.parse(sessionStorage.getItem('__ev')||'[]');a.push({n,d});sessionStorage.setItem('__ev',JSON.stringify(a));}};`,
    }),
  );
}

const lastRun = (page: Page) =>
  page.evaluate(() => (JSON.parse(sessionStorage.getItem('__ev') || '[]') as { n: string; d: Record<string, string> }[]).filter((e) => e.n === 'tool_run').at(-1)?.d);

/**
 * A mono 8-bit 8 kHz WAV written to disk a second at a time: 3 seconds of a tone, 1 of silence, so there are pauses to cut at.
 * 2 hours is 58 MB.
 */
async function toneWav(path: string, minutes: number, rate = 8000): Promise<void> {
  const seconds = minutes * 60;
  const data = seconds * rate;
  const head = Buffer.alloc(44);
  head.write('RIFF', 0, 'latin1');
  head.writeUInt32LE(36 + data, 4);
  head.write('WAVEfmt ', 8, 'latin1');
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate, 28);
  head.writeUInt16LE(1, 32);
  head.writeUInt16LE(8, 34);
  head.write('data', 36, 'latin1');
  head.writeUInt32LE(data, 40);
  const tone = Buffer.alloc(rate * 3);
  for (let i = 0; i < tone.length; i++) tone[i] = 128 + Math.round(60 * Math.sin((2 * Math.PI * 300 * i) / rate));
  const gap = Buffer.alloc(rate, 128);
  const out = createWriteStream(path);
  const write = (b: Buffer) => new Promise<void>((done) => (out.write(b) ? done() : out.once('drain', () => done())));
  await write(head);
  for (let s = 0; s < seconds; s += 4) await write(Buffer.concat([tone, gap]).subarray(0, Math.min(4, seconds - s) * rate));
  await new Promise<void>((done) => out.end(done));
}

async function run(page: Page, path: string, file: string) {
  await page.goto(path);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(file);
  await page.locator('#run').click();
}

const win = (page: Page) => page.evaluate(() => window as unknown as Win).then(() => page.evaluate(() => ({ pieces: (window as unknown as Win).__pieces, longest: (window as unknown as Win).__longest, largest: (window as unknown as Win).__largest })));

test.describe('long recordings', () => {
  test.setTimeout(600_000);

  test('a 120-minute recording transcribes on a computer with 4 GB, a piece at a time', async ({ page }, info) => {
    const file = info.outputPath('two-hours.wav');
    await toneWav(file, 120);
    await stub(page, { memory: 4 });
    await run(page, '/tools/transcribe', file);
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 540_000 });
    await expect(page.locator('#error')).not.toHaveClass(/is-active/);
    const seen = await win(page);
    // 7,200 s in pieces of at most 28 s (and at least 18 s but for the last).
    expect(seen.pieces).toBeGreaterThanOrEqual(Math.ceil(7200 / 28));
    expect(seen.pieces).toBeLessThanOrEqual(Math.ceil(7200 / 18) + 1);
    expect(seen.longest).toBeLessThanOrEqual(PIECE_MAX);
    // Nothing the size of the recording (115 million samples at 16 kHz) was ever asked for.
    expect(seen.largest).toBeLessThan(16000 * 700);
    expect((await lastRun(page))?.outcome).toBe('ok');
    // The transcript runs to the end of the recording.
    await expect(page.locator('#results')).toContainText('2:00:00 of English speech');
  });

  for (const path of ['/tools/transcribe', '/video-to-subtitles', '/auto-caption-video']) {
    test(`${path}: on a phone, a recording past the old 32-minute budget transcribes instead of being refused`, async ({ page }, info) => {
      const file = info.outputPath('forty-minutes.wav');
      await toneWav(file, 40);
      await stub(page, { phone: true });
      await run(page, path, file);
      await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 300_000 });
      const seen = await win(page);
      expect(seen.pieces).toBeGreaterThanOrEqual(Math.ceil(2400 / 28));
      expect(seen.largest).toBeLessThan(16000 * 700);
      // The caption page goes on to redraw a video, which a sound file is not: what matters here is that the sound was read and spoken for.
      expect((await lastRun(page))?.error_class).not.toBe('RecordingTooLong');
      if (path !== '/auto-caption-video') expect((await lastRun(page))?.outcome).toBe('ok');
    });
  }

  test('a recording only a whole-file decode can read, on a phone, is refused at once with RecordingTooLong and no model is fetched', async ({ page }) => {
    const models: string[] = [];
    page.on('request', (r) => /\/models\//.test(r.url()) && models.push(r.url()));
    await stub(page, { phone: true, noDecoder: true });
    const opus = Buffer.from(readFileSync(fileURLToPath(new URL('./fixtures/edge-cases/opus.mp4', import.meta.url))));
    const stts = opus.indexOf('stts');
    const timescale = opus.readUInt32BE(opus.indexOf('mdhd') + 16);
    opus.writeUInt32BE(Math.ceil((45 * 60 * timescale) / opus.readUInt32BE(stts + 12)), stts + 16);
    const pad = Buffer.alloc(45 * 60 * 600);
    pad.writeUInt32BE(pad.length, 0);
    pad.write('free', 4, 'latin1');
    await page.goto('/tools/transcribe');
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    await page.locator('#file-input').setInputFiles({ name: 'long.mp4', mimeType: 'audio/mp4', buffer: Buffer.concat([opus, pad]) });
    await page.locator('#run').click();
    await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 60_000 });
    await expect(page.locator('#error')).toContainText('about 45 minutes');
    expect((await lastRun(page))?.error_class).toBe('RecordingTooLong');
    expect(models).toEqual([]);
    expect((await win(page)).pieces).toBe(0);
  });
});

// Real encoders: M4A (AAC) and MP3 recordings of 60, 120 and 180 minutes made with ffmpeg, which CI does not have (and its Chromium cannot decode AAC), so these run on a machine that has both.
const hasFfmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

test.describe('long recordings in other formats', () => {
  test.skip(!hasFfmpeg || !!process.env.CI, 'needs ffmpeg and a browser that decodes AAC');
  test.setTimeout(900_000);
  for (const minutes of [60, 120, 180]) {
    for (const [ext, args] of [
      ['m4a', ['-c:a', 'aac', '-b:a', '24k']],
      ['mp3', ['-c:a', 'libmp3lame', '-b:a', '24k']],
    ] as const) {
      test(`${minutes} minutes of ${ext} transcribes on a computer with 4 GB`, async ({ page }, info: TestInfo) => {
        const file = info.outputPath(`long.${ext}`);
        // Speech-like bursts: a 300 Hz tone gated on for 3 s of every 4.
        execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `sine=frequency=300:sample_rate=22050:duration=${minutes * 60}`, '-af', "volume='if(lt(mod(t,4),3),1,0)':eval=frame", '-ac', '1', ...args, file], { timeout: 600_000 });
        expect(statSync(file).size).toBeGreaterThan(1_000_000);
        await stub(page, { memory: 4 });
        await run(page, '/tools/transcribe', file);
        await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 840_000 });
        const seen = await win(page);
        expect(seen.pieces).toBeGreaterThanOrEqual(Math.ceil((minutes * 60 - 5) / 28));
        expect(seen.largest).toBeLessThan(16000 * 700);
        expect((await lastRun(page))?.outcome).toBe('ok');
      });
    }
  }
});
