// @webkit-project
import { test, expect, type Page, type Download } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchModelResumable } from '../src/lib/model-stall';

/**
 * Remove object / remove text: the model sees only the painted region (plus context), Undo keeps only what an erase
 * changed, the model download survives a dropped connection, and a worker that dies is replaced once. Pictures are made
 * here with Pillow (the 4000×3000 and 24 MP ones are too big to commit).
 */
const MODEL = fileURLToPath(new URL('../public/models/migan-pipeline-v2.onnx', import.meta.url));
const MODEL_ROUTE = '**/models/migan-pipeline-v2.onnx';
const KEYS = new Set(['tool', 'outcome', 'attempt', 'files', 'input', 'output', 'duration', 'format', 'error_class', 'landing', 'ref', 'from', 'visit', 'prev_tool', 'run_n', 'tools_used', 'run_gap', 'ns', 'via', 'variant']);
type Ev = { n: string; d: Record<string, string> };
type Win = { __posted: { rgbaLength: number; width: number; height: number }[]; __spawned: number; __plan: ('ok' | 'die')[]; __asked: number; __inpaintFull?: boolean };

const dir = mkdtempSync(join(tmpdir(), 'remove-object-'));
function make(name: string, code: string): string {
  const file = join(dir, name);
  execFileSync('python3', ['-I', '-c', `from PIL import Image, ImageDraw\nimport sys\nout = sys.argv[1]\n${code}`, file]);
  return file;
}
/** 1200×900: a smooth colour field with white "SAMPLE TEXT" on it. */
const scene = () =>
  make('scene-1200.png', `
im = Image.new('RGB', (1200, 900))
px = im.load()
for y in range(900):
    for x in range(1200):
        px[x, y] = (40 + x // 8, 90 + y // 9, 200 - x // 10)
d = ImageDraw.Draw(im)
d.rectangle((300, 400, 700, 500), fill=(255, 255, 255))
d.text((330, 430), 'SAMPLE TEXT', fill=(0, 0, 0))
im.save(out)
`);
const big = () =>
  make('big-4000x3000.png', `
im = Image.linear_gradient('L').resize((4000, 3000))
Image.merge('RGB', (im, im.transpose(Image.FLIP_TOP_BOTTOM), im.transpose(Image.ROTATE_90).resize((4000, 3000)))).save(out)
`);
const photo24 = () => make('photo-24mp.jpg', `Image.effect_noise((5712, 4284), 64).convert('RGB').save(out, quality=80)`);

const events = (page: Page): Promise<Ev[]> => page.evaluate(() => JSON.parse(sessionStorage.getItem('__ev') || '[]'));
const runs = async (page: Page) => (await events(page)).filter((e) => e.n === 'tool_run').map((e) => e.d);

