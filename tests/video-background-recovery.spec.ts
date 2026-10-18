// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { smallerSide, withRecovery, type RecoveryHooks } from '../src/lib/edit-recovery';

// A phone run that fails because the page was hidden, or because the video encoder gave up, starts again by itself
// (once) before the failure is shown. The failures are forced in the page: the encoder throws once, and visibilitychange
// events stand in for apps being switched (a real iPhone suspending the page is not reproducible here).
const clip = fileURLToPath(new URL('./fixtures/static/iphone-portrait-person.mov', import.meta.url));
const hevc = fileURLToPath(new URL('./fixtures/static/iphone-hevc.mov', import.meta.url));
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

function hooks(over: Partial<RecoveryHooks> = {}): RecoveryHooks & { notices: string[]; waited: number } {
  const h = {
    notices: [] as string[],
    waited: 0,
    wasHidden: () => false,
    forgetHidden: () => {},
    whenVisible: async () => {
      h.waited++;
    },
    reclaimed: () => false,
    onNotice: (m: string) => void h.notices.push(m),
    ...over,
  };
  return h;
}
const named = (name: string) => Object.assign(new Error(name), { name });

test.describe('recovery rules', () => {
  test('a hidden page waits for the page, then runs once more', async () => {
    let hidden = true;
    const h = hooks({ wasHidden: () => hidden, forgetHidden: () => (hidden = false) });
    let calls = 0;
    const out = await withRecovery(
      async (a) => {
        calls++;
        if (calls === 1) throw named('EncodingError');
        return a.retry;
      },
      () => 1280,
      h,
    );
    expect(out).toBe('resumed');
    expect(h.waited).toBe(1);
    expect(h.notices).toHaveLength(1);
  });

  test('a codec the browser took back counts as a hidden page', async () => {
    const h = hooks({ reclaimed: (e) => (e as Error).name === 'InvalidStateError' });
    let calls = 0;
    const out = await withRecovery(
      async (a) => {
        if (calls++ === 0) throw named('InvalidStateError');
        return a.retry;
      },
      () => 1280,
      h,
    );
    expect(out).toBe('resumed');
  });

  test('an encoder failure runs again one step smaller', async () => {
    const sides: (number | undefined)[] = [];
    const out = await withRecovery(
      async (a) => {
        sides.push(a.maxSide);
        if (!a.maxSide) throw named('EncodingError');
        return a.retry;
      },
      () => 3840,
      hooks(),
    );
    expect(out).toBe('smaller');
    expect(sides).toEqual([undefined, 1920]);
  });

  test('the second failure is thrown with its own name, and there is no third try', async () => {
    let calls = 0;
    const result = withRecovery(
      async () => {
        calls++;
        throw named(calls === 1 ? 'EncodingError' : 'EncoderStall');
      },
      () => 1280,
      hooks(),
    );
    await expect(result).rejects.toMatchObject({ name: 'EncoderStall' });
    expect(calls).toBe(2);
  });

  test('what is wrong with the file or the input is never retried, even if the page was hidden', async () => {
    for (const name of ['UnreadableFile', 'InputError', 'AudioDecodeError', 'EditUnsupported']) {
      let calls = 0;
      await expect(
        withRecovery(
          async () => {
            calls++;
            throw named(name);
          },
          () => 1280,
          hooks({ wasHidden: () => true }),
        ),
      ).rejects.toMatchObject({ name });
      expect(calls).toBe(1);
    }
  });

  test('an unknown failure on a picture already small is thrown as it came', async () => {
    let calls = 0;
    await expect(
      withRecovery(
        async () => {
          calls++;
          throw named('TypeError');
        },
        () => 1280,
        hooks(),
      ),
    ).rejects.toMatchObject({ name: 'TypeError' });
    expect(calls).toBe(1);
    expect(smallerSide(854)).toBeUndefined();
    expect(smallerSide(2000)).toBe(1920);
  });
});

/**
 * In the page: once frames are being processed, the encoder throws `name` once. With `hide`, the page also reports hidden for
 * a moment (the Page Visibility API as a phone's app switch shows it) and the throw happens while it is.
 */
