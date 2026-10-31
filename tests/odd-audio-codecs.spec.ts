// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decoderOrder, isCommonFormat, sniffAmr, soundFormatName, undecodableText } from '../src/lib/audio-codecs';
import { splitAmr } from '../src/lib/amr-frames';

// Sound in codecs the browsers' own decoder refuses (AC-3, Opus or FLAC in MP4/MKV, ALAC, PCM in a MOV, AMR): the audio tools read what the
// page's decoders can and end the rest as UnsupportedAudioCodec, naming the format. The files are the committed edge-case fixtures.
const edge = (n: string) => fileURLToPath(new URL(`./fixtures/edge-cases/${n}`, import.meta.url));
const stat = (n: string) => fileURLToPath(new URL(`./fixtures/static/${n}`, import.meta.url));

test.describe('decoderOrder', () => {
  const env = { audioDecoder: true };
  test('the Dolby codecs go to the registered decoder, whatever the page has', () => {
    for (const codec of ['ac3', 'eac3']) {
      expect(decoderOrder({ codec }, env)).toEqual(['browser', 'ac3']);
      expect(decoderOrder({ codec }, { audioDecoder: false })).toEqual(['browser', 'ac3']);
    }
  });
  test('AMR goes to the libav build, found by its container code', () => {
    expect(decoderOrder({ codec: null, id: 'samr' }, env)).toEqual(['browser', 'amr']);
    expect(decoderOrder({ codec: null, id: 'SAWB' }, env)).toEqual(['browser', 'amr']);
    // AMR-WB+ has no decoder here.
    expect(decoderOrder({ codec: null, id: 'sawp' }, env)).toEqual(['browser', 'webcodecs']);
  });
  test('AAC and MP3 are copied into a wrapper first for a video, second for a recording', () => {
    expect(decoderOrder({ codec: 'aac' }, { ...env, stretchFirst: true })).toEqual(['wrap', 'browser', 'webcodecs']);
    expect(decoderOrder({ codec: 'mp3' }, env)).toEqual(['browser', 'wrap', 'webcodecs']);
  });
  test('Opus, FLAC, ALAC and PCM go to WebCodecs only where the page has an AudioDecoder', () => {
    for (const codec of ['opus', 'flac', 'vorbis', 'pcm-s16', 'alac']) {
      expect(decoderOrder({ codec }, env)).toEqual(['browser', 'webcodecs']);
      expect(decoderOrder({ codec }, { audioDecoder: false })).toEqual(['browser']);
    }
  });
  test('formats are named, and only AAC and MP3 are common', () => {
    expect(soundFormatName({ codec: 'ac3' })).toBe('Dolby Digital (AC-3)');
    expect(soundFormatName({ codec: 'pcm-s16' })).toBe('uncompressed PCM');
    expect(soundFormatName({ codec: null, id: 'samr' })).toContain('AMR');
    expect(soundFormatName({ codec: null, id: 'xyz ' })).toBe('the "xyz" format');
    expect(soundFormatName(null)).toBe('');
    expect(isCommonFormat('AAC')).toBe(true);
    expect(isCommonFormat('Opus')).toBe(false);
    expect(undecodableText('Opus')).toContain("sound is Opus, which this browser can't decode");
    expect(undecodableText('')).toContain('No audio could be read');
  });
});

test.describe('AMR files', () => {
  test('a bare AMR file is cut into its 20 ms frames', () => {
    const bytes = readFileSync(edge('amr-nb.amr'));
    expect(sniffAmr(bytes)).toEqual({ codec: null, id: 'samr' });
    const amr = splitAmr(bytes)!;
    expect(amr.wide).toBe(false);
    // 5-ish seconds at 50 frames a second; every frame is whole, so the lengths add up to the file after its 6-byte header.
    expect(amr.frames.length).toBeGreaterThan(100);
    expect(amr.frames.reduce((n, f) => n + f.length, 0)).toBe(bytes.length - 6);
  });
  test('a file that is not AMR, and a wide-band one, are told apart', () => {
    expect(splitAmr(Buffer.from('RIFF....WAVE'))).toBeNull();
    expect(sniffAmr(Buffer.from('RIFF....WAVE'))).toBeNull();
    const wide = splitAmr(Buffer.concat([Buffer.from('#!AMR-WB\n'), Buffer.from([0x04 /* mode 0 */]), Buffer.alloc(17)]))!;
    expect(wide.wide).toBe(true);
    expect(wide.frames.map((f) => f.length)).toEqual([18]);
  });
  test('a frame cut short at the end is dropped', () => {
    const bytes = readFileSync(edge('amr-nb.amr'));
    const whole = splitAmr(bytes)!.frames.length;
    expect(splitAmr(bytes.subarray(0, bytes.length - 3))!.frames.length).toBe(whole - 1);
  });
});

