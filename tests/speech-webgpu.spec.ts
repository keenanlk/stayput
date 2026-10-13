import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { statSync } from 'node:fs';
import { wantsWebgpu, WEBGPU_CAPTIONS, WEBGPU_CAPTIONS_ON_PHONES } from '../src/lib/speech-path';
import { SPEECH_MODEL_MB } from '../src/data/speech-size';

/**
 * The speech model's two paths: 8-bit weights on WebAssembly everywhere, and on computers with WebGPU
 * a 16-bit encoder on the graphics chip with the same 8-bit decoder. Whatever goes wrong with WebGPU,
 * captions still come out, from the 8-bit path.
 */
const SPOKEN = fileURLToPath(new URL('./fixtures/static/jfk.wav', import.meta.url));
const MODELS = fileURLToPath(new URL('../public/models/whisper-base/onnx/', import.meta.url));
const MODEL = /\/models\/whisper-base\/onnx\/.+\.onnx/;

const computer = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15', maxTouchPoints: 0, gpu: {} };
const env = (over: Record<string, unknown> = {}, search = '', store: Record<string, string> = {}) => ({
  search,
  nav: { ...computer, ...over } as never,
  store: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => void (store[k] = v) },
  now: 1_000_000,
});

test('the WebGPU path is chosen only where it can work, and one flag and two overrides turn it off', () => {
  expect(WEBGPU_CAPTIONS).toBe(true);
  expect(wantsWebgpu(env())).toBe(true);
  // No WebGPU in the browser.
  expect(wantsWebgpu(env({ gpu: undefined }))).toBe(false);
  // Phones and tablets stay on the 8-bit path until the hybrid is measured on a real device.
  expect(WEBGPU_CAPTIONS_ON_PHONES).toBe(false);
  expect(wantsWebgpu(env({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1', maxTouchPoints: 5 }))).toBe(false);
  expect(wantsWebgpu(env({ userAgent: computer.userAgent, maxTouchPoints: 5 }))).toBe(false); // iPadOS says Macintosh
  expect(wantsWebgpu(env({ userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/140 Mobile Safari/537.36' }))).toBe(false);
  // Little memory.
  expect(wantsWebgpu(env({ deviceMemory: 2 }))).toBe(false);
  expect(wantsWebgpu(env({ deviceMemory: 8 }))).toBe(true);
  // The address and storage overrides.
  expect(wantsWebgpu(env({}, '?webgpu=0'))).toBe(false);
  expect(wantsWebgpu(env({}, '?webgpu=1'))).toBe(true);
  // `?webgpu=1` (or storage) opts a phone or tablet in, but not one without WebGPU or with little memory, and `?webgpu=0` still wins.
  const phone = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1', maxTouchPoints: 5 };
  expect(wantsWebgpu(env(phone, '?webgpu=1'))).toBe(true);
  expect(wantsWebgpu(env(phone, '', { 'stayput-webgpu': '1' }))).toBe(true);
  expect(wantsWebgpu(env(phone, '?webgpu=0'))).toBe(false);
  expect(wantsWebgpu(env({ ...phone, gpu: undefined }, '?webgpu=1'))).toBe(false);
  expect(wantsWebgpu(env({ ...phone, deviceMemory: 2 }, '?webgpu=1'))).toBe(false);
  expect(wantsWebgpu(env({}, '', { 'stayput-webgpu': '0' }))).toBe(false);
  // A failure is remembered for a week, then tried again.
  expect(wantsWebgpu(env({}, '', { 'stayput-webgpu-failed': String(1_000_000 - 3600_000) }))).toBe(false);
  expect(wantsWebgpu(env({}, '', { 'stayput-webgpu-failed': String(1_000_000 - 8 * 24 * 3600_000) }))).toBe(true);
});

test('the download sizes in the copy are the sizes of the files', () => {
  const mb = (...names: string[]) => names.reduce((sum, n) => sum + statSync(`${MODELS}${n}`).size, 0) / 1e6;
  expect(Math.round(mb('encoder_model_quantized.onnx', 'decoder_model_merged_quantized.onnx'))).toBe(SPEECH_MODEL_MB.q8);
  expect(Math.round(mb('encoder_model_fp16.onnx', 'decoder_model_merged_quantized.onnx'))).toBe(SPEECH_MODEL_MB.webgpu);
});

/** A browser whose WebGPU says yes to the probe, in the page and in every worker, but cannot run a model. */
async function pretendWebgpu(page: Page) {
  const fake = () => {
    const gpu = { requestAdapter: async () => ({ features: new Set(['shader-f16']), requestDevice: async () => ({ destroy() {} }) }) };
    Object.defineProperty(navigator, 'gpu', { value: gpu, configurable: true });
  };
  await page.addInitScript(fake);
  await page.addInitScript((code) => {
    const Real = window.Worker;
    (window as unknown as { Worker: unknown }).Worker = class extends Real {
      constructor(url: string | URL, options?: WorkerOptions) {
        // A blob worker cannot resolve "/models/...", so its fetches get the page's origin.
        const src = `const nativeFetch = self.fetch.bind(self);
self.fetch = (input, init) => nativeFetch(typeof input === 'string' && input.startsWith('/') ? ${JSON.stringify(location.origin)} + input : input, init);
(${code})();
const held = [];
const hold = (e) => { e.stopImmediatePropagation(); held.push(e.data); };
self.addEventListener('message', hold, true);
await import(${JSON.stringify(new URL(String(url), location.href).href)});
self.removeEventListener('message', hold, true);
for (const data of held) self.dispatchEvent(new MessageEvent('message', { data }));`;
        super(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })), { ...options, type: 'module' });
      }
    };
  }, fake.toString());
}

async function transcribe(page: Page, search = '') {
  await page.goto(`/tools/transcribe${search}`);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(SPOKEN);
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 120_000 });
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  await expect(page.locator('#results-list')).toContainText(/English speech/);
}

const PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1';

function track(page: Page) {
  const files: string[] = [];
  const scripts: string[] = [];
  page.context().on('request', (r) => {
    if (MODEL.test(r.url())) files.push(new URL(r.url()).pathname.split('/').pop()!);
    if (/transcribe-gpu\.worker|transformers\.web/.test(r.url())) scripts.push(r.url());
  });
  return { files, scripts };
}

test('when WebGPU fails after it passed the probe, the 8-bit path writes the captions, and the next run goes straight there', async ({ page }) => {
  test.setTimeout(180_000);
  await pretendWebgpu(page);
  const seen = track(page);
  await transcribe(page);
  // The captions are the right words, from the 8-bit encoder, whatever the failed attempt fetched.
  expect(seen.files).toContain('encoder_model_quantized.onnx');
  expect(seen.files.filter((f) => f === 'decoder_model_merged_quantized.onnx').length).toBeGreaterThanOrEqual(1);
  expect(await page.evaluate(() => localStorage.getItem('stayput-webgpu-failed'))).not.toBeNull();
  // The next visit does not try again.
  const before = seen.scripts.length;
  await transcribe(page);
  expect(seen.scripts.length).toBe(before);
});

test('with WebGPU forced off, only the 8-bit files are fetched and no WebGPU code is loaded', async ({ page }) => {
  test.setTimeout(180_000);
  await pretendWebgpu(page);
  const seen = track(page);
  await transcribe(page, '?webgpu=0');
  expect([...seen.files].sort()).toEqual(['decoder_model_merged_quantized.onnx', 'encoder_model_quantized.onnx']);
  expect(seen.scripts).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('stayput-webgpu-failed'))).toBeNull();
});

test('with a real WebGPU adapter, the 16-bit encoder runs and the 8-bit encoder is not fetched', async ({ page }) => {
  test.setTimeout(180_000);
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
  const seen = track(page);
  await transcribe(page);
  expect([...seen.files].sort()).toEqual(['decoder_model_merged_quantized.onnx', 'encoder_model_fp16.onnx']);
  await expect(page.locator('#results-list')).toContainText(/22 words/);
  await expect(page.locator('#results-list')).toContainText('Wrote the captions with the graphics chip.');
});

test.describe('on a phone', () => {
  test.use({ userAgent: PHONE });

  test('with no flag the 8-bit path is chosen, and the path line says the processor wrote the captions', async ({ page }) => {
    test.setTimeout(180_000);
    await pretendWebgpu(page);
    const seen = track(page);
    await transcribe(page);
    expect([...seen.files].sort()).toEqual(['decoder_model_merged_quantized.onnx', 'encoder_model_quantized.onnx']);
    expect(seen.scripts).toEqual([]);
    await expect(page.locator('#results-list')).toContainText('Wrote the captions with the processor.');
  });

  test('with ?webgpu=1 the 16-bit WebGPU path is chosen, and a WebGPU that cannot run falls back to 8-bit with the captions written', async ({ page }) => {
    test.setTimeout(180_000);
    await pretendWebgpu(page);
    const seen = track(page);
    await transcribe(page, '?webgpu=1');
    // The WebGPU worker and the 16-bit encoder were asked for, then the 8-bit encoder wrote the words.
    expect(seen.scripts.length).toBeGreaterThan(0);
    expect(seen.files).toContain('encoder_model_fp16.onnx');
    expect(seen.files).toContain('encoder_model_quantized.onnx');
    await expect(page.locator('#results-list')).toContainText('Wrote the captions with the processor.');
  });
});

test('on a computer the path line says the processor wrote the captions when WebGPU is off', async ({ page }) => {
  test.setTimeout(180_000);
  await transcribe(page, '?webgpu=0');
  await expect(page.locator('#results-list')).toContainText('Wrote the captions with the processor.');
});