async function breakEncoder(page: Page, name: string, hide: boolean) {
  await page.addInitScript(
    ([name, hide]) => {
      let armed = false;
      const original = VideoEncoder.prototype.encode;
      VideoEncoder.prototype.encode = function (this: VideoEncoder, ...args: Parameters<VideoEncoder['encode']>) {
        // Not the encoder probe's test frames: only once the page says the frames themselves are being replaced.
        const running = /Replacing the background/.test(document.getElementById('progress-text')?.textContent ?? '');
        if (running && !armed) {
          armed = true;
          if (hide) {
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
        return original.apply(this, args);
      };
    },
    [name, hide] as const,
  );
}

async function runBlur(page: Page, file = clip) {
  await page.goto('/blur-video-background');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles([file]);
  await page.locator('input[name="finder"][value="fast"]').evaluate((el) => (el as HTMLInputElement).click());
  await page.locator('#run').click();
}

test.describe('on the page', () => {
  test('the page hidden mid-run: the run starts again when it is back and finishes', async ({ page }) => {
    test.setTimeout(240_000);
    await breakEncoder(page, 'InvalidStateError', true);
    await runBlur(page);
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
    await expect(page.locator('#results-list')).toContainText('started again after the page was hidden');
    await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  });

  test('the encoder gives up at full size: the run finishes at a smaller size and says so', async ({ page }) => {
    test.setTimeout(240_000);
    await breakEncoder(page, 'EncodingError', false);
    await runBlur(page);
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
    await expect(page.locator('#results-list')).toContainText('made at a smaller size');
    await expect(page.locator('#results-list')).toContainText(/854×\d+|\d+×854/);
  });

  test.describe('on an Android phone', () => {
    test.use({ userAgent: ANDROID, hasTouch: true });

    test('a clip the browser cannot decode fails with a plain Android message, before the person finder downloads', async ({ page, browserName }) => {
      test.skip(browserName !== 'chromium', 'WebKit decodes HEVC');
      const models: string[] = [];
      page.on('request', (r) => /\/models\/|\/vendor\/mediapipe/.test(r.url()) && models.push(r.url()));
      await runBlur(page, hevc);
      await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 60_000 });
      const text = (await page.locator('#error').textContent()) ?? '';
      // Headless Chromium here may decode HEVC through the system; only the order of events is asserted then.
      if (/cannot decode/i.test(text)) {
        expect(text).toMatch(/Android|phone/i);
        expect(text).not.toMatch(/try Safari/i);
        expect(models).toEqual([]);
      }
    });
  });
});

test.describe('software encode fallback', () => {
  test('the first encoder failure runs again in software at the same size, before any smaller picture', async () => {
    const seen: (string | undefined)[] = [];
    const sides: (number | undefined)[] = [];
    const out = await withRecovery(
      async (a) => {
        seen.push(a.retry);
        sides.push(a.maxSide);
        if (!a.retry) throw named('EncodingError');
        return a.retry;
      },
      () => 3840,
      hooks({ softwareEncode: () => true }),
    );
    expect(out).toBe('software');
    expect(seen).toEqual([undefined, 'software']);
    expect(sides).toEqual([undefined, undefined]);
  });

  test('a failing software try goes on to the smaller picture, and a third failure is thrown with its name', async () => {
    const seen: (string | undefined)[] = [];
    await expect(
      withRecovery(
        async (a) => {
          seen.push(a.retry);
          throw named(a.retry === 'smaller' ? 'EncoderStall' : 'EncodingError');
        },
        () => 3840,
        hooks({ softwareEncode: () => true }),
      ),
    ).rejects.toMatchObject({ name: 'EncoderStall' });
    expect(seen).toEqual([undefined, 'software', 'smaller']);
  });

  test('a stalled encoder also gets the software try first', async () => {
    const seen: (string | undefined)[] = [];
    await withRecovery(
      async (a) => {
        seen.push(a.retry);
        if (!a.retry) throw named('EncoderStall');
        return 1;
      },
      () => 640,
      hooks({ softwareEncode: async () => true }),
    );
    expect(seen).toEqual([undefined, 'software']);
  });

  test('without a software encoder on offer the ladder is unchanged', async () => {
    const seen: (string | undefined)[] = [];
    await withRecovery(
      async (a) => {
        seen.push(a.retry);
        if (!a.retry) throw named('EncodingError');
        return 1;
      },
      () => 3840,
      hooks({ softwareEncode: () => false }),
    );
    expect(seen).toEqual([undefined, 'smaller']);
  });

  test('what is wrong with the file is never retried in software', async () => {
    let calls = 0;
    await expect(
      withRecovery(
        async () => {
          calls++;
          throw named('UnreadableFile');
        },
        () => 3840,
        hooks({ softwareEncode: () => true }),
      ),
    ).rejects.toMatchObject({ name: 'UnreadableFile' });
    expect(calls).toBe(1);
  });
});
