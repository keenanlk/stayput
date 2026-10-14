// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { unzipSync } from 'fflate';

const FILES = [
  { name: 'Holiday Photo.JPG', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5]) },
  { name: 'budget_2024.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('PK budget bytes 0123456789') },
  { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Remember the milk. '.repeat(20)) },
  { name: 'Holiday Video.mp4', mimeType: 'video/mp4', buffer: Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 9, 8, 7]) },
];

async function open(page: Page) {
  const errors: string[] = [];
  const requests: { url: string; body: string | null }[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => requests.push({ url: r.url(), body: r.postData() }));
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: 'window.__events=[];window.umami={track:(n,d)=>window.__events.push({n,d})};' }),
  );
  await page.goto('/tools/rename-files');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  return { errors, requests };
}

const newNames = (page: Page) => page.locator('#rn-rows tr td:nth-child(2)').allTextContents();

async function download(page: Page) {
  const [d] = await Promise.all([page.waitForEvent('download'), page.locator('#run').click()]);
  expect(d.suggestedFilename()).toBe('renamed-files.zip');
  return unzipSync(new Uint8Array(readFileSync((await d.path())!)));
}

test('renames with prefix, numbering, find/replace and case, and the ZIP matches the preview', async ({ page }) => {
  const { errors, requests } = await open(page);
  await page.locator('#file-input').setInputFiles(FILES);
  await expect(page.locator('#rn-rows tr')).toHaveCount(4);
  // No options yet: names are unchanged.
  expect(await newNames(page)).toEqual(FILES.map((f) => f.name));

  await page.locator('#rn-prefix').fill('trip-');
  await page.locator('#rn-find').fill('holiday');
  await page.locator('#rn-replace').fill('beach');
  await page.locator('#rn-number').check();
  await page.locator('#rn-start').fill('7');
  await page.locator('#rn-pad').fill('3');
  await page.locator('label:has(input[name="rn-casing"][value="lower"])').click();
  const expected = ['trip-beach photo 007.jpg', 'trip-budget_2024 008.xlsx', 'trip-notes 009.txt', 'trip-beach video 010.mp4'];
  // The extension keeps its original case: lower-casing applies to the name part only.
  const preview = await newNames(page);
  expect(preview.map((n) => n.toLowerCase())).toEqual(expected.map((n) => n.toLowerCase()));
  expect(preview[0]).toBe('trip-beach photo 007.JPG');
  expect(preview[1]).toBe('trip-budget_2024 008.xlsx');

  const zip = await download(page);
  expect(Object.keys(zip)).toEqual(preview);
  FILES.forEach((f, i) => expect(Buffer.from(zip[preview[i]!]!).equals(f.buffer)).toBe(true));

  // Analytics events hold the tool slug, counts and size buckets only: no names, no pattern text.
  const events = await page.evaluate(() => (window as unknown as { __events: { n: string; d: Record<string, string | number> }[] }).__events);
  console.log('EVENTS', JSON.stringify(events));
  const allowed = ['tool', 'files', 'input', 'output', 'duration', 'outcome', 'format', 'attempt', 'landing', 'ref', 'from', 'visit', 'prev_tool', 'run_n', 'tools_used', 'run_gap', 'ns', 'via'];
  expect(events.some((e) => e.n === 'tool_run')).toBe(true);
  for (const e of events) {
    expect(Object.keys(e.d ?? {}).filter((k) => !allowed.includes(k))).toEqual([]);
    const text = JSON.stringify(e);
    for (const s of [...FILES.map((f) => f.name.split('.')[0]!), 'trip-', 'beach', 'budget']) expect(text).not.toContain(s);
  }

  // Number first, title case, case-sensitive find that does not match.
  await page.locator('label:has(input[name="rn-place"][value="before"])').click();
  await page.locator('label:has(input[name="rn-casing"][value="title"])').click();
  await page.locator('#rn-case-sensitive').check();
  await expect.poll(() => newNames(page)).toEqual(['trip-007 Holiday Photo.JPG', 'trip-008 Budget_2024.xlsx', 'trip-009 Notes.txt', 'trip-010 Holiday Video.mp4']);
  await page.locator('#rn-keep-ext').uncheck();
  await expect.poll(async () => (await newNames(page))[2]).toBe('trip-009 Notes.txt'.replace('.txt', '.Txt'));

  // Nothing about the files left the page, and no file name is in any request.
  const secrets = [...FILES.map((f) => f.name), ...expected, 'trip-', 'beach'];
  for (const r of requests) for (const s of secrets) {
    expect(decodeURIComponent(r.url)).not.toContain(s);
    expect(r.body ?? '').not.toContain(s);
  }
  expect(errors).toEqual([]);
});

test('duplicate new names get a counter, are flagged, and invalid characters are removed', async ({ page }) => {
  await open(page);
  await page.locator('#file-input').setInputFiles([
    { name: 'IMG.txt', mimeType: 'text/plain', buffer: Buffer.from('one') },
    { name: 'img.txt', mimeType: 'text/plain', buffer: Buffer.from('two') },
    { name: 'Img.txt', mimeType: 'text/plain', buffer: Buffer.from('three') },
  ]);
  await page.locator('label:has(input[name="rn-casing"][value="lower"])').click();
  await expect.poll(() => newNames(page)).toEqual(['img.txt', 'img-2.txt', 'img-3.txt']);
  await expect(page.locator('#rn-rows tr.rn-adjusted')).toHaveCount(2);
  await expect(page.locator('#rn-note')).toBeVisible();

  await page.locator('#rn-prefix').fill('a:b/c*');
  await expect.poll(() => newNames(page)).toEqual(['abcimg.txt', 'abcimg-2.txt', 'abcimg-3.txt']);
  const zip = await download(page);
  expect(Object.keys(zip)).toEqual(['abcimg.txt', 'abcimg-2.txt', 'abcimg-3.txt']);
  expect(new TextDecoder().decode(zip['abcimg-2.txt'])).toBe('two');
});
