// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

// Video background remover: every InputError it throws (a photo alone, two pictures, Picture chosen with none) says what to do,
// a video that is not a format this page opens is refused before the person finder downloads, and an Android file that stops
// being readable after it was picked is run from the early copy (or says so, with the error's own name).
const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));
const clip = fixture('iphone-portrait-person-3s.mov');
const png = readFileSync(fixture('logo-red.png'));
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
type Ev = { n: string; d: Record<string, string> };
const events = (page: Page): Promise<Ev[]> => page.evaluate(() => JSON.parse(sessionStorage.getItem('__ev') || '[]'));

test.use({ userAgent: ANDROID, hasTouch: true });

async function open(page: Page, lazy?: 'late' | 'never') {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const a=JSON.parse(sessionStorage.getItem('__ev')||'[]');a.push({n,d});sessionStorage.setItem('__ev',JSON.stringify(a));}};`,
    }),
  );
  if (lazy) await page.addInitScript(lazyFile, lazy);
  await page.goto('/tools/video-background-remover');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
}
async function expectError(page: Page, text: string | RegExp, errorClass: string) {
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 30_000 });
  await expect(page.locator('#error')).toContainText(text);
  await expect.poll(async () => (await events(page)).filter((e) => e.n === 'tool_run').length).toBe(1);
  expect((await events(page)).find((e) => e.n === 'tool_run')!.d).toMatchObject({ outcome: 'error', error_class: errorClass });
}

test.describe('InputError: each refusal says what to do', () => {
  test('a photo alone (a visitor who wanted a photo cut-out) is pointed to Remove background', async ({ page }) => {
    await open(page);
    await page.locator('#file-input').setInputFiles([{ name: 'me.png', mimeType: 'image/png', buffer: png }]);
    // Refused at the drop: Run stays off, so no run (failed or otherwise) is recorded.
    await expect(page.locator('#run-hint')).toContainText(/Add a video too.*Remove background tool/);
    await expect(page.locator('#run')).toBeDisabled();
    expect((await events(page)).filter((e) => e.n === 'tool_run')).toEqual([]);
    // The link carries the photo over to Remove background.
    await page.locator('#run-hint a').click();
    await expect(page).toHaveURL(/\/tools\/remove-background/);
    await expect(page.locator('#handoff-note')).toContainText('me.png');
  });

  test('two pictures and no video are refused before Run too, and adding a video lifts it', async ({ page }) => {
    await open(page);
    await page.locator('#file-input').setInputFiles([
      { name: 'a.png', mimeType: 'image/png', buffer: png },
      { name: 'b.png', mimeType: 'image/png', buffer: png },
    ]);
    await expect(page.locator('#run-hint')).toContainText('Add a video too');
    await expect(page.locator('#run')).toBeDisabled();
    await page.locator('#file-input').setInputFiles([clip]);
    await expect(page.locator('#run-hint')).not.toContainText('Add a video too');
  });

  test('two pictures: says how many and what to do', async ({ page }) => {
    await open(page);
    await page.locator('#file-input').setInputFiles([
      { name: 'a.png', mimeType: 'image/png', buffer: png },
      { name: 'b.png', mimeType: 'image/png', buffer: png },
      { name: 'IMG_0001.MOV', mimeType: '', buffer: readFileSync(clip) },
    ]);
    await page.locator('#run').click();
    await expectError(page, '2 pictures were added. Keep one picture', 'TooManyPictures');
  });

  test('Picture chosen with a video and no picture: Run stays off with a hint, and no run is recorded', async ({ page }) => {
    await open(page);
    await page.locator('input[name="bg"][value="image"]').evaluate((el) => (el as HTMLInputElement).click());
    await page.locator('#file-input').setInputFiles([clip]);
    await expect(page.locator('#run-hint')).toContainText('Add a picture for the new background');
    await expect(page.locator('#run')).toBeDisabled();
    expect((await events(page)).filter((e) => e.n === 'tool_run')).toEqual([]);
    // Adding a picture turns Run on.
    await page.locator('#file-input').setInputFiles([{ name: 'bg.png', mimeType: 'image/png', buffer: png }]);
    await expect(page.locator('#run')).toBeEnabled();
    await expect(page.locator('#run-hint')).not.toContainText('Add a picture for the new background');
  });

  for (const mode of ['blur', 'color']) {
    test(`Picture chosen with a video and no picture: switching to ${mode} turns Run on`, async ({ page }) => {
      await open(page);
      await page.locator('#file-input').setInputFiles([clip]);
      await expect(page.locator('#run')).toBeEnabled();
      await page.locator('input[name="bg"][value="image"]').evaluate((el) => (el as HTMLInputElement).click());
      await expect(page.locator('#run')).toBeDisabled();
      await page.locator(`input[name="bg"][value="${mode}"]`).evaluate((el) => (el as HTMLInputElement).click());
      await expect(page.locator('#run')).toBeEnabled();
    });
  }
});

test.describe('UnreadableFile: refused early', () => {
  test('a file that is not a video this page opens is refused before the person finder is fetched', async ({ page }) => {
    let finderFetched = false;
    await page.route(/mediapipe|selfie|\.tflite/i, (r) => ((finderFetched = true), r.continue()));
    await open(page);
    await page.locator('#file-input').setInputFiles([{ name: 'clip.mp4', mimeType: 'video/mp4', buffer: Buffer.from('this is not a video '.repeat(200)) }]);
    await page.locator('#run').click();
    await expectError(page, 'clip.mp4 is not a video this page can read (MP4, MOV, WebM or MKV)', 'UnreadableFile');
    expect(finderFetched).toBe(false);
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

test('a video that never reads is said before Run, saying to save it to the device', async ({ page }) => {
  await open(page, 'never');
  await page.locator('#file-input').setInputFiles([clip]);
  // A small clip that does not read at all is caught when it is picked, before Run.
  await expect(page.locator('#run-hint')).toHaveAttribute('data-problem', 'FileNotDownloaded');
  await expect(page.locator('#run-hint')).toContainText('Save it to this device first');
  await expect(page.locator('#run')).toBeDisabled();
});
