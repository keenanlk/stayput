// @webkit-project
import { test, expect, type Download, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bigPng } from './edge-cases-files';

/**
 * The AI upscaler (upscale-image, and its presets increase-image-resolution and enlarge-image) against forced failures and
 * odd pictures. Nothing large is committed: big pictures are made here. A stand-in for the model's worker (FakeWorker) answers
 * as a real one would, or dies, goes silent or runs out of memory, so the retry ladder is tested without waiting for the model;
 * the download cases and the small-picture cases use the real worker and the real model.
 * UPSCALE_REPORT=1 prints "RESULT <browser> | <case> | <class or ok> | <message>" for every case instead of asserting the branch's
 * expectations (how the before/after table was made on main and on the branch).
 */
const edge = (n: string) => fileURLToPath(new URL(`./fixtures/edge-cases/${n}`, import.meta.url));
const MODEL = '**/models/realesr-general-x4v3.onnx';
const MODEL_BYTES = readFileSync(fileURLToPath(new URL('../public/models/realesr-general-x4v3.onnx', import.meta.url)));
const REPORT = !!process.env.UPSCALE_REPORT;
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

interface Outcome {
  /** ok, the class a failed run recorded, or "refused-on-add" (no run started). */
  label: string;
  message: string;
  note: string;
}

type Input = string | { name: string; mimeType: string; buffer: Buffer };

async function open(page: Page, path = '/tools/upscale-image') {
  await stubAnalytics(page);
  await page.goto(path);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
}

/** Add the file, press Run, and wait for the one recorded run (or for the file to be refused on add). */
async function runFile(page: Page, file: Input, opts: { format?: string; scale?: string; beforeRun?: () => Promise<void> } = {}): Promise<Outcome> {
  if (opts.format) await page.locator('#format').selectOption(opts.format);
  if (opts.scale) await page.locator(`input[name="scale"][value="${opts.scale}"]`).evaluate((el: HTMLInputElement) => el.click());
  await page.locator('#file-input').setInputFiles(file);
  const run = page.locator('#run');
  if (!(await run.isEnabled().catch(() => false))) {
    await page.waitForTimeout(500);
    if (!(await run.isEnabled().catch(() => false))) {
      const text = (await page.locator('#error').innerText().catch(() => '')) || (await page.locator('#file-list').innerText().catch(() => ''));
      return { label: 'refused-on-add', message: text.trim().slice(0, 300), note: '' };
    }
  }
  await opts.beforeRun?.();
  await run.click();
  await expect.poll(async () => (await toolRuns(page)).length, { timeout: 120_000 }).toBeGreaterThanOrEqual(1);
  const runs = await toolRuns(page);
  expect(runs).toHaveLength(1);
  if (runs[0]!.outcome === 'ok') return { label: 'ok', message: '', note: (await page.locator('#results-list').innerText()).trim() };
  return { label: runs[0]!.error_class ?? `(${runs[0]!.outcome})`, message: (await page.locator('#error').innerText().catch(() => '')).trim().slice(0, 400), note: '' };
}

/** Print the outcome in report mode; returns true when the caller should stop. */
function report(name: string, got: Outcome): boolean {
  if (REPORT) console.log(`RESULT ${test.info().project.name} | ${name} | ${got.label} | ${(got.message || got.note).replace(/\s+/g, ' ')}`);
  return REPORT;
}

type Step = 'ok' | 'crash' | 'silent' | 'oom' | 'loadfail';
/**
 * A stand-in for upscale.worker: the nth request is answered as `script[n]` says (the last entry repeats). Every worker the page
 * makes is counted (window.__made) and every request is kept (window.__asked: the picture size sent, and which worker got it).
 */
