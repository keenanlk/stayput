import { test, expect, chromium, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// The graphics chip is re-checked during a run: a sustained slowdown (median over about 60 frames) or one frame over
// 5 s moves the rest of the run to the processor for good, and a frame over 5 s on the processor stops the run with a
// plain message. The slowdown is simulated by making the page's clock jump after a share of the run has been done.
const clip = fileURLToPath(new URL('./fixtures/static/iphone-portrait.mov', import.meta.url));

/**
 * From `from` percent on, every reading of the clock jumps `jump` ms, so each frame looks `jump` ms slower. With
 * `once`, the jumps stop when the page logs that one frame was too slow: a single slow frame, not a slow device.
 */
async function slowFrom(page: Page, from: number, jump: number, once = false) {
  await page.addInitScript(
    ([from, jump, once]) => {
      const step = jump as number;
      const real = performance.now.bind(performance);
      let skew = 0;
      let on = false;
      let spent = false;
      const warn = console.warn.bind(console);
      console.warn = (...a: unknown[]) => {
        if (once && /over 5 seconds/.test(String(a[0]))) {
          on = false;
          spent = true;
        }
        warn(...a);
      };
      performance.now = () => real() + (on ? (skew += step) : skew);
      addEventListener('DOMContentLoaded', () => {
        const el = document.getElementById('progress-text')!;
        new MutationObserver(() => {
          const pct = /(\d+)%/.exec(el.textContent ?? '')?.[1];
          if (pct && Number(pct) >= (from as number) && !spent) on = true;
        }).observe(el, { childList: true, characterData: true, subtree: true });
      });
    },
    [from, jump, once],
  );
}

async function setUp(page: Page) {
  await page.goto('/tools/video-background-remover');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles([clip]);
  await page.locator('input[name="bg"][value="color"]').evaluate((el) => (el as HTMLInputElement).click());
  await page.locator('input[name="finder"][value="edges"]').evaluate((el) => (el as HTMLInputElement).click());
}

test.describe('on the processor', () => {
  test('a frame over 5 s fails the run with a plain message', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium');
    test.setTimeout(240_000);
    await slowFrom(page, 20, 6_000);
    await setUp(page);
    await page.locator('#run').click();
    await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 200_000 });
    await expect(page.locator('#error')).toContainText('took more than 5 seconds');
    await expect(page.locator('#results')).not.toHaveClass(/is-active/);
  });
});

test.describe('on the graphics chip', () => {
  test.skip(!(process.platform === 'darwin' && !process.env.CI), 'needs a real chip; CI runners have none');
  test.describe.configure({ mode: 'serial' });

  async function withChip(baseURL: string | undefined, run: (page: Page) => Promise<void>) {
    const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
    try {
      const context = await browser.newContext({ baseURL, acceptDownloads: true, reducedMotion: 'reduce', serviceWorkers: 'block' });
      await run(await context.newPage());
    } finally {
      await browser.close();
    }
  }

  for (const [name, jump, once, warn] of [
    ['a sustained slowdown after 20% moves the rest to the processor', 400, false, /has slowed down, using the CPU/],
    ['one frame over 5 s moves the rest to the processor', 6_000, true, /over 5 seconds on the graphics chip, using the CPU/],
  ] as const) {
    test(name, async ({ baseURL, browserName }) => {
      test.skip(browserName !== 'chromium');
      test.setTimeout(420_000);
      await withChip(baseURL, async (page) => {
        await slowFrom(page, 20, jump, once);
        const logged: string[] = [];
        page.on('console', (m) => logged.push(m.text()));
        await setUp(page);
        await page.locator('#run').click();
        await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 360_000 });
        await expect(page.locator('#error')).not.toHaveClass(/is-active/);
        expect(logged.some((l) => warn.test(l))).toBe(true);
        await expect(page.locator('#results-list')).toContainText('then switched to the processor part way');
      });
    });
  }
});
