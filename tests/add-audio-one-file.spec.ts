import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const staticFx = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));

test.beforeEach(async ({ page }) => {
  // The site skips analytics in automated browsers; pretend to be a person so the stub loads.
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: 'window.__events=[];window.umami={track:(n,d)=>window.__events.push({n,d})};' }),
  );
});

const cases: [string, string, string][] = [
  ['add-audio-to-video', 'clip.webm', 'Add a sound file too'],
  ['add-music-to-video', 'clip.webm', 'Add a sound file too'],
  ['add-audio-to-video', 'song.mp3', 'Add a video too'],
  ['add-music-to-video', 'song.mp3', 'Add a video too'],
];
for (const [slug, file, message] of cases) {
  test(`${slug} with only ${file} names the missing file and keeps the error class`, async ({ page }) => {
    await page.goto(slug === 'add-audio-to-video' ? `/tools/${slug}` : `/${slug}`);
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('.hint', { hasText: 'Apple Music or Spotify' })).toBeVisible();
    await page.locator('#file-input').setInputFiles([staticFx(file)]);
    await expect(page.locator('#tool')).toHaveAttribute('data-count', '1');
    await page.locator('#run').click();
    await expect(page.locator('#error')).toHaveClass(/is-active/);
    await expect(page.locator('#error')).toContainText(message);
    const events = await page.evaluate(() => (window as unknown as { __events: { n: string; d: Record<string, string> }[] }).__events);
    const failed = events.filter((e) => e.n === 'tool_run');
    expect(failed).toHaveLength(1);
    expect(failed[0]!.d.outcome).toBe('error');
    expect(failed[0]!.d.error_class).toBe('InputError');
    // Only the fields tool_run already declares; the error carries its class name and nothing else.
    const allowed = ['tool', 'outcome', 'files', 'input', 'duration', 'error_class', 'format', 'landing', 'ref', 'from', 'visit', 'via', 'prev_tool', 'run_n', 'tools_used', 'run_gap', 'ns'];
    expect(Object.keys(failed[0]!.d).filter((k) => !allowed.includes(k))).toEqual([]);
    expect(JSON.stringify(failed[0]!.d)).not.toContain(file);
  });
}
