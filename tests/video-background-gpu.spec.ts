import { test, expect, chromium, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

// Better edges runs the model on the graphics chip (MediaPipe's GPU delegate, which is WebGL) where there is a real one,
// and must still finish on the CPU where there is not, or where the chip goes away part way. Playwright's headless
// Chromium renders WebGL in software (SwiftShader), which the page keeps on the CPU (video-background-finder.spec.ts
// checks that run); the chip-only tests below ask Chromium on a Mac for Metal and skip themselves elsewhere.
const clip = fileURLToPath(new URL('./fixtures/static/iphone-portrait-person.mov', import.meta.url));
const SOFTMAX_ON_GPU = /SOFTMAX activation function chosen on GPU/;

async function setUp(page: Page, finder: 'fast' | 'edges' = 'edges') {
  await page.goto('/tools/video-background-remover');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles([clip]);
  await page.locator('input[name="bg"][value="color"]').evaluate((el) => (el as HTMLInputElement).click());
  await page.locator('#bg-color').fill('#ff00ff');
  await page.locator(`input[name="finder"][value="${finder}"]`).evaluate((el) => (el as HTMLInputElement).click());
}

/** Run and return the output's pixels at 0.7 s: the room's corners and the person's middle, as [r, g, b]. */
async function runAndRead(page: Page) {
  const download = page.waitForEvent('download');
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 360_000 });
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  const bytes = readFileSync(await (await download).path()).toString('base64');
  return page.evaluate(async (b64) => {
    const v = document.createElement('video');
    v.muted = true;
    v.src = URL.createObjectURL(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'video/mp4' }));
    await new Promise((ok) => (v.onloadeddata = ok));
    // `seeked` says the frame at 0.7 s is current; a frame callback can fail to fire after a seek under load.
    await new Promise<void>((ok, bad) => {
      v.onseeked = () => ok();
      v.onerror = () => bad(new Error('video will not seek'));
      v.currentTime = 0.7;
    });
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(v, 0, 0);
    const at = (x: number, y: number) => [...ctx.getImageData(Math.round(x * c.width), Math.round(y * c.height), 1, 1).data].slice(0, 3);
    return { corners: [at(0.05, 0.05), at(0.95, 0.05), at(0.05, 0.95), at(0.95, 0.95)], person: [at(0.5, 0.5), at(0.5, 0.6)] };
  }, bytes);
}

function expectPersonKept(shot: Awaited<ReturnType<typeof runAndRead>>) {
  const magenta = ([r, g, b]: number[]) => r! > 190 && g! < 90 && b! > 190;
  expect(shot.corners.every(magenta), 'the room around the person is replaced').toBe(true);
  expect(shot.person.every((p) => !magenta(p!)), 'the person stays, all over').toBe(true);
}

/** Pass Chromium on a Mac a real chip; elsewhere this does nothing and the tests that need one skip. */
const wantsChip = process.platform === 'darwin' && !process.env.CI;

test.describe('on the CPU', () => {
  test('with no WebGL at all it says so, plainly, and writes no file', async ({ page }) => {
    await page.addInitScript(() => {
      for (const C of [HTMLCanvasElement, typeof OffscreenCanvas !== 'undefined' ? OffscreenCanvas : null]) {
        if (!C) continue;
        const real = C.prototype.getContext as (this: unknown, ...a: unknown[]) => unknown;
        (C.prototype as { getContext: unknown }).getContext = function (this: unknown, type: unknown, ...rest: unknown[]) {
          return /webgl/i.test(String(type)) ? null : real.call(this, type, ...rest);
        };
      }
    });
    await setUp(page);
    let downloaded = false;
    page.on('download', () => (downloaded = true));
    await page.locator('#run').click();
    await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 60_000 });
    await expect(page.locator('#error')).toContainText('needs WebGL');
    await expect(page.locator('#error')).not.toContainText('activeTexture');
    await expect(page.locator('#results')).not.toHaveClass(/is-active/);
    expect(downloaded).toBe(false);
  });
});

