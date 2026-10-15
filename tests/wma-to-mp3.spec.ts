// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import { allowServiceWorker } from './allow-sw';
import { siteHost } from './allowed-host';

// WMA to MP3: real WMA files made by tests/fixtures/make-wma.sh (a 440 Hz tone, 6 s).
const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));
const SECONDS = 5.999;

async function open(page: Page) {
  // The site skips analytics in automated browsers; pretend to be a person so a stub can record the events.
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: 'window.__events=[];window.umami={track:(n,d)=>window.__events.push({n,d})};' }),
  );
  await page.goto('/wma-to-mp3');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#tool')).toHaveAttribute('data-base', 'video-to-mp3');
}

function watch(page: Page) {
  const seen: { url: string; method: string; body: string | null }[] = [];
  page.on('request', (r) => seen.push({ url: r.url(), method: r.method(), body: r.postData() }));
  return seen;
}

type Outcome = { kind: 'done'; bytes: Buffer; name: string } | { kind: 'error'; text: string; downloaded: boolean };

async function convert(page: Page, file: string): Promise<Outcome> {
  await page.locator('#file-input').setInputFiles([fixture(file)]);
  let downloaded = false;
  page.once('download', () => (downloaded = true));
  const download = page.waitForEvent('download', { timeout: 60_000 }).catch(() => null);
  await page.locator('#run').click();
  const done = page.locator('#results.is-active');
  const failed = page.locator('#error.is-active');
  await expect(done.or(failed)).toBeVisible({ timeout: 60_000 });
  if (await failed.isVisible()) return { kind: 'error', text: await failed.innerText(), downloaded };
  const d = await download;
  expect(d).not.toBeNull();
  return { kind: 'done', bytes: readFileSync(await d!.path()), name: d!.suggestedFilename() };
}

/** Plays the MP3 in an audio element, and decodes it to measure how loud it is. */
async function inspectMp3(page: Page, bytes: Buffer) {
  return page.evaluate(async (b64) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const blob = new Blob([arr], { type: 'audio/mpeg' });
    const audio = new Audio();
    audio.src = URL.createObjectURL(blob);
    audio.preload = 'auto';
    // Linux WebKit in CI has no MP3 playback: it reports 0 or an error. The caller then relies on the file's own length.
    const duration = await new Promise<number>((ok) => {
      audio.onloadedmetadata = () => ok(audio.duration);
      audio.onerror = () => ok(0);
      setTimeout(() => ok(0), 20_000);
    });
    const ctx = new OfflineAudioContext(1, 1, 44100);
    const buf = await ctx.decodeAudioData(arr.buffer.slice(0)).catch(() => null);
    if (!buf) return { duration, decoded: 0, rms: 0, channels: 0 };
    const data = buf.getChannelData(0);
    let sum = 0;
    for (const v of data) sum += v * v;
    return { duration, decoded: buf.duration, rms: Math.sqrt(sum / data.length), channels: buf.numberOfChannels };
  }, bytes.toString('base64'));
}

for (const [file, channels] of [
  ['tone-v2.wma', 2],
  ['tone-v1.wma', 1],
] as const) {
  test(`WMA to MP3 converts ${file} (WMA ${file.includes('v1') ? '1' : '2'}) to an MP3 that plays, with the same length`, async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);
    const requests = watch(page);
    const o = await convert(page, file);
    expect(o.kind, o.kind === 'error' ? o.text : '').toBe('done');
    if (o.kind !== 'done') return;
    expect(o.name).toBe(file.replace(/\.wma$/, '.mp3'));
    const m = await inspectMp3(page, o.bytes);
    // The MP3's own length, read by the demuxer, whatever the engine can play.
    const input = new Input({ source: new BlobSource(new Blob([new Uint8Array(o.bytes)])), formats: ALL_FORMATS });
    const track = await input.getPrimaryAudioTrack();
    expect(track?.codec).toBe('mp3');
    const length = await input.computeDuration();
    expect(Math.abs(length - SECONDS) / SECONDS, `file duration ${length}`).toBeLessThan(0.02);
    expect(await track!.getNumberOfChannels()).toBe(channels);
    if (m.duration > 0) {
      expect(Math.abs(m.duration - SECONDS) / SECONDS, `audio element duration ${m.duration}`).toBeLessThan(0.02);
      // Real sound, not silence: a 440 Hz sine at one eighth of full scale has an RMS of about 0.09.
      expect(m.rms, 'rms').toBeGreaterThan(0.04);
      expect(m.rms, 'rms').toBeLessThan(0.2);
      expect(Math.abs(m.decoded - SECONDS) / SECONDS, `decoded duration ${m.decoded}`).toBeLessThan(0.02);
      expect(m.channels).toBe(channels);
    } else {
      test.info().annotations.push({ type: 'playback', description: 'this engine cannot play MP3 here; length checked from the file only' });
    }

    // Title and artist travel as an ID3v2.3 tag (UTF-16), and a file without them gets none.
    const head = o.bytes.subarray(0, 120);
    if (file === 'tone-v2.wma') {
      expect(head.subarray(0, 3).toString('latin1')).toBe('ID3');
      expect(o.bytes.toString('utf16le').includes('Fixture Tone') || o.bytes.subarray(1).toString('utf16le').includes('Fixture Tone')).toBe(true);
      expect(o.bytes.subarray(0, 400).includes(Buffer.from('TIT2'))).toBe(true);
      expect(o.bytes.subarray(0, 400).includes(Buffer.from('TPE1'))).toBe(true);
    } else {
      expect(head.subarray(0, 3).toString('latin1')).not.toBe('ID3');
    }

    // The file stays in the tab: every request is a plain GET to this site, none names the file or carries
    // its bytes, and the decoder is fetched from here.
    const external = requests.filter((r) => !/^(blob|data):/.test(r.url));
    for (const r of external) {
      const url = new URL(r.url);
      if (url.hostname === 'stats.keenankaufman.com') continue;
      expect(url.hostname, `unexpected host: ${r.url}`).toBe(siteHost());
      expect(r.method, r.url).toBe('GET');
      expect(r.body, r.url).toBeNull();
      expect(decodeURIComponent(r.url), r.url).not.toContain(file.replace(/\.wma$/, ''));
    }
    const decoder = external.filter((r) => new URL(r.url).pathname.startsWith('/vendor/libav.js@6.10.9.0/'));
    expect(decoder.map((r) => new URL(r.url).pathname.split('/').pop()).sort()).toEqual(['libav-6.10.9.0-wma.mjs', 'libav-6.10.9.0-wma.wasm.mjs', 'libav-6.10.9.0-wma.wasm.wasm']);
    await expect(page.locator('#netproof-summary')).not.toContainText('unexpected');
  });
}

