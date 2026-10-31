import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeSend } from '../src/lib/analytics-payload';
import { injectExperiment } from './ab-inject';

const fx = (name: string) => fileURLToPath(new URL(`./fixtures/generated/${name}`, import.meta.url));
// A copy of the tracker the stats host serves, so the test never contacts that host.
const TRACKER = readFileSync(fileURLToPath(new URL('./vendor/umami-st.js', import.meta.url)), 'utf8');
const SITE = 'https://stayput.dev';

// This spec serves the site from the local build and feeds the real tracker; the live config blocks the stats host and has no local server.
test.skip(!!process.env.PW_LIVE, 'needs the local build and the real tracker; not runnable against the live site');

/** Top-level fields an event may carry. Keep in step with /privacy. */
const TOP_LEVEL = new Set(['website', 'hostname', 'url', 'name', 'data']);
const VISIT = ['landing', 'ref', 'from', 'visit', 'via'];
/** Sent on every event, but only while a page A/B test is active (src/lib/ab.ts); see tests/ab.spec.ts. */
const AB = ['variant'];
/**
 * Every event and the details it may carry. Keep in step with /privacy: `label` is how
 * the page names the event, and the test below checks the page still names each one.
 * Anything not listed here, an event or a key, fails.
 */
const EVENTS: Record<string, { label: string; keys: string[] }> = {
  visit_start: { label: 'Visit start', keys: ['landing', 'ref', 'visit'] },
  files_added: { label: 'Files added', keys: ['tool', 'files', 'input', ...VISIT] },
  tool_start: { label: 'Tool start', keys: ['tool', 'files', 'input', 'format', ...VISIT] },
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
function violations({ type, payload }: Sent, opts: { ab?: boolean } = {}): string[] {
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
    else for (const k of Object.keys(data)) if (!event.keys.includes(k) && !((opts.ab ?? true) && AB.includes(k))) bad.push(`${String(payload.name)}.${k}`);
  if ('variant' in data && !/^[a-z0-9]+(-[a-z0-9]+)*:[AB](,[a-z0-9]+(-[a-z0-9]+)*:[AB])*$/.test(String(data.variant))) bad.push(`data.variant ${String(data.variant)}`);
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

/** The background remover prints which path ran and a per-frame time split on the page; none of it may be sent. */
test('video background remover: the path and per-frame timing line stay on the page, not in analytics', async ({ page, baseURL }) => {
  test.setTimeout(240_000);
  const sent = await captureAnalytics(page, baseURL!);
  await page.goto(`${SITE}/tools/video-background-remover`);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(fileURLToPath(new URL('./fixtures/static/speech.mov', import.meta.url)));
  await page.locator('input[name="finder"][value="fast"]').evaluate((el) => (el as HTMLInputElement).click());
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
  await expect(page.locator('#results-list')).toContainText('Each frame took about');
  await expect.poll(() => sent.filter((s) => s.payload.name === 'tool_run').length).toBe(1);
  const run = sent.find((s) => s.payload.name === 'tool_run')!;
  for (const s of sent) expect(violations(s), JSON.stringify(s)).toEqual([]);
  const keys = Object.keys(run.payload.data as Record<string, string>);
  expect(keys.filter((k) => !EVENTS.tool_run!.keys.includes(k) && !AB.includes(k))).toEqual([]);
  const raw = JSON.stringify(sent);
  for (const word of ['Each frame', 'ms a frame', 'graphics chip', 'processor', 'waiting for', 'speech']) expect(raw).not.toContain(word);
});

const SPEECH_TOOLS = ['transcribe', 'add-subtitles-to-video'] as const;
const SPOKEN = fileURLToPath(new URL('./fixtures/static/jfk.wav', import.meta.url));

/** A failed caption run: what the page shows and the one tool_run event, which must carry only the class name. */
async function failedCaptionRun(page: Page, baseURL: string, slug: string, sent: Sent[], file: Parameters<ReturnType<Page['locator']>['setInputFiles']>[0] = SPOKEN) {
  await page.goto(`${SITE}/tools/${slug}`);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(file);
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 60_000 });
  await expect.poll(() => sent.filter((s) => s.payload.name === 'tool_run').length).toBe(1);
  const run = sent.find((s) => s.payload.name === 'tool_run')!;
  expect(violations(run), JSON.stringify(run)).toEqual([]);
  const raw = JSON.stringify(sent);
  for (const secret of ['jfk', 'onnx', 'Failed to fetch']) expect(raw).not.toContain(secret);
  return { shown: (await page.locator('#error').innerText()).replace(/\s+/g, ' '), data: run.payload.data as Record<string, string> };
}

