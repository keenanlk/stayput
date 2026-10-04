import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { EncoderStall, START_MS, STALL_MESSAGE, STALL_MS, executeWatched, watchEncode } from '../src/lib/encoder-watchdog';

/** The no-progress watchdog that every re-encoding video tool shares. */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A stand-in for a Mediabunny Conversion: progress is driven by the test; cancel() ends execute() the way the real one does. */
function fakeConversion() {
  let release!: (e?: Error) => void;
  const ended = new Promise<void>((resolve, reject) => (release = (e) => (e ? reject(e) : resolve())));
  const c = {
    onProgress: undefined as ((f: number, t: number) => unknown) | undefined,
    cancels: 0,
    execute: () => ended,
    cancel: async () => {
      c.cancels++;
      release(new Error('canceled'));
    },
    finish: () => release(),
    fail: (e: Error) => release(e),
    report: (f: number) => c.onProgress?.(f, 0),
  };
  return c;
}

test('the real limits are at least 30 seconds', () => {
  expect(STALL_MS).toBeGreaterThanOrEqual(30_000);
  expect(START_MS).toBeGreaterThanOrEqual(30_000);
});

test('progress that stops cancels the conversion and fails with the encoder-stall error', async () => {
  const c = fakeConversion();
  const seen: number[] = [];
  const run = executeWatched(c, (f) => seen.push(f), { stallMs: 150, startMs: 150 });
  c.report(0);
  c.report(0.11);
  const failure = await run.then(
    () => undefined,
    (e) => e,
  );
  expect(failure).toBeInstanceOf(EncoderStall);
  expect(failure.name).toBe('EncoderStall');
  expect(failure.message).toBe(STALL_MESSAGE);
  expect(failure.message).toContain("This browser's video encoder stopped responding. Try Chrome or Firefox.");
  expect(c.cancels).toBe(1);
  expect(seen).toEqual([0, 0.11]);
});

test('a conversion that never reports any progress also stalls, after the start-up allowance', async () => {
  const c = fakeConversion();
  const t0 = Date.now();
  await expect(executeWatched(c, undefined, { stallMs: 100, startMs: 400 })).rejects.toBeInstanceOf(EncoderStall);
  expect(Date.now() - t0).toBeGreaterThanOrEqual(380);
  expect(c.cancels).toBe(1);
});

test('a slow encode that keeps moving, with gaps just under the limit, never fires', async () => {
  const c = fakeConversion();
  const run = executeWatched(c, undefined, { stallMs: 300, startMs: 300 });
  for (let i = 0; i <= 8; i++) {
    c.report(i / 10);
    await sleep(270);
  }
  c.finish();
  await run;
  expect(c.cancels).toBe(0);
});

test('progress that repeats the same value does not count as moving', async () => {
  const c = fakeConversion();
  const run = executeWatched(c, undefined, { stallMs: 300, startMs: 300 });
  c.report(0.4);
  const keepAlive = setInterval(() => c.report(0.4), 100);
  try {
    await expect(run).rejects.toBeInstanceOf(EncoderStall);
  } finally {
    clearInterval(keepAlive);
  }
  expect(c.cancels).toBe(1);
});

test('the watchdog is cleared on success and on an error of its own, so nothing fires later', async () => {
  const ok = fakeConversion();
  const done = executeWatched(ok, undefined, { stallMs: 100, startMs: 100 });
  ok.report(0.5);
  ok.finish();
  await done;
  const bad = fakeConversion();
  const failed = executeWatched(bad, undefined, { stallMs: 100, startMs: 100 });
  bad.fail(new TypeError('boom'));
  await expect(failed).rejects.toBeInstanceOf(TypeError);
  await sleep(300);
  expect(ok.cancels + bad.cancels).toBe(0);
});

test('watchEncode works for hand-built encodes and cancels through the function it is given', async () => {
  let cancelled = 0;
  const run = watchEncode(
    async (progress) => {
      progress(0.2);
      await new Promise(() => undefined);
    },
    () => void cancelled++,
    { stallMs: 100, startMs: 100 },
  );
  await expect(run).rejects.toBeInstanceOf(EncoderStall);
  expect(cancelled).toBe(1);
  await expect(watchEncode(async (p) => (p(1), 'fine'), () => void cancelled++, { stallMs: 50, startMs: 50 })).resolves.toBe('fine');
  await sleep(150);
  expect(cancelled).toBe(1);
});

// The whole page, with an encoder that goes quiet part-way through.

