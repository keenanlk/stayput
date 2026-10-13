import { test, expect, type Page } from '@playwright/test';
import { allowServiceWorker } from './allow-sw';

// Automated browsers must not install the offline cache (it precaches every page per fresh context).
test.use({ serviceWorkers: 'allow' });

async function registrations(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('load');
  await page.waitForTimeout(1500);
  return page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length);
}

test('an automated browser does not register the service worker', async ({ page }) => {
  await page.goto('/');
  expect(await page.evaluate(() => navigator.webdriver)).toBe(true);
  expect(await registrations(page)).toBe(0);
});

test('the test-only override registers it', async ({ page, context }) => {
  await allowServiceWorker(context);
  await page.goto('/');
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(1);
});
