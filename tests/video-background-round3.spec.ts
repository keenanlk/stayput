import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

// Video background remover, round 3 (STAA-743): a person finder that fails to load or start is tried again, the other delegate is
// tried before giving up, and what is left carries a name that says which step failed (PersonFinderLoadFailed, PersonFinderStartFailed,
// WebGLUnavailable). A file the reader refuses keeps the class of what was wrong, and a read the phone refuses once is read again.
// Failures are forced in the page; Chromium only (headless WebGL is software, which is all the CPU path needs).
const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));
const person = fixture('iphone-portrait-person-3s.mov');
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

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
const finished = (page: Page) => expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
const failed = (page: Page) => expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 200_000 });

async function open(page: Page, finder: 'fast' | 'edges' = 'fast', file: string | { name: string; mimeType: string; buffer: Buffer } = person) {
  await stubAnalytics(page);
  await page.goto('/tools/video-background-remover');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  if (typeof file === 'string') await page.locator('#file-input').setInputFiles([file]);
  else await page.locator('#file-input').setInputFiles([file]);
  await page.locator('input[name="bg"][value="color"]').evaluate((el) => (el as HTMLInputElement).click());
  await page.locator(`input[name="finder"][value="${finder}"]`).evaluate((el) => (el as HTMLInputElement).click());
}
const errorClass = async (page: Page) => (await toolRuns(page))[0]?.error_class;

// Marketing's copy (STAA-742), verbatim.
const COPY = {
  load: "The person finder didn't finish loading, even after a second try. Check your connection, then press Run again.",
  start: "The person finder couldn't start in this browser. Close other tabs and press Run again, or try an up-to-date Chrome, Edge or Safari.",
  webgl: "The person finder needs WebGL, which this browser doesn't provide. Turn on hardware acceleration in the browser's settings, or use an up-to-date Chrome, Edge, Firefox or Safari.",
};

