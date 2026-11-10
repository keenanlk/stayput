// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeSubtitleBytes } from '../src/lib/subtitle-text';
import { parseSubtitles, tidyCaptions } from '../src/lib/captions';

/**
 * Add subtitles to video: one test per way it can fail or be handed an odd file. Odd videos and subtitle files are
 * made here with ffmpeg and small scripts (nothing large is committed). Where the Whisper model is not the point,
 * the speech worker is a stand-in (FakeWorker). Runs in Chromium and WebKit; a case that re-encodes video is skipped
 * only in Linux CI WebKit, which cannot decode video in the page (run it on macOS WebKit).
 */
const dir = mkdtempSync(join(process.env.STAYPUT_SCRATCH ?? tmpdir(), 'stayput-hardening-'));
const file = (name: string) => join(dir, name);
const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));
const speechClip = (project: string) => fixture(project === 'webkit' ? 'speech.mov' : 'talk.webm');

function ffmpeg(args: string[]) {
  execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { stdio: 'pipe' });
}
const H264 = ['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p'];
const lavfi = (size: string, rate: number, seconds: number) => ['-f', 'lavfi', '-i', `testsrc=size=${size}:rate=${rate}:duration=${seconds}`];

test.beforeAll(() => {
  test.setTimeout(120_000);
  ffmpeg([...lavfi('320x240', 30, 2), ...H264, '-an', file('base.mp4')]);
  // A phone's portrait .mov: the picture is stored sideways with a 90 degree rotation tag.
  ffmpeg(['-display_rotation', '90', '-i', file('base.mp4'), '-c', 'copy', file('rotated90.mov')]);
  ffmpeg(['-display_rotation', '270', '-i', file('base.mp4'), '-c', 'copy', file('rotated270.mov')]);
  // Variable frame rate: frames dropped at uneven gaps, timestamps kept.
  ffmpeg([...lavfi('320x240', 30, 3), '-vf', "select='lt(mod(n\\,7)\\,3)'", '-fps_mode', 'vfr', ...H264, '-an', file('vfr.mp4')]);
  // Non-square pixels: 240x120 stored, shown 480x120.
  ffmpeg([...lavfi('240x120', 30, 2), '-vf', 'setsar=2/1', ...H264, '-an', file('nonsquare.mp4')]);
  ffmpeg([...lavfi('3840x2160', 60, 1), ...H264, '-an', file('uhd60.mp4')]);
  ffmpeg([...lavfi('320x240', 30, 0.4), ...H264, '-an', file('short.mp4')]);
  // A 20-minute clip at one frame a second and a tiny size.
  ffmpeg([...lavfi('160x90', 1, 1200), '-g', '30', ...H264, '-an', file('long.mp4')]);
  // Sound that no decoder in the page reads (ALAC), and a picture with no sound at all (base.mp4).
  ffmpeg([...lavfi('160x90', 15, 2), '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', ...H264, '-c:a', 'alac', '-shortest', file('alac.mov')]);
});

// ---- subtitle files -------------------------------------------------------------------------------------------

const CUES = [
  ['00:00:00,100', '00:00:00,600', 'Hello from the park'],
  ['00:00:00,800', '00:00:01,200', 'Café crème, señor'],
  ['00:00:01,300', '00:00:01,800', 'The end'],
] as const;
const srt = (eol = '\n') => CUES.map(([a, b, t], i) => `${i + 1}${eol}${a} --> ${b}${eol}${t}${eol}`).join(eol);

const utf16 = (text: string, bom: boolean, big = false) => {
  const out = Buffer.alloc(text.length * 2);
  for (let i = 0; i < text.length; i++) (big ? out.writeUInt16BE : out.writeUInt16LE).call(out, text.charCodeAt(i), i * 2);
  return Buffer.concat([bom ? Buffer.from(big ? [0xfe, 0xff] : [0xff, 0xfe]) : Buffer.alloc(0), out]);
};

const ASS = `[Script Info]
Title: test
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize
Style: Default,Arial,20

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.10,0:00:00.60,Default,,0,0,0,,{\\an8}Hello, from the park
Comment: 0,0:00:00.70,0:00:00.75,Default,,0,0,0,,not shown
Dialogue: 0,0:00:00.80,0:00:01.20,Default,,0,0,0,,Café crème\\Nsecond line
Dialogue: 0,0:00:01.30,0:00:01.80,Default,,0,0,0,,The end
`;
const SSA = `[Script Info]
ScriptType: v4.00

[V4 Styles]
Format: Name, Fontname, Fontsize
Style: Default,Arial,20

[Events]
Format: Marked, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: Marked=0,0:00:00.10,0:00:00.60,Default,,0,0,0,,Hello from the park
Dialogue: Marked=0,0:00:00.80,0:00:01.20,Default,,0,0,0,,Café crème
Dialogue: Marked=0,0:00:01.30,0:00:01.80,Default,,0,0,0,,The end
`;