async function fakeWorker(page: Page, script: Step[], silentMs = 700) {
  await page.addInitScript(
    ({ script, silentMs }) => {
      const w = window as unknown as { __made: number; __asked: { w: number; h: number; worker: number }[]; __stayputUpscaleSilentMs: number };
      w.__made = 0;
      w.__asked = [];
      w.__stayputUpscaleSilentMs = silentMs;
      const Real = window.Worker;
      (window as unknown as { Worker: unknown }).Worker = function (url: string | URL, opts?: WorkerOptions) {
        const made = new Real(url, opts);
        if (String(url).includes('upscale.worker')) (made as unknown as { __n: number }).__n = ++w.__made;
        return made;
      };
      const real = Real.prototype.postMessage;
      Real.prototype.postMessage = function (this: Worker, data: unknown, ...rest: unknown[]) {
        const d = data as { id: number; type?: string; width: number; height: number; rgba: Uint8ClampedArray } | undefined;
        if (d?.type !== 'upscale') return (real as (...a: unknown[]) => void).call(this, data, ...rest);
        const n = w.__asked.length;
        w.__asked.push({ w: d.width, h: d.height, worker: (this as unknown as { __n: number }).__n });
        const step = script[Math.min(n, script.length - 1)];
        const say = (msg: Record<string, unknown>) => this.dispatchEvent(new MessageEvent('message', { data: { id: d.id, ...msg } }));
        setTimeout(() => {
          if (step === 'crash') return this.dispatchEvent(new ErrorEvent('error', { message: 'simulated: the worker died' }));
          if (step === 'silent') return say({ type: 'working' });
          if (step === 'oom') return say({ type: 'error', name: 'OutOfMemoryError', message: 'simulated: out of memory' });
          if (step === 'loadfail') return say({ type: 'error', name: 'ModelLoadError', message: 'simulated: the model would not start' });
          say({ type: 'loading', fraction: 1 });
          say({ type: 'working' });
          say({ type: 'progress', fraction: 0.5 });
          const rgba = new Uint8ClampedArray(d.width * 4 * d.height * 4 * 4).fill(128);
          for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
          say({ type: 'done', rgba, width: d.width * 4, height: d.height * 4 });
        }, 20);
      } as typeof Real.prototype.postMessage;
    },
    { script, silentMs },
  );
}
const asked = (page: Page) => page.evaluate(() => (window as unknown as { __asked: { w: number; h: number; worker: number }[] }).__asked);
const made = (page: Page) => page.evaluate(() => (window as unknown as { __made: number }).__made);

// ---- The model download: the shared path (resume, offline, hash check, cache) ----
test.describe('the model download', () => {
  test.setTimeout(120_000);

  test('a download that is aborted is ModelDownloadError', async ({ page }) => {
    await page.route(MODEL, (route) => route.abort('connectionreset'));
    await open(page);
    const got = await runFile(page, edge('good.png'));
    if (report('model download aborted', got)) return;
    expect(got.label).toBe('ModelDownloadError');
    expect(got.message).toContain('could not be downloaded');
  });

  test('offline before the download is ModelOffline, with no request for the model', async ({ page }) => {
    let asks = 0;
    await page.route(MODEL, (route) => (asks++, route.continue()));
    await open(page);
    const got = await runFile(page, edge('good.png'), { beforeRun: () => page.context().setOffline(true) });
    if (report('offline before the download', got)) return;
    expect(got.label).toBe('ModelOffline');
    expect(got.message).toContain('no internet connection');
    expect(asks).toBe(0);
  });

  test('a corrupted body is ModelVerifyFailed, not a failed model load', async ({ page }) => {
    await page.route(MODEL, (route) => route.fulfill({ status: 200, contentType: 'application/octet-stream', body: Buffer.alloc(MODEL_BYTES.length, 7) }));
    await open(page);
    const got = await runFile(page, edge('good.png'));
    if (report('model body corrupted', got)) return;
    expect(got.label).toBe('ModelVerifyFailed');
  });

  test('a download cut part-way is asked for again from where it stopped, and the run finishes', async ({ page }) => {
    const ranges: string[] = [];
    await page.route(MODEL, (route) => {
      const range = route.request().headers()['range'];
      ranges.push(range ?? 'none');
      if (!range) {
        // Promises the whole file, sends 40% and ends: the connection dropped.
        return route.fulfill({ status: 200, headers: { 'content-type': 'application/octet-stream', 'content-length': String(MODEL_BYTES.length) }, body: MODEL_BYTES.subarray(0, Math.floor(MODEL_BYTES.length * 0.4)) });
      }
      const from = Number(/bytes=(\d+)-/.exec(range)![1]);
      return route.fulfill({
        status: 206,
        headers: { 'content-type': 'application/octet-stream', 'content-range': `bytes ${from}-${MODEL_BYTES.length - 1}/${MODEL_BYTES.length}`, 'content-length': String(MODEL_BYTES.length - from) },
        body: MODEL_BYTES.subarray(from),
      });
    });
    await open(page);
    const got = await runFile(page, edge('good.png'));
    if (report('download cut mid-way', got)) return;
    expect(got.label, got.message).toBe('ok');
    expect(ranges.length).toBeGreaterThanOrEqual(2);
    expect(ranges[0]).toBe('none');
    expect(ranges.slice(1).some((r) => /^bytes=\d+-$/.test(r))).toBe(true);
  });
});

