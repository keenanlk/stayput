import { test, expect, type Page } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Burned-in captions need the browser's H.264 encoder to answer. Safari/WebKit's can go silent with
// the settings Mediabunny picks first; the page must then use settings that work, or say so at once
// and link to Video to subtitles. Runs in the chromium project and in the webkit project (CI).
const clip = fileURLToPath(new URL('./fixtures/static/clip.webm', import.meta.url));

function srtFile(): string {
  const file = join(mkdtempSync(join(tmpdir(), 'stayput-')), 'clip.srt');
  writeFileSync(file, '1\n00:00:00,000 --> 00:00:01,500\nHello from the park\n');
  return file;
}

async function open(page: Page) {
  await page.goto('/auto-caption-video');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
}

test('burned-in captions finish here and give a playable mp4', async ({ page }, info) => {
  test.setTimeout(120_000);
  await open(page);
  const download = page.waitForEvent('download');
  await page.locator('#file-input').setInputFiles([clip, srtFile()]);
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 90_000 });
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  const path = await (await download).path();
  expect(path).toBeTruthy();
  info.annotations.push({ type: 'browser', description: info.project.name });
});

test('an encoder that never answers is caught at once, with a plain message and a link, before any transcribing', async ({ page }) => {
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
  const requested: string[] = [];
  page.on('request', (r) => requested.push(r.url()));
  await open(page);
  // No subtitle file, so a working page would start transcribing (and downloading the speech model).
  await page.locator('#file-input').setInputFiles([clip]);
  const started = Date.now();
  await page.locator('#run').click();
  const error = page.locator('#error');
  await expect(error).toHaveClass(/is-active/, { timeout: 20_000 });
  expect(Date.now() - started).toBeLessThan(15_000);
  await expect(error).toContainText("Burned-in captions don't work in this browser yet");
  await expect(error).not.toContainText('EncoderStall');
  await expect(error).not.toContainText('stopped responding');
  const link = error.locator('a');
  await expect(link).toHaveAttribute('href', '/video-to-subtitles');
  expect(requested.filter((u) => /onnx|whisper|huggingface|\.bin(\?|$)/i.test(u))).toEqual([]);
  await link.click();
  await expect(page).toHaveURL(/\/video-to-subtitles$/);
});
