import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { reverseWindows } from '../src/lib/video-reverse';

/** How Reverse video splits a video into pieces to decode, last first. */

test('reverse windows follow keyframes and cover the whole video once, last first', () => {
  const w = reverseWindows([0, 2, 4], 0, 5, 3);
  expect(w).toEqual([[4, 5], [2, 4], [0, 2]]);
});

test('a long stretch between keyframes is split into windows that fit in memory', () => {
  const w = reverseWindows([0], 0, 2.5, 1);
  expect(w).toEqual([[1.5, 2.5], [0.5, 1.5], [0, 0.5]]);
  // Together the windows cover the video with no gaps.
  const sorted = [...w].reverse();
  for (let i = 1; i < sorted.length; i++) expect(sorted[i]![0]).toBeCloseTo(sorted[i - 1]![1]);
});

test('a video that does not start at zero or lists no keyframes still gets windows', () => {
  expect(reverseWindows([], 0.5, 1.5, 2)).toEqual([[0.5, 1.5]]);
});

// A file with no picture track fails under a class name of its own, not as a plain "Error".
test('a file with no video track is recorded under a named error class', async ({ page }) => {
  const wav = readFileSync(fileURLToPath(new URL('./fixtures/static/jfk.wav', import.meta.url)));
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const a=JSON.parse(sessionStorage.getItem('__ev')||'[]');a.push({n,d});sessionStorage.setItem('__ev',JSON.stringify(a));}};`,
    }),
  );
  await page.goto('/tools/reverse-video');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles({ name: 'clip.mp4', mimeType: 'video/mp4', buffer: wav });
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 60_000 });
  const run = await page.evaluate(() => (JSON.parse(sessionStorage.getItem('__ev') || '[]') as { n: string; d: Record<string, string> }[]).filter((e) => e.n === 'tool_run').at(-1)?.d);
  expect(run?.outcome).toBe('error');
  expect(run?.error_class).toBe('UnreadableFile');
});
