// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

// A failed run records only the error's class name (error_class). A plain `new Error(...)` is just "Error",
// so its cause cannot be told apart from any other: every throw in src/ uses a named class instead.

const SRC = fileURLToPath(new URL('../src', import.meta.url));

/** Files that may use a plain Error, each with the reason. None of them run during a tool run. */
const ALLOWED: Record<string, string> = {
  'src/lib/search-ui.ts': 'site search box, not a tool run',
  'src/lib/lastmod.ts': 'build-time lookup, runs while the site is built',
  'src/tools/landing.ts': 'build-time check that a landing page has a tool module',
  'src/pages/sw.js.ts': 'service worker cache fill, not a tool run',
  'src/pages/index.astro': 'build-time check of the home page tiles',
  'src/pages/[landing].astro': 'build-time check of the landing page options',
  'src/data/leads.ts': 'build-time check of the lead sentences',
  'src/data/presets.ts': 'build-time check that a preset names a real tool',
};

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx|js|astro)$/.test(f) ? [p] : [];
  });
}

/** Every `new Error(` or `Error(` call (not `new SomeError(`) outside comments. */
export function bareErrors(source: string): number[] {
  const hits: number[] = [];
  source.split('\n').forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '');
    if (/^\s*\*|^\s*\/\*/.test(line)) return;
    if (/(?<![A-Za-z0-9_$.])(?:new\s+)?Error\s*\(/.test(code)) hits.push(i + 1);
  });
  return hits;
}

test('no plain Error is thrown in src/, outside the listed build-time files', () => {
  const found: string[] = [];
  for (const file of walk(SRC)) {
    const rel = 'src/' + relative(SRC, file).replace(/\\/g, '/');
    if (ALLOWED[rel]) continue;
    for (const line of bareErrors(readFileSync(file, 'utf8'))) found.push(`${rel}:${line}`);
  }
  expect(found, 'Use InputError, UnreadableFile, StageError or NamedError from src/lib/input-error.ts so the failed run records a class name').toEqual([]);
});

test('the check catches a bare Error', () => {
  expect(bareErrors("throw new Error('x');")).toEqual([1]);
  expect(bareErrors("throw Error('x');")).toEqual([1]);
  expect(bareErrors("throw new NamedError('Name', 'x'); // new Error('no')")).toEqual([]);
  expect(bareErrors("class A extends Error { constructor() { super('x'); } }")).toEqual([]);
});

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
const lastRun = (page: Page) => page.evaluate(() => (JSON.parse(sessionStorage.getItem('__ev') || '[]') as Ev[]).filter((e) => e.n === 'tool_run').at(-1)?.d);

// Bytes that are no video at all, so each video tool fails on its first step.
const WAV = Buffer.alloc(4096, 7);
for (const slug of ['play-video-backwards', 'remove-background-noise-from-video']) {
  test(`${slug}: a failed run records a class name, not "Error"`, async ({ page }) => {
    test.setTimeout(120_000);
    await stubAnalytics(page);
    await page.goto(`/${slug}`);
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    await page.locator('#file-input').setInputFiles({ name: 'clip.mp4', mimeType: 'video/mp4', buffer: WAV });
    await page.locator('#run').click();
    await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 90_000 });
    const run = await lastRun(page);
    expect(run?.outcome).toBe('error');
    expect(run?.error_class).toMatch(/^[A-Z][A-Za-z0-9]+$/);
    expect(run?.error_class).not.toBe('Error');
  });
}

test('remove-text-from-image: a model that cannot be downloaded records ModelDownloadError', async ({ page }) => {
  test.setTimeout(120_000);
  await stubAnalytics(page);
  await page.route('**/models/**/*.onnx', (route) => route.fulfill({ status: 404, body: 'gone' }));
  await page.goto('/remove-text-from-image');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(fileURLToPath(new URL('./fixtures/generated/photo.jpg', import.meta.url)));
  await expect(page.locator('#erase-panel')).toBeVisible();
  const canvas = page.locator('#erase-canvas');
  await canvas.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const b = (await canvas.boundingBox())!;
  await page.mouse.move(b.x + b.width * 0.4, b.y + b.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.5, { steps: 4 });
  await page.mouse.up();
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 60_000 });
  const run = await lastRun(page);
  expect(run?.outcome).toBe('error');
  expect(run?.error_class).toBe('ModelDownloadError');
});
