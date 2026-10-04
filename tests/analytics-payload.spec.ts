import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeSend } from '../src/lib/analytics-payload';

const fx = (name: string) => fileURLToPath(new URL(`./fixtures/generated/${name}`, import.meta.url));
// A copy of the tracker the stats host serves, so the test never contacts that host.
const TRACKER = readFileSync(fileURLToPath(new URL('./vendor/umami-st.js', import.meta.url)), 'utf8');
const SITE = 'https://stayput.dev';

/** Top-level fields an event may carry. Keep in step with /privacy. */
const TOP_LEVEL = new Set(['website', 'hostname', 'url', 'name', 'data']);
const VISIT = ['landing', 'ref', 'from', 'visit', 'via'];
/**
 * Every event and the details it may carry. Keep in step with /privacy: `label` is how
 * the page names the event, and the test below checks the page still names each one.
 * Anything not listed here, an event or a key, fails.
 */
const EVENTS: Record<string, { label: string; keys: string[] }> = {
  visit_start: { label: 'Visit start', keys: ['landing', 'ref', 'visit'] },
  files_added: { label: 'Files added', keys: ['tool', 'files', 'input', ...VISIT] },
  tool_run: {
    label: 'Tool run',
    keys: ['tool', 'outcome', 'attempt', 'files', 'input', 'output', 'duration', 'format', 'error_class', ...VISIT, 'prev_tool', 'run_n', 'tools_used', 'run_gap', 'ns'],
  },
  next_step: { label: 'Next step click', keys: ['tool', 'to', 'ns'] },
  search_open: { label: 'Search opened', keys: ['page'] },
  search_pick: { label: 'Search result opened', keys: ['to', 'kind', 'rank'] },
  pwa_install: { label: 'App installed', keys: [] },
};

/** The values `ref` may take: a short source name, never a URL. */
const REFS = new Set([
  'direct', 'internal', 'other', 'google', 'bing', 'duckduckgo', 'yahoo', 'ecosia', 'brave', 'yandex', 'kagi', 'startpage', 'qwant',
  'perplexity', 'chatgpt', 'claude', 'reddit', 'hackernews', 'producthunt', 'github', 'bluesky', 'x', 'facebook', 'linkedin', 'devto',
  'alternativeto', 'indiehackers', 'instagram', 'youtube', 'tiktok', 'mastodon', 'mcpregistry', 'glama', 'mcpso', 'smithery', 'nologin',
  'openalternative', 'opensourcealternative', 'uneed', 'peerlist', 'privacyguides',
]);

/** An error kind is a class name only: letters and digits, at most 40, never a sentence. */
const ERROR_CLASS = /^[A-Za-z][A-Za-z0-9]{0,39}$/;

type Sent = { type: string; payload: Record<string, unknown> };
/** Request headers the tracker may add: the site id, the hostname and the in-memory session token. */
const UMAMI_HEADERS = new Set(['x-umami-website-id', 'x-umami-hostname', 'x-umami-cache']);
const headerLog: Record<string, string>[] = [];