// ---- A worker that dies, goes silent or runs out of memory ----
test.describe('the worker', () => {
  test.setTimeout(120_000);

  test('one that dies mid-run is replaced and the same picture finishes on the new worker', async ({ page }) => {
    await fakeWorker(page, ['crash', 'ok']);
    await open(page);
    const got = await runFile(page, edge('good.png'));
    if (report('worker dies once', got)) return;
    expect(got.label, got.message).toBe('ok');
    expect(await made(page)).toBe(2);
    const sent = await asked(page);
    expect(sent.map((s) => s.worker)).toEqual([1, 2]);
    expect(sent[1]).toMatchObject({ w: sent[0]!.w, h: sent[0]!.h });
  });

  test('two that die give WorkerCrashError, quickly: no three-minute stall', async ({ page }) => {
    await fakeWorker(page, ['crash']);
    await open(page);
    const t0 = Date.now();
    const got = await runFile(page, edge('good.png'));
    if (report('worker dies twice', got)) return;
    expect(got.label).toBe('WorkerCrashError');
    expect(got.message).toContain('stopped unexpectedly');
    expect(Date.now() - t0).toBeLessThan(30_000);
    expect(await made(page)).toBe(2);
  });

  test('one that goes silent is replaced after the silence limit; two silent ones give WorkerCrashError', async ({ page }) => {
    await fakeWorker(page, ['silent', 'ok']);
    await open(page);
    const got = await runFile(page, edge('good.png'));
    if (report('worker silent once', got)) return;
    expect(got.label, got.message).toBe('ok');
    expect(await made(page)).toBe(2);
  });

  test('two silent ones give WorkerCrashError', async ({ page }) => {
    await fakeWorker(page, ['silent']);
    await open(page);
    const t0 = Date.now();
    const got = await runFile(page, edge('good.png'));
    if (report('worker silent twice', got)) return;
    expect(got.label).toBe('WorkerCrashError');
    expect(Date.now() - t0).toBeLessThan(30_000);
  });

  test('a model that downloaded but will not start gets a fresh worker once', async ({ page }) => {
    await fakeWorker(page, ['loadfail', 'ok']);
    await open(page);
    const got = await runFile(page, edge('good.png'));
    if (report('model will not start once', got)) return;
    expect(got.label, got.message).toBe('ok');
    expect(await made(page)).toBe(2);
  });

  test('a model that will not start twice keeps its own name, ModelLoadError', async ({ page }) => {
    await fakeWorker(page, ['loadfail']);
    await open(page);
    const got = await runFile(page, edge('good.png'));
    if (report('model will not start twice', got)) return;
    expect(got.label).toBe('ModelLoadError');
    expect(await made(page)).toBe(2);
  });

  test('a memory failure at full size is made again at a smaller scale, on a new worker, and says so', async ({ page }) => {
    await fakeWorker(page, ['oom', 'ok']);
    await open(page);
    const got = await runFile(page, await bigPng(800, 600, 'photo.png'));
    if (report('memory failure at full size', got)) return;
    expect(got.label, got.message).toBe('ok');
    const sent = await asked(page);
    // 4× asked: the network sees 800 × 600 (a quarter of 3200 × 2400); the second try is half the scale.
    expect(sent.map((s) => s.w)).toEqual([800, 400]);
    expect(sent[1]!.worker).not.toBe(sent[0]!.worker);
    expect(got.note).toContain('800×600 to 1600×1200');
    expect(got.note).toContain('a smaller size than asked, because the first try ran out of memory');
  });

  test('out of memory at the smaller scale too is OutOfMemoryError', async ({ page }) => {
    await fakeWorker(page, ['oom']);
    await open(page);
    const got = await runFile(page, await bigPng(800, 600, 'photo.png'));
    if (report('memory failure twice', got)) return;
    expect(got.label).toBe('OutOfMemoryError');
    expect(got.message).toContain('even at a smaller size');
    expect(await asked(page)).toHaveLength(2);
  });
});

