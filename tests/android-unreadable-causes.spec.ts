// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readDuration } from '../src/lib/video-split';
import { rereadOnce } from '../src/lib/read-failure';

// What an Android Chrome pick can look like, made here with ffmpeg (nothing committed). Every way the video intake can refuse a
// file records its own class name, so the tool_run counts say why (UnreadableContainer, NoVideoTrack, UnknownDuration,
// UnreadableFileGone), and every one of these files that is a real, readable video is read and split.
const ffmpeg = (...args: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'pipe' });
const SRC = ['-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=15:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4'];
const H264 = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac'];

type Made = { name: string; type: string; bytes: Buffer };
const dir = (t: { outputDir: string }) => {
  mkdirSync(t.outputDir, { recursive: true });
  return t.outputDir;
};
const make = (d: string, file: string, ...args: string[]): Buffer => {
  ffmpeg(...SRC, ...args, join(d, file));
  return readFileSync(join(d, file));
};
const nameOf = async (bytes: Buffer, name = 'clip.mp4', type = 'video/mp4') => {
  try {
    return { ok: await readDuration(new File([new Uint8Array(bytes)], name, { type })) } as const;
  } catch (e) {
    return { name: (e as Error).name, message: (e as Error).message } as const;
  }
};

// Real videos that Android can hand over: each must be read, not refused.
const READABLE: [string, (d: string) => Made][] = [
  ['3GP with H.264 (brand 3gp4)', (d) => ({ name: 'VID_1.3gp', type: 'video/3gpp', bytes: make(d, 'a.3gp', ...H264, '-f', '3gp', '-brand', '3gp4') })],
  ['3GP with H.264 (brand 3gp5)', (d) => ({ name: 'VID_2.3gp', type: 'video/3gpp', bytes: make(d, 'b.3gp', ...H264, '-f', '3gp', '-brand', '3gp5') })],
  ['MP4 with the moov box at the end', (d) => ({ name: 'VID_3.mp4', type: 'video/mp4', bytes: make(d, 'c.mp4', ...H264) })],
  ['MP4 brand mp42', (d) => ({ name: 'VID_4.mp4', type: 'video/mp4', bytes: make(d, 'd.mp4', ...H264, '-brand', 'mp42') })],
  ['MP4 brand isom', (d) => ({ name: 'VID_5.mp4', type: 'video/mp4', bytes: make(d, 'e.mp4', ...H264, '-brand', 'isom') })],
  ['MP4 brand MSNV', (d) => ({ name: 'VID_6.mp4', type: 'video/mp4', bytes: make(d, 'f.mp4', ...H264, '-brand', 'MSNV') })],
  ['MOV brand "qt  "', (d) => ({ name: 'VID_7.mov', type: 'video/quicktime', bytes: make(d, 'g.mov', ...H264, '-f', 'mov') })],
  ['no extension and an empty type', (d) => ({ name: 'VID', type: '', bytes: make(d, 'h.mp4', ...H264) })],
  ['HEVC MP4', (d) => ({ name: 'VID_8.mp4', type: 'video/mp4', bytes: make(d, 'i.mp4', '-c:v', 'libx265', '-tag:v', 'hvc1', '-pix_fmt', 'yuv420p', '-c:a', 'aac') })],
];

