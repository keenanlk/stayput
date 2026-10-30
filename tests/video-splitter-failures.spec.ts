// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { unzipSync } from 'fflate';
import { ALL_FORMATS, BufferSource, Input } from 'mediabunny';
import { planAtTimes, planEqual, planEvery } from '../src/lib/video-split';

// Video splitter failures: every one that can end a run has a named class (never a bare Error), a phone that cannot
// read the file gets one more read and then a plain refusal, and odd inputs either split or are refused early.
const fx = (n: string) => fileURLToPath(new URL(`./fixtures/static/${n}`, import.meta.url));
const KEYS = new Set(['tool', 'outcome', 'attempt', 'files', 'input', 'output', 'duration', 'format', 'error_class', 'landing', 'ref', 'from', 'visit', 'prev_tool', 'run_n', 'tools_used', 'run_gap', 'ns', 'via', 'variant']);
type Ev = { n: string; d: Record<string, string> };
const events = (page: Page): Promise<Ev[]> => page.evaluate(() => JSON.parse(sessionStorage.getItem('__ev') || '[]'));

const nameOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as Error).name;
  }
  return 'none';
};

test('each way a plan can fail has its own class', () => {
  expect(nameOf(() => planAtTimes('', 60))).toBe('SplitNoTimes');
  expect(nameOf(() => planAtTimes('soon', 60))).toBe('SplitBadTime');
  expect(nameOf(() => planAtTimes('0', 60))).toBe('SplitTimeAtStart');
  expect(nameOf(() => planAtTimes('60', 60))).toBe('SplitTimeOutOfRange');
  expect(nameOf(() => planAtTimes('90', 60))).toBe('SplitTimeOutOfRange');
  expect(nameOf(() => planAtTimes('10, 10', 60))).toBe('SplitTimeRepeated');
  expect(nameOf(() => planAtTimes('20, 10', 60))).toBe('SplitTimeOrder');
  expect(nameOf(() => planAtTimes('10, 10.05', 60))).toBe('SplitPartTooShort');
  expect(nameOf(() => planEvery(0, 60))).toBe('SplitBadLength');
  expect(nameOf(() => planEvery(60, 60))).toBe('SplitLengthTooLong');
  expect(nameOf(() => planEvery(1, 100))).toBe('SplitTooManyParts');
  expect(nameOf(() => planEqual(1, 60))).toBe('SplitBadCount');
  expect(nameOf(() => planEqual(51, 100))).toBe('SplitTooManyParts');
  // A clip too short to make parts of 0.1 s refuses; split just inside either edge works.
  expect(nameOf(() => planEqual(3, 0.25))).toBe('SplitPartTooShort');
  expect(planAtTimes('0.1, 59.9', 60)).toHaveLength(3);
});

