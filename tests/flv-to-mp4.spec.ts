// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ALL_FORMATS, BlobSource, EncodedPacketSink, Input } from 'mediabunny';
import { allowServiceWorker } from './allow-sw';
import { siteHost } from './allowed-host';

// FLV to MP4: real FLVs made by tests/fixtures/make-flv.sh (320x240, 10 fps, 5 s, with a tone).
const dist = fileURLToPath(new URL('../vendor-builds/libav-flv/dist/', import.meta.url));
const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));
// What the FLVs themselves report (ffprobe): the 5 s clip plus the 0.2 s picture delay that B-frames add.
const SECONDS = 5.2;

const GOOD = ['h264-aac.flv', 'h264-mp3.flv', 'h264-mp3-22k.flv'];

async function open(page: Page) {
  // The site skips analytics in automated browsers; pretend to be a person so a stub can record the events.
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: 'window.__events=[];window.umami={track:(n,d)=>window.__events.push({n,d})};' }),
  );
  await page.goto('/flv-to-mp4');
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

/** The picture is copied, so the only encoder that can be missing is AAC: nothing here needs a skip for H.264. */
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
      c.width = 320;
      c.height = 240;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(v, 0, 0, 320, 240);
      const d = ctx.getImageData(0, 0, 320, 240).data;
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

/** Packets of the FLV as the committed reader build gives them: [dts ms, key, data]. */
async function flvVideoPackets(file: string) {
  const { default: LibAV } = await import(/* @vite-ignore */ dist + 'libav-6.10.9.0-flv.mjs');
  const libav = await LibAV.LibAV({ noworker: true, base: dist });
  await libav.mkreadaheadfile('in.flv', new Blob([readFileSync(fixture(file))]));
  const [fmt, streams] = await libav.ff_init_demuxer_file('in.flv');
  const vs = streams.find((s: { codec_type: number }) => s.codec_type === libav.AVMEDIA_TYPE_VIDEO);
  const out: { key: boolean; data: Uint8Array }[] = [];
  const pkt = await libav.av_packet_alloc();
  for (;;) {
    const [res, packets] = await libav.ff_read_frame_multi(fmt, pkt, { limit: 64 * 1024 });
    for (const p of packets[vs.index] ?? []) out.push({ key: ((p.flags ?? 0) & 1) !== 0, data: p.data });
    if (res === libav.AVERROR_EOF) break;
  }
  return out;
}

for (const file of GOOD) {
  test(`FLV to MP4 converts ${file} to an MP4 with the same H.264 picture, sound and length`, async ({ page }) => {
    test.setTimeout(180_000);
    await open(page);
    const requests = watch(page);
    const o = await convert(page, file);
    expectDone(o);

    expect(o.name).toBe(file.replace(/\.flv$/, '.mp4'));
    expect(o.note).toContain('H.264 copied, no quality loss');
    expect(o.bytes.subarray(4, 8).toString('latin1')).toBe('ftyp');
    const input = new Input({ source: new BlobSource(new Blob([new Uint8Array(o.bytes)])), formats: ALL_FORMATS });
    const video = await input.getPrimaryVideoTrack();
    const audio = await input.getPrimaryAudioTrack();
    expect(video?.codec).toBe('avc');
    expect(video?.displayWidth).toBe(320);
    expect(video?.displayHeight).toBe(240);
    expect(audio, 'the MP4 has a sound track').not.toBeNull();
    expect(['aac', 'mp3']).toContain(audio!.codec);
    if (file === 'h264-aac.flv') expect(audio!.codec).toBe('aac');
    expect(await audio!.getSampleRate()).toBeGreaterThanOrEqual(44100);
    const duration = await input.computeDuration();
    expect(Math.abs(duration - SECONDS) / SECONDS, `duration ${duration} vs ${SECONDS}`).toBeLessThan(0.05);

    // The picture is the FLV's own packets, byte for byte, in the same order with the same key frames.
    const want = await flvVideoPackets(file);
    const sink = new EncodedPacketSink(video!);
    const got: { key: boolean; data: Uint8Array }[] = [];
    for await (const p of sink.packets()) got.push({ key: p.type === 'key', data: p.data });
    expect(got.length).toBe(want.length);
    expect(got.filter((p) => p.key).length).toBe(want.filter((p) => p.key).length);
    got.forEach((p, i) => expect(Buffer.from(p.data).equals(Buffer.from(want[i]!.data)), `packet ${i} differs`).toBe(true));

    // It plays in a video element: right size and length, and a real picture when this browser hands frames back.
    const seen = await play(page, o.bytes, 1);
    // An open-source Chromium build cannot play H.264 at all; the packets above are the proof there.
    const cannotPlayH264 = !seen.ready && !seen.canPlayH264;
    test.info().annotations.push({ type: 'playback', description: cannotPlayH264 ? 'this browser cannot play H.264, playback not checked' : 'played' });
    if (!cannotPlayH264) expect(seen.ready, 'error' in seen ? String(seen.error) : '').toBe(true);
    if (seen.ready) {
      expect(seen.width).toBe(320);
      expect(seen.height).toBe(240);
      expect(Math.abs(seen.duration - SECONDS) / SECONDS).toBeLessThan(0.05);
      // Linux WebKit plays the video but hands back a black canvas: nothing to check there.
      if (!seen.black) expect(seen.spread, 'the frame has colour bars, not a flat colour').toBeGreaterThan(200);
    }

    // The file stays in the tab: every request is a plain GET to this site, none names the file or carries its bytes,
    // and the FLV reader (not the AVI decoder) is fetched from here.
    const external = requests.filter((r) => !/^(blob|data):/.test(r.url));
    for (const r of external) {
      const url = new URL(r.url);
      if (url.hostname === 'stats.keenankaufman.com') continue;
      expect(url.hostname, `unexpected host: ${r.url}`).toBe(siteHost());
      expect(r.method, r.url).toBe('GET');
      expect(r.body, r.url).toBeNull();
      expect(decodeURIComponent(r.url), r.url).not.toContain(file.replace(/\.flv$/, ''));
    }
    const reader = external.filter((r) => new URL(r.url).pathname.startsWith('/vendor/libav.js@6.10.9.0/'));
    expect(reader.map((r) => new URL(r.url).pathname.split('/').pop()).sort()).toEqual(['libav-6.10.9.0-flv.mjs', 'libav-6.10.9.0-flv.wasm.mjs', 'libav-6.10.9.0-flv.wasm.wasm']);
    await expect(page.locator('#netproof-summary')).not.toContainText('unexpected');
  });
}

