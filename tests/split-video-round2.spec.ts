// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { explainNoContainer, videoSignature } from '../src/lib/container-sniff';
import { readDuration } from '../src/lib/video-split';
import { isNotReadable, notReadableClass } from '../src/lib/read-failure';

// Split video / Video splitter, round 2. The edge-case files are made here with ffmpeg (nothing large is committed).
// 1. When the reader finds no container, the first 64 KB are looked at and each cause has its own class.
// 2. A cut that fails with a plain error is tried once more, then copied from the key frame.
// 3. A run the browser closed makes the next split in the tab copy from key frames; parts already cut are not cut again.
const ffmpeg = (...args: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'pipe' });
const SRC = ['-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=15:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4'];
const H264 = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '15', '-c:a', 'aac'];
const fx = (n: string) => fileURLToPath(new URL(`./fixtures/static/${n}`, import.meta.url));

const dir = (t: { outputDir: string }) => {
  mkdirSync(t.outputDir, { recursive: true });
  return t.outputDir;
};
const make = (d: string, file: string, ...args: string[]): Buffer => {
  ffmpeg(...SRC, ...args, join(d, file));
  return readFileSync(join(d, file));
};
const asFile = (bytes: Uint8Array, name = 'clip.mp4', type = 'video/mp4') => new File([bytes as Uint8Array<ArrayBuffer>], name, { type });
const outcome = async (file: File) => {
  try {
    return { ok: await readDuration(file) } as const;
  } catch (e) {
    return { name: (e as Error).name, message: (e as Error).message } as const;
  }
};

/** A File whose first reads come back short (the way an Android content provider can hand over a first read). */
class ShortReads extends File {
  reads = 0;
  constructor(parts: BlobPart[], name: string, private shortFor: number, private keep = 10) {
    super(parts, name, { type: 'video/mp4' });
  }
  slice(start?: number, end?: number, type?: string): Blob {
    const real = super.slice(start, end, type);
    if (start !== 0 || this.reads >= this.shortFor) return real;
    this.reads++;
    return super.slice(0, this.keep, type);
  }
}

