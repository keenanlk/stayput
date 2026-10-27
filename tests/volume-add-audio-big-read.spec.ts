// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// A phone video can be hundreds of MB. Reading it whole (Blob.arrayBuffer) asks the browser for one allocation that big,
// and Chrome on Android reports a failed one as NotReadableError at once. The volume booster (and its
// /increase-video-volume page) and Add audio to video in mix mode read the sound of a video in slices and hand it
// straight to the video writer, so a run finishes even when every big read is refused, and never asks for the whole file.
const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));
const KEYS = new Set(['tool', 'outcome', 'attempt', 'files', 'input', 'output', 'duration', 'format', 'error_class', 'landing', 'ref', 'from', 'visit', 'prev_tool', 'run_n', 'tools_used', 'run_gap', 'ns', 'via']);
type Ev = { n: string; d: Record<string, string> };
const events = (page: Page): Promise<Ev[]> => page.evaluate(() => JSON.parse(sessionStorage.getItem('__ev') || '[]'));

/** The clip followed by a `free` box of zeros: still the same video, but big enough that a whole read is a real allocation. */
function padded(name: string, extra: number, path: string) {
  const clip = readFileSync(fixture(name));
  const box = Buffer.alloc(8 + extra);
  box.writeUInt32BE(8 + extra, 0);
  box.write('free', 4, 'latin1');
  writeFileSync(path, Buffer.concat([clip, box]));
  return path;
}

