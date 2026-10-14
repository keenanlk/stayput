// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import { allowServiceWorker } from './allow-sw';

// AVI to MP4: real AVIs made by tests/fixtures/make-avi.sh (320x240, 10 fps, 5 s, with a tone).
const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));
const reference = JSON.parse(readFileSync(fixture('avi-reference.json'), 'utf8')) as Record<string, { time: number; duration: number; width: number; height: number; grid: number[][] }>;

const GOOD = ['xvid-mp3.avi', 'mjpeg-pcm.avi'];

async function open(page: Page) {
  // The site skips analytics in automated browsers; pretend to be a person so a stub can record the events.
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: 'window.__events=[];window.umami={track:(n,d)=>window.__events.push({n,d})};' }),
  );
  await page.goto('/avi-to-mp4');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#tool')).toHaveAttribute('data-base', 'video-to-mp4');
}

/** Requests the tab and its workers make from now on. */
function watch(page: Page) {
  const seen: { url: string; method: string; body: string | null }[] = [];
  page.on('request', (r) => seen.push({ url: r.url(), method: r.method(), body: r.postData() }));
  return seen;
}

type Outcome = { kind: 'done'; bytes: Buffer; name: string; note: string } | { kind: 'error'; text: string };

async function convert(page: Page, file: string, mute = false): Promise<Outcome> {
  if (mute) await page.locator('#mute').check({ force: true });
  await page.locator('#file-input').setInputFiles([fixture(file)]);
  const download = page.waitForEvent('download', { timeout: 120_000 }).catch(() => null);
  await page.locator('#run').click();
  const done = page.locator('#results.is-active');
  const failed = page.locator('#error.is-active');
  await expect(done.or(failed)).toBeVisible({ timeout: 120_000 });
  if (await failed.isVisible()) return { kind: 'error', text: await failed.innerText() };
  const d = await download;
  expect(d).not.toBeNull();
  return { kind: 'done', bytes: readFileSync(await d!.path()), name: d!.suggestedFilename(), note: await page.locator('#results').innerText() };
}

/** This browser has no H.264 or AAC encoder here (some CI images): the page says so, and there is nothing to check. */
function skipIfCannotEncode(o: Outcome, browserName: string): asserts o is Extract<Outcome, { kind: 'done' }> {
  if (o.kind === 'error') test.skip(/encoder|can't write|cannot write|cannot encode/i.test(o.text), `${browserName} cannot write H.264 here: ${o.text}`);
  expect(o.kind, o.kind === 'error' ? o.text : '').toBe('done');
}

/** Average colour of a 4x3 grid of the video's frame at `time`, as the tool's reference JSON measured it. */
async function frameGrid(page: Page, bytes: Buffer, time: number): Promise<number[][] | null> {
  return page.evaluate(
    async ([b64, t]) => {
      const bin = atob(b64 as string);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const v = document.createElement('video');
      v.muted = true;
      v.src = URL.createObjectURL(new Blob([arr], { type: 'video/mp4' }));
      const ready = await new Promise<boolean>((ok) => {
        v.onloadeddata = () => ok(true);
        v.onerror = () => ok(false);
        setTimeout(() => ok(false), 15_000);
      });
      if (!ready) return null;
      v.currentTime = t as number;
      await new Promise<void>((ok) => {
        v.onseeked = () => ok();
        setTimeout(ok, 5_000);
      });
      const c = document.createElement('canvas');
      c.width = 320;
      c.height = 240;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(v, 0, 0, 320, 240);
      const out: number[][] = [];
      for (let gy = 0; gy < 3; gy++) {
        for (let gx = 0; gx < 4; gx++) {
          const x0 = (gx * 320) / 4 + 8;
          const y0 = (gy * 240) / 3 + 8;
          const w = 320 / 4 - 16;
          const h = 240 / 3 - 16;
          const d = ctx.getImageData(x0, y0, w, h).data;
          const sum = [0, 0, 0];
          for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) sum[k]! += d[i + k]!;
          const n = d.length / 4;
          out.push(sum.map((s) => Math.round(s / n)));
        }
      }
      // Linux WebKit plays the video but hands back a black canvas: nothing to compare there.
      return out.every((cell) => cell.every((v) => v === 0)) ? null : out;
    },
    [bytes.toString('base64'), time] as const,
  );
}

