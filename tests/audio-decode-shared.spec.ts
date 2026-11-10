// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * One error class, every sound tool: a video with no sound track, sound in a codec the browser lacks, a file cut short, a decoder that
 * hangs or refuses once, and a recording too long for a phone. Each case ends in a result or in the named class for its cause, and a video
 * with no sound is refused when it is added, never counted as a run. Files are made here at test time (ffmpeg, or a few lines of JS);
 * the small committed edge-case fixtures are reused. SHARED_RECORD=<file> appends one JSON line per case (case, browser, outcome), so
 * the same spec can run on main and on a branch for a before/after table; the assertions are the branch's.
 */
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const edge = (n: string) => here(`./fixtures/edge-cases/${n}`);
const dir = join(process.env.SHARED_FIXTURES ?? join(tmpdir(), 'stayput-audio-decode-shared'), `w${process.env.TEST_WORKER_INDEX ?? '0'}`);
const fx = (name: string) => join(dir, name);
const ff = (...args: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'pipe' });

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1';
/** Names a failed run can end under for sound that cannot be read; anything else is a miss. */
const DECODE_CLASSES = ['AudioDecodeError', 'NoSoundTrack', 'UnsupportedSound', 'AudioDamaged', 'NotAnAudioFile', 'UnsupportedAudioCodec', 'AudioCutShort', 'DecodeTimeout', 'AudioOutOfMemory', 'AudioTooLong'];

