import { test, expect, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Video tools write their output to a temporary file on the device (src/lib/opfs-output.ts) instead of
// growing a buffer in memory, and delete it on Clear, when the page is left and on the next visit.
// Where the browser cannot write such a file, the output is kept in memory as before.
// (Playwright's WebKit cannot write OPFS files, so this runs in Chromium; Safari is checked in the iOS Simulator.)
const clip = fileURLToPath(new URL('./fixtures/static/clip.webm', import.meta.url));
const DIR = 'stayput-outputs';

function srtFile(): string {
  const file = join(mkdtempSync(join(tmpdir(), 'stayput-')), 'clip.srt');
  writeFileSync(file, '1\n00:00:00,000 --> 00:00:01,500\nHello from the park\n');
  return file;
}

/** Names of the files in the output directory (empty when there is none). */
async function outputFiles(page: Page): Promise<string[]> {
  return page.evaluate(async (dir) => {
    const root = await navigator.storage.getDirectory();
    const d = await root.getDirectoryHandle(dir).catch(() => undefined);
    if (!d) return [];
    const names: string[] = [];
    for await (const [name] of (d as unknown as { entries(): AsyncIterable<[string, unknown]> }).entries()) names.push(name);
    return names;
  }, DIR);
}

async function caption(page: Page, path = '/auto-caption-video') {
  await page.goto(path);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles([clip, srtFile()]);
  const download = page.waitForEvent('download');
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 90_000 });
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  return readFileSync((await (await download).path())!);
}

const isMp4 = (b: Buffer) => b.subarray(4, 8).toString('latin1') === 'ftyp' && b.includes(Buffer.from('moov')) && b.includes(Buffer.from('mdat'));

test('the output is written to a temporary file on the device, a playable mp4, and Clear deletes the file', async ({ page }) => {
  test.setTimeout(150_000);
  const bytes = await caption(page);
  expect(isMp4(bytes)).toBe(true);
  expect(await outputFiles(page)).toHaveLength(1);
  await page.locator('#clear').click();
  await expect.poll(() => outputFiles(page)).toEqual([]);
});

test('the next visit deletes a file a closed tab left, and keeps one a live tab still owns', async ({ page, context }) => {
  test.setTimeout(150_000);
  await caption(page);
  const [live] = await outputFiles(page);
  expect(live).toBeTruthy();
  // A file with no owner, as a closed tab leaves behind.
  await page.evaluate(async (dir) => {
    const root = await navigator.storage.getDirectory();
    const d = await root.getDirectoryHandle(dir, { create: true });
    const h = await d.getFileHandle('stayput-orphan-abc', { create: true });
    const w = await h.createWritable();
    await w.write(new Uint8Array([1, 2, 3]));
    await w.close();
  }, DIR);
  // Another tab opens a page: the orphan goes, the first tab's file stays.
  const other = await context.newPage();
  await other.goto('/privacy');
  await expect.poll(() => outputFiles(other)).toEqual([live!]);
  await other.close();
  // Reloading the first tab frees its lock; the next visit deletes the file it had.
  await page.goto('/privacy');
  await expect.poll(() => outputFiles(page)).toEqual([]);
});

test('where the browser cannot write an OPFS file, the output is kept in memory and still plays', async ({ page }) => {
  test.setTimeout(150_000);
  await page.addInitScript(() => {
    Object.defineProperty(StorageManager.prototype, 'getDirectory', { value: undefined, configurable: true });
  });
  const bytes = await caption(page);
  expect(isMp4(bytes)).toBe(true);
  // moov in front (fast start) in the memory path.
  expect(bytes.indexOf('moov')).toBeLessThan(bytes.indexOf('mdat'));
});

test('a worker that cannot start falls back to memory too', async ({ page }) => {
  test.setTimeout(150_000);
  await page.addInitScript(() => {
    const Real = window.Worker;
    (window as unknown as { Worker: unknown }).Worker = class extends Real {
      constructor(url: string | URL, options?: WorkerOptions) {
        if (String(url).includes('opfs-output')) throw new DOMException('blocked', 'SecurityError');
        super(url, options);
      }
    };
  });
  const bytes = await caption(page);
  expect(isMp4(bytes)).toBe(true);
});

test('with too little storage room for the output, the output is kept in memory', async ({ page }) => {
  test.setTimeout(150_000);
  await page.addInitScript(() => {
    StorageManager.prototype.estimate = () => Promise.resolve({ quota: 1_000_000, usage: 0 });
  });
  const bytes = await caption(page);
  expect(isMp4(bytes)).toBe(true);
  expect(await outputFiles(page)).toEqual([]);
});

test('the subtitle-adding tool page leaves a temporary file too, and Clear deletes it', async ({ page }) => {
  test.setTimeout(150_000);
  const bytes = await caption(page, '/tools/add-subtitles-to-video');
  expect(isMp4(bytes)).toBe(true);
  expect(await outputFiles(page)).toHaveLength(1);
  await page.locator('#clear').click();
  await expect.poll(() => outputFiles(page)).toEqual([]);
});
