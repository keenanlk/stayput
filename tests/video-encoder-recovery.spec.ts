import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { withRecovery, type Attempt, type RecoveryHooks } from '../src/lib/edit-recovery';
import { withoutSoftwareEncoder } from './no-software-encoder';

// Reverse and merge recover the way compress does (resume after a hidden page, then a smaller picture), and a smaller size that
// worked is remembered for the rest of the tab. The encoder is made to fail in the page; the recovery rules run in Node.
const uhd = fileURLToPath(new URL('./fixtures/static/uhd-flat.mp4', import.meta.url));
const hd = fileURLToPath(new URL('./fixtures/static/hd-flat.mp4', import.meta.url));
const small = fileURLToPath(new URL('./fixtures/static/flat-blue-tone.mp4', import.meta.url));

const named = (name: string) => Object.assign(new Error(name), { name });

type Hooks = RecoveryHooks & { stored: number | undefined; writes: number[] };

function hooks(over: Partial<RecoveryHooks> = {}): Hooks {
  const h: Hooks = {
    stored: undefined as number | undefined,
    writes: [] as number[],
    wasHidden: () => false,
    forgetHidden: () => {},
    whenVisible: async () => {},
    reclaimed: () => false,
    rung: {
      get: (): number | undefined => h.stored,
      set: (side: number) => {
        h.stored = side;
        h.writes.push(side);
      },
    },
    ...over,
  };
  return h;
}

test.describe('recovery rules', () => {
  test('a size that worked after a failure is remembered; a run that worked at full size writes nothing', async () => {
    const h = hooks();
    expect(await withRecovery(async () => 'ok', () => 1920, h)).toBe('ok');
    expect(h.writes).toEqual([]);

    const seen: Attempt[] = [];
    await withRecovery(
      async (a) => {
        seen.push({ ...a });
        if (seen.length === 1) throw named('EncodingError');
        return 'ok';
      },
      () => 1920,
      h,
    );
    expect(seen[1]).toMatchObject({ maxSide: 1280, retry: 'smaller' });
    expect(h.writes).toEqual([1280]);
  });

  test('the next run starts at the remembered size, and a run that works there writes nothing new', async () => {
    const h = hooks();
    h.stored = 1280;
    const seen: Attempt[] = [];
    await withRecovery(async (a) => void seen.push({ ...a }), () => 1280, h);
    expect(seen).toEqual([{ maxSide: 1280, retry: 'remembered', remembered: true }]);
    expect(h.writes).toEqual([]);
  });

  test('a run that fails at the remembered size steps down from there and keeps the smaller size', async () => {
    const h = hooks();
    h.stored = 1280;
    const seen: Attempt[] = [];
    await withRecovery(
      async (a) => {
        seen.push({ ...a });
        if (seen.length === 1) throw named('EncodingError');
        return 'ok';
      },
      () => 1280,
      h,
    );
    expect(seen[1]).toMatchObject({ maxSide: 854, retry: 'smaller' });
    expect(h.stored).toBe(854);
  });

  test('a software retry or a resume at the remembered size keeps the size', async () => {
    const h = hooks({ softwareEncode: () => true });
    h.stored = 1280;
    const seen: Attempt[] = [];
    await withRecovery(
      async (a) => {
        seen.push({ ...a });
        if (seen.length === 1) throw named('EncodingError');
        return 'ok';
      },
      () => 1280,
      h,
    );
    expect(seen[1]).toMatchObject({ maxSide: 1280, retry: 'software' });
    expect(h.writes).toEqual([]);
  });

  test('errors a retry cannot change are thrown at once with their own names', async () => {
    for (const name of ['InputError', 'UnreadableFile', 'UnsupportedCodec', 'AudioDecodeError', 'NoSoundTrack', 'ConversionInvalid', 'EditUnsupported', 'NoSpeechFound']) {
      let calls = 0;
      await expect(
        withRecovery(
          async () => {
            calls++;
            throw named(name);
          },
          () => 3840,
          hooks({ wasHidden: () => true }),
        ),
      ).rejects.toMatchObject({ name });
      expect(calls).toBe(1);
    }
  });
});

/**
 * In the page: the encoder throws `name` for the first `times` frames of the clip itself (not the encoder probe's small test frames).
 * With `hide`, the page also reports hidden for a moment at the first throw, as a phone does when apps are switched.
 */