for (const file of GOOD) {
  test(`AVI to MP4 converts ${file} to an MP4 with H.264 picture, sound, the same length and the same colours`, async ({ page, browserName }) => {
    test.setTimeout(180_000);
    await open(page);
    const requests = watch(page);
    const o = await convert(page, file);
    skipIfCannotEncode(o, browserName);

    expect(o.name).toBe(file.replace(/\.avi$/, '.mp4'));
    expect(o.note).toContain('re-encoded to H.264');
    expect(o.bytes.subarray(4, 8).toString('latin1')).toBe('ftyp');
    const input = new Input({ source: new BlobSource(new Blob([new Uint8Array(o.bytes)])), formats: ALL_FORMATS });
    const video = await input.getPrimaryVideoTrack();
    const audio = await input.getPrimaryAudioTrack();
    expect(video?.codec).toBe('avc');
    expect(video?.displayWidth).toBe(320);
    expect(video?.displayHeight).toBe(240);
    expect(audio, 'the MP4 has a sound track').not.toBeNull();
    expect(['aac', 'mp3']).toContain(audio!.codec);
    expect(await audio!.getSampleRate()).toBeGreaterThanOrEqual(44100);
    const duration = await input.computeDuration();
    const seconds = reference[file]!.duration;
    expect(Math.abs(duration - seconds) / seconds, `duration ${duration} vs ${seconds}`).toBeLessThan(0.02);

    // Colours against the reference read from the AVI by a native decoder. Needs this browser to play H.264.
    const grid = await frameGrid(page, o.bytes, reference[file]!.time);
    test.info().annotations.push({ type: 'colours', description: grid ? 'compared' : 'this browser cannot play H.264 or read its frames back, not compared' });
    if (grid) {
      reference[file]!.grid.forEach((want, i) => {
        want.forEach((c, k) => expect(Math.abs(grid[i]![k]! - c), `${file} cell ${i} channel ${'rgb'[k]}: got ${grid[i]!.join(',')} want ${want.join(',')}`).toBeLessThan(12));
      });
    }

    // The file stays in the tab: every request is a plain GET to this site, none names the file or carries its bytes,
    // and the decoder is fetched from here.
    const external = requests.filter((r) => !/^(blob|data):/.test(r.url));
    for (const r of external) {
      const url = new URL(r.url);
      if (url.hostname === 'stats.keenankaufman.com') continue;
      expect(url.hostname, `unexpected host: ${r.url}`).toBe('localhost');
      expect(r.method, r.url).toBe('GET');
      expect(r.body, r.url).toBeNull();
      expect(decodeURIComponent(r.url), r.url).not.toContain(file.replace(/\.avi$/, ''));
    }
    const decoder = external.filter((r) => new URL(r.url).pathname.startsWith('/vendor/libav.js@6.10.9.0/'));
    expect(decoder.map((r) => new URL(r.url).pathname.split('/').pop()).sort()).toEqual(['libav-6.10.9.0-avi.mjs', 'libav-6.10.9.0-avi.wasm.mjs', 'libav-6.10.9.0-avi.wasm.wasm']);
    await expect(page.locator('#netproof-summary')).not.toContainText('unexpected');
  });
}

test('AVI to MP4 leaves the sound out when asked, and an AVI whose sound is unsupported still converts then', async ({ page, browserName }) => {
  test.setTimeout(180_000);
  await open(page);
  const o = await convert(page, 'xvid-mp3.avi', true);
  skipIfCannotEncode(o, browserName);
  const input = new Input({ source: new BlobSource(new Blob([new Uint8Array(o.bytes)])), formats: ALL_FORMATS });
  expect(await input.getPrimaryVideoTrack()).not.toBeNull();
  expect(await input.getPrimaryAudioTrack()).toBeNull();
});

