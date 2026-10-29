import type { Page } from '@playwright/test';
import { abCss } from '../src/lib/ab';

/**
 * Turn a test-only experiment on for one page, the way Base.astro does when an
 * experiment in src/data/experiments.ts is active: add the key meta, the CSS and
 * the blocking public/ab.js script to the <head> of every HTML document.
 * No experiment is active in the real build, so this is the only way a test sees one.
 *
 * `from`/`to` map the page's address to the local server (used by specs that serve
 * the site under its real hostname); leave them out when the page is already local.
 */
export async function injectExperiment(page: Page, keys: string[], map?: { from: string; to: string }, transform: (html: string) => string = (h) => h): Promise<void> {
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') return route.fallback();
    const url = route.request().url();
    const res = await route.fetch(map ? { url: url.replace(map.from, map.to) } : undefined);
    const head = `<head><meta name="stayput-ab" content="${keys.join(',')}"><style>${abCss(keys)}</style><script src="/ab.js"></script>`;
    await route.fulfill({ response: res, body: transform((await res.text()).replace('<head>', head)) });
  });
}
