import { test, expect, type Page } from '@playwright/test';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'csv-to-json-'));
const csvText = 'id,name,qty,active\n00123,Ada Lovelace,3,true\n00124,"Hopper, Grace",12,false';
const csvFile = join(dir, 'people-private-name.csv');
const expected = [
  { id: '00123', name: 'Ada Lovelace', qty: '3', active: 'true' },
  { id: '00124', name: 'Hopper, Grace', qty: '12', active: 'false' },
];

test.beforeAll(() => writeFileSync(csvFile, csvText));

async function open(page: Page, path = '/csv-to-json') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(path);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  return errors;
}

async function convertNow(page: Page) {
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 60_000 });
}

test('/csv-to-json shows the CSV to JSON options before any input, with Auto still selected', async ({ page }) => {
  const errors = await open(page);
  await expect(page.locator('h1')).toHaveText('Convert CSV to JSON');
  await expect(page.locator('#jc-to-json')).toBeVisible();
  await expect(page.locator('#jc-to-csv')).toBeHidden();
  await expect(page.locator('#jc-headers')).toBeChecked();
  await expect(page.locator('#jc-types')).not.toBeChecked();
  await expect(page.locator('input[name="direction"][value="auto"]')).toBeChecked();
  expect(errors).toEqual([]);
});

test('pasted CSV becomes the JSON array from the worked example', async ({ page }) => {
  const errors = await open(page);
  await page.locator('#jc-text').fill(csvText);
  await expect(page.locator('#jc-detected')).toContainText('CSV to JSON');
  await convertNow(page);
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  const preview = await page.locator('.jc-pre').textContent();
  expect(JSON.parse(preview!)).toEqual(expected);
  await expect(page.locator('.jc-stats')).toContainText('2 rows, 4 keys');
  expect(errors).toEqual([]);
});

test('a dropped CSV file is converted and downloads as .json', async ({ page }) => {
  await open(page);
  await page.setInputFiles('#file-input', csvFile);
  await expect(page.locator('#jc-to-json')).toBeVisible();
  await convertNow(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#results-list button', { hasText: 'Download' }).click()]);
  expect(download.suggestedFilename()).toBe('people-private-name.json');
  expect(JSON.parse(readFileSync((await download.path())!, 'utf8'))).toEqual(expected);
});

test('Detect types turns qty and active into values and keeps 00123 as text', async ({ page }) => {
  await open(page);
  await page.locator('#jc-text').fill(csvText);
  await page.locator('#jc-types').check();
  await convertNow(page);
  const rows = JSON.parse((await page.locator('.jc-pre').textContent())!);
  expect(rows[0]).toEqual({ id: '00123', name: 'Ada Lovelace', qty: 3, active: true });
});

test('pasting JSON on /csv-to-json flips the page to the JSON to CSV options', async ({ page }) => {
  await open(page);
  await page.locator('#jc-text').fill('[{"a":1,"b":"x"}]');
  await expect(page.locator('#jc-detected')).toContainText('JSON to CSV');
  await expect(page.locator('#jc-to-csv')).toBeVisible();
  await expect(page.locator('#jc-to-json')).toBeHidden();
  await page.locator('#jc-text').fill('');
  await expect(page.locator('#jc-to-json')).toBeVisible();
});

test('the json-to-csv tool page still starts on JSON to CSV and converts', async ({ page }) => {
  await open(page, '/tools/json-to-csv');
  await expect(page.locator('#jc-to-csv')).toBeVisible();
  await expect(page.locator('#jc-to-json')).toBeHidden();
  await page.locator('#jc-text').fill('[{"a":1,"b":"x"}]');
  await convertNow(page);
  await expect(page.locator('.jc-table thead th')).toHaveText(['a', 'b']);
});
