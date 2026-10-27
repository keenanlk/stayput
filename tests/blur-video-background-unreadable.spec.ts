// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

// Blur video background (/blur-video-background): the failures seen on Chrome Android (a picked file that stops reading) and on
// Edge for Windows 10 (AVI, WMV, FLV and 3GP clips, a renamed non-video) end quickly with a named error and a way on, before the
// person finder downloads. The clips were made with ffmpeg: AVI mpeg4+mp3, WMV wmv2+wmav2, FLV flv1+mp3, 3GP h263+aac.
const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));
const clip = fixture('iphone-portrait-person-3s.mov');
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const EDGE_WIN10 = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0';
type Ev = { n: string; d: Record<string, string> };
const events = (page: Page): Promise<Ev[]> => page.evaluate(() => JSON.parse(sessionStorage.getItem('__ev') || '[]'));

async function open(page: Page, lazy?: 'late' | 'never') {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const a=JSON.parse(sessionStorage.getItem('__ev')||'[]');a.push({n,d});sessionStorage.setItem('__ev',JSON.stringify(a));}};`,
    }),
  );
  if (lazy) await page.addInitScript(lazyFile, lazy);
  await page.goto('/blur-video-background');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
}
async function expectError(page: Page, text: string | RegExp, errorClass: string) {
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 30_000 });
  await expect(page.locator('#error')).toContainText(text);
  await expect.poll(async () => (await events(page)).filter((e) => e.n === 'tool_run').length).toBe(1);
  expect((await events(page)).find((e) => e.n === 'tool_run')!.d).toMatchObject({ outcome: 'error', error_class: errorClass });
}

test.describe('Edge on Windows 10: clips this page cannot open are refused before the person finder downloads', () => {
  test.use({ userAgent: EDGE_WIN10 });
  const cases: [string, string, string, string][] = [
    ['AVI', 'blur-edge.avi', 'video/x-msvideo', 'Video to MP4'],
    ['WMV', 'blur-edge.wmv', 'video/x-ms-wmv', 'Video to MP4'],
    ['FLV', 'blur-edge.flv', 'video/x-flv', 'Video to MP4'],
    ['3GP', 'blur-edge.3gp', 'video/3gpp', 'Video to MP4'],
  ];
  for (const [label, name, type] of cases) {
    test(`${label} says it is not a format this page opens, and how to get an MP4`, async ({ page }) => {
      let finderFetched = false;
      await page.route(/mediapipe|selfie|\.tflite/i, (r) => ((finderFetched = true), r.continue()));
      await open(page);
      await page.locator('#file-input').setInputFiles([{ name, mimeType: type, buffer: readFileSync(fixture(name)) }]);
      await page.locator('#run').click();
      await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 30_000 });
      await expect(page.locator('#error')).toContainText(label === '3GP' ? '3GP clip' : 'MP4, MOV, WebM or MKV');
      await expect(page.locator('#error')).toContainText('Video to MP4');
      await expect.poll(async () => (await events(page)).filter((e) => e.n === 'tool_run').length).toBe(1);
      expect((await events(page)).find((e) => e.n === 'tool_run')!.d).toMatchObject({ outcome: 'error', error_class: expect.stringMatching(/^(UnreadableFile|UnsupportedCodec)$/) });
      expect(finderFetched).toBe(false);
    });
  }

  test('a renamed non-video (.mp4) is refused the same way', async ({ page }) => {
    await open(page);
    await page.locator('#file-input').setInputFiles([{ name: 'holiday.mp4', mimeType: 'video/mp4', buffer: Buffer.from('plain text, not a video. '.repeat(300)) }]);
    await page.locator('#run').click();
    await expectError(page, 'holiday.mp4 is not a video this page can read (MP4, MOV, WebM or MKV)', 'UnreadableFile');
  });
});

test.describe('Chrome Android', () => {
  test.use({ userAgent: ANDROID, hasTouch: true });

  test('a video that never reads is said before Run, saying to save it to the device', async ({ page }) => {
    await open(page, 'never');
    await page.locator('#file-input').setInputFiles([clip]);
    // A small clip that does not read at all is caught when it is picked, before Run.
    await expect(page.locator('#run-hint')).toHaveAttribute('data-problem', 'FileNotDownloaded');
    await expect(page.locator('#run-hint')).toContainText('Save it to this device first');
    await expect(page.locator('#run')).toBeDisabled();
  });

  test('a video that stops being readable after it was picked is run from the early copy', async ({ page }) => {
    test.setTimeout(300_000);
    await open(page, 'late');
    await page.locator('#file-input').setInputFiles([clip]);
    await page.locator('input[name="finder"][value="fast"]').evaluate((el) => (el as HTMLInputElement).click());
    await page.locator('#run').click();
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 250_000 });
    await expect(page.locator('#error')).not.toHaveClass(/is-active/);
    await expect.poll(async () => (await events(page)).filter((e) => e.n === 'tool_run').length).toBe(1);
    expect((await events(page)).find((e) => e.n === 'tool_run')!.d).toMatchObject({ outcome: 'ok' });
  });
});

// An Android File from a cloud app: the picker's own File stops being readable once the page has done something else
// (here: once the run has started), or never reads at all. The tool must copy it into memory first.
function lazyFile(mode: 'late' | 'never') {
  const w = window as unknown as { __late: boolean };
  w.__late = mode === 'never';
  const RealFile = window.File;
  const copies = new WeakSet<object>();
  window.File = new Proxy(RealFile, {
    construct(t, args) {
      const f = Reflect.construct(t, args) as File;
      copies.add(f);
      return f;
    },
  });
  const originals = new WeakSet<object>();
  const bad = (b: Blob) => w.__late && (originals.has(b) || (b instanceof RealFile && !copies.has(b)));
  const fail = () => new DOMException('The requested file could not be read.', 'NotReadableError');
  const { slice, arrayBuffer, stream } = Blob.prototype;
  Blob.prototype.slice = function (...a: [number?, number?, string?]) {
    const out = slice.apply(this, a);
    if (bad(this)) originals.add(out);
    return out;
  };
  Blob.prototype.arrayBuffer = function () {
    return bad(this) ? Promise.reject(fail()) : arrayBuffer.call(this);
  };
  Blob.prototype.stream = function () {
    return bad(this) ? new ReadableStream({ pull: (c) => c.error(fail()) }) : stream.call(this);
  };
  if (mode === 'late')
    addEventListener('DOMContentLoaded', () => {
      const text = document.querySelector('#progress-text')!;
      new MutationObserver(() => {
        if (/Checking this browser|Loading the person finder/.test(text.textContent ?? '')) w.__late = true;
      }).observe(text, { childList: true, characterData: true, subtree: true });
    });
}

