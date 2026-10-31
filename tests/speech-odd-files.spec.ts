// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Recordings whose container says something odd about the sound. The speech worker is a stand-in, so these run
// in WebKit too: what is under test is how the sound is read and what a failure is called.
const SPEECH_MOV = readFileSync(fileURLToPath(new URL('./fixtures/static/speech.mov', import.meta.url)));

/** Every box of a type, as the offset of its size field. */
function boxes(buf: Buffer, type: string): number[] {
  const out: number[] = [];
  for (let i = 4; i < buf.length - 4; i++) if (buf.toString('latin1', i, i + 4) === type) out.push(i - 4);
  return out;
}

/** The clip with the picture track's sample durations set to a huge value: the sound is fine, but the container's own duration is absurd. */
function absurdDuration(): Buffer {
  const b = Buffer.from(SPEECH_MOV);
  for (const trak of boxes(b, 'trak')) {
    const end = trak + b.readUInt32BE(trak);
    const handler = b.toString('latin1', b.indexOf('hdlr', trak) + 12, b.indexOf('hdlr', trak) + 16);
    if (handler !== 'vide') continue;
    const stts = b.indexOf('stts', trak);
    if (stts > 0 && stts < end) b.writeUInt32BE(0x7fffffff, stts + 16);
  }
  return b;
}

async function stubSpeech(page: Page) {
  await page.addInitScript(() => {
    const Real = window.Worker;
    class FakeWorker extends EventTarget {
      postMessage(msg: { id: number }) {
        setTimeout(() => this.dispatchEvent(new MessageEvent('message', { data: { id: msg.id, type: 'result', chunks: [{ start: 0, end: 1.5, text: 'Hello from the park' }], language: 'en' } })), 10);
      }
      terminate() {}
    }
    (window as unknown as { Worker: unknown }).Worker = function (url: string | URL, opts?: WorkerOptions) {
      return /transcribe/.test(String(url)) ? new FakeWorker() : new Real(url, opts);
    };
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
  });
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const a=JSON.parse(sessionStorage.getItem('__ev')||'[]');a.push({n,d});sessionStorage.setItem('__ev',JSON.stringify(a));}};`,
    }),
  );
}

const lastRun = (page: Page) =>
  page.evaluate(() => (JSON.parse(sessionStorage.getItem('__ev') || '[]') as { n: string; d: Record<string, string> }[]).filter((e) => e.n === 'tool_run').at(-1)?.d);

async function transcribe(page: Page, buffer: Buffer, name = 'clip.mov') {
  await stubSpeech(page);
  await page.goto('/tools/transcribe');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles({ name, mimeType: 'video/quicktime', buffer });
  await page.locator('#run').click();
}

test('a recording whose container claims an absurd duration is still read', async ({ page }) => {
  await transcribe(page, absurdDuration());
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 60_000 });
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  expect((await lastRun(page))?.outcome).toBe('ok');
});

// A phone cannot always allocate what an absurd duration asks for; the run must not be called out of memory, or
// fail, for a size that nothing in the file needs.
test('a duration the device cannot allocate is not an out-of-memory failure', async ({ page }) => {
  await page.addInitScript(() => {
    const Real = Float32Array;
    (window as unknown as { Float32Array: unknown }).Float32Array = new Proxy(Real, {
      construct(target, args) {
        if (typeof args[0] === 'number' && args[0] > 2 ** 28) throw new RangeError('Array buffer allocation failed');
        return Reflect.construct(target, args);
      },
    });
  });
  await transcribe(page, absurdDuration());
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 60_000 });
  expect((await lastRun(page))?.outcome).toBe('ok');
});

// When nothing can read the sound, the run records what failed underneath, not one class for every cause.
test('a recording the device cannot read is recorded under the error that stopped it', async ({ page }) => {
  await page.addInitScript(() => {
    const real = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = function () {
      return this instanceof File && this.name === 'clip.mp3' ? Promise.reject(new DOMException('The requested file could not be read', 'NotReadableError')) : real.call(this);
    };
    delete (window as unknown as { AudioDecoder?: unknown }).AudioDecoder;
  });
  const mp3 = readFileSync(fileURLToPath(new URL('./fixtures/static/song.mp3', import.meta.url)));
  await transcribe(page, mp3, 'clip.mp3');
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 60_000 });
  await expect(page.locator('#error')).toContainText(/could not be read/);
  const run = await lastRun(page);
  expect(run?.outcome).toBe('error');
  expect(run?.error_class).toMatch(/^NotReadable(Probe|MidRead)$/);
});

// A video with a picture and no sound track at all is told apart from a sound that could not be read.
test('a video with no sound track is recorded as NoSoundTrack', async ({ page }) => {
  await page.addInitScript(() => delete (window as unknown as { AudioDecoder?: unknown }).AudioDecoder);
  const silent = readFileSync(fileURLToPath(new URL('./fixtures/static/clip.webm', import.meta.url)));
  await transcribe(page, silent, 'clip.webm');
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 60_000 });
  expect((await lastRun(page))?.error_class).toBe('NoSoundTrack');
});

/** A silent mono 16-bit WAV of the given length: big enough for its claimed duration, so the early refusal believes it. */
function silentWav(seconds: number, rate = 8000): Buffer {
  const data = seconds * rate * 2;
  const b = Buffer.alloc(44 + data);
  b.write('RIFF', 0, 'latin1');
  b.writeUInt32LE(36 + data, 4);
  b.write('WAVEfmt ', 8, 'latin1');
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36, 'latin1');
  b.writeUInt32LE(data, 40);
  return b;
}

// The refusal's message says "memory"; it must reach the person as written (with the minutes), not be replaced by
// the generic out-of-memory text, and the run must record RecordingTooLong.
for (const path of ['/tools/transcribe', '/video-to-subtitles', '/auto-caption-video']) {
  test(`${path}: a recording over the device's budget is refused as RecordingTooLong, not as out of memory`, async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => 1, configurable: true }));
    await stubSpeech(page);
    await page.goto(path);
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    await page.locator('#file-input').setInputFiles({ name: 'long.wav', mimeType: 'audio/wav', buffer: silentWav(25 * 60) });
    await page.locator('#run').click();
    await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 60_000 });
    await expect(page.locator('#error')).toContainText('about 25 minutes');
    await expect(page.locator('#error')).toContainText('Trim it or split it into parts');
    await expect(page.locator('#error')).not.toContainText('ran out of memory while writing captions');
    const run = await lastRun(page);
    expect(run?.outcome).toBe('error');
    expect(run?.error_class).toBe('RecordingTooLong');
  });
}

