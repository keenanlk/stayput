// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { sliderToHz, hzToSlider, clampHz, levelToGain, DEFAULT_LEVEL, MAX_LEVEL, MIN_HZ, MAX_HZ, SLIDER_MAX } from '../src/lib/tone-generator';

// Runs in Chromium and WebKit, and against the live site (baseURL only). The output is measured at
// the AudioContext destination: whatever connects to it is also fed to an analyser, and the loudest
// FFT bin gives the pitch actually heard, not just the value the page says it set.

declare global {
  interface Window {
    __events: { n: string; d: Record<string, string> }[];
    __tone: () => { hz: number; peak: number; count: number };
  }
}

test('the frequency scale is logarithmic and clamped, and the level curve is capped', () => {
  expect(sliderToHz(0)).toBe(MIN_HZ);
  expect(sliderToHz(SLIDER_MAX)).toBe(MAX_HZ);
  expect(sliderToHz(SLIDER_MAX / 2)).toBeCloseTo(Math.sqrt(MIN_HZ * MAX_HZ), -1);
  expect(Math.abs(hzToSlider(440) - hzToSlider(sliderToHz(hzToSlider(440))))).toBeLessThanOrEqual(1);
  expect(clampHz(5)).toBe(MIN_HZ);
  expect(clampHz(99999)).toBe(MAX_HZ);
  expect(levelToGain(DEFAULT_LEVEL)).toBeCloseTo(0.1, 5);
  expect(levelToGain(100)).toBeCloseTo(MAX_LEVEL / 100, 5);
});

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: 'window.__events=[];window.umami={track:(n,d)=>window.__events.push({n,d})};' }),
  );
  await page.addInitScript(() => {
    let analyser: AnalyserNode | undefined;
    const orig = AudioNode.prototype.connect as (this: AudioNode, ...a: unknown[]) => unknown;
    (AudioNode.prototype as unknown as { connect: unknown }).connect = function (this: AudioNode, ...args: unknown[]) {
      const out = orig.apply(this, args);
      if (args[0] instanceof AudioDestinationNode && !analyser) {
        analyser = this.context.createAnalyser();
        analyser.fftSize = 8192;
        analyser.smoothingTimeConstant = 0;
        orig.call(this, analyser);
      }
      return out;
    };
    window.__tone = () => {
      if (!analyser) return { hz: 0, peak: 0, count: 0 };
      const t = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(t);
      const peak = t.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
      const f = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatFrequencyData(f);
      let best = 1;
      for (let i = 1; i < f.length; i++) if (f[i]! > f[best]!) best = i;
      return { hz: (best * analyser.context.sampleRate) / analyser.fftSize, peak, count: 1 };
    };
  });
  await page.goto('/tools/tone-generator');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  return errors;
}

/** The loudest peak and the pitch of the strongest bin, over about a third of a second. */
async function heard(page: Page) {
  return page.evaluate(async () => {
    let peak = 0;
    let hz = 0;
    for (let i = 0; i < 10; i++) {
      const s = window.__tone();
      if (s.peak >= peak) {
        peak = s.peak;
        hz = s.hz;
      }
      await new Promise((ok) => setTimeout(ok, 30));
    }
    return { peak, hz };
  });
}

const binWidth = 48000 / 8192; // about 5.9 Hz; the context may run at 44.1 kHz, which is finer

test('starts quiet and silent, with the hearing warning in view and no file zone', async ({ page }) => {
  const errors = await open(page);
  await expect(page.locator('#drop')).toBeHidden();
  await expect(page.locator('#tone-warn')).toBeVisible();
  await expect(page.locator('#tone-warn')).toContainText('headphones');
  await expect(page.locator('#tone-level')).toHaveValue(String(DEFAULT_LEVEL));
  await expect(page.locator('#tone-level')).toHaveAttribute('max', String(MAX_LEVEL));
  await expect(page.locator('#tone-hz')).toHaveValue('440');
  await expect(page.locator('#tone-now')).toHaveText('Nothing is playing.');
  expect((await page.evaluate(() => window.__tone())).count).toBe(0); // no AudioContext until a press
  expect(errors).toEqual([]);
});

