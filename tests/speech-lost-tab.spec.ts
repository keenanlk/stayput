// @webkit-project
import { test, expect } from '@playwright/test';
import { TINY_KEY } from '../src/lib/speech-path';

// A speech run the browser closed (a phone short of memory) must make this tab's next speech run start with the smaller model.
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

for (const slug of ['video-to-subtitles', 'transcribe']) {
  test.describe(slug, () => {
    test.use({ userAgent: ANDROID, hasTouch: true });

    test('a lost run on a phone sets the tiny-model flag for this tab; a lost preview does not', async ({ page }) => {
      await page.goto(`/${slug === 'transcribe' ? 'tools/' : ''}${slug}`);
      await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
      const put = (phase: string) => page.evaluate(([p]) => sessionStorage.setItem('stayput:inflight', JSON.stringify({ tool: location.pathname.split('/').pop(), phase: p, t: Date.now(), hidden: false })), [phase]);
      await put('preview');
      await page.reload();
      await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
      expect(await page.evaluate((k) => sessionStorage.getItem(k), TINY_KEY)).toBeNull();
      await put('run');
      await page.reload();
      await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
      expect(await page.evaluate((k) => sessionStorage.getItem(k), TINY_KEY)).toBe('1');
    });
  });
}
