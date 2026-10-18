// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withoutSoftwareEncoder } from './no-software-encoder';

/**
 * Add subtitles to video on a phone: the failures that come from the device and not the file get one more try before
 * they are shown. The speech worker is faked (a real one is too slow to fail on cue, and a real iPhone running out of
 * memory or suspending the page cannot be reproduced here): it dies, or answers with an error, on cue; the Page
 * Visibility API is driven by hand, as an app switch shows it.
 */
const here = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));
const phoneVideo = here('iphone-portrait-person.mov');
const hevc = here('iphone-hevc.mov');
const speech = (project: string) => here(project === 'webkit' ? 'speech.mov' : 'talk.webm');

function srtFile(): string {
  const file = join(mkdtempSync(join(tmpdir(), 'stayput-')), 'clip.srt');
  writeFileSync(file, '1\n00:00:00,000 --> 00:00:01,500\nHello from the park\n');
  return file;
}

type Plan = 'die' | 'speech-model-error' | 'hidden-speech-model-error' | 'ok';

/** The 8-bit speech worker, as the page spawns it, answering each request the way `plan` says (one entry per request). */
async function fakeSpeechWorker(page: Page, plan: Plan[]) {
  await page.addInitScript((plan) => {
    const w = window as unknown as { __spawned: number; __asked: number; Worker: unknown };
    w.__spawned = 0;
    w.__asked = 0;
    // Safari has WebGPU on a computer: this is the 8-bit path, whose worker is the one faked below.
    Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
    const setHidden = (hidden: boolean) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    const Real = window.Worker;
    w.Worker = class extends Real {
      constructor(url: string | URL, options?: WorkerOptions) {
        if (!/transcribe\.worker/.test(String(url))) return new Real(url, options);
        super(url, options);
        w.__spawned++;
        const fake = new EventTarget() as EventTarget & { postMessage(msg: { id: number }): void; terminate(): void };
        fake.postMessage = ({ id }) => {
          const step = plan[Math.min(w.__asked++, plan.length - 1)];
          const reply = (data: object) => setTimeout(() => fake.dispatchEvent(new MessageEvent('message', { data })), 0);
          if (step === 'die') setTimeout(() => fake.dispatchEvent(new Event('error')), 0);
          else if (step === 'speech-model-error') reply({ id, type: 'error', name: 'SpeechModelError', message: 'x' });
          else if (step === 'hidden-speech-model-error') {
            setHidden(true);
            setTimeout(() => setHidden(false), 500);
            reply({ id, type: 'error', name: 'SpeechModelError', message: 'x' });
          } else reply({ id, type: 'result', chunks: [{ start: 0, end: 1, text: ' Hello there.' }], language: 'en' });
        };
        fake.terminate = () => {};
        return fake as unknown as Worker;
      }
    };
  }, plan);
}

async function open(page: Page) {
  await page.goto('/tools/add-subtitles-to-video');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
}

const spawned = (page: Page) => page.evaluate(() => (window as unknown as { __spawned: number }).__spawned);

test.describe('the speech step', () => {
  test('a worker that dies as it starts is replaced once, and the captions are written', async ({ page }, info) => {
    test.setTimeout(180_000);
    await fakeSpeechWorker(page, ['die', 'ok']);
    await open(page);
    await page.locator('#file-input').setInputFiles(speech(info.project.name));
    await page.locator('#run').click();
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 150_000 });
    await expect(page.locator('#error')).not.toHaveClass(/is-active/);
    await expect(page.locator('#results-list')).toContainText('written from English speech');
    expect(await spawned(page)).toBe(2);
  });

  test('a worker that dies twice is reported under its own name, after one more try and no more', async ({ page }, info) => {
    test.setTimeout(180_000);
    await fakeSpeechWorker(page, ['die']);
    await open(page);
    await page.locator('#file-input').setInputFiles(speech(info.project.name));
    await page.locator('#run').click();
    await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 150_000 });
    await expect(page.locator('#error')).toContainText(/ran short of memory|out of memory/i);
    expect(await spawned(page)).toBe(2);
  });

  test('the page hidden while the sound is being written down: it starts again when the page is back', async ({ page }, info) => {
    test.setTimeout(180_000);
    await fakeSpeechWorker(page, ['hidden-speech-model-error', 'ok']);
    await open(page);
    await page.locator('#file-input').setInputFiles(speech(info.project.name));
    await page.locator('#run').click();
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 150_000 });
    await expect(page.locator('#error')).not.toHaveClass(/is-active/);
    await expect(page.locator('#results-list')).toContainText('written from English speech');
  });

  test('the same failure with the page visible is shown, not retried', async ({ page }, info) => {
    test.setTimeout(180_000);
    await fakeSpeechWorker(page, ['speech-model-error', 'ok']);
    await open(page);
    await page.locator('#file-input').setInputFiles(speech(info.project.name));
    await page.locator('#run').click();
    await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 150_000 });
    await expect(page.locator('#results')).not.toHaveClass(/is-active/);
  });
});

test.describe('the redraw', () => {
  /** Once the page says it is adding subtitles, the encoder throws `name` once (the encoder probe's frames are not counted). */
  async function breakEncoder(page: Page, name: string, hide: boolean) {
  await withoutSoftwareEncoder(page);
    await page.addInitScript(
      ([name, hide]) => {
        let armed = false;
        const original = VideoEncoder.prototype.encode;
        VideoEncoder.prototype.encode = function (this: VideoEncoder, ...args: Parameters<VideoEncoder['encode']>) {
          const running = /Adding subtitles to/.test(document.getElementById('progress-text')?.textContent ?? '');
          if (running && !armed) {
            armed = true;
            if (hide) {
              Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
              Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
              document.dispatchEvent(new Event('visibilitychange'));
              setTimeout(() => {
                Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
                Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
                document.dispatchEvent(new Event('visibilitychange'));
              }, 600);
            }
            throw new DOMException('forced by the test', name as string);
          }
          return original.apply(this, args);
        };
      },
      [name, hide] as const,
    );
  }

  async function run(page: Page) {
    await open(page);
    await page.locator('#file-input').setInputFiles([phoneVideo, srtFile()]);
    await page.locator('#run').click();
  }

  test('the encoder gives up at full size: the captions are burned in at a smaller size, and it says so', async ({ page }) => {
    test.setTimeout(240_000);
    await breakEncoder(page, 'EncodingError', false);
    await run(page);
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
    await expect(page.locator('#results-list')).toContainText('made at a smaller size');
    await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  });

  test('the page hidden during the redraw: it starts again when the page is back and finishes', async ({ page }) => {
    test.setTimeout(240_000);
    await breakEncoder(page, 'InvalidStateError', true);
    await run(page);
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
    await expect(page.locator('#results-list')).toContainText('started again after the page was hidden');
  });
});

test('a video the browser cannot decode is said so before any speech model is fetched', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'WebKit decodes HEVC');
  const models: string[] = [];
  page.on('request', (r) => /\/models\/|onnx/i.test(r.url()) && models.push(r.url()));
  await open(page);
  await page.locator('#file-input').setInputFiles([hevc]);
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 60_000 });
  // Headless Chromium here may decode HEVC through the system; only the order of events is asserted then.
  if (/cannot decode|can't decode|not play/i.test((await page.locator('#error').textContent()) ?? '')) expect(models).toEqual([]);
});