test('plays at the set frequency, follows wave and frequency changes, and stop is silent', async ({ page }) => {
  const errors = await open(page);
  await page.locator('#tone-toggle').click();
  await expect(page.locator('#tone-panel')).toHaveAttribute('data-state', 'playing');
  await expect(page.locator('#tone-now')).toContainText('440 Hz sine');
  let h = await heard(page);
  expect(Math.abs(h.hz - 440)).toBeLessThanOrEqual(binWidth * 1.5);
  expect(h.peak).toBeGreaterThan(0.05);
  expect(h.peak).toBeLessThan(0.15); // the default level is about 0.1 of full scale

  // Type a frequency while it plays.
  await page.locator('#tone-hz').fill('1000');
  await expect(page.locator('#tone-now')).toContainText('1 kHz sine');
  await page.waitForTimeout(200);
  h = await heard(page);
  expect(Math.abs(h.hz - 1000)).toBeLessThanOrEqual(binWidth * 1.5);
  await expect(page.locator('#tone-freq')).toHaveValue(String(hzToSlider(1000)));

  // The slider and a preset keep the typed box in step.
  await page.locator('.tone-presets [data-hz="50"]').click();
  await expect(page.locator('#tone-hz')).toHaveValue('50');
  await page.waitForTimeout(200);
  h = await heard(page);
  expect(Math.abs(h.hz - 50)).toBeLessThanOrEqual(binWidth * 1.5);

  // A square wave at 440 Hz is louder than the sine at the same gain, and the pitch stays.
  await page.locator('.tone-presets [data-hz="440"]').click();
  await page.locator('input[name="tone-wave"][value="square"]').locator('xpath=..').click();
  await expect(page.locator('#tone-panel')).toHaveAttribute('data-wave', 'square');
  await expect(page.locator('#tone-now')).toContainText('square wave');
  await page.waitForTimeout(200);
  h = await heard(page);
  expect(Math.abs(h.hz - 440)).toBeLessThanOrEqual(binWidth * 1.5);
  expect(h.peak).toBeGreaterThan(0.08); // a square's flat top reaches the whole gain

  await page.locator('#tone-toggle').click();
  await expect(page.locator('#tone-panel')).toHaveAttribute('data-state', 'stopped');
  await expect(page.locator('#tone-now')).toHaveText('Nothing is playing.');
  await page.waitForTimeout(300);
  h = await heard(page);
  expect(h.peak).toBeLessThan(1e-3);
  expect(errors).toEqual([]);
});

test('the slider sets the typed frequency, and a hidden tab stops the tone', async ({ page }) => {
  await open(page);
  await page.locator('#tone-freq').fill(String(hzToSlider(2000)));
  await expect(page.locator('#tone-hz')).toHaveValue(String(sliderToHz(hzToSlider(2000))));
  await page.locator('#tone-toggle').click();
  await expect(page.locator('#tone-panel')).toHaveAttribute('data-state', 'playing');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#tone-panel')).toHaveAttribute('data-state', 'stopped');
});

test('the usage event carries no tone, wave or level', async ({ page }) => {
  await open(page);
  await page.locator('#tone-toggle').click();
  await expect(page.locator('#tone-panel')).toHaveAttribute('data-state', 'playing');
  const runs = await page.evaluate(() => window.__events.filter((e) => e.n === 'tool_run'));
  expect(runs).toHaveLength(1);
  expect(runs[0]!.d.tool).toBe('tone-generator');
  const text = JSON.stringify(runs);
  for (const bad of ['440', 'sine', 'square', 'hz']) expect(text.toLowerCase()).not.toContain(bad);
});