for (const slug of SPEECH_TOOLS) {
  test(`${slug}: a speech model that cannot be downloaded or started fails with its own class, and the class survives the worker`, async ({ page, baseURL }) => {
    test.setTimeout(120_000);
    const sent = await captureAnalytics(page, baseURL!);
    await page.route(`${SITE}/models/**/*.onnx`, (route) => route.abort('connectionreset'));
    const dl = await failedCaptionRun(page, baseURL!, slug, sent);
    expect(dl.data).toMatchObject({ outcome: 'error', error_class: 'ModelDownloadError' });
    expect(dl.shown).toContain('could not be downloaded');
  });

  test(`${slug}: a damaged model file is refused by the hash check as ModelVerifyFailed, with what to try`, async ({ page, baseURL }) => {
    test.setTimeout(120_000);
    const sent = await captureAnalytics(page, baseURL!);
    await page.route(`${SITE}/models/**/*.onnx`, (route) => route.fulfill({ contentType: 'application/octet-stream', body: Buffer.alloc(2048, 7) }));
    const bad = await failedCaptionRun(page, baseURL!, slug, sent);
    expect(bad.data).toMatchObject({ outcome: 'error', error_class: 'ModelVerifyFailed' });
    expect(bad.shown).toContain('neither copy matched');
  });

  test(`${slug}: a worker the browser kills reports WorkerCrashError`, async ({ page, baseURL }) => {
    const sent = await captureAnalytics(page, baseURL!);
    await page.addInitScript(() => {
      const Real = window.Worker;
      // A worker whose script throws at once, like one the browser could not start or killed.
      (window as unknown as { Worker: unknown }).Worker = class extends Real {
        constructor() {
          super(URL.createObjectURL(new Blob(['throw new Error("secret-worker-message")'], { type: 'text/javascript' })));
        }
      };
    });
    const crashed = await failedCaptionRun(page, baseURL!, slug, sent);
    expect(crashed.data).toMatchObject({ outcome: 'error', error_class: 'WorkerCrashError' });
    expect(JSON.stringify(sent)).not.toContain('secret-worker-message');
  });

  test(`${slug}: a worker that cannot be handed the sound reports WorkerCrashError, not TypeError, after one more try`, async ({ page, baseURL }) => {
    test.setTimeout(120_000);
    const sent = await captureAnalytics(page, baseURL!);
    await page.addInitScript(() => {
      const w = window as unknown as { __handed: number };
      w.__handed = 0;
      const real = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (this: Worker, msg: unknown, ...rest: unknown[]) {
        // Only the speech request carries samples; other messages go through.
        if (msg && typeof msg === 'object' && 'audio' in msg) {
          w.__handed++;
          throw new TypeError('secret-post-message-failure');
        }
        return (real as (...a: unknown[]) => void).call(this, msg, ...rest);
      } as typeof Worker.prototype.postMessage;
    });
    const failed = await failedCaptionRun(page, baseURL!, slug, sent);
    expect(failed.data).toMatchObject({ outcome: 'error', error_class: 'WorkerCrashError' });
    expect(failed.shown).toContain('stopped unexpectedly');
    // The first request, then one fresh worker, and no more.
    expect(await page.evaluate(() => (window as unknown as { __handed: number }).__handed)).toBe(2);
    expect(JSON.stringify(sent)).not.toContain('secret-post-message-failure');
  });
}

