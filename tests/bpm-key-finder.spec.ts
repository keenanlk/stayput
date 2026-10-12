import { test, expect, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CSV_HEADER } from '../src/lib/bpm-key';
import { chords, clickTrack, mix, silentWav8, wav } from './music-synth';

const dir = mkdtempSync(join(tmpdir(), 'bpm-key-'));
const song = join(dir, 'secret-demo-name.wav');
const tooLong = join(dir, 'sixteen-minutes.wav');
const tooShort = join(dir, 'three-seconds.wav');

test.beforeAll(() => {
  // 30 s at 120 BPM in A minor (tonic 9), 44.1 kHz mono.
  const pad = chords(9, 'minor', 30, 44100);
  writeFileSync(song, wav(mix(clickTrack(120, 30), pad), 44100));
  writeFileSync(tooLong, silentWav8(16 * 60, 8000));
  writeFileSync(tooShort, wav(chords(9, 'minor', 3, 44100), 44100));
});

async function open(page: Page, path = '/tools/bpm-key-finder') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: 'window.__events=[];window.umami={track:(n,d)=>window.__events.push({n,d})};' }),
  );
  const seen: { url: string; method: string; body: string | null }[] = [];
  page.on('request', (r) => seen.push({ url: r.url(), method: r.method(), body: r.postData() }));
  await page.goto(path);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  return { errors, seen };
}

async function runWith(page: Page, file: string) {
  await page.setInputFiles('#file-input', file);
  await page.locator('#run').click();
}

test('finds the tempo and key of a song, writes the CSV, and sends nothing', async ({ page }) => {
  const { errors, seen } = await open(page);
  seen.length = 0;
  await runWith(page, song);
  const card = page.locator('.bk-card').first();
  await expect(card).toBeVisible({ timeout: 60_000 });
  await expect(card).toContainText('BPM');
  await expect(card.locator('.bk-keyname')).toHaveText(/^(A minor|C major)$/);
  await expect(card.locator('.bk-camelot')).toHaveText(/^8[AB]$/);
  await expect(card.locator('.bk-also')).toBeVisible();
  await expect(card).toContainText('Assumes one steady tempo.');
  await expect(card.locator('.bk-copy')).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#results-list .result-item button', { hasText: 'Download' }).click()]);
  expect(download.suggestedFilename()).toBe('bpm-key-results.csv');
  const csv = readFileSync((await download.path())!, 'utf8');
  expect(csv.split('\n')[0]).toBe(CSV_HEADER);
  expect(csv).toContain('"secret-demo-name.wav"');

  for (const r of seen) {
    if (r.url.startsWith('blob:') || r.url.startsWith('data:')) continue;
    const host = new URL(r.url).hostname;
    if (host === 'stats.keenankaufman.com') {
      expect(r.body ?? '').not.toContain('secret-demo-name');
      continue;
    }
    expect(host, `unexpected host ${host}`).toBe('localhost');
    expect(r.method, r.url).toBe('GET');
    expect(r.body, r.url).toBeNull();
  }
  const events = await page.evaluate(() => (window as unknown as { __events: { n: string; d: Record<string, unknown> }[] }).__events);
  const run = events.find((e) => e.n === 'tool_run')!;
  expect(run.d).toMatchObject({ tool: 'bpm-key-finder', outcome: 'ok' });
  expect(run.d.format ?? '').toBe('');
  const text = JSON.stringify(events);
  expect(text).not.toContain('secret-demo-name');
  expect(text).not.toContain('A minor');
  expect(errors).toEqual([]);
});

test('refuses a file longer than 15 minutes, and a clip under 10 seconds, with the page’s own messages', async ({ page }) => {
  await open(page);
  await runWith(page, tooLong);
  await expect(page.locator('.bk-failed .bk-error')).toContainText('This file is 16 minutes long. This page reads files up to 15 minutes.', { timeout: 60_000 });
  await expect(page.locator('.bk-failed .bk-error')).toContainText('Trim audio');
  await page.locator('#clear').click();
  await runWith(page, tooShort);
  await expect(page.locator('.bk-failed .bk-error')).toContainText('This clip is 3 seconds long, which is too short to find a tempo. Use a clip of at least 10 seconds.', { timeout: 60_000 });
});

for (const [slug, focus] of [['song-key-finder', 'key'], ['camelot-wheel', 'camelot']] as const) {
  test(`/${slug} is a preset of the finder with its own structured data and social image`, async ({ page }) => {
    const { errors } = await open(page, `/${slug}`);
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(3);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://stayput.dev/${slug}`);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', `https://stayput.dev/og/${slug}.png`);
    expect((await page.request.get(`/og/${slug}.png`)).status()).toBe(200);
    await expect(page.locator('.bk-stage')).toHaveAttribute('data-focus', focus);
    const faq = await page.locator('script[type="application/ld+json"]').evaluateAll((els) => els.map((e) => e.textContent ?? '').find((t) => t.includes('FAQPage')) ?? '');
    expect(JSON.parse(faq)['@type']).toBe('FAQPage');
    expect(errors).toEqual([]);
  });
}

test('the main page carries FAQPage data, and Tap tempo points to the new tool', async ({ page }) => {
  await open(page);
  const faq = await page.locator('script[type="application/ld+json"]').evaluateAll((els) => els.map((e) => e.textContent ?? '').find((t) => t.includes('FAQPage')) ?? '');
  const data = JSON.parse(faq);
  expect(data.mainEntity).toHaveLength(9);
  expect(data.mainEntity[0].name).toBe('How do I find the BPM of a song?');
  expect(data.mainEntity[0].acceptedAnswer.text).not.toContain('](');
  await page.goto('/tap-tempo');
  await expect(page.locator('a[href="/tools/bpm-key-finder"]').first()).toBeVisible();
});
