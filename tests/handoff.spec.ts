import { test, expect, type Page, type Request } from '@playwright/test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handoffs } from '../src/data/handoff.ts';
import { nextSteps } from '../src/data/next-steps.ts';
import { tools } from '../src/data/tools.ts';
import { toolPath } from '../src/data/tools.ts';

// "Next step" links carry the finished file to the next tool (src/lib/handoff.ts) without picking it
// again. The file stays on the device: it goes through the browser's IndexedDB, never the network.
// Runs in the chromium project and in the webkit project (Safari's engine, CI).
const fx = (rel: string) => fileURLToPath(new URL(`./fixtures/${rel}`, import.meta.url));
const clip = fx('static/clip.webm');

// Service-worker requests are not routed through the page, so let the worker run and watch the whole context.
test.use({ serviceWorkers: 'allow' });

/** Pin the experiment arm so the next-step links show (they appear for half of visits). */
async function arm(page: Page) {
  await page.addInitScript(() => {
    Math.random = () => 0.1;
  });
}

async function ready(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
}

/** What the handoff store holds right now: records, the tab's note and the cleanup timestamp. */
async function store(page: Page) {
  return page.evaluate(async () => {
    const dbs = (await indexedDB.databases?.()) ?? [];
    let records = 0;
    if (dbs.some((d) => d.name === 'stayput-handoff')) {
      records = await new Promise<number>((resolve) => {
        const open = indexedDB.open('stayput-handoff');
        open.onupgradeneeded = () => open.result.createObjectStore('files', { keyPath: 'id' });
        open.onsuccess = () => {
          const db = open.result;
          const count = db.transaction('files').objectStore('files').count();
          count.onsuccess = () => {
            db.close();
            resolve(count.result);
          };
        };
      });
    }
    return { records, note: sessionStorage.getItem('stayput:handoff'), marker: localStorage.getItem('stayput:handoff-at') };
  });
}

/** Save a file for `to` the way the sending page does, from a page on the same origin. */
async function seed(page: Page, o: { to: string; name: string; type: string; bytes: number[]; ageMs?: number; note?: boolean }) {
  await page.evaluate(async (a) => {
    const at = Date.now() - (a.ageMs ?? 0);
    const id = `seed${at}`;
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('stayput-handoff', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('files', { keyPath: 'id' });
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('files', 'readwrite');
        tx.objectStore('files').put({ id, bytes: new Uint8Array(a.bytes).buffer, name: a.name, type: a.type, from: 'Seed tool', to: a.to, at });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
    localStorage.setItem('stayput:handoff-at', String(at));
    if (a.note !== false) sessionStorage.setItem('stayput:handoff', JSON.stringify({ id, to: a.to }));
  }, o);
}

function srtFile(): string {
  const file = join(mkdtempSync(join(tmpdir(), 'stayput-')), 'clip.srt');
  writeFileSync(file, '1\n00:00:00,000 --> 00:00:01,500\nHello from the park\n');
  return file;
}

/** Caption the clip with its own subtitle file (no speech model needed) and wait for the result. */
async function captionClip(page: Page) {
  await ready(page, '/auto-caption-video');
  await page.locator('#file-input').setInputFiles([clip, srtFile()]);
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 90_000 });
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  await expect(page.locator('#next-steps')).toBeVisible();
}

test('Auto caption → Compress video: the captioned video opens in Compress video with no new upload, and nothing carries it over the network', async ({ page, context }) => {
  test.setTimeout(240_000);
  await arm(page);
  const requests: Request[] = [];
  context.on('request', (r) => requests.push(r));
  await captionClip(page);
  const link = page.locator('#next-steps a[data-to="compress-video"]');
  await expect(link).toHaveAttribute('data-handoff', '');
  requests.length = 0;
  await link.click();
  await expect(page).toHaveURL(/\/tools\/compress-video$/);
  await expect(page.locator('#tool')).toHaveAttribute('data-count', '1');
  await expect(page.locator('#handoff-note')).toContainText(/Using clip-.*\.mp4 \(.*\) from Auto caption video/);
  await expect(page.locator('#file-list .name')).toHaveCount(1);
  await expect(page.locator('#handoff-note button')).toHaveText('Choose a different file');
  // Picked up: the saved copy, the tab's note and the timestamp are all gone.
  expect(await store(page)).toEqual({ records: 0, note: null, marker: null });
  // No request carried the file: none has a body, none is aimed anywhere but this site, none puts a name in its address.
  const origin = new URL(page.url()).origin;
  expect(requests.filter((r) => r.postDataBuffer() !== null && r.postDataBuffer()!.length > 0).map((r) => r.url())).toEqual([]);
  expect(requests.filter((r) => !r.url().startsWith(origin) && !/^(data|blob):/.test(r.url())).map((r) => r.url())).toEqual([]);
  expect(requests.filter((r) => /clip-|captioned|\.srt/i.test(decodeURIComponent(r.url()))).map((r) => r.url())).toEqual([]);
  // And the carried file really runs through Compress video.
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 90_000 });
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
});

test('"Choose a different file" drops the carried file and opens the chooser; the normal drop zone is back', async ({ page }) => {
  await page.goto('/privacy');
  await seed(page, { to: '/tools/compress-video', name: 'carried.mp4', type: 'video/mp4', bytes: [...readFileSync(clip)] });
  await ready(page, '/tools/compress-video');
  await expect(page.locator('#handoff-note')).toContainText('Using carried.mp4');
  await expect(page.locator('#tool')).toHaveAttribute('data-count', '1');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#handoff-note button').click();
  await chooser;
  await expect(page.locator('#handoff-note')).toHaveCount(0);
  await expect(page.locator('#tool')).toHaveAttribute('data-count', '0');
  await expect(page.locator('#drop')).toBeVisible();
});

