// @webkit-project
import { test, expect, type Page } from '@playwright/test';

// Runs in Chromium and WebKit, and unchanged against https://stayput.dev
// (baseURL). Full screen may be refused in a headless browser, in which case the page fills the
// window and says so; either way the layer's background colour is what is asserted.

const RGB: Record<string, string> = {
  black: 'rgb(0, 0, 0)',
  white: 'rgb(255, 255, 255)',
  red: 'rgb(255, 0, 0)',
  green: 'rgb(0, 255, 0)',
  blue: 'rgb(0, 0, 255)',
};
const ORDER = ['black', 'white', 'red', 'green', 'blue'];

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: 'window.umami={track:()=>{}};' }),
  );
  await page.goto('/tools/dead-pixel-test');
  await expect(page.locator('h1')).toBeVisible();
  return errors;
}

const colourIs = async (page: Page, name: string) => {
  await expect(page.locator('#dpx-screen')).toHaveCSS('background-color', RGB[name]!);
  await expect(page.locator('#dpx-screen')).toHaveAttribute('data-colour', name);
};

test('steps through every colour by click and arrow key, and Esc exits', async ({ page }) => {
  const errors = await open(page);
  const screen = page.locator('#dpx-screen');
  await expect(screen).toBeHidden();
  await page.locator('#dpx-start').click();
  await expect(screen).toBeVisible();
  await expect(screen).toHaveAttribute('data-mode', /^(fullscreen|window)$/);
  const mode = await screen.getAttribute('data-mode');
  if (mode === 'fullscreen') expect(await page.evaluate(() => !!(document.fullscreenElement ?? (document as any).webkitFullscreenElement))).toBe(true);
  await expect(screen).toHaveCSS('cursor', 'none');
  await colourIs(page, 'black');

  // By click: black -> white -> red -> green -> blue.
  for (const name of ORDER.slice(1)) {
    await page.mouse.click(200, 200);
    await colourIs(page, name);
  }
  // Wraps to black.
  await page.mouse.click(200, 200);
  await colourIs(page, 'black');

  // By arrow key forward, then back.
  for (const name of ORDER.slice(1)) {
    await page.keyboard.press('ArrowRight');
    await colourIs(page, name);
  }
  await page.keyboard.press('ArrowLeft');
  await colourIs(page, 'green');
  await page.keyboard.press('ArrowDown');
  await colourIs(page, 'blue');

  await page.keyboard.press('Escape');
  await expect(screen).toBeHidden();
  await expect(page.locator('#dpx-start')).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!(document.fullscreenElement ?? (document as any).webkitFullscreenElement))).toBe(false);
  expect(errors).toEqual([]);
});

test('a colour button starts on that colour, and cycle mode advances by itself', async ({ page }) => {
  await open(page);
  await page.locator('#dpx-cycle').check();
  await page.locator('#dpx-seconds').selectOption('2');
  await page.locator('.dpx-swatch[data-colour="red"]').click();
  await colourIs(page, 'red');
  await expect(page.locator('#dpx-screen')).toHaveAttribute('data-colour', 'green', { timeout: 6000 });
  await expect(page.locator('#dpx-screen')).toHaveAttribute('data-colour', 'blue', { timeout: 6000 });
  await page.keyboard.press('Escape');
  await expect(page.locator('#dpx-screen')).toBeHidden();
});

test('the copy explains dead and stuck pixels and is honest about what a test cannot do', async ({ page }) => {
  await open(page);
  const body = (await page.locator('body').innerText()).toLowerCase();
  expect(body).toContain('dead pixel checker');
  expect(body).toContain('screen test');
  expect(body).toContain('stays black');
  expect(body).toContain('cannot fix');
});
