// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseMidi, writeMidi } from '../src/lib/midi';
import { silentWav8, wav } from './music-synth';

const dir = mkdtempSync(join(tmpdir(), 'mp3-to-midi-'));
const clip = join(dir, 'secret-melody-name.wav');
const tooLong = join(dir, 'twenty-minutes.wav');

/** Ten notes of a tune, one every 0.6 s, each sounding 0.5 s, played by a piano-like tone (three decaying harmonics). */
const TUNE = [60, 62, 64, 65, 67, 69, 71, 72, 67, 64];

function piano(): Float32Array {
  const sr = 22050;
  const out = new Float32Array(Math.round(0.6 * TUNE.length * sr) + sr);
  TUNE.forEach((midi, n) => {
    const f = 440 * 2 ** ((midi - 69) / 12);
    const from = Math.round((0.3 + n * 0.6) * sr);
    for (let i = 0; i < 0.5 * sr; i++) {
      const t = i / sr;
      const env = Math.min(1, t / 0.005) * Math.exp(-2.5 * t) * Math.min(1, (0.5 - t) / 0.03);
      let v = 0;
      for (let h = 1; h <= 3; h++) v += Math.sin(2 * Math.PI * f * h * t) / h ** 1.5;
      out[from + i] = (out[from + i] ?? 0) + 0.3 * env * v;
    }
  });
  return out;
}

test.beforeAll(() => {
  writeFileSync(clip, wav(piano(), 22050));
  writeFileSync(tooLong, silentWav8(20 * 60, 8000));
});

async function open(page: Page, { noGpu = false } = {}) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  if (noGpu) await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'gpu', { get: () => undefined, configurable: true }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: 'window.__events=[];window.umami={track:(n,d)=>window.__events.push({n,d})};' }),
  );
  const seen: { url: string; method: string; body: string | null }[] = [];
  page.on('request', (r) => seen.push({ url: r.url(), method: r.method(), body: r.postData() }));
  await page.goto('/tools/mp3-to-midi');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  return { errors, seen };
}

test('turns a ten-note clip into a MIDI file with the right notes, and sends nothing', async ({ page }) => {
  const { errors, seen } = await open(page);
  seen.length = 0;
  await page.setInputFiles('#file-input', clip);
  await page.locator('#bpm').fill('100');
  await page.locator('#run').click();
  await expect(page.locator('#mm-panel')).toBeVisible({ timeout: 80_000 });
  await expect(page.locator('#mm-summary')).toContainText('notes from');

  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#results-list .result-item button', { hasText: 'Download' }).click()]);
  expect(download.suggestedFilename()).toBe('secret-melody-name.mid');
  const midi = parseMidi(new Uint8Array(readFileSync((await download.path())!)));
  expect(midi.format).toBe(0);
  expect(midi.bpm).toBeCloseTo(100, 0);
  // The ten notes of the tune, in order, each within a semitone (no stray extras).
  expect(midi.notes).toHaveLength(TUNE.length);
  midi.notes.forEach((n, i) => {
    expect(Math.abs(n.pitch - TUNE[i]!), `note ${i + 1}`).toBeLessThanOrEqual(1);
    // Start within 100 ms of where it was played, at 100 BPM and 480 ticks per quarter note.
    const seconds = (n.tick / midi.division) * (60 / 100);
    expect(Math.abs(seconds - (0.3 + i * 0.6)), `start of note ${i + 1}`).toBeLessThan(0.1);
  });

  // Nothing but this site's own files was fetched, and nothing was sent with the audio or its name.
  for (const r of seen) {
    if (r.url.startsWith('blob:') || r.url.startsWith('data:')) continue;
    const host = new URL(r.url).hostname;
    if (host === 'stats.keenankaufman.com') {
      expect(r.body ?? '').not.toContain('secret-melody-name');
      continue;
    }
    expect(host, `unexpected host ${host}`).toBe('localhost');
    expect(r.method, r.url).toBe('GET');
    expect(r.body, r.url).toBeNull();
  }
  expect(seen.some((r) => r.url.endsWith('/models/nmp.onnx'))).toBe(true);
  const events = await page.evaluate(() => (window as unknown as { __events: { n: string; d: Record<string, unknown> }[] }).__events);
  const run = events.find((e) => e.n === 'tool_run')!;
  expect(run.d).toMatchObject({ tool: 'mp3-to-midi', outcome: 'ok', format: 'mid' });
  expect(JSON.stringify(events)).not.toContain('secret-melody-name');
  expect(errors).toEqual([]);
});

test('runs on the WebAssembly engine, with or without WebGPU in the browser', async ({ page }) => {
  for (const noGpu of [false, true]) {
    const { errors, seen } = await open(page, { noGpu });
    await page.setInputFiles('#file-input', clip);
    await page.locator('#run').click();
    await expect(page.locator('#results-list .result-item')).toContainText('on the CPU', { timeout: 80_000 });
    expect(seen.some((r) => r.url.includes('asyncify')), 'the 27 MB WebGPU engine is not fetched').toBe(false);
    expect(errors).toEqual([]);
    await page.reload();
  }
});

test('refuses a 20-minute file with a message, before decoding it or fetching the model', async ({ page }) => {
  const { seen } = await open(page);
  seen.length = 0;
  await page.setInputFiles('#file-input', tooLong);
  await page.locator('#run').click();
  await expect(page.locator('#tool')).toContainText('This file is 20 minutes long. This page reads files up to 5 minutes.', { timeout: 30_000 });
  expect(seen.some((r) => r.url.includes('/models/') || r.url.includes('/vendor/'))).toBe(false);
});

test('the MIDI writer and reader agree', () => {
  const notes = [
    { start: 0, end: 0.5, pitch: 60, velocity: 90 },
    { start: 0.5, end: 1, pitch: 60, velocity: 40 },
    { start: 0.25, end: 2, pitch: 72, velocity: 127 },
  ];
  const bytes = writeMidi(notes, 120);
  expect(Array.from(bytes.subarray(0, 4))).toEqual([0x4d, 0x54, 0x68, 0x64]);
  const parsed = parseMidi(bytes);
  expect(parsed).toMatchObject({ format: 0, tracks: 1, division: 480, bpm: 120 });
  expect(parsed.notes.map((n) => [n.pitch, n.tick, n.duration, n.velocity])).toEqual([
    [60, 0, 480, 90],
    [72, 240, 1680, 127],
    [60, 480, 480, 40],
  ]);
});