async function recordEvents(page: Page) {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const k='__ev';const a=JSON.parse(sessionStorage.getItem(k)||'[]');a.push({n,d});sessionStorage.setItem(k,JSON.stringify(a));}};`,
    }),
  );
}

async function open(page: Page, file: string) {
  await page.goto('/remove-text-from-image');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(file);
  await expect(page.locator('#erase-panel')).toBeVisible();
}

/** Paint between fractions of the stage, with a brush whose diameter is `sourcePx` pixels of a picture `picW` pixels wide. */
async function paint(page: Page, points: [number, number][], sourcePx = 100, picW = 1200) {
  const canvas = page.locator('#erase-canvas');
  // The slider is the brush's diameter on screen (8 to 120, steps of 2). Set it before measuring: filling it scrolls the page.
  const width = (await canvas.boundingBox())!.width;
  const diameter = Math.min(120, Math.max(8, 2 * Math.round((sourcePx * width) / picW / 2)));
  await page.locator('#brush').fill(String(diameter));
  await canvas.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const b = (await canvas.boundingBox())!;
  await page.mouse.move(b.x + b.width * points[0]![0], b.y + b.height * points[0]![1]);
  await page.mouse.down();
  for (const [x, y] of points.slice(1)) await page.mouse.move(b.x + b.width * x, b.y + b.height * y, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator('#erase-panel')).toHaveAttribute('data-strokes', /^[1-9]/);
}

async function erase(page: Page, edits: number) {
  await page.locator('#erase-go').click();
  await expect(page.locator('#erase-panel')).toHaveAttribute('data-edits', String(edits), { timeout: 120_000 });
}

async function save(page: Page): Promise<Buffer> {
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#run').click()]);
  return bytesOf(download);
}
async function bytesOf(d: Download): Promise<Buffer> {
  return readFileSync((await d.path())!);
}

/** RGBA pixels of an encoded picture, decoded by the page. */
async function pixels(page: Page, png: Buffer): Promise<{ w: number; h: number; data: number[] }> {
  return page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes]));
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = c.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0);
    return { w: bmp.width, h: bmp.height, data: Array.from(ctx.getImageData(0, 0, bmp.width, bmp.height).data) };
  }, png.toString('base64'));
}

const SCENE_PATH: [number, number][] = [[0.3, 0.5], [0.55, 0.5]];

test('region equivalence: erasing the painted region matches the whole-picture path inside the hole and leaves the rest untouched', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'the comparison runs once, on Chromium');
  test.setTimeout(240_000);
  const input = scene();
  await open(page, input);
  await paint(page, SCENE_PATH);
  await erase(page, 1);
  const region = await pixels(page, await save(page));

  await page.reload();
  await page.evaluate(() => ((window as unknown as Win).__inpaintFull = true));
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(input);
  await expect(page.locator('#erase-panel')).toBeVisible();
  await paint(page, SCENE_PATH);
  await erase(page, 1);
  const full = await pixels(page, await save(page));
  const original = await pixels(page, readFileSync(input));

  expect([region.w, region.h]).toEqual([1200, 900]);
  let holePx = 0;
  let diff = 0;
  let outsideChanged = 0;
  for (let i = 0; i < region.data.length; i += 4) {
    const inHole = full.data[i] !== original.data[i] || full.data[i + 1] !== original.data[i + 1] || full.data[i + 2] !== original.data[i + 2];
    const regionChanged = region.data[i] !== original.data[i] || region.data[i + 1] !== original.data[i + 1] || region.data[i + 2] !== original.data[i + 2];
    if (inHole) {
      holePx++;
      diff += (Math.abs(region.data[i]! - full.data[i]!) + Math.abs(region.data[i + 1]! - full.data[i + 1]!) + Math.abs(region.data[i + 2]! - full.data[i + 2]!)) / 3;
    } else if (regionChanged) outsideChanged++;
  }
  expect(holePx).toBeGreaterThan(1000);
  expect(diff / holePx, 'mean absolute difference inside the hole').toBeLessThanOrEqual(4);
  expect(outsideChanged, 'pixels changed outside the hole').toBeLessThanOrEqual(holePx / 1000);
});

test('memory shape: the model is sent the painted region, not the picture', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'one browser is enough to see what is posted');
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    const w = window as unknown as Win;
    w.__posted = [];
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (this: Worker, msg: unknown, ...rest: unknown[]) {
      const m = msg as { type?: string; rgba?: Uint8ClampedArray; width?: number; height?: number };
      if (m?.type === 'inpaint') w.__posted.push({ rgbaLength: m.rgba!.length, width: m.width!, height: m.height! });
      return (post as (...a: unknown[]) => void).call(this, msg, ...rest);
    } as typeof Worker.prototype.postMessage;
  });
  await open(page, big());
  await paint(page, [[0.5, 0.5], [0.52, 0.5]], 100, 4000);
  await erase(page, 1);
  const posted = await page.evaluate(() => (window as unknown as Win).__posted);
  expect(posted).toHaveLength(1);
  expect(posted[0]!.rgbaLength).toBeLessThan(4 * 1000 * 1000);
  expect(posted[0]!.rgbaLength).toBeLessThan(4 * 12e6 / 10);
});

test('undo is byte-exact: erase twice, undo twice, and the picture is the one that was opened', async ({ page }) => {
  test.setTimeout(240_000);
  await open(page, scene());
  const canvas = page.locator('#erase-canvas');
  // 1200 px wide: the preview is drawn at full size, so it is the picture. It is redrawn on the next frame.
  const frame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const shown = async () => {
    await frame();
    return canvas.evaluate((el) => (el as HTMLCanvasElement).toDataURL('image/png'));
  };
  const before = await shown();
  await paint(page, [[0.3, 0.5], [0.4, 0.5]], 60);
  await erase(page, 1);
  const afterOne = await save(page);
  await paint(page, [[0.7, 0.2], [0.8, 0.2]], 60);
  await erase(page, 2);
  await page.locator('#erase-undo').click();
  await expect(page.locator('#erase-panel')).toHaveAttribute('data-edits', '1');
  // Saved again after the second erase is undone: the same bytes as after the first.
  expect((await save(page)).equals(afterOne)).toBe(true);
  await page.locator('#erase-undo').click();
  await expect(page.locator('#erase-panel')).toHaveAttribute('data-edits', '0');
  expect(await shown()).toBe(before);
});

/** The model, served the way a flaky connection serves it: the first answer is cut after 1 MB, and Range requests are honoured or not. */
async function serveModel(page: Page, honourRange: boolean) {
  const model = readFileSync(MODEL);
  const seen = { requests: 0, ranged: 0 };
  await page.route(MODEL_ROUTE, async (route) => {
    const range = /bytes=(\d+)-/.exec(route.request().headers()['range'] ?? '');
    seen.requests++;
    if (range) seen.ranged++;
    if (range && honourRange) {
      const from = Number(range[1]);
      return route.fulfill({ status: 206, headers: { 'content-range': `bytes ${from}-${model.length - 1}/${model.length}`, 'content-length': String(model.length - from), 'content-type': 'application/octet-stream' }, body: model.subarray(from) });
    }
    if (seen.requests === 1) {
      return route.fulfill({ status: 200, headers: { 'content-length': String(model.length), 'content-type': 'application/octet-stream' }, body: model.subarray(0, 1_000_000) });
    }
    return route.fulfill({ status: 200, headers: { 'content-length': String(model.length), 'content-type': 'application/octet-stream' }, body: model });
  });
  return seen;
}

test('model download resumes with a Range request after the connection drops', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'one browser is enough; the resume logic itself is browser-independent');
  test.setTimeout(240_000);
  const seen = await serveModel(page, true);
  await open(page, scene());
  await paint(page, SCENE_PATH, 60);
  await erase(page, 1);
  expect(seen.ranged).toBeGreaterThanOrEqual(1);
});

test('model download from a host that ignores Range starts over and skips what it already has', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'one browser is enough; the resume logic itself is browser-independent');
  test.setTimeout(240_000);
  const seen = await serveModel(page, false);
  await open(page, scene());
  await paint(page, SCENE_PATH, 60);
  await erase(page, 1);
  expect(seen.requests).toBeGreaterThanOrEqual(2);
});

test('a refused model (HTTP 503) is recorded as ModelDownloadError, with nothing but the class', async ({ page }) => {
  await recordEvents(page);
  await page.route(MODEL_ROUTE, (r) => r.fulfill({ status: 503, body: 'down' }));
  await open(page, scene());
  await paint(page, SCENE_PATH, 60);
  await page.locator('#erase-go').click();
  await expect.poll(async () => (await runs(page)).length, { timeout: 60_000 }).toBe(1);
  expect((await runs(page))[0]).toMatchObject({ outcome: 'error', error_class: 'ModelDownloadError' });
  for (const e of (await events(page)).filter((e) => e.n === 'tool_run')) for (const k of Object.keys(e.d)) expect(KEYS.has(k), `${e.n}.${k}`).toBe(true);
  await expect(page.locator('#erase-hint')).toContainText(/could not be downloaded/i);
});

/** The inpaint worker, replaced by one that dies when `window.__plan` says so (one entry per request; the last repeats). */
async function dyingWorker(page: Page, plan: ('ok' | 'die')[]) {
  await page.addInitScript((plan) => {
    const w = window as unknown as Win;
    w.__spawned = 0;
    w.__asked = 0;
    w.__plan = plan;
    const Real = window.Worker;
    window.Worker = class extends Real {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (/inpaint\.worker/.test(String(url))) w.__spawned++;
        else return;
        const post = this.postMessage.bind(this);
        this.postMessage = ((msg: unknown, t?: Transferable[]) => {
          const step = w.__plan[Math.min(w.__asked++, w.__plan.length - 1)];
          if (step === 'die') return void setTimeout(() => this.dispatchEvent(new ErrorEvent('error', { message: 'forced by the test' })), 0);
          post(msg, t as Transferable[]);
        }) as typeof this.postMessage;
      }
    } as typeof Worker;
  }, plan);
}

test('a worker that crashes is replaced and the same region is tried once more', async ({ page }) => {
  test.setTimeout(240_000);
  await recordEvents(page);
  await dyingWorker(page, ['die', 'ok']);
  await open(page, scene());
  await paint(page, SCENE_PATH, 60);
  await erase(page, 1);
  expect(await page.evaluate(() => (window as unknown as Win).__spawned)).toBe(2);
  expect(await runs(page)).toEqual([]);
});

test('a worker that crashes twice ends as WorkerCrashError', async ({ page }) => {
  await recordEvents(page);
  await dyingWorker(page, ['die']);
  await open(page, scene());
  await paint(page, SCENE_PATH, 60);
  await page.locator('#erase-go').click();
  await expect.poll(async () => (await runs(page)).length, { timeout: 60_000 }).toBe(1);
  expect((await runs(page))[0]).toMatchObject({ outcome: 'error', error_class: 'WorkerCrashError' });
  expect(await page.evaluate(() => (window as unknown as Win).__spawned)).toBe(2);
  await expect(page.locator('#erase-hint')).toContainText(/ran short of memory/i);
});

test.describe('a picture bigger than an iPhone can draw', () => {
  // An iPad or iPhone: a Mac user agent with a touch screen, as iPadOS Safari reports itself.
  test.use({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15' });

  test('is edited at the largest size that works, and says so', async ({ page }) => {
    test.setTimeout(300_000);
    await page.addInitScript(() => Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 }));
    await open(page, photo24());
    const hint = await page.locator('#erase-hint').textContent();
    const m = /Edited at (\d+) × (\d+), the largest picture this browser can draw/.exec(hint ?? '');
    expect(m, hint ?? '').not.toBeNull();
    expect(Number(m![1]) * Number(m![2])).toBeLessThanOrEqual(4096 * 4096);
    expect(Number(m![1]) / Number(m![2])).toBeCloseTo(5712 / 4284, 1);
    await paint(page, [[0.5, 0.5], [0.52, 0.5]], 80, 5712);
    await erase(page, 1);
    await page.locator('#run').click();
    await expect(page.locator('#results-list')).toContainText(/Edited at \d+ × \d+/, { timeout: 60_000 });
  });
});

/* The download itself, against a real server, so a stall can be a few hundred milliseconds. */
async function serve(handler: Parameters<typeof createServer>[1]): Promise<{ url: string; server: Server }> {
  const server = createServer(handler);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/m.bin`, server };
}
const BODY = Buffer.alloc(300_000, 7);

