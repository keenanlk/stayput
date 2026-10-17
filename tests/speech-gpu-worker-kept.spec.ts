// @webkit-project
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
  await expect(page.locator('#results-list')).toContainText(/speech/);
  await expect(page.locator('#results-list')).not.toContainText('Wrote the captions');
  // A second job on the same page goes to the same, still running worker.
  const second = page.waitForEvent('download');
  await page.locator('#run').click();
  expect((await second).suggestedFilename()).toMatch(/\.mp4$/);
  await expect(page.locator('#results-list')).toContainText(/speech/);
  await expect(page.locator('#results-list')).not.toContainText('Wrote the captions');
  const seen = await page.evaluate(() => ({ started: (window as never as { __gpuWorkers: number }).__gpuWorkers, stopped: (window as never as { __gpuTerminated: number }).__gpuTerminated }));
  expect(seen).toEqual({ started: 1, stopped: 0 });
});

test('with a real WebGPU adapter, three runs in a row on one page load finish without the page crashing', async ({ page }, info) => {
  test.setTimeout(420_000);
  await page.addInitScript(() => {
    // Counts the WebGPU workers started and stopped; the real worker still runs.
    const w = window as unknown as { __gpuWorkers: number; __gpuTerminated: number };
    w.__gpuWorkers = 0;
    w.__gpuTerminated = 0;
    const Real = window.Worker;
    window.Worker = class extends Real {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (!/transcribe-gpu\.worker/.test(String(url))) return;
        w.__gpuWorkers++;
        const stop = this.terminate.bind(this);
        this.terminate = () => {
          w.__gpuTerminated++;
          stop();
        };
      }
    };
  });
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
  await page.goto('/auto-caption-video');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(speech(info.project.name));
  for (let n = 1; n <= 3; n++) {
    const download = page.waitForEvent('download', { timeout: 200_000 });
    await page.locator('#run').click();
    expect((await download).suggestedFilename(), `run ${n}`).toMatch(/\.mp4$/);
    await expect(page.locator('#results-list')).toContainText(/speech/, { timeout: 60_000 });
    await expect(page.locator('#results-list')).not.toContainText('Wrote the captions', { timeout: 60_000 });
    await expect(page.locator('#error')).not.toHaveClass(/is-active/);
    // The page still answers a while after the run.
    await page.waitForTimeout(5000);
    expect(await page.evaluate(() => 1 + 1), `page alive after run ${n}`).toBe(2);
    expect(crashed, `no crash after run ${n}`).toBe(false);
  }
  const seen = await page.evaluate(() => ({ started: (window as never as { __gpuWorkers: number }).__gpuWorkers, stopped: (window as never as { __gpuTerminated: number }).__gpuTerminated }));
  expect(seen).toEqual({ started: 1, stopped: 0 });
});