// ---- A phone, or a device with little memory, on a big picture ----
test.describe('a big picture', () => {
  test.setTimeout(180_000);

  test.describe('on a phone that reports 2 GB', () => {
    test.use({ userAgent: ANDROID, hasTouch: true });
    test('takes the lighter path first and its note says the result is smaller', async ({ page }) => {
      await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => 2 }));
      await fakeWorker(page, ['ok']);
      await open(page);
      const got = await runFile(page, await bigPng(4000, 3000, 'big.png'));
      if (report('4000×3000 on a phone with 2 GB', got)) return;
      expect(got.label, got.message).toBe('ok');
      // Held to the picture's own size: the network sees 1000 × 750, not the 1181 × 886 a computer starts with.
      expect((await asked(page)).map((s) => [s.w, s.h])).toEqual([[1000, 750]]);
      expect(got.note).toContain('4000×3000 to 4000×3000');
      expect(got.note).toContain('a smaller size than asked, because this device may run low on memory');
    });
  });

  test('on a computer the same picture starts at full size (held only by the canvas limit)', async ({ page }) => {
    await fakeWorker(page, ['ok']);
    await open(page);
    const got = await runFile(page, await bigPng(4000, 3000, 'big.png'));
    if (report('4000×3000 on a computer', got)) return;
    expect(got.label, got.message).toBe('ok');
    const sent = await asked(page);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.w).toBeGreaterThan(1100);
    expect(got.note).toContain('held to');
    expect(got.note).not.toContain('smaller size than asked');
  });
});

// ---- Odd and broken pictures: each ends with a result or a named class ----
interface Case {
  name: string;
  file: () => Input | Promise<Input>;
  /** The classes the branch may end with: "ok", "refused-on-add", or a class name. */
  want: string[];
  says?: RegExp;
}
const CASES: Case[] = [
  // A browser that decodes the part it has (Chromium does) finishes with what it could read; one that refuses names the cause.
  { name: 'truncated PNG', file: () => edge('truncated-half.png'), want: ['ok', 'FileTruncated', 'ImageDecodeFailed'] },
  { name: 'truncated JPEG', file: () => edge('truncated-half.jpg'), want: ['ok', 'FileTruncated', 'ImageDecodeFailed'] },
  { name: 'CMYK JPEG', file: () => edge('cmyk.jpg'), want: ['ok'] },
  { name: '0-byte file', file: () => edge('zero.png'), want: ['refused-on-add', 'EmptyFile'] },
  { name: 'text file named .png', file: () => edge('text-named.png'), want: ['NotAnImageFile'], says: /not a picture/ },
  { name: 'JPEG header followed by noise', file: () => edge('garbage.jpg'), want: ['FileTruncated', 'ImageDecodeFailed'] },
  { name: '16-bit PNG', file: () => edge('png16.png'), want: ['ok'] },
  { name: 'HEIC', file: () => edge('heic-still.heic'), want: ['ok'] },
];
for (const c of CASES) {
  test(`odd file: ${c.name}`, async ({ page }) => {
    test.setTimeout(180_000);
    await open(page);
    const got = await runFile(page, await c.file());
    if (report(c.name, got)) return;
    expect(got.label).not.toBe('UpscaleImageFailed');
    expect(got.label).not.toMatch(/^(Error|TypeError|RangeError|UnnamedError)$|UnnamedError$/);
    expect(c.want, `${got.label} ${got.message}`).toContain(got.label);
    if (got.label !== 'ok' && c.says) expect(got.message).toMatch(c.says);
  });
}

test.describe('pixels', () => {
  test.setTimeout(120_000);
  /** A 48 × 48 picture, opaque red in the middle and clear at the corners. */
  async function logo(page: Page): Promise<Input> {
    const b64 = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = c.height = 48;
      const x = c.getContext('2d')!;
      x.fillStyle = '#c81e1e';
      x.beginPath();
      x.arc(24, 24, 16, 0, Math.PI * 2);
      x.fill();
      return c.toDataURL('image/png').split(',')[1]!;
    });
    return { name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') };
  }
  const readBack = (page: Page, bytes: Buffer) =>
    page.evaluate(async (b64) => {
      const bin = atob(b64);
      const u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      const bmp = await createImageBitmap(new Blob([u]));
      const c = document.createElement('canvas');
      c.width = bmp.width;
      c.height = bmp.height;
      const x = c.getContext('2d')!;
      x.drawImage(bmp, 0, 0);
      return { width: bmp.width, corner: [...x.getImageData(2, 2, 1, 1).data], middle: [...x.getImageData(bmp.width / 2, bmp.height / 2, 1, 1).data] };
    }, bytes.toString('base64'));

  async function download(page: Page, input: Input, format?: string): Promise<Buffer> {
    if (format) await page.locator('#format').selectOption(format);
    await page.locator('#file-input').setInputFiles(input);
    const downloads: Download[] = [];
    page.on('download', (d) => downloads.push(d));
    await page.locator('#run').click();
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 100_000 });
    await expect.poll(() => downloads.length, { timeout: 10_000 }).toBe(1);
    const path = await downloads[0]!.path();
    return readFileSync(path!);
  }

  test('a transparent PNG keeps its transparency', async ({ page }) => {
    await open(page);
    const out = await readBack(page, await download(page, await logo(page)));
    expect(out.width).toBe(192);
    expect(out.corner[3]).toBe(0);
    expect(out.middle[3]).toBe(255);
    expect(out.middle[0]).toBeGreaterThan(150);
  });

  test('a JPEG output fills the clear parts with white', async ({ page }) => {
    await open(page);
    const out = await readBack(page, await download(page, await logo(page), 'image/jpeg'));
    expect(Math.min(...out.corner.slice(0, 3))).toBeGreaterThan(240);
    expect(out.middle[0]).toBeGreaterThan(150);
  });
});

