import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { injectExperiment } from './ab-inject';
import { activeExperimentKeys, experiments } from '../src/data/experiments';
import { abCss } from '../src/lib/ab';

const AB_JS = readFileSync(fileURLToPath(new URL('../public/ab.js', import.meta.url)), 'utf8');

/** Run public/ab.js once against a fake page, with the real Web Crypto and an optional sessionStorage. */
function runOnce(keys: string, session: Map<string, string> | 'throws' = new Map()) {
  const attrs = new Map<string, string>();
  const sessionStorage =
    session === 'throws'
      ? { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } }
      : { getItem: (k: string) => session.get(k) ?? null, setItem: (k: string, v: string) => void session.set(k, v) };
  const window = { crypto: globalThis.crypto, sessionStorage };
  vm.runInNewContext(AB_JS, {
    window,
    sessionStorage,
    Uint8Array,
    document: {
      querySelector: () => ({ getAttribute: () => keys }),
      documentElement: { setAttribute: (k: string, v: string) => void attrs.set(k, v) },
    },
  });
  return attrs;
}

test('about 1000 fresh visits split 50/50 within 5%', () => {
  let b = 0;
  for (let i = 0; i < 1000; i++) if (runOnce('t').get('data-ab-t') === 'B') b++;
  expect(b).toBeGreaterThan(450);
  expect(b).toBeLessThan(550);
});

test('the label is kept for the visit, and each key is picked on its own', () => {
  const session = new Map<string, string>();
  const first = runOnce('one,two', session);
  for (let i = 0; i < 20; i++) expect(runOnce('one,two', session)).toEqual(first);
  expect([...session.keys()].sort()).toEqual(['stayput:ab:one', 'stayput:ab:two']);
  let differs = false;
  for (let i = 0; i < 50 && !differs; i++) {
    const a = runOnce('one,two');
    differs = a.get('data-ab-one') !== a.get('data-ab-two');
  }
  expect(differs).toBe(true);
});

test('with sessionStorage blocked it still picks, for that page only, and ignores bad keys', () => {
  expect(['A', 'B']).toContain(runOnce('t', 'throws').get('data-ab-t'));
  expect(runOnce('Bad Key,,x_y', 'throws').size).toBe(0);
});

test('only home-hero is active in the site config, and only the home page has A/B markup', () => {
  expect(activeExperimentKeys(experiments)).toEqual(['home-hero']);
  expect(activeExperimentKeys([{ key: 'a', active: true }, { key: 'b', active: false }])).toEqual(['a']);
  const dist = fileURLToPath(new URL('../dist/', import.meta.url));
  for (const f of readdirSync(dist).filter((n) => n.endsWith('.html'))) {
    const html = readFileSync(dist + f, 'utf8');
    expect(html, f).toContain('stayput-ab');
    expect(html, f).toContain('/ab.js');
    if (f !== 'index.html') expect(html, f).not.toContain('data-ab="home-hero');
  }
});

test.describe('in the browser, with a test experiment on', () => {
  test('the label is kept across page views, and the cookie jar and localStorage are untouched', async ({ page }) => {
    await injectExperiment(page, ['ab-test']);
    await page.goto('/');
    const cookie = await page.evaluate(() => document.cookie);
    const label = await page.evaluate(() => document.documentElement.getAttribute('data-ab-ab-test'));
    expect(['A', 'B']).toContain(label);
    for (const path of ['/privacy', '/', '/tools/strip-exif']) {
      await page.goto(path);
      expect(await page.evaluate(() => document.documentElement.getAttribute('data-ab-ab-test'))).toBe(label);
    }
    const state = await page.evaluate(() => ({
      cookie: document.cookie,
      local: Object.keys(localStorage).filter((k) => k.includes('ab')),
      session: Object.keys(sessionStorage).filter((k) => k.startsWith('stayput:ab:')),
    }));
    expect(state.cookie).toBe(cookie);
    expect((await page.context().cookies()).length).toBe(0);
    expect(state.local).toEqual([]);
    expect(state.session).toEqual(['stayput:ab:ab-test']);
  });

  test('a new tab (new context) is a new visit and picks again', async ({ browser }) => {
    const seen = new Set<string>();
    for (let i = 0; i < 24 && seen.size < 2; i++) {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await injectExperiment(page, ['ab-test']);
      await page.goto('/privacy');
      seen.add((await page.evaluate(() => document.documentElement.getAttribute('data-ab-ab-test'))) ?? 'none');
      await ctx.close();
    }
    expect([...seen].sort()).toEqual(['A', 'B']);
  });

  test('the label is set before paint and only the matching branch shows', async ({ page }) => {
    await injectExperiment(page, ['ab-test'], undefined, (html) =>
      html.replace('<h1', '<div data-ab="ab-test:A" id="va">A</div><div data-ab="ab-test:B" id="vb">B</div><h1'),
    );
    expect(abCss(['ab-test'])).toContain('data-ab="ab-test:B"');
    // Force the pick: Web Crypto returns an odd byte, so branch B.
    await page.addInitScript(() => {
      Crypto.prototype.getRandomValues = function <T extends ArrayBufferView | null>(a: T): T {
        (a as unknown as Uint8Array)[0] = 1;
        return a;
      };
    });
    await page.goto('/privacy');
    await expect(page.locator('html')).toHaveAttribute('data-ab-ab-test', 'B');
    await expect(page.locator('#vb')).toBeVisible();
    await expect(page.locator('#va')).toBeHidden();
  });
});
