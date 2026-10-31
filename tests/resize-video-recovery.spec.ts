// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { withoutSoftwareEncoder } from './no-software-encoder';

// Resize video on a phone whose encoder gives up mid-run: it retries (software encoder, smaller picture or the same
// size again) before it fails, and when every try fails it ends as EncoderGaveUp,
// not EncodingError, with words that suggest a smaller size. The encoder is made to refuse in the page.
const phoneMov = fileURLToPath(new URL('./fixtures/static/iphone-portrait.mov', import.meta.url));

/** Once the page says it is resizing, the encoder throws `name`: once, or on every frame when `always`. */
async function breakEncoder(page: Page, name: string, always: boolean) {
  await page.addInitScript(() => ((window as unknown as { __stayputNoSizeProbe: boolean }).__stayputNoSizeProbe = true));
  await page.addInitScript(
    ([name, always]) => {
      let armed = false;
      const original = VideoEncoder.prototype.encode;
      VideoEncoder.prototype.encode = function (this: VideoEncoder, ...args: Parameters<VideoEncoder['encode']>) {
        // Not the encoder probe's test frames: only once the page says the clip itself is being resized.
        const running = /Resizing/.test(document.getElementById('progress-text')?.textContent ?? '');
        if (running && (always || !armed)) {
          armed = true;
          throw new DOMException('forced by the test', name as string);
        }
        return original.apply(this, args);
      };
    },
    [name, always] as const,
  );
}

async function run(page: Page) {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: 'window.__events=[];window.umami={track:(n,d)=>window.__events.push({n,d})};' }),
  );
  await page.goto('/tools/resize-video');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#size').selectOption('720');
  await page.locator('#file-input').setInputFiles([phoneMov]);
  await page.locator('#run').click();
}

const runClasses = (page: Page) =>
  page.evaluate(() => (window as unknown as { __events: { n: string; d: Record<string, string> }[] }).__events.filter((e) => e.n === 'tool_run').map((e) => e.d.error_class ?? e.d.outcome));

for (const [label, software] of [['no software encoder', false], ['software encoder offered', true]] as const) {
  test.describe(label, () => {
    test.beforeEach(async ({ page }) => {
      if (!software) await withoutSoftwareEncoder(page);
    });

    test('the encoder gives up once at 720p: the resize is made on a retry and says so', async ({ page }) => {
      test.setTimeout(240_000);
      await breakEncoder(page, 'EncodingError', false);
      await run(page);
      await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
      await expect(page.locator('#results-list')).toContainText(software ? /software video encoder|second try/ : /second try|smaller size/);
      await expect.poll(() => runClasses(page)).toEqual(['ok']);
    });

    test('the encoder refuses on every try: a named refusal that suggests a smaller size, not EncodingError', async ({ page }) => {
      test.setTimeout(240_000);
      await breakEncoder(page, 'EncodingError', true);
      await run(page);
      await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 200_000 });
      await expect(page.locator('#error')).toContainText(/smaller size/);
      await expect.poll(() => runClasses(page)).toEqual(['EncoderGaveUp']);
    });
  });
}
