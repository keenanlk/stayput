import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { workerFailure } from '../src/lib/worker-error';

// Failures that used to land in the "<Tool>UnnamedError" fallback or in a bare TypeError / NotFoundError:
// each step now records a class name of its own, and a file the browser reports gone is read once more.
const fx = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));

type Ev = { n: string; d: Record<string, string> };
async function stubAnalytics(page: Page) {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const a=JSON.parse(sessionStorage.getItem('__ev')||'[]');a.push({n,d});sessionStorage.setItem('__ev',JSON.stringify(a));}};`,
    }),
  );
}
const toolRuns = (page: Page) => page.evaluate(() => (JSON.parse(sessionStorage.getItem('__ev') || '[]') as Ev[]).filter((e) => e.n === 'tool_run').map((e) => e.d));

async function open(page: Page, path: string, files: string[]) {
  await stubAnalytics(page);
  return async () => {
    await page.goto(path);
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    await page.locator('#file-input').setInputFiles(files);
  };
}

async function failedWith(page: Page, errorClass: string) {
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 90_000 });
  const runs = await toolRuns(page);
  expect(runs).toHaveLength(1);
  expect(runs[0]).toMatchObject({ outcome: 'error', error_class: errorClass });
}

test('a TypeError from a worker step takes the step name', () => {
  expect(workerFailure(new TypeError('Failed to fetch'), 'BackgroundModelLoadFailed').name).toBe('BackgroundModelLoadFailed');
  expect(workerFailure(new TypeError('Failed to fetch')).name).toBe('TypeError');
});

test('side-by-side-video: a drawing failure while encoding records SideBySideEncodeFailed', async ({ page }) => {
  test.setTimeout(120_000);
  const go = await open(page, '/tools/side-by-side-video', [fx('sbs-a-24fps.mp4'), fx('sbs-b-30fps-6s.mp4')]);
  await page.addInitScript(() => {
    // The test encode at the real size would draw the wide frame too, and the run would quietly start smaller: leave it out.
    (window as unknown as { __stayputNoSizeProbe: boolean }).__stayputNoSizeProbe = true;
    // Only the output frame (two cells wide) fails: the encoder probe draws small pictures and must still pass.
    const real = OffscreenCanvasRenderingContext2D.prototype.fillRect;
    OffscreenCanvasRenderingContext2D.prototype.fillRect = function (this: OffscreenCanvasRenderingContext2D, ...a: [number, number, number, number]) {
      if (this.canvas.width >= 2000) throw new TypeError("Failed to execute 'fillRect' on 'OffscreenCanvasRenderingContext2D'");
      return real.apply(this, a);
    };
  });
  await go();
  await failedWith(page, 'SideBySideEncodeFailed');
});

test('wav-to-m4a: an encoder that throws a plain Error records AudioEncodeFailed', async ({ page }) => {
  test.setTimeout(120_000);
  const go = await open(page, '/wav-to-m4a', [fx('jfk.wav')]);
  await page.addInitScript(() => {
    // Linux CI Chromium has no AAC encoder: say there is one, so the run reaches the encode step.
    AudioEncoder.isConfigSupported = async (config: AudioEncoderConfig) => ({ supported: true, config });
    AudioEncoder.prototype.configure = function () {
      throw new Error('encoder failed');
    };
  });
  await go();
  await failedWith(page, 'AudioEncodeFailed');
});

test.describe('image-to-word', () => {
  test('a text reader that cannot be fetched records TextReaderLoadFailed, not TypeError', async ({ page }) => {
    test.setTimeout(120_000);
    const go = await open(page, '/tools/image-to-word', [fx('ocr-note.png')]);
    await page.route('**/vendor/tesseract*/**', (route) => route.abort('failed'));
    await go();
    await failedWith(page, 'TextReaderLoadFailed');
  });

  const gone = (times: number) => {
    let left = times;
    const real = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = function (this: Blob) {
      if (left-- > 0) return Promise.reject(new DOMException('A requested file or directory could not be found', 'NotFoundError'));
      return real.call(this);
    };
  };

  test('a file the browser reports gone is read once more and the run succeeds', async ({ page }) => {
    test.setTimeout(120_000);
    const go = await open(page, '/tools/image-to-word', [fx('ocr-note.png')]);
    await page.addInitScript(gone, 1);
    await go();
    await page.locator('#run').click();
    await expect.poll(async () => (await toolRuns(page)).length, { timeout: 90_000 }).toBe(1);
    expect((await toolRuns(page))[0]).toMatchObject({ outcome: 'ok' });
  });

  test('a file that stays gone records UnreadableFile and says to pick it again', async ({ page }) => {
    test.setTimeout(120_000);
    const go = await open(page, '/tools/image-to-word', [fx('ocr-note.png')]);
    await page.addInitScript(gone, 1000);
    await go();
    await failedWith(page, 'UnreadableFile');
    await expect(page.locator('#error')).toContainText('Pick it again');
  });
});

test('remove-background: a model fetch that fails in the worker records BackgroundModelLoadFailed, not TypeError', async ({ page }) => {
  test.setTimeout(120_000);
  const go = await open(page, '/tools/remove-background', [fx('frenchie.jpg')]);
  await page.route('**/models/isnet-general-use-int8w.onnx', (route) => route.abort('failed'));
  await go();
  await failedWith(page, 'BackgroundModelLoadFailed');
});

test('linkedin-profile-picture: a face finder that cannot load records FaceFinderFailed, not TypeError', async ({ page }) => {
  test.setTimeout(120_000);
  const go = await open(page, '/linkedin-profile-picture', [fx('face.jpg')]);
  await page.route('**/models/blaze_face_short_range.tflite', (route) => route.abort('failed'));
  await go();
  await failedWith(page, 'FaceFinderFailed');
});
