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
/** Custom event fields. Keep in step with /privacy. */
const DATA_KEYS = new Set([
  'tool', 'outcome', 'files', 'input', 'output', 'duration', 'attempt',
  'landing', 'ref', 'from', 'visit', 'prev_tool', 'run_n', 'tools_used', 'run_gap', 'ns', 'to', 'format', 'error_class', 'page', 'kind', 'rank', 'via',
]);

type Sent = { type: string; payload: Record<string, unknown> };

/** Everything wrong with one analytics request body; empty when it is clean. */
function violations({ type, payload }: Sent): string[] {
  const bad: string[] = [];
  if (type !== 'event') bad.push(`type ${type}`);
  for (const k of Object.keys(payload)) if (!TOP_LEVEL.has(k)) bad.push(`field ${k}`);
  const url = payload.url;
  if (typeof url !== 'string' || !url.startsWith('/') || /[?#]/.test(url)) bad.push(`url ${String(url)}`);
  if (payload.hostname !== 'stayput.dev') bad.push(`hostname ${String(payload.hostname)}`);
  const data = (payload.data ?? {}) as Record<string, unknown>;
  for (const k of Object.keys(data)) if (!DATA_KEYS.has(k)) bad.push(`data.${k}`);
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
  // Automated browsers set navigator.webdriver and the site then skips analytics. Only this test undoes that.
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await serveSiteLocally(page, origin);
  await page.route('https://stats.keenankaufman.com/st.js', (route) => route.fulfill({ contentType: 'text/javascript', body: TRACKER }));
  await page.route('https://stats.keenankaufman.com/api/st', (route) => {
    sent.push(route.request().postDataJSON());
    return route.fulfill({ contentType: 'application/json', body: '{}' });
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
  for (const s of sent) {
    expect(violations(s), JSON.stringify(s)).toEqual([]);
    expect(s.payload.website).toBe('52e5e00a-c867-497a-9f44-14c769361768');
    expect(s.payload.url).toBe('/tools/strip-exif');
  }
  const raw = JSON.stringify(sent);
  for (const secret of ['example.com', 'secret-term', 'token=abc', 'section', 'photo']) expect(raw).not.toContain(secret);
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