test('WMA to MP3 names WMA Pro in a plain message, downloads nothing, and records only the error class', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page);
  const o = await convert(page, 'wmapro-stand-in.wma');
  expect(o.kind).toBe('error');
  if (o.kind !== 'error') return;
  expect(o.text).toContain("This file uses WMA Pro, which Stayput can't open");
  expect(o.text).not.toMatch(/something went wrong|unexpected/i);
  expect(o.downloaded).toBe(false);
  await expect(page.locator('#results.is-active')).toHaveCount(0);
  const events = await page.evaluate(() => (window as unknown as { __events: { n: string; d: Record<string, string> }[] }).__events);
  const run = events.find((e) => e.n === 'tool_run' && e.d.outcome === 'error');
  expect(run?.d.error_class).toBe('UnsupportedWmaCodec');
  // No new fields: nothing in the event names the codec or the file.
  expect(JSON.stringify(events)).not.toMatch(/wmapro|WMA Pro|\.wma|Fixture/i);
});

test('WMA to MP3 refuses a copy-protected WMA by name', async ({ page }) => {
  await open(page);
  // An ASF header followed by a Content Encryption object GUID, which is what Windows Media DRM adds.
  const header = Buffer.from([0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11, 0xa6, 0xd9, 0x00, 0xaa, 0x00, 0x62, 0xce, 0x6c]);
  const drm = Buffer.from([0xfb, 0xb3, 0x11, 0x22, 0x23, 0xbd, 0xd2, 0x11, 0xb4, 0xb7, 0x00, 0xa0, 0xc9, 0x55, 0xfc, 0x6e]);
  await page.locator('#file-input').setInputFiles([{ name: 'song.wma', mimeType: 'audio/x-ms-wma', buffer: Buffer.concat([header, Buffer.alloc(30), drm, Buffer.alloc(200)]) }]);
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 30_000 });
  await expect(page.locator('#error')).toContainText('copy-protected');
});

test('WMA to MP3 refuses a file that is not a WMA with a plain message', async ({ page }) => {
  await open(page);
  await page.locator('#file-input').setInputFiles([{ name: 'broken.wma', mimeType: 'audio/x-ms-wma', buffer: Buffer.from('this is not really a wma file at all') }]);
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 30_000 });
});

test.describe('offline', () => {
  test.use({ serviceWorkers: 'allow' });
  test.beforeEach(async ({ context }) => allowServiceWorker(context));

  test('after one visit the decoder is cached and a WMA converts with the network off', async ({ page, context, browserName }) => {
    test.skip(browserName === 'webkit', 'Playwright WebKit cannot navigate offline through a service worker; Chromium covers the caching');
    test.setTimeout(120_000);
    await open(page);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await expect
      .poll(() => page.evaluate(() => (document.documentElement.dataset.decoders === 'failed' ? `failed: ${document.documentElement.dataset.decodersError}` : document.documentElement.dataset.decoders)), { timeout: 30_000 })
      .toBe('cached');
    const cached = await page.evaluate(async () => {
      const out: string[] = [];
      for (const name of await caches.keys()) for (const r of await (await caches.open(name)).keys()) out.push(new URL(r.url).pathname);
      return out;
    });
    for (const f of ['libav-6.10.9.0-wma.mjs', 'libav-6.10.9.0-wma.wasm.mjs', 'libav-6.10.9.0-wma.wasm.wasm']) {
      expect(cached, f).toContain(`/vendor/libav.js@6.10.9.0/${f}`);
    }
    await context.setOffline(true);
    await page.goto('/wma-to-mp3');
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    const o = await convert(page, 'tone-v2.wma');
    expect(o.kind).toBe('done');
    await context.setOffline(false);
  });
});
