import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * Add subtitles stops the speech worker once the captions are written, to give the memory back. The WebGPU
 * worker must not be stopped that way: terminating it while onnxruntime's WebGPU session is live crashes the
 * whole page in WebKit, right after the captions, so no video comes out. Runs in the chromium project and in
 * the webkit project (CI, or locally with PW_WEBKIT=1).
 */
const here = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));
// CI's Chromium cannot decode AAC and Linux WebKit cannot decode Opus.
const speech = (project: string) => here(project === 'webkit' ? 'speech.mov' : 'talk.webm');

async function run(page: Page, file: string) {
  await page.goto('/auto-caption-video');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(file);
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 150_000 });
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
}

test('the WebGPU speech worker is left running when the captions are written', async ({ page }, info) => {
  test.setTimeout(180_000);
  // A WebGPU worker that answers at once, and counts the times it is stopped.
  await page.addInitScript(() => {
    const w = window as unknown as { __gpuWorkers: number; __gpuTerminated: number; Worker: unknown };
    w.__gpuWorkers = 0;
    w.__gpuTerminated = 0;
    Object.defineProperty(navigator, 'gpu', { value: {}, configurable: true });
    const Real = window.Worker;
    w.Worker = class extends Real {
      constructor(url: string | URL, options?: WorkerOptions) {
        if (!/transcribe-gpu\.worker/.test(String(url))) return new Real(url, options);
        super(url, options);
        w.__gpuWorkers++;
        const fake = new EventTarget() as EventTarget & { postMessage(msg: { id: number }): void; terminate(): void };
        fake.postMessage = ({ id }) => {
          const data = { id, type: 'result', chunks: [{ start: 0, end: 1, text: ' Hello there.' }], language: 'en' };
          setTimeout(() => fake.dispatchEvent(new MessageEvent('message', { data })), 0);
        };
        fake.terminate = () => void w.__gpuTerminated++;
        return fake as unknown as Worker;
      }
    };
  });
  await run(page, speech(info.project.name));
  await expect(page.locator('#results-list')).toContainText('Wrote the captions with the graphics chip.');
  const seen = await page.evaluate(() => ({ started: (window as never as { __gpuWorkers: number }).__gpuWorkers, stopped: (window as never as { __gpuTerminated: number }).__gpuTerminated }));
  expect(seen).toEqual({ started: 1, stopped: 0 });
});

test('with a real WebGPU adapter, the captions are written and burned in without the page crashing', async ({ page }, info) => {
  test.setTimeout(240_000);
  await page.goto('/');
  const real = await page.evaluate(async () => {
    try {
      const a = await (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ features: Set<string> } | null> } }).gpu?.requestAdapter();
      return !!a && a.features.has('shader-f16');
    } catch {
      return false;
    }
  });
  test.skip(!real, 'this browser has no WebGPU adapter with 16-bit shaders');
  let crashed = false;
  page.on('crash', () => (crashed = true));
  const download = page.waitForEvent('download').catch(() => undefined);
  await run(page, speech(info.project.name));
  await expect(page.locator('#results-list')).toContainText('Wrote the captions with the graphics chip.');
  expect(crashed).toBe(false);
  expect(download).toBeTruthy();
});