test.describe('the person finder starts again, then says which step failed', () => {
  test.beforeEach(({ browserName }) => test.skip(browserName !== 'chromium'));

  test('the engine files failing once: the second try loads them and the run finishes', async ({ page }) => {
    test.setTimeout(300_000);
    let aborted = 0;
    await page.route(/\/vendor\/[^/]*mediapipe[^/]*\/.*\.wasm$/, (r) => (r.request().method() === 'GET' && aborted++ === 0 ? r.abort() : r.continue()));
    await open(page);
    await page.locator('#run').click();
    await finished(page);
    expect(aborted).toBeGreaterThanOrEqual(1);
    expect((await toolRuns(page))[0]).toMatchObject({ outcome: 'ok' });
  });

  test('the engine files always failing: PersonFinderLoadFailed, with the words and the class', async ({ page }) => {
    test.setTimeout(300_000);
    await page.route(/\/vendor\/[^/]*mediapipe[^/]*\//, (r) => r.abort());
    await open(page);
    await page.locator('#run').click();
    await failed(page);
    await expect(page.locator('#error')).toContainText(COPY.load);
    expect(await errorClass(page)).toBe('PersonFinderLoadFailed');
  });

  test('the engine failing to start once: the second try recovers', async ({ page }) => {
    test.setTimeout(300_000);
    await page.addInitScript(() => ((globalThis as Record<string, unknown>).__stayputStartFault = { times: 1 }));
    await open(page);
    await page.locator('#run').click();
    await finished(page);
    expect((await toolRuns(page))[0]).toMatchObject({ outcome: 'ok' });
  });

  test('the engine never starting: PersonFinderStartFailed, with the words and the class', async ({ page }) => {
    test.setTimeout(300_000);
    await page.addInitScript(() => ((globalThis as Record<string, unknown>).__stayputStartFault = { times: 99 }));
    await open(page);
    await page.locator('#run').click();
    await failed(page);
    await expect(page.locator('#error')).toContainText(COPY.start);
    expect(await errorClass(page)).toBe('PersonFinderStartFailed');
  });

  // A browser that names a real graphics chip, so both delegates are open to the finder (headless Chromium names a software one).
  const namesAChip = () => {
    const real = WebGLRenderingContext.prototype.getParameter;
    const real2 = WebGL2RenderingContext.prototype.getParameter;
    const fake = function (this: WebGLRenderingContext, p: number) {
      return p === 0x9246 ? 'Apple M2' : (real as (p: number) => unknown).call(this, p);
    };
    WebGLRenderingContext.prototype.getParameter = fake as typeof real;
    WebGL2RenderingContext.prototype.getParameter = function (this: WebGL2RenderingContext, p: number) {
      return p === 0x9246 ? 'Apple M2' : (real2 as (p: number) => unknown).call(this, p);
    } as typeof real2;
  };

  test('the processor not starting the engine: the graphics chip is tried before giving up', async ({ page }) => {
    test.setTimeout(300_000);
    const warned: string[] = [];
    page.on('console', (m) => warned.push(m.text()));
    await page.addInitScript(namesAChip);
    await page.addInitScript(() => ((globalThis as Record<string, unknown>).__stayputStartFault = { times: 2, delegate: 'CPU' }));
    await open(page, 'fast');
    await page.locator('#run').click();
    await finished(page);
    expect(warned.some((l) => /processor could not start the person finder, trying the graphics chip/.test(l))).toBe(true);
    expect((await toolRuns(page))[0]).toMatchObject({ outcome: 'ok' });
  });

  test('the graphics chip not starting the engine: the processor is used and the run finishes', async ({ page }) => {
    test.setTimeout(300_000);
    await page.addInitScript(namesAChip);
    await page.addInitScript(() => ((globalThis as Record<string, unknown>).__stayputStartFault = { times: 2, delegate: 'GPU' }));
    await open(page, 'edges');
    await page.locator('#run').click();
    await finished(page);
    await expect(page.locator('#results-list')).toContainText('Found the person with the processor');
    expect((await toolRuns(page))[0]).toMatchObject({ outcome: 'ok' });
  });

  test('both delegates refusing: PersonFinderStartFailed', async ({ page }) => {
    test.setTimeout(300_000);
    await page.addInitScript(namesAChip);
    await page.addInitScript(() => ((globalThis as Record<string, unknown>).__stayputStartFault = { times: 99 }));
    await open(page, 'edges');
    await page.locator('#run').click();
    await failed(page);
    expect(await errorClass(page)).toBe('PersonFinderStartFailed');
  });

  test('no WebGL: WebGLUnavailable, before any model is fetched', async ({ page }) => {
    const models: string[] = [];
    page.on('request', (r) => r.url().includes('/models/') && models.push(r.url()));
    await page.addInitScript(() => {
      const real = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        return /webgl/.test(type) ? null : (real as (...a: unknown[]) => unknown).call(this, type, ...rest);
      } as typeof real;
      const realOff = OffscreenCanvas.prototype.getContext;
      OffscreenCanvas.prototype.getContext = function (this: OffscreenCanvas, type: string, ...rest: unknown[]) {
        return /webgl/.test(type) ? null : (realOff as (...a: unknown[]) => unknown).call(this, type, ...rest);
      } as typeof realOff;
    });
    await open(page);
    await page.locator('#run').click();
    await failed(page);
    await expect(page.locator('#error')).toContainText(COPY.webgl);
    expect(await errorClass(page)).toBe('WebGLUnavailable');
    expect(models.filter((u) => /selfie/.test(u))).toEqual([]);
  });
});