test.describe('the reader finds no container: each cause has a class', () => {
  test('signatures', async ({}, testInfo) => {
    const d = dir(testInfo);
    expect(videoSignature(make(d, 'a.mp4', ...H264).subarray(0, 65536))).toBe('mp4');
    expect(videoSignature(make(d, 'a.mkv', ...H264).subarray(0, 65536))).toBe('matroska');
    expect(videoSignature(make(d, 'a.ts', ...H264, '-f', 'mpegts').subarray(0, 65536))).toBe('ts');
    expect(videoSignature(make(d, 'a.avi', '-c:v', 'mjpeg', '-c:a', 'pcm_s16le').subarray(0, 65536))).toBe('other-video');
    expect(videoSignature(Buffer.from('plain text. '.repeat(100)))).toBeNull();
    expect(videoSignature(Buffer.alloc(5000))).toBeNull();
  });

  test('a non-video renamed .mp4 is NotAVideoContainer', async () => {
    expect(await outcome(asFile(Buffer.from('plain text, not a video. '.repeat(400))))).toMatchObject({ name: 'NotAVideoContainer', message: expect.stringContaining('not a video this page can read') });
  });

  test('a file of zeros (the header wiped) is NotAVideoContainer', async ({}, testInfo) => {
    const good = make(dir(testInfo), 'z.mp4', ...H264);
    const wiped = Buffer.from(good);
    wiped.fill(0, 0, Math.min(70_000, wiped.length));
    expect(await outcome(asFile(wiped))).toMatchObject({ name: 'NotAVideoContainer' });
  });

  test('an AVI is ContainerNotSupported, named early', async ({}, testInfo) => {
    const avi = make(dir(testInfo), 'a.avi', '-c:v', 'mjpeg', '-c:a', 'pcm_s16le');
    expect(await outcome(asFile(avi, 'clip.avi', 'video/x-msvideo'))).toMatchObject({ name: 'ContainerNotSupported' });
  });

  test('an MKV whose header is damaged after its signature is ContainerParseFailed', async ({}, testInfo) => {
    const mkv = Buffer.from(make(dir(testInfo), 'a.mkv', ...H264));
    // Keep 1A 45 DF A3, then scramble the rest of the EBML header and everything after it.
    for (let i = 4; i < 4096; i++) mkv[i] = (i * 37) & 0xff;
    expect(await outcome(asFile(mkv, 'clip.mkv', 'video/x-matroska'))).toMatchObject({ name: 'ContainerParseFailed' });
  });

  test('an MP4 with a signature whose body is wiped is a named class, not UnreadableContainer', async ({}, testInfo) => {
    const mp4 = Buffer.from(make(dir(testInfo), 'a.mp4', ...H264));
    // ftyp stays; the boxes after it are scrambled.
    for (let i = 32; i < 70_000 && i < mp4.length; i++) mp4[i] = (i * 31) & 0xff;
    const r = await outcome(asFile(mp4));
    expect(['ContainerParseFailed', 'UnknownDuration', 'VideoReadFailed', 'NoVideoTrack']).toContain((r as { name: string }).name);
  });

  test('a valid MP4 whose first read comes back short is read again and opens', async ({}, testInfo) => {
    const mp4 = make(dir(testInfo), 'a.mp4', ...H264);
    // The reader's first look is short (so it finds no container); our look is too, once; then the file reads normally.
    const flaky = new ShortReads([mp4 as unknown as BlobPart], 'clip.mp4', 2);
    const first = await outcome(flaky);
    // The reader was refused the first bytes: it is told apart from "not a video" and the job is asked to read the file again.
    expect(first).toHaveProperty('name');
    expect(['NotReadableError', 'UnreadableHeaderShort']).toContain((first as { name: string }).name);
    // Now the file reads: the same File opens.
    expect(await outcome(flaky)).toHaveProperty('ok');
  });

  test('a first read that is always short is UnreadableHeaderShort', async ({}, testInfo) => {
    const mp4 = make(dir(testInfo), 'a.mp4', ...H264);
    const err = await explainNoContainer(new ShortReads([mp4 as unknown as BlobPart], 'clip.mp4', 1000), 1);
    expect(err.name).toBe('UnreadableHeaderShort');
  });

  test('a first read that throws NotReadableError is UnreadableFileGone', async () => {
    const blob = new Blob(['x'.repeat(5000)]);
    Object.defineProperty(blob, 'slice', { value: () => ({ arrayBuffer: () => Promise.reject(new DOMException('gone', 'NotReadableError')) }) });
    const err = await explainNoContainer(blob, 1);
    expect(err.name).toBe('UnreadableFileGone');
  });

  test('a signature the reader refuses once but opens on the second look reads the file again (NotReadableError, probe)', async ({}, testInfo) => {
    const mp4 = make(dir(testInfo), 'a.mp4', ...H264);
    const err = await explainNoContainer(asFile(mp4), 1, async () => true);
    expect(isNotReadable(err)).toBe(true);
    expect(notReadableClass(err)).toBe('NotReadableProbe');
  });

  test('every new name is letters and digits only', () => {
    for (const n of ['NotAVideoContainer', 'ContainerParseFailed', 'UnreadableHeaderShort', 'ContainerNotSupported', 'ContainerReadRetry']) expect(n).toMatch(/^[A-Za-z][A-Za-z0-9]{0,39}$/);
  });
});

// In the browser, on both pages.
const KEYS = new Set(['tool', 'outcome', 'attempt', 'files', 'input', 'output', 'duration', 'format', 'error_class', 'landing', 'ref', 'from', 'visit', 'prev_tool', 'run_n', 'tools_used', 'run_gap', 'ns', 'via', 'variant']);
type Ev = { n: string; d: Record<string, string> };
const events = (page: Page): Promise<Ev[]> => page.evaluate(() => JSON.parse(sessionStorage.getItem('__ev') || '[]'));

async function open(page: Page, path: string) {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: `window.umami={track:(n,d)=>{const a=JSON.parse(sessionStorage.getItem('__ev')||'[]');a.push({n,d});sessionStorage.setItem('__ev',JSON.stringify(a));}};` }),
  );
  await page.goto(path);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
}
const runs = async (page: Page) => {
  const all = await events(page);
  for (const e of all) for (const k of Object.keys(e.d)) expect(KEYS.has(k), `${e.n} carries unexpected key ${k}`).toBe(true);
  return all.filter((e) => e.n === 'tool_run').map((e) => e.d);
};

