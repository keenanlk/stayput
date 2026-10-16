// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// /txt-to-csv and /csv-to-txt are the JSON/CSV tool set to Change delimiter.
const tsv = 'date\tpayee\tnote\tamount\n2026-10-02\tCorner Cafe\t"lunch, two people"\t18.40\n2026-10-03\t"Books ""R"" Us"\t"two\nlines"\t42.00\n';
const tsvOut = 'date\tpayee\tnote\tamount\n2026-10-02\tCorner Cafe\tlunch, two people\t18.40\n2026-10-03\t"Books ""R"" Us"\t"two\nlines"\t42.00\n';
const csv = 'date,payee,note,amount\n2026-10-02,Corner Cafe,"lunch, two people",18.40\n2026-10-03,"Books ""R"" Us","two\nlines",42.00\n';

async function open(page: Page, path: string) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(path);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  return errors;
}

async function run(page: Page) {
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 60_000 });
}

async function download(page: Page) {
  const [d] = await Promise.all([page.waitForEvent('download'), page.locator('#results-list button', { hasText: 'Download' }).click()]);
  return { name: d.suggestedFilename(), text: readFileSync((await d.path())!, 'utf8') };
}

test('/txt-to-csv converts a dropped tab-separated .txt to a .csv with quoting', async ({ page }) => {
  const errors = await open(page, '/txt-to-csv');
  await expect(page).toHaveTitle('TXT to CSV Converter: Tab or Space Text, No Upload | Stayput');
  await expect(page.locator('h1')).toHaveText('Convert TXT to CSV');
  await expect(page.locator('#jc-delimited')).toBeVisible();
  await expect(page.locator('#jc-to-csv')).toBeHidden();
  await page.locator('#file-input').setInputFiles({ name: 'statement-private.txt', mimeType: 'text/plain', buffer: Buffer.from(tsv) });
  await expect(page.locator('#jc-detected')).toContainText('Looks tab-separated');
  await run(page);
  await expect(page.locator('.jc-table tbody tr')).toHaveCount(3);
  await expect(page.locator('.jc-stats')).toContainText('3 rows, 4 columns');
  const out = await download(page);
  expect(out.name).toBe('statement-private.csv');
  // CRLF between rows, and the line break inside the quoted cell kept as it was.
  expect(out.text).toBe('\uFEFFdate,payee,note,amount\r\n2026-10-02,Corner Cafe,"lunch, two people",18.40\r\n2026-10-03,"Books ""R"" Us","two\nlines",42.00\r\n');
  expect(errors).toEqual([]);
});

test('/csv-to-txt converts pasted CSV to tab-delimited .txt and /txt-to-csv reads it back', async ({ page }) => {
  await open(page, '/csv-to-txt');
  await expect(page).toHaveTitle('CSV to TXT Converter: Tab-Delimited Text, No Upload | Stayput');
  await expect(page.locator('h1')).toHaveText('Convert CSV to TXT');
  await expect(page.locator('#jc-d-to')).toHaveValue('\t');
  await page.locator('#jc-d-eol').selectOption('lf');
  await page.locator('#jc-text').fill(csv);
  await expect(page.locator('#jc-detected')).toContainText('Looks comma-separated');
  await run(page);
  const out = await download(page);
  expect(out.name).toBe('data.txt');
  expect(out.text).toBe(tsvOut);

  await open(page, '/txt-to-csv');
  await page.locator('#jc-d-eol').selectOption('lf');
  await page.locator('#jc-d-bom').uncheck();
  await page.locator('#file-input').setInputFiles({ name: 'back.txt', mimeType: 'text/plain', buffer: Buffer.from(out.text) });
  await run(page);
  expect((await download(page)).text).toBe(csv);
});

test('space-aligned text is split on runs of spaces and padded columns come back out', async ({ page }) => {
  await open(page, '/txt-to-csv');
  await page.locator('#jc-d-from').selectOption('spaces');
  await page.locator('#jc-d-eol').selectOption('lf');
  await page.locator('#jc-d-bom').uncheck();
  await page.locator('#jc-text').fill('item          qty  note\nCorner Cafe   2    "two  spaces"\n');
  await run(page);
  expect((await download(page)).text).toBe('item,qty,note\nCorner Cafe,2,two  spaces\n');
  await page.locator('#jc-d-from').selectOption(',');
  await page.locator('#jc-d-to').selectOption('padded');
  await page.locator('#jc-text').fill('item,qty,note\nCorner Cafe,2,"two  spaces"\n');
  await run(page);
  const padded = await download(page);
  expect(padded.name).toBe('data.txt');
  expect(padded.text).toBe('item         qty  note\nCorner Cafe  2    "two  spaces"\n');
});

test('empty and non-text input get a clear named error and no download', async ({ page }) => {
  await open(page, '/txt-to-csv');
  await page.locator('#file-input').setInputFiles({ name: 'empty.txt', mimeType: 'text/plain', buffer: Buffer.from('  \n\n') });
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/);
  await expect(page.locator('#error')).toContainText('nothing to convert');
  await page.locator('#clear').click();
  await page.locator('#file-input').setInputFiles({ name: 'photo.txt', mimeType: 'text/plain', buffer: Buffer.from([0x50, 0x4b, 3, 4, 0, 0, 0, 1, 2, 3]) });
  await page.locator('#run').click();
  await expect(page.locator('#error')).toContainText('not text');
  await expect(page.locator('#results-list button', { hasText: 'Download' })).toHaveCount(0);
});

test('each page has its own copy and links its neighbours; the JSON pages are unchanged', async ({ page }) => {
  await page.goto('/txt-to-csv');
  await expect(page.locator('.prose-wide')).toContainText('Why Excel shows a .txt export as one column');
  for (const href of ['/csv-to-txt', '/csv-to-json', '/tools/json-to-csv']) expect(await page.locator(`main a[href="${href}"]`).count(), href).toBeGreaterThan(0);
  await page.goto('/csv-to-txt');
  await expect(page.locator('.prose-wide')).toContainText('tab-delimited .txt');
  await expect(page.locator('.prose-wide')).not.toContainText('Why Excel shows a .txt export as one column');
  for (const href of ['/txt-to-csv', '/csv-to-json', '/tools/json-to-csv']) expect(await page.locator(`main a[href="${href}"]`).count(), href).toBeGreaterThan(0);
  await open(page, '/csv-to-json');
  await expect(page.locator('#jc-to-json')).toBeVisible();
  await expect(page.locator('#jc-delimited')).toBeHidden();
});

test('both pages are in the sitemap with a committed social image', async ({ page }) => {
  const xml = await (await page.request.get('/sitemap-0.xml')).text();
  for (const slug of ['txt-to-csv', 'csv-to-txt']) {
    expect(xml).toContain(`https://stayput.dev/${slug}`);
    expect((await page.request.get(`/og/${slug}.png`)).status()).toBe(200);
  }
});