/** The caption tools send one tool_start when Run is pressed, with details tool_run also sends and nothing else. */
for (const [path, slug, format] of [
  ['/tools/transcribe', 'transcribe', 'txt'],
  ['/video-to-subtitles', 'video-to-subtitles', 'srt'],
  ['/auto-caption-video', 'auto-caption-video', 'mp4'],
  ['/tools/add-subtitles-to-video', 'add-subtitles-to-video', 'mp4'],
] as const) {
  test(`${slug}: pressing Run sends exactly one tool_start with only fields tool_run also sends`, async ({ page, baseURL }) => {
    test.setTimeout(120_000);
    const sent = await captureAnalytics(page, baseURL!);
    await page.route(`${SITE}/models/**/*.onnx`, (route) => route.abort('connectionreset'));
    await page.goto(`${SITE}${path}`);
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    if (slug === 'video-to-subtitles') await page.locator('#format').selectOption('srt');
    await page.locator('#file-input').setInputFiles(SPOKEN);
    await page.locator('#run').click();
    await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 60_000 });
    await expect.poll(() => sent.filter((s) => s.payload.name === 'tool_run').length).toBe(1);
    const starts = sent.filter((s) => s.payload.name === 'tool_start');
    expect(starts).toHaveLength(1);
    expect(violations(starts[0]!), JSON.stringify(starts[0])).toEqual([]);
    const data = starts[0]!.payload.data as Record<string, string>;
    expect(Object.keys(data).filter((k) => k !== 'variant').sort()).toEqual(['files', 'format', 'from', 'input', 'landing', 'ref', 'tool', 'visit']);
    expect(data).toMatchObject({ tool: slug, files: '1', input: '<1MB', format });
    const runKeys = Object.keys((sent.find((s) => s.payload.name === 'tool_run')!.payload.data as Record<string, string>));
    for (const k of Object.keys(data)) expect(runKeys, `tool_start.${k} is not sent by tool_run`).toContain(k);
    expect(JSON.stringify(starts)).not.toContain('jfk');
    // Sent before the work, so before the run's own event.
    const order = sent.map((s) => s.payload.name);
    expect(order.indexOf('tool_start')).toBeLessThan(order.indexOf('tool_run'));
  });
}

test('a file with no readable sound fails with AudioDecodeError before any model is fetched', async ({ page, baseURL }) => {
  const sent = await captureAnalytics(page, baseURL!);
  const models: string[] = [];
  page.on('request', (r) => r.url().includes('/models/') && models.push(r.url()));
  const out = await failedCaptionRun(page, baseURL!, 'transcribe', sent, fx('anim.gif'));
  expect(out.data).toMatchObject({ outcome: 'error', error_class: 'AudioDecodeError' });
  expect(models).toEqual([]);
});

/** A video from the static fixtures with its sound renamed to the AMR sample entry Android recorders write, which no browser decoder here reads. */
function amrVideo(): { name: string; mimeType: string; buffer: Buffer } {
  const mp4 = Buffer.from(readFileSync(fileURLToPath(new URL('./fixtures/static/tone-16k-mono.mp4', import.meta.url))));
  // 'mp4a' becomes 'samr', and the AAC config box that would still say AAC is renamed away.
  for (const [from, to] of [['mp4a', 'samr'], ['esds', 'wide']] as const) {
    const at = mp4.indexOf(from);
    expect(at).toBeGreaterThan(0);
    mp4.write(to, at, 'latin1');
  }
  return { name: 'recording.mp4', mimeType: 'video/mp4', buffer: mp4 };
}

for (const [label, file] of [
  ['a video with AMR sound', amrVideo()],
  ['a bare AMR recording', { name: 'voice.amr', mimeType: 'audio/amr', buffer: Buffer.concat([Buffer.from('#!AMR\n'), Buffer.alloc(4096, 0x3c)]) }],
] as const) {
  test(`${label} names the format and still fails with AudioDecodeError, before any model is fetched`, async ({ page, baseURL }) => {
    const sent = await captureAnalytics(page, baseURL!);
    const models: string[] = [];
    page.on('request', (r) => r.url().includes('/models/') && models.push(r.url()));
    const out = await failedCaptionRun(page, baseURL!, 'transcribe', sent, file);
    expect(out.data).toMatchObject({ outcome: 'error', error_class: 'AudioDecodeError' });
    expect(out.shown).toContain("sound is AMR");
    expect(out.shown).toContain("can't decode");
    expect(Object.keys(out.data)).not.toContain('format_name');
    expect(JSON.stringify(sent)).not.toMatch(/AMR|recording|voice/);
    expect(models).toEqual([]);
  });
}

/** One failed run from the files given: the page shows `shown`, and the one tool_run event carries only the class name. */
async function failedRun(page: Page, baseURL: string, path: string, files: Parameters<ReturnType<Page['locator']>['setInputFiles']>[0]) {
  const sent = await captureAnalytics(page, baseURL);
  await page.goto(`${SITE}${path}`);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(files);
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 60_000 });
  await expect.poll(() => sent.filter((s) => s.payload.name === 'tool_run').length).toBe(1);
  const run = sent.find((s) => s.payload.name === 'tool_run')!;
  expect(violations(run), JSON.stringify(run)).toEqual([]);
  return { shown: (await page.locator('#error').innerText()).replace(/\s+/g, ' '), data: run.payload.data as Record<string, string>, raw: JSON.stringify(sent) };
}

/**
 * A model worker fails on a named error (a refused model download throws a TypeError inside the worker):
 * the name must cross postMessage and reach the one tool_run event, with no message and no file name.
 */