/** Two seconds of silence as a WAV, so a mix has nothing in it but the video's own sound. */
function silence(path: string) {
  const n = 48_000 * 2 * 2;
  const b = Buffer.alloc(44 + n);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(48_000, 24);
  b.writeUInt32LE(96_000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(n, 40);
  writeFileSync(path, b);
  return path;
}

/** Refuses a read of a blob bigger than `limit` bytes the way Android does (NotReadableError); `limit` 0 means half the biggest input. Counts reads of a whole input. */
async function refuseBigReads(page: Page, limit: number, streams = true) {
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const k='__ev';const a=JSON.parse(sessionStorage.getItem(k)||'[]');a.push({n,d});sessionStorage.setItem(k,JSON.stringify(a));}};`,
    }),
  );
  await page.addInitScript(({ lim, streams }) => {
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
    const w = window as unknown as { __whole: number; __inputs: number[]; __armed: boolean };
    w.__whole = 0;
    w.__armed = false;
    w.__inputs = [];
    // Refuse only once the sound is being read, after the early copy of a small file (which is a small allocation).
    addEventListener('DOMContentLoaded', () => {
      const text = document.querySelector('#progress-text')!;
      new MutationObserver(() => {
        if (/Reading the (sound|files)/.test(text.textContent ?? '')) w.__armed = true;
      }).observe(text, { childList: true, characterData: true, subtree: true });
    });
    const NR = () => new DOMException('The requested file could not be read.', 'NotReadableError');
    const check = (blob: Blob) => {
      if (w.__armed && w.__inputs.some((n) => n > 1_000_000 && blob.size >= n)) w.__whole++;
      return w.__armed && blob.size > (lim || Math.max(0, ...w.__inputs) / 2);
    };
    const { arrayBuffer, stream, text } = Blob.prototype;
    Blob.prototype.arrayBuffer = function () {
      return check(this) ? Promise.reject(NR()) : arrayBuffer.call(this);
    };
    Blob.prototype.text = function () {
      return check(this) ? Promise.reject(NR()) : text.call(this);
    };
    Blob.prototype.stream = function () {
      return streams && check(this) ? new ReadableStream({ pull: (c) => c.error(NR()) }) : stream.call(this);
    };
  }, { lim: limit, streams });
}

async function run(page: Page, path: string, inputs: string[], before?: () => Promise<void>) {
  await page.goto(path);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await before?.();
  await page.locator('#file-input').setInputFiles(inputs);
  // From here on, a read of this many bytes is a read of a whole input.
  const sizes = inputs.map((p) => readFileSync(p).length);
  await page.evaluate((n) => ((window as unknown as { __inputs: number[] }).__inputs = n), sizes);
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 150_000 });
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
}

async function checkRun(page: Page, wholeCounted = true) {
  await expect.poll(async () => (await events(page)).filter((e) => e.n === 'tool_run').length).toBe(1);
  const all = await events(page);
  expect(all.find((e) => e.n === 'tool_run')!.d).toMatchObject({ outcome: 'ok' });
  for (const e of all) for (const k of Object.keys(e.d)) expect(KEYS.has(k), `${e.n} carries unexpected key ${k}`).toBe(true);
  if (wholeCounted) expect(await page.evaluate(() => (window as unknown as { __whole: number }).__whole), 'an input file was read whole').toBe(0);
}

const mix = (page: Page) => async () => {
  await page.locator('#mode').selectOption('mix');
};

/** RMS of the sound in the downloaded video. */
async function rmsOfDownload(page: Page, bytes: number[]) {
  return page.evaluate(async (data) => {
    const ctx = new OfflineAudioContext(2, 1, 48000);
    const buffer = await ctx.decodeAudioData(new Uint8Array(data).buffer);
    let sum = 0;
    let n = 0;
    for (let c = 0; c < buffer.numberOfChannels; c++) for (const v of buffer.getChannelData(c)) (sum += v * v), n++;
    return Math.sqrt(sum / n);
  }, bytes);
}

// Over the 50 MB early-copy limit, so the file is only checked, and every later read is its own.
test('/increase-video-volume: a 60 MB video is finished though every read over 16 MB is refused', async ({ page }, info) => {
  test.skip(info.project.name !== 'webkit', 'AAC sound is decoded in WebKit only here');
  test.setTimeout(180_000);
  await refuseBigReads(page, 16 * 1024 * 1024);
  await run(page, '/increase-video-volume', [padded('center51.mp4', 60 * 1024 * 1024, info.outputPath('big.mp4'))]);
  await checkRun(page);
});

test('add audio to video, mix mode: a 60 MB video is finished though every read over 16 MB is refused', async ({ page }, info) => {
  test.skip(info.project.name !== 'webkit', 'AAC sound is decoded in WebKit only here');
  test.setTimeout(180_000);
  await refuseBigReads(page, 16 * 1024 * 1024);
  await run(page, '/tools/add-audio-to-video', [padded('speech.mov', 60 * 1024 * 1024, info.outputPath('big.mov')), fixture('tone.m4a')], mix(page));
  await checkRun(page);
});

test('add audio to video: a 60 MB video given as the sound is read in slices too', async ({ page }, info) => {
  test.skip(info.project.name !== 'webkit', 'AAC sound is decoded in WebKit only here');
  test.setTimeout(180_000);
  await refuseBigReads(page, 16 * 1024 * 1024);
  await run(page, '/tools/add-audio-to-video', [fixture('clip.webm'), padded('speech.mov', 60 * 1024 * 1024, info.outputPath('big.mov'))]);
  await checkRun(page);
});

// Opus in WebM goes through the page's own decoder (buffer by buffer). The clip is small enough for one slice to be the
// whole file, so only a whole-file arrayBuffer() is refused.
for (const path of ['/increase-video-volume', '/tools/add-audio-to-video']) {
  test(`${path}: an Opus video is finished though arrayBuffer() on the file is refused`, async ({ page }, info) => {
    test.skip(info.project.name !== 'chromium', 'WebKit reads each slice whole, which at this size is the file');
    test.setTimeout(180_000);
    await refuseBigReads(page, 0, false);
    const add = path.includes('add-audio');
    await run(page, path, add ? [fixture('talk.webm'), fixture('tone.m4a')] : [fixture('talk.webm')], add ? mix(page) : undefined);
    await checkRun(page, false);
  });
}

// A 5.1 film keeps its dialogue, which sits in the centre channel only.
for (const [tool, path] of [['volume booster', '/increase-video-volume'], ['add audio (mix)', '/tools/add-audio-to-video']] as const) {
  for (const clip of ['center51.mp4', 'center51.webm']) {
    test(`${tool}: 5.1 sound with only a centre channel keeps its voice (${clip})`, async ({ page }, info) => {
      test.skip(clip.endsWith('mp4') && info.project.name !== 'webkit', 'AAC sound is decoded in WebKit only here');
      test.skip(clip.endsWith('mp4') && !!process.env.CI, 'Linux CI WebKit cannot decode the AAC output in the page; run on a Mac, and the WebM case covers CI');
      test.skip(clip.endsWith('webm') && info.project.name !== 'chromium', 'Opus in WebM is decoded in Chromium only here');
      test.setTimeout(180_000);
      await page.goto(path);
      await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
      const add = path.includes('add-audio');
      if (add) await mix(page)();
      const download = page.waitForEvent('download');
      await page.locator('#file-input').setInputFiles(add ? [fixture(clip), silence(info.outputPath('silence.wav'))] : [fixture(clip)]);
      await page.locator('#run').click();
      await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 150_000 });
      const bytes = [...readFileSync((await (await download).path())!)];
      expect(await rmsOfDownload(page, bytes)).toBeGreaterThan(0.01);
    });
  }
}

// Where the browser can write to its private file system, the finished video is a file on disk, not a buffer.
test('the finished video is written to a temporary file on this device', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Playwright WebKit cannot write OPFS');
  test.setTimeout(180_000);
  await page.goto('/increase-video-volume');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(fixture('talk.webm'));
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 150_000 });
  const files = await page.evaluate(async () => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('stayput-outputs');
    const names: string[] = [];
    for await (const [name] of (dir as unknown as { entries(): AsyncIterable<[string, unknown]> }).entries()) names.push(name);
    return names;
  });
  expect(files.length).toBeGreaterThan(0);
});