test.describe('on both pages', () => {
  test.setTimeout(300_000);
  for (const path of ['/tools/video-splitter', '/split-video']) {
    test(`${path}: a text file renamed .mp4 is refused early as NotAVideoContainer`, async ({ page }) => {
      await open(page, path);
      await page.locator('#file-input').setInputFiles({ name: 'VID_0.mp4', mimeType: 'video/mp4', buffer: Buffer.from('not a video. '.repeat(300)) });
      await expect(page.locator('#error')).toContainText('not a video this page can read');
      await page.locator('#run').click();
      await expect.poll(async () => (await runs(page)).length, { timeout: 60_000 }).toBe(1);
      expect((await runs(page))[0]).toMatchObject({ outcome: 'error', error_class: 'NotAVideoContainer' });
    });

    test(`${path}: a wiped MKV header is refused as ContainerParseFailed`, async ({ page }, testInfo) => {
      const mkv = Buffer.from(make(dir(testInfo), 'a.mkv', ...H264));
      for (let i = 4; i < 4096; i++) mkv[i] = (i * 37) & 0xff;
      await open(page, path);
      await page.locator('#file-input').setInputFiles({ name: 'VID_1.mkv', mimeType: 'video/x-matroska', buffer: mkv });
      await expect(page.locator('#error')).toContainText('could not read how it is laid out');
      await page.locator('#run').click();
      await expect.poll(async () => (await runs(page)).length, { timeout: 60_000 }).toBe(1);
      expect((await runs(page))[0]).toMatchObject({ outcome: 'error', error_class: 'ContainerParseFailed' });
    });
  }
});

async function loadEqual(page: Page, file: string, parts: number) {
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(file);
  await expect(page.locator('#tool')).toHaveAttribute('data-duration', /\d/, { timeout: 60_000 });
  await page.locator('input[name="vs-mode"][value="equal"]').check();
  await page.locator('#vs-equal').fill(String(parts));
}

test.describe('a cut that fails with a plain error', () => {
  test.setTimeout(300_000);
  test.skip(({ browserName }) => browserName === 'webkit' && !!process.env.CI, 'Linux WebKit in CI stalls decoding and encoding video; macOS WebKit runs it locally with PW_WEBKIT=1');

  test('is tried again, then copied from the key frame, and the split finishes (CutFailedExecute no longer ends it)', async ({ page }) => {
    await open(page, '/tools/video-splitter');
    // Part 1 fails twice at the run step (the first try and the fresh try); the key frame copy then gets through.
    await page.addInitScript(() => Object.assign(globalThis, { __stayputCutFault: 'Execute', __stayputCutFaultTimes: 2 }));
    await page.goto('/tools/video-splitter');
    await loadEqual(page, fx('split-gop2s.mp4'), 2);
    await page.locator('#run').click();
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 120_000 });
    await expect(page.locator('#results-list')).toContainText('key frame');
    expect((await runs(page))[0]).toMatchObject({ outcome: 'ok' });
  });

  test('a fault at the run step that never clears still records CutFailedExecute', async ({ page }) => {
    await open(page, '/tools/video-splitter');
    await page.addInitScript(() => Object.assign(globalThis, { __stayputCutFault: 'Execute' }));
    await page.goto('/tools/video-splitter');
    await loadEqual(page, fx('split-gop2s.mp4'), 2);
    await page.locator('#run').click();
    await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 120_000 });
    expect((await runs(page))[0]).toMatchObject({ outcome: 'error', error_class: 'CutFailedExecute' });
  });
});