test.beforeAll(() => {
  mkdirSync(dir, { recursive: true });
  const picture = ['-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=10:duration=2'];
  // No sound track at all: an MP4, a MOV and a WebM.
  ff(...picture, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', fx('silent-video.mp4'));
  ff(...picture, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', fx('silent-video.mov'));
  ff(...picture, '-c:v', 'libvpx', '-an', fx('silent-video.webm'));
  // Sound the browser may lack: AIFF (Chromium cannot decode it).
  ff('-f', 'lavfi', '-i', 'sine=frequency=330:duration=2:sample_rate=22050', '-c:a', 'pcm_s16be', fx('tune.aiff'));
  // A sound track whose index lists no samples: the sound trak's sample count and time-to-sample entries set to zero.
  const b = Buffer.from(readFileSync(edge('good.mp4')));
  for (let i = 0; (i = b.indexOf('trak', i + 1)) > 0; ) {
    const start = i - 4;
    const end = start + b.readUInt32BE(start);
    const h = b.indexOf('hdlr', start);
    if (h < 0 || h > end || b.toString('latin1', h + 12, h + 16) !== 'soun') continue;
    b.writeUInt32BE(0, b.indexOf('stsz', start) + 12);
    b.writeUInt32BE(0, b.indexOf('stts', start) + 8);
  }
  writeFileSync(fx('zero-length-track.mp4'), b);
  // 16 minutes of an 8 kHz stereo WAV: 30 MB on disk, 340 MB once decoded at 44.1 kHz.
  ff('-f', 'lavfi', '-i', 'sine=frequency=300:duration=960:sample_rate=8000', '-ac', '2', fx('long-16min.wav'));
  // An MP3 cut off part-way.
  const mp3 = readFileSync(edge('good.mp3'));
  writeFileSync(fx('cut.mp3'), mp3.subarray(0, Math.floor(mp3.length * 0.5)));
  copyFileSync(edge('good.mp3'), fx('good.mp3'));
});

type Ev = { n: string; d: Record<string, string> };
const events = (page: Page): Promise<Ev[]> => page.evaluate(() => JSON.parse(sessionStorage.getItem('__ev') || '[]'));
const runs = async (page: Page) => (await events(page)).filter((e) => e.n === 'tool_run');

async function open(page: Page, path: string, init?: () => void) {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  if (init) await page.addInitScript(init);
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const a=JSON.parse(sessionStorage.getItem('__ev')||'[]');a.push({n,d});sessionStorage.setItem('__ev',JSON.stringify(a));}};`,
    }),
  );
  await page.goto(path);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
}

/** Adds a file and waits for the add-time check to finish: Run is either on, or off with the reason in the hint. */
async function add(page: Page, file: string | { name: string; mimeType: string; buffer: Buffer }) {
  await page.locator('#file-input').setInputFiles(file);
  await expect(page.locator('#file-list .file-item').first()).toBeVisible();
  await expect.poll(() => page.locator('#run').isDisabled().then(async (off) => !off || !!(await page.locator('#run-hint').textContent())?.trim()), { timeout: 20_000 }).toBe(true);
}

type Outcome = { state: 'ok' | 'error'; cls?: string };

/** Presses Run and waits for the result or the error; the class is the last tool_run's. */
async function run(page: Page, timeout = 120_000): Promise<Outcome> {
  await page.locator('#run').click();
  await expect(page.locator('#results.is-active, #error.is-active').first()).toBeVisible({ timeout });
  const last = (await runs(page)).at(-1);
  return last?.d.outcome === 'error' ? { state: 'error', cls: last.d.error_class } : { state: 'ok' };
}

const record = (name: string, browserName: string, o: unknown) => {
  if (process.env.SHARED_RECORD) appendFileSync(process.env.SHARED_RECORD, JSON.stringify({ case: name, browser: browserName, ...(o as object) }) + '\n');
};

// A tool for each decode path: decodeAudio (video-to-mp3), audio-split-source (audio-splitter), decodePcmSliced (remove-noise),
// decodeAudio plus the early guard (mp3-to-midi), speech-audio (transcribe, add-subtitles-to-video), decodePcm (audio-to-video).
const NO_SOUND_TOOLS = ['video-to-mp3', 'audio-splitter', 'remove-noise', 'mp3-to-midi', 'transcribe', 'add-subtitles-to-video'];

test.describe('a video with no sound track is refused when it is added', () => {
  for (const tool of NO_SOUND_TOOLS) {
    for (const ext of ['mp4', 'mov', 'webm']) {
      test(`${tool}: .${ext}`, async ({ page, browserName }) => {
        await open(page, `/tools/${tool}`);
        await add(page, fx(`silent-video.${ext}`));
        await expect(page.locator('#run')).toBeDisabled();
        await expect(page.locator('#run-hint')).toHaveAttribute('data-problem', 'NoSoundTrack');
        const text = (await page.locator('#run-hint').textContent()) ?? '';
        if (tool === 'remove-noise') expect(text).toContain('has no sound to clean');
        else if (tool === 'add-subtitles-to-video') expect(text).toContain('SRT, VTT or ASS');
        else expect(text).toContain('has no sound track, so this tool has nothing to work on. Use a video or recording that has sound instead.');
        // Not a run: nothing was pressed, nothing is recorded.
        expect(await runs(page)).toEqual([]);
        record(`no-sound ${tool} .${ext}`, browserName, { refusedAtAdd: true });
      });
    }
  }

  test('add-subtitles-to-video: a subtitle file beside it lifts the refusal', async ({ page }) => {
    await open(page, '/tools/add-subtitles-to-video');
    await add(page, fx('silent-video.mp4'));
    await expect(page.locator('#run')).toBeDisabled();
    await page.locator('#file-input').setInputFiles({ name: 'words.srt', mimeType: 'application/x-subrip', buffer: Buffer.from('1\n00:00:00,000 --> 00:00:01,000\nHello\n') });
    await expect(page.locator('#run')).toBeEnabled();
    expect(await runs(page)).toEqual([]);
  });

  test('a video that has sound is not refused', async ({ page }) => {
    await open(page, '/tools/video-to-mp3');
    await add(page, edge('good.mp4'));
    await expect(page.locator('#run')).toBeEnabled();
  });
});

test.describe('a file cut short ends under its own class', () => {
  for (const [label, file] of [
    ['an MP4 with its moov atom cut off', edge('truncated-moov-end.mp4')],
    ['a zero-length sound track', 'zero-length-track.mp4'],
  ] as const) {
    test(label, async ({ page, browserName }) => {
      await open(page, '/tools/video-to-mp3');
      await add(page, file.includes('/') ? file : fx(file));
      // Not a video without sound, so Run is on; the run ends under its own class.
      await expect(page.locator('#run')).toBeEnabled();
      const o = await run(page, 60_000);
      expect(o).toEqual({ state: 'error', cls: 'AudioCutShort' });
      record(`cut short: ${label}`, browserName, o);
    });
  }

  test('an MP3 cut off part-way, and a WAV whose header lies, finish or end under a named class', async ({ page, browserName }) => {
    for (const [name, file] of [['cut.mp3', fx('cut.mp3')], ['wav-length-lies.wav', edge('wav-length-lies.wav')]] as const) {
      await open(page, '/tools/video-to-mp3');
      await add(page, file);
      const o = await run(page, 60_000);
      if (o.state === 'error') expect(DECODE_CLASSES, name).toContain(o.cls);
      record(`damaged ${name}`, browserName, o);
      await page.reload();
    }
  });

  test('a decoder that never answers ends as DecodeTimeout, not a page that waits', async ({ page, browserName }) => {
    await open(page, '/tools/video-to-mp3', () => {
      (window as unknown as { __decodeBudgetMs: number }).__decodeBudgetMs = 400;
      BaseAudioContext.prototype.decodeAudioData = () => new Promise(() => {});
    });
    await add(page, fx('good.mp3'));
    const t = Date.now();
    const o = await run(page, 30_000);
    expect(o).toEqual({ state: 'error', cls: 'DecodeTimeout' });
    expect(Date.now() - t).toBeLessThan(25_000);
    record('decoder hangs', browserName, o);
  });
});

test.describe('sound in a codec the browser may lack', () => {
  const cases: [string, string][] = [
    ['Opus in MP4', edge('opus.mp4')],
    ['ALAC M4A', edge('alac.m4a')],
    ['AMR', edge('amr-nb.amr')],
    ['AC-3 in MKV', edge('ac3-51.mkv')],
    ['FLAC in MKV', edge('flac.mkv')],
    ['PCM in MOV', edge('pcm.mov')],
  ];
  for (const [label, file] of cases) {
    test(`${label}: the fallbacks decode it, or the run ends under a named class`, async ({ page, browserName }) => {
      await open(page, '/tools/video-to-mp3');
      await add(page, file);
      const o = await run(page);
      if (o.state === 'error') expect(['UnsupportedAudioCodec', 'AudioDecodeError', 'AudioCutShort'], label).toContain(o.cls);
      record(`codec ${label}`, browserName, o);
    });
  }

  test('AIFF is decoded in every browser (Chromium by the page, WebKit by the browser)', async ({ page, browserName }) => {
    await open(page, '/tools/video-to-mp3');
    await add(page, fx('tune.aiff'));
    const o = await run(page);
    expect(o).toEqual({ state: 'ok' });
    record('aiff', browserName, o);
  });

  test('audio to video takes the same order: Opus and AIFF are decoded by decodePcm too', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit' && !!process.env.CI, 'Linux CI WebKit stalls on in-page video encodes');
    await open(page, '/tools/audio-to-video');
    await add(page, fx('tune.aiff'));
    const o = await run(page, 120_000);
    if (o.state === 'error') expect(['UnsupportedAudioCodec', 'AudioDecodeError', 'AudioCutShort', 'EncoderStall', 'AudioVideoFailed']).toContain(o.cls);
    record('audio-to-video aiff', browserName, o);
  });
});

test.describe('a browser that refuses once', () => {
  test('a first decodeAudioData that is refused and a second that works: the run succeeds', async ({ page, browserName }) => {
    await open(page, '/tools/video-to-mp3', () => {
      const real = BaseAudioContext.prototype.decodeAudioData;
      let calls = 0;
      (window as unknown as { __decodeCalls: () => number }).__decodeCalls = () => calls;
      BaseAudioContext.prototype.decodeAudioData = function (this: BaseAudioContext, data: ArrayBuffer) {
        return ++calls === 1 ? Promise.reject(new DOMException('Unable to decode audio data', 'EncodingError')) : real.call(this, data);
      } as typeof real;
    });
    await add(page, fx('good.mp3'));
    const o = await run(page);
    expect(o).toEqual({ state: 'ok' });
    expect(await page.evaluate(() => (window as unknown as { __decodeCalls: () => number }).__decodeCalls())).toBeGreaterThanOrEqual(2);
    record('refused once, then works', browserName, o);
  });
});

test.describe('a recording too long for an at-risk phone', () => {
  const lowMemory = () => Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => 2 });

  for (const [label, userAgent, init] of [['an iPhone', IPHONE, undefined], ['a device with 2 GB of memory', undefined, lowMemory]] as const) {
    test(`${label}: a tool that must hold the sound refuses early as AudioTooLong`, async ({ browser, browserName }) => {
      const ctx = await browser.newContext({ userAgent, serviceWorkers: 'block', reducedMotion: 'reduce', baseURL: process.env.PW_BASE ?? 'http://localhost:4321', acceptDownloads: true });
      const page = await ctx.newPage();
      await open(page, '/tools/video-to-mp3', init);
      await add(page, fx('long-16min.wav'));
      const t = Date.now();
      const o = await run(page, 60_000);
      expect(o).toEqual({ state: 'error', cls: 'AudioTooLong' });
      // Refused from the header, before any of the sound was decoded.
      expect(Date.now() - t).toBeLessThan(20_000);
      await expect(page.locator('#error')).toContainText('minutes');
      record(`too long: ${label}`, browserName, o);
      await ctx.close();
    });
  }

  test('an iPhone: the Audio splitter decodes the same recording in pieces', async ({ browser, browserName }) => {
    test.slow();
    const ctx = await browser.newContext({ userAgent: IPHONE, serviceWorkers: 'block', reducedMotion: 'reduce', baseURL: process.env.PW_BASE ?? 'http://localhost:4321', acceptDownloads: true });
    const page = await ctx.newPage();
    await open(page, '/tools/audio-splitter');
    await page.locator('#file-input').setInputFiles(fx('long-16min.wav'));
    await expect(page.locator('#sp-info:not(:empty), #error.is-active')).not.toHaveCount(0, { timeout: 120_000 });
    await page.locator('#format').selectOption('wav');
    await page.locator('input[name="sp-mode"][value="every"]').check();
    await page.locator('#sp-unit').selectOption('60');
    await page.locator('#sp-every').fill('8');
    const o = await run(page, 240_000);
    expect(o).toEqual({ state: 'ok' });
    record('splitter on phone', browserName, o);
    await ctx.close();
  });

  test('a computer: the same recording runs', async ({ page, browserName }) => {
    test.slow();
    test.skip(browserName === 'webkit' && !!process.env.CI, 'Linux CI WebKit is too slow for a 16-minute encode');
    await open(page, '/tools/video-to-mp3');
    await add(page, fx('long-16min.wav'));
    const o = await run(page, 240_000);
    expect(o).toEqual({ state: 'ok' });
    record('long on desktop', browserName, o);
  });
});

test.describe('a file the device cannot read', () => {
  test('stays a NotReadable class and is never renamed to a decode class', async ({ page, browserName }) => {
    await open(page, '/tools/video-to-mp3', () => {
      const real = Blob.prototype.arrayBuffer;
      Blob.prototype.arrayBuffer = function () {
        return this instanceof File && this.name === 'clip.mp3' ? Promise.reject(new DOMException('The requested file could not be read', 'NotReadableError')) : real.call(this);
      };
    });
    await add(page, { name: 'clip.mp3', mimeType: 'audio/mpeg', buffer: readFileSync(edge('good.mp3')) });
    const o = await run(page, 60_000);
    expect(o.state).toBe('error');
    expect(o.cls).toMatch(/^NotReadable/);
    expect(existsSync(fx('good.mp3'))).toBe(true);
    record('android notreadable', browserName, o);
  });
});
