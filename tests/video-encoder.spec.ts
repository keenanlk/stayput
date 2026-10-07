import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// The tools that re-encode H.264 share one encoder check (src/lib/encoder-probe.ts). Safari/WebKit's
// encoder can go silent with the settings Mediabunny picks first; each tool must still give a playable
// mp4, and say so at once when no encoder answers. Runs in the chromium project and in the webkit project (CI).
const clip = fileURLToPath(new URL('./fixtures/static/clip.webm', import.meta.url));
// 4 s of H.264 with a 440 Hz tone, AAC mono at 16 kHz (the shape phone recordings have).
const toneClip = fileURLToPath(new URL('./fixtures/static/tone-16k-mono.mp4', import.meta.url));
// 4 s of a 1280x720 picture turned 90 degrees by the file (so it shows as 720x1280, the way an iPhone holds the camera), in a
// QuickTime .mov with 44.1 kHz stereo AAC: once as H.264 and once as HEVC.
const phoneMov = fileURLToPath(new URL('./fixtures/static/iphone-portrait.mov', import.meta.url));
const phoneHevc = fileURLToPath(new URL('./fixtures/static/iphone-hevc.mov', import.meta.url));

async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
}

/** Run once with the clip, wait for the result, and return the saved file's bytes. */
async function runOnce(page: Page): Promise<Buffer> {
  const download = page.waitForEvent('download');
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 150_000 });
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  const path = await (await download).path();
  const { readFileSync } = await import('node:fs');
  return readFileSync(path);
}

/** An mp4 starts with an ftyp box; the page's own player must also be able to load it. */
async function expectPlayableMp4(page: Page, bytes: Buffer): Promise<{ width: number; height: number; duration: number }> {
  expect(bytes.subarray(4, 8).toString('latin1')).toBe('ftyp');
  const probe = await page.evaluate(async (data) => {
    const url = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: 'video/mp4' }));
    const v = document.createElement('video');
    v.muted = true;
    v.src = url;
    const ok = await new Promise<boolean>((resolve) => {
      v.onloadeddata = () => resolve(true);
      v.onerror = () => resolve(false);
      setTimeout(() => resolve(false), 15_000);
    });
    return { ok, width: v.videoWidth, height: v.videoHeight, duration: v.duration };
  }, [...bytes]);
  expect(probe.ok).toBe(true);
  expect(probe.width).toBeGreaterThan(0);
  expect(probe.duration).toBeGreaterThan(1);
  return probe;
}

/** The mp4's sound must decode end to end, with the channel count the source had and a real tone in it. */
async function expectAudioDecodes(page: Page, bytes: Buffer, channels: number) {
  const r = await page.evaluate(async (data) => {
    try {
      const ctx = new AudioContext();
      const buf = await ctx.decodeAudioData(new Uint8Array(data).buffer);
      const pcm = buf.getChannelData(0);
      let peak = 0;
      for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]!));
      return { ok: true, channels: buf.numberOfChannels, seconds: buf.duration, peak };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }, [...bytes]);
  expect(r, JSON.stringify(r)).toMatchObject({ ok: true, channels });
  expect(r.seconds).toBeGreaterThan(3);
  expect(r.peak).toBeGreaterThan(0.05);
}

test('Compress video keeps the sound: a mono 16 kHz AAC track decodes cleanly', async ({ page }) => {
  test.setTimeout(240_000);
  await open(page, '/tools/compress-video');
  await page.locator('#file-input').setInputFiles([toneClip]);
  const bytes = await runOnce(page);
  await expectPlayableMp4(page, bytes);
  await expectAudioDecodes(page, bytes, 1);
});

test('Trim video (exact cut) keeps the sound: a mono 16 kHz AAC track decodes cleanly', async ({ page }) => {
  test.setTimeout(240_000);
  await open(page, '/tools/trim-video');
  await page.locator('#file-input').setInputFiles([toneClip]);
  await page.locator('#exact').check();
  const bytes = await runOnce(page);
  await expectPlayableMp4(page, bytes);
  await expectAudioDecodes(page, bytes, 1);
});

test('Video to MP4 keeps the sound: a mono 16 kHz AAC track decodes cleanly', async ({ page, browserName }) => {
  // Video to MP4 keeps AAC for the sound, which Playwright's Chromium on Linux cannot decode in the page.
  test.skip(browserName !== 'webkit', 'only WebKit decodes AAC in every CI image');
  test.setTimeout(240_000);
  await open(page, '/tools/video-to-mp4');
  await page.locator('#file-input').setInputFiles([toneClip]);
  const bytes = await runOnce(page);
  await expectPlayableMp4(page, bytes);
  await expectAudioDecodes(page, bytes, 1);
});

test('Resize video turns an iPhone-style portrait .mov into a playable mp4 at the new size, with its sound', async ({ page, browserName }) => {
  test.setTimeout(240_000);
  await open(page, '/tools/resize-video');
  await page.locator('#size').selectOption('480');
  await page.locator('#file-input').setInputFiles([phoneMov]);
  const bytes = await runOnce(page);
  // 720x1280 as shown, so the short side 480 gives 480x854.
  const probe = await expectPlayableMp4(page, bytes);
  expect([probe.width, probe.height]).toEqual([480, 854]);
  // Playwright's Chromium on Linux cannot decode AAC in the page; WebKit can everywhere.
  if (browserName === 'webkit') await expectAudioDecodes(page, bytes, 2);
});