test('AVI to MP4 keeps the sound without an AudioEncoder: MP3 is copied, PCM goes through the MP3 encoder', async ({ page, browserName }) => {
  // iOS 18 and earlier have no AudioEncoder. The page tells the worker so; the fallback paths must still write sound.
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    delete (window as unknown as { AudioEncoder?: unknown }).AudioEncoder;
  });
  await open(page);
  const copied = await convert(page, 'xvid-mp3.avi');
  skipIfCannotEncode(copied, browserName);
  const a = new Input({ source: new BlobSource(new Blob([new Uint8Array(copied.bytes)])), formats: ALL_FORMATS });
  const track = await a.getPrimaryAudioTrack();
  expect(track?.codec).toBe('mp3');
  expect(Math.abs((await a.computeDuration()) - reference['xvid-mp3.avi']!.duration)).toBeLessThan(0.1);

  await page.reload();
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  const encoded = await convert(page, 'mjpeg-pcm.avi');
  skipIfCannotEncode(encoded, browserName);
  const b = new Input({ source: new BlobSource(new Blob([new Uint8Array(encoded.bytes)])), formats: ALL_FORMATS });
  const track2 = await b.getPrimaryAudioTrack();
  expect(track2?.codec).toBe('mp3');
  expect(await track2!.getSampleRate()).toBe(48000);
});

for (const [file, codec] of [
  ['wmv2.avi', 'Windows Media Video'],
  ['h264-mp3.avi', 'H.264'],
] as const) {
  test(`AVI to MP4 names the codec of an AVI it cannot decode (${codec}) and records only the error class`, async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);
    const o = await convert(page, file);
    expect(o.kind).toBe('error');
    if (o.kind !== 'error') return;
    expect(o.text).toContain(codec);
    expect(o.text).toContain('cannot decode');
    const events = await page.evaluate(() => (window as unknown as { __events: { n: string; d: Record<string, string> }[] }).__events);
    const run = events.find((e) => e.n === 'tool_run' && e.d.outcome === 'error');
    expect(run?.d.error_class).toBe('UnsupportedAviCodec');
    // No new fields: nothing in the event names the codec or the file.
    expect(JSON.stringify(events)).not.toMatch(/wmv|h264|H\.264|Windows Media|\.avi/i);
  });
}

test('AVI to MP4 refuses a file that is not an AVI with a plain message', async ({ page }) => {
  await open(page);
  await page.locator('#file-input').setInputFiles([{ name: 'broken.avi', mimeType: 'video/x-msvideo', buffer: Buffer.from('RIFF\u0000\u0000\u0000\u0000AVI LIST not really') }]);
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 30_000 });
});

test.describe('offline', () => {
  test.use({ serviceWorkers: 'allow' });
  test.beforeEach(async ({ context }) => allowServiceWorker(context));

  test('after one visit the decoder is cached and an AVI converts with the network off', async ({ page, context, browserName }) => {
    test.skip(browserName === 'webkit', 'Playwright WebKit cannot navigate offline through a service worker; Chromium covers the caching');
    test.setTimeout(180_000);
    await open(page);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    // The page asks the service worker to cache the AVI decoder on load, and says when it is in.
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.decoders === 'failed' ? `failed: ${document.documentElement.dataset.decodersError}` : document.documentElement.dataset.decoders), { timeout: 30_000 })
      .toBe('cached');
    const cached = await page.evaluate(async () => {
      const out: string[] = [];
      for (const name of await caches.keys()) for (const r of await (await caches.open(name)).keys()) out.push(new URL(r.url).pathname);
      return out;
    });
    for (const f of ['libav-6.10.9.0-avi.mjs', 'libav-6.10.9.0-avi.wasm.mjs', 'libav-6.10.9.0-avi.wasm.wasm']) {
      expect(cached, f).toContain(`/vendor/libav.js@6.10.9.0/${f}`);
    }
    await context.setOffline(true);
    await page.goto('/avi-to-mp4');
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    const o = await convert(page, 'mjpeg-pcm.avi');
    skipIfCannotEncode(o, browserName);
    await context.setOffline(false);
  });
});
