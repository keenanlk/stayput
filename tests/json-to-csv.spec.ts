import { test, expect, type Page } from '@playwright/test';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'json-csv-'));
const SECRET = 'Ada-Secret-Customer-9137';

const orders = [
  { id: 1, customer: { name: SECRET, email: 'ada@example.com' }, items: ['pen', 'ink'], note: 'say "hi", then\nleave' },
  { id: 2, customer: { name: 'Bob' }, items: [], total: 12.5 },
];
const jsonFile = join(dir, 'orders-private-name.json');
const csvFile = join(dir, 'people-private-name.csv');
const csvText = 'id,name,code\n1,"Smith, Ada",007\n2,Bob,true\n';

test.beforeAll(() => {
  writeFileSync(jsonFile, JSON.stringify(orders));
  writeFileSync(csvFile, csvText);
});

async function open(page: Page) {
  const errors: string[] = [];
  const requests: { url: string; method: string; body: string | null }[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('request', (r) => requests.push({ url: r.url(), method: r.method(), body: r.postData() }));
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: 'window.__events=[];window.umami={track:(n,d)=>window.__events.push({n,d})};' }),
  );
  await page.goto('/tools/json-to-csv');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  return { errors, requests };
}

async function convertNow(page: Page) {
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 60_000 });
}

async function downloaded(page: Page) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#results-list button', { hasText: 'Download' }).click()]);
  return { name: download.suggestedFilename(), bytes: readFileSync((await download.path())!) };
}

test('a dropped JSON file becomes a CSV with flattened columns, a BOM, a preview, Copy and Download', async ({ page }) => {
  const { errors } = await open(page);
  await page.setInputFiles('#file-input', jsonFile);
  await expect(page.locator('#jc-detected')).toContainText('JSON to CSV');
  await expect(page.locator('#jc-to-csv')).toBeVisible();
  await convertNow(page);
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  await expect(page.locator('.jc-table thead th')).toHaveText(['id', 'customer.name', 'customer.email', 'items', 'note', 'total']);
  await expect(page.locator('.jc-table tbody tr')).toHaveCount(2);
  await expect(page.locator('.jc-note').last()).toContainText('may run as formulas');
  const { name, bytes } = await downloaded(page);
  expect(name).toBe('orders-private-name.csv');
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  expect(bytes.toString('utf8').slice(1)).toBe(
    'id,customer.name,customer.email,items,note,total\r\n' +
      `1,${SECRET},ada@example.com,"[""pen"",""ink""]","say ""hi"", then\nleave",\r\n` +
      '2,Bob,,[],,12.5\r\n',
  );
  expect(errors).toEqual([]);
});

test('a dropped CSV file becomes JSON, and the options change the result', async ({ page }) => {
  await open(page);
  await page.setInputFiles('#file-input', csvFile);
  await expect(page.locator('#jc-detected')).toContainText('CSV to JSON');
  await expect(page.locator('#jc-to-json')).toBeVisible();
  await convertNow(page);
  await expect(page.locator('.jc-pre')).toContainText('"code": "007"');
  const first = await downloaded(page);
  expect(first.name).toBe('people-private-name.json');
  expect(JSON.parse(first.bytes.toString('utf8'))).toEqual([
    { id: '1', name: 'Smith, Ada', code: '007' },
    { id: '2', name: 'Bob', code: 'true' },
  ]);
  await page.locator('#jc-types').check();
  await page.locator('#jc-pretty').selectOption('min');
  await convertNow(page);
  const second = await downloaded(page);
  expect(second.bytes.toString('utf8')).toBe('[{"id":1,"name":"Smith, Ada","code":"007"},{"id":2,"name":"Bob","code":true}]');
});

test('pasted text converts either way, can be copied, and the direction can be overridden', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined);
  await open(page);
  await page.locator('#jc-text').fill('a;b\n1;2\n');
  await expect(page.locator('#jc-detected')).toContainText('CSV to JSON');
  await expect(page.locator('#tool')).toHaveAttribute('data-count', '1');
  await convertNow(page);
  await expect(page.locator('.jc-pre')).toContainText('"a": "1"');
  expect((await downloaded(page)).name).toBe('data.json');
  await page.locator('#jc-text').fill('[{"x":1,"y":"two"}]');
  await expect(page.locator('#jc-detected')).toContainText('JSON to CSV');
  await page.locator('input[name="direction"][value="json-to-csv"]').evaluate((el) => (el as HTMLInputElement).click());
  await page.locator('#jc-out-delimiter').selectOption(';');
  await page.locator('#jc-bom').uncheck();
  await page.locator('#jc-eol').selectOption('lf');
  await convertNow(page);
  const out = await downloaded(page);
  expect(out.name).toBe('data.csv');
  expect(out.bytes.toString('utf8')).toBe('x;y\n1;two\n');
  await page.locator('#jc-result button', { hasText: 'Copy' }).click();
  await expect(page.locator('#jc-result button', { hasText: /Copied|Copy failed/ })).toBeVisible();
});

