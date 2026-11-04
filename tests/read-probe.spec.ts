// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SNAPSHOT_LIMIT, probeReadable, snapshotFile } from '../src/lib/read-failure';
import { inspectFile } from '../src/lib/intake';

// Big files (over the snapshot limit) are not copied; the probe is the only check before a tool starts. These specs drive that check
// with files whose reads are forced to fail: a first byte that never reads, one that reads on the second try, a last byte that
// fails while the rest reads, and a second pick of a file that already failed.
const notReadable = () => Promise.reject(Object.assign(new Error('The requested file could not be read.'), { name: 'NotReadableError' }));
const bytes = () => Promise.resolve(new ArrayBuffer(1));

/** A File of `size` bytes whose one-byte reads at each offset are decided by `readAt(offset)`: true reads, false fails. */
function fake(size: number, readAt: (at: number) => boolean) {
  const f = new File(['x'], 'VID_0001.mp4', { type: 'video/mp4' });
  Object.defineProperty(f, 'size', { value: size });
  const calls: number[] = [];
  f.slice = (start = 0) => (calls.push(start), { arrayBuffer: () => (readAt(start) ? bytes() : notReadable()) }) as unknown as Blob;
  return { f, calls };
}
const BIG = SNAPSHOT_LIMIT + 1024;

test.describe('probeReadable', () => {
  test('a first byte that fails once and reads on the second try passes', async () => {
    let first = true;
    const { f } = fake(BIG, (at) => !(at === 0 && first && !(first = false)));
    await probeReadable(f, 0);
  });

  test('a first byte that never reads is NotReadableError, stage probe, with the save-it-first steps', async () => {
    const { f } = fake(BIG, () => false);
    const err = await probeReadable(f, 0).catch((e) => e as Error & { stage?: string });
    expect(err).toMatchObject({ name: 'NotReadableError', stage: 'probe', message: expect.stringContaining('save it to the phone first') });
  });

  test('the same file failing again is UnreadableFileGone, which says to pick it again', async () => {
    const { f } = fake(BIG, () => false);
    await expect(probeReadable(f, 0)).rejects.toMatchObject({ name: 'NotReadableError' });
    const second = await probeReadable(f, 0).catch((e) => e as Error);
    expect(second).toMatchObject({ name: 'UnreadableFileGone', message: expect.stringContaining('Pick it again') });
    expect((second as Error).cause).toBeTruthy();
  });

  test('a file that failed once and reads the next time is let through', async () => {
    let ok = false;
    const { f } = fake(BIG, () => ok);
    await expect(probeReadable(f, 0)).rejects.toMatchObject({ name: 'NotReadableError' });
    ok = true;
    await probeReadable(f, 0);
  });

  test('a last byte that fails while the start and middle read does not stop the run', async () => {
    const { f, calls } = fake(BIG, (at) => at !== BIG - 1);
    await probeReadable(f, 0);
    expect(calls).toContain(Math.floor(BIG / 2));
  });

  test('a last byte and a middle that both fail is NotReadableError at the probe', async () => {
    const { f } = fake(BIG, (at) => at === 0);
    await expect(probeReadable(f, 0)).rejects.toMatchObject({ name: 'NotReadableError', stage: 'probe' });
  });

  test('snapshotFile on a big file passes the probe result on, and a second failure names UnreadableFileGone', async () => {
    const { f } = fake(BIG, () => false);
    await expect(snapshotFile(f)).rejects.toMatchObject({ name: 'NotReadableError', stage: 'probe' });
    await expect(snapshotFile(f)).rejects.toMatchObject({ name: 'UnreadableFileGone' });
  });

  test('a read that fails for another reason is not turned into a pick-again', async () => {
    const f = new File(['abc'], 'a.mp4');
    Object.defineProperty(f, 'size', { value: BIG });
    f.slice = () => ({ arrayBuffer: () => Promise.reject(new RangeError('Array buffer allocation failed')) }) as unknown as Blob;
    await expect(probeReadable(f, 0)).rejects.toMatchObject({ name: 'NotReadableError', stage: 'probe' });
    await expect(probeReadable(f, 0)).rejects.toMatchObject({ name: 'NotReadableError' });
  });
});

test.describe('file intake', () => {
  test('a big file whose first byte never reads is FileNotDownloaded at pick time', async () => {
    const f = new File(['x'], 'VID_0002.mp4', { type: 'video/mp4' });
    Object.defineProperty(f, 'size', { value: BIG });
    f.slice = () => ({ arrayBuffer: notReadable }) as unknown as Blob;
    const problem = await inspectFile(f, 'trim-video', 'trim-video', 'video/*');
    expect(problem).toMatchObject({ name: 'FileNotDownloaded', message: expect.stringContaining('Save it to this device first') });
  });
});