test.describe('on the graphics chip', () => {
  test.skip(!wantsChip, 'needs a real chip; CI runners have none');
  // Two Metal Chromiums encoding at once stalled each other on a Mac: one at a time.
  test.describe.configure({ mode: 'serial' });

  /** A headless Chromium of its own, started with Metal so WebGL has the Mac's chip rather than SwiftShader. */
  async function withChip(baseURL: string | undefined, run: (page: Page) => Promise<void>) {
    const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
    try {
      const context = await browser.newContext({ baseURL, acceptDownloads: true, reducedMotion: 'reduce', serviceWorkers: 'block' });
      await run(await context.newPage());
    } finally {
      await browser.close();
    }
  }

  test('Better edges runs on the chip and keeps the person', async ({ baseURL, browserName }) => {
    test.skip(browserName !== 'chromium');
    test.setTimeout(420_000);
    await withChip(baseURL, async (page) => {
      const logged: string[] = [];
      page.on('console', (m) => logged.push(m.text()));
      await setUp(page);
      expectPersonKept(await runAndRead(page));
      expect(logged.some((l) => SOFTMAX_ON_GPU.test(l)), 'the model ran on the chip').toBe(true);
    });
  });

  test('Fast stays on the CPU', async ({ baseURL, browserName }) => {
    test.skip(browserName !== 'chromium');
    test.setTimeout(420_000);
    await withChip(baseURL, async (page) => {
      const logged: string[] = [];
      page.on('console', (m) => logged.push(m.text()));
      await setUp(page, 'fast');
      expectPersonKept(await runAndRead(page));
      expect(logged.some((l) => SOFTMAX_ON_GPU.test(l))).toBe(false);
    });
  });

  test('losing the graphics context part way finishes the run on the CPU with the person kept', async ({ baseURL, browserName }) => {
    test.skip(browserName !== 'chromium');
    test.setTimeout(420_000);
    await withChip(baseURL, async (page) => {
      // At about a third of the way, lose every WebGL context the page holds: what a graphics driver reset does.
      await page.addInitScript(() => {
        const held: WebGL2RenderingContext[] = [];
        const real = OffscreenCanvas.prototype.getContext as (this: OffscreenCanvas, ...a: unknown[]) => RenderingContext | null;
        (OffscreenCanvas.prototype as { getContext: unknown }).getContext = function (this: OffscreenCanvas, type: unknown, ...rest: unknown[]) {
          const ctx = real.call(this, type, ...rest) as WebGL2RenderingContext | null;
          if (ctx && /^webgl/.test(String(type))) held.push(ctx);
          return ctx;
        };
        let fired = false;
        addEventListener('DOMContentLoaded', () => {
          const el = document.getElementById('progress-text')!;
          new MutationObserver(() => {
            const pct = /Replacing the background.*?(\d+)%/.exec(el.textContent ?? '')?.[1];
            if (fired || !pct || Number(pct) < 30) return;
            fired = true;
            for (const gl of held) gl.getExtension('WEBGL_lose_context')?.loseContext();
          }).observe(el, { childList: true, characterData: true, subtree: true });
        });
      });
      const logged: string[] = [];
      page.on('console', (m) => logged.push(m.text()));
      await setUp(page);
      expectPersonKept(await runAndRead(page));
      expect(logged.some((l) => /The graphics chip stopped the person finder, using the CPU/.test(l))).toBe(true);
    });
  });

  test('a chip that is slower than the CPU is dropped after a few frames', async ({ baseURL, browserName }) => {
    test.skip(browserName !== 'chromium');
    test.setTimeout(420_000);
    await withChip(baseURL, async (page) => {
      // Every reading of the clock jumps 200 ms, so each frame looks as slow as emulated graphics would make it.
      await page.addInitScript(() => {
        const real = performance.now.bind(performance);
        let skew = 0;
        performance.now = () => real() + (skew += 200);
      });
      const logged: string[] = [];
      page.on('console', (m) => logged.push(m.text()));
      await setUp(page);
      expectPersonKept(await runAndRead(page));
      expect(logged.some((l) => /slower than the CPU here, using the CPU/.test(l))).toBe(true);
    });
  });
});
