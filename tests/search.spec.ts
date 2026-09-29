import { test, expect } from '@playwright/test';
import { buildIndex } from '../src/data/search-index';
import { search } from '../src/lib/search';

const index = buildIndex();
const top = (q: string, n = 1) => search(index, q).slice(0, n).map((e) => e.p);

test.describe('search ranking', () => {
  test('index covers tools, conversion pages and guides', () => {
    const kinds = new Set(index.map((e) => e.k));
    expect(kinds).toEqual(new Set(['tool', 'page', 'guide']));
    expect(index.some((e) => e.p === '/tools/heic-to-jpg')).toBe(true);
    expect(index.some((e) => e.p === '/webp-to-png')).toBe(true);
    expect(index.some((e) => e.p.startsWith('/guides/'))).toBe(true);
    expect(new Set(index.map((e) => e.p)).size).toBe(index.length);
  });

  test('exact names win', () => {
    expect(top('merge pdf')).toEqual(['/tools/merge-pdf']);
    expect(top('heic to jpg')).toEqual(['/tools/heic-to-jpg']);
    expect(top('webp to png')).toEqual(['/webp-to-png']);
  });

  test('pair order matters', () => {
    expect(top('png to webp')).toEqual(['/png-to-webp']);
    expect(top('pdf to jpg')).toEqual(['/pdf-to-jpg']);
    expect(top('jpg to pdf')).toEqual(['/jpg-to-pdf']);
  });

  test('prefixes match while typing', () => {
    expect(top('hei')).toEqual(['/tools/heic-to-jpg']);
    expect(top('unl')).toEqual(['/tools/unlock-pdf']);
  });

  test('everyday words find the tool', () => {
    expect(top('shrink pdf')).toEqual(['/tools/compress-pdf']);
    expect(top('make photo smaller', 3)).toContain('/tools/compress-image');
    expect(top('iphone photo', 3)).toContain('/tools/heic-to-jpg');
    expect(top('remove password')).toEqual(['/tools/unlock-pdf']);
    expect(top('gps', 3)).toContain('/tools/strip-exif');
    expect(top('ocr')).toEqual(['/tools/image-to-text']);
    expect(top('gif', 3)).toContain('/tools/video-to-gif');
    expect(top('jpeg to png')).toEqual(['/jpg-to-png']);
    expect(top('signature', 2)).toContain('/tools/sign-pdf');
    expect(top('audio from video', 3)).toContain('/tools/video-to-mp3');
  });

  test('empty query lists the tools; nonsense finds nothing', () => {
    const all = search(index, '  ');
    expect(all.length).toBeGreaterThan(20);
    expect(all.every((e) => e.k === 'tool')).toBe(true);
    expect(search(index, 'qzxv')).toEqual([]);
    // No half matches: a job the site cannot do shows the empty state, not look-alikes.
    expect(search(index, 'remove background')).toEqual([]);
  });
});

test.describe('header search', () => {
  test('keyboard: slash opens, arrows move, enter goes', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('/');
    const input = page.getByRole('combobox', { name: 'Search tools' });
    await expect(input).toBeFocused();
    await input.fill('shrink pdf');
    const options = page.getByRole('option');
    await expect(options.first()).toContainText('Compress PDF');
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');
    await input.press('ArrowDown');
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
    await input.press('ArrowUp');
    await input.press('Enter');
    await expect(page).toHaveURL(/\/tools\/compress-pdf$/);
  });

  test('ctrl+k opens from a tool page; escape closes', async ({ page }) => {
    await page.goto('/tools/merge-pdf');
    await page.keyboard.press('Control+k');
    const input = page.getByRole('combobox', { name: 'Search tools' });
    await expect(input).toBeFocused();
    await input.press('Escape');
    await expect(input).toBeHidden();
  });

  test('the button opens it, and closing returns focus to the button', async ({ page }) => {
    await page.goto('/guides');
    const trigger = page.getByRole('button', { name: 'Search tools' });
    await trigger.click();
    const input = page.getByRole('combobox', { name: 'Search tools' });
    await expect(input).toBeFocused();
    await expect(page.getByRole('option').first()).toBeVisible();
    await input.press('Escape');
    await expect(trigger).toBeFocused();
  });

  test('shows a message when nothing matches', async ({ page }) => {
    await page.goto('/about');
    await page.locator('.search-trigger').click();
    await page.getByRole('combobox', { name: 'Search tools' }).fill('qzxv');
    await expect(page.locator('.search-empty')).toBeVisible();
  });

  test('works on a phone: icon opens a full-width search, tap goes', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const trigger = page.locator('.search-trigger');
    await expect(trigger).toBeVisible();
    await trigger.click();
    const panel = page.locator('.search-dialog');
    const box = await panel.boundingBox();
    expect(box!.width).toBeGreaterThan(370);
    await page.getByRole('combobox', { name: 'Search tools' }).fill('mp3');
    await page.getByRole('option').first().click();
    await expect(page).toHaveURL(/mp3/);
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(390);
  });

  test('query text is never sent anywhere', async ({ page }) => {
    const urls: string[] = [];
    page.on('request', (r) => urls.push(r.url() + ' ' + (r.postData() ?? '')));
    await page.goto('/');
    await page.keyboard.press('/');
    await page.getByRole('combobox', { name: 'Search tools' }).fill('secretword');
    await page.waitForTimeout(300);
    expect(urls.filter((u) => u.includes('secretword'))).toEqual([]);
  });
});