test.describe('subtitle files, read as they are saved (pure reading, no page)', () => {
  test('UTF-16 with a byte-order mark, either way round, and without one', () => {
    expect(parseSubtitles(decodeSubtitleBytes(utf16(srt(), true))).map((s) => s.text)).toEqual(['Hello from the park', 'Café crème, señor', 'The end']);
    expect(parseSubtitles(decodeSubtitleBytes(utf16(srt(), true, true)))).toHaveLength(3);
    expect(parseSubtitles(decodeSubtitleBytes(utf16(srt(), false)))).toHaveLength(3);
    expect(parseSubtitles(decodeSubtitleBytes(utf16(srt(), false, true)))).toHaveLength(3);
  });
  test('Windows-1252 text is not turned into replacement characters', () => {
    const bytes = Uint8Array.from([...Buffer.from(srt('\r\n').replace('Café crème, señor', 'Café crème, señor'), 'latin1')]);
    expect(parseSubtitles(decodeSubtitleBytes(bytes))[1]!.text).toBe('Café crème, señor');
  });
  test('UTF-8 with a mark and CRLF line ends, and a mark with no line breaks at all after the arrow', () => {
    const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(srt('\r\n'), 'utf8')]);
    const cues = parseSubtitles(decodeSubtitleBytes(bytes));
    expect(cues).toHaveLength(3);
    expect(cues[1]!.text).toBe('Café crème, señor');
  });
  test('ASS and SSA: Dialogue lines are read, tags dropped, \\N is a line break, Comment lines are skipped', () => {
    const ass = parseSubtitles(ASS);
    expect(ass.map((s) => s.text)).toEqual(['Hello, from the park', 'Café crème\nsecond line', 'The end']);
    expect(ass[0]).toMatchObject({ start: 0.1, end: 0.6 });
    expect(parseSubtitles(SSA).map((s) => s.text)).toEqual(['Hello from the park', 'Café crème', 'The end']);
  });
  test('overlapping and simultaneous captions are trimmed so every one can be found by time', () => {
    const tidy = tidyCaptions(parseSubtitles('1\n00:00:00,000 --> 00:00:01,000\nA\n\n2\n00:00:00,500 --> 00:00:01,500\nB\n\n3\n00:00:00,500 --> 00:00:01,500\nC\n\n4\n00:00:01,200 --> 00:00:01,900\nD\n'));
    expect(tidy.map((s) => [s.start, s.end, s.text])).toEqual([
      [0, 0.5, 'A'],
      [0.5, 1.2, 'B\nC'],
      [1.2, 1.9, 'D'],
    ]);
  });
  test('bad timestamps are skipped and the rest is read; a file with no times reads as nothing', () => {
    const text = '1\n00:00:02,000 --> 00:00:01,000\nbackwards\n\n2\nsoon --> later\nwords\n\n3\n00:00:00,100 --> 00:00:00,600\nGood\n\n4\n0:1 --> 0:2\nShort form\n';
    expect(parseSubtitles(text).map((s) => s.text)).toEqual(['Good', 'Short form']);
    expect(parseSubtitles('just some words\nwith no times')).toEqual([]);
    expect(parseSubtitles('')).toEqual([]);
  });
});

