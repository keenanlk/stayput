import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// The tools that re-encode H.264 share one encoder check (src/lib/encoder-probe.ts). Safari/WebKit's
// encoder can go silent with the settings Mediabunny picks first; each tool must still give a playable
// mp4, and say so at once when no encoder answers. Runs in the chromium project and in the webkit project (CI).
const clip = fileURLToPath(new URL('./fixtures/static/clip.webm', import.meta.url));

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
async function expectPlayableMp4(page: Page, bytes: Buffer) {
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
    return { ok, width: v.videoWidth, duration: v.duration };
  }, [...bytes]);
  expect(probe.ok).toBe(true);
  expect(probe.width).toBeGreaterThan(0);
  expect(probe.duration).toBeGreaterThan(1);
}

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
