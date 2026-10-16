// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// A clip the browser cannot decode (an Android phone's HEVC or HDR video) is refused up front with its own error class,
// before any model is fetched, and with a message that says how to get a copy that opens. The browser's answer is forced:
// VideoDecoder.isConfigSupported says no, as an Android Chrome without an HEVC decoder does.
const clip = fileURLToPath(new URL('./fixtures/static/iphone-portrait-person.mov', import.meta.url));
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

test.beforeEach(async ({ page }) => {
  // The site skips analytics in automated browsers; pretend to be a person so the stub loads.
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: 'window.__events=[];window.umami={track:(n,d)=>window.__events.push({n,d})};' }),
  );
});

const TOOLS = ['/blur-video-background', '/tools/blur-face-video', '/tools/add-watermark-to-video', '/tools/video-background-remover'];

async function cannotDecode(page: Page) {
  await page.addInitScript(() => {
    if (typeof VideoDecoder === 'undefined') return;
    VideoDecoder.isConfigSupported = async (config: VideoDecoderConfig) => {
      return { supported: false, config };
    };
  });
}

for (const path of TOOLS) {
  test.describe(path, () => {
    test.use({ userAgent: ANDROID });
    test('an undecodable clip fails first, named UnsupportedCodec, with the way out', async ({ page }) => {
      const models: string[] = [];
      page.on('request', (r) => /\/models\/|onnx|\.tflite|mediapipe/i.test(r.url()) && models.push(r.url()));
      await cannotDecode(page);
      await page.goto(path);
      await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
      await page.locator('#file-input').setInputFiles([clip]);
      await page.locator('#run').click();
      await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 60_000 });
      const text = (await page.locator('#error').textContent()) ?? '';
      expect(text).toContain('HEVC');
      expect(text).toContain('Most compatible');
      expect(text).toContain('HDR');
      expect(models).toEqual([]);
      const events = await page.evaluate(() => (window as unknown as { __events: { n: string; d: Record<string, string> }[] }).__events);
      const failed = events.filter((e) => e.n === 'tool_run');
      expect(failed).toHaveLength(1);
      expect(failed[0]!.d.error_class).toBe('UnsupportedCodec');
    });
  });
}
