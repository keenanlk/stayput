// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * Transcribe and Video to subtitles (the same tool on two pages): the failures that come from the device and not the
 * file get one more try before they are shown. The speech worker is faked where a failure has to happen on cue (a real
 * iPhone running out of memory at start-up cannot be reproduced here); the model-download test uses the real worker.
 */
const here = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));
const speech = (project: string) => here(project === 'webkit' ? 'speech.mov' : 'talk.webm');
const PAGES = ['/tools/transcribe', '/video-to-subtitles'];
const KEYS = new Set(['tool', 'outcome', 'attempt', 'files', 'input', 'output', 'duration', 'format', 'error_class', 'landing', 'ref', 'from', 'visit', 'prev_tool', 'run_n', 'tools_used', 'run_gap', 'ns', 'via']);
type Ev = { n: string; d: Record<string, string> };
const events = (page: Page): Promise<Ev[]> => page.evaluate(() => JSON.parse(sessionStorage.getItem('__ev') || '[]'));

type Plan = 'die' | 'throw' | 'ok';

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
    const Real = window.Worker;
    w.Worker = class extends Real {
      constructor(url: string | URL, options?: WorkerOptions) {
        if (!/transcribe\.worker/.test(String(url))) return new Real(url, options);
        super(url, options);
        w.__spawned++;
        const fake = new EventTarget() as EventTarget & { postMessage(msg: { id: number }): void; terminate(): void };
        fake.postMessage = ({ id }) => {
          const step = plan[Math.min(w.__asked++, plan.length - 1)];
          if (step === 'throw') throw new DOMException('forced by the test', 'DataCloneError');
          if (step === 'die') return void setTimeout(() => fake.dispatchEvent(new Event('error')), 0);
          setTimeout(() => fake.dispatchEvent(new MessageEvent('message', { data: { id, type: 'result', chunks: [{ start: 0, end: 1, text: ' Hello there.' }], language: 'en' } })), 0);
        };
        fake.terminate = () => {};
        return fake as unknown as Worker;
      }
    };
  }, plan);
}

async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
}

const spawned = (page: Page) => page.evaluate(() => (window as unknown as { __spawned: number }).__spawned);

