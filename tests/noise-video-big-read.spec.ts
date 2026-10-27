// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// A phone video can be hundreds of MB. Reading it whole (Blob.arrayBuffer) asks the browser for one allocation that
// big, and Chrome on Android reports a failed one as NotReadableError at once; the re-read fails the same way. The
// noise remover reads the sound of a video in slices and hands the cleaned sound straight to the video writer, so a
// run finishes even when every big read is refused, and never asks for the whole file.
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

/** Refuses a read of a blob bigger than `limit` bytes the way Android does (NotReadableError); `limit` 0 means half the input. Counts reads of the whole input. */
async function refuseBigReads(page: Page, limit: number, streams = true) {
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const k='__ev';const a=JSON.parse(sessionStorage.getItem(k)||'[]');a.push({n,d});sessionStorage.setItem(k,JSON.stringify(a));}};`,
    }),
  );
  await page.addInitScript(({ lim, streams }) => {
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
    const w = window as unknown as { __whole: number; __input: number; __armed: boolean };
    w.__whole = 0;
    w.__armed = false;
    w.__input = 0;
    // Refuse only once the sound is being read, after the early copy of a small file (which is a small allocation).
    addEventListener('DOMContentLoaded', () => {
      const text = document.querySelector('#progress-text')!;
      new MutationObserver(() => {
        if (/Reading the sound/.test(text.textContent ?? '')) w.__armed = true;
      }).observe(text, { childList: true, characterData: true, subtree: true });
    });
    const NR = () => new DOMException('The requested file could not be read.', 'NotReadableError');
    const check = (blob: Blob) => {
      if (w.__input && blob.size >= w.__input) w.__whole++;
      return w.__armed && blob.size > (lim || (w.__input ? w.__input / 2 : Infinity));
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

async function run(page: Page, input: string) {
  await page.goto('/remove-background-noise-from-video');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(input);
  // From here on, a read of this many bytes is a read of the whole input.
  const size = readFileSync(input).length;
  await page.evaluate((n) => ((window as unknown as { __input: number }).__input = n), size);
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 120_000 });
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
}

async function checkRun(page: Page) {
  await expect.poll(async () => (await events(page)).filter((e) => e.n === 'tool_run').length).toBe(1);
  const all = await events(page);
  expect(all.find((e) => e.n === 'tool_run')!.d).toMatchObject({ outcome: 'ok' });
  for (const e of all) for (const k of Object.keys(e.d)) expect(KEYS.has(k), `${e.n} carries unexpected key ${k}`).toBe(true);
}

test('a 60 MB video is finished though every read over 16 MB is refused', async ({ page }, info) => {
  test.skip(info.project.name !== 'webkit', 'AAC sound is decoded in WebKit only here');
  test.setTimeout(150_000);
  await refuseBigReads(page, 16 * 1024 * 1024);
  // Over the 50 MB early-copy limit, so the file is only checked, and every later read is its own.
  await run(page, padded('speech.mov', 60 * 1024 * 1024, info.outputPath('speech-60mb.mov')));
  await checkRun(page);
  expect(await page.evaluate(() => (window as unknown as { __whole: number }).__whole), 'the input file was read whole').toBe(0);
});

// Opus in WebM goes through the page's own decoder (buffer by buffer). The clip is small enough for one slice to be the
// whole file, so only a whole-file arrayBuffer() (and the cleaned sound written out as a WAV and read back) is refused.
test('an Opus video is finished though arrayBuffer() on the file and on the cleaned sound is refused', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'WebKit reads each slice whole, which at this size is the file');
  test.setTimeout(150_000);
  await refuseBigReads(page, 0, false);
  await run(page, fixture('talk.webm'));
  await checkRun(page);
});