test('Remove object: an error named inside the worker is recorded under that name', async ({ page, baseURL }) => {
  const sent = await captureAnalytics(page, baseURL!);
  await page.route(`${SITE}/models/**/*.onnx`, (route) => route.abort('connectionreset'));
  await page.goto(`${SITE}/tools/remove-object`);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(fx('photo.jpg'));
  await expect(page.locator('#erase-panel')).toBeVisible();
  const canvas = page.locator('#erase-canvas');
  await canvas.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const b = (await canvas.boundingBox())!;
  await page.mouse.move(b.x + b.width * 0.4, b.y + b.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.5, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator('#erase-panel')).toHaveAttribute('data-strokes', '1');
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 60_000 });
  await expect.poll(() => sent.filter((s) => s.payload.name === 'tool_run').length).toBe(1);
  const run = sent.find((s) => s.payload.name === 'tool_run')!;
  expect(violations(run), JSON.stringify(run)).toEqual([]);
  expect(run.payload.data).toMatchObject({ tool: 'remove-object', outcome: 'error', error_class: 'ModelDownloadError' });
  expect(JSON.stringify(sent)).not.toContain('photo');
});

test('Vocal remover: an error named inside the worker is recorded under that name', async ({ page, baseURL }) => {
  const sent = await captureAnalytics(page, baseURL!);
  await page.route(`${SITE}/models/**/*.onnx`, (route) => route.abort('connectionreset'));
  const out = await failedCaptionRun(page, baseURL!, 'vocal-remover', sent);
  expect(out.data).toMatchObject({ tool: 'vocal-remover', outcome: 'error', error_class: 'ModelDownloadError' });
});

test('pressing Run without what the tool needs is recorded as InputError, not as a failure', async ({ page, baseURL }) => {
  const srt = { name: 'secret-captions.srt', mimeType: 'text/plain', buffer: Buffer.from('1\n00:00:00,000 --> 00:00:02,000\nsecret-words\n') };
  const out = await failedRun(page, baseURL!, '/tools/add-subtitles-to-video', srt);
  expect(out.shown).toContain('Add the video too');
  expect(out.data).toMatchObject({ tool: 'add-subtitles-to-video', outcome: 'error', error_class: 'InputError' });
  for (const secret of ['secret-captions', 'secret-words']) expect(out.raw).not.toContain(secret);
});

test('a file with no readable sound in an audio tool fails with AudioDecodeError, not the generic class', async ({ page, baseURL }) => {
  const out = await failedRun(page, baseURL!, '/tools/volume-booster', fx('anim.gif'));
  expect(out.data).toMatchObject({ tool: 'volume-booster', outcome: 'error', error_class: 'AudioDecodeError' });
});

test('a file that is not a video fails with UnreadableFile in a video edit', async ({ page, baseURL }) => {
  const out = await failedRun(page, baseURL!, '/blur-video-background', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  expect(out.shown).toContain('not a video this page can read');
  expect(out.data).toMatchObject({ outcome: 'error', error_class: 'UnreadableFile' });
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
  expect(find('search_open')).toMatchObject({ page: '/' });
  expect(find('search_pick')).toMatchObject({ to: '/tools/strip-exif', kind: 'tool', rank: '1' });
  expect(find('files_added').via).toBe('search');
  expect(find('tool_run').via).toBe('search');
  const raw = JSON.stringify(sent);
  for (const typed of ['remove gps', 'remove', 'gps']) expect(raw.toLowerCase().replace('strip-exif', '')).not.toContain(typed);
});

test('with a test experiment on, every event carries the variant, and nothing else new', async ({ page, baseURL }) => {
  const sent = await captureAnalytics(page, baseURL!);
  await injectExperiment(page, ['ab-test'], { from: SITE, to: baseURL! });
  await page.goto(`${SITE}/tools/strip-exif`);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(fx('photo.jpg'));
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 60_000 });
  await expect.poll(() => sent.filter((s) => s.payload.name === 'tool_run').length).toBeGreaterThan(0);
  const label = await page.evaluate(() => document.documentElement.getAttribute('data-ab-ab-test'));
  expect(['A', 'B']).toContain(label);
  const events = sent.filter((s) => s.payload.name !== undefined);
  expect(events.map((s) => s.payload.name)).toEqual(expect.arrayContaining(['visit_start', 'files_added', 'tool_run']));
  for (const s of events) {
    expect(violations(s, { ab: true }), JSON.stringify(s)).toEqual([]);
    expect((s.payload.data as Record<string, string>).variant, JSON.stringify(s)).toBe(`ab-test:${label}`);
  }
  // Without the opt-in, the same payload is rejected: the field is allowed only while a test runs.
  expect(violations(events[0]!, { ab: false })).toContain(`${String(events[0]!.payload.name)}.variant`);
});