// Sound in codecs the browser's own decoder refuses: read by the page's decoders (AC-3 and E-AC-3 through the Dolby decoder, AMR through
// the 3GP build, Opus, FLAC and PCM through WebCodecs), and a format nothing reads is named UnsupportedSound.
const edge = (n: string) => fileURLToPath(new URL(`./fixtures/edge-cases/${n}`, import.meta.url));
const stat = (n: string) => fileURLToPath(new URL(`./fixtures/static/${n}`, import.meta.url));
// Safari before 26 has no AudioDecoder: Opus, FLAC and PCM may be named there rather than read.
const MAY_LACK = ['opus.mp4', 'flac.mkv', 'pcm.mov'];

test.describe('odd sound codecs on the caption tools', () => {
  test.setTimeout(150_000);
  const cases: [string, string][] = [
    ['ac3-51.mkv', edge('ac3-51.mkv')],
    ['eac3.mp4', edge('eac3.mp4')],
    ['pcm.mov', edge('pcm.mov')],
    ['opus.mp4', edge('opus.mp4')],
    ['flac.mkv', edge('flac.mkv')],
    ['mono-8k.wav', edge('mono-8k.wav')],
    ['amr-nb.amr', edge('amr-nb.amr')],
    ['mpeg4-amrnb.3gp', stat('mpeg4-amrnb.3gp')],
  ];
  for (const [name, path] of cases) {
    test(`${name} is read and the run ends ok`, async ({ page, browserName }) => {
      await transcribe(page, readFileSync(path), name);
      const lacks = browserName === 'webkit' && MAY_LACK.includes(name);
      await expect.poll(() => lastRun(page), { timeout: 120_000 }).toBeTruthy();
      const run = await lastRun(page);
      if (lacks && run?.outcome === 'error') expect(run.error_class).toBe('UnsupportedSound');
      else expect(run?.outcome).toBe('ok');
    });
  }

  test('a DTS sound is named UnsupportedSound, with its format, before any model request', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', "WebKit's Linux build carries a DTS decoder and reads the sound");
    const models: string[] = [];
    page.on('request', (r) => r.url().includes('/models/') && models.push(r.url()));
    await transcribe(page, readFileSync(edge('dts.mkv')), 'dts.mkv');
    await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 60_000 });
    await expect(page.locator('#error')).toContainText('DTS');
    expect((await lastRun(page))?.error_class).toBe('UnsupportedSound');
    expect(models).toEqual([]);
  });

  // The Safari-before-26 case: no AudioDecoder, and decodeAudioData does not read Opus in MP4.
  test('Opus in MP4 where the page has no AudioDecoder is UnsupportedSound before any model request', async ({ page }) => {
    const models: string[] = [];
    page.on('request', (r) => r.url().includes('/models/') && models.push(r.url()));
    await page.addInitScript(() => {
      delete (window as unknown as { AudioDecoder?: unknown }).AudioDecoder;
      BaseAudioContext.prototype.decodeAudioData = () => Promise.reject(new DOMException('Unable to decode audio data', 'EncodingError'));
    });
    await transcribe(page, readFileSync(edge('opus.mp4')), 'opus.mp4');
    await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 60_000 });
    await expect(page.locator('#error')).toContainText('Opus');
    expect((await lastRun(page))?.error_class).toBe('UnsupportedSound');
    expect(models).toEqual([]);
  });
});
