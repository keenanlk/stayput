// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * Auto caption video (a landing page on Add subtitles to video) on a phone: a speech model that dies at start-up, also on
 * the second or third run in the same tab, and a page hidden while the sound is written down, get one more try before the
 * failure is shown, and a failure that is shown records a named error class. The speech worker is faked (a real iPhone
 * running out of memory cannot be reproduced here); the Page Visibility API is driven by hand, as an app switch shows it.
 */
const speech = (project: string) => fileURLToPath(new URL(`./fixtures/static/${project === 'webkit' ? 'speech.mov' : 'talk.webm'}`, import.meta.url));
const KEYS = new Set(['tool', 'outcome', 'attempt', 'files', 'input', 'output', 'duration', 'format', 'error_class', 'landing', 'ref', 'from', 'visit', 'prev_tool', 'run_n', 'tools_used', 'run_gap', 'ns', 'via', 'variant']);
type Ev = { n: string; d: Record<string, string> };
const events = (page: Page): Promise<Ev[]> => page.evaluate(() => JSON.parse(sessionStorage.getItem('__ev') || '[]'));
const runs = async (page: Page) => (await events(page)).filter((e) => e.n === 'tool_run').map((e) => e.d);

type Plan = 'die' | 'hidden-speech-model-error' | 'ok';

async function recordEvents(page: Page) {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const k='__ev';const a=JSON.parse(sessionStorage.getItem(k)||'[]');a.push({n,d});sessionStorage.setItem(k,JSON.stringify(a));}};`,
    }),
  );
}

/** The 8-bit speech worker, answering each request the way `plan` says (one entry per request, the last one repeating). */
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
          if (step === 'die') return void setTimeout(() => fake.dispatchEvent(new Event('error')), 0);
          if (step === 'hidden-speech-model-error') {
            setHidden(true);
            setTimeout(() => setHidden(false), 500);
            return reply({ id, type: 'error', name: 'SpeechModelError', message: 'x' });
          }
          reply({ id, type: 'result', chunks: [{ start: 0, end: 1, text: ' Hello there.' }], language: 'en' });
        };
        fake.terminate = () => {};
        return fake as unknown as Worker;
      }
    };
  }, plan);
}

async function open(page: Page) {
  await page.goto('/auto-caption-video');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
}

const asked = (page: Page) => page.evaluate(() => (window as unknown as { __asked: number }).__asked);
const spawned = (page: Page) => page.evaluate(() => (window as unknown as { __spawned: number }).__spawned);

test('a speech model that dies on the second run in the tab is started again, and that run finishes', async ({ page }, info) => {
  test.setTimeout(300_000);
  await recordEvents(page);
  await fakeSpeechWorker(page, ['ok', 'die', 'ok']);
  await open(page);
  await page.locator('#file-input').setInputFiles(speech(info.project.name));
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
  await page.locator('#clear').click();
  await page.locator('#file-input').setInputFiles(speech(info.project.name));
  await page.locator('#run').click();
  // Three requests reach a worker only if the second run's start-up failure was retried.
  await expect.poll(() => asked(page), { timeout: 200_000 }).toBe(3);
  await expect.poll(async () => (await runs(page)).length, { timeout: 200_000 }).toBe(2);
  // One worker for the first run, one that died at the start of the second, and its replacement.
  expect(await spawned(page)).toBe(3);
  expect(await runs(page)).toMatchObject([{ outcome: 'ok' }, { outcome: 'ok' }]);
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
});

test('the page hidden while the sound is being written down: the step starts again when the page is back', async ({ page }, info) => {
  test.setTimeout(300_000);
  await recordEvents(page);
  await fakeSpeechWorker(page, ['hidden-speech-model-error', 'ok']);
  await open(page);
  await page.locator('#file-input').setInputFiles(speech(info.project.name));
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
  await expect(page.locator('#results-list')).toContainText('written from English speech');
  expect(await asked(page)).toBe(2);
  expect(await runs(page)).toMatchObject([{ outcome: 'ok' }]);
});

test('a worker that dies on every try is shown once under a named error class, after one more try', async ({ page }, info) => {
  test.setTimeout(300_000);
  await recordEvents(page);
  await fakeSpeechWorker(page, ['die']);
  await open(page);
  await page.locator('#file-input').setInputFiles(speech(info.project.name));
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 200_000 });
  await expect.poll(async () => (await runs(page)).length).toBe(1);
  const [run] = await runs(page);
  expect(run).toMatchObject({ outcome: 'error' });
  expect(['OutOfMemoryError', 'WorkerCrashError', 'SpeechModelError']).toContain(run!.error_class);
  expect(await spawned(page)).toBe(2);
  for (const e of await events(page)) for (const k of Object.keys(e.d)) expect(KEYS.has(k), `${e.n} carries unexpected key ${k}`).toBe(true);
});
