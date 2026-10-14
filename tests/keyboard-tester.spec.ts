// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { LAYOUTS, allCodes, shouldSwallow } from '../src/lib/keyboard-tester';

// Runs in Chromium and WebKit, and unchanged against https://stayput.dev.

declare global {
  interface Window {
    __events: { n: string; d: Record<string, string> }[];
  }
}

test('layouts: every code is unique per layout, ISO has the extra key, shortcuts are left alone', () => {
  for (const name of ['ansi', 'iso'] as const) {
    const codes = allCodes(name);
    expect(new Set(codes).size, name).toBe(codes.length);
    for (const c of ['KeyA', 'Digit0', 'F12', 'Numpad5', 'ArrowUp', 'ShiftLeft', 'ShiftRight', 'Space', 'Enter']) expect(codes).toContain(c);
  }
  expect(allCodes('ansi')).not.toContain('IntlBackslash');
  expect(allCodes('iso')).toContain('IntlBackslash');
  expect(LAYOUTS.ansi.length).toBe(LAYOUTS.iso.length);
  expect(shouldSwallow({ code: 'Space', ctrlKey: false, metaKey: false })).toBe(true);
  expect(shouldSwallow({ code: 'F5', ctrlKey: false, metaKey: false })).toBe(true);
  expect(shouldSwallow({ code: 'F5', ctrlKey: true, metaKey: false })).toBe(false);
  expect(shouldSwallow({ code: 'KeyW', ctrlKey: false, metaKey: true })).toBe(false);
});

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: 'window.__events=[];window.umami={track:(n,d)=>window.__events.push({n,d})};' }),
  );
  await page.goto('/tools/keyboard-tester');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  return errors;
}

const key = (page: Page, code: string) => page.locator(`#kbd-board [data-code="${code}"]`);

test('page has Keyboard Test in the title and H1, key tester in the copy, and no file zone', async ({ page }) => {
  const errors = await open(page);
  await expect(page).toHaveTitle(/Keyboard Test/);
  await expect(page.locator('h1')).toContainText('Keyboard Test');
  await expect(page.locator('main')).toContainText('key tester');
  await expect(page.locator('#drop')).toBeHidden();
  expect(errors).toEqual([]);
});

test('pressed keys light up on the ANSI layout, show key and code in the log, and Reset clears them', async ({ page }) => {
  const errors = await open(page);
  await page.keyboard.press('a');
  await page.keyboard.press('Shift+KeyB');
  await page.keyboard.press('F5');
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Numpad5');
  await page.keyboard.press('Tab');
  for (const c of ['KeyA', 'KeyB', 'ShiftLeft', 'F5', 'Space', 'ArrowUp', 'Numpad5', 'Tab']) {
    await expect(key(page, c), c).toHaveClass(/is-tested/);
  }
  await expect(key(page, 'KeyC')).not.toHaveClass(/is-tested/);
  await expect(key(page, 'KeyA')).not.toHaveClass(/is-down/); // released
  const log = page.locator('#kbd-log li');
  await expect(log.filter({ hasText: 'key: a' }).filter({ hasText: 'code: KeyA' })).toHaveCount(1);
  await expect(log.filter({ hasText: 'key: B' }).filter({ hasText: 'code: KeyB' })).toHaveCount(1);
  await expect(log.filter({ hasText: 'code: F5' })).toHaveCount(1);
  await expect(page.locator('#kbd-last-code')).toHaveText('Tab');
  expect(page.url()).toContain('/tools/keyboard-tester'); // F5 and Space did not navigate or reload
  await page.locator('#kbd-reset').click();
  await expect(page.locator('#kbd-log li')).toHaveCount(0);
  await expect(page.locator('#kbd-board .is-tested')).toHaveCount(0);
  await expect(page.locator('#kbd-count')).toContainText('0 of');
  expect(errors).toEqual([]);
});

test('a key is shown as down while held', async ({ page }) => {
  await open(page);
  await page.keyboard.down('KeyG');
  await expect(key(page, 'KeyG')).toHaveClass(/is-down/);
  await page.keyboard.up('KeyG');
  await expect(key(page, 'KeyG')).not.toHaveClass(/is-down/);
  await expect(key(page, 'KeyG')).toHaveClass(/is-tested/);
});

test('ISO layout shows the extra key and keeps tested keys', async ({ page }) => {
  await open(page);
  await expect(key(page, 'IntlBackslash')).toHaveCount(0);
  await page.keyboard.press('KeyQ');
  await page.locator('label.kbd-choice:has(input[value="iso"])').click();
  await expect(key(page, 'IntlBackslash')).toHaveCount(1);
  await expect(key(page, 'KeyQ')).toHaveClass(/is-tested/);
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { code: 'IntlBackslash', key: '\\' })));
  await expect(key(page, 'IntlBackslash')).toHaveClass(/is-tested/);
  await expect(page.locator('#kbd-log li').filter({ hasText: 'code: IntlBackslash' })).toHaveCount(1);
});

test('what is typed never reaches the network or the analytics event', async ({ page }) => {
  const sent: { url: string; body: string }[] = [];
  page.on('request', (r) => sent.push({ url: r.url(), body: r.postData() ?? '' }));
  await open(page);
  await page.waitForTimeout(500);
  const before = sent.length;
  const typed = ['KeyZ', 'KeyX', 'Digit7', 'Digit9', 'Numpad3', 'F7', 'Backquote', 'Semicolon'];
  for (const c of typed) await page.keyboard.press(c);
  await page.waitForTimeout(500);
  const after = sent.slice(before);
  // Everything sent after the first key is only the one usage event; none of it names a key.
  const needles = [...typed, 'Key', 'Digit', 'Numpad', 'Backquote', 'Semicolon', 'keydown', 'code='];
  for (const r of after) {
    for (const n of needles) {
      expect(r.url, `url ${r.url} contains ${n}`).not.toContain(n);
      expect(r.body, `body of ${r.url} contains ${n}`).not.toContain(n);
    }
  }
  const events = await page.evaluate(() => window.__events);
  const runs = events.filter((e) => e.n === 'tool_run');
  expect(runs).toHaveLength(1);
  const payload = JSON.stringify(runs[0]);
  for (const n of needles) expect(payload).not.toContain(n);
  expect(runs[0]!.d.tool).toBe('keyboard-tester');
  console.log('analytics payload:', payload);
});
