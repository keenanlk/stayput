// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { isNotReadable, notReadable, probeReadable, retryUnreadable } from '../src/lib/read-failure';

// Remove background noise from a video on a phone whose browser fails to read the file part way through (Android
// Chrome says NotReadableError). The read is forced to fail in the page once the noise removal has started: once,
// which must be recovered by reading again, and for good, which must say so with the error's own name.
const clip = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));
const KEYS = new Set(['tool', 'outcome', 'attempt', 'files', 'input', 'output', 'duration', 'format', 'error_class', 'landing', 'ref', 'from', 'visit', 'prev_tool', 'run_n', 'tools_used', 'run_gap', 'ns', 'via']);
type Ev = { n: string; d: Record<string, string> };
const events = (page: Page): Promise<Ev[]> => page.evaluate(() => JSON.parse(sessionStorage.getItem('__ev') || '[]'));

test.describe('read-failure rules', () => {
  const named = (name: string, cause?: unknown) => Object.assign(new Error(name), { name, cause });

  test('a NotReadableError is recognised, wrapped or not', () => {
    expect(isNotReadable(named('NotReadableError'))).toBe(true);
    expect(isNotReadable(named('NoiseDecodeError', named('NotReadableError')))).toBe(true);
    expect(isNotReadable(named('RangeError'))).toBe(false);
    expect(isNotReadable('NotReadableError')).toBe(false);
  });

  test('a read failure runs the job once more; a second one is thrown with its name', async () => {
    const notes: string[] = [];
    let calls = 0;
    const blob = new Blob(['abc']);
    expect(await retryUnreadable(blob, async () => (++calls === 1 ? Promise.reject(notReadable()) : 'done'), (m) => notes.push(m), 0)).toBe('done');
    expect(calls).toBe(2);
    expect(notes).toHaveLength(1);
    calls = 0;
    await expect(retryUnreadable(blob, async () => (++calls, Promise.reject(notReadable())), undefined, 0)).rejects.toMatchObject({ name: 'NotReadableError' });
    expect(calls).toBe(2);
  });

  test('other failures are not read again', async () => {
    let calls = 0;
    await expect(retryUnreadable(new Blob(['abc']), async () => (++calls, Promise.reject(named('EncodingError'))), undefined, 0)).rejects.toMatchObject({ name: 'EncodingError' });
    expect(calls).toBe(1);
  });

  test('a file that cannot be reached is named before any work', async () => {
    const gone = new Blob(['abc']);
    gone.slice = () => ({ arrayBuffer: () => Promise.reject(named('NotReadableError')) }) as unknown as Blob;
    await expect(probeReadable(gone)).rejects.toMatchObject({ name: 'NotReadableError' });
  });
});

async function unreadablePage(page: Page, reads: number) {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const k='__ev';const a=JSON.parse(sessionStorage.getItem(k)||'[]');a.push({n,d});sessionStorage.setItem(k,JSON.stringify(a));}};`,
    }),
  );
  await page.addInitScript(() => {
    const w = window as unknown as { __fail: number; __failed: number };
    w.__fail = 0;
    w.__failed = 0;
    const fail = () => {
      if (w.__fail <= 0) return false;
      w.__fail--;
      w.__failed++;
      return true;
    };
    const arrayBuffer = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = function () {
      return fail() ? Promise.reject(new DOMException('The requested file could not be read.', 'NotReadableError')) : arrayBuffer.call(this);
    };
    const stream = Blob.prototype.stream;
    Blob.prototype.stream = function () {
      if (!fail()) return stream.call(this);
      return new ReadableStream({ pull: (c) => c.error(new DOMException('The requested file could not be read.', 'NotReadableError')) });
    };
  });
  await page.goto('/remove-background-noise-from-video');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  // Arm the failure once the sound is being cleaned, so the first reads (and the check before the model loads) pass.
  await page.waitForFunction(() => 'document' in window);
  void page.evaluate((n) => {
    const text = document.querySelector('#progress-text')!;
    const watch = new MutationObserver(() => {
      if (/Removing noise/.test(text.textContent ?? '')) {
        (window as unknown as { __fail: number }).__fail = n;
        watch.disconnect();
      }
    });
    watch.observe(text, { childList: true, characterData: true, subtree: true });
  }, reads);
}

for (const [label, reads, ok] of [
  ['one failed read is read again and the run finishes', 1, true],
  ['a file that stays unreadable says so, with the error name', 1000, false],
] as const) {
  test(`${label}`, async ({ page }, info) => {
    test.setTimeout(150_000);
    await unreadablePage(page, reads);
    await page.locator('#file-input').setInputFiles(clip(info.project.name === 'webkit' ? 'speech.mov' : 'talk.webm'));
    await page.locator('#run').click();
    if (ok) {
      await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 120_000 });
      await expect(page.locator('#error')).not.toHaveClass(/is-active/);
      expect(await page.evaluate(() => (window as unknown as { __failed: number }).__failed)).toBeGreaterThan(0);
    } else {
      await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 120_000 });
      await expect(page.locator('#error')).toContainText('This file could not be read');
    }
    await expect.poll(async () => (await events(page)).filter((e) => e.n === 'tool_run').length).toBe(1);
    const all = await events(page);
    const run = all.find((e) => e.n === 'tool_run')!;
    if (ok) expect(run.d).toMatchObject({ outcome: 'ok' });
    else expect(run.d).toMatchObject({ outcome: 'error', error_class: 'NotReadableError' });
    for (const e of all) for (const k of Object.keys(e.d)) expect(KEYS.has(k), `${e.n} carries unexpected key ${k}`).toBe(true);
  });
}

// The noise remover is a WebAssembly module fetched on the first run. A failed fetch is tried once more; two in a row say so.
for (const [label, blocked, ok] of [
  ['a noise remover that fails to load once is loaded again', 1, true],
  ['a noise remover that never loads says so, under its own name', 1000, false],
] as const) {
  test(label, async ({ page }, info) => {
    test.setTimeout(150_000);
    let left = blocked;
    await page.route('**/vendor/shiguredo-rnnoise-wasm@*/**', (r) => (left-- > 0 ? r.abort() : r.continue()));
    await page.route('https://stats.keenankaufman.com/**', (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: `window.umami={track:(n,d)=>{const k='__ev';const a=JSON.parse(sessionStorage.getItem(k)||'[]');a.push({n,d});sessionStorage.setItem(k,JSON.stringify(a));}};`,
      }),
    );
    await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
    await page.goto('/remove-background-noise-from-video');
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    await page.locator('#file-input').setInputFiles(clip(info.project.name === 'webkit' ? 'speech.mov' : 'talk.webm'));
    await page.locator('#run').click();
    if (ok) await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 120_000 });
    else {
      await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 60_000 });
      await expect.poll(async () => (await events(page)).filter((e) => e.n === 'tool_run').length).toBe(1);
      expect((await events(page)).find((e) => e.n === 'tool_run')!.d).toMatchObject({ outcome: 'error', error_class: 'NoiseModelLoadError' });
    }
  });
}
