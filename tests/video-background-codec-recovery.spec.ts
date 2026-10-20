// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

// A decoder or encoder the browser takes back part-way through (Chromium's ReclaimableCodec: the error callback gets a
// QuotaExceededError, every later call an InvalidStateError) is replaced and the run finishes from the last good frame, with
// no restart. A codec that fails every time ends in a class that names it. The failures are forced in the page, as in
// video-background-invalid-state.spec.ts; a real Android reclaim needs a backgrounded phone with codecs short.
const clip = fileURLToPath(new URL('./fixtures/static/iphone-portrait-person-3s.mov', import.meta.url));
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

type Ev = { n: string; d: Record<string, string> };
async function stubAnalytics(page: Page) {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const a=JSON.parse(sessionStorage.getItem('__ev')||'[]');a.push({n,d});sessionStorage.setItem('__ev',JSON.stringify(a));}};`,
    }),
  );
}
const toolRuns = (page: Page) => page.evaluate(() => (JSON.parse(sessionStorage.getItem('__ev') || '[]') as Ev[]).filter((e) => e.n === 'tool_run').map((e) => e.d));

test.use({ userAgent: ANDROID, hasTouch: true });

interface Fault {
  codec: 'decoder' | 'encoder';
  /** "throw": the codec is closed under the call and the call throws InvalidStateError. "reclaim": the browser closes it between calls and the error callback gets a QuotaExceededError. */
  how: 'throw' | 'reclaim';
  /** Calls on the run's codec before the first failure. */
  after: number;
  /** How many failures in all (1000 = every time). */
  times: number;
}

/** Breaks the run's own decoder or encoder (the picture-sized one, not the probes' small ones). */
function breakCodec(f: Fault) {
  const keep = (name: 'VideoDecoder' | 'VideoEncoder') => {
    const Real = (window as unknown as Record<string, new (init: unknown) => EventTarget>)[name]!;
    (window as unknown as Record<string, unknown>)[name] = class extends Real {
      init: { error: (e: unknown) => void };
      constructor(init: { error: (e: unknown) => void }) {
        super(init);
        this.init = init;
      }
    };
  };
  keep(f.codec === 'decoder' ? 'VideoDecoder' : 'VideoEncoder');
  let calls = 0;
  let fired = 0;
  const proto = f.codec === 'decoder' ? VideoDecoder.prototype : VideoEncoder.prototype;
  const method = f.codec === 'decoder' ? 'decode' : 'encode';
  const real = (proto as unknown as Record<string, (...a: unknown[]) => unknown>)[method]!;
  const realConfigure = (proto as unknown as Record<string, (...a: unknown[]) => unknown>).configure!;
  (proto as unknown as Record<string, unknown>).configure = function (this: { big?: boolean }, cfg: { width?: number; codedWidth?: number }) {
    if ((cfg.width ?? cfg.codedWidth ?? 0) >= 400) this.big = true;
    return realConfigure.call(this, cfg);
  };
  (proto as unknown as Record<string, unknown>)[method] = function (this: { big?: boolean; close(): void; init: { error: (e: unknown) => void } }, ...args: unknown[]) {
    if (this.big && ++calls > f.after && fired < f.times) {
      fired++;
      if (f.how === 'throw') this.close();
      else {
        const dead = this;
        setTimeout(() => {
          dead.close();
          dead.init.error(new DOMException('Codec reclaimed due to inactivity.', 'QuotaExceededError'));
        }, 0);
      }
    }
    return real.apply(this, args);
  };
}

async function runOnce(page: Page, timeout = 240_000) {
  await page.goto('/tools/video-background-remover');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles([clip]);
  await page.locator('input[name="finder"][value="fast"]').evaluate((el) => (el as HTMLInputElement).click());
  const download = page.waitForEvent('download', { timeout }).catch(() => undefined);
  await page.locator('#run').click();
  await expect.poll(async () => (await toolRuns(page)).length, { timeout }).toBe(1);
  // In an object: a bare promise returned from here would be waited on, and a failed run never downloads.
  return { download };
}

/** Picture track of an MP4: sample count and length in seconds, read from its boxes. */
function mp4Video(bytes: Buffer): { frames: number; seconds: number } {
  const find = (from: number, to: number, path: string[]): { start: number; end: number }[] => {
    const hits: { start: number; end: number }[] = [];
    for (let p = from; p + 8 <= to; ) {
      let size = bytes.readUInt32BE(p);
      const type = bytes.toString('latin1', p + 4, p + 8);
      if (size === 1) size = Number(bytes.readBigUInt64BE(p + 8));
      if (size === 0) size = to - p;
      if (size < 8) break;
      if (type === path[0]) {
        if (path.length === 1) hits.push({ start: p, end: p + size });
        else hits.push(...find(p + 8, p + size, path.slice(1)));
      }
      p += size;
    }
    return hits;
  };
  for (const trak of find(0, bytes.length, ['moov', 'trak'])) {
    const hdlr = find(trak.start + 8, trak.end, ['mdia', 'hdlr'])[0]!;
    if (bytes.toString('latin1', hdlr.start + 16, hdlr.start + 20) !== 'vide') continue;
    const stsz = find(trak.start + 8, trak.end, ['mdia', 'minf', 'stbl', 'stsz'])[0]!;
    const mdhd = find(trak.start + 8, trak.end, ['mdia', 'mdhd'])[0]!;
    const v1 = bytes[mdhd.start + 8] === 1;
    const scale = bytes.readUInt32BE(mdhd.start + (v1 ? 28 : 20));
    const length = v1 ? Number(bytes.readBigUInt64BE(mdhd.start + 32)) : bytes.readUInt32BE(mdhd.start + 24);
    return { frames: bytes.readUInt32BE(stsz.start + 16), seconds: length / scale };
  }
  throw new Error('no picture track');
}

/** The clip's own picture, for what a whole run should come out as. */
const source = () => mp4Video(readFileSync(clip));

const RESTARTED = /software video encoder|smaller size|started again|second try/;

const recovers: [string, Fault][] = [
  ['an encoder call that throws InvalidStateError once', { codec: 'encoder', how: 'throw', after: 12, times: 1 }],
  ['an encoder the browser reclaimed between frames', { codec: 'encoder', how: 'reclaim', after: 12, times: 1 }],
  ['a decoder call that throws InvalidStateError once', { codec: 'decoder', how: 'throw', after: 12, times: 1 }],
  ['a decoder the browser reclaimed between frames', { codec: 'decoder', how: 'reclaim', after: 12, times: 1 }],
];

for (const [what, fault] of recovers) {
  test(`${what} is replaced mid-run and the output is complete`, async ({ page }) => {
    test.setTimeout(300_000);
    await stubAnalytics(page);
    await page.addInitScript(breakCodec, fault);
    const { download } = await runOnce(page);
    expect(await toolRuns(page)).toMatchObject([{ outcome: 'ok' }]);
    await expect(page.locator('#error')).not.toHaveClass(/is-active/);
    // Recovered inside the run: the retry ladder never started, so no "started again" note.
    await expect(page.locator('#results-list')).not.toContainText(RESTARTED);
    const out = mp4Video(readFileSync(await (await download)!.path()));
    const was = source();
    expect(out.frames, 'every frame is there').toBe(was.frames);
    expect(Math.abs(out.seconds - was.seconds)).toBeLessThan(0.15);
  });
}

const never: [string, Fault, string, string][] = [
  ['decoder', { codec: 'decoder', how: 'throw', after: 12, times: 1000 }, 'DecoderReclaimedError', 'took back the video decoder'],
  ['encoder', { codec: 'encoder', how: 'throw', after: 12, times: 1000 }, 'EncoderReclaimedError', 'took back the video encoder'],
];

for (const [name, fault, errorClass, words] of never) {
  test(`a ${name} that fails every time records ${errorClass} and says what to do`, async ({ page }) => {
    test.setTimeout(420_000);
    await stubAnalytics(page);
    await page.addInitScript(breakCodec, fault);
    await runOnce(page, 400_000);
    const runs = await toolRuns(page);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ outcome: 'error', error_class: errorClass });
    await expect(page.locator('#error')).toHaveClass(/is-active/);
    await expect(page.locator('#error')).toContainText(words);
    await expect(page.locator('#error')).toContainText('try once more');
  });
}