test.describe('readDuration names why it refuses', () => {
  for (const [label, build] of READABLE) {
    test(`reads: ${label}`, async ({}, testInfo) => {
      const m = build(dir(testInfo));
      const r = await nameOf(m.bytes, m.name, m.type);
      expect(r, label).toHaveProperty('ok');
      expect((r as { ok: number }).ok).toBeGreaterThan(3.5);
    });
  }

  test('a 0-byte file is UnreadableContainer', async () => {
    expect(await nameOf(Buffer.alloc(0))).toMatchObject({ name: 'UnreadableContainer' });
  });

  test('plain text is UnreadableContainer', async () => {
    expect(await nameOf(Buffer.from('not a video. '.repeat(200)))).toMatchObject({ name: 'UnreadableContainer' });
  });

  test('an audio-only M4A given to a video tool is NoVideoTrack', async ({}, testInfo) => {
    const d = dir(testInfo);
    ffmpeg('-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-c:a', 'aac', join(d, 'a.m4a'));
    expect(await nameOf(readFileSync(join(d, 'a.m4a')), 'VID.m4a', 'audio/mp4')).toMatchObject({ name: 'NoVideoTrack', message: 'This file has no video track.' });
  });

  test('a video whose duration cannot be told is UnknownDuration', async ({}, testInfo) => {
    const { Input } = await import('mediabunny');
    const orig = Input.prototype.computeDuration;
    Input.prototype.computeDuration = async () => 0;
    try {
      const d = dir(testInfo);
      ffmpeg(...SRC, ...H264, join(d, 'z.mp4'));
      expect(await nameOf(readFileSync(join(d, 'z.mp4')))).toMatchObject({ name: 'UnknownDuration', message: 'Could not tell how long this video is.' });
    } finally {
      Input.prototype.computeDuration = orig;
    }
  });
});

test('a file that stays gone after one more read is UnreadableFileGone, with the cause kept', async () => {
  const gone = () => Promise.reject(new DOMException('gone', 'NotFoundError'));
  const err = await rereadOnce(gone, 1).catch((e) => e as Error & { cause?: unknown });
  expect(err.name).toBe('UnreadableFileGone');
  expect(err.message).toContain('Pick it again');
  expect(err.cause).toBeTruthy();
});

test('every new name is letters and digits only', () => {
  for (const n of ['UnreadableFileGone', 'UnreadableContainer', 'NoVideoTrack', 'UnknownDuration']) expect(n).toMatch(/^[A-Za-z][A-Za-z0-9]{0,39}$/);
});

// In the browser: the same files through the splitter page, and the class the page records.
const KEYS = new Set(['tool', 'outcome', 'attempt', 'files', 'input', 'output', 'duration', 'format', 'error_class', 'landing', 'ref', 'from', 'visit', 'prev_tool', 'run_n', 'tools_used', 'run_gap', 'ns', 'via', 'variant']);
type Ev = { n: string; d: Record<string, string> };
const events = (page: Page): Promise<Ev[]> => page.evaluate(() => JSON.parse(sessionStorage.getItem('__ev') || '[]'));

test.describe('on the splitter page', () => {
  test.setTimeout(120_000);
  for (const [label, want] of [
    ['a file with no video structure', 'UnreadableContainer'],
    ['an audio-only M4A', 'NoVideoTrack'],
  ] as const) {
    test(`${label} records ${want}`, async ({ page }, testInfo) => {
      const d = dir(testInfo);
      ffmpeg('-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-c:a', 'aac', join(d, 'a.m4a'));
      const buffer = want === 'NoVideoTrack' ? readFileSync(join(d, 'a.m4a')) : Buffer.from('not a video. '.repeat(300));
      await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
      await page.route('https://stats.keenankaufman.com/**', (route) =>
        route.fulfill({ contentType: 'text/javascript', body: `window.umami={track:(n,d)=>{const a=JSON.parse(sessionStorage.getItem('__ev')||'[]');a.push({n,d});sessionStorage.setItem('__ev',JSON.stringify(a));}};` }),
      );
      await page.goto('/tools/video-splitter');
      await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
      await page.locator('#file-input').setInputFiles({ name: 'VID_0.mp4', mimeType: 'video/mp4', buffer });
      await page.locator('#run').click({ force: true });
      await expect.poll(async () => (await events(page)).filter((e) => e.n === 'tool_run').length, { timeout: 60_000 }).toBeGreaterThan(0);
      const runs = (await events(page)).filter((e) => e.n === 'tool_run');
      for (const e of runs) for (const k of Object.keys(e.d)) expect(KEYS.has(k), `carries unexpected key ${k}`).toBe(true);
      expect(runs.at(-1)!.d).toMatchObject({ outcome: 'error', error_class: want });
    });
  }
});