type Ev = { n: string; d: Record<string, string> };
async function open(page: Page, url: string) {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const k='__ev';const a=JSON.parse(sessionStorage.getItem(k)||'[]');a.push({n,d});sessionStorage.setItem(k,JSON.stringify(a));}};`,
    }),
  );
  await page.goto(url);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
}

/** The class the first run recorded, or 'ok'. */
async function outcome(page: Page): Promise<string> {
  const events = (): Promise<Ev[]> => page.evaluate(() => JSON.parse(sessionStorage.getItem('__ev') || '[]'));
  await expect.poll(async () => (await events()).filter((e) => e.n === 'tool_run').length, { timeout: 120_000 }).toBe(1);
  const run = (await events()).find((e) => e.n === 'tool_run')!.d;
  return run.outcome === 'ok' ? 'ok' : run.error_class!;
}

// What each fixture does in Chromium, which reads Opus, FLAC and PCM through WebCodecs and AC-3 through the registered decoder.
const READABLE: [string, string][] = [
  ['ac3-51.mkv', edge('ac3-51.mkv')],
  ['eac3.mp4', edge('eac3.mp4')],
  ['pcm.mov', edge('pcm.mov')],
  ['opus.mp4', edge('opus.mp4')],
  ['opus-in.mp4', edge('opus-in.mp4')],
  ['flac.mkv', edge('flac.mkv')],
  ['mono-8k.wav', edge('mono-8k.wav')],
  ['amr-nb.amr', edge('amr-nb.amr')],
  ['mpeg4-amrnb.3gp', stat('mpeg4-amrnb.3gp')],
];

// WebKit reads these through WebCodecs where its build has the decoder (Safari 26 and later) and names them where it has not.
const WEBKIT_MAY_LACK = ['opus.mp4', 'opus-in.mp4', 'flac.mkv', 'pcm.mov'];

test.describe('the audio tools read the odd codecs', () => {
  test.setTimeout(180_000);
  for (const url of ['/ogg-to-mp3', '/tools/remove-noise']) {
    for (const [label, path] of READABLE) {
      // Remove noise on a video writes the picture back, and an MPEG-4 Part 2 picture is not one it can copy: that is the picture's limit, not the sound's.
      if (url === '/tools/remove-noise' && label.endsWith('.3gp')) continue;
      test(`${url}: ${label}`, async ({ page, browserName }) => {
        await open(page, url);
        await page.locator('#file-input').setInputFiles(path);
        await page.locator('#run').click();
        const result = await outcome(page);
        if (browserName === 'webkit' && WEBKIT_MAY_LACK.includes(label)) expect(['ok', 'UnsupportedAudioCodec']).toContain(result);
        else expect(result).toBe('ok');
      });
    }
  }
});

// ALAC has no decoder in Chromium (not in decodeAudioData, not in WebCodecs), and nothing shipped here reads it; Safari reads it itself.
for (const url of ['/ogg-to-mp3', '/tools/remove-noise']) {
  test(`${url}: alac.m4a is read by Safari and named elsewhere`, async ({ page, browserName }) => {
    test.setTimeout(180_000);
    await open(page, url);
    await page.locator('#file-input').setInputFiles(edge('alac.m4a'));
    await page.locator('#run').click();
    expect(await outcome(page)).toBe(browserName === 'webkit' ? 'ok' : 'UnsupportedAudioCodec');
    if (browserName !== 'webkit') await expect(page.locator('#error')).toContainText('Apple Lossless');
  });
}

// A sound nothing here can read is named with its format, never a generic decode failure.
test.describe('sound nothing can read is named', () => {
  test.setTimeout(180_000);
  const refused = async (page: Page, file: string, url: string) => {
    await open(page, url);
    await page.locator('#file-input').setInputFiles(file);
    await page.locator('#run').click();
    const result = await outcome(page);
    // WebKit's Linux build carries a DTS decoder of its own, so the sound is simply read there.
    if (page.context().browser()?.browserType().name() === 'webkit' && result === 'ok') return;
    expect(result).toBe('UnsupportedAudioCodec');
    await expect(page.locator('#error')).toHaveClass(/is-active/);
  };
  for (const url of ['/ogg-to-mp3', '/tools/remove-noise', '/tools/volume-booster']) {
    test(`${url}: DTS`, async ({ page }) => {
      await refused(page, edge('dts.mkv'), url);
      if (await page.locator('#error').evaluate((e) => !e.classList.contains('is-active'))) return;
      await expect(page.locator('#error')).toContainText('DTS');
    });
  }
  // Safari before 26 has no AudioDecoder, and its decodeAudioData does not read Opus in MP4.
  test('Opus in MP4 where the page has no AudioDecoder says Opus', async ({ page }) => {
    await page.addInitScript(() => {
      delete (window as unknown as { AudioDecoder?: unknown }).AudioDecoder;
      BaseAudioContext.prototype.decodeAudioData = () => Promise.reject(new DOMException('Unable to decode audio data', 'EncodingError'));
    });
    await refused(page, edge('opus.mp4'), '/ogg-to-mp3');
    await expect(page.locator('#error')).toContainText('Opus');
  });
  test('a sound the decoders cannot read does not repeat the same failure on a second Run', async ({ page }) => {
    await open(page, '/ogg-to-mp3');
    await page.locator('#file-input').setInputFiles(edge('dts.mkv'));
    await page.locator('#run').click();
    const result = await outcome(page);
    if (page.context().browser()?.browserType().name() === 'webkit' && result === 'ok') return;
    expect(result).toBe('UnsupportedAudioCodec');
    await expect(page.locator('#run')).toBeDisabled();
  });
});
