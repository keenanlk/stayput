// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { allowServiceWorker } from './allow-sw';
import { recordAnalytics, toolRuns } from './model-storage-helpers';

/**
 * The vocal remover on a phone (STAA-651): a song over the phone budget is refused by name before anything is decoded,
 * a worker that fails with no name of its own gets one retry and then a named, actionable error, and on a computer a short
 * song comes out as before (instrumental + vocals add back to the song). Audio is generated here, never a user's file.
 */
test.use({ serviceWorkers: 'allow' });
test.beforeEach(async ({ context }) => allowServiceWorker(context));

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1';

/** A 16-bit PCM WAV of a two-tone signal. */
function wav(seconds: number, rate: number, channels: number): Buffer {
  const frames = Math.round(seconds * rate);
  const data = Buffer.alloc(frames * channels * 2);
  for (let i = 0; i < frames; i++)
    for (let c = 0; c < channels; c++) data.writeInt16LE(Math.round(8000 * Math.sin((2 * Math.PI * (220 + 110 * c) * i) / rate) + 4000 * Math.sin((2 * Math.PI * 1320 * i) / rate)), (i * channels + c) * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * channels * 2, 28);
  h.writeUInt16LE(channels * 2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

async function open(page: Page) {
  await page.goto('/tools/vocal-remover');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
}

/** Replaces the separation worker with one that fails `fails` times (no name of its own), then returns the song as the instrumental and silence as vocals. */
async function fakeWorker(page: Page, fails: number, failName = 'WorkerFailed') {
  await page.addInitScript(([fails, failName]) => {
    const Real = window.Worker;
    const w = window as unknown as { __made: number; Worker: unknown };
    w.__made = 0;
    w.Worker = function (url: string | URL, opts?: WorkerOptions) {
      if (!/vocals/.test(String(url))) return new Real(url, opts);
      const n = w.__made++;
      const t = new EventTarget() as EventTarget & { postMessage: (m: { id: number; left: Float32Array; right: Float32Array }) => void; terminate: () => void };
      t.postMessage = (m) =>
        setTimeout(() => {
          const data =
            n < fails
              ? { id: m.id, type: 'error', name: failName, message: 'the worker went away' }
              : { id: m.id, type: 'done', left: m.left, right: m.right, vocalsLeft: new Float32Array(m.left.length), vocalsRight: new Float32Array(m.right.length), engine: 'cpu' };
          t.dispatchEvent(new MessageEvent('message', { data }));
        }, 10);
      t.terminate = () => {};
      return t;
    };
  }, [fails, failName] as const);
}

const made = (page: Page) => page.evaluate(() => (window as unknown as { __made: number }).__made);

test.describe('on an iPhone', () => {
  test.use({ userAgent: IPHONE, hasTouch: true, viewport: { width: 390, height: 844 } });

  test('a song over the phone budget is refused as TooLongForPhone before any worker starts', async ({ page }) => {
    await recordAnalytics(page);
    await fakeWorker(page, 0);
    await open(page);
    // 11 minutes of 8 kHz mono: a small file whose header says it is longer than the 6-minute budget.
    await page.locator('#file-input').setInputFiles({ name: 'long.wav', mimeType: 'audio/wav', buffer: wav(11 * 60, 8000, 1) });
    await page.locator('#run').click();
    await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 30_000 });
    await expect(page.locator('#error')).toContainText('about 11 minutes');
    await expect(page.locator('#error')).toContainText('Audio splitter');
    expect(await toolRuns(page, 1)).toEqual([expect.objectContaining({ outcome: 'error', error_class: 'TooLongForPhone' })]);
    expect(await made(page)).toBe(0);
  });

  test('a 5-minute song is refused on an iPhone, which has no deviceMemory to halve the budget (STAA-720)', async ({ page }) => {
    await recordAnalytics(page);
    await fakeWorker(page, 0);
    await open(page);
    await page.locator('#file-input').setInputFiles({ name: 'five.wav', mimeType: 'audio/wav', buffer: wav(5 * 60, 8000, 1) });
    await page.locator('#run').click();
    await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 30_000 });
    await expect(page.locator('#error')).toContainText('longer than about 4 minutes');
    expect(await toolRuns(page, 1)).toEqual([expect.objectContaining({ outcome: 'error', error_class: 'TooLongForPhone' })]);
    expect(await made(page)).toBe(0);
  });

  test('a song under the budget still runs', async ({ page }) => {
    await fakeWorker(page, 0);
    await open(page);
    await page.locator('#file-input').setInputFiles({ name: 'ok.wav', mimeType: 'audio/wav', buffer: wav(5, 44100, 2) });
    await page.locator('#run').click();
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 60_000 });
  });
});

