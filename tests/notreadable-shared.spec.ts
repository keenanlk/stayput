// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectFile } from '../src/lib/intake';
import { retryRun, snapshotFile, SNAPSHOT_LIMIT } from '../src/lib/read-failure';

// Android "the browser could not read the file", on every audio and video tool through the shared path: the file is reached end to end
// when it is added (a file out of reach is refused then and Run stays off), copied once when Run starts (in memory, or on temporary disk
// space for a big file), and read again once when a read fails part-way. The reads are forced to fail in the page, on the File the
// input handed over (never on the copy the tool works from).
const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
type Ev = { n: string; d: Record<string, string> };
const events = (page: Page): Promise<Ev[]> => page.evaluate(() => JSON.parse(sessionStorage.getItem('__ev') || '[]'));

interface Tool {
  name: string;
  path: string;
  kind: 'video' | 'audio';
  /** The run finishes in this spec (no model to fetch). */
  finishes: boolean;
  speech?: boolean;
}
const TOOLS: Tool[] = [
  { name: 'blur-video-background', path: '/blur-video-background', kind: 'video', finishes: false },
  { name: 'compress-video', path: '/tools/compress-video', kind: 'video', finishes: true },
  { name: 'resize-video', path: '/tools/resize-video', kind: 'video', finishes: true },
  { name: 'add-subtitles-to-video', path: '/tools/add-subtitles-to-video', kind: 'video', finishes: false, speech: true },
  { name: 'video-to-mp3', path: '/tools/video-to-mp3', kind: 'video', finishes: true },
  { name: 'mp3-to-midi', path: '/tools/mp3-to-midi', kind: 'audio', finishes: false },
  { name: 'audio-to-text', path: '/audio-to-text', kind: 'audio', finishes: false, speech: true },
];

type Mode = 'none' | 'first' | 'last' | 'mid' | 'once' | 'memory';

/** Makes reads of the picked File (and slices of it) fail by `__mode`, and counts the failures in `__failed`. */
function install() {
  const w = window as unknown as { __mode: Mode; __failed: number; __picked: File[] };
  w.__mode = 'none';
  w.__failed = 0;
  w.__picked = [];
  const roots = new WeakSet<Blob>();
  const parts = new WeakMap<Blob, { root: Blob; start: number; end: number }>();
  document.addEventListener(
    'change',
    (e) => {
      for (const f of Array.from((e.target as HTMLInputElement).files ?? [])) {
        roots.add(f);
        w.__picked.push(f);
      }
    },
    true,
  );
  const span = (b: Blob) => (roots.has(b) ? { root: b, start: 0, end: b.size } : parts.get(b));
  const { slice, arrayBuffer, stream } = Blob.prototype;
  Blob.prototype.slice = function (this: Blob, a?: number, b?: number, c?: string) {
    const out = slice.call(this, a, b, c);
    const of = span(this);
    if (of) parts.set(out, { root: of.root, start: of.start + Math.min(Math.max(a ?? 0, 0), of.end - of.start), end: of.start + Math.min(b ?? of.end - of.start, of.end - of.start) });
    return out;
  };
  /** The error to give this read, or undefined to let it through. */
  const verdict = (b: Blob): Error | undefined => {
    const s = span(b);
    if (!s || w.__mode === 'none') return undefined;
    const size = s.root.size;
    const len = s.end - s.start;
    const big = len >= Math.min(size / 2, 256 * 1024);
    const notReadable = () => new DOMException('The requested file could not be read.', 'NotReadableError');
    if (w.__mode === 'first') return s.start === 0 ? notReadable() : undefined;
    if (w.__mode === 'last') return len === 1 && s.start === size - 1 ? notReadable() : undefined;
    if (w.__mode === 'memory') return big ? new RangeError('Array buffer allocation failed') : undefined;
    if (!big) return undefined;
    if (w.__mode === 'once') w.__mode = 'none';
    return notReadable();
  };
  Blob.prototype.arrayBuffer = function (this: Blob) {
    const e = verdict(this);
    if (!e) return arrayBuffer.call(this);
    w.__failed++;
    return Promise.reject(e);
  };
  Blob.prototype.stream = function (this: Blob) {
    const e = verdict(this);
    if (!e) return stream.call(this);
    w.__failed++;
    return new ReadableStream({ pull: (c) => c.error(e) });
  };
}

