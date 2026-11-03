import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { unzipSync } from 'fflate';
import { ALL_FORMATS, BufferSource, Input } from 'mediabunny';

// Video splitter on a large input (STAA-595): parts are written to a file on the device, not held in memory; a failed
// converter set-up or cutting-code load is tried again; a run hidden mid-way resumes; a lost tab keeps its size bucket.
test.skip(({ browserName }) => browserName !== 'chromium', 'the large-file run is Chromium only');
test.setTimeout(420_000);

const fx = (n: string) => fileURLToPath(new URL(`./fixtures/static/${n}`, import.meta.url));
type Ev = { n: string; d: Record<string, string> };
const events = (page: Page): Promise<Ev[]> => page.evaluate(() => JSON.parse(sessionStorage.getItem('__ev') || '[]'));

async function open(page: Page) {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const k='__ev';const a=JSON.parse(sessionStorage.getItem(k)||'[]');a.push({n,d});sessionStorage.setItem(k,JSON.stringify(a));}};`,
    }),
  );
}

async function load(page: Page, file: string, parts: number) {
  await page.goto('/tools/video-splitter');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(file);
  await expect(page.locator('#tool')).toHaveAttribute('data-duration', /\d/, { timeout: 60_000 });
  await page.locator('input[name="vs-mode"][value="equal"]').check();
  await page.locator('#vs-equal').fill(String(parts));
}

async function download(page: Page) {
  const [zip] = await Promise.all([page.waitForEvent('download'), page.locator('#download-all').click()]);
  return unzipSync(new Uint8Array(readFileSync((await zip.path())!)));
}

async function lengthOf(bytes: Uint8Array) {
  const input = new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS });
  return (await input.getPrimaryVideoTrack())!.computeDuration();
}

/** Bytes in the temporary output files this tab holds on disk (the origin private file system). */
const onDisk = (page: Page) =>
  page.evaluate(async () => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('stayput-outputs').catch(() => undefined);
    if (!dir) return { files: 0, bytes: 0 };
    let files = 0;
    let bytes = 0;
    for await (const [, h] of (dir as unknown as { entries(): AsyncIterable<[string, FileSystemFileHandle]> }).entries()) {
      files++;
      bytes += (await h.getFile()).size;
    }
    return { files, bytes };
  });

const SECONDS = Number(process.env.STAYPUT_BIG_SECONDS ?? 45);

test('a 226 MB video splits into 2 and 4 parts of the right length, each kept in a file on the device', async ({ page }, info) => {
  const big = info.outputPath('big.mp4');
  // 45 s (STAYPUT_BIG_SECONDS) of noisy 720p at 40 Mbit/s: generated here, never committed.
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=30', '-vf', 'noise=alls=80:allf=t', '-c:v', 'libx264', '-preset', 'ultrafast', '-b:v', '40M', '-t', String(SECONDS), '-g', '60', '-pix_fmt', 'yuv420p', '-an', big]);
  expect(statSync(big).size).toBeGreaterThan(200_000_000);
  await open(page);
  for (const parts of [2, 4]) {
    await load(page, big, parts);
    await page.locator('#run').click();
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 240_000 });
    // The parts are files on disk, not buffers in this tab (on main this is 0 files).
    // (A browser that has no room for a 1 GB set of files falls back to memory, so this holds for the default size only.)
    const disk = await onDisk(page);
    console.log(`parts=${parts} on-disk files=${disk.files} bytes=${disk.bytes}`);
    if (SECONDS <= 60) {
      expect(disk.files).toBe(parts);
      expect(disk.bytes).toBeGreaterThan(statSync(big).size * 0.8);
    }
    const files = await download(page);
    const names = Object.keys(files);
    expect(names).toHaveLength(parts);
    for (const n of names) expect(Math.abs((await lengthOf(files[n]!)) - SECONDS / parts)).toBeLessThan(0.5);
    await page.locator('#clear').click();
  }
});

test('a 200 MB phone-style MOV (H.264, AAC, rotated 90 degrees) splits in two', async ({ page }, info) => {
  const mov = info.outputPath('phone.mov');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=1920x1080:r=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-vf', 'noise=alls=60:allf=t', '-c:v', 'libx264', '-preset', 'ultrafast', '-b:v', '40M', '-c:a', 'aac', '-t', '40', '-g', '30', '-pix_fmt', 'yuv420p', '-metadata:s:v', 'rotate=90', '-f', 'mov', mov]);
  expect(statSync(mov).size).toBeGreaterThan(200_000_000);
  await open(page);
  await load(page, mov, 2);
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 300_000 });
  const files = await download(page);
  const names = Object.keys(files);
  expect(names).toHaveLength(2);
  for (const n of names) expect(Math.abs((await lengthOf(files[n]!)) - 20)).toBeLessThan(0.5);
});

test('a converter set-up that fails once is tried again and the split finishes', async ({ page }) => {
  await open(page);
  await page.addInitScript(() => Object.assign(globalThis, { __stayputCutFault: 'Init', __stayputCutFaultOnce: true }));
  await load(page, fx('split-60s.mp4'), 2);
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 120_000 });
  expect((await events(page)).find((e) => e.n === 'tool_run')!.d).toMatchObject({ outcome: 'ok' });
});

test('a converter set-up that keeps failing still records CutFailedInit', async ({ page }) => {
  await open(page);
  await page.addInitScript(() => Object.assign(globalThis, { __stayputCutFault: 'Init' }));
  await load(page, fx('split-60s.mp4'), 2);
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 120_000 });
  expect((await events(page)).find((e) => e.n === 'tool_run')!.d).toMatchObject({ outcome: 'error', error_class: 'CutFailedInit' });
});

test('the cutting code failing to load once is asked for again and the split finishes', async ({ page }) => {
  await open(page);
  let failed = 0;
  await page.route(/\/_astro\/video-trim[^/]*\.js/, (route) => (failed++ < 1 ? route.abort() : route.continue()));
  await load(page, fx('split-60s.mp4'), 2);
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 120_000 });
  expect(failed).toBeGreaterThanOrEqual(1);
});

test('a page hidden while a split runs starts the part again and finishes', async ({ page }) => {
  await open(page);
  await load(page, fx('split-60s.mp4'), 2);
  await page.locator('input[name="exact"], #exact').first().check().catch(() => {});
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
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 240_000 });
  expect((await events(page)).find((e) => e.n === 'tool_run')!.d).toMatchObject({ outcome: 'ok' });
});

test('a run in flight keeps its size, so a lost tab records the real input bucket and no new fields', async ({ page }) => {
  await open(page);
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('__planted')) {
      sessionStorage.setItem('__planted', '1');
      sessionStorage.setItem('stayput:inflight', JSON.stringify({ tool: 'video-splitter', phase: 'run', t: Date.now(), hidden: false, bytes: 300_000_000 }));
    }
  });
  await page.goto('/tools/video-splitter');
  await expect.poll(async () => (await events(page)).filter((e) => e.n === 'tool_run').length).toBe(1);
  const d = (await events(page)).find((e) => e.n === 'tool_run')!.d;
  expect(d).toMatchObject({ error_class: 'TabLostDuringRun', input: '200MB+' });
  expect(Object.keys(d)).not.toContain('bytes');
});