test('a failed save (storage refuses) follows the plain link: no error, the usual drop zone', async ({ page }) => {
  test.setTimeout(240_000);
  await arm(page);
  await page.addInitScript(() => {
    IDBObjectStore.prototype.put = function () {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    };
  });
  await captionClip(page);
  await page.locator('#next-steps a[data-to="compress-video"]').click();
  await expect(page).toHaveURL(/\/tools\/compress-video$/);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#tool')).toHaveAttribute('data-count', '0');
  await expect(page.locator('#handoff-note')).toHaveCount(0);
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  await expect(page.locator('#drop')).toBeVisible();
  expect((await store(page)).records).toBe(0);
});

test('a file over the size limit is not carried: the usual drop zone, no error', async ({ page }) => {
  test.setTimeout(240_000);
  await arm(page);
  await captionClip(page);
  // The tool holds a small file; make it look 201 MB to the handoff.
  await page.evaluate(() => Object.defineProperty(Blob.prototype, 'size', { get: () => 201 * 1024 * 1024, configurable: true }));
  await page.locator('#next-steps a[data-to="compress-video"]').click();
  await expect(page).toHaveURL(/\/tools\/compress-video$/);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#tool')).toHaveAttribute('data-count', '0');
  await expect(page.locator('#handoff-note')).toHaveCount(0);
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  expect(await store(page)).toEqual({ records: 0, note: null, marker: null });
});

test('a copy that waited past the time limit is not used, and any page load deletes it', async ({ page }) => {
  await page.goto('/privacy');
  await seed(page, { to: '/tools/compress-video', name: 'old.mp4', type: 'video/mp4', bytes: [...readFileSync(clip)], ageMs: 6 * 60_000 });
  await ready(page, '/tools/compress-video');
  await expect(page.locator('#tool')).toHaveAttribute('data-count', '0');
  await expect(page.locator('#handoff-note')).toHaveCount(0);
  await expect.poll(() => store(page)).toEqual({ records: 0, note: null, marker: null });
});

test('a copy left by a closed tab (no note in this tab) is swept on the next page load once stale, but kept while fresh', async ({ page }) => {
  await page.goto('/privacy');
  await seed(page, { to: '/tools/compress-video', name: 'fresh.mp4', type: 'video/mp4', bytes: [1, 2, 3], note: false });
  await ready(page, '/tools/trim-video');
  await page.waitForTimeout(500);
  expect((await store(page)).records).toBe(1);
  await page.evaluate(() => localStorage.setItem('stayput:handoff-at', String(Date.now())));
  await seed(page, { to: '/tools/compress-video', name: 'stale.mp4', type: 'video/mp4', bytes: [1, 2, 3], note: false, ageMs: 10 * 60_000 });
  expect((await store(page)).records).toBe(2);
  await ready(page, '/tools/trim-video');
  await expect.poll(async () => (await store(page)).records).toBe(1);
});

test('a copy saved for one tool is deleted when the tab lands on a different page', async ({ page }) => {
  await page.goto('/privacy');
  await seed(page, { to: '/tools/compress-video', name: 'x.mp4', type: 'video/mp4', bytes: [1, 2, 3] });
  await ready(page, '/tools/trim-video');
  await expect(page.locator('#tool')).toHaveAttribute('data-count', '0');
  await expect.poll(() => store(page)).toEqual({ records: 0, note: null, marker: null });
});

test('a file the next tool does not accept is dropped quietly', async ({ page }) => {
  await page.goto('/privacy');
  await seed(page, { to: '/tools/compress-pdf', name: 'song.mp3', type: 'audio/mpeg', bytes: [1, 2, 3] });
  await ready(page, '/tools/compress-pdf');
  await expect(page.locator('#tool')).toHaveAttribute('data-count', '0');
  await expect(page.locator('#handoff-note')).toHaveCount(0);
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  expect(await store(page)).toEqual({ records: 0, note: null, marker: null });
});

test('every shipped pair is one of the tool\'s next steps', () => {
  for (const [from, targets] of Object.entries(handoffs)) {
    for (const to of targets) expect(nextSteps[from], `${from} → ${to}`).toContain(to);
  }
});

// What each source tool makes, as a file of that kind for the receiving page to open.
const kindOf = (from: string): { name: string; type: string; bytes: number[] } => {
  if (/pdf/.test(from)) return { name: 'out.pdf', type: 'application/pdf', bytes: [...readFileSync(fx('generated/text.pdf'))] };
  if (['audio-converter', 'volume-booster', 'pitch-changer', 'remove-noise', 'remove-silence', 'compress-audio', 'merge-audio', 'vocal-remover'].includes(from))
    return { name: 'out.wav', type: 'audio/wav', bytes: [...readFileSync(fx('generated/tone.wav'))] };
  return { name: 'out.mp4', type: 'video/mp4', bytes: [...readFileSync(clip)] };
};

for (const [from, targets] of Object.entries(handoffs)) {
  for (const to of targets) {
    test(`pair ${from} → ${to}: the next tool opens with the carried file`, async ({ page }, info) => {
      test.skip(info.project.name !== 'chromium', 'the pair list is checked once, in Chromium');
      const target = tools.find((t) => t.slug === to)!;
      const path = toolPath(target);
      await page.goto('/privacy');
      const kind = kindOf(from);
      await seed(page, { to: path, ...kind });
      await ready(page, path);
      await expect(page.locator('#tool')).toHaveAttribute('data-count', '1');
      await expect(page.locator('#handoff-note')).toContainText(`Using ${kind.name}`);
      await expect(page.locator('#file-list .name')).toHaveText(kind.name);
      expect(await store(page)).toEqual({ records: 0, note: null, marker: null });
    });
  }
}
