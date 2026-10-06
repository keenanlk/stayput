import { test, expect, type Page } from '@playwright/test';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync, createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const KNOWN = {
  // The classic test vector: the three digests of the three bytes "abc".
  md5: '900150983cd24fb0d6963f7d28e17f72',
  sha1: 'a9993e364706816aba3e25717850c26c9cd0d89d',
  sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
};

const dir = mkdtempSync(join(tmpdir(), 'checksum-'));
const abc = join(dir, 'abc-secret-name.bin');
const big = join(dir, 'fifty-two-megabytes.iso');
const BIG_BYTES = 52 * 1024 * 1024 + 123; // not a multiple of the 8 MB chunk, so the last chunk is short
let bigDigests: { md5: string; sha1: string; sha256: string };

test.beforeAll(async () => {
  writeFileSync(abc, 'abc');
  const hashes = { md5: createHash('md5'), sha1: createHash('sha1'), sha256: createHash('sha256') };
  const out = createWriteStream(big);
  for (let written = 0; written < BIG_BYTES; ) {
    const chunk = randomBytes(Math.min(1024 * 1024, BIG_BYTES - written));
    for (const h of Object.values(hashes)) h.update(chunk);
    if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
    written += chunk.length;
  }
  await new Promise((r) => out.end(r));
  bigDigests = { md5: hashes.md5.digest('hex'), sha1: hashes.sha1.digest('hex'), sha256: hashes.sha256.digest('hex') };
});

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  // Record analytics events on the page instead of sending them.
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: 'window.__events=[];window.umami={track:(n,d)=>window.__events.push({n,d})};' }),
  );
  await page.goto('/tools/file-checksum');
  await expect(page.locator('#tool')).toBeVisible();
  return errors;
}

const digest = (page: Page, id: string) => page.locator(`.cs-card li[data-algorithm="${id}"] code`).first();

async function run(page: Page, file: string) {
  await page.setInputFiles('#file-input', file);
  await page.locator('#run').click();
  await expect(page.locator('#cs-panel')).toBeVisible({ timeout: 60_000 });
}

test('hashes a known file to its MD5, SHA-1 and SHA-256', async ({ page }) => {
  const errors = await open(page);
  await run(page, abc);
  await expect(digest(page, 'md5')).toHaveText(KNOWN.md5);
  await expect(digest(page, 'sha1')).toHaveText(KNOWN.sha1);
  await expect(digest(page, 'sha256')).toHaveText(KNOWN.sha256);
  await expect(page.locator('.cs-card li')).toHaveCount(3);
  expect(errors).toEqual([]);
});

test('every digest has a working Copy button', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page);
  await run(page, abc);
  await page.locator('.cs-card li[data-algorithm="sha256"] button').click();
  await expect(page.locator('.cs-card li[data-algorithm="sha256"] button')).toHaveText('Copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(KNOWN.sha256);
  await expect(page.locator('.cs-card li button')).toHaveCount(3);
});

test('the compare box names the algorithm that matched, ignoring case and whitespace', async ({ page }) => {
  await open(page);
  await run(page, abc);
  const verdict = page.locator('#cs-verdict');
  await expect(verdict).toBeHidden();
  await page.fill('#cs-paste', KNOWN.sha256.toUpperCase());
  await expect(verdict).toContainText('Match');
  await expect(verdict).toContainText('SHA-256');
  await expect(page.locator('li.is-match')).toHaveCount(1);
  // Spaces, a trailing newline and a sha256sum-style line with a file name.
  await page.fill('#cs-paste', `  ${KNOWN.md5.slice(0, 8)} ${KNOWN.md5.slice(8).toUpperCase()}\n`);
  await expect(verdict).toContainText('MD5');
  await page.fill('#cs-paste', `${KNOWN.sha1}  abc.bin`);
  await expect(verdict).toContainText('SHA-1');
  await expect(verdict).toHaveClass(/ok/);
});

test('the compare box says so when the checksum does not match', async ({ page }) => {
  await open(page);
  await run(page, abc);
  const verdict = page.locator('#cs-verdict');
  const wrong = (KNOWN.sha256.startsWith('0') ? '1' : '0') + KNOWN.sha256.slice(1);
  await page.fill('#cs-paste', wrong);
  await expect(verdict).toContainText('No match');
  await expect(verdict).toContainText('SHA-256');
  await expect(verdict).toHaveClass(/bad/);
  await expect(page.locator('li.is-match')).toHaveCount(0);
  // The same length as an MD5 but the wrong value, and text that is no checksum at all.
  await page.fill('#cs-paste', 'd41d8cd98f00b204e9800998ecf8427e');
  await expect(verdict).toContainText('No match');
  await expect(verdict).toContainText('MD5');
  await page.fill('#cs-paste', 'not a checksum');
  await expect(verdict).toContainText('No match');
  await expect(verdict).toContainText('Check that you copied all of it');
  await page.fill('#cs-paste', '');
  await expect(verdict).toBeHidden();
});