test.describe('a split the browser closed (a lost tab, as on an iPhone)', () => {
  test.setTimeout(300_000);

  test('the next split in the tab copies from key frames and says so', async ({ page }) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('__planted')) {
        sessionStorage.setItem('__planted', '1');
        sessionStorage.setItem('stayput:inflight', JSON.stringify({ tool: 'video-splitter', phase: 'run', t: Date.now(), hidden: false, bytes: 300_000_000 }));
      }
    });
    await open(page, '/tools/video-splitter');
    await expect.poll(async () => (await runs(page)).length).toBe(1);
    expect((await runs(page))[0]).toMatchObject({ error_class: 'TabLostDuringRun', input: '200MB+' });
    expect(await page.evaluate(() => sessionStorage.getItem('stayput:lost-cut'))).toBe('1');
    // Exact cutting is asked for; with the flag it is not used: every part is copied from its key frame.
    await loadEqual(page, fx('split-gop2s.mp4'), 2);
    await page.locator('#exact').check({ force: true }).catch(() => {});
    await page.locator('#run').click();
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 120_000 });
    await expect(page.locator('#results-list')).toContainText('key frame');
    await expect(page.locator('#results-list')).not.toContainText('cut exactly');
    expect((await runs(page)).at(-1)).toMatchObject({ outcome: 'ok' });
  });

  test('a run that failed after part 1 is run again: part 1 is kept and only the rest is cut again', async ({ page }) => {
    await open(page, '/tools/video-splitter');
    // Part 1 passes; part 2 fails at its set-up three times (the first try, the fresh try and the key frame copy); then the fault is spent.
    await page.addInitScript(() => Object.assign(globalThis, { __stayputCutFault: 'Init', __stayputCutFaultSkip: 1, __stayputCutFaultTimes: 3, __stayputCutLog: [] as string[] }));
    await page.goto('/tools/video-splitter');
    await loadEqual(page, fx('split-gop2s.mp4'), 2);
    await page.locator('#run').click();
    await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 120_000 });
    expect((await runs(page))[0]).toMatchObject({ outcome: 'error', error_class: 'CutFailedInit' });
    const before = await page.evaluate(() => (globalThis as unknown as { __stayputCutLog: string[] }).__stayputCutLog.filter((s) => s === 'OpenInput').length);
    // Run again: part 1 is not cut a second time.
    await page.locator('#run').click();
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 120_000 });
    const after = await page.evaluate(() => (globalThis as unknown as { __stayputCutLog: string[] }).__stayputCutLog.filter((s) => s === 'OpenInput').length);
    expect(after - before).toBeLessThanOrEqual(2);
    expect((await runs(page)).at(-1)).toMatchObject({ outcome: 'ok' });
  });

  test('the page hidden mid-run and shown again: the split finishes (parts start at key frames, so no encoder is needed)', async ({ page }) => {
    await open(page, '/tools/video-splitter');
    await loadEqual(page, fx('split-gop2s.mp4'), 2);
    await page.locator('#run').click();
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      setTimeout(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
        document.dispatchEvent(new Event('visibilitychange'));
      }, 800);
    });
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 120_000 });
    expect((await runs(page))[0]).toMatchObject({ outcome: 'ok' });
  });

});

// A big input on the cut path. STAYPUT_BIG_SECONDS=220 makes the file about 1.1 GB (generated here, never committed); the default is about 225 MB.
test.describe('a big video', () => {
  test.setTimeout(600_000);
  test.skip(({ browserName }) => browserName !== 'chromium', 'the large-file run is Chromium only');

  test('whose cut fails twice at the run step still splits, each part a file on the device', async ({ page }, info) => {
    const big = info.outputPath('big.mp4');
    const seconds = Number(process.env.STAYPUT_BIG_SECONDS ?? 45);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=30', '-vf', 'noise=alls=80:allf=t', '-c:v', 'libx264', '-preset', 'ultrafast', '-b:v', '40M', '-t', String(seconds), '-g', '60', '-pix_fmt', 'yuv420p', '-an', big]);
    expect(statSync(big).size).toBeGreaterThan(200_000_000);
    await open(page, '/tools/video-splitter');
    await page.addInitScript(() => Object.assign(globalThis, { __stayputCutFault: 'Execute', __stayputCutFaultTimes: 2 }));
    await page.goto('/tools/video-splitter');
    await loadEqual(page, big, 2);
    await page.locator('#run').click();
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 480_000 });
    await expect(page.locator('#results-list')).toContainText('key frame');
    expect((await runs(page))[0]).toMatchObject({ outcome: 'ok', input: '200MB+' });
  });
});