test('bad JSON, bad CSV and a JSON with several lists give a message, not a crash', async ({ page }) => {
  const { errors } = await open(page);
  await page.locator('#jc-text').fill('[\n  {"a": 1},\n  {"a": }\n]');
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/);
  await expect(page.locator('#error')).toContainText(/Line 3/);

  await page.locator('#jc-text').fill('a,b\n1,"never closed\n');
  await page.locator('input[name="direction"][value="csv-to-json"]').evaluate((el) => (el as HTMLInputElement).click());
  await page.locator('#run').click();
  await expect(page.locator('#error')).toContainText(/Line 2, column 3: a quoted value is never closed/);

  await page.locator('#jc-text').fill('{"users":[{"n":"Ada"}],"orders":[{"id":7}]}');
  await page.locator('input[name="direction"][value="json-to-csv"]').evaluate((el) => (el as HTMLInputElement).click());
  await page.locator('#run').click();
  await expect(page.locator('#error')).toContainText('holds 2 lists');
  await expect(page.locator('#jc-which-field')).toBeVisible();
  await page.locator('#jc-which').selectOption('orders');
  await convertNow(page);
  await expect(page.locator('.jc-table thead th')).toHaveText(['id']);
  expect(errors.filter((e) => !/Failed to load resource|Line \d|never closed|holds \d|not valid JSON/.test(e))).toEqual([]);
});

test('a large file is converted in a worker, so the page keeps painting', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page);
  const rows = 400_000;
  const parts = ['id,name,city,note'];
  for (let i = 0; i < rows; i++) parts.push(`${i},"Name ${i}, Jr.",City ${i % 97},"line ""${i}"""`);
  const big = join(dir, 'big.csv');
  writeFileSync(big, parts.join('\n'));
  await page.setInputFiles('#file-input', big);
  await expect(page.locator('#jc-detected')).toContainText('CSV to JSON');
  // Count animation frames while the conversion runs; a blocked main thread would show a long gap.
  await page.evaluate(() => {
    const w = window as unknown as { __gap: number };
    w.__gap = 0;
    let last = performance.now();
    const tick = (t: number) => {
      w.__gap = Math.max(w.__gap, t - last);
      last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 100_000 });
  await expect(page.locator('.jc-stats')).toContainText('400,000 rows');
  const gap = await page.evaluate(() => (window as unknown as { __gap: number }).__gap);
  console.log(`largest gap between frames while converting ${rows} rows: ${Math.round(gap)} ms`);
  expect(gap).toBeLessThan(1500);
});

test('nothing leaves the tab: no request carries the data, and the usage ping holds no content or name', async ({ page }) => {
  const { requests } = await open(page);
  await page.setInputFiles('#file-input', jsonFile);
  await convertNow(page);
  await page.locator('#jc-text').fill(`name\n${SECRET}\n`);
  await convertNow(page);
  for (const r of requests) {
    if (r.url.startsWith('blob:') || r.url.startsWith('data:')) continue;
    const host = new URL(r.url).hostname;
    if (host === 'stats.keenankaufman.com') {
      for (const needle of [SECRET, 'orders-private-name', 'people-private-name', 'ada@example.com']) expect(r.body ?? '', r.url).not.toContain(needle);
      continue;
    }
    expect(host, r.url).toBe('localhost');
    expect(r.method, r.url).toBe('GET');
    expect(r.body, r.url).toBeNull();
    expect(r.url).not.toContain(SECRET);
  }
  const events = await page.evaluate(() => JSON.stringify((window as unknown as { __events: unknown[] }).__events));
  expect(events).not.toContain(SECRET);
  expect(events).not.toContain('private-name');
  expect(events).toContain('tool_run');
});