test('Resize video takes an iPhone-style HEVC .mov where the browser can decode HEVC', async ({ page }) => {
  test.setTimeout(240_000);
  await open(page, '/tools/resize-video');
  const hevc = await page.evaluate(async () => typeof VideoDecoder !== 'undefined' && (await VideoDecoder.isConfigSupported({ codec: 'hvc1.1.6.L120.90' })).supported);
  test.skip(!hevc, 'this browser has no HEVC decoder (iPhones and Macs do)');
  await page.locator('#size').selectOption('480');
  await page.locator('#file-input').setInputFiles([phoneHevc]);
  const probe = await expectPlayableMp4(page, await runOnce(page));
  expect([probe.width, probe.height]).toEqual([480, 854]);
});

for (const mode of ['balanced', 'size']) {
  test(`Compress video (${mode}) keeps an iPhone-style .mov's sound where the browser has no audio encoder or decoder (iOS 18.4)`, async ({ page, browserName }) => {
    // Safari on iOS 18.4 has neither WebCodecs AudioEncoder nor AudioDecoder, so the AAC packets must be copied across.
    test.skip(browserName !== 'webkit', 'only WebKit decodes AAC in the page in every CI image');
    test.setTimeout(240_000);
    await page.addInitScript(() => {
      delete (window as { AudioEncoder?: unknown }).AudioEncoder;
      delete (window as { AudioDecoder?: unknown }).AudioDecoder;
    });
    await open(page, '/tools/compress-video');
    expect(await page.evaluate(() => typeof AudioEncoder + typeof AudioDecoder)).toBe('undefinedundefined');
    await page.locator('#mode').selectOption(mode);
    if (mode === 'size') await page.locator('#size').selectOption('8');
    await page.locator('#file-input').setInputFiles([phoneMov]);
    const bytes = await runOnce(page);
    await expectAudioDecodes(page, bytes, 2);
    await expectPlayableMp4(page, bytes);
    await expect(page.locator('#results-list')).not.toContainText('sound left out');
  });
}

test('Merge videos keeps the sound of two iPhone-style .mov clips where the browser has no audio encoder or decoder (iOS 18.4)', async ({ page, browserName }) => {
  test.skip(browserName !== 'webkit', 'only WebKit decodes AAC in the page in every CI image');
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    delete (window as { AudioEncoder?: unknown }).AudioEncoder;
    delete (window as { AudioDecoder?: unknown }).AudioDecoder;
  });
  await open(page, '/tools/merge-videos');
  await page.locator('#file-input').setInputFiles([phoneMov, phoneMov]);
  const bytes = await runOnce(page);
  await expectPlayableMp4(page, bytes);
  const r = await page.evaluate(async (data) => {
    const buf = await new AudioContext().decodeAudioData(new Uint8Array(data).buffer);
    const pcm = buf.getChannelData(0);
    // Peak in each half: both clips must carry their tone.
    const half = pcm.length >> 1;
    const peak = (a: number, b: number) => pcm.subarray(a, b).reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    return { seconds: buf.duration, channels: buf.numberOfChannels, first: peak(0, half), second: peak(half, pcm.length) };
  }, [...bytes]);
  expect(r.channels).toBe(2);
  expect(r.seconds).toBeGreaterThan(7.5);
  expect(r.first).toBeGreaterThan(0.05);
  expect(r.second).toBeGreaterThan(0.05);
});

test('Compress video gives a playable mp4, twice on the same page', async ({ page }) => {
  test.setTimeout(240_000);
  await open(page, '/tools/compress-video');
  await page.locator('#file-input').setInputFiles([clip]);
  await expectPlayableMp4(page, await runOnce(page));
  // A second run must not register the encoder again or wedge it.
  await page.locator('#clear').click();
  await page.locator('#file-input').setInputFiles([clip]);
  await expectPlayableMp4(page, await runOnce(page));
});

test('Video background remover (blur) gives a playable mp4', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await open(page, '/blur-video-background');
  await page.locator('#file-input').setInputFiles([clip]);
  await expectPlayableMp4(page, await runOnce(page));
  // MediaPipe tries to post usage logs to Google after a few runs; the page's CSP blocks it, which is the point.
  expect(errors.filter((e) => !e.includes('XNNPACK') && !e.includes('odml.pa.googleapis.com') && !e.includes('Content Security Policy'))).toEqual([]);
});

test('an encoder that never answers is caught at once, with a plain message and no caption wording', async ({ page }) => {
  await page.addInitScript(() => {
    const Real = window.VideoEncoder;
    class Silent {
      static isConfigSupported(config: VideoEncoderConfig) {
        return Real.isConfigSupported(config);
      }
      state = 'unconfigured';
      encodeQueueSize = 0;
      ondequeue: unknown = null;
      configure() {
        this.state = 'configured';
      }
      encode() {}
      flush() {
        return new Promise<void>(() => undefined);
      }
      reset() {}
      close() {
        this.state = 'closed';
      }
      addEventListener() {}
    }
    (window as unknown as { VideoEncoder: unknown }).VideoEncoder = Silent;
  });
  await open(page, '/tools/compress-video');
  await page.locator('#file-input').setInputFiles([clip]);
  const started = Date.now();
  await page.locator('#run').click();
  const error = page.locator('#error');
  await expect(error).toHaveClass(/is-active/, { timeout: 20_000 });
  expect(Date.now() - started).toBeLessThan(15_000);
  await expect(error).toContainText("video encoder stopped responding");
  await expect(error).toContainText('Try Chrome or Firefox');
  await expect(error).not.toContainText('captions');
  await expect(error.locator('a')).toHaveCount(0);
});