const KEYS = new Set(['tool', 'outcome', 'attempt', 'files', 'input', 'output', 'duration', 'format', 'error_class', 'landing', 'ref', 'from', 'visit', 'prev_tool', 'run_n', 'tools_used', 'run_gap', 'ns', 'via']);
type Ev = { n: string; d: Record<string, string> };
const events = (page: Page): Promise<Ev[]> => page.evaluate(() => JSON.parse(sessionStorage.getItem('__ev') || '[]'));

async function silentEncoderPage(page: Page) {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const k='__ev';const a=JSON.parse(sessionStorage.getItem(k)||'[]');a.push({n,d});sessionStorage.setItem(k,JSON.stringify(a));}};`,
    }),
  );
  // Test-only: shorten the page's own watchdog timers. Production code takes no such input.
  await page.addInitScript(
    ([stall, start]) => {
      const real = window.setTimeout.bind(window);
      (window as unknown as { setTimeout: unknown }).setTimeout = (fn: TimerHandler, ms?: number, ...rest: unknown[]) => real(fn, ms === stall || ms === start ? 2500 : ms, ...rest);
      // Like the stuck Safari encoder: it takes frames, hands back the first few chunks and then goes quiet for good.
      // (The first frames also let the short capability probes through, which need an answer.)
      const Real = window.VideoEncoder;
      class Silent {
        static isConfigSupported(config: VideoEncoderConfig) {
          return Real.isConfigSupported(config);
        }
        private real: VideoEncoder;
        private seen = 0;
        private quiet = false;
        constructor(init: VideoEncoderInit) {
          this.real = new Real({ output: (chunk, meta) => (this.quiet ? undefined : init.output(chunk, meta)), error: init.error });
        }
        get state() {
          return this.real.state;
        }
        get encodeQueueSize() {
          return this.real.encodeQueueSize;
        }
        set ondequeue(fn: ((e: Event) => void) | null) {
          this.real.ondequeue = fn;
        }
        configure(config: VideoEncoderConfig) {
          this.real.configure(config);
        }
        encode(frame: VideoFrame, options?: VideoEncoderEncodeOptions) {
          if (++this.seen > 3) this.quiet = true;
          this.real.encode(frame, options);
        }
        flush() {
          return this.quiet ? new Promise<void>(() => undefined) : this.real.flush();
        }
        reset() {
          this.real.reset();
        }
        close() {
          this.real.close();
        }
        addEventListener(...args: Parameters<VideoEncoder['addEventListener']>) {
          this.real.addEventListener(...args);
        }
      }
      (window as unknown as { VideoEncoder: unknown }).VideoEncoder = Silent;
    },
    [STALL_MS, START_MS],
  );
}

const STUCK: [string, string][] = [
  ['compress-video', './fixtures/static/clip.webm'],
  ['resize-video', './fixtures/static/clip.webm'],
  ['reverse-video', './fixtures/static/clip.webm'],
  ['gif-to-mp4', './fixtures/generated/anim.gif'],
];
for (const [tool, fixture] of STUCK) {
  test(`${tool} turns a stuck encoder into a plain message, resets the bar and sends only the error kind`, async ({ page }) => {
    await silentEncoderPage(page);
    await page.goto(`/tools/${tool}`);
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    // Two files: the second is not left to wait out the same silence.
    const clip = fileURLToPath(new URL(fixture, import.meta.url));
    await page.locator('#file-input').setInputFiles([clip, clip]);
    await page.locator('#run').click();
    await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 30_000 });
    await expect(page.locator('#error')).toContainText("This browser's video encoder stopped responding. Try Chrome or Firefox.");
    await expect(page.locator('#progress')).not.toHaveClass(/is-active/);
    await expect(page.locator('#progress-text')).toHaveText('');
    await expect(page.locator('#results')).not.toHaveClass(/is-active/);
    await expect(page.locator('#run')).toBeEnabled();

    await expect.poll(async () => (await events(page)).filter((e) => e.n === 'tool_run').length).toBe(1);
    const all = await events(page);
    const run = all.find((e) => e.n === 'tool_run')!;
    expect(run.d).toMatchObject({ tool, outcome: 'error', error_class: 'EncoderStall' });
    for (const e of all) for (const k of Object.keys(e.d)) expect(KEYS.has(k), `${e.n} carries unexpected key ${k}`).toBe(true);
    expect(all.map((e) => e.n).filter((n) => n !== 'visit_start')).toEqual(['files_added', 'tool_run']);

    // The user can try again: the run button works and starts a new run.
    await page.locator('#run').click();
    await expect.poll(async () => (await events(page)).filter((e) => e.n === 'tool_run').length).toBe(2);
  });
}
