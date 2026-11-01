// @webkit-project
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { reverseInPlace, reverseWindows, stage } from '../src/lib/video-reverse';

/** How Reverse video splits a video into pieces to decode, last first. */

test('reverse windows follow keyframes and cover the whole video once, last first', () => {
  const w = reverseWindows([0, 2, 4], 0, 5, 3);
  expect(w).toEqual([[4, 5], [2, 4], [0, 2]]);
});

test('a long stretch between keyframes is split into windows that fit in memory', () => {
  const w = reverseWindows([0], 0, 2.5, 1);
  expect(w).toEqual([[1.5, 2.5], [0.5, 1.5], [0, 0.5]]);
  // Together the windows cover the video with no gaps.
  const sorted = [...w].reverse();
  for (let i = 1; i < sorted.length; i++) expect(sorted[i]![0]).toBeCloseTo(sorted[i - 1]![1]);
});

test('a video that does not start at zero or lists no keyframes still gets windows', () => {
  expect(reverseWindows([], 0.5, 1.5, 2)).toEqual([[0.5, 1.5]]);
});

// A file with no picture track fails under a class name of its own, not as a plain "Error".
test('a file with no video track is recorded under a named error class', async ({ page }) => {
  const wav = readFileSync(fileURLToPath(new URL('./fixtures/static/jfk.wav', import.meta.url)));
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const a=JSON.parse(sessionStorage.getItem('__ev')||'[]');a.push({n,d});sessionStorage.setItem('__ev',JSON.stringify(a));}};`,
    }),
  );
  await page.goto('/tools/reverse-video');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles({ name: 'clip.mp4', mimeType: 'video/mp4', buffer: wav });
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 60_000 });
  const run = await page.evaluate(() => (JSON.parse(sessionStorage.getItem('__ev') || '[]') as { n: string; d: Record<string, string> }[]).filter((e) => e.n === 'tool_run').at(-1)?.d);
  expect(run?.outcome).toBe('error');
  expect(run?.error_class).toBe('UnreadableFile');
});

test('the sound is reversed where it lies and padded or cut to the video length', () => {
  const a = new Float32Array([1, 2, 3, 4]);
  const [same] = reverseInPlace([a], 4);
  expect([...same!]).toEqual([4, 3, 2, 1]);
  expect(same!.buffer).toBe(a.buffer);
  expect([...reverseInPlace([new Float32Array([1, 2, 3, 4])], 3)[0]!]).toEqual([3, 2, 1]);
  expect([...reverseInPlace([new Float32Array([1, 2])], 4)[0]!]).toEqual([0, 0, 2, 1]);
});

const clip = fileURLToPath(new URL('./fixtures/static/clip-720p-10s.mp4', import.meta.url));
const odd = fileURLToPath(new URL('./fixtures/edge-cases/odd-853x481.webm', import.meta.url));
const tenBit = fileURLToPath(new URL('./fixtures/edge-cases/hdr10-hevc.mp4', import.meta.url));

// WebKit on Linux CI stalls on video decode; these run on macOS.
test.beforeEach(({ browserName }) => {
  test.skip(browserName === 'webkit' && process.platform === 'linux', 'WebKit on Linux stalls on video decode');
});

/** Sample count of the first `stsz` box (the first track, which is the picture in the files made here). */
function frameCount(mp4: Buffer): number {
  const at = mp4.indexOf('stsz');
  return at < 0 ? 0 : mp4.readUInt32BE(at + 12);
}

async function stubBeacon(page: Page) {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const a=JSON.parse(sessionStorage.getItem('__ev')||'[]');a.push({n,d});sessionStorage.setItem('__ev',JSON.stringify(a));}};`,
    }),
  );
}

async function open(page: Page, file: string) {
  await page.goto('/tools/reverse-video');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(file);
}

async function reverse(page: Page, file: string): Promise<Buffer> {
  await open(page, file);
  const download = page.waitForEvent('download');
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 150_000 });
  return readFileSync(await (await download).path());
}