// ---- Saving ----
test.describe('saving the finished picture', () => {
  test.setTimeout(120_000);

  test('a canvas that gives back nothing is UpscaleSaveFailed', async ({ page }) => {
    await fakeWorker(page, ['ok']);
    await page.addInitScript(() => {
      if (typeof OffscreenCanvas !== 'undefined') OffscreenCanvas.prototype.convertToBlob = () => Promise.resolve(null as unknown as Blob);
      HTMLCanvasElement.prototype.toBlob = function (cb) {
        cb(null);
      };
    });
    await open(page);
    const got = await runFile(page, edge('good.png'));
    if (report('canvas gives back nothing', got)) return;
    expect(got.label).toBe('UpscaleSaveFailed');
    expect(got.message).toContain('could not save the upscaled picture as PNG');
  });

  test('a canvas that gives back another type is UpscaleSaveFailed', async ({ page }) => {
    await fakeWorker(page, ['ok']);
    await page.addInitScript(() => {
      // Asked for a JPEG, hands over a PNG.
      if (typeof OffscreenCanvas !== 'undefined') {
        const convert = OffscreenCanvas.prototype.convertToBlob;
        OffscreenCanvas.prototype.convertToBlob = function (o) {
          return convert.call(this, { ...o, type: 'image/png' });
        };
      }
      const toBlob = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (cb, _type, q) {
        return toBlob.call(this, cb, 'image/png', q);
      };
    });
    await open(page);
    const got = await runFile(page, edge('good.png'), { format: 'image/jpeg' });
    if (report('canvas gives back another type', got)) return;
    expect(got.label).toBe('UpscaleSaveFailed');
    expect(got.message).toContain('JPG');
  });
});

// ---- Android: a file the phone will not hand over keeps its read-failure classes ----
/** Every read of any file fails the way Android's does when the file's cloud copy is not on the phone: Blob reads and the picture decoder both refuse. */
const failReads = () => {
  const notReadable = () => new DOMException('The requested file could not be read.', 'NotReadableError');
  Blob.prototype.arrayBuffer = () => Promise.reject(notReadable());
  Blob.prototype.stream = function () {
    return new ReadableStream({ pull: (c) => c.error(notReadable()) });
  };
  (window as unknown as { createImageBitmap: unknown }).createImageBitmap = () => Promise.reject(notReadable());
};

test.describe('a file the browser will not read', () => {
  test.setTimeout(120_000);

  test('from its first byte: refused when added with NotReadableProbe, Run off, no run recorded', async ({ page }) => {
    await open(page);
    await page.evaluate(failReads);
    await page.locator('#file-input').setInputFiles(edge('good.png'));
    const hint = page.locator('#run-hint');
    if (REPORT) {
      await page.waitForTimeout(2000);
      return console.log(`RESULT ${test.info().project.name} | NotReadable at the first byte | ${await hint.getAttribute('data-problem')} | run disabled: ${await page.locator('#run').isDisabled()}`);
    }
    await expect(hint).toHaveAttribute('data-problem', /^(NotReadableProbe|FileNotDownloaded)$/, { timeout: 15_000 });
    await expect(page.locator('#run')).toBeDisabled();
    expect(await toolRuns(page)).toHaveLength(0);
  });

  test('after it was added: the shared read-failure class, never a bare error or UpscaleImageFailed', async ({ page }) => {
    await open(page);
    await page.locator('#file-input').setInputFiles(edge('good.png'));
    await expect(page.locator('#run')).toBeEnabled();
    await page.evaluate(failReads);
    await page.locator('#run').click();
    await expect.poll(async () => (await toolRuns(page)).length, { timeout: 60_000 }).toBeGreaterThanOrEqual(1);
    const run = (await toolRuns(page))[0]!;
    if (REPORT) return console.log(`RESULT ${test.info().project.name} | NotReadable after add | ${run.error_class}`);
    expect(run.error_class).toMatch(/^(NotReadable\w*|UnreadableFileGone)$/);
  });
});