/** Everything wrong with one analytics request body; empty when it is clean. */
function violations({ type, payload }: Sent): string[] {
  const bad: string[] = [];
  if (type !== 'event') bad.push(`type ${type}`);
  for (const k of Object.keys(payload)) if (!TOP_LEVEL.has(k)) bad.push(`field ${k}`);
  const url = payload.url;
  if (typeof url !== 'string' || !url.startsWith('/') || /[?#]/.test(url)) bad.push(`url ${String(url)}`);
  if (payload.hostname !== 'stayput.dev') bad.push(`hostname ${String(payload.hostname)}`);
  const data = (payload.data ?? {}) as Record<string, unknown>;
  if (payload.name === undefined) {
    if (payload.data !== undefined) bad.push('page view with data');
  } else {
    const event = EVENTS[String(payload.name)];
    if (!event) bad.push(`event ${String(payload.name)}`);
    else for (const k of Object.keys(data)) if (!event.keys.includes(k)) bad.push(`${String(payload.name)}.${k}`);
  }
  if ('error_class' in data && !ERROR_CLASS.test(String(data.error_class))) bad.push(`data.error_class ${String(data.error_class)}`);
  if ('ref' in data && !REFS.has(String(data.ref))) bad.push(`data.ref ${String(data.ref)}`);
  return bad;
}

/** Serve the site from the local server under its real hostname, so the tracker's domain check passes. */
async function serveSiteLocally(page: Page, origin: string) {
  await page.route(`${SITE}/**`, async (route) => {
    const res = await route.fetch({ url: route.request().url().replace(SITE, origin) });
    await route.fulfill({ response: res });
  });
}

/** Run the tracker as a real visitor would, with every request to the stats host intercepted. */
async function captureAnalytics(page: Page, origin: string): Promise<Sent[]> {
  const sent: Sent[] = [];
  headerLog.length = 0;
  // Automated browsers set navigator.webdriver and the site then skips analytics. Only this test undoes that.
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await serveSiteLocally(page, origin);
  await page.route('https://stats.keenankaufman.com/st.js', (route) => route.fulfill({ contentType: 'text/javascript', body: TRACKER }));
  await page.route('https://stats.keenankaufman.com/api/st', (route) => {
    sent.push(route.request().postDataJSON());
    headerLog.push(route.request().headers());
    // Like the real server: hand back a session token for the tracker to keep in memory.
    return route.fulfill({ contentType: 'application/json', body: '{"cache":"test-token"}' });
  });
  // Nothing else may reach the stats host.
  await page.route(/^https:\/\/stats\.keenankaufman\.com\/(?!st\.js$|api\/st$)/, (route) => route.abort());
  return sent;
}

test('page view, files added and tool run send only the documented fields', async ({ page, baseURL }) => {
  const sent = await captureAnalytics(page, baseURL!);
  // Arrive from another site, with a query string and a fragment that must not be sent.
  await page.goto(`${SITE}/tools/strip-exif?q=secret-term&utm_source=x#section`, { referer: 'https://www.example.com/private/page?token=abc' });
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(fx('photo.jpg'));
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 60_000 });
  await expect.poll(() => sent.filter((s) => s.payload.name === 'tool_run').length).toBeGreaterThan(0);

  const names = sent.map((s) => s.payload.name);
  expect(names).toContain(undefined); // the page view
  expect(names).toEqual(expect.arrayContaining(['visit_start', 'files_added', 'tool_run']));
  expect(names.every((n) => n === undefined || (typeof n === 'string' && n in EVENTS))).toBe(true);
  for (const s of sent) {
    expect(violations(s), JSON.stringify(s)).toEqual([]);
    expect(s.payload.website).toBe('52e5e00a-c867-497a-9f44-14c769361768');
    expect(s.payload.url).toBe('/tools/strip-exif');
  }
  // Only the documented request headers, and the token goes back after the first reply.
  for (const h of headerLog) for (const k of Object.keys(h)) if (k.startsWith('x-umami-')) expect(UMAMI_HEADERS.has(k), k).toBe(true);
  expect(headerLog[0]!['x-umami-cache']).toBeUndefined();
  expect(headerLog.at(-1)!['x-umami-cache']).toBe('test-token');
  const raw = JSON.stringify(sent);
  for (const secret of ['example.com', 'secret-term', 'token=abc', 'section', 'photo']) expect(raw).not.toContain(secret);
});

test('a failed run sends the original error class as the kind, with no message and no new keys', async ({ page, baseURL }) => {
  const sent = await captureAnalytics(page, baseURL!);
  // Make the tool itself throw a TypeError whose message carries a recognisable secret.
  await page.addInitScript(() => {
    (window as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
      constructor() {
        throw new TypeError('secret-message-from-the-tool');
      }
    };
  });
  await page.goto(`${SITE}/tools/compress-gif`);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(fx('anim.gif'));
  await page.locator('#run').click();
  await expect(page.locator('#error')).toContainText('secret-message-from-the-tool');
  await expect.poll(() => sent.filter((s) => s.payload.name === 'tool_run').length).toBe(1);
  const run = sent.find((s) => s.payload.name === 'tool_run')!;
  expect(violations(run), JSON.stringify(run)).toEqual([]);
  const data = run.payload.data as Record<string, string>;
  expect(data).toMatchObject({ tool: 'compress-gif', outcome: 'error', error_class: 'TypeError' });
  const raw = JSON.stringify(sent);
  for (const secret of ['secret-message', 'anim']) expect(raw).not.toContain(secret);
});

test('search and next-step events send only what /privacy lists, and never the typed words', async ({ page, baseURL }) => {
  const sent = await captureAnalytics(page, baseURL!);
  await page.addInitScript(() => (Math.random = () => 0.1)); // experiment arm "on": next steps are shown
  await page.goto(`${SITE}/`);
  await page.keyboard.press('/');
  const input = page.getByRole('combobox', { name: 'Search tools' });
  await input.fill('remove gps');
  await expect(page.getByRole('option').first()).toContainText('Remove EXIF Data');
  await input.press('Enter');
  await expect(page).toHaveURL(/\/tools\/strip-exif$/);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(fx('photo.jpg'));
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 60_000 });
  await expect.poll(() => sent.filter((s) => s.payload.name === 'tool_run').length).toBeGreaterThan(0);
  await page.locator('#next-steps a').first().click();
  await expect.poll(() => sent.filter((s) => s.payload.name === 'next_step').length).toBeGreaterThan(0);
  await page.waitForURL((u) => !u.pathname.endsWith('/tools/strip-exif'));
  await page.waitForLoadState('load');
  await page.waitForFunction(() => 'umami' in window);
  // The install prompt cannot be triggered in a test; send the event the way install.ts does.
  await page.evaluate(() => (window as unknown as { umami: { track(n: string): void } }).umami.track('pwa_install'));
  await expect.poll(() => sent.filter((s) => s.payload.name === 'pwa_install').length).toBeGreaterThan(0);

  const names = new Set(sent.map((s) => s.payload.name));
  for (const n of ['search_open', 'search_pick', 'files_added', 'tool_run', 'next_step', 'pwa_install']) expect(names, n).toContain(n);
  for (const s of sent) expect(violations(s), JSON.stringify(s)).toEqual([]);
  const find = (n: string) => sent.find((s) => s.payload.name === n)!.payload.data as Record<string, string>;
  expect(find('search_open')).toEqual({ page: '/' });
  expect(find('search_pick')).toEqual({ to: '/tools/strip-exif', kind: 'tool', rank: '1' });
  expect(find('files_added').via).toBe('search');
  expect(find('tool_run').via).toBe('search');
  const raw = JSON.stringify(sent);
  for (const typed of ['remove gps', 'remove', 'gps']) expect(raw.toLowerCase().replace('strip-exif', '')).not.toContain(typed);
});

