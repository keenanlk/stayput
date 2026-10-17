// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// A phone video can be hundreds of MB. Reading it whole (Blob.arrayBuffer) asks the browser for one allocation that big,
// and Chrome on Android reports a failed one as NotReadableError at once. The noise remover and the volume booster read
// the sound in slices through the demuxer and hand the cleaned sound straight to the video writer, so a run must finish
// even when any big read is refused, and must never ask for the whole file.
const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));
const KEYS = new Set(['tool', 'outcome', 'attempt', 'files', 'input', 'output', 'duration', 'format', 'error_class', 'landing', 'ref', 'from', 'visit', 'prev_tool', 'run_n', 'tools_used', 'run_gap', 'ns', 'via']);
type Ev = { n: string; d: Record<string, string> };
const events = (page: Page): Promise<Ev[]> => page.evaluate(() => JSON.parse(sessionStorage.getItem('__ev') || '[]'));

/** The clip followed by a `free` box of zeros: still the same video, but big enough that a whole read is a real allocation. */
function padded(name: string, extra: number) {
  const clip = readFileSync(fixture(name));
  const box = Buffer.alloc(8 + extra);
  box.writeUInt32BE(8 + extra, 0);
  box.write('free', 4, 'latin1');
  return { name, mimeType: 'video/mp4', buffer: Buffer.concat([clip, box]) };
}

/**
 * Refuse any read of a blob bigger than `limit` bytes the way Android does (NotReadableError), and count reads that
 * ask for the whole input file. `limit` of 0 means "half the input".
 */
async function refuseBigReads(page: Page, limit: number, streams = true) {
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const k='__ev';const a=JSON.parse(sessionStorage.getItem(k)||'[]');a.push({n,d});sessionStorage.setItem(k,JSON.stringify(a));}};`,
    }),
  );
  await page.addInitScript(({ lim, streams }) => {
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
    const w = window as unknown as { __whole: number; __refused: number; __input: number };
    w.__whole = 0;
    w.__refused = 0;
    w.__input = 0;
    const NR = () => new DOMException('The requested file could not be read.', 'NotReadableError');
    const check = (blob: Blob) => {
      if (w.__input && blob.size >= w.__input) w.__whole++;
      const max = lim || (w.__input ? w.__input / 2 : Infinity);
      if (blob.size > max) {
        w.__refused++;
        return true;
      }
      return false;
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

async function run(page: Page, path: string, input: string | { name: string; mimeType: string; buffer: Buffer }) {
  await page.goto(path);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(input);
  // From here on, a read of this many bytes is a read of the whole input.
  const size = typeof input === 'string' ? readFileSync(input).length : input.buffer.length;
  await page.evaluate((n) => ((window as unknown as { __input: number }).__input = n), size);
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 120_000 });
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
}

async function checkRun(page: Page, wholeCounted = true) {
  await expect.poll(async () => (await events(page)).filter((e) => e.n === 'tool_run').length).toBe(1);
  const all = await events(page);
  expect(all.find((e) => e.n === 'tool_run')!.d).toMatchObject({ outcome: 'ok' });
  for (const e of all) for (const k of Object.keys(e.d)) expect(KEYS.has(k), `${e.n} carries unexpected key ${k}`).toBe(true);
  const whole = await page.evaluate(() => (window as unknown as { __whole: number }).__whole);
  if (wholeCounted) expect(whole, 'the input file was read whole').toBe(0);
}

for (const path of ['/remove-background-noise-from-video', '/increase-video-volume']) {
  test(`${path}: a 40 MB video is finished though every read over 16 MB is refused`, async ({ page }, info) => {
    test.skip(info.project.name !== 'webkit', 'AAC sound is decoded in WebKit only here');
    test.setTimeout(150_000);
    await refuseBigReads(page, 16 * 1024 * 1024);
    await run(page, path, padded('center51.mp4', 40 * 1024 * 1024));
    await checkRun(page);
    // The padded file really is over the limit, and the run still read it.
    expect(await page.evaluate(() => (window as unknown as { __input: number }).__input)).toBeGreaterThan(16 * 1024 * 1024);
  });

  // Opus in WebM goes through the page's own decoder (buffer by buffer) instead of the MP4 wrapper.
  test(`${path}: an Opus video is finished though arrayBuffer() on the file is refused`, async ({ page }, info) => {
    test.skip(info.project.name !== 'chromium', 'WebKit reads each slice whole, which at this size is the file');
    test.setTimeout(150_000);
    // The clip is small enough for one slice to be the whole file, so only whole-file reads by arrayBuffer() are refused.
    await refuseBigReads(page, 0, false);
    await run(page, path, fixture('talk.webm'));
    await checkRun(page, false);
  });
}

// A 5.1 film keeps its dialogue, which sits in the centre channel only.
for (const clip of ['center51.mp4', 'center51.webm']) {
  test(`5.1 sound with only a centre channel keeps its voice (${clip})`, async ({ page }, info) => {
    test.skip(clip.endsWith('mp4') && info.project.name !== 'webkit', 'AAC sound is decoded in WebKit only here');
    test.setTimeout(150_000);
    await page.goto('/remove-background-noise-from-video');
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    await page.locator('label:has(input[name="strength"][value="light"])').click();
    const download = page.waitForEvent('download');
    await page.locator('#file-input').setInputFiles(fixture(clip));
    await page.locator('#run').click();
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 120_000 });
    const bytes = [...readFileSync((await (await download).path())!)];
    const rms = await page.evaluate(async (data) => {
      const ctx = new OfflineAudioContext(2, 1, 48000);
      const buffer = await ctx.decodeAudioData(new Uint8Array(data).buffer);
      let sum = 0;
      let n = 0;
      for (let c = 0; c < buffer.numberOfChannels; c++) for (const v of buffer.getChannelData(c)) (sum += v * v), n++;
      return Math.sqrt(sum / n);
    }, bytes);
    expect(rms).toBeGreaterThan(0.01);
  });
}