test.describe('a file this page cannot read keeps the class of what was wrong', () => {
  test.beforeEach(({ browserName }) => test.skip(browserName !== 'chromium'));
  test.use({ userAgent: ANDROID, hasTouch: true });

  async function refused(page: Page, file: { name: string; mimeType: string; buffer: Buffer }, cls: string | RegExp) {
    let finderFetched = false;
    await page.route(/mediapipe|selfie|\.tflite/i, (r) => ((finderFetched = true), r.continue()));
    await open(page, 'fast', file);
    await page.locator('#run').click();
    await failed(page);
    await expect.poll(async () => (await toolRuns(page)).length).toBe(1);
    expect(await errorClass(page)).toMatch(cls instanceof RegExp ? cls : new RegExp(`^${cls}$`));
    expect(finderFetched).toBe(false);
  }
  const mp4 = readFileSync(fixture('clip-720p-10s.mp4'));

  test('a recording with no picture is NoVideoTrack, not a damaged file', async ({ page }) => {
    await refused(page, { name: 'voice-note.mp4', mimeType: 'video/mp4', buffer: readFileSync(fixture('tone.m4a')) }, 'NoVideoTrack');
  });
  test('a text file renamed .mp4 is UnreadableContainer', async ({ page }) => {
    await refused(page, { name: 'holiday.mp4', mimeType: 'video/mp4', buffer: Buffer.from('plain text, not a video. '.repeat(300)) }, 'UnreadableContainer');
  });
  test('a layout the reader refuses but the browser\'s own player opens is ContainerNotSupported, with a way on', async ({ page }) => {
    // The player is stood in for: any file "plays" (reports a picture) once given an address.
    await page.addInitScript(() => {
      Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { get: () => 640, configurable: true });
      Object.defineProperty(HTMLMediaElement.prototype, 'src', { set() { setTimeout(() => this.dispatchEvent(new Event('loadedmetadata')), 0); }, get: () => '', configurable: true });
    });
    await refused(page, { name: 'odd-layout.mp4', mimeType: 'video/mp4', buffer: Buffer.from('plain text, not a video. '.repeat(300)) }, 'ContainerNotSupported');
    await expect(page.locator('#error')).toContainText('plays in this browser, but this page cannot read how the file is laid out. Make an MP4 copy with the Video to MP4 tool');
  });
  test('a phone clip cut off before its index (moov at the end, last third missing) is UnreadableContainer, not NoVideoTrack', async ({ page }) => {
    await refused(page, { name: 'cut-off.mp4', mimeType: 'video/mp4', buffer: mp4.subarray(0, Math.floor(mp4.length * 0.7)) }, 'UnreadableContainer');
  });

  test('a clip with its index at the end, as a phone writes it, runs', async ({ page }) => {
    test.setTimeout(300_000);
    await open(page, 'fast', { name: 'phone.mp4', mimeType: 'video/mp4', buffer: mp4 });
    await page.locator('#run').click();
    await finished(page);
    // The clip has no person in it, so Fast says so (FastFoundNoPerson); what matters is that the file was read and run.
    expect((await toolRuns(page))[0]!.error_class ?? 'ok').toMatch(/^(ok|FastFoundNoPerson)$/);
  });

  // From the moment the page says it is checking the browser, file reads fail: once, or every time.
  const flaky = (mode: string) => {
    let armed = false;
    let left = mode === 'once' ? 1 : Infinity;
    const fail = () => new DOMException('The requested file could not be read.', 'NotReadableError');
    const { arrayBuffer, stream } = Blob.prototype;
    const hit = () => armed && left-- > 0;
    Blob.prototype.arrayBuffer = function () {
      return hit() ? Promise.reject(fail()) : arrayBuffer.call(this);
    };
    Blob.prototype.stream = function () {
      return hit() ? new ReadableStream({ pull: (c) => c.error(fail()) }) : stream.call(this);
    };
    addEventListener('DOMContentLoaded', () => {
      const text = document.querySelector('#progress-text')!;
      new MutationObserver(() => {
        if (/Checking this browser/.test(text.textContent ?? '')) armed = true;
      }).observe(text, { childList: true, characterData: true, subtree: true });
    });
  };

  test('one read the phone refuses is read again, and the run finishes', async ({ page }) => {
    test.setTimeout(300_000);
    await page.addInitScript(flaky, 'once');
    await open(page);
    await page.locator('#run').click();
    await finished(page);
    expect((await toolRuns(page))[0]).toMatchObject({ outcome: 'ok' });
  });

  test('reads that never work end as a read failure, not as a bad file', async ({ page }) => {
    test.setTimeout(120_000);
    await page.addInitScript(flaky, 'always');
    await open(page);
    await page.locator('#run').click();
    await failed(page);
    await expect.poll(async () => (await toolRuns(page)).length).toBe(1);
    expect(await errorClass(page)).toMatch(/^NotReadable(Probe|MidRead)$/);
  });
});
