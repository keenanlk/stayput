// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { planLoop } from '../src/lib/loop-plan';

/** Repeat video (/loop-video and /tools/repeat-video): the plan, the copy path and the size guard. */

// 10 s, 320x240, H.264 with AAC, a key frame every second (181 KB).
const clip = fileURLToPath(new URL('./fixtures/static/loop-10s.mp4', import.meta.url));

test('the plan counts repeats, estimates size and refuses before anything is read', () => {
  const base = { bytes: 1_000_000, duration: 10, count: 5, target: 600, phone: false };
  expect(planLoop({ ...base, mode: 'count' })).toMatchObject({ repeats: 5, duration: 50, bytes: 5_000_000, refusal: '' });
  expect(planLoop({ ...base, mode: 'length' })).toMatchObject({ repeats: 60, duration: 600, refusal: '' });
  // A target that is not a whole number of clips is rounded up, so the result is never shorter than asked.
  expect(planLoop({ ...base, mode: 'length', target: 605 }).repeats).toBe(61);
  expect(planLoop({ ...base, mode: 'count', count: 1 }).refusal).toMatch(/2 to 50/);
  expect(planLoop({ ...base, mode: 'count', count: 51 }).refusal).toMatch(/2 to 50/);
  // 50 x 50 MB is 2.5 GB: over the cap.
  expect(planLoop({ ...base, bytes: 50_000_000, mode: 'count', count: 50 }).refusal).toMatch(/over the/);
  expect(planLoop({ ...base, bytes: 50_000_000, mode: 'length', target: 3600 }).refusal).not.toBe('');
  // The same repeat on a phone is held to the phone limit.
  expect(planLoop({ ...base, bytes: 30_000_000, mode: 'count', count: 10, phone: false }).refusal).toBe('');
  expect(planLoop({ ...base, bytes: 30_000_000, mode: 'count', count: 10, phone: true }).refusal).toMatch(/phone/);
});

async function open(page: Page, path: string) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) => route.fulfill({ contentType: 'text/javascript', body: 'window.__events=[];window.umami={track:(n,d)=>window.__events.push({n,d})};' }));
  const hosts: string[] = [];
  page.on('request', (r) => {
    if (!/^(blob|data):/.test(r.url())) hosts.push(new URL(r.url()).host);
  });
  await page.goto(path);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  return { errors, hosts };
}

async function tracks(bytes: Buffer) {
  const { Input, BufferSource, ALL_FORMATS, EncodedPacketSink } = await import('mediabunny');
  const input = new Input({ source: new BufferSource(new Uint8Array(bytes)), formats: ALL_FORMATS });
  const v = (await input.getPrimaryVideoTrack())!;
  const first = await v.getFirstTimestamp();
  let end = 0;
  for await (const p of new EncodedPacketSink(v).packets()) end = Math.max(end, p.timestamp + p.duration);
  return { seconds: end - first, codec: v.codec, audio: (await input.getAudioTracks()).length, audioSeconds: await (await input.getPrimaryAudioTrack())?.computeDuration() };
}

for (const path of ['/loop-video', '/tools/repeat-video']) {
  test(`${path} repeats a 10 s H.264 clip 3 times by copying it, with sound, and no bytes leave the tab`, async ({ page, baseURL }) => {
    const { errors, hosts } = await open(page, path);
    await page.locator('#file-input').setInputFiles(clip);
    await expect(page.locator('#tool')).toHaveAttribute('data-count', '1');
    await page.locator('#loop-count').fill('3');
    // The estimate is on the page before Run.
    await expect(page.locator('#run-hint')).toContainText('3 repeats make a video about 30 s');
    const download = page.waitForEvent('download');
    const started = Date.now();
    await page.locator('#run').click();
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 60_000 });
    await expect(page.locator('#error')).not.toHaveClass(/is-active/);
    const took = Date.now() - started;
    const d = await download;
    expect(d.suggestedFilename()).toBe('loop-10s-x3.mp4');
    const out = await tracks(readFileSync((await d.path())!));
    expect(out.seconds).toBeGreaterThan(30 - 0.2);
    expect(out.seconds).toBeLessThan(30 + 0.2);
    expect(out.codec).toBe('avc');
    expect(out.audio).toBe(1);
    expect(out.audioSeconds!).toBeGreaterThan(30 - 0.3);
    expect(out.audioSeconds!).toBeLessThan(30 + 0.3);
    // Copy mode is named in the result, and a copy of 3 x 181 KB takes nowhere near the time of decoding 450 frames.
    await expect(page.locator('#results-list .result-item')).toContainText('copied, no re-encoding');
    console.log(`repeat-video copy mode: ${took} ms`);
    expect(took).toBeLessThan(15_000);
    expect(new Set(hosts)).toEqual(new Set([new URL(baseURL!).host].concat(hosts.filter((h) => h === 'stats.keenankaufman.com'))));
    expect(errors).toEqual([]);
  });
}

test('a target length repeats the clip until it is long enough', async ({ page }) => {
  await open(page, '/loop-video');
  await page.locator('#file-input').setInputFiles(clip);
  await page.locator('input[name="by"][value="length"]').evaluate((el) => (el as HTMLInputElement).click());
  await page.locator('#loop-minutes').fill('1');
  await expect(page.locator('#run-hint')).toContainText('6 repeats make a video about 1:00');
  const download = page.waitForEvent('download');
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 60_000 });
  const out = await tracks(readFileSync((await (await download).path())!));
  expect(Math.abs(out.seconds - 60)).toBeLessThan(0.2);
});

test('a run over the 2 GB estimate is refused before encoding, with the reason shown', async ({ page }) => {
  await open(page, '/loop-video');
  await page.locator('#file-input').setInputFiles(clip);
  await page.locator('input[name="by"][value="length"]').evaluate((el) => (el as HTMLInputElement).click());
  // 3,000 minutes of a 10 s, 181 KB clip is 18,000 repeats and about 3 GB.
  await page.locator('#loop-minutes').fill('3000');
  await expect(page.locator('#run-hint')).toContainText('over the');
  let downloaded = false;
  page.on('download', () => (downloaded = true));
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 10_000 });
  await expect(page.locator('#error')).toContainText('over the');
  expect(downloaded).toBe(false);
});

test('the page says it repeats the file and is not a loop player', async ({ page }) => {
  await page.goto('/loop-video');
  await expect(page.locator('h1')).toHaveText('Loop a video');
  await expect(page).toHaveTitle('Loop a Video: Repeat a Clip N Times, Free, No Upload | Stayput');
  await expect(page.locator('main')).toContainText('not a loop player');
});

test('a clip the container cannot copy is joined to itself and re-encoded, still N times as long', async ({ page }) => {
  test.skip(test.info().project.name === 'webkit' && !!process.env.CI, 'Linux CI WebKit stalls on in-page video decode and encode');
  await open(page, '/loop-video');
  await page.locator('#file-input').setInputFiles(fileURLToPath(new URL('./fixtures/static/loop-mp3-in-mov.mov', import.meta.url)));
  await page.locator('#loop-count').fill('3');
  const download = page.waitForEvent('download');
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 120_000 });
  await expect(page.locator('#results-list .result-item')).toContainText('re-encoded');
  const out = await tracks(readFileSync((await (await download).path())!));
  expect(Math.abs(out.seconds - 6)).toBeLessThan(0.2);
});
