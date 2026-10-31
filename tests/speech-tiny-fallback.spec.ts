// @webkit-project
import { test, expect, devices, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { speechModel, TINY_KEY } from '../src/lib/speech-path';
import { PHONE_SAFE_BYTES } from '../src/lib/phone-limit';

/**
 * Phones step down to the smaller Whisper model (tiny, 41 MB) after the base model dies of memory, and start with it
 * when the risk is known. The speech worker is faked, as in speech-tools-recovery.spec.ts, so a failure happens on cue
 * (a real iPhone running out of memory cannot be reproduced here); each request's `model` is recorded in `window.__models`.
 * The last test runs the real worker on the tiny files.
 */
const here = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));
const speech = (project: string) => here(project === 'webkit' ? 'speech.mov' : 'talk.webm');
const PATH = '/auto-caption-video';
const KEYS = new Set(['tool', 'outcome', 'attempt', 'files', 'input', 'output', 'duration', 'format', 'error_class', 'landing', 'ref', 'from', 'visit', 'prev_tool', 'run_n', 'tools_used', 'run_gap', 'ns', 'via', 'variant']);
type Ev = { n: string; d: Record<string, string> };
const events = (page: Page): Promise<Ev[]> => page.evaluate(() => JSON.parse(sessionStorage.getItem('__ev') || '[]'));

/** An iPhone's user agent, screen and touch, on whichever engine runs the spec (the device's own default browser is not forced). */
const { defaultBrowserType: _ignored, ...iPhone } = devices['iPhone 15'];
const phone = test.describe;

type Plan = 'oom' | 'die' | 'ok';