for (const path of PAGES) {
  test.describe(path, () => {
    for (const [label, plan] of [
      ['a speech model that dies at start-up is started again in a fresh worker', ['die', 'ok']],
      ['a worker that cannot be handed the sound is replaced and asked again', ['throw', 'ok']],
    ] as const) {
      test(label, async ({ page }, info) => {
        test.setTimeout(180_000);
        await recordEvents(page);
        await fakeSpeechWorker(page, [...plan]);
        await open(page, path);
        await page.locator('#file-input').setInputFiles(speech(info.project.name));
        await page.locator('#run').click();
        await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 150_000 });
        await expect(page.locator('#error')).not.toHaveClass(/is-active/);
        expect(await spawned(page)).toBe(2);
      });
    }

    test('the same failure on a second run in the tab is retried too (the model must start again in the new worker)', async ({ page }, info) => {
      test.setTimeout(180_000);
      await fakeSpeechWorker(page, ['ok', 'die', 'ok']);
      await open(page, path);
      await page.locator('#file-input').setInputFiles(speech(info.project.name));
      await page.locator('#run').click();
      await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 150_000 });
      await page.locator('#clear').click();
      await page.locator('#file-input').setInputFiles(speech(info.project.name));
      await page.locator('#run').click();
      // Three requests reach a worker only if the second run's start-up failure was retried.
      await expect.poll(() => page.evaluate(() => (window as unknown as { __asked: number }).__asked), { timeout: 150_000 }).toBe(3);
      expect(await spawned(page)).toBe(2);
      await expect(page.locator('#error')).not.toHaveClass(/is-active/);
    });

    test('a worker that fails twice is shown under its own name after one more try only', async ({ page }, info) => {
      test.setTimeout(180_000);
      await recordEvents(page);
      await fakeSpeechWorker(page, ['throw']);
      await open(page, path);
      await page.locator('#file-input').setInputFiles(speech(info.project.name));
      await page.locator('#run').click();
      await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 150_000 });
      expect(await spawned(page)).toBe(2);
      await expect.poll(async () => (await events(page)).filter((e) => e.n === 'tool_run').length).toBe(1);
      const all = await events(page);
      expect(all.find((e) => e.n === 'tool_run')!.d).toMatchObject({ outcome: 'error', error_class: 'WorkerCrashError' });
      for (const e of all) for (const k of Object.keys(e.d)) expect(KEYS.has(k), `${e.n} carries unexpected key ${k}`).toBe(true);
    });

    for (const [label, reads, ok] of [
      ['a file the browser fails to read once is read again, never reported as having no sound', 1, true],
      ['a file that stays unreadable says so, and is never recorded as a decode or no-sound failure', 1000, false],
    ] as const) {
      test(label, async ({ page }, info) => {
        test.setTimeout(180_000);
        await recordEvents(page);
        await fakeSpeechWorker(page, ['ok']);
        await page.addInitScript(() => {
          const w = window as unknown as { __fail: number; __failed: number };
          w.__fail = 0;
          w.__failed = 0;
          const fail = () => (w.__fail > 0 ? (w.__fail--, w.__failed++, true) : false);
          const arrayBuffer = Blob.prototype.arrayBuffer;
          Blob.prototype.arrayBuffer = function () {
            return fail() ? Promise.reject(new DOMException('The requested file could not be read.', 'NotReadableError')) : arrayBuffer.call(this);
          };
          const stream = Blob.prototype.stream;
          Blob.prototype.stream = function () {
            if (!fail()) return stream.call(this);
            return new ReadableStream({ pull: (c) => c.error(new DOMException('The requested file could not be read.', 'NotReadableError')) });
          };
        });
        await open(page, path);
        await page.locator('#file-input').setInputFiles(speech(info.project.name));
        await page.evaluate((n) => ((window as unknown as { __fail: number }).__fail = n), reads);
        await page.locator('#run').click();
        if (ok) {
          await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 150_000 });
          await expect(page.locator('#error')).not.toHaveClass(/is-active/);
          expect(await page.evaluate(() => (window as unknown as { __failed: number }).__failed)).toBeGreaterThan(0);
        } else {
          await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 150_000 });
          await expect(page.locator('#error')).toContainText('could not be read');
          await expect(page.locator('#error')).not.toContainText(/no sound|no audio/i);
        }
        await expect.poll(async () => (await events(page)).filter((e) => e.n === 'tool_run').length).toBe(1);
        const run = (await events(page)).find((e) => e.n === 'tool_run')!;
        if (ok) expect(run.d).toMatchObject({ outcome: 'ok' });
        else {
          expect(run.d).toMatchObject({ outcome: 'error', error_class: expect.stringMatching(/^NotReadable(Probe|MidRead)$/) });
          expect(['AudioDecodeError', 'NoSoundTrack']).not.toContain(run.d.error_class);
        }
      });
    }

    test('a sound the browser cannot decode names the problem, before any model is fetched', async ({ page, browserName }) => {
      test.skip(browserName !== 'chromium', 'WebKit decodes HEVC');
      const models: string[] = [];
      page.on('request', (r) => /\/models\/|onnx/i.test(r.url()) && models.push(r.url()));
      await open(page, path);
      await page.locator('#file-input').setInputFiles({ name: 'voice.amr', mimeType: 'audio/amr', buffer: Buffer.concat([Buffer.from('#!AMR\n'), Buffer.alloc(400, 1)]) });
      await page.locator('#run').click();
      await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 60_000 });
      await expect(page.locator('#error')).toContainText('AMR');
      expect(models).toEqual([]);
    });
  });
}

test('a model download that is aborted at start-up is tried again and the run finishes', async ({ page, browserName }, info) => {
  test.skip(browserName !== 'chromium', 'The real worker is slow to run in WebKit; the fake-worker tests above cover it there');
  test.setTimeout(240_000);
  let aborted = 0;
  await page.route('**/models/**/*.onnx', (route) => (aborted++ < 1 ? route.abort() : route.continue()));
  await open(page, '/tools/transcribe');
  await page.locator('#file-input').setInputFiles(speech(info.project.name));
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  expect(aborted).toBeGreaterThan(1);
});
