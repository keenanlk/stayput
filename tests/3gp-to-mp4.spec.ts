// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ALL_FORMATS, BlobSource, EncodedPacketSink, Input } from 'mediabunny';
import { allowServiceWorker } from './allow-sw';

// 3GP to MP4: real 3GP files made by tests/fixtures/make-3gp.sh (176x144, 15 fps, 4 s, with a 440 Hz tone).
const dist = fileURLToPath(new URL('../vendor-builds/libav-3gp/dist/', import.meta.url));
const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));
const SECONDS = 4;

const GOOD = ['h263-amrnb.3gp', 'mpeg4-amrnb.3gp', 'h264-aac.3gp', 'h263-aac.3gp'];

async function open(page: Page) {
  // The site skips analytics in automated browsers; pretend to be a person so a stub can record the events.
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: 'window.__events=[];window.umami={track:(n,d)=>window.__events.push({n,d})};' }),
  );
  await page.goto('/3gp-to-mp4');
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

/** Decoded pictures are re-encoded as H.264, so the page's own encoder checks are the ones that can refuse; the browsers under test have one. */
function expectDone(o: Outcome): asserts o is Extract<Outcome, { kind: 'done' }> {
  expect(o.kind, o.kind === 'error' ? o.text : '').toBe('done');
}

/** Loads the MP4 in a video element, seeks, and reports what the element saw. */
async function play(page: Page, bytes: Buffer, time: number) {
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
      if (!ready) return { ready, canPlayH264: v.canPlayType('video/mp4; codecs="avc1.64001e"') !== '', error: v.error?.message ?? 'timeout' } as const;
      v.currentTime = t as number;
      await new Promise<void>((ok) => {
        v.onseeked = () => ok();
        setTimeout(ok, 5_000);
      });
      const c = document.createElement('canvas');
      c.width = 176;
      c.height = 144;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(v, 0, 0, 176, 144);
      const d = ctx.getImageData(0, 0, 176, 144).data;
      let min = 255;
      let max = 0;
      for (let i = 0; i < d.length; i += 4) {
        const l = d[i]! + d[i + 1]! + d[i + 2]!;
        min = Math.min(min, l);
        max = Math.max(max, l);
      }
      return { ready, width: v.videoWidth, height: v.videoHeight, duration: v.duration, time: v.currentTime, spread: max - min, black: max === 0 } as const;
    },
    [bytes.toString('base64'), time] as const,
  );
}


/** Mean absolute sample value of the MP4's sound, decoded by the browser under test (an audible tone is well above 0.01). */
async function loudness(page: Page, bytes: Buffer): Promise<number> {
  return page.evaluate(async (b64) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const ctx = new AudioContext();
    const buf = await ctx.decodeAudioData(arr.buffer);
    const d = buf.getChannelData(0);
    let sum = 0;
    for (let i = 0; i < d.length; i++) sum += Math.abs(d[i]!);
    await ctx.close();
    return sum / d.length;
  }, bytes.toString('base64'));
}