test('a 52 MB file is read in slices, with progress, and gets the right digests', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = await open(page);
  // Record how much of the file each read takes, and what the progress text said at the time.
  await page.addInitScript(() => {
    const w = window as unknown as { __reads: number[]; __progress: string[] };
    w.__reads = [];
    w.__progress = [];
    const original = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = function (this: Blob) {
      if (this.size > 1024 * 1024) {
        w.__reads.push(this.size);
        w.__progress.push(document.getElementById('progress-text')?.textContent ?? '');
      }
      return original.call(this);
    };
  });
  await page.reload();
  await run(page, big);
  await expect(digest(page, 'sha256')).toHaveText(bigDigests.sha256);
  await expect(digest(page, 'md5')).toHaveText(bigDigests.md5);
  await expect(digest(page, 'sha1')).toHaveText(bigDigests.sha1);
  const { reads, progress } = await page.evaluate(() => {
    const w = window as unknown as { __reads: number[]; __progress: string[] };
    return { reads: w.__reads, progress: w.__progress };
  });
  expect(reads.length, 'the file is read in several slices').toBeGreaterThanOrEqual(7);
  expect(Math.max(...reads), 'no read takes more than 8 MB').toBeLessThanOrEqual(8 * 1024 * 1024);
  expect(reads.reduce((a, b) => a + b, 0)).toBe(BIG_BYTES);
  expect(progress.some((p) => /\d+%/.test(p)), 'progress shows a percentage while reading').toBe(true);
  expect(errors.filter((e) => !/odml\.pa\.googleapis/.test(e))).toEqual([]);
});

test('nothing sent carries the file, its name or its digests, and analytics stays within the existing events', async ({ page }) => {
  const seen: { url: string; method: string; body: string | null }[] = [];
  page.on('request', (r) => seen.push({ url: r.url(), method: r.method(), body: r.postData() }));
  await open(page);
  seen.length = 0;
  await run(page, abc);
  await page.fill('#cs-paste', KNOWN.sha256);
  await expect(page.locator('#cs-verdict')).toContainText('Match');
  const secrets = ['abc-secret-name', ...Object.values(KNOWN)];
  for (const r of seen) {
    if (r.url.startsWith('blob:') || r.url.startsWith('data:')) continue;
    expect(new URL(r.url).hostname, `unexpected host for ${r.url}`).toMatch(/^(localhost|stats\.keenankaufman\.com)$/);
    const haystack = `${decodeURIComponent(r.url)} ${r.body ?? ''}`.toLowerCase();
    for (const s of secrets) expect(haystack, `${r.method} ${r.url}`).not.toContain(s.toLowerCase());
    if (new URL(r.url).hostname === 'localhost') {
      expect(r.method, r.url).toBe('GET');
      expect(r.body, r.url).toBeNull();
    }
  }
  const events = await page.evaluate(() => (window as unknown as { __events: { n: string; d: Record<string, unknown> }[] }).__events);
  expect(events.map((e) => e.n)).toEqual(expect.arrayContaining(['files_added', 'tool_run']));
  for (const e of events.filter((e) => e.n === 'files_added' || e.n === 'tool_run')) expect(e.d.tool).toBe('file-checksum');
  const text = JSON.stringify(events).toLowerCase();
  for (const s of secrets) expect(text).not.toContain(s.toLowerCase());
  expect(events.find((e) => e.n === 'tool_run')!.d).toMatchObject({ outcome: 'ok', tool: 'file-checksum' });
});

test('the page makes no unlimited-size or security claims and follows the search brief', async ({ page, request }) => {
  await open(page);
  await expect(page).toHaveTitle('MD5 & SHA-256 File Checksum, No Upload | Stayput');
  await expect(page.locator('h1')).toHaveText("Check a file's MD5 or SHA-256 checksum");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /^Get the MD5, SHA-1 or SHA-256 checksum of a file and compare it with the one the publisher lists\./);
  const text = (await page.locator('main').innerText()).toLowerCase();
  for (const phrase of ['tamper-proof', 'unlimited', 'no size cap', 'any file', 'secure checksum']) expect(text, phrase).not.toContain(phrase);
  await expect(page.locator('details, .faq').first()).toBeAttached();
  const home = await (await request.get('/')).text();
  expect(home).toContain('/tools/file-checksum');
});

test('a file that cannot be read gives a message instead of a result', async ({ page }) => {
  await open(page);
  await page.addInitScript(() => {
    Blob.prototype.arrayBuffer = () => Promise.reject(new RangeError('Array buffer allocation failed'));
  });
  await page.reload();
  await page.setInputFiles('#file-input', abc);
  await page.locator('#run').click();
  await expect(page.locator('#error')).toContainText('ran out of memory');
  await expect(page.locator('#cs-panel')).toBeHidden();
});