/** Plays the output in the page and reports its size and length. */
async function played(page: Page, bytes: Buffer) {
  return page.evaluate(async (data) => {
    const v = document.createElement('video');
    v.muted = true;
    v.src = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: 'video/mp4' }));
    await new Promise<void>((ok, bad) => {
      v.onloadeddata = () => ok();
      v.onerror = () => bad(new Error('the output did not load'));
    });
    return { width: v.videoWidth, height: v.videoHeight, duration: v.duration };
  }, [...bytes] as number[]);
}

test('frames with no pixel format are drawn to the canvas and still come out, frame for frame', async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => Object.defineProperty(VideoFrame.prototype, 'format', { get: () => null, configurable: true }));
  const out = await reverse(page, clip);
  const input = frameCount(readFileSync(clip));
  expect(Math.abs(frameCount(out) - input)).toBeLessThanOrEqual(2);
  const look = await played(page, out);
  expect(look.width).toBe(1280);
  expect(look.height).toBe(720);
});

test('an odd-sized video comes out with even sides and plays', async ({ page }) => {
  test.setTimeout(240_000);
  const out = await reverse(page, odd);
  const look = await played(page, out);
  expect(look.width % 2).toBe(0);
  expect(look.height % 2).toBe(0);
  expect([852, 854]).toContain(look.width);
  expect([480, 482]).toContain(look.height);
  expect(look.duration).toBeGreaterThan(0);
});

test('a 10-bit HEVC clip is reversed or refused as UnsupportedCodec, never a bare Error', async ({ page }) => {
  test.setTimeout(240_000);
  await stubBeacon(page);
  await open(page, tenBit);
  await page.locator('#run').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem('__ev') || '[]').some((e: { n: string }) => e.n === 'tool_run')), { timeout: 150_000 }).toBe(true);
  const run = await page.evaluate(() => (JSON.parse(sessionStorage.getItem('__ev') || '[]') as { n: string; d: Record<string, string> }[]).filter((e) => e.n === 'tool_run').at(-1)?.d);
  if (run?.outcome === 'error') expect(['UnsupportedCodec', 'UnreadableFile']).toContain(run.error_class);
  else expect(run?.outcome).not.toBe('error');
});

// A plain Error out of one stage is recorded under that stage's name. Each stage is made to fail in the page.
const STAGES: [string, string][] = [
  ['ReverseDecode', `VideoDecoder.prototype.decode = function () { throw new TypeError('forced'); };`],
  ['ReverseCopy', `VideoFrame.prototype.copyTo = function () { return Promise.reject(new TypeError('forced')); };`],
  ['ReverseEncode', `const e = VideoEncoder.prototype.encode; VideoEncoder.prototype.encode = function (...a) { if (/Reversing/.test(document.getElementById('progress-text')?.textContent ?? '')) throw new TypeError('forced'); return e.apply(this, a); };`],
  ['ReverseFinalize', `const f = VideoEncoder.prototype.flush; VideoEncoder.prototype.flush = function (...a) { if (/Reversing/.test(document.getElementById('progress-text')?.textContent ?? '')) return Promise.reject(new TypeError('forced')); return f.apply(this, a); };`],
];
for (const [name, patch] of STAGES) {
  test(`a plain error in the ${name} stage is recorded as ${name}`, async ({ page }) => {
    test.setTimeout(240_000);
    await stubBeacon(page);
    await page.addInitScript(patch);
    await open(page, clip);
    await page.locator('#run').click();
    await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 150_000 });
    const run = await page.evaluate(() => (JSON.parse(sessionStorage.getItem('__ev') || '[]') as { n: string; d: Record<string, string> }[]).filter((e) => e.n === 'tool_run').at(-1)?.d);
    expect(run?.error_class).toBe(name);
  });
}

// The packet scan reads from tables already in memory, so no browser fault reaches it; the helper every stage goes through is checked here.
test('a stage names a plain error and leaves a named one, such as the encoder\'s EncodingError, as it was', async () => {
  const bare = await stage('ReverseIndex', async () => { throw new TypeError('x'); }).catch((e: Error) => e);
  expect(bare.name).toBe('ReverseIndex');
  expect(bare.cause).toBeInstanceOf(TypeError);
  const encoding = Object.assign(new Error('x'), { name: 'EncodingError' });
  expect(await stage('ReverseEncode', async () => { throw encoding; }).catch((e: Error) => e)).toBe(encoding);
});
