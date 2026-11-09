// @webkit-project
import { test, expect, devices, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { tools } from '../src/data/tools';
import { presets } from '../src/data/presets';
import { familyOf } from '../src/lib/tool-family';

/**
 * The shared lost-run path. A real tab kill cannot be reproduced headless (and the iOS Simulator does not suspend background pages),
 * so a lost tab is simulated the way the other specs do it: the marker a killed page leaves in sessionStorage, then a reload.
 * Every heavy family starts lighter on its next run in that tab, says so, and "Try full size" clears it. A run that ends any normal way,
 * a page that is only restored or reloaded, and a marker that is too old record nothing.
 */
const edge = (name: string) => fileURLToPath(new URL(`./fixtures/edge-cases/${name}`, import.meta.url));
const stat = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));
type Ev = { n: string; d: Record<string, string> };

const { defaultBrowserType: _a, ...iPhone } = devices['iPhone 15'];

async function recordEvents(page: Page) {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const k='__ev';const a=JSON.parse(sessionStorage.getItem(k)||'[]');a.push({n,d});sessionStorage.setItem(k,JSON.stringify(a));}};`,
    }),
  );
}
const events = (page: Page): Promise<Ev[]> => page.evaluate(() => JSON.parse(sessionStorage.getItem('__ev') || '[]'));
const classes = async (page: Page) => (await events(page)).filter((e) => e.d.error_class).map((e) => e.d.error_class);
const marker = (page: Page) => page.evaluate(() => sessionStorage.getItem('stayput:inflight'));
const ready = (page: Page) => expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');

/** The marker a killed page leaves, then a reload (the page the browser brings back). */
async function loseTab(page: Page, tool: string, extra: Record<string, unknown> = {}) {
  await page.evaluate(([t, x]) => sessionStorage.setItem('stayput:inflight', JSON.stringify({ tool: t, phase: 'run', t: Date.now(), hidden: false, ...(x as object) })), [tool, extra] as const);
  await page.reload();
  await ready(page);
}

async function open(page: Page, path: string) {
  await recordEvents(page);
  await page.goto(path);
  await ready(page);
}

test.describe('the families', () => {
  test('every tool and preset maps to the family its work belongs to', () => {
    const wanted: Record<string, string | undefined> = {
      'compress-video': 'video',
      'merge-videos': 'video',
      'burn-subtitles-into-video': 'video',
      'video-splitter': 'video',
      'split-video': 'video',
      'audio-to-video': 'video',
      'remove-background': 'model',
      'upscale-image': 'model',
      'remove-object': 'model',
      'photo-to-sketch': 'model',
      'video-background-remover': 'model',
      'remove-background-noise-from-video': 'audio',
      'video-to-mp3': 'audio',
      'remove-silence': 'audio',
      'bpm-key-finder': 'audio',
      'compress-pdf': 'pdf',
      'merge-pdf': 'pdf',
      'archive-extractor': 'archive',
      'create-zip': 'archive',
      'compress-image': 'image',
      'rotate-image': 'image',
      // The speech tools keep their own tiny-model path.
      transcribe: undefined,
      'add-subtitles-to-video': undefined,
      'auto-caption-video': undefined,
    };
    for (const [slug, family] of Object.entries(wanted)) expect(familyOf(slug), slug).toBe(family);
    // Every media tool of the site has a family or is a tool that does no heavy work.
    const none = tools.filter((t) => !familyOf(t.slug)).map((t) => t.slug);
    for (const slug of none) expect(slug, 'a tool with no family').toMatch(/test|tuner|metronome|tone-generator|recorder|color-picker|speaker|subtitle-converter|json-to-csv|transcribe|add-subtitles|auto-caption|dead-pixel|keyboard|mic|webcam|passport|rename|checksum|text-to|photo-slideshow|video-to-jpg|signature|voice|image-to-base64|qr|barcode|exif|compare|favicon|profile|sticker|emote|sprite|collage|image-to|gif/);
    expect(presets.length).toBeGreaterThan(0);
  });

  test('the light budgets and caps (pure functions)', async () => {
    const store = new Map<string, string>();
    (globalThis as unknown as { sessionStorage: unknown }).sessionStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    const { beginLight, endLight, lightRun, LIGHT_BUDGET } = await import('../src/lib/light-run');
    const { noteLostFamily, forgetWorkingSize } = await import('../src/lib/working-size');
    const { stretchLimit, outputPixelLimit } = await import('../src/lib/light-run');
    const ios = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', maxTouchPoints: 5 };
    const mac = { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', maxTouchPoints: 0 };
    // Up front: an at-risk device with an input over the budget; a desktop with the same input and an at-risk device with a small one are not.
    expect(lightRun('audio', LIGHT_BUDGET.audio + 1, ios)).toBe('atrisk');
    expect(lightRun('audio', LIGHT_BUDGET.audio + 1, mac)).toBeUndefined();
    expect(lightRun('audio', 1000, ios)).toBeUndefined();
    expect(lightRun('audio', 1000, { ...mac, deviceMemory: 2 } as never)).toBeUndefined();
    expect(lightRun('audio', LIGHT_BUDGET.audio + 1, { ...mac, deviceMemory: 2 } as never)).toBe('atrisk');
    // After a lost run: any size, any device, this family only.
    noteLostFamily('audio');
    expect(lightRun('audio', 0, mac)).toBe('lost');
    expect(lightRun('model', 0, mac)).toBeUndefined();
    beginLight('audio', 0);
    expect(stretchLimit(150 * 1024 ** 2)).toBe(40 * 1024 ** 2);
    expect(outputPixelLimit(16_777_216)).toBe(16_777_216);
    endLight();
    expect(stretchLimit(150 * 1024 ** 2)).toBe(150 * 1024 ** 2);
    noteLostFamily('model');
    beginLight('model', 0);
    expect(outputPixelLimit(16_777_216)).toBe(4_194_304);
    endLight();
    // "Try full size" clears every family.
    forgetWorkingSize();
    expect(lightRun('audio', 0, mac)).toBeUndefined();
    expect(lightRun('model', 0, mac)).toBeUndefined();
  });
});

test.describe('after a lost run, the next run starts light, says so, and Try full size clears it', () => {
  test.describe('video re-encode (compress-video, on a phone)', () => {
    test.use(iPhone);
    test('720p, the note in the result, and full size after Try full size', async ({ page }) => {
      test.setTimeout(240_000);
      await open(page, '/tools/compress-video');
      await loseTab(page, 'compress-video');
      const note = page.locator('#working-size-note');
      await expect(note).toContainText('The last run stopped because the browser closed this page, most likely out of memory. In this tab, videos are now made at 720p so the next run is lighter.');
      expect(await classes(page)).toEqual(['TabLostDuringRun']);
      await page.locator('#file-input').setInputFiles(stat('hd-flat.mp4'));
      await page.locator('#run').click();
      await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
      const text = (await page.locator('#results-list').textContent()) ?? '';
      expect(text).toContain('because the browser closed this page during the last run');
      await note.locator('button', { hasText: 'Try full size' }).click();
      await expect(note).toBeHidden();
      await page.locator('#clear').click();
      await page.locator('#file-input').setInputFiles(stat('hd-flat.mp4'));
      await page.locator('#run').click();
      await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
      expect(await page.locator('#results-list').textContent()).not.toContain('the browser closed this page');
    });
  });

  for (const [family, slug, path] of [
    ['model', 'remove-background', '/tools/remove-background'],
    ['model', 'upscale-image', '/tools/upscale-image'],
    ['audio decode', 'remove-silence', '/tools/remove-silence'],
    ['image/canvas', 'rotate-image', '/tools/rotate-image'],
    ['PDF', 'merge-pdf', '/tools/merge-pdf'],
    ['archive', 'create-zip', '/tools/create-zip'],
  ] as const) {
    test(`${family}: ${slug} shows the note after a lost run, one existing event, and Try full size clears it`, async ({ page }) => {
      await open(page, path);
      await expect(page.locator('#light-run-note')).toBeHidden();
      await loseTab(page, slug);
      const note = page.locator('#light-run-note');
      await expect(note).toBeVisible();
      await expect(note).toContainText('closed this page');
      expect(await classes(page)).toEqual(['TabLostDuringRun']);
      expect(await page.evaluate(() => sessionStorage.getItem('stayput:lost-family'))).toMatch(/\[/);
      await note.locator('button', { hasText: 'Try full size' }).click();
      await expect(note).toBeHidden();
      expect(await page.evaluate(() => sessionStorage.getItem('stayput:lost-family'))).toBeNull();
      // Another family's loss does not light this one.
    });
  }

  test('model: photo-to-sketch draws at 2048 pixels after a lost run and at full size after Try full size', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, '/tools/photo-to-sketch');
    await loseTab(page, 'photo-to-sketch');
    const addBig = async () => {
      await page.evaluate(async () => {
        const c = document.createElement('canvas');
        c.width = 3200;
        c.height = 2400;
        const g = c.getContext('2d')!;
        g.fillStyle = '#888';
        g.fillRect(0, 0, 3200, 2400);
        g.fillStyle = '#222';
        g.fillRect(400, 400, 1200, 900);
        const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
        const dt = new DataTransfer();
        dt.items.add(new File([blob], 'big.png', { type: 'image/png' }));
        const input = document.getElementById('file-input') as HTMLInputElement;
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await page.locator('#run').click();
      await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 90_000 });
      const m = ((await page.locator('#results-list').textContent()) ?? '').match(/(\d{3,4})×(\d{3,4})/);
      return Math.max(Number(m?.[1]), Number(m?.[2]));
    };
    expect(await addBig()).toBe(2048);
    await page.locator('#light-run-note button', { hasText: 'Try full size' }).click();
    await page.locator('#clear').click();
    expect(await addBig()).toBe(3200);
  });
});

test.describe('an at-risk device with a big input starts light from the first run', () => {
  const big = { name: 'big.png', mimeType: 'image/png', buffer: Buffer.alloc(9_000_000, 1) };

  test.describe('iPhone', () => {
    test.use(iPhone);
    test('the note appears for a big picture and not for a small one; Try full size clears it', async ({ page }) => {
      await open(page, '/tools/remove-background');
      await page.locator('#file-input').setInputFiles(stat('face.jpg'));
      await expect(page.locator('#light-run-note')).toBeHidden();
      await page.locator('#clear').click();
      await page.locator('#file-input').setInputFiles(big);
      const note = page.locator('#light-run-note');
      await expect(note).toBeVisible();
      await expect(note).toHaveAttribute('data-why', 'atrisk');
      await note.locator('button', { hasText: 'Try full size' }).click();
      await expect(note).toBeHidden();
      expect(await classes(page)).toEqual([]);
    });
  });

  test('a low-memory Android phone (deviceMemory 2) does the same', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'deviceMemory is a Chromium property');
    await page.addInitScript(() => Object.defineProperty(navigator, 'deviceMemory', { value: 2, configurable: true }));
    await open(page, '/tools/remove-background');
    await page.locator('#file-input').setInputFiles(big);
    await expect(page.locator('#light-run-note')).toHaveAttribute('data-why', 'atrisk');
  });

  test('desktop with the same file starts at full size', async ({ page }) => {
    await open(page, '/tools/remove-background');
    await page.locator('#file-input').setInputFiles(big);
    await expect(page.locator('#file-list .file-item, #files .file-item').first()).toBeVisible();
    await expect(page.locator('#light-run-note')).toBeHidden();
  });
});

test.describe('runs that end normally leave no marker, and a reload after them records no lost tab', () => {
  test('an error, a Clear, and a finished run', async ({ page }) => {
    await open(page, '/tools/compress-image');
    // Error.
    await page.locator('#file-input').setInputFiles(edge('garbage.jpg'));
    await page.locator('#run').click().catch(() => undefined);
    await expect.poll(() => marker(page)).toBeNull();
    // Clear.
    await page.locator('#clear').click();
    expect(await marker(page)).toBeNull();
    // A good run.
    await page.locator('#file-input').setInputFiles(edge('good.jpg'));
    await page.locator('#run').click();
    await expect(page.locator('#results')).toHaveClass(/is-active/);
    await expect.poll(() => marker(page)).toBeNull();
    const before = await classes(page);
    await page.reload();
    await ready(page);
    expect((await classes(page)).filter((c) => !!c?.startsWith('TabLost'))).toEqual([]);
    expect((await classes(page)).length).toBe(before.length);
  });

  test('a run left by reloading inside the leave window is a leave, not a lost tab', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, '/tools/compress-video');
    await page.locator('#file-input').setInputFiles(stat('hd-flat.mp4'));
    await page.locator('#run').click();
    await expect.poll(() => marker(page)).toContain('"phase":"run"');
    await page.reload();
    await ready(page);
    const c = await classes(page);
    expect(c.filter((x) => !!x?.startsWith('TabLost'))).toEqual([]);
    expect(c).toEqual(['LeftDuringRun']);
    expect(await marker(page)).toBeNull();
  });

  test('a bfcache hide and restore (pagehide with persisted, then pageshow) is a leave and leaves no marker', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, '/tools/compress-video');
    await page.locator('#file-input').setInputFiles(stat('hd-flat.mp4'));
    await page.locator('#run').click();
    await expect.poll(() => marker(page)).toContain('"phase":"run"');
    await page.evaluate(() => {
      dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
      dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });
    expect(await marker(page)).toBeNull();
    await page.reload();
    await ready(page);
    expect((await classes(page)).filter((x) => !!x?.startsWith('TabLost'))).toEqual([]);
  });
});

test.describe('what a lost tab is, and is not', () => {
  test('a hidden tab at kill time is TabLostWhileHidden', async ({ page }) => {
    await open(page, '/tools/compress-image');
    await loseTab(page, 'compress-image', { hidden: true });
    expect(await classes(page)).toEqual(['TabLostWhileHidden']);
  });

  test('a marker older than 15 minutes is ignored', async ({ page }) => {
    await open(page, '/tools/compress-image');
    await loseTab(page, 'compress-image', { t: Date.now() - 16 * 60_000 });
    expect(await classes(page)).toEqual([]);
    expect(await marker(page)).toBeNull();
    await expect(page.locator('#light-run-note')).toBeHidden();
  });

  test('a preview that was lost is not a lost run: no lighter start', async ({ page }) => {
    await open(page, '/tools/rotate-image');
    await loseTab(page, 'rotate-image', { phase: 'preview' });
    expect(await classes(page)).toEqual(['TabLostDuringPreview']);
    await expect(page.locator('#light-run-note')).toBeHidden();
  });

  test('a duplicated tab (the marker copied, the original page still running) records nothing; a gone page records the loss', async ({ page, context }) => {
    await open(page, '/tools/compress-image');
    // The original page: it holds the lock a running page holds.
    const original = await context.newPage();
    await original.goto('/tools/compress-image');
    await original.evaluate(() => void navigator.locks.request('stayput-inflight-abcdefghij', () => new Promise(() => undefined)));
    await loseTab(page, 'compress-image', { owner: 'abcdefghij' });
    expect(await classes(page)).toEqual([]);
    await original.close();
    await expect.poll(async () => original.isClosed()).toBe(true);
    await loseTab(page, 'compress-image', { owner: 'abcdefghij' });
    await expect.poll(() => classes(page)).toEqual(['TabLostDuringRun']);
  });

  test('no new analytics keys', async ({ page }) => {
    await open(page, '/tools/compress-image');
    await loseTab(page, 'compress-image');
    const keys = new Set((await events(page)).flatMap((e) => Object.keys(e.d)));
    for (const k of keys) expect(['tool', 'outcome', 'attempt', 'files', 'input', 'output', 'duration', 'format', 'error_class', 'landing', 'ref', 'from', 'visit', 'prev_tool', 'run_n', 'tools_used', 'run_gap', 'left_after', 'left_at', 'mode', 'first_ok', 'variant', 'ns'], k).toContain(k);
  });
});