test('/privacy names every event the allowlist permits', () => {
  const page = readFileSync(fileURLToPath(new URL('../src/pages/privacy.astro', import.meta.url)), 'utf8');
  for (const [name, { label }] of Object.entries(EVENTS)) expect(page, `${name} is not described on /privacy`).toContain(`<strong>${label}</strong>`);
});

test('nothing is sent when the browser sends Global Privacy Control', async ({ page, baseURL }) => {
  const sent = await captureAnalytics(page, baseURL!);
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true }));
  await page.goto(`${SITE}/tools/strip-exif`);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(fx('photo.jpg'));
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 60_000 });
  await page.waitForTimeout(500);
  expect(sent).toEqual([]);
  expect(await page.evaluate(() => 'umami' in window)).toBe(false);
});

test('nothing is sent when the browser says Do Not Track', async ({ page, baseURL }) => {
  const sent = await captureAnalytics(page, baseURL!);
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'doNotTrack', { get: () => '1' }));
  await page.goto(`${SITE}/tools/strip-exif`);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.waitForTimeout(500);
  expect(sent).toEqual([]);
});

test('the checker rejects each kind of leak', () => {
  const ok = { type: 'event', payload: { website: 'w', hostname: 'stayput.dev', url: '/tools/x', name: 'tool_run', data: { tool: 'x' } } };
  expect(violations(ok)).toEqual([]);
  const leaks: [string, Record<string, unknown>][] = [
    ['referrer', { referrer: 'https://www.example.com/a?b=c' }],
    ['screen', { screen: '1920x1080' }],
    ['language', { language: 'en-US' }],
    ['title', { title: 'Strip EXIF' }],
    ['id', { id: 'abc' }],
    ['tag', { tag: 'abc' }],
    ['query string', { url: '/tools/x?q=1' }],
    ['fragment', { url: '/tools/x#top' }],
    ['full url', { url: 'https://stayput.dev/tools/x' }],
    ['referrer url in ref', { data: { tool: 'x', ref: 'https://www.example.com/a' } }],
    ['unknown ref name', { data: { tool: 'x', ref: 'example.com' } }],
    ['unlisted event', { name: 'surprise', data: { tool: 'x' } }],
    ['key from another event', { name: 'search_open', data: { page: '/', to: '/x' } }],
    ['page view with data', { name: undefined, data: { tool: 'x' } }],
    ['error message as the kind', { data: { tool: 'x', error_class: 'Cannot read properties of undefined' } }],
    ['file name as the kind', { data: { tool: 'x', error_class: 'holiday.gif' } }],
    ['overlong kind', { data: { tool: 'x', error_class: 'A'.repeat(41) } }],
    ['unlisted data key', { data: { tool: 'x', file_name: 'a.jpg' } }],
  ];
  for (const [what, extra] of leaks) expect(violations({ ...ok, payload: { ...ok.payload, ...extra } }), what).not.toEqual([]);
  expect(violations({ ...ok, type: 'performance' })).not.toEqual([]);
});

test('beforeSend strips everything but the documented fields', () => {
  const full = {
    website: 'w', screen: '1920x1080', language: 'en-US', title: 'T', hostname: 'stayput.dev',
    url: 'https://stayput.dev/tools/x?q=1#top', referrer: 'https://www.example.com/a?b=c', tag: 't', id: 'i',
    name: 'tool_run', data: { tool: 'x' },
  };
  expect(beforeSend('event', full)).toEqual({ website: 'w', hostname: 'stayput.dev', url: '/tools/x', name: 'tool_run', data: { tool: 'x' } });
  // A page view has no name or data.
  const { name: _n, data: _d, ...view } = full;
  const out = beforeSend('event', view)!;
  expect(out).toEqual({ website: 'w', hostname: 'stayput.dev', url: '/tools/x' });
  expect('name' in out).toBe(false);
  // Types other than page views and custom events are never sent.
  expect(beforeSend('identify', full)).toBeNull();
  expect(beforeSend('performance', full)).toBeNull();
  // A path with no origin stays a path; an unusable url is dropped, not sent raw.
  expect(beforeSend('event', { ...full, url: '/a/b?x=1' })!.url).toBe('/a/b');
  expect(beforeSend('event', { ...full, url: undefined })!.url).toBeUndefined();
});
