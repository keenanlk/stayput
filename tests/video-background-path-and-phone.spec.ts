import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// After a run the page says which path found the person (the graphics chip or the processor), the progress line says
// "Estimating time left…" before its first figure, and on a phone a big clip gets a one-line hint that never blocks Run.
const clip = fileURLToPath(new URL('./fixtures/static/iphone-portrait-person.mov', import.meta.url));
const uhd = fileURLToPath(new URL('./fixtures/static/uhd-flat.mp4', import.meta.url));
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1';

test.describe('which path ran', () => {
  test('Better edges says graphics chip or processor, with ms a frame for the chip', async ({ page }) => {
    test.setTimeout(420_000);
    await page.goto('/tools/video-background-remover');
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    await page.locator('#file-input').setInputFiles([clip]);
    await page.evaluate(() => {
      const seen: string[] = [];
      (window as unknown as { __seen: string[] }).__seen = seen;
      const el = document.getElementById('progress-text')!;
      new MutationObserver(() => seen.push(el.textContent ?? '')).observe(el, { childList: true, characterData: true, subtree: true });
    });
    await page.locator('#run').click();
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 360_000 });
    const text = (await page.locator('#results-list').textContent()) ?? '';
    // CI has no graphics chip (software WebGL stays on the processor); a Mac with one prints the chip line.
    expect(text).toMatch(/Found the person with (the processor \(the graphics chip was slow or unavailable\)|the graphics chip \(about \d+ ms a frame\))/);
    // Where a frame's time went, so a phone run can be read without a profiler.
    expect(text).toMatch(/Each frame took about \d+ ms to find the person and draw the background, and \d+ ms more waiting/);
    const seen = await page.evaluate(() => (window as unknown as { __seen: string[] }).__seen);
    expect(seen.some((t) => t.includes('Estimating time left…'))).toBe(true);
    // No figure before the quiet period ends: any "left" figure comes after "Estimating" lines.
    const firstFigure = seen.findIndex((t) => /about [\d ]+(s|min|h)[\d ]*(min|s)? left/.test(t));
    const firstEstimating = seen.findIndex((t) => t.includes('Estimating time left…'));
    if (firstFigure >= 0) expect(firstEstimating).toBeLessThan(firstFigure);
  });

  test('Fast says it used the processor', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto('/tools/video-background-remover');
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    await page.locator('#file-input').setInputFiles([clip]);
    await page.locator('input[name="finder"][value="fast"]').evaluate((el) => (el as HTMLInputElement).click());
    await page.locator('#run').click();
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
    await expect(page.locator('#results-list')).toContainText('Found the person with the processor (Fast always uses it)');
  });
});

test.describe('phone note on a big clip', () => {
  test.describe('on a phone', () => {
    test.use({ userAgent: IPHONE, hasTouch: true });

    test('a 4K clip preselects 1080p output, says so, and still lets Run be pressed', async ({ page }) => {
      await page.goto('/tools/video-background-remover');
      await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
      await expect(page.locator('#phone-note')).toBeHidden();
      await expect(page.locator('input[name="size"][value="full"]')).toBeChecked();
      await page.locator('#file-input').setInputFiles([uhd]);
      await expect(page.locator('input[name="size"][value="hd"]')).toBeChecked();
      await expect(page.locator('#size-note')).toBeVisible();
      await expect(page.locator('#size-note')).toHaveClass(/hint/);
      await expect(page.locator('#phone-note')).toBeHidden();
      await expect(page.locator('#run')).toBeEnabled();
    });

    test('a size the person chose is kept', async ({ page }) => {
      await page.goto('/tools/video-background-remover');
      await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
      await page.locator('input[name="size"][value="full"]').evaluate((el) => (el as HTMLInputElement).click());
      await page.locator('input[name="size"][value="hd"]').evaluate((el) => (el as HTMLInputElement).click());
      await page.locator('input[name="size"][value="full"]').evaluate((el) => (el as HTMLInputElement).click());
      await page.locator('#file-input').setInputFiles([uhd]);
      await expect(page.locator('#file-list li')).toHaveCount(1);
      await expect(page.locator('input[name="size"][value="full"]')).toBeChecked();
      await expect(page.locator('#size-note')).toBeHidden();
      await expect(page.locator('#phone-note')).toBeVisible();
    });

    test('stays hidden for a small 720p clip', async ({ page }) => {
      await page.goto('/tools/video-background-remover');
      await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
      await page.locator('#file-input').setInputFiles([clip]);
      await expect(page.locator('#file-list li')).toHaveCount(1);
      await expect(page.locator('#phone-note')).toBeHidden();
    });

    test('shows for a file over 200 MB', async ({ page }) => {
      await page.goto('/blur-video-background');
      await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
      await page.evaluate(() => {
        const f = new File([new Uint8Array(1024)], 'long.mp4', { type: 'video/mp4' });
        Object.defineProperty(f, 'size', { value: 300_000_000 });
        const dt = new DataTransfer();
        dt.items.add(f);
        const input = document.getElementById('file-input') as HTMLInputElement;
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await expect(page.locator('#phone-note')).toBeVisible();
      await expect(page.locator('#run')).toBeEnabled();
    });
  });

  test('is hidden on desktop even for a 4K clip', async ({ page }) => {
    await page.goto('/tools/video-background-remover');
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    await page.locator('#file-input').setInputFiles([uhd]);
    await expect(page.locator('#file-list li')).toHaveCount(1);
    await expect(page.locator('#phone-note')).toBeHidden();
    await expect(page.locator('#size-note')).toBeHidden();
    await expect(page.locator('input[name="size"][value="full"]')).toBeChecked();
  });
});

test.describe('output size', () => {
  async function run(page: import('@playwright/test').Page, size: 'full' | 'hd', file: string) {
    await page.goto('/tools/video-background-remover');
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    await page.locator('#file-input').setInputFiles([file]);
    await page.locator('input[name="finder"][value="fast"]').evaluate((el) => (el as HTMLInputElement).click());
    await page.locator(`input[name="size"][value="${size}"]`).evaluate((el) => (el as HTMLInputElement).click());
    await page.locator('#run').click();
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
    await expect(page.locator('#error')).not.toHaveClass(/is-active/);
    return (await page.locator('#results-list').textContent()) ?? '';
  }

  test('1080p brings a 4K clip down to 1920×1080', async ({ page }) => {
    test.setTimeout(240_000);
    expect(await run(page, 'hd', uhd)).toContain('1920×1080');
  });

  test('Same as the video keeps the 4K size', async ({ page }) => {
    test.setTimeout(240_000);
    expect(await run(page, 'full', uhd)).toContain('3840×2160');
  });

  test('1080p never makes a smaller clip bigger', async ({ page }) => {
    test.setTimeout(240_000);
    expect(await run(page, 'hd', clip)).toContain('720×1280');
  });
});
