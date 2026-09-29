import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const fx = (name: string) => fileURLToPath(new URL(`./fixtures/generated/${name}`, import.meta.url));

type Ev = { n: string; d: Record<string, string> };

/** Every property an event may carry. Anything else is a privacy regression. */
const ALLOWED = new Set([
  'tool', 'outcome', 'files', 'input', 'output', 'duration', 'attempt',
  'landing', 'ref', 'from', 'visit', 'prev_tool', 'run_n', 'tools_used', 'run_gap', 'ns', 'to', 'format', 'error_class', 'page', 'kind', 'rank', 'via',
]);

/** Replace Umami with a stub that keeps events in sessionStorage so they survive navigation. */
async function stub(page: Page) {
  // The site skips analytics in automated browsers; pretend to be a person so the stub loads.
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const k='__ev';const a=JSON.parse(sessionStorage.getItem(k)||'[]');a.push({n,d});sessionStorage.setItem(k,JSON.stringify(a));}};`,
    }),
  );
}
const events = (page: Page): Promise<Ev[]> => page.evaluate(() => JSON.parse(sessionStorage.getItem('__ev') || '[]'));

async function runTool(page: Page, path: string, file: string) {
  await page.goto(path);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(fx(file));
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 60_000 });
  // tool_run is sent after results render.
  await expect.poll(async () => (await events(page)).filter((e) => e.n === 'tool_run').length).toBeGreaterThan(0);
}

function assertPrivate(all: Ev[], fileNames: string[]) {
  for (const e of all) {
    for (const [k, v] of Object.entries(e.d)) {
      expect(ALLOWED.has(k), `${e.n} carries unexpected property ${k}`).toBe(true);
      expect(typeof v).toBe('string');
      expect(String(v).length, `${e.n}.${k}`).toBeLessThan(80);
      for (const name of fileNames) {
        const stem = name.replace(/\.[^.]+$/, '');
        expect(String(v), `${e.n}.${k} must not name the file`).not.toContain(name);
        expect(String(v), `${e.n}.${k} must not name the file`).not.toContain(stem);
      }
    }
  }
}

test('a guide-to-tool journey records the funnel and the next tool, without file names', async ({ page }) => {
  await stub(page);
  await page.goto('/guides/what-is-exif-data');
  await expect.poll(async () => (await events(page)).length).toBe(1);
  expect((await events(page))[0]).toEqual({ n: 'visit_start', d: { landing: '/guides/what-is-exif-data', ref: 'direct', visit: 'new' } });

  await runTool(page, '/tools/strip-exif', 'photo.jpg');
  // Pick the files_added and tool_run for strip-exif: after a visit_start that must not repeat.
  let all = await events(page);
  expect(all.map((e) => e.n)).toEqual(['visit_start', 'files_added', 'tool_run']);
  expect(all[1]!.d).toMatchObject({ tool: 'strip-exif', files: '1', landing: '/guides/what-is-exif-data', ref: 'direct', from: '/guides/what-is-exif-data', visit: 'new' });
  expect(all[2]!.d).toMatchObject({ tool: 'strip-exif', outcome: 'ok', attempt: 'first-ok', prev_tool: '(none)', run_n: '1', tools_used: '1', run_gap: 'new' });

  await runTool(page, '/compress-jpg', 'big.jpg');
  all = await events(page);
  const run2 = all.filter((e) => e.n === 'tool_run')[1]!;
  expect(run2.d).toMatchObject({ tool: 'compress-jpg', outcome: 'ok', from: '/tools/strip-exif', prev_tool: 'strip-exif', run_n: '2', tools_used: '2', run_gap: 'same-day' });

  // Running again with the same files is a repeat, not a new completed attempt.
  await page.locator('#run').click();
  await expect.poll(async () => (await events(page)).filter((e) => e.n === 'tool_run').length).toBe(3);
  all = await events(page);
  expect(all.filter((e) => e.n === 'files_added')).toHaveLength(2);
  expect(all.at(-1)!.d).toMatchObject({ attempt: 'repeat', run_n: '3+' });

  assertPrivate(all, ['photo.jpg', 'big.jpg']);
});

test('a returning visitor is bucketed by days since the last visit and last run', async ({ page }) => {
  await stub(page);
  await page.goto('/');
  const past = await page.evaluate(() => {
    const d = new Date();
    d.setDate(d.getDate() - 3);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    localStorage.setItem('stayput:local', JSON.stringify({ lastVisit: day, lastRun: day, tools: ['merge-pdf'] }));
    sessionStorage.clear();
    return day;
  });
  expect(past).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await runTool(page, '/tools/strip-exif', 'photo.jpg');
  const all = await events(page);
  expect(all[0]).toEqual({ n: 'visit_start', d: { landing: '/tools/strip-exif', ref: 'direct', visit: '2-7d' } });
  expect(all.find((e) => e.n === 'tool_run')!.d).toMatchObject({ visit: '2-7d', run_gap: '2-7d', tools_used: '2' });
  // The device now remembers today, and nothing about the file.
  const local = await page.evaluate(() => localStorage.getItem('stayput:local'));
  expect(local).not.toContain('photo');
  assertPrivate(all, ['photo.jpg']);
});

test('the referring site is reduced to a known name', async ({ page }) => {
  const { sourceOf } = await import('../src/lib/journey.ts');
  expect(sourceOf('', 'stayput.dev')).toBe('direct');
  expect(sourceOf('https://www.google.com/', 'stayput.dev')).toBe('google');
  expect(sourceOf('https://old.reddit.com/r/privacy/comments/abc/some_title/', 'stayput.dev')).toBe('reddit');
  expect(sourceOf('https://news.ycombinator.com/item?id=1', 'stayput.dev')).toBe('hackernews');
  expect(sourceOf('https://someones-blog.example/post', 'stayput.dev')).toBe('other');
  expect(sourceOf('https://stayput.dev/guides', 'stayput.dev')).toBe('internal');
  void page;
});

/** Pin the experiment arm by fixing Math.random for the page (arm "on" below 0.5). */
async function arm(page: Page, value: 'on' | 'off') {
  await page.addInitScript((r) => {
    Math.random = () => r;
  }, value === 'on' ? 0.1 : 0.9);
}

test('E2 "on" arm shows next steps after a job and counts the click', async ({ page }) => {
  await stub(page);
  await arm(page, 'on');
  await runTool(page, '/tools/strip-exif', 'photo.jpg');
  const box = page.locator('#next-steps');
  await expect(box).toBeVisible();
  await expect(box.locator('a')).toHaveText(['Compress & Resize Images', 'Crop image']);
  expect((await events(page)).find((e) => e.n === 'tool_run')!.d).toMatchObject({ tool: 'strip-exif', ns: 'on' });
  await box.locator('a[data-to="compress-image"]').click();
  await expect(page).toHaveURL(/\/tools\/compress-image$/);
  const all = await events(page);
  expect(all.find((e) => e.n === 'next_step')!.d).toEqual({ tool: 'strip-exif', to: 'compress-image', ns: 'on' });
  // A new job hides the box until it finishes.
  await expect(page.locator('#next-steps')).toBeHidden();
  assertPrivate(all, ['photo.jpg']);
});

test('E2 "off" arm never shows next steps, and landing pages suggest by their base tool', async ({ page }) => {
  await stub(page);
  await arm(page, 'off');
  await runTool(page, '/compress-jpg', 'big.jpg');
  await expect(page.locator('#next-steps')).toBeHidden();
  await expect(page.locator('#next-steps a')).toHaveText(['Remove EXIF Data', 'Image to PDF']);
  expect((await events(page)).find((e) => e.n === 'tool_run')!.d).toMatchObject({ tool: 'compress-jpg', ns: 'off' });
});

test('automated browsers and opted-out browsers load no analytics at all', async ({ page }) => {
  const hits: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('stats.keenankaufman.com')) hits.push(r.url());
  });
  // Playwright sets navigator.webdriver, like every automation tool.
  await page.goto('/tools/strip-exif');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(fx('photo.jpg'));
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/);
  await page.waitForLoadState('load');
  expect(hits).toEqual([]);
  expect(await page.evaluate(() => 'umami' in window)).toBe(false);
});

test('#notrack opts this browser out and #track opts it back in', async ({ page }) => {
  await stub(page);
  page.on('dialog', (d) => void d.accept());
  const hits: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('stats.keenankaufman.com')) hits.push(r.url());
  });
  await page.goto('/#notrack');
  await expect(page).toHaveURL(/\/$/);
  expect(await page.evaluate(() => localStorage.getItem('umami.disabled'))).toBe('1');
  await page.goto('/guides');
  expect(hits).toEqual([]);
  await page.goto('/#track');
  expect(await page.evaluate(() => localStorage.getItem('umami.disabled'))).toBeNull();
  await expect.poll(() => hits.length).toBeGreaterThan(0);
});

test('the image converter reports the output format picked, and nothing about the file', async ({ page }) => {
  await stub(page);
  await page.goto('/tools/convert-image');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#format').selectOption('image/x-icon');
  await page.locator('#file-input').setInputFiles(fx('graphic.png'));
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 60_000 });
  await expect.poll(async () => (await events(page)).filter((e) => e.n === 'tool_run').length).toBe(1);
  const all = await events(page);
  expect(all.find((e) => e.n === 'tool_run')!.d.format).toBe('ico');
  assertPrivate(all, ['graphic.png']);
});

test('a failed run reports a bare error class, never the error message or file name', async ({ page }) => {
  await stub(page);
  await page.goto('/tools/merge-pdf');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  const notReallyAPdf = {
    name: 'definitely-not-a-real-pdf-secret-name.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('this is not pdf bytes'),
  };
  await page.locator('#file-input').setInputFiles([notReallyAPdf, notReallyAPdf]);
  await page.locator('#run').click();
  await expect.poll(async () => (await events(page)).filter((e) => e.n === 'tool_run').length).toBe(1);
  const all = await events(page);
  const run = all.find((e) => e.n === 'tool_run')!;
  expect(run.d.outcome).toBe('error');
  expect(run.d.error_class).toBeTruthy();
  // A bare JS error name (e.g. "Error", "TypeError"), never a message or the file name.
  expect(run.d.error_class).toMatch(/^[A-Za-z]+$/);
  assertPrivate(all, ['definitely-not-a-real-pdf-secret-name.pdf']);
});

test('a header search pick is counted with its destination only, and the run it leads to carries via=search', async ({ page }) => {
  await stub(page);
  await page.goto('/about');
  await page.keyboard.press('/');
  const input = page.getByRole('combobox', { name: 'Search tools' });
  await input.fill('remove gps');
  await expect(page.getByRole('option').first()).toContainText('Remove EXIF Data');
  await input.press('Enter');
  await expect(page).toHaveURL(/\/tools\/strip-exif$/);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(fx('photo.jpg'));
  await page.locator('#run').click();
  await expect.poll(async () => (await events(page)).filter((e) => e.n === 'tool_run').length).toBe(1);
  let all = await events(page);
  expect(all.find((e) => e.n === 'search_open')!.d).toEqual({ page: '/about' });
  expect(all.find((e) => e.n === 'search_pick')!.d).toEqual({ to: '/tools/strip-exif', kind: 'tool', rank: '1' });
  expect(all.find((e) => e.n === 'files_added')!.d).toMatchObject({ via: 'search' });
  expect(all.find((e) => e.n === 'tool_run')!.d).toMatchObject({ via: 'search' });
  for (const e of all) expect(JSON.stringify(e.d)).not.toContain('gps');

  // The next page was not reached through search.
  await runTool(page, '/compress-jpg', 'big.jpg');
  all = await events(page);
  expect(all.filter((e) => e.n === 'tool_run')[1]!.d.via).toBeUndefined();
  assertPrivate(all, ['photo.jpg', 'big.jpg']);
});
