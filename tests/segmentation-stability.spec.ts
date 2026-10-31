// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { releaseConversion } from '../src/lib/conversion-release';
import { lazyImport } from '../src/lib/lazy-import';

// H16, segmentation stability. A person finder that fails once is rebuilt and the run finishes; a lost graphics context, an
// empty mask and a stall each end the way the spec says; a chunk that is gone after a deploy says to reload; the failed
// try's codecs are let go before the retry; canvases are reused and handed back. The failures are forced in the page.
const person = fileURLToPath(new URL('./fixtures/static/iphone-portrait-person-3s.mov', import.meta.url));
const long = fileURLToPath(new URL('./fixtures/static/clip-720p-10s.mp4', import.meta.url));

type Ev = { n: string; d: Record<string, string> };
async function stubAnalytics(page: Page) {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const a=JSON.parse(sessionStorage.getItem('__ev')||'[]');a.push({n,d});sessionStorage.setItem('__ev',JSON.stringify(a));}};`,
    }),
  );
}
const toolRuns = (page: Page) => page.evaluate(() => (JSON.parse(sessionStorage.getItem('__ev') || '[]') as Ev[]).filter((e) => e.n === 'tool_run').map((e) => e.d));

test.describe('releasing the failed try', () => {
  // The wait is shortened twentyfold; the order of events is what matters.
  const quick = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms / 20));

  test('the next run starts only after cancel() has resolved, and a retry gets a settle time', async () => {
    const log: string[] = [];
    const conversion = {
      cancel: () =>
        new Promise<void>((resolve) =>
          setTimeout(() => {
            log.push('cancelled');
            resolve();
          }, 60),
        ),
    };
    await releaseConversion(conversion, true, quick);
    log.push('second run starts');
    expect(log).toEqual(['cancelled', 'second run starts']);
  });

  test('a cancel() that never resolves is waited for 2 s at most, then 0.5 s more when a retry follows', async () => {
    const waits: number[] = [];
    const never = { cancel: () => new Promise<void>(() => {}) };
    await releaseConversion(never, true, (ms) => (waits.push(ms), quick(ms)));
    expect(waits).toEqual([2000, 500]);
    waits.length = 0;
    await releaseConversion(never, false, (ms) => (waits.push(ms), quick(ms)));
    expect(waits).toEqual([2000]);
  });

  test('a cancel() that throws does not stop the retry, and no conversion is nothing to wait for', async () => {
    await releaseConversion({ cancel: () => Promise.reject(new Error('x')) }, false, quick);
    await releaseConversion({ cancel: () => { throw new Error('y'); } }, false, quick);
    const waits: number[] = [];
    await releaseConversion(undefined, true, (ms) => (waits.push(ms), quick(ms)));
    expect(waits).toEqual([]);
  });
});

test.describe('chunks that are gone', () => {
  test('each browser\'s words for a module that did not load become AppUpdated with a Reload link', async () => {
    for (const message of ['Failed to fetch dynamically imported module: https://x/_astro/video-edit.abc.js', 'Importing a module script failed.', 'error loading dynamically imported module: https://x/a.js']) {
      const caught = await lazyImport(() => Promise.reject(new TypeError(message))).catch((e) => e);
      expect(caught).toMatchObject({ name: 'AppUpdated', message: 'Stayput was updated while this page was open. Reload the page and run it again.', link: { text: 'Reload' } });
    }
  });
  test('any other failure goes through as it was', async () => {
    const other = new TypeError('x is not a function');
    expect(await lazyImport(() => Promise.reject(other)).catch((e) => e)).toBe(other);
    expect(await lazyImport(() => Promise.resolve(7))).toBe(7);
  });
  test('the recorded class is AppUpdated', async () => {
    const { classifyError } = await import('../src/lib/analytics');
    const err = await lazyImport(() => Promise.reject(new TypeError('Importing a module script failed.'))).catch((e) => e);
    expect(classifyError(err)).toBe('AppUpdated');
  });
});

test('the new error classes record under their own names', async () => {
  const { classifyError } = await import('../src/lib/analytics');
  const { StageError, NamedError } = await import('../src/lib/input-error');
  for (const name of ['PersonFinderFailed', 'PersonMaskEmpty', 'WebGLLost', 'PersonFinderStalled']) expect(classifyError(new StageError(name, new Error('x')))).toBe(name);
  expect(classifyError(new NamedError('CanvasMemoryError', 'x'))).toBe('CanvasMemoryError');
});

// ---- the video background remover, in Chromium (Linux WebKit reads video frames back blank for the person finder) ----

async function openBackground(page: Page, finder: 'fast' | 'edges') {
  await page.goto('/tools/video-background-remover');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles([person]);
  await page.locator('input[name="bg"][value="color"]').evaluate((el) => (el as HTMLInputElement).click());
  await page.locator('input[name="finder"][value="' + finder + '"]').evaluate((el) => (el as HTMLInputElement).click());
}
const finished = (page: Page) => expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
const failed = (page: Page) => expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 200_000 });

test.describe('the person finder', () => {
  test.beforeEach(({ browserName }) => test.skip(browserName !== 'chromium'));

  test('fails once at frame 5: it is rebuilt, the frame is done again and the run finishes', async ({ page }) => {
    test.setTimeout(240_000);
    await stubAnalytics(page);
    const warned: string[] = [];
    page.on('console', (m) => {
      warned.push(m.text());
      if (process.env.DEBUG_CONSOLE) console.log('CONSOLE', m.text().slice(0, 200));
    });
    await page.addInitScript(() => ((globalThis as Record<string, unknown>).__stayputSegFault = { at: 5, times: 1 }));
    await openBackground(page, 'fast');
    await page.locator('#run').click();
    await finished(page);
    await expect(page.locator('#error')).not.toHaveClass(/is-active/);
    expect(warned.some((l) => /person finder failed, starting a new one/.test(l))).toBe(true);
    // The path note is the one an untroubled run gives.
    await expect(page.locator('#results-list')).toContainText('Found the person with the processor (Fast always uses it).');
    expect((await toolRuns(page))[0]).toMatchObject({ outcome: 'ok' });
  });

  test('fails twice: the run stops as PersonFinderFailed', async ({ page }) => {
    test.setTimeout(240_000);
    await stubAnalytics(page);
    await page.addInitScript(() => ((globalThis as Record<string, unknown>).__stayputSegFault = { at: 5, times: 2 }));
    await openBackground(page, 'fast');
    await page.locator('#run').click();
    await failed(page);
    expect((await toolRuns(page))[0]).toMatchObject({ outcome: 'error', error_class: 'PersonFinderFailed' });
  });

  test('fails and WebGL is gone: the run stops as WebGLLost and says what to do', async ({ page }) => {
    test.setTimeout(240_000);
    await stubAnalytics(page);
    await page.addInitScript(() => {
      const g = globalThis as Record<string, unknown>;
      let gone = false;
      for (const C of [HTMLCanvasElement, OffscreenCanvas] as const) {
        const real = C.prototype.getContext as (this: unknown, type: string, ...rest: unknown[]) => unknown;
        (C.prototype as unknown as { getContext: unknown }).getContext = function (this: unknown, type: string, ...rest: unknown[]) {
          return gone && /webgl/.test(type) ? null : real.call(this, type, ...rest);
        };
      }
      g.__stayputSegFault = { at: 5, times: 1, onFire: () => (gone = true) };
    });
    await openBackground(page, 'fast');
    await page.locator('#run').click();
    await failed(page);
    await expect(page.locator('#error')).toContainText('The graphics context was lost. Close other tabs and try again.');
    expect((await toolRuns(page))[0]).toMatchObject({ outcome: 'error', error_class: 'WebGLLost' });
  });

  test('a WebGL context lost under the engine mid-run: the run still finishes', async ({ page }) => {
    test.setTimeout(240_000);
    const warned: string[] = [];
    page.on('console', (m) => {
      warned.push(m.text());
      if (process.env.DEBUG_CONSOLE) console.log('CONSOLE', m.text().slice(0, 200));
    });
    await page.addInitScript(() => {
      // Every WebGL context the page makes is kept; at frame 5 each is lost with WEBGL_lose_context, the engine's among them.
      const made: { getExtension(n: string): { loseContext(): void } | null }[] = [];
      for (const C of [HTMLCanvasElement, OffscreenCanvas] as const) {
        const real = C.prototype.getContext as (this: unknown, type: string, ...rest: unknown[]) => unknown;
        (C.prototype as unknown as { getContext: unknown }).getContext = function (this: unknown, type: string, ...rest: unknown[]) {
          const ctx = real.call(this, type, ...rest);
          if (ctx && /webgl/.test(type)) made.push(ctx as (typeof made)[number]);
          return ctx;
        };
      }
      (globalThis as Record<string, unknown>).__stayputSegFault = { at: 5, times: 0, onFire: () => {}, before: () => {
          console.warn('losing ' + made.length + ' contexts');
          made.forEach((c) => c.getExtension('WEBGL_lose_context')?.loseContext());
        },
      };
    });
    await openBackground(page, 'fast');
    await page.locator('#run').click();
    await finished(page);
    await expect(page.locator('#error')).not.toHaveClass(/is-active/);
    expect(warned.some((l) => /starting a new one/.test(l))).toBe(true);
  });

  test('no mask for three frames in a row reuses the last one; a fourth ends as PersonMaskEmpty', async ({ page }) => {
    test.setTimeout(480_000);
    await stubAnalytics(page);
    await page.addInitScript(() => ((globalThis as Record<string, unknown>).__stayputSegFault = { at: 5, times: 3, empty: true }));
    await openBackground(page, 'fast');
    await page.locator('#run').click();
    await finished(page);
    expect((await toolRuns(page))[0]).toMatchObject({ outcome: 'ok' });

    const second = await page.context().newPage();
    await stubAnalytics(second);
    await second.addInitScript(() => ((globalThis as Record<string, unknown>).__stayputSegFault = { at: 5, times: 4, empty: true }));
    await openBackground(second, 'fast');
    await second.locator('#run').click();
    await failed(second);
    expect((await toolRuns(second))[0]).toMatchObject({ outcome: 'error', error_class: 'PersonMaskEmpty' });
  });
});

// ---- a slow device: the page's clock jumps by 6 s per reading until the page says it has changed course ----

async function slowUntil(page: Page, stopOn: string | null) {
  await page.addInitScript(
    ([stopOn]) => {
      const real = performance.now.bind(performance);
      let skew = 0;
      let on = false;
      let spent = false;
      const warn = console.warn.bind(console);
      console.warn = (...a: unknown[]) => {
        if (stopOn && String(a[0]).includes(stopOn as string)) {
          on = false;
          spent = true;
        }
        warn(...a);
      };
      performance.now = () => real() + (on ? (skew += 6000) : skew);
      addEventListener('DOMContentLoaded', () => {
        const el = document.getElementById('progress-text')!;
        new MutationObserver(() => {
          const pct = /(\d+)%/.exec(el.textContent ?? '')?.[1];
          if (pct && Number(pct) >= 10 && !spent) on = true;
        }).observe(el, { childList: true, characterData: true, subtree: true });
      });
    },
    [stopOn],
  );
}

test.describe('a person finder that stalls', () => {
  test.beforeEach(({ browserName }) => test.skip(browserName !== 'chromium'));

  test('Better edges that stalls on the processor switches to Fast and says so', async ({ page }) => {
    test.setTimeout(300_000);
    await stubAnalytics(page);
    await slowUntil(page, 'switching to Fast');
    await openBackground(page, 'edges');
    await page.locator('#run').click();
    await finished(page);
    await expect(page.locator('#results-list')).toContainText('Switched to Fast part way, because this device was too slow for Better edges.');
    expect((await toolRuns(page))[0]).toMatchObject({ outcome: 'ok' });
  });

  test('Fast that stalls looks at a smaller picture and finishes', async ({ page }) => {
    test.setTimeout(300_000);
    await slowUntil(page, 'using a smaller picture');
    await openBackground(page, 'fast');
    await page.locator('#run').click();
    await finished(page);
    await expect(page.locator('#results-list')).toContainText('Looked at a smaller picture part way');
  });

  test('a device that stays too slow ends as PersonFinderStalled, after Fast and the smaller picture', async ({ page }) => {
    test.setTimeout(300_000);
    await stubAnalytics(page);
    await slowUntil(page, null);
    await openBackground(page, 'edges');
    await page.locator('#run').click();
    await failed(page);
    await expect(page.locator('#error')).toContainText('took more than 5 seconds');
    expect((await toolRuns(page))[0]).toMatchObject({ outcome: 'error', error_class: 'PersonFinderStalled' });
  });
});

// ---- chunks that are gone after a deploy ----

for (const [label, url, open] of [
  ['video background remover', '/tools/video-background-remover', (page: Page) => openBackground(page, 'fast')],
  [
    'blur faces in video',
    '/tools/blur-face-video',
    async (page: Page) => {
      await page.goto('/tools/blur-face-video');
      await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
      await page.locator('#file-input').setInputFiles(person);
    },
  ],
] as const) {
  test(`${label}: the editing code gone from the server says Reload and records AppUpdated`, async ({ page }) => {
    test.setTimeout(120_000);
    await stubAnalytics(page);
    // Every fetch of the chunk fails (the browser remembers a failed module, so Run may not ask again).
    let asked = 0;
    await page.route('**/_astro/video-edit.*.js', (route) => (asked++, route.abort('connectionreset')));
    await open(page);
    expect(url).toContain('/tools/');
    // The chunk was asked for when the file was dropped, before Run was pressed.
    await expect.poll(() => asked).toBeGreaterThanOrEqual(1);
    await page.locator('#run').click();
    await failed(page);
    await expect(page.locator('#error')).toContainText('Reload');
    await expect(page.locator('#error a')).toHaveText('Reload');
    expect((await toolRuns(page))[0]).toMatchObject({ outcome: 'error', error_class: 'AppUpdated' });
  });
}

// ---- canvas memory ----

test('blur faces in video: a ten-second clip makes a handful of canvases, not one per scan', async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    const g = globalThis as { __canvases?: number };
    g.__canvases = 0;
    const real = document.createElement.bind(document);
    document.createElement = ((tag: string, ...rest: unknown[]) => {
      if (String(tag).toLowerCase() === 'canvas') g.__canvases!++;
      return (real as (t: string, ...r: unknown[]) => HTMLElement)(tag, ...rest);
    }) as typeof document.createElement;
  });
  await page.goto('/tools/blur-face-video');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(long);
  await page.locator('#run').click();
  await finished(page);
  const made = await page.evaluate(() => (globalThis as { __canvases?: number }).__canvases);
  console.log(`canvases made in the run: ${made}`);
  expect(made).toBeLessThanOrEqual(5);
});

test.describe('a canvas the browser will not give', () => {
  test.beforeEach(({ browserName }) => test.skip(browserName !== 'chromium'));

  /** Returns null for 2d contexts: the first `times` asks during the run, or every ask when 0. */
  async function starve(page: Page, times: number) {
    await page.addInitScript((times) => {
      const real = HTMLCanvasElement.prototype.getContext as (this: HTMLCanvasElement, type: string, ...rest: unknown[]) => unknown;
      let refused = 0;
      (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        const running = /Replacing the background/.test(document.getElementById('progress-text')?.textContent ?? '');
        if (type === '2d' && running && (times === 0 || refused < times)) {
          refused++;
          return null;
        }
        return real.call(this, type, ...rest);
      };
    }, times);
  }

  test('once: the run starts again and finishes', async ({ page }) => {
    test.setTimeout(300_000);
    await stubAnalytics(page);
    await starve(page, 1);
    await openBackground(page, 'fast');
    await page.locator('#run').click();
    await finished(page);
    await expect(page.locator('#results-list')).toContainText(/software video encoder|smaller size|once more|second try/);
  });

  test('every time: the run ends as CanvasMemoryError', async ({ page }) => {
    test.setTimeout(300_000);
    await stubAnalytics(page);
    await starve(page, 0);
    await openBackground(page, 'fast');
    await page.locator('#run').click();
    await failed(page);
    expect((await toolRuns(page))[0]).toMatchObject({ outcome: 'error', error_class: 'CanvasMemoryError' });
  });
});