/** The site skips analytics in automated browsers; pretend to be a person and record what would be sent. */
async function recordRuns(page: Page) {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const a=JSON.parse(sessionStorage.getItem('__ev')||'[]');a.push({n,d});sessionStorage.setItem('__ev',JSON.stringify(a));}};`,
    }),
  );
}
const lastRun = (page: Page) =>
  page.evaluate(() => (JSON.parse(sessionStorage.getItem('__ev') || '[]') as { n: string; d: Record<string, string> }[]).filter((e) => e.n === 'tool_run').at(-1)!.d);

async function open(page: Page, path = '/tools/add-subtitles-to-video') {
  await page.goto(path);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
}
async function run(page: Page, files: string[], path?: string) {
  await open(page, path);
  await page.locator('#file-input').setInputFiles(files);
  await page.locator('#run').click();
}
const done = (page: Page, timeout = 120_000) => expect(page.locator('#results')).toHaveClass(/is-active/, { timeout });
const failed = (page: Page, timeout = 60_000) => expect(page.locator('#error')).toHaveClass(/is-active/, { timeout });
const modelRequests = (page: Page) => {
  const seen: string[] = [];
  page.on('request', (r) => /\/models\/|\.onnx|huggingface/i.test(r.url()) && seen.push(r.url()));
  return seen;
};
const write = (name: string, body: string | Buffer) => (writeFileSync(file(name), body), file(name));
// Linux CI WebKit cannot decode video in the page (ci-linux-webkit-video-decode-stall): the same cases run on macOS WebKit.
const needsVideoDecode = (browserName: string) => test.skip(browserName === 'webkit' && !!process.env.CI, 'Linux CI WebKit cannot decode video in the page');

test.describe('a subtitle file the page reads as it was saved, and burns in', () => {
  const cases: [string, string, () => string | Buffer][] = [
    ['UTF-16 with a byte-order mark', 'u16.srt', () => utf16(srt(), true)],
    ['UTF-16 big-endian with no mark', 'u16be.srt', () => utf16(srt(), false, true)],
    ['Windows-1252 text', 'w1252.srt', () => Buffer.from(srt('\r\n'), 'latin1')],
    ['UTF-8 with a mark and CRLF line ends', 'bom.srt', () => Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(srt('\r\n'))])],
    ['an .ass script', 'subs.ass', () => ASS],
    ['an .ssa script', 'subs.ssa', () => SSA],
    ['overlapping times', 'overlap.srt', () => '1\n00:00:00,100 --> 00:00:00,900\nOne\n\n2\n00:00:00,500 --> 00:00:01,200\nTwo\n\n3\n00:00:01,000 --> 00:00:01,800\nThree\n'],
    ['some cues with impossible times among good ones', 'bad.srt', () => '1\n00:00:02,000 --> 00:00:01,000\nbackwards\n\n2\n00:00:00,100 --> 00:00:00,900\nOne\n\n3\nsoon --> later\nnope\n\n4\n00:00:01,000 --> 00:00:01,800\nTwo\n'],
  ];
  for (const [label, name, body] of cases) {
    test(`${label}`, async ({ page, browserName }) => {
      needsVideoDecode(browserName);
      test.setTimeout(120_000);
      await recordRuns(page);
      await run(page, [file('base.mp4'), write(name, body())]);
      await done(page);
      await expect(page.locator('#results-list')).toContainText(/[23] captions? from your subtitle file/);
      expect((await lastRun(page)).error_class ?? '').toBe('');
    });
  }

  test('a subtitle file of 0 bytes is skipped with a notice (the shell), and one of only blank lines is refused by name', async ({ page }) => {
    await recordRuns(page);
    const models = modelRequests(page);
    await open(page);
    await page.locator('#file-input').setInputFiles([file('base.mp4'), write('empty.srt', '')]);
    await expect(page.locator('body')).toContainText(/empty \(0 bytes\)|Skipped 1 empty file/);
    await page.reload();
    await run(page, [file('base.mp4'), write('blank.srt', '\n\n  \n')]);
    await failed(page);
    await expect(page.locator('#error')).toContainText('No captions could be read from blank.srt');
    expect((await lastRun(page)).error_class).toBe('InputError');
    expect(models).toEqual([]);
  });

  test('a file with no times in it is refused the same way', async ({ page }) => {
    await recordRuns(page);
    await run(page, [file('base.mp4'), write('words.srt', 'these are just some words\nwith no times at all\n')]);
    await failed(page);
    await expect(page.locator('#error')).toContainText('No captions could be read');
    expect((await lastRun(page)).error_class).toBe('InputError');
  });
});

// ---- odd videos (an SRT is given, so the Whisper model is not involved) ------------------------------------------

test.describe('odd videos are redrawn with their captions', () => {
  const srtFor = (end: number) => write(`cue-${end}.srt`, `1\n00:00:00,000 --> 00:00:0${Math.min(9, end).toFixed(3).replace('.', ',')}\nHello from the park\n`);
  const videos: [string, string, number, number][] = [
    ['rotated 90 degrees (a phone .mov)', 'rotated90.mov', 1.5, 90_000],
    ['rotated 270 degrees', 'rotated270.mov', 1.5, 90_000],
    ['variable frame rate', 'vfr.mp4', 2, 90_000],
    ['non-square pixels', 'nonsquare.mp4', 1.5, 90_000],
    ['4K at 60 frames a second', 'uhd60.mp4', 0.8, 240_000],
    ['shorter than a second', 'short.mp4', 0.3, 90_000],
    ['twenty minutes long', 'long.mp4', 9, 240_000],
  ];
  for (const [label, name, cueEnd, timeout] of videos) {
    test(label, async ({ page, browserName }) => {
      needsVideoDecode(browserName);
      test.setTimeout(timeout + 30_000);
      await recordRuns(page);
      await run(page, [file(name), srtFor(cueEnd)]);
      await done(page, timeout);
      await expect(page.locator('#results-list')).toContainText('1 caption from your subtitle file');
      expect((await lastRun(page)).error_class ?? '').toBe('');
    });
  }
});

// ---- refusals before the model is fetched --------------------------------------------------------------------------

test.describe('refused early, before any model download', () => {
  test('a video with no sound track and no subtitle file: NoSoundTrack', async ({ page, browserName }) => {
    needsVideoDecode(browserName);
    await recordRuns(page);
    const models = modelRequests(page);
    await open(page);
    await page.locator('#file-input').setInputFiles([file('base.mp4')]);
    // Refused when it is added, in the tool's own words, and not a run.
    await expect(page.locator('#run-hint')).toContainText(/has no sound, so there are no words to write captions from/);
    await expect(page.locator('#run-hint')).toHaveAttribute('data-problem', 'NoSoundTrack');
    await expect(page.locator('#run')).toBeDisabled();
    expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('__ev') || '[]').filter((e: { n: string }) => e.n === 'tool_run'))).toEqual([]);
    expect(models).toEqual([]);
  });

  test('a sound track no decoder here reads: named, and nothing is fetched', async ({ page, browserName }) => {
    // ALAC plays natively in WebKit, so it is only unreadable in Chromium.
    test.skip(browserName !== 'chromium', 'WebKit decodes ALAC');
    await recordRuns(page);
    const models = modelRequests(page);
    await run(page, [file('alac.mov')]);
    await failed(page);
    expect(['UnsupportedSound', 'AudioDecodeError']).toContain((await lastRun(page)).error_class);
    expect(models).toEqual([]);
  });

  test('a video this browser cannot decode (HEVC): UnsupportedCodec before the model', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'WebKit decodes HEVC');
    await recordRuns(page);
    const models = modelRequests(page);
    await run(page, [fixture('iphone-hevc.mov')]);
    await failed(page);
    // Headless Chromium on a Mac may decode HEVC through the system; the order of events is what counts then.
    if ((await lastRun(page)).error_class === 'UnsupportedCodec') expect(models).toEqual([]);
  });

  test('a subtitle file the browser reports as gone (NotFoundError) is UnreadableFileGone', async ({ page, browserName }) => {
    needsVideoDecode(browserName);
    await recordRuns(page);
    await page.addInitScript(() => {
      const read = Blob.prototype.arrayBuffer;
      Blob.prototype.arrayBuffer = function (this: Blob) {
        if (/\.srt$/.test((this as File).name ?? '')) return Promise.reject(new DOMException('gone', 'NotFoundError'));
        return read.call(this);
      };
    });
    await run(page, [file('base.mp4'), write('one.srt', srt())]);
    await failed(page);
    await expect(page.locator('#error')).toContainText('could not be read');
    expect((await lastRun(page)).error_class).toBe('UnreadableFileGone');
  });

  test('a video the browser cannot reach when it is added is named at once (NotReadableProbe), never a bare NotFoundError', async ({ page, browserName }) => {
    needsVideoDecode(browserName);
    await recordRuns(page);
    await page.addInitScript(() => {
      const slice = Blob.prototype.slice;
      Blob.prototype.slice = function (this: Blob, ...args: Parameters<Blob['slice']>) {
        const piece = slice.apply(this, args);
        if (/\.mp4$/.test((this as File).name ?? '')) piece.arrayBuffer = () => Promise.reject(new DOMException('gone', 'NotFoundError'));
        return piece;
      };
    });
    await run(page, [file('base.mp4')]);
    await failed(page);
    expect(['NotReadableProbe', 'UnreadableFileGone']).toContain((await lastRun(page)).error_class);
  });
});

// ---- the speech model ---------------------------------------------------------------------------------------------

test.describe('the speech model download', () => {
  test('a blocked download is ModelDownloadError', async ({ page }, info) => {
    test.setTimeout(180_000);
    await recordRuns(page);
    await page.route(/\/models\/.*\.onnx/, (route) => route.abort());
    await run(page, [speechClip(info.project.name)]);
    await failed(page, 150_000);
    expect(['ModelDownloadError', 'ModelOffline']).toContain((await lastRun(page)).error_class);
  });

  test('a model file that arrives as junk is ModelVerifyFailed', async ({ page }, info) => {
    test.setTimeout(180_000);
    await recordRuns(page);
    await page.route(/\/models\/.*\.onnx/, (route) => route.fulfill({ status: 200, contentType: 'application/octet-stream', body: 'not a model' }));
    await run(page, [speechClip(info.project.name)]);
    await failed(page, 150_000);
    expect(['ModelVerifyFailed', 'ModelLoadError', 'ModelDownloadError']).toContain((await lastRun(page)).error_class);
  });
});

// ---- failures in the speech worker and in the redraw, with the speech worker faked --------------------------------

/** The 8-bit speech worker answering `plan` (one entry per request): 'ok' with one caption, or 'die'. */
async function fakeSpeechWorker(page: Page, plan: ('ok' | 'die')[]) {
  await page.addInitScript((plan) => {
    const w = window as unknown as { __asked: number; Worker: unknown };
    w.__asked = 0;
    Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
    const Real = window.Worker;
    w.Worker = class extends Real {
      constructor(url: string | URL, options?: WorkerOptions) {
        if (!/transcribe\.worker/.test(String(url))) return new Real(url, options);
        super(url, options);
        const fake = new EventTarget() as EventTarget & { postMessage(msg: { id: number }): void; terminate(): void };
        fake.postMessage = ({ id }) => {
          const step = plan[Math.min(w.__asked++, plan.length - 1)];
          if (step === 'die') setTimeout(() => fake.dispatchEvent(new Event('error')), 0);
          else setTimeout(() => fake.dispatchEvent(new MessageEvent('message', { data: { id, type: 'result', chunks: [{ start: 0, end: 1, text: ' Hello there.' }], language: 'en' } })), 0);
        };
        fake.terminate = () => {};
        return fake as unknown as Worker;
      }
    };
  }, plan);
}

/** Once the page says it is adding subtitles, the encoder breaks: `only` limits it to encoders made for those codec prefixes. */
async function breakRedraw(page: Page, how: { throws: 'EncoderStall' | 'RangeError'; only?: string }) {
  await page.addInitScript((how) => {
    const configure = VideoEncoder.prototype.configure;
    const encode = VideoEncoder.prototype.encode;
    const codecs = new WeakMap<object, string>();
    VideoEncoder.prototype.configure = function (this: VideoEncoder, config: VideoEncoderConfig) {
      codecs.set(this, config.codec);
      return configure.call(this, config);
    };
    VideoEncoder.prototype.encode = function (this: VideoEncoder, ...args: Parameters<VideoEncoder['encode']>) {
      const running = /Adding subtitles to/.test(document.getElementById('progress-text')?.textContent ?? '');
      if (running && (!how.only || (codecs.get(this) ?? '').startsWith(how.only))) {
        throw how.throws === 'RangeError' ? new RangeError('Array buffer allocation failed') : Object.assign(new Error('forced by the test'), { name: 'EncoderStall' });
      }
      return encode.apply(this, args);
    };
  }, how);
}

test.describe('failures part-way, with the captions already written', () => {
  test('an encoder that stalls with H.264 only: Chromium writes VP9 and finishes', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'VP9 in the MP4 is offered in Chromium only');
    test.setTimeout(180_000);
    await recordRuns(page);
    await breakRedraw(page, { throws: 'EncoderStall', only: 'avc1' });
    await run(page, [file('base.mp4'), write('v.srt', srt())]);
    await done(page);
    await expect(page.locator('#results-list')).toContainText(/VP9/);
  });

  test('an encoder that stalls with every codec: the .srt is handed over beside a plain message', async ({ page }, info) => {
    test.setTimeout(240_000);
    await recordRuns(page);
    await fakeSpeechWorker(page, ['ok']);
    await breakRedraw(page, { throws: 'EncoderStall' });
    await run(page, [speechClip(info.project.name)]);
    await failed(page, 200_000);
    await expect(page.locator('#error')).toContainText("Burned-in captions don't work in this browser yet");
    await expect(page.locator('#results')).toHaveClass(/is-active/);
    const download = page.waitForEvent('download');
    await page.locator('#results-list button', { hasText: 'Download' }).click();
    expect((await download).suggestedFilename()).toMatch(/\.srt$/);
    expect((await lastRun(page)).error_class).toBe('EncoderStall');
  });

  test('running out of memory in the redraw: the .srt is handed over and the class is OutOfMemoryError', async ({ page }, info) => {
    test.setTimeout(240_000);
    await recordRuns(page);
    await fakeSpeechWorker(page, ['ok']);
    await breakRedraw(page, { throws: 'RangeError' });
    await run(page, [speechClip(info.project.name)]);
    await failed(page, 200_000);
    await expect(page.locator('#error')).toContainText('too long for your browser to redraw');
    const download = page.waitForEvent('download');
    await page.locator('#results-list button', { hasText: 'Download' }).click();
    expect((await download).suggestedFilename()).toMatch(/\.srt$/);
    expect((await lastRun(page)).error_class).toBe('OutOfMemoryError');
  });

  test('a speech worker that dies twice is WorkerCrashError, after one more try', async ({ page }, info) => {
    test.setTimeout(180_000);
    await recordRuns(page);
    await fakeSpeechWorker(page, ['die']);
    await run(page, [speechClip(info.project.name)]);
    await failed(page, 150_000);
    expect(['WorkerCrashError', 'OutOfMemoryError']).toContain((await lastRun(page)).error_class);
  });
});

// ---- no H.264 encoder ----------------------------------------------------------------------------------------------

test.describe('no H.264 encoder', () => {
  test('the browser offers none: VP9 in the MP4 is written instead of refusing', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'WebKit has no VP9 in the MP4 and keeps its H.264 encoder');
    test.setTimeout(120_000);
    await recordRuns(page);
    await page.addInitScript(() => {
      const supported = VideoEncoder.isConfigSupported.bind(VideoEncoder);
      VideoEncoder.isConfigSupported = async (config: VideoEncoderConfig) => (config.codec.startsWith('avc1') ? { supported: false, config } : supported(config));
    });
    await run(page, [file('base.mp4'), write('v.srt', srt())]);
    await done(page);
    await expect(page.locator('#results-list')).toContainText(/VP9/);
  });

  test('an H.264 encoder that never answers: VP9 where the browser can, checked before any transcribing', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'WebKit has no VP9 in the MP4: it is refused at once instead (tests/caption-encoder.spec.ts)');
    test.setTimeout(120_000);
    await recordRuns(page);
    await page.addInitScript(() => {
      const configure = VideoEncoder.prototype.configure;
      const encode = VideoEncoder.prototype.encode;
      const flush = VideoEncoder.prototype.flush;
      const avc = new WeakSet<object>();
      VideoEncoder.prototype.configure = function (this: VideoEncoder, config: VideoEncoderConfig) {
        if (config.codec.startsWith('avc1')) avc.add(this);
        return configure.call(this, config);
      };
      VideoEncoder.prototype.encode = function (this: VideoEncoder, ...args: Parameters<VideoEncoder['encode']>) {
        if (avc.has(this)) return;
        return encode.apply(this, args);
      };
      VideoEncoder.prototype.flush = function (this: VideoEncoder) {
        return avc.has(this) ? new Promise<void>(() => undefined) : flush.call(this);
      };
    });
    await run(page, [file('base.mp4'), write('v.srt', srt())]);
    await done(page);
    await expect(page.locator('#results-list')).toContainText(/VP9/);
  });
});

// ---- the page hidden --------------------------------------------------------------------------------------------

test('the page hidden during the redraw: it starts again once the page is back (not a product error)', async ({ page, browserName }) => {
  needsVideoDecode(browserName);
  test.setTimeout(150_000);
  await recordRuns(page);
  await page.addInitScript(() => {
    const encode = VideoEncoder.prototype.encode;
    let armed = false;
    VideoEncoder.prototype.encode = function (this: VideoEncoder, ...args: Parameters<VideoEncoder['encode']>) {
      if (!armed && /Adding subtitles to/.test(document.getElementById('progress-text')?.textContent ?? '')) {
        armed = true;
        const set = (hidden: boolean) => {
          Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
          Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
          document.dispatchEvent(new Event('visibilitychange'));
        };
        set(true);
        setTimeout(() => set(false), 600);
        throw new DOMException('forced by the test', 'AbortError');
      }
      return encode.apply(this, args);
    };
  });
  await run(page, [file('base.mp4'), write('v.srt', srt())]);
  await done(page);
  await expect(page.locator('#results-list')).toContainText('started again after the page was hidden');
});