async function open(page: Page) {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const k='__ev';const a=JSON.parse(sessionStorage.getItem(k)||'[]');a.push({n,d});sessionStorage.setItem(k,JSON.stringify(a));}};`,
    }),
  );
}

async function load(page: Page, file: string) {
  await page.goto('/tools/video-splitter');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(file);
}

async function lastRun(page: Page) {
  await expect.poll(async () => (await events(page)).filter((e) => e.n === 'tool_run').length, { timeout: 60_000 }).toBe(1);
  const all = await events(page);
  for (const e of all) for (const k of Object.keys(e.d)) expect(KEYS.has(k), `${e.n} carries unexpected key ${k}`).toBe(true);
  return all.find((e) => e.n === 'tool_run')!.d;
}

test.describe('on the page', () => {
  test.setTimeout(300_000);

  for (const [label, reads, ok] of [
    ['one failed read is read again and the split finishes', 1, true],
    ['a file that stays unreadable is refused as NotReadableError, not a plain Error', 1000, false],
  ] as const) {
    test(label, async ({ page }) => {
      await open(page);
      await page.addInitScript((n) => {
        const w = window as unknown as { __fail: number; __failed: number };
        w.__fail = n;
        w.__failed = 0;
        // Only the big reads fail; the one-byte probe between reads passes, so each failure is one run of the job.
        const fail = (blob: Blob) => {
          if (w.__fail <= 0 || blob.size <= 1) return false;
          w.__fail--;
          w.__failed++;
          return true;
        };
        const arrayBuffer = Blob.prototype.arrayBuffer;
        Blob.prototype.arrayBuffer = function () {
          return fail(this) ? Promise.reject(new DOMException('The requested file could not be read.', 'NotReadableError')) : arrayBuffer.call(this);
        };
        const stream = Blob.prototype.stream;
        Blob.prototype.stream = function () {
          if (!fail(this)) return stream.call(this);
          return new ReadableStream({ pull: (c) => c.error(new DOMException('The requested file could not be read.', 'NotReadableError')) });
        };
      }, reads);
      await load(page, fx('split-60s.mp4'));
      if (ok) {
        await expect(page.locator('#tool')).toHaveAttribute('data-duration', '60');
        expect(await page.evaluate(() => (window as unknown as { __failed: number }).__failed)).toBeGreaterThan(0);
        await page.locator('input[name="vs-mode"][value="equal"]').check();
        await page.locator('#vs-equal').fill('2');
        await page.locator('#run').click();
        await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 60_000 });
        expect(await lastRun(page)).toMatchObject({ outcome: 'ok' });
      } else {
        await expect(page.locator('#error')).toContainText('could not be read', { timeout: 60_000 });
        await page.locator('#run').click();
        await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 60_000 });
        await expect(page.locator('#error')).toContainText('This file could not be read');
        expect(await lastRun(page)).toMatchObject({ outcome: 'error', error_class: expect.stringMatching(/^NotReadable(Probe|MidRead)$/) });
      }
    });
  }

  test('a phone that lets go of the picked file after the pick still splits, from the copy kept in memory', async ({ page }) => {
    await open(page);
    // Blobs made from bytes in memory (the copy, and slices of it) are marked; once the page arms the fault, every other read fails.
    await page.addInitScript(() => {
      const w = window as unknown as { __armed: boolean; __denied: number };
      w.__armed = false;
      w.__denied = 0;
      const mine = new WeakSet<Blob>();
      const File0 = window.File;
      window.File = class extends File0 {
        constructor(parts: BlobPart[], name: string, opts?: FilePropertyBag) {
          super(parts, name, opts);
          mine.add(this);
        }
      } as typeof File;
      const slice = Blob.prototype.slice;
      Blob.prototype.slice = function (...a: Parameters<Blob['slice']>) {
        const out = slice.apply(this, a);
        if (mine.has(this)) mine.add(out);
        return out;
      };
      const gone = (b: Blob) => w.__armed && !mine.has(b) && (w.__denied++, true);
      const arrayBuffer = Blob.prototype.arrayBuffer;
      Blob.prototype.arrayBuffer = function () {
        return gone(this) ? Promise.reject(new DOMException('The requested file could not be read.', 'NotReadableError')) : arrayBuffer.call(this);
      };
      const stream = Blob.prototype.stream;
      Blob.prototype.stream = function () {
        return gone(this) ? new ReadableStream({ pull: (c) => c.error(new DOMException('The requested file could not be read.', 'NotReadableError')) }) : stream.call(this);
      };
    });
    await load(page, fx('split-60s.mp4'));
    await expect(page.locator('#tool')).toHaveAttribute('data-duration', '60');
    await page.evaluate(() => ((window as unknown as { __armed: boolean }).__armed = true));
    await page.locator('input[name="vs-mode"][value="equal"]').check();
    await page.locator('#vs-equal').fill('3');
    await page.locator('#run').click();
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 60_000 });
    expect(await lastRun(page)).toMatchObject({ outcome: 'ok' });
  });

  // A video over the 50 MB copy limit is read from the phone's storage on every cut, so it can fail more than once in a row.
  for (const [label, reads, ok] of [
    ['a big video whose cut fails to read twice in a row is read a third time and splits', 2, true],
    ['a big video that stays unreadable mid-cut ends as NotReadableError with the save-to-phone message', 1000, false],
  ] as const) {
    test(label, async ({ page }, testInfo) => {
      const big = testInfo.outputPath('big-60s.mp4');
      // A 'free' box is valid padding after the movie: the clip is unchanged and the file is past the 50 MB copy limit.
      const head = readFileSync(fx('split-60s.mp4'));
      const pad = Buffer.alloc(52 * 1024 * 1024);
      pad.writeUInt32BE(pad.length, 0);
      pad.write('free', 4, 'latin1');
      writeFileSync(big, Buffer.concat([head, pad]));
      await open(page);
      await page.addInitScript(() => {
        const w = window as unknown as { __fail: number; __failed: number };
        w.__fail = 0;
        w.__failed = 0;
        // Only the big reads fail; the one-byte probe between reads passes, so each failure is one run of the job.
        const fail = (blob: Blob) => {
          if (w.__fail <= 0 || blob.size <= 1) return false;
          w.__fail--;
          w.__failed++;
          return true;
        };
        const arrayBuffer = Blob.prototype.arrayBuffer;
        Blob.prototype.arrayBuffer = function () {
          return fail(this) ? Promise.reject(new DOMException('The requested file could not be read.', 'NotReadableError')) : arrayBuffer.call(this);
        };
        const stream = Blob.prototype.stream;
        Blob.prototype.stream = function () {
          if (!fail(this)) return stream.call(this);
          return new ReadableStream({ pull: (c) => c.error(new DOMException('The requested file could not be read.', 'NotReadableError')) });
        };
      });
      await load(page, big);
      await expect(page.locator('#tool')).toHaveAttribute('data-duration', '60');
      await page.evaluate((n) => ((window as unknown as { __fail: number }).__fail = n), reads);
      await page.locator('input[name="vs-mode"][value="equal"]').check();
      await page.locator('#vs-equal').fill('2');
      await page.locator('#run').click();
      if (ok) {
        await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 120_000 });
        expect(await page.evaluate(() => (window as unknown as { __failed: number }).__failed)).toBe(2);
        expect(await lastRun(page)).toMatchObject({ outcome: 'ok' });
      } else {
        await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 120_000 });
        await expect(page.locator('#error')).toContainText('save it to the phone first');
        // Read exactly three times, no more.
        expect(await page.evaluate(() => (window as unknown as { __failed: number }).__failed)).toBe(3);
        expect(await lastRun(page)).toMatchObject({ outcome: 'error', error_class: expect.stringMatching(/^NotReadable(Probe|MidRead)$/) });
      }
    });
  }

  test('a file that is not a video is refused as UnreadableFile', async ({ page }) => {
    await open(page);
    await load(page, fx('../../../package.json'));
    await expect(page.locator('#error')).toContainText('not a video this page can read');
    await page.locator('#run').click();
    await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 60_000 });
    expect(await lastRun(page)).toMatchObject({ outcome: 'error', error_class: 'UnreadableFile' });
  });

  test('Run waits for a good cut list and comes back for a good one', async ({ page }) => {
    await open(page);
    await load(page, fx('split-60s.mp4'));
    await expect(page.locator('#tool')).toHaveAttribute('data-duration', '60');
    // Times left empty: the page says what to type and Run stays off.
    await expect(page.locator('#vs-info')).toContainText('Type the times');
    await expect(page.locator('#run')).toBeDisabled();
    await page.locator('#vs-times').fill('2:00');
    await expect(page.locator('#run')).toBeDisabled();
    await page.locator('#vs-times').fill('0:20');
    await expect(page.locator('#run')).toBeEnabled();
    await page.locator('#run').click();
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 60_000 });
    expect(await lastRun(page)).toMatchObject({ outcome: 'ok' });
    // After the run the shell turns Run on again; a bad list turns it off again.
    await page.locator('#vs-times').fill('');
    await expect(page.locator('#run')).toBeDisabled();
    // Switching Run on by hand does not get past the guard.
    await page.evaluate(() => ((document.getElementById('run') as HTMLButtonElement).disabled = false));
    await expect(page.locator('#run')).toBeDisabled();
  });

  test('the encoder fails on a fast cut: the part is copied from the key frame and says so', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit' && !!process.env.CI, 'Linux WebKit in CI stalls decoding and encoding video');
    await open(page);
    await page.addInitScript(() => {
      const original = VideoEncoder.prototype.encode;
      VideoEncoder.prototype.encode = function () {
        throw new DOMException('forced by the test', 'EncodingError');
      };
      (window as unknown as { __orig: unknown }).__orig = original;
    });
    await load(page, fx('split-gop2s.mp4'));
    await expect(page.locator('#tool')).toHaveAttribute('data-duration', /^8/);
    await page.locator('#vs-times').fill('0:03');
    await page.locator('#run').click();
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 120_000 });
    await expect(page.locator('#results-list')).toContainText('key frame');
    const [zip] = await Promise.all([page.waitForEvent('download'), page.locator('#download-all').click()]);
    const files = unzipSync(new Uint8Array(readFileSync((await zip.path())!)));
    const names = Object.keys(files).sort();
    expect(names).toHaveLength(2);
    const input = new Input({ source: new BufferSource(files[names[1]!]!), formats: ALL_FORMATS });
    const first = await (await input.getPrimaryVideoTrack())!.getFirstTimestamp();
    expect(first).toBeLessThanOrEqual(3.05);
    expect(await lastRun(page)).toMatchObject({ outcome: 'ok' });
  });

  // Odd inputs: each splits into parts that run end to end, or ends in a named class, and never hangs.
  const odd: [string, string, string, number][] = [
    ['variable frame rate', 'split-vfr-12s.mp4', '4', 12],
    ['rotated (portrait phone clip)', 'iphone-portrait.mov', '1.5', 4],
    ['one key frame in 20 s', 'split-sparse-20s.mp4', '7', 20],
    ['half a second long', 'split-short-0.5s.mp4', '0.2', 0.5],
  ];
  for (const exact of [false, true]) {
    for (const [label, name, every, length] of odd) {
      test(`${label}, ${exact ? 'exact' : 'fast'}: parts or a named refusal`, async ({ page, browserName }) => {
        test.skip(browserName === 'webkit' && !!process.env.CI, 'Linux WebKit in CI stalls decoding and encoding video (a part that starts between key frames is re-encoded); macOS WebKit runs it locally with PW_WEBKIT=1');
        await open(page);
        await load(page, fx(name));
        await expect(page.locator('#tool')).toHaveAttribute('data-duration', /\d/);
        await page.locator('input[name="vs-mode"][value="every"]').check();
        await page.locator('#vs-every').fill(every);
        if (exact) await page.locator('#exact').check();
        await page.locator('#run').click();
        await page.locator('#results.is-active, #error.is-active').first().waitFor({ timeout: 240_000 });
        const d = await lastRun(page);
        if (d.outcome === 'error') {
          expect(['Error', 'Unknown', undefined, ''], `unnamed failure: ${d.error_class}`).not.toContain(d.error_class);
        } else {
          expect(d.outcome).toBe('ok');
          const [zip] = await Promise.all([page.waitForEvent('download'), page.locator('#download-all').click()]);
          const files = Object.values(unzipSync(new Uint8Array(readFileSync((await zip.path())!))));
          expect(files.length).toBeGreaterThanOrEqual(2);
          let sum = 0;
          for (const f of files) {
            const input = new Input({ source: new BufferSource(f), formats: ALL_FORMATS });
            sum += await (await input.getPrimaryVideoTrack())!.computeDuration();
          }
          // The parts run end to end: together they are the source's length, give or take a frame or the key-frame snap.
          expect(Math.abs(sum - length)).toBeLessThan(Math.max(0.5, length * 0.08));
        }
      });
    }
  }

  test('split at the very edges: 0 and the end are refused early, just inside them works', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit' && !!process.env.CI, 'Linux WebKit in CI stalls encoding video');
    await open(page);
    await load(page, fx('split-60s.mp4'));
    await expect(page.locator('#tool')).toHaveAttribute('data-duration', '60');
    await page.locator('#vs-times').fill('0');
    await expect(page.locator('#vs-info')).toContainText('0:00 would make an empty first part');
    await page.locator('#vs-times').fill('1:00');
    await expect(page.locator('#vs-info')).toContainText('not inside the video');
    await page.locator('#vs-times').fill('0:00.5, 0:59');
    await expect(page.locator('#vs-parts li')).toHaveCount(3);
    await page.locator('#run').click();
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 240_000 });
    expect(await lastRun(page)).toMatchObject({ outcome: 'ok' });
  });
});