test.describe('model download (no browser)', () => {
  test('a body that stops sending is ModelDownloadStalled', async () => {
    const { url, server } = await serve((req, res) => {
      res.writeHead(200, { 'content-length': String(BODY.length) });
      res.write(BODY.subarray(0, 100_000));
      // never ends
    });
    try {
      await expect(fetchModelResumable(url, 'test model', BODY.length, () => {}, 300)).rejects.toMatchObject({ name: 'ModelDownloadStalled' });
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });

  test('an answer that never starts is ModelDownloadStalled', async () => {
    const { url, server } = await serve(() => {});
    try {
      await expect(fetchModelResumable(url, 'test model', BODY.length, () => {}, 300)).rejects.toMatchObject({ name: 'ModelDownloadStalled' });
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });

  test('HTTP 503, a refused connection and a file of the wrong size are ModelDownloadError', async () => {
    const down = await serve((req, res) => res.writeHead(503).end('down'));
    const wrong = await serve((req, res) => res.writeHead(200, { 'content-length': '10' }).end('0123456789'));
    try {
      await expect(fetchModelResumable(down.url, 'test model', BODY.length, () => {})).rejects.toMatchObject({ name: 'ModelDownloadError' });
      await expect(fetchModelResumable(wrong.url, 'test model', BODY.length, () => {})).rejects.toMatchObject({ name: 'ModelDownloadError' });
    } finally {
      for (const s of [down, wrong]) {
        s.server.closeAllConnections();
        s.server.close();
      }
    }
    await expect(fetchModelResumable(down.url, 'test model', BODY.length, () => {})).rejects.toMatchObject({ name: 'ModelDownloadError' });
  });

  test('a download cut part way is finished with a Range request and comes out whole', async () => {
    let first = true;
    const { url, server } = await serve((req, res) => {
      const range = /bytes=(\d+)-/.exec(req.headers.range ?? '');
      if (range) {
        const from = Number(range[1]);
        res.writeHead(206, { 'content-range': `bytes ${from}-${BODY.length - 1}/${BODY.length}`, 'content-length': String(BODY.length - from) }).end(BODY.subarray(from));
      } else if (first) {
        first = false;
        res.writeHead(200, { 'content-length': String(BODY.length) });
        res.write(BODY.subarray(0, 100_000), () => res.destroy());
      } else res.writeHead(200, { 'content-length': String(BODY.length) }).end(BODY);
    });
    try {
      const got = await fetchModelResumable(url, 'test model', BODY.length, () => {});
      expect(Buffer.from(got).equals(BODY)).toBe(true);
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });
});
