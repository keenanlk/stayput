import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

// The progress line names the file being worked on. A long camera or download name would fill the line, so the
// shell shows it cut in the middle with the extension kept, and leaves the full line in the title.
const clip = fileURLToPath(new URL('./fixtures/static/talk.webm', import.meta.url));
const longName = 'IMG_20241012_183045_my-holiday-clip-final-version-2.webm';

test('a long file name is shortened in the progress line, keeping the extension', async ({ page }) => {
  await page.goto('/tools/video-to-mp3');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.evaluate(() => {
    const seen: { text: string; title: string }[] = [];
    (window as unknown as { __seen: typeof seen }).__seen = seen;
    const el = document.getElementById('progress-text')!;
    new MutationObserver(() => seen.push({ text: el.textContent ?? '', title: el.title })).observe(el, { childList: true, characterData: true, subtree: true, attributes: true });
  });
  await page.locator('#file-input').setInputFiles({ name: longName, mimeType: 'video/webm', buffer: readFileSync(clip) });
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 60_000 });
  const seen = await page.evaluate(() => (window as unknown as { __seen: { text: string; title: string }[] }).__seen);
  const named = seen.filter((s) => s.text.includes('IMG_2024'));
  expect(named.length, `no progress text names the file: ${JSON.stringify(seen.slice(0, 4))}`).toBeGreaterThan(0);
  for (const s of named) {
    expect(s.text).not.toContain(longName);
    expect(s.text).toMatch(/IMG_2024[\w-]*…[\w-]*\.webm/);
  }
  expect(named.some((s) => s.title.includes(longName))).toBe(true);
});
