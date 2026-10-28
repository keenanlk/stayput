// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

/**
 * Failures that analytics could not see: a preview that fails before Run, a tab that dies or is left mid-work, a run or a
 * model download that stops moving, and the two buttons that used to drop their errors (Erase, Trim white margins).
 * Each ends as one tool_run with outcome "error" and a named error_class, and nothing else about the file.
 */
const edge = (name: string) => fileURLToPath(new URL(`./fixtures/edge-cases/${name}`, import.meta.url));
const stat = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));
const KEYS = new Set(['tool', 'outcome', 'attempt', 'files', 'input', 'output', 'duration', 'format', 'error_class', 'landing', 'ref', 'from', 'visit', 'prev_tool', 'run_n', 'tools_used', 'run_gap', 'ns', 'via']);
type Ev = { n: string; d: Record<string, string> };

async function recordEvents(page: Page) {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const k='__ev';const a=JSON.parse(sessionStorage.getItem(k)||'[]');a.push({n,d});sessionStorage.setItem(k,JSON.stringify(a));}};`,
    }),
  );
}
const events = (page: Page): Promise<Ev[]> => page.evaluate(() => JSON.parse(sessionStorage.getItem('__ev') || '[]'));
const runs = async (page: Page) => (await events(page)).filter((e) => e.n === 'tool_run').map((e) => e.d);
const marker = (page: Page) => page.evaluate(() => sessionStorage.getItem('stayput:inflight'));
const ready = (page: Page) => expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');

async function drop(page: Page, file: string | { name: string; mimeType: string; buffer: Buffer }) {
  await page.locator('#file-input').setInputFiles(file);
}

/** Every key of every event stays within the documented set, and nothing carries a file name or a path. */
async function expectOnlyKnownKeys(page: Page) {
  for (const e of await events(page)) {
    for (const k of Object.keys(e.d)) expect(KEYS.has(k), `${e.n}.${k}`).toBe(true);
    expect(JSON.stringify(e.d)).not.toMatch(/\.(jpe?g|pdf|png)/i);
  }
}

for (const [slug, path] of [
  ['instagram-carousel-splitter', '/instagram-carousel-splitter'],
  ['image-to-pixel-art', '/image-to-pixel-art'],
] as const) {
  test(`${path}: a picture that cannot be read records one Preview error per attempt`, async ({ page }) => {
    await recordEvents(page);
    await page.goto(path);
    await ready(page);
    await drop(page, edge('garbage.jpg'));
    await expect(page.locator('#error')).toHaveClass(/is-active/);
    await expect.poll(async () => (await runs(page)).length).toBe(1);
    const [r] = await runs(page);
    expect(r).toMatchObject({ tool: slug, outcome: 'error' });
    expect(r!.error_class).toMatch(/^Preview[A-Za-z0-9]+$/);
    expect(r!.error_class!.length).toBeLessThanOrEqual(40);
    expect(r!.error_class).not.toBe('Preview');
    // The same attempt (no clear, no success) does not send a second one.
    await drop(page, edge('garbage.jpg'));
    await page.waitForTimeout(500);
    expect(await runs(page)).toHaveLength(1);
    // A new attempt does.
    await page.locator('#clear').click();
    await drop(page, edge('garbage.jpg'));
    await expect.poll(async () => (await runs(page)).length).toBe(2);
    expect(await marker(page)).toBeNull();
    await expectOnlyKnownKeys(page);
  });
}

test('/crop-pdf: a damaged PDF records a Preview error', async ({ page }) => {
  await recordEvents(page);
  await page.goto('/tools/crop-pdf');
  await ready(page);
  await drop(page, { name: 'broken-xref.pdf', mimeType: 'application/pdf', buffer: Buffer.concat([readFileSync(edge('good.pdf')).subarray(0, 600), Buffer.alloc(900, 7)]) });
  await expect(page.locator('#error')).toHaveClass(/is-active/);
  await expect.poll(async () => (await runs(page)).length).toBe(1);
  const [r] = await runs(page);
  expect(r).toMatchObject({ tool: 'crop-pdf', outcome: 'error' });
  expect(r!.error_class).toMatch(/^Preview[A-Za-z0-9]+$/);
  await expectOnlyKnownKeys(page);
});

test('crop-pdf: a page that cannot be drawn during Trim shows a message and records PreviewCanvasUnavailable', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await recordEvents(page);
  await page.goto('/tools/crop-pdf');
  await ready(page);
  await drop(page, edge('good.pdf'));
  await expect(page.locator('#crop-panel')).toBeVisible();
  await expect(page.locator('#crop-panel')).toContainText(/Page 1 of/);
  // Off-screen canvases (the ones a page is drawn to before it is shown) lose their 2D context; the page canvas keeps its own.
  await page.evaluate(() => {
    const real = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...a: Parameters<typeof real>) {
      return this.isConnected ? real.apply(this, a) : null;
    } as typeof real;
  });
  await page.locator('#auto-trim').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/);
  await expect.poll(async () => (await runs(page)).map((r) => r.error_class)).toEqual(['PreviewCanvasUnavailable']);
  expect(pageErrors).toEqual([]);
});

test.describe('a tab that died mid-work', () => {
  const plant = (page: Page, m: Record<string, unknown>) =>
    page.addInitScript((m) => {
      if (!sessionStorage.getItem('__planted')) {
        sessionStorage.setItem('__planted', '1');
        sessionStorage.setItem('stayput:inflight', JSON.stringify(m));
      }
    }, m);

  for (const [name, m, cls] of [
    ['during a run', { phase: 'run', hidden: false }, 'TabLostDuringRun'],
    ['during a preview', { phase: 'preview', hidden: false }, 'TabLostDuringPreview'],
    ['while hidden', { phase: 'run', hidden: true }, 'TabLostWhileHidden'],
  ] as const) {
    test(`${name} records ${cls} once and clears the marker`, async ({ page }) => {
      await recordEvents(page);
      await plant(page, { tool: 'split-image', t: Date.now(), ...m });
      await page.goto('/tools/split-image');
      await ready(page);
      expect(await runs(page)).toMatchObject([{ tool: 'split-image', outcome: 'error', error_class: cls }]);
      expect(await marker(page)).toBeNull();
      await page.reload();
      await ready(page);
      expect(await runs(page)).toHaveLength(1);
      await expectOnlyKnownKeys(page);
    });
  }

  test('a marker 20 minutes old records nothing', async ({ page }) => {
    await recordEvents(page);
    await plant(page, { tool: 'split-image', phase: 'run', hidden: false, t: Date.now() - 20 * 60_000 });
    await page.goto('/tools/split-image');
    await ready(page);
    expect(await runs(page)).toEqual([]);
    expect(await marker(page)).toBeNull();
  });
});

test('a normal run leaves no marker', async ({ page }) => {
  await recordEvents(page);
  await page.goto('/tools/split-image');
  await ready(page);
  await drop(page, stat('frenchie.jpg'));
  const done = page.locator('#tool').evaluate((el) => new Promise<void>((r) => el.addEventListener('stayput:done', () => r(), { once: true })));
  await expect(page.locator('#run')).toBeEnabled();
  await page.locator('#run').click();
  await done;
  expect(await marker(page)).toBeNull();
  expect((await runs(page)).map((r) => r.outcome)).toEqual(['ok']);
});

test('leaving the page during a run records LeftDuringRun', async ({ page }) => {
  await recordEvents(page);
  await page.addInitScript(() => {
    const real = window.createImageBitmap.bind(window);
    window.createImageBitmap = ((...a: Parameters<typeof real>) => ((window as unknown as { __hang?: boolean }).__hang ? new Promise(() => {}) : real(...a))) as typeof real;
  });
  await page.goto('/tools/split-image');
  await ready(page);
  await drop(page, stat('frenchie.jpg'));
  await expect(page.locator('#run')).toBeEnabled();
  await page.evaluate(() => ((window as unknown as { __hang?: boolean }).__hang = true));
  await page.locator('#run').click();
  await expect.poll(() => marker(page)).toContain('"phase":"run"');
  await page.goto('/');
  expect((await runs(page)).map((r) => r.error_class)).toEqual(['LeftDuringRun']);
  expect(await marker(page)).toBeNull();
});

async function paintStroke(page: Page) {
  const canvas = page.locator('#erase-canvas');
  await canvas.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const b = (await canvas.boundingBox())!;
  await page.mouse.move(b.x + b.width * 0.4, b.y + b.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.5, { steps: 4 });
  await page.mouse.up();
}

test('Erase: a model that cannot be downloaded records ModelDownloadError, and no ok run', async ({ page }) => {
  await recordEvents(page);
  await page.route('**/models/migan-pipeline-v2.onnx', (r) => r.fulfill({ status: 503, body: 'down' }));
  await page.goto('/remove-text-from-image');
  await ready(page);
  await drop(page, stat('frenchie.jpg'));
  await expect(page.locator('#erase-panel')).toBeVisible();
  await paintStroke(page);
  await page.locator('#erase-go').click();
  await expect.poll(async () => (await runs(page)).length).toBe(1);
  expect(await runs(page)).toMatchObject([{ tool: 'remove-text-from-image', outcome: 'error', error_class: 'ModelDownloadError' }]);
  expect(await marker(page)).toBeNull();
});

test('Erase: a model download that stops sending bytes is called ModelDownloadStalled', async ({ page }) => {
  test.setTimeout(150_000);
  await recordEvents(page);
  // Never answered: the worker's own 45 s no-bytes limit has to end the wait (it runs in real time, not on the page clock).
  await page.route('**/models/migan-pipeline-v2.onnx', () => {});
  await page.goto('/remove-text-from-image');
  await ready(page);
  await drop(page, stat('frenchie.jpg'));
  await expect(page.locator('#erase-panel')).toBeVisible();
  await paintStroke(page);
  await page.locator('#erase-go').click();
  await expect.poll(async () => (await runs(page)).length, { timeout: 90_000 }).toBe(1);
  expect((await runs(page))[0]).toMatchObject({ outcome: 'error', error_class: 'ModelDownloadStalled' });
  await expect(page.locator('#erase-hint')).toContainText(/stalled/i);
});