async function breakEncoder(page: Page, name: string, times: number, hide = false) {
  await withoutSoftwareEncoder(page);
  await page.addInitScript(
    ([name, times, hide]) => {
      // Counted in the tab's storage, so a page opened later in the same test does not start the count again.
      const count = () => Number(sessionStorage.getItem('test:thrown') ?? 0);
      const original = VideoEncoder.prototype.encode;
      VideoEncoder.prototype.encode = function (this: VideoEncoder, frame: VideoFrame, options?: VideoEncoderEncodeOptions) {
        if (frame.codedWidth >= 800 && count() < times) {
          sessionStorage.setItem('test:thrown', String(count() + 1));
          if (hide && count() === 1) {
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
            Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
            document.dispatchEvent(new Event('visibilitychange'));
            setTimeout(() => {
              Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
              Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
              document.dispatchEvent(new Event('visibilitychange'));
            }, 600);
          }
          throw new DOMException('forced by the test', name as string);
        }
        return original.call(this, frame, options);
      };
    },
    [name, times, hide] as const,
  );
}

type Tool = { name: string; url: string; files: string[] };
const tools: Tool[] = [
  { name: 'reverse', url: '/tools/reverse-video', files: [uhd] },
  { name: 'merge', url: '/tools/merge-videos', files: [uhd, small] },
];

async function run(page: Page, tool: Tool) {
  await page.goto(tool.url);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles(tool.files);
  await page.locator('#run').click();
}

/** The longest side the finished file's note reports (it reads "3840×2160"). */
async function longestSide(page: Page): Promise<number> {
  const text = (await page.locator('#results-list').textContent()) ?? '';
  const m = text.match(/(\d{3,4})×(\d{3,4})/);
  expect(m, `no size in "${text}"`).not.toBeNull();
  return Math.max(Number(m![1]), Number(m![2]));
}

for (const tool of tools) {
  test.describe(tool.name, () => {
    test('the encoder gives up at full size: the file is made at a smaller size and says so', async ({ page }) => {
      test.setTimeout(240_000);
      await breakEncoder(page, 'EncodingError', 1);
      await run(page, tool);
      await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
      await expect(page.locator('#results-list')).toContainText('made at a smaller size');
      expect(await longestSide(page)).toBe(1920);
      expect(await page.evaluate(() => sessionStorage.getItem('stayput:work-size'))).toBe('1920');
    });

    test('the page hidden mid-run: the run starts again when it is back, at full size, and writes no size', async ({ page }) => {
      test.setTimeout(240_000);
      await breakEncoder(page, 'AbortError', 1, true);
      await run(page, tool);
      await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
      await expect(page.locator('#results-list')).toContainText('started again after the page was hidden');
      expect(await longestSide(page)).toBe(3840);
      expect(await page.evaluate(() => sessionStorage.getItem('stayput:work-size'))).toBeNull();
    });

    test('the encoder refuses at every size: one error, with its class name and plain words', async ({ page }) => {
      test.setTimeout(240_000);
      await breakEncoder(page, 'EncodingError', 1000);
      await run(page, tool);
      await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 200_000 });
      await expect(page.locator('#error')).toContainText(/even at a smaller size/);
      expect(await page.evaluate(() => sessionStorage.getItem('stayput:work-size'))).toBeNull();
    });

    test('a run that works at full size writes no size', async ({ page }) => {
      test.setTimeout(240_000);
      await run(page, tool);
      await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
      expect(await longestSide(page)).toBe(3840);
      expect(await page.evaluate(() => sessionStorage.getItem('stayput:work-size'))).toBeNull();
    });
  });
}

test('the size that worked is remembered for the tab: the next run starts there, says so, and "Try full size" clears it', async ({ page, context }) => {
  test.setTimeout(480_000);
  // The encoder fails once at full size (1080p) and works at the next size down.
  await breakEncoder(page, 'EncodingError', 1);
  await run(page, { ...tools[0]!, files: [hd] });
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
  expect(await longestSide(page)).toBe(1280);
  expect(await page.evaluate(() => sessionStorage.getItem('stayput:work-size'))).toBe('1280');

  // A different tool in the same tab starts at 1280 and says why.
  await page.goto('/tools/merge-videos');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#working-size-note')).toContainText('720p');
  await page.locator('#file-input').setInputFiles([hd, small]);
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
  expect(await longestSide(page)).toBe(1280);
  await expect(page.locator('#results-list')).toContainText('made at 720p because the full size failed on this device');

  // A new tab starts at full size.
  const fresh = await context.newPage();
  await fresh.goto('/tools/reverse-video');
  await expect(fresh.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await expect(fresh.locator('#working-size-note')).toBeHidden();
  expect(await fresh.evaluate(() => sessionStorage.getItem('stayput:work-size'))).toBeNull();
  await fresh.close();

  // "Try full size" clears it, and the next run is full size again.
  await page.goto('/tools/reverse-video');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('button', { name: 'Try full size' }).click();
  await expect(page.locator('#working-size-note')).toBeHidden();
  expect(await page.evaluate(() => sessionStorage.getItem('stayput:work-size'))).toBeNull();
  await page.locator('#file-input').setInputFiles([hd]);
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
  expect(await longestSide(page)).toBe(1920);
});