test('FLV to MP4 leaves the sound out when asked', async ({ page }) => {
  test.setTimeout(180_000);
  await open(page);
  const o = await convert(page, 'h264-aac.flv', true);
  expectDone(o);
  const input = new Input({ source: new BlobSource(new Blob([new Uint8Array(o.bytes)])), formats: ALL_FORMATS });
  expect(await input.getPrimaryVideoTrack()).not.toBeNull();
  expect(await input.getPrimaryAudioTrack()).toBeNull();
});

test('FLV to MP4 keeps MP3 sound without an AudioEncoder by copying the packets', async ({ page }) => {
  // iOS 18 and earlier have no AudioEncoder. The page tells the worker so; the fallback path must still write sound.
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    delete (window as unknown as { AudioEncoder?: unknown }).AudioEncoder;
  });
  await open(page);
  const o = await convert(page, 'h264-mp3.flv');
  expectDone(o);
  const input = new Input({ source: new BlobSource(new Blob([new Uint8Array(o.bytes)])), formats: ALL_FORMATS });
  const track = await input.getPrimaryAudioTrack();
  expect(track?.codec).toBe('mp3');
  expect(Math.abs((await input.computeDuration()) - SECONDS)).toBeLessThan(0.25);
});

for (const [file, codec] of [
  ['vp6-mp3.flv', 'VP6'],
  ['spark-mp3.flv', 'Sorenson Spark'],
] as const) {
  test(`FLV to MP4 names the codec of an FLV it cannot open (${codec}), writes nothing and records only the error class`, async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);
    let downloaded = false;
    page.on('download', () => (downloaded = true));
    const o = await convert(page, file);
    expect(o.kind).toBe('error');
    if (o.kind !== 'error') return;
    expect(o.text).toContain(`This FLV uses ${codec} video, which Stayput can't open`);
    expect(downloaded).toBe(false);
    const events = await page.evaluate(() => (window as unknown as { __events: { n: string; d: Record<string, string> }[] }).__events);
    const run = events.find((e) => e.n === 'tool_run' && e.d.outcome === 'error');
    expect(run?.d.error_class).toBe('UnsupportedFlvCodec');
    // No new fields: nothing in the event names the codec or the file.
    expect(JSON.stringify(events)).not.toMatch(/vp6|spark|sorenson|\.flv/i);
  });
}

test('FLV to MP4 refuses a file that is not an FLV with a plain message', async ({ page }) => {
  await open(page);
  await page.locator('#file-input').setInputFiles([{ name: 'broken.flv', mimeType: 'video/x-flv', buffer: Buffer.from('FLV\u0001\u0005\u0000\u0000\u0000\u0009 not really') }]);
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 30_000 });
});

test.describe('offline', () => {
  test.use({ serviceWorkers: 'allow' });
  test.beforeEach(async ({ context }) => allowServiceWorker(context));

  test('after one visit the FLV reader is cached and an FLV converts with the network off', async ({ page, context, browserName }) => {
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
    for (const f of ['libav-6.10.9.0-flv.mjs', 'libav-6.10.9.0-flv.wasm.mjs', 'libav-6.10.9.0-flv.wasm.wasm']) {
      expect(cached, f).toContain(`/vendor/libav.js@6.10.9.0/${f}`);
    }
    // The AVI decoder is not cached for an FLV page.
    expect(cached).not.toContain('/vendor/libav.js@6.10.9.0/libav-6.10.9.0-avi.wasm.wasm');
    await context.setOffline(true);
    await page.goto('/flv-to-mp4');
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    const o = await convert(page, 'h264-aac.flv');
    expectDone(o);
    await context.setOffline(false);
  });
});