test.describe('a worker that fails with no name of its own', () => {
  test('is tried once more on a fresh worker and the run finishes', async ({ page }) => {
    await fakeWorker(page, 1);
    await open(page);
    await page.locator('#file-input').setInputFiles({ name: 'a.wav', mimeType: 'audio/wav', buffer: wav(3, 44100, 2) });
    await page.locator('#run').click();
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 60_000 });
    expect(await made(page)).toBe(2);
  });

  test('after the retry also fails shows SeparationFailed with the cause and what to do', async ({ page }) => {
    await recordAnalytics(page);
    await fakeWorker(page, 5);
    await open(page);
    await page.locator('#file-input').setInputFiles({ name: 'a.wav', mimeType: 'audio/wav', buffer: wav(3, 44100, 2) });
    await page.locator('#run').click();
    await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 60_000 });
    await expect(page.locator('#error')).toContainText('failed twice');
    await expect(page.locator('#error')).toContainText('the worker went away');
    expect(await toolRuns(page, 1)).toEqual([expect.objectContaining({ outcome: 'error', error_class: 'SeparationFailed' })]);
    expect(await made(page)).toBe(2);
  });
});

test('a worker that names its step keeps that name after the retry also fails', async ({ page }) => {
  await recordAnalytics(page);
  await fakeWorker(page, 5, 'SessionCreateFailed');
  await open(page);
  await page.locator('#file-input').setInputFiles({ name: 'a.wav', mimeType: 'audio/wav', buffer: wav(3, 44100, 2) });
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 60_000 });
  expect(await toolRuns(page, 1)).toEqual([expect.objectContaining({ outcome: 'error', error_class: 'SessionCreateFailed' })]);
  expect(await made(page)).toBe(2);
});

test('on a computer a short song comes out as an instrumental and vocals that add back to the song', async ({ page }) => {
  test.setTimeout(420_000);
  await page.addInitScript(() => {
    const blobs: Blob[] = [];
    (window as unknown as { __blobs: Blob[] }).__blobs = blobs;
    const real = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (b: Blob | MediaSource) => (b instanceof Blob && blobs.push(b), real(b));
  });
  await open(page);
  await page.locator('#format').selectOption('wav');
  await page.locator('#stems').selectOption('both');
  const src = wav(4, 44100, 2);
  await page.locator('#file-input').setInputFiles({ name: 'tone.wav', mimeType: 'audio/wav', buffer: src });
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 300_000 });
  for (const b of await page.locator('#results button:has-text("Download")').all()) await b.evaluate((el) => (el as HTMLElement).click());
  const sums = await page.evaluate(async () => {
    const blobs = (window as unknown as { __blobs: Blob[] }).__blobs.filter((b) => b.type.includes('wav'));
    const pcm = async (b: Blob) => new Int16Array((await b.arrayBuffer()).slice(44));
    return Promise.all(blobs.map(async (b) => Array.from((await pcm(b)).slice(0, 4000))));
  });
  expect(sums.length).toBe(2);
  // instrumental + vocals = song, up to 16-bit rounding (the vocals are song minus instrumental/1.022 then rescaled by 1.022).
  const song = new Int16Array(src.buffer.slice(src.byteOffset + 44, src.byteOffset + 44 + 8000));
  let worst = 0;
  for (let i = 0; i < 4000; i++) worst = Math.max(worst, Math.abs((sums[0]![i]! / 1.022 + sums[1]![i]!) - song[i]!));
  expect(worst).toBeLessThan(40);
});
