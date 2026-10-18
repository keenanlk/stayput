// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { nameBare } from '../src/lib/bare-error';
import { withoutSoftwareEncoder } from './no-software-encoder';

// Blur faces in video on a phone: a failure that comes from the device and not the file gets one more try before it is
// shown, and every failure that is shown records a named error class. The failures are forced in the page: the encoder
// throws once, the page reports hidden for a moment, the file read fails, the face model cannot be fetched.
const clip = fileURLToPath(new URL('./fixtures/static/iphone-portrait-person.mov', import.meta.url));
const KEYS = new Set(['tool', 'outcome', 'attempt', 'files', 'input', 'output', 'duration', 'format', 'error_class', 'landing', 'ref', 'from', 'visit', 'prev_tool', 'run_n', 'tools_used', 'run_gap', 'ns', 'via']);
type Ev = { n: string; d: Record<string, string> };
const events = (page: Page): Promise<Ev[]> => page.evaluate(() => JSON.parse(sessionStorage.getItem('__ev') || '[]'));
const RUNNING = /Hiding faces in/;

test.describe('naming rules', () => {
  test('a bare error is named for the step; a named one is left as it is', () => {
    for (const bare of [new Error('x'), new TypeError('x'), new RangeError('bad buffer length'), 'text', undefined]) {
      expect(nameBare('FaceScanFailed', bare)).toMatchObject({ name: 'FaceScanFailed' });
    }
    const named = Object.assign(new Error('x'), { name: 'EncodingError' });
    expect(nameBare('FaceScanFailed', named)).toBe(named);
    const memory = new RangeError('Array buffer allocation failed');
    expect(nameBare('FaceScanFailed', memory)).toBe(memory);
  });
});

async function open(page: Page) {
  // Count the run in the page, as the real analytics would, and keep nothing else.
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const k='__ev';const a=JSON.parse(sessionStorage.getItem(k)||'[]');a.push({n,d});sessionStorage.setItem(k,JSON.stringify(a));}};`,
    }),
  );
}

async function run(page: Page) {
  await page.goto('/tools/blur-face-video');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(clip);
  await page.locator('#run').click();
}

async function lastRun(page: Page) {
  await expect.poll(async () => (await events(page)).filter((e) => e.n === 'tool_run').length).toBe(1);
  const all = await events(page);
  for (const e of all) for (const k of Object.keys(e.d)) expect(KEYS.has(k), `${e.n} carries unexpected key ${k}`).toBe(true);
  return all.find((e) => e.n === 'tool_run')!.d;
}

/** The encoder throws `name` once, the first time it is asked for a frame after faces are being hidden; with `hide`, the page is hidden for a moment. */
async function breakEncoder(page: Page, name: string, hide: boolean) {
  await withoutSoftwareEncoder(page);
  await page.addInitScript(
    ([name, hide, pattern]) => {
      let armed = false;
      const original = VideoEncoder.prototype.encode;
      VideoEncoder.prototype.encode = function (this: VideoEncoder, ...args: Parameters<VideoEncoder['encode']>) {
        const running = new RegExp(pattern).test(document.getElementById('progress-text')?.textContent ?? '');
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
    [name, hide, RUNNING.source] as const,
  );
}

test.describe('on the page', () => {
  test('the page hidden mid-run: the run starts again when it is back and finishes', async ({ page }) => {
    test.setTimeout(240_000);
    await open(page);
    await breakEncoder(page, 'InvalidStateError', true);
    await run(page);
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
    await expect(page.locator('#results-list')).toContainText('started again after the page was hidden');
    await expect(page.locator('#error')).not.toHaveClass(/is-active/);
    expect(await lastRun(page)).toMatchObject({ outcome: 'ok' });
  });

  test('the encoder gives up at full size: the run finishes at a smaller size and says so', async ({ page }) => {
    test.setTimeout(240_000);
    await open(page);
    await breakEncoder(page, 'EncodingError', false);
    await run(page);
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
    await expect(page.locator('#results-list')).toContainText('made at a smaller size');
    expect(await lastRun(page)).toMatchObject({ outcome: 'ok' });
  });

  test('the encoder gives up again at the smaller size: the second failure is shown under its own name', async ({ page }) => {
    test.setTimeout(240_000);
    await open(page);
    await page.addInitScript((pattern) => {
      const original = VideoEncoder.prototype.encode;
      VideoEncoder.prototype.encode = function (this: VideoEncoder, ...args: Parameters<VideoEncoder['encode']>) {
        if (new RegExp(pattern).test(document.getElementById('progress-text')?.textContent ?? '')) throw new DOMException('forced by the test', 'EncodingError');
        return original.apply(this, args);
      };
    }, RUNNING.source);
    await run(page);
    await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 200_000 });
    expect(await lastRun(page)).toMatchObject({ outcome: 'error', error_class: 'EncodingError' });
  });

  for (const [label, reads, ok] of [
    ['one failed read is read again and the run finishes', 1, true],
    ['a file that stays unreadable says so, with the error name', 1000, false],
  ] as const) {
    test(label, async ({ page }) => {
      test.setTimeout(240_000);
      await open(page);
      await page.addInitScript((n) => {
        const w = window as unknown as { __fail: number; __failed: number };
        w.__fail = 0;
        w.__failed = 0;
        const fail = () => {
          if (w.__fail <= 0) return false;
          w.__fail--;
          w.__failed++;
          return true;
        };
        const arrayBuffer = Blob.prototype.arrayBuffer;
        Blob.prototype.arrayBuffer = function () {
          return fail() ? Promise.reject(new DOMException('The requested file could not be read.', 'NotReadableError')) : arrayBuffer.call(this);
        };
        const stream = Blob.prototype.stream;
        Blob.prototype.stream = function () {
          if (!fail()) return stream.call(this);
          return new ReadableStream({ pull: (c) => c.error(new DOMException('The requested file could not be read.', 'NotReadableError')) });
        };
        document.addEventListener('DOMContentLoaded', () => {
          const text = document.querySelector('#progress-text')!;
          const watch = new MutationObserver(() => {
            if (/^Reading /.test(text.textContent ?? '')) {
              w.__fail = n;
              watch.disconnect();
            }
          });
          watch.observe(text, { childList: true, characterData: true, subtree: true });
        });
      }, reads);
      await run(page);
      if (ok) {
        await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
        expect(await page.evaluate(() => (window as unknown as { __failed: number }).__failed)).toBeGreaterThan(0);
        expect(await lastRun(page)).toMatchObject({ outcome: 'ok' });
      } else {
        await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 200_000 });
        await expect(page.locator('#error')).toContainText('This file could not be read');
        expect(await lastRun(page)).toMatchObject({ outcome: 'error', error_class: 'NotReadableError' });
      }
    });
  }

  test('the face model cannot be fetched: the failure is recorded as the model step, not a bare Error', async ({ page }) => {
    test.setTimeout(240_000);
    await open(page);
    await page.route('**/models/blaze_face_short_range.tflite', (route) => route.abort());
    await run(page);
    await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 200_000 });
    const d = await lastRun(page);
    expect(d.outcome).toBe('error');
    expect(d.error_class).toBe('FaceModelFailed');
    expect(d.error_class).not.toBe('Error');
  });
});