async function recordEvents(page: Page) {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const k='__ev';const a=JSON.parse(sessionStorage.getItem(k)||'[]');a.push({n,d});sessionStorage.setItem(k,JSON.stringify(a));}};`,
    }),
  );
}

/** The 8-bit speech worker, answering each request the way `plan` says (one entry per request, the last one repeating) and recording the model it was asked for. */
async function fakeSpeechWorker(page: Page, plan: Plan[]) {
  await page.addInitScript((plan) => {
    const w = window as unknown as { __spawned: number; __asked: number; __models: string[]; Worker: unknown };
    w.__spawned = 0;
    w.__asked = 0;
    w.__models = [];
    // Safari has WebGPU on a computer: this is the 8-bit path, whose worker is the one faked below.
    Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
    const Real = window.Worker;
    w.Worker = class extends Real {
      constructor(url: string | URL, options?: WorkerOptions) {
        if (!/transcribe\.worker/.test(String(url))) return new Real(url, options);
        super(url, options);
        w.__spawned++;
        const fake = new EventTarget() as EventTarget & { postMessage(msg: { id: number; model: string }): void; terminate(): void };
        fake.postMessage = ({ id, model }) => {
          w.__models.push(model);
          const step = plan[Math.min(w.__asked++, plan.length - 1)];
          if (step === 'die') return void setTimeout(() => fake.dispatchEvent(new Event('error')), 0);
          const data =
            step === 'oom'
              ? { id, type: 'error', name: 'OutOfMemoryError', message: 'forced by the test' }
              : { id, type: 'result', chunks: [{ start: 0, end: 1, text: ' Hello there.' }], language: 'en' };
          setTimeout(() => fake.dispatchEvent(new MessageEvent('message', { data })), 0);
        };
        fake.terminate = () => {};
        return fake as unknown as Worker;
      }
    };
  }, plan);
}

async function open(page: Page, path = PATH) {
  await page.goto(path);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
}

async function runOnce(page: Page, project: string) {
  await page.locator('#file-input').setInputFiles(speech(project));
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 150_000 });
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
}

const models = (page: Page) => page.evaluate(() => (window as unknown as { __models: string[] }).__models);
const spawned = (page: Page) => page.evaluate(() => (window as unknown as { __spawned: number }).__spawned);

phone('a phone', () => {
  test.use(iPhone);

  test('steps down to the smaller model after a memory death, and says so', async ({ page }, info) => {
    test.setTimeout(240_000);
    await recordEvents(page);
    await fakeSpeechWorker(page, ['oom', 'ok']);
    await open(page);
    await runOnce(page, info.project.name);
    expect(await models(page)).toEqual(['whisper-base', 'whisper-tiny']);
    expect(await spawned(page)).toBe(2);
    await expect(page.locator('#results-list')).toContainText(/smaller speech model/);
    await expect.poll(async () => (await events(page)).filter((e) => e.n === 'tool_run').length).toBe(1);
    expect((await events(page)).find((e) => e.n === 'tool_run')!.d).toMatchObject({ outcome: 'ok' });
  });

  test('a worker that dies at start-up steps down too', async ({ page }, info) => {
    test.setTimeout(240_000);
    await fakeSpeechWorker(page, ['die', 'ok']);
    await open(page);
    await runOnce(page, info.project.name);
    expect(await models(page)).toEqual(['whisper-base', 'whisper-tiny']);
  });

  test('a second run in the same tab starts with the smaller model; a new tab starts with base', async ({ page, context }, info) => {
    test.setTimeout(300_000);
    await fakeSpeechWorker(page, ['oom', 'ok']);
    await open(page);
    await runOnce(page, info.project.name);
    await page.locator('#clear').click();
    // The hint above Run mentions the smaller download once it will be used.
    await page.locator('#file-input').setInputFiles(speech(info.project.name));
    await expect(page.locator('#tool')).toContainText('about 45 MB in all');
    await page.locator('#run').click();
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 150_000 });
    expect((await models(page)).slice(2)).toEqual(['whisper-tiny']);
    // A new tab does not share sessionStorage.
    const fresh = await context.newPage();
    await fakeSpeechWorker(fresh, ['ok']);
    await open(fresh);
    await expect(fresh.locator('#tool')).not.toContainText('about 45 MB in all');
    await runOnce(fresh, info.project.name);
    expect(await models(fresh)).toEqual(['whisper-base']);
    await expect(fresh.locator('#results-list')).not.toContainText(/smaller speech model/);
  });

  test('a phone with 2 GB of memory starts with the smaller model, and the note does not blame memory', async ({ page }, info) => {
    test.setTimeout(240_000);
    await page.addInitScript(() => Object.defineProperty(navigator, 'deviceMemory', { value: 2, configurable: true }));
    await fakeSpeechWorker(page, ['ok']);
    await open(page);
    await runOnce(page, info.project.name);
    expect(await models(page)).toEqual(['whisper-tiny']);
    await expect(page.locator('#results-list')).toContainText(/smaller speech model/);
    await expect(page.locator('#results-list')).not.toContainText(/ran short of memory/);
  });

  test('a phone with 4 GB of memory and a small file starts with base', async ({ page }, info) => {
    test.setTimeout(240_000);
    await page.addInitScript(() => Object.defineProperty(navigator, 'deviceMemory', { value: 4, configurable: true }));
    await fakeSpeechWorker(page, ['ok']);
    await open(page);
    await runOnce(page, info.project.name);
    expect(await models(page)).toEqual(['whisper-base']);
  });

  test('a second memory death shows the named error after the one retry, with no third try', async ({ page }, info) => {
    test.setTimeout(240_000);
    await recordEvents(page);
    await fakeSpeechWorker(page, ['oom', 'oom']);
    await open(page);
    await page.locator('#file-input').setInputFiles(speech(info.project.name));
    await page.locator('#run').click();
    await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 150_000 });
    expect(await spawned(page)).toBe(2);
    expect(await models(page)).toEqual(['whisper-base', 'whisper-tiny']);
    await expect.poll(async () => (await events(page)).filter((e) => e.n === 'tool_run').length).toBe(1);
    const all = await events(page);
    expect(all.find((e) => e.n === 'tool_run')!.d).toMatchObject({ outcome: 'error', error_class: 'OutOfMemoryError' });
    for (const e of all) for (const k of Object.keys(e.d)) expect(KEYS.has(k), `${e.n} carries unexpected key ${k}`).toBe(true);
  });
});

test('a computer asks for base both times and says nothing about a smaller model', async ({ page }, info) => {
  test.setTimeout(240_000);
  await recordEvents(page);
  await fakeSpeechWorker(page, ['oom', 'ok']);
  await open(page);
  await runOnce(page, info.project.name);
  expect(await models(page)).toEqual(['whisper-base', 'whisper-base']);
  await expect(page.locator('#results-list')).not.toContainText(/smaller speech model/);
  expect(await page.evaluate(() => sessionStorage.getItem('stayput-speech-tiny'))).toBeNull();
  for (const e of await events(page)) for (const k of Object.keys(e.d)) expect(KEYS.has(k), `${e.n} carries unexpected key ${k}`).toBe(true);
});

test('the real worker loads the tiny files and transcribes a spoken sentence', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'The real worker is slow to run in WebKit; the fake-worker tests above cover it there');
  test.setTimeout(240_000);
  const requests: string[] = [];
  page.on('request', (r) => /\/models\/.+\.onnx$/.test(new URL(r.url()).pathname) && requests.push(new URL(r.url()).pathname));
  await page.goto('/tools/transcribe?speechModel=tiny');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(here('jfk.wav'));
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  // The transcript itself sits in the page's text area under the result.
  await expect.poll(() => page.locator('#results-list textarea').inputValue()).toMatch(/ask not what your country/i);
  expect(requests.sort()).toEqual(['/models/whisper-tiny/onnx/decoder_model_merged_quantized.onnx', '/models/whisper-tiny/onnx/encoder_model_quantized.onnx']);
  // The smaller model is kept in a store of its own, so evicting base's would not touch it.
  const caches = await page.evaluate(async () => {
    const out: Record<string, number> = {};
    for (const name of await globalThis.caches.keys()) out[name] = (await (await globalThis.caches.open(name)).keys()).length;
    return out;
  });
  expect(Object.keys(caches)).toContain('transformers-cache-whisper-tiny');
  expect(Object.keys(caches)).not.toContain('transformers-cache');
});

/** The choice itself, for the devices and file sizes a fake worker cannot show (the decision is made on the page's own values). */
test.describe('speechModel', () => {
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1';
  const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15';
  const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
  const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
  const env = (userAgent: string, o: { touch?: number; memory?: number; flag?: boolean; search?: string } = {}) => ({
    search: o.search ?? '',
    session: { getItem: (k: string) => (k === TINY_KEY && o.flag ? '1' : null), setItem: () => {} },
    nav: { userAgent, maxTouchPoints: o.touch ?? 0, deviceMemory: o.memory },
    now: 0,
  });
  const big = PHONE_SAFE_BYTES + 1;

  test('file size: iPhone and iPad go tiny-first over the phone limit; Android and computers do not', () => {
    expect(speechModel(env(IPHONE, { touch: 5 }), 50e6)).toBe('whisper-base');
    expect(speechModel(env(IPHONE, { touch: 5 }), 150e6)).toBe('whisper-base');
    expect(speechModel(env(IPHONE, { touch: 5 }), PHONE_SAFE_BYTES)).toBe('whisper-base');
    expect(speechModel(env(IPHONE, { touch: 5 }), big)).toBe('whisper-tiny');
    expect(speechModel(env(IPAD, { touch: 5 }), big)).toBe('whisper-tiny');
    expect(speechModel(env(ANDROID, { touch: 5, memory: 8 }), big)).toBe('whisper-base');
    expect(speechModel(env(MAC), big)).toBe('whisper-base');
  });

  test('memory: 2 GB or less on a phone is tiny-first; a computer never is', () => {
    expect(speechModel(env(ANDROID, { touch: 5, memory: 2 }))).toBe('whisper-tiny');
    expect(speechModel(env(ANDROID, { touch: 5, memory: 1 }))).toBe('whisper-tiny');
    expect(speechModel(env(ANDROID, { touch: 5, memory: 4 }))).toBe('whisper-base');
    expect(speechModel(env(MAC, { memory: 0.5 }))).toBe('whisper-base');
  });

  test('the tab flag only counts on a phone, and the address override is for tests', () => {
    expect(speechModel(env(IPHONE, { touch: 5, flag: true }))).toBe('whisper-tiny');
    expect(speechModel(env(MAC, { flag: true }))).toBe('whisper-base');
    expect(speechModel(env(MAC, { search: '?speechModel=tiny' }))).toBe('whisper-tiny');
    expect(speechModel(env(IPHONE, { touch: 5, flag: true, search: '?speechModel=base' }))).toBe('whisper-base');
  });
});