for (const file of GOOD) {
  test(`3GP to MP4 converts ${file} to an H.264 MP4 with sound and the same length`, async ({ page }) => {
    test.setTimeout(180_000);
    await open(page);
    const requests = watch(page);
    const o = await convert(page, file);
    expectDone(o);

    expect(o.name).toBe(file.replace(/\.3gp$/, '.mp4'));
    expect(o.bytes.subarray(4, 8).toString('latin1')).toBe('ftyp');
    const input = new Input({ source: new BlobSource(new Blob([new Uint8Array(o.bytes)])), formats: ALL_FORMATS });
    const video = await input.getPrimaryVideoTrack();
    const audio = await input.getPrimaryAudioTrack();
    expect(video?.codec).toBe('avc');
    expect(video?.displayWidth).toBe(176);
    expect(video?.displayHeight).toBe(144);
    expect(audio, 'the MP4 has a sound track').not.toBeNull();
    // Copied AAC stays AAC. Decoded AMR is written as AAC, or as MP3 by the page's own encoder where the browser has no AAC encoder (Linux Chromium).
    if (file.endsWith('-aac.3gp')) expect(audio!.codec).toBe('aac');
    else expect(['aac', 'mp3']).toContain(audio!.codec);
    const duration = await input.computeDuration();
    expect(Math.abs(duration - SECONDS), `duration ${duration} vs ${SECONDS}`).toBeLessThan(0.2);
    if (file.startsWith('h264')) expect(o.note).toContain('H.264 copied, no quality loss');

    // The picture plays at the right size and length, and the sound is audible.
    const seen = await play(page, o.bytes, 1);
    const cannotPlayH264 = !seen.ready && !seen.canPlayH264;
    test.info().annotations.push({ type: 'playback', description: cannotPlayH264 ? 'this browser cannot play H.264, playback not checked' : 'played' });
    if (!cannotPlayH264) expect(seen.ready, 'error' in seen ? String(seen.error) : '').toBe(true);
    if (seen.ready) {
      expect(seen.width).toBe(176);
      expect(seen.height).toBe(144);
      expect(Math.abs(seen.duration - SECONDS)).toBeLessThan(0.2);
      // Linux WebKit plays the video but hands back a black canvas: nothing to check there.
      if (!seen.black) expect(seen.spread, 'the frame has colour bars, not a flat colour').toBeGreaterThan(200);
    }
    expect(await loudness(page, o.bytes), 'the sound is a tone, not silence').toBeGreaterThan(0.02);

    // The file stays in the tab: every request is a plain GET to this site, none names the file or carries its bytes,
    // and only the 3GP decoder (not the AVI one) is fetched from here.
    const external = requests.filter((r) => !/^(blob|data):/.test(r.url));
    for (const r of external) {
      const url = new URL(r.url);
      if (url.hostname === 'stats.keenankaufman.com') continue;
      expect(url.hostname, `unexpected host: ${r.url}`).toBe('localhost');
      expect(r.method, r.url).toBe('GET');
      expect(r.body, r.url).toBeNull();
      expect(decodeURIComponent(r.url), r.url).not.toContain(file.replace(/\.3gp$/, ''));
    }
    const decoder = external.filter((r) => new URL(r.url).pathname.startsWith('/vendor/libav.js@6.10.9.0/'));
    expect(decoder.map((r) => new URL(r.url).pathname.split('/').pop()).sort()).toEqual(['libav-6.10.9.0-3gp.mjs', 'libav-6.10.9.0-3gp.wasm.mjs', 'libav-6.10.9.0-3gp.wasm.wasm']);
    await expect(page.locator('#netproof-summary')).not.toContainText('unexpected');
  });
}

test('3GP to MP4 leaves the sound out when asked', async ({ page }) => {
  test.setTimeout(180_000);
  await open(page);
  const o = await convert(page, 'h263-amrnb.3gp', true);
  expectDone(o);
  const input = new Input({ source: new BlobSource(new Blob([new Uint8Array(o.bytes)])), formats: ALL_FORMATS });
  expect(await input.getPrimaryVideoTrack()).not.toBeNull();
  expect(await input.getPrimaryAudioTrack()).toBeNull();
});

test('3GP to MP4 writes sound when the browser has no AudioEncoder (iOS 18 and earlier)', async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    delete (window as unknown as { AudioEncoder?: unknown }).AudioEncoder;
  });
  await open(page);
  const o = await convert(page, 'h263-amrnb.3gp');
  expect(o.kind, o.kind === 'error' ? o.text : '').toBe('done');
});

test('3GP to MP4 refuses a file that is not a 3GP with a plain message', async ({ page }) => {
  await open(page);
  await page.locator('#file-input').setInputFiles([{ name: 'broken.3gp', mimeType: 'video/3gpp', buffer: Buffer.from('\u0000\u0000\u0000\u0018ftyp3gp4\u0000\u0000\u0000\u0000 not really') }]);
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 30_000 });
});

test.describe('offline', () => {
  test.use({ serviceWorkers: 'allow' });
  test.beforeEach(async ({ context }) => allowServiceWorker(context));

  test('after one visit the 3GP decoder is cached and a 3GP converts with the network off', async ({ page, context, browserName }) => {
    test.skip(browserName === 'webkit', 'Playwright WebKit cannot navigate offline through a service worker; Chromium covers the caching');
    test.setTimeout(180_000);
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
    expect(cached.some((c) => /lame|mp3/i.test(c)), 'the MP3 encoder is cached').toBe(true);
    for (const f of ['libav-6.10.9.0-3gp.mjs', 'libav-6.10.9.0-3gp.wasm.mjs', 'libav-6.10.9.0-3gp.wasm.wasm']) {
      expect(cached, f).toContain(`/vendor/libav.js@6.10.9.0/${f}`);
    }
    expect(cached).not.toContain('/vendor/libav.js@6.10.9.0/libav-6.10.9.0-avi.wasm.wasm');
    await context.setOffline(true);
    await page.goto('/3gp-to-mp4');
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    const o = await convert(page, 'h263-amrnb.3gp');
    expectDone(o);
    await context.setOffline(false);
  });
});