async function open(page: Page, tool: Tool) {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const a=JSON.parse(sessionStorage.getItem('__ev')||'[]');a.push({n,d});sessionStorage.setItem('__ev',JSON.stringify(a));}};`,
    }),
  );
  if (tool.speech) {
    // The speech worker is a stand-in: what is under test is the reading, not the transcript.
    await page.addInitScript(() => {
      const Real = window.Worker;
      class FakeWorker extends EventTarget {
        postMessage(msg: { id: number }) {
          setTimeout(() => this.dispatchEvent(new MessageEvent('message', { data: { id: msg.id, type: 'result', chunks: [{ start: 0, end: 1.5, text: 'Hello' }], language: 'en' } })), 10);
        }
        terminate() {}
      }
      (window as unknown as { Worker: unknown }).Worker = function (url: string | URL, opts?: WorkerOptions) {
        return /transcribe/.test(String(url)) ? new FakeWorker() : new Real(url, opts);
      };
      // Safari would pick the GPU worker, which the stand-in does not replace.
      Object.defineProperty(navigator, 'gpu', { value: undefined });
    });
  }
  await page.addInitScript(install);
  await page.goto(tool.path);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
}

const setMode = (page: Page, mode: Mode) => page.evaluate((m) => ((window as unknown as { __mode: string }).__mode = m), mode);
const failed = (page: Page) => page.evaluate(() => (window as unknown as { __failed: number }).__failed);
const sample = (tool: Tool, browser: string) => (tool.kind === 'audio' ? fixture('generated/tone.wav') : fixture(`static/${browser === 'webkit' ? 'speech.mov' : 'talk.webm'}`));
const runs = async (page: Page) => (await events(page)).filter((e) => e.n === 'tool_run');
/** Past the copy and the first reads: the run left "Preparing…" or failed. */
const pastCopy = async (page: Page) => {
  await expect.poll(() => page.evaluate(() => document.getElementById('error')?.classList.contains('is-active') || (document.getElementById('progress-text')?.textContent ?? '') !== 'Preparing…'), { timeout: 60_000 }).toBe(true);
};

for (const tool of TOOLS) {
  test.describe(tool.name, () => {
    test.setTimeout(180_000);

    test('first byte out of reach: refused when added, Run off', async ({ page, browserName }) => {
      await open(page, tool);
      await setMode(page, 'first');
      await page.locator('#file-input').setInputFiles(sample(tool, browserName));
      const hint = page.locator('#run-hint');
      await expect(hint).toHaveAttribute('data-problem', /FileNotDownloaded|NotReadableProbe/, { timeout: 15_000 });
      await expect(hint).toContainText(/save it to (the|this) (phone|device)/i);
      await expect(page.locator('#run')).toBeDisabled();
      expect(await runs(page)).toHaveLength(0);
    });

    test('a read part-way fails once, then reads: the copy takes it and the run goes on', async ({ page, browserName }) => {
      await open(page, tool);
      await page.locator('#file-input').setInputFiles(sample(tool, browserName));
      await expect(page.locator('#run')).toBeEnabled();
      await setMode(page, 'once');
      await page.locator('#run').click();
      if (tool.finishes) {
        await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 150_000 });
        await expect.poll(async () => (await runs(page)).length).toBe(1);
        expect((await runs(page))[0]!.d).toMatchObject({ outcome: 'ok' });
      } else {
        await pastCopy(page);
        await expect(page.locator('#error')).not.toContainText('could not be read');
      }
      expect(await failed(page)).toBeGreaterThan(0);
    });

    test('part-way reads always fail: NotReadableMidRead, with the existing words', async ({ page, browserName }) => {
      await open(page, tool);
      await page.locator('#file-input').setInputFiles(sample(tool, browserName));
      await expect(page.locator('#run')).toBeEnabled();
      await setMode(page, 'mid');
      await page.locator('#run').click();
      await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 60_000 });
      await expect(page.locator('#error')).toContainText('This file could not be read. If it is in Google Photos, Drive or another cloud app, save it to the phone first');
      await expect.poll(async () => (await runs(page)).length).toBe(1);
      expect((await runs(page))[0]!.d).toMatchObject({ outcome: 'error', error_class: 'NotReadableMidRead' });
    });

    test('last byte out of reach, middle fine: added, and the run goes on', async ({ page, browserName }) => {
      await open(page, tool);
      await setMode(page, 'last');
      await page.locator('#file-input').setInputFiles(sample(tool, browserName));
      await expect(page.locator('#run')).toBeEnabled();
      await expect(page.locator('#run-hint')).not.toHaveAttribute('data-problem', /.+/);
      await page.locator('#run').click();
      if (tool.finishes) {
        await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 150_000 });
        expect((await runs(page))[0]!.d).toMatchObject({ outcome: 'ok' });
      } else {
        await pastCopy(page);
        await expect(page.locator('#error')).not.toContainText('could not be read');
      }
      expect(await failed(page)).toBeGreaterThan(0);
    });
  });
}

// A file over the snapshot limit is copied to temporary disk space (the origin private file system) when there is room.
test.describe('a file over 50 MB', () => {
  test.setTimeout(240_000);
  const tool = TOOLS.find((t) => t.name === 'video-to-mp3')!;
  // A real clip with zeros after it, just over the snapshot limit (Playwright takes it as a path).
  const bigFile = (testInfo: { outputDir: string }) => {
    mkdirSync(testInfo.outputDir, { recursive: true });
    const path = join(testInfo.outputDir, 'VID_0001.webm');
    writeFileSync(path, Buffer.concat([readFileSync(fixture('static/talk.webm')), Buffer.alloc(SNAPSHOT_LIMIT + 1)]));
    return path;
  };
  const stored = (page: Page) =>
    page.evaluate(async () => {
      try {
        const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('stayput-outputs');
        let n = 0;
        for await (const _ of (dir as unknown as { keys(): AsyncIterable<string> }).keys()) n++;
        return n;
      } catch {
        return 0;
      }
    });

  test('a read that runs out of memory is OutOfMemoryError, not NotReadable', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the padded webm is a Chromium-side fixture');
    await open(page, tool);
    await page.locator('#file-input').setInputFiles(bigFile(test.info()));
    await expect(page.locator('#run')).toBeEnabled();
    await setMode(page, 'memory');
    await page.locator('#run').click();
    await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 120_000 });
    await expect.poll(async () => (await runs(page)).length).toBe(1);
    expect((await runs(page))[0]!.d).toMatchObject({ outcome: 'error', error_class: 'OutOfMemoryError' });
    expect(await stored(page)).toBe(0);
  });

  test('the disk copy is kept after the run, and deleted by a new run, Clear and leaving the page', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the padded webm is a Chromium-side fixture');
    await open(page, tool);
    await page.locator('#file-input').setInputFiles(bigFile(test.info()));
    await expect(page.locator('#run')).toBeEnabled();
    await page.locator('#run').click();
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
    // Not deleted right after the run: the download is still to come.
    expect(await stored(page)).toBe(1);
    await page.locator('#run').click();
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
    // A new run replaced the copy rather than adding a second.
    expect(await stored(page)).toBe(1);
    await page.locator('#clear').click();
    await expect.poll(() => stored(page)).toBe(0);
    await page.locator('#file-input').setInputFiles(bigFile(test.info()));
    await expect(page.locator('#run')).toBeEnabled();
    await page.locator('#run').click();
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
    expect(await stored(page)).toBe(1);
    await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })));
    await expect.poll(() => stored(page)).toBe(0);
  });
});

// The rules, without a page.
test.describe('shared rules', () => {
  const named = (name: string) => Object.assign(new Error(name), { name });
  const stub = (bytes: number, fail: (start: number, end: number) => boolean, name = 'a.mp4') => {
    const file = new File([new Uint8Array(bytes).fill(7)], name, { type: 'video/mp4' });
    const slice = file.slice.bind(file);
    file.slice = (start = 0, end = bytes) => {
      const out = slice(start, end);
      if (fail(start, end)) out.arrayBuffer = () => Promise.reject(named('NotReadableError'));
      return out;
    };
    return file;
  };

  test('a file whose first byte never reads is FileNotDownloaded when added, and UnreadableFileGone when the same File is added again', async () => {
    const file = stub(20_000, (s) => s === 0);
    expect(await inspectFile(file, 'compress-video', 'compress-video', 'video/*')).toMatchObject({ name: 'FileNotDownloaded' });
    expect(await inspectFile(file, 'compress-video', 'compress-video', 'video/*')).toMatchObject({ name: 'UnreadableFileGone', message: expect.stringContaining('Pick it again') });
  });

  test('a file whose middle fails after a good start is refused when added, with the words a failed run gives', async () => {
    const file = stub(20_000, (s, e) => s === 10_000 && e === 10_001);
    // First byte, then a last byte that also fails, then the middle byte: out of reach.
    const dead = stub(20_000, (s, e) => (s === 19_999 && e === 20_000) || (s === 10_000 && e === 10_001));
    expect(await inspectFile(file, 'compress-video', 'compress-video', 'video/*')).toBeNull();
    expect(await inspectFile(dead, 'compress-video', 'compress-video', 'video/*')).toMatchObject({ name: 'NotReadableProbe', message: expect.stringContaining('save it to the phone first') });
  });

  test('a tool that takes no audio or video is not probed end to end', async () => {
    const file = stub(20_000, (s, e) => (s === 19_999 && e === 20_000) || (s === 10_000 && e === 10_001), 'a.png');
    expect(await inspectFile(file, 'compress-image', 'compress-image', 'image/*')).toBeNull();
  });

  test('a last byte alone out of reach: the copy is skipped and the file goes on as it is', async () => {
    const file = stub(20_000, (s, e) => e === 20_000 && e - s > 1 || (s === 19_999 && e === 20_000));
    expect(await snapshotFile(file, undefined, [0, 0])).toBe(file);
  });

  test('a copy is taken once: a second snapshot of the copy returns it', async () => {
    const copy = await snapshotFile(new File(['abcdef'], 'a.mp4', { type: 'video/mp4' }));
    expect(await snapshotFile(copy)).toBe(copy);
  });

  test('a run is read again once, and a refusal that already checked the files is not tried a third time', async () => {
    const files = [new Blob(['abc'])];
    let calls = 0;
    const midRead = () => Object.assign(named('NotReadableError'), { stage: 'mid' });
    expect(await retryRun(files, async () => (++calls === 1 ? Promise.reject(midRead()) : 'done'), undefined, 0)).toBe('done');
    expect(calls).toBe(2);
    calls = 0;
    await expect(retryRun(files, async () => (++calls, Promise.reject(Object.assign(named('NotReadableError'), { stage: 'probe' }))), undefined, 0)).rejects.toMatchObject({ name: 'NotReadableError' });
    expect(calls).toBe(1);
  });
});
