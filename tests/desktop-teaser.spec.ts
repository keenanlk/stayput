import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DESKTOP_TEST_SLUGS } from '../src/lib/desktop-teaser';

// The "desktop app" painted-door test: one line under the results of a few video/transcription tools, on desktop
// browsers only, and three noindex pages that add no request, event or storage of their own.
const clip = fileURLToPath(new URL('./fixtures/static/clip-720p-10s.mp4', import.meta.url));
const LINE = "We're considering a desktop app →";
const dist = new URL('../dist/', import.meta.url);

const desktop = { viewport: { width: 1280, height: 800 } };
const phone = {
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
};

type Ev = { n: string; d: Record<string, string> };
const events = (page: Page): Promise<Ev[]> => page.evaluate(() => JSON.parse(sessionStorage.getItem('__ev') || '[]'));

async function stubUmami(page: Page) {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const k='__ev';const a=JSON.parse(sessionStorage.getItem(k)||'[]');a.push({n,d});sessionStorage.setItem(k,JSON.stringify(a));}};`,
    }),
  );
}

async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
}

/** Finish a real run of the noise remover on the 10-second clip. */
async function okRun(page: Page, path = '/remove-background-noise-from-video') {
  await open(page, path);
  await page.locator('#file-input').setInputFiles(clip);
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 80_000 });
}

/** The shell's own success signal, for tools whose real run needs a speech model downloaded first. */
const finish = (page: Page) => page.locator('#tool').evaluate((el) => el.dispatchEvent(new CustomEvent('stayput:done', { detail: [] })));

const teaser = (page: Page) => page.locator('#results #desktop-teaser a');

test.describe('desktop browser', () => {
  test.use(desktop);

  test('a finished noise-removal run shows the line, linking to /desktop, and a new run clears it', async ({ page }) => {
    await okRun(page);
    await expect(teaser(page)).toHaveAttribute('href', '/desktop');
    await expect(page.locator('#results p#desktop-teaser')).toHaveText(`Want this faster, and for whole folders at a time? ${LINE}`);
    await expect(page.locator('#results p#desktop-teaser')).toHaveClass(/support-note/);
    await page.locator('#run').click();
    await expect(teaser(page)).toHaveCount(0);
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 80_000 });
    await expect(teaser(page)).toHaveCount(1);
  });

  test('every listed page shows it after a success, and the transcribe tool and an add-subtitles preset are among them', async ({ page }) => {
    expect(DESKTOP_TEST_SLUGS).toHaveLength(9);
    const paths: Record<string, string> = { transcribe: '/tools/transcribe', 'add-subtitles-to-video': '/tools/add-subtitles-to-video', 'video-background-remover': '/tools/video-background-remover' };
    for (const slug of DESKTOP_TEST_SLUGS) {
      await open(page, paths[slug] ?? `/${slug}`);
      await expect(page.locator('#tool')).toHaveAttribute('data-slug', slug);
      await expect(teaser(page)).toHaveCount(0);
      await finish(page);
      await expect(teaser(page), slug).toHaveAttribute('href', '/desktop');
      await expect(teaser(page), slug).toHaveText(LINE);
    }
  });

  test('a run that ends in an error shows no line', async ({ page }) => {
    await open(page, '/remove-background-noise-from-video');
    await page.locator('#file-input').setInputFiles({ name: 'broken.mp4', mimeType: 'video/mp4', buffer: Buffer.from('this is not a video') });
    await page.locator('#run').click();
    await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 60_000 });
    await expect(teaser(page)).toHaveCount(0);
    // A finish signal while an error is on screen (some files skipped) stays quiet too.
    await finish(page);
    await expect(teaser(page)).toHaveCount(0);
  });

  test('pages outside the list never show it', async ({ page }) => {
    // A transcribe preset that is not listed, the presets of other tools, and an unrelated tool.
    for (const path of ['/mp3-to-text', '/tools/strip-exif', '/tools/compress-video']) {
      await open(page, path);
      await finish(page);
      await expect(teaser(page), path).toHaveCount(0);
    }
  });
});

test.describe('phone', () => {
  test.use(phone);

  test('no line on a phone, even after a success', async ({ page }) => {
    await open(page, '/tools/transcribe');
    await finish(page);
    await expect(teaser(page)).toHaveCount(0);
  });
});

test.describe('narrow desktop window', () => {
  test.use({ viewport: { width: 800, height: 800 } });

  test('under 900px wide there is no line', async ({ page }) => {
    await open(page, '/tools/transcribe');
    await finish(page);
    await expect(teaser(page)).toHaveCount(0);
  });
});

test.describe('/desktop pages', () => {
  test.use(desktop);
  const pages = ['/desktop', '/desktop/29', '/desktop/49'];

  test('each is noindex, and is left out of the sitemap, llms.txt and the search index', async ({ request }) => {
    for (const p of pages) {
      const html = await (await request.get(p)).text();
      expect(html, p).toContain('<meta name="robots" content="noindex">');
      expect(html, p).not.toContain('rel="canonical"');
    }
    const maps = ['sitemap-index.xml', 'sitemap-0.xml'].map((f) => readFileSync(new URL(f, dist), 'utf8')).join('\n');
    const llms = readFileSync(new URL('llms.txt', dist), 'utf8');
    const search = readFileSync(new URL('search-index.json', dist), 'utf8');
    for (const doc of [maps, llms, search]) expect(doc).not.toMatch(/stayput\.dev\/desktop|"\/desktop|\(\/desktop/);
  });

  test('the nav and footer do not link to them', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('a[href^="/desktop"]')).toHaveCount(0);
  });

  test('/desktop has the two equal buttons and the quiet link; titles and descriptions match the copy', async ({ page }) => {
    await page.goto('/desktop');
    await expect(page).toHaveTitle('A Stayput desktop app? | Stayput');
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', "We're considering a Stayput desktop app. It isn't built and nothing is for sale. If you'd pay for one, press a button to tell us. No sign-up, no email.");
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('A Stayput desktop app?');
    const a29 = page.getByRole('link', { name: "I'd pay $29" });
    const a49 = page.getByRole('link', { name: "I'd pay $49" });
    await expect(a29).toHaveAttribute('href', '/desktop/29');
    await expect(a49).toHaveAttribute('href', '/desktop/49');
    expect(await a29.getAttribute('class')).toBe(await a49.getAttribute('class'));
    const [b29, b49] = await Promise.all([a29.boundingBox(), a49.boundingBox()]);
    expect(Math.abs(b29!.width - b49!.width)).toBeLessThan(2);
    await expect(page.getByRole('link', { name: 'No thanks, back to the tools →' })).toHaveAttribute('href', '/');
    await expect(page.locator('form')).toHaveCount(0);
  });

  for (const price of ['29', '49']) {
    test(`/desktop/${price} says what it records`, async ({ page }) => {
      await page.goto(`/desktop/${price}`);
      await expect(page).toHaveTitle('Thanks | Stayput');
      await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', `Thanks for telling us you'd pay $${price} for a Stayput desktop app. Nothing was bought.`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Thanks, that helps');
      await expect(page.locator('article')).toContainText(`You told us you'd pay $${price} for a Stayput desktop app. Nothing was bought and nothing was charged.`);
      await expect(page.getByRole('link', { name: 'Back to the tools' })).toHaveAttribute('href', '/');
    });
  }

  test('they make no request beyond this site and the page view, send no Umami event, and store nothing', async ({ page }) => {
    await stubUmami(page);
    const seen: string[] = [];
    page.on('request', (r) => seen.push(r.url()));
    for (const p of pages) {
      await page.goto(p);
      await page.waitForLoadState('networkidle');
      // Click through the buttons as a visitor would.
      if (p === '/desktop') await page.getByRole('link', { name: "I'd pay $29" }).click();
    }
    for (const u of seen) {
      if (u.startsWith('data:') || u.startsWith('blob:')) continue;
      const url = new URL(u);
      if (url.hostname === 'stats.keenankaufman.com') continue; // the page view script, stubbed here
      expect(url.origin, u).toBe(new URL(page.url()).origin);
    }
    expect((await events(page)).filter((e) => e.n !== 'visit_start'), 'no custom event').toEqual([]);
    const stored = await page.evaluate(() => ({ local: Object.keys(localStorage), cookie: document.cookie }));
    // Whatever the site already keeps on every page (its visit counter), nothing more.
    await page.goto('/privacy');
    expect(stored.local).toEqual(await page.evaluate(() => Object.keys(localStorage)));
    expect(stored.cookie).toBe('');
  });
});