// In the page: a real file just over the limit, read through increase-video-volume.
const talk = fileURLToPath(new URL('./fixtures/static/talk.webm', import.meta.url));
type Ev = { n: string; d: Record<string, string> };
const events = (page: Page): Promise<Ev[]> => page.evaluate(() => JSON.parse(sessionStorage.getItem('__ev') || '[]'));

async function open(page: Page) {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: `window.umami={track:(n,d)=>{const a=JSON.parse(sessionStorage.getItem('__ev')||'[]');a.push({n,d});sessionStorage.setItem('__ev',JSON.stringify(a));}};` }),
  );
  // Pretend the picked file is over the limit and make slice() of it fail once __mode says so. Reads of the file as a whole (the Blob.stream
  // Mediabunny uses) stay readable, as they are when only the probe's own reads are out of reach.
  await page.addInitScript(() => {
    const w = window as unknown as { __mode: 'ok' | 'all' | 'tail' };
    w.__mode = 'ok';
    const { slice } = Blob.prototype;
    const realSize = Object.getOwnPropertyDescriptor(Blob.prototype, 'size')!.get!;
    Blob.prototype.slice = function (this: Blob, ...a: [number?, number?, string?]) {
      const out = slice.apply(this, a);
      const len = a[1] !== undefined && a[0] !== undefined ? a[1] - a[0] : 0;
      const probe = len === 1 && this instanceof File && realSize.call(this) > 0;
      const isLast = probe && a[0] === realSize.call(this) - 1;
      if (probe && (w.__mode === 'all' || (w.__mode === 'tail' && isLast))) out.arrayBuffer = () => Promise.reject(new DOMException('The requested file could not be read.', 'NotReadableError'));
      return out;
    };
  });
  await page.goto('/increase-video-volume');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
}

test.describe('increase-video-volume on a file the probe cannot read', () => {
  test.setTimeout(150_000);
  // Over the Playwright buffer limit, so it goes in as a path: a real clip with zeros after it, just over the snapshot limit.
  const bigFile = (testInfo: { outputDir: string }) => {
    mkdirSync(testInfo.outputDir, { recursive: true });
    const path = join(testInfo.outputDir, 'VID_0003.webm');
    writeFileSync(path, Buffer.concat([readFileSync(talk), Buffer.alloc(SNAPSHOT_LIMIT + 1)]));
    return path;
  };

  test.skip(({ browserName }) => browserName !== 'chromium', 'the padded webm is a Chromium-side fixture');

  test('only the last byte fails: the run goes on and finishes', async ({ page }, testInfo) => {
    await open(page);
    await page.locator('#file-input').setInputFiles(bigFile(testInfo));
    await expect(page.locator('#run')).toBeEnabled();
    await page.evaluate(() => ((window as unknown as { __mode: string }).__mode = 'tail'));
    await page.locator('#run').click();
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 120_000 });
    await expect.poll(async () => (await events(page)).filter((e) => e.n === 'tool_run').length).toBe(1);
    expect((await events(page)).find((e) => e.n === 'tool_run')!.d).toMatchObject({ outcome: 'ok' });
  });

  test('nothing reads: one clear refusal before any decode, and the next Run says to pick the file again', async ({ page }, testInfo) => {
    await open(page);
    await page.locator('#file-input').setInputFiles(bigFile(testInfo));
    await expect(page.locator('#run')).toBeEnabled();
    await page.evaluate(() => ((window as unknown as { __mode: string }).__mode = 'all'));
    await page.locator('#run').click();
    await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 60_000 });
    await expect(page.locator('#error')).toContainText('save it to the phone first');
    await expect.poll(async () => (await events(page)).filter((e) => e.n === 'tool_run').length).toBe(1);
    expect((await events(page)).find((e) => e.n === 'tool_run')!.d).toMatchObject({ outcome: 'error', error_class: 'NotReadableProbe' });
    // Run is off for the same file and options.
    await expect(page.locator('#run')).toBeDisabled();
    // An option change turns it back on; the same dead File then ends as UnreadableFileGone, not the same message again.
    await page.locator('#db').selectOption({ index: 2 });
    await expect(page.locator('#run')).toBeEnabled();
    await page.locator('#run').click();
    await expect(page.locator('#error')).toContainText('Pick it again', { timeout: 60_000 });
    await expect.poll(async () => (await events(page)).filter((e) => e.n === 'tool_run').length).toBe(2);
    expect((await events(page)).filter((e) => e.n === 'tool_run')[1]!.d).toMatchObject({ outcome: 'error', error_class: 'UnreadableFileGone' });
  });
});