test('/privacy names every event the allowlist permits', () => {
  const page = readFileSync(fileURLToPath(new URL('../src/pages/privacy.astro', import.meta.url)), 'utf8');
  for (const [name, { label }] of Object.entries(EVENTS)) expect(page, `${name} is not described on /privacy`).toContain(`<strong>${label}</strong>`);
  // The one field that rides on every event while a test runs is described too, in the page's own words.
  expect(page).toContain('<strong>Test label</strong>');
  expect(page).toMatch(/random label[^<]*kept in this tab only[^<]*not stored across visits and is not linked to you/);
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

/** A failed run on `slug` with one file: the tool_run's error class, the message shown, and nothing else sent. */
async function failedRunOf(page: Page, baseURL: string, slug: string, file: Parameters<ReturnType<Page['locator']>['setInputFiles']>[0], prepare?: () => Promise<void>) {
  const sent = await captureAnalytics(page, baseURL);
  await page.goto(`${SITE}/tools/${slug}`);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await prepare?.();
  await page.locator('#file-input').setInputFiles(file);
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 60_000 });
  await expect.poll(() => sent.filter((s) => s.payload.name === 'tool_run').length).toBe(1);
  const run = sent.find((s) => s.payload.name === 'tool_run')!;
  expect(violations(run), JSON.stringify(run)).toEqual([]);
  return { shown: (await page.locator('#error').innerText()).replace(/\s+/g, ' '), data: run.payload.data as Record<string, string>, raw: JSON.stringify(sent) };
}

for (const [label, body] of [
  ['text with a .pdf name', 'secret-notes plain text with a .pdf extension\n'.repeat(20)],
  ['a PDF header and then damage', '%PDF-1.4\nsecret-notes this is not a PDF body\n'.repeat(20)],
] as const) {
  test(`Watermark PDF on ${label} fails as UnreadableFile, not a bare Error`, async ({ page, baseURL }) => {
    const out = await failedRunOf(page, baseURL!, 'watermark-pdf', { name: 'secret-notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from(body) }, async () => {
      await page.locator('#wm-text').fill('DRAFT');
    });
    expect(out.data).toMatchObject({ tool: 'watermark-pdf', outcome: 'error', error_class: 'UnreadableFile' });
    expect(out.raw).not.toContain('secret-notes');
  });
}

test('Audio to video reports a named class, from the shared runner, when the browser encoder fails at creation at every size', async ({ page, baseURL }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    const Real = window.VideoEncoder;
    (window as unknown as { VideoEncoder: unknown }).VideoEncoder = class extends Real {
      private fail: (e: DOMException) => void;
      constructor(init: VideoEncoderInit) {
        super(init);
        this.fail = init.error;
      }
      override configure(config: VideoEncoderConfig) {
        // The 320x240 start-up probe is let through; everything the tool asks for is refused.
        if (config.width > 320) {
          setTimeout(() => {
            this.fail(new DOMException('Encoder creation error.', 'OperationError'));
            this.close();
          });
          return;
        }
        super.configure(config);
      }
    };
  });
  const out = await failedRunOf(page, baseURL!, 'audio-to-video', fx('tone.wav'));
  // The test encoder closes itself after failing, so the shared runner's last error reads as a codec taken back (codec-guard.ts).
  expect(out.data).toMatchObject({ tool: 'audio-to-video', outcome: 'error', error_class: 'CodecReclaimedError' });
  expect(out.shown).toContain('took back a video codec');
});

test('Watermark PDF on a password-protected PDF whose prompt is dismissed fails as InputError, not a bare Error', async ({ page, baseURL }) => {
  page.on('dialog', (d) => void d.dismiss());
  const locked = { name: 'user-locked.pdf', mimeType: 'application/pdf', buffer: readFileSync(fileURLToPath(new URL('./fixtures/static/user-locked.pdf', import.meta.url))) };
  const out = await failedRunOf(page, baseURL!, 'watermark-pdf', locked, async () => {
    await page.locator('#wm-text').fill('DRAFT');
  });
  expect(out.data).toMatchObject({ tool: 'watermark-pdf', outcome: 'error', error_class: 'InputError' });
  expect(out.shown).toContain('password-protected');
});
