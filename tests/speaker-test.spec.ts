// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { channelGains, levelToGain, pinkNoise, sweepFrequency, SWEEP_FROM, SWEEP_TO, SWEEP_SECONDS, DEFAULT_LEVEL, MAX_LEVEL } from '../src/lib/speaker-test';
import { siteHost } from './allowed-host';

// Runs in Chromium and WebKit. The page's output is measured the way a listener's ears would hear
// it: whatever is connected to the AudioContext destination is also split into two analysers, one
// per channel, so "left only" has to be silent on the right at the output, not just in the graph.

declare global {
  interface Window {
    __events: { n: string; d: Record<string, string> }[];
    __side: () => { l: number; r: number; count: number };
  }
}

test('channelGains, the level curve, the sweep and the noise', () => {
  expect(channelGains('left')).toEqual({ left: 1, right: 0 });
  expect(channelGains('right')).toEqual({ left: 0, right: 1 });
  expect(channelGains('both')).toEqual({ left: 1, right: 1 });
  expect(levelToGain(DEFAULT_LEVEL)).toBeCloseTo(0.1, 5);
  expect(levelToGain(100)).toBeCloseTo(MAX_LEVEL / 100, 5);
  expect(sweepFrequency(0)).toBeCloseTo(SWEEP_FROM, 3);
  expect(sweepFrequency(SWEEP_SECONDS)).toBeCloseTo(SWEEP_TO, 0);
  expect(sweepFrequency(SWEEP_SECONDS * 3)).toBeCloseTo(SWEEP_TO, 0);
  // Equal musical steps: halfway in time is the geometric middle.
  expect(sweepFrequency(SWEEP_SECONDS / 2)).toBeCloseTo(Math.sqrt(SWEEP_FROM * SWEEP_TO), 0);
  // The sweep never goes above 16 kHz, where small speakers and ears give out.
  expect(SWEEP_TO).toBeLessThanOrEqual(16000);
  const noise = pinkNoise(20000, ((s) => () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296))(1));
  expect(Math.max(...noise.map(Math.abs))).toBeCloseTo(0.5, 5);
  // Pink, not white: neighbouring samples move together.
  let same = 0;
  for (let i = 1; i < noise.length; i++) if (Math.sign(noise[i]!) === Math.sign(noise[i - 1]!)) same++;
  expect(same / noise.length).toBeGreaterThan(0.6);
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
    const analysers: AnalyserNode[] = [];
    const orig = AudioNode.prototype.connect as (this: AudioNode, ...a: unknown[]) => unknown;
    const tapped = new WeakSet<BaseAudioContext>();
    (AudioNode.prototype as unknown as { connect: unknown }).connect = function (this: AudioNode, ...args: unknown[]) {
      const out = orig.apply(this, args);
      const target = args[0];
      if (target instanceof AudioDestinationNode && !tapped.has(this.context)) {
        tapped.add(this.context);
        const split = this.context.createChannelSplitter(2);
        orig.call(this, split);
        for (let ch = 0; ch < 2; ch++) {
          const a = this.context.createAnalyser();
          a.fftSize = 2048;
          orig.call(split, a, ch, 0);
          analysers[ch] = a;
        }
      }
      return out;
    };
    const peak = (a?: AnalyserNode) => {
      if (!a) return 0;
      const buf = new Float32Array(a.fftSize);
      a.getFloatTimeDomainData(buf);
      return buf.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    };
    // The loudest peak over a short while, so a tone's zero crossings do not read as silence.
    window.__side = () => ({ l: peak(analysers[0]), r: peak(analysers[1]), count: analysers.length });
  });
  await page.goto('/tools/speaker-test');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  return errors;
}

/** The loudest each side got over about a third of a second. */
async function sides(page: Page) {
  return page.evaluate(async () => {
    let l = 0;
    let r = 0;
    for (let i = 0; i < 12; i++) {
      const s = window.__side();
      l = Math.max(l, s.l);
      r = Math.max(r, s.r);
      await new Promise((ok) => setTimeout(ok, 30));
    }
    return { l, r };
  });
}

test('the page starts quiet and silent, with the loud-tone warning in view and no file zone', async ({ page }) => {
  const errors = await open(page);
  await expect(page.locator('#drop')).toBeHidden();
  await expect(page.locator('#spk-warn')).toBeVisible();
  await expect(page.locator('#spk-warn')).toContainText('Loud tones can hurt');
  await expect(page.locator('#spk-level')).toHaveValue(String(DEFAULT_LEVEL));
  await expect(page.locator('#spk-level')).toHaveAttribute('max', String(MAX_LEVEL));
  await expect(page.locator('#spk-now')).toHaveText('Nothing is playing.');
  await expect(page.locator('#spk-stop')).toBeDisabled();
  expect((await page.evaluate(() => window.__side())).count).toBe(0); // no AudioContext until a press
  expect(errors).toEqual([]);
});

test('left plays on the left only, right on the right only, both on both; stop is silent', async ({ page }) => {
  const errors = await open(page);
  await page.locator('#spk-tone').click();
  await expect(page.locator('#spk-panel')).toHaveAttribute('data-state', 'playing');
  await expect(page.locator('#spk-now')).toContainText('440 Hz tone, both channels');
  let s = await sides(page);
  expect(s.l).toBeGreaterThan(0.05);
  expect(s.r).toBeGreaterThan(0.05);
  expect(s.l).toBeLessThan(0.15); // the default level is about 0.1 of full scale

  await page.locator('input[name="spk-channel"][value="left"]').check({ force: true });
  await expect(page.locator('#spk-now')).toContainText('left channel');
  await page.waitForTimeout(150);
  s = await sides(page);
  expect(s.l).toBeGreaterThan(0.05);
  expect(s.r).toBeLessThan(1e-4);

  await page.locator('input[name="spk-channel"][value="right"]').check({ force: true });
  await page.waitForTimeout(150);
  s = await sides(page);
  expect(s.r).toBeGreaterThan(0.05);
  expect(s.l).toBeLessThan(1e-4);

  await page.locator('#spk-stop').click();
  await expect(page.locator('#spk-panel')).toHaveAttribute('data-state', 'stopped');
  await page.waitForTimeout(250);
  s = await sides(page);
  expect(s.l).toBeLessThan(1e-3);
  expect(s.r).toBeLessThan(1e-3);
  expect(errors).toEqual([]);
});

test('the sweep rises in pitch and the noise plays, each on the chosen side only', async ({ page }) => {
  const errors = await open(page);
  await page.locator('input[name="spk-channel"][value="right"]').check({ force: true });
  await page.locator('#spk-sweep').click();
  await expect(page.locator('#spk-panel')).toHaveAttribute('data-sound', 'sweep');
  await expect(page.locator('#spk-now')).toContainText(/^Sweep .* (Hz|kHz), right channel$/);
  const hz = (t: string) => {
    const m = /Sweep ([\d.,]+) (k?Hz)/.exec(t)!;
    return Number(m[1]!.replace(',', '')) * (m[2] === 'kHz' ? 1000 : 1);
  };
  const first = hz((await page.locator('#spk-now').textContent())!);
  await page.waitForTimeout(1500);
  const later = hz((await page.locator('#spk-now').textContent())!);
  expect(first).toBeGreaterThanOrEqual(SWEEP_FROM - 1);
  expect(later).toBeGreaterThan(first * 1.2);
  let s = await sides(page);
  expect(s.r).toBeGreaterThan(0.02);
  expect(s.l).toBeLessThan(1e-4);

  // Switching sound replaces the sweep; pink noise on the left.
  await page.locator('input[name="spk-channel"][value="left"]').check({ force: true });
  await page.locator('#spk-noise').click();
  await expect(page.locator('#spk-panel')).toHaveAttribute('data-sound', 'noise');
  await expect(page.locator('#spk-now')).toHaveText('Pink noise, left channel');
  await page.waitForTimeout(150);
  s = await sides(page);
  expect(s.l).toBeGreaterThan(0.02);
  expect(s.r).toBeLessThan(1e-4);
  await page.locator('#spk-noise').click(); // the same button stops it
  await expect(page.locator('#spk-panel')).toHaveAttribute('data-state', 'stopped');
  expect(errors).toEqual([]);
});

test('a louder level waits for a confirm; coming back down needs none', async ({ page }) => {
  const errors = await open(page);
  const level = page.locator('#spk-level');
  const set = (v: number) => level.evaluate((el: HTMLInputElement, n) => { el.value = String(n); el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
  await set(40);
  await expect(level).toHaveValue('40');
  await expect(page.locator('#spk-confirm')).toBeHidden();
  await set(65);
  await expect(page.locator('#spk-confirm')).toBeVisible();
  await expect(level).toHaveValue('40'); // not louder yet
  await page.locator('#spk-keep').click();
  await expect(page.locator('#spk-confirm')).toBeHidden();
  await expect(level).toHaveValue('40');
  await set(65);
  await page.locator('#spk-allow').click();
  await expect(level).toHaveValue('65');
  await expect(page.locator('#spk-level-text')).toHaveText('65%');
  await set(30);
  await expect(level).toHaveValue('30');
  await expect(page.locator('#spk-confirm')).toBeHidden();
  await set(60); // above the line again after coming below it: asks again
  await expect(page.locator('#spk-confirm')).toBeVisible();
  expect(errors).toEqual([]);
});

test('one usage event with no tone, channel or level in it, and nothing is fetched or uploaded', async ({ page }) => {
  const errors = await open(page);
  const requests: string[] = [];
  page.on('request', (r) => requests.push(`${r.method()} ${r.url()}`));
  await page.locator('input[name="spk-channel"][value="left"]').check({ force: true });
  await page.locator('#spk-freq').selectOption('4000');
  await page.locator('#spk-tone').click();
  await expect(page.locator('#spk-now')).toContainText('4 kHz tone, left channel');
  await page.locator('#spk-stop').click();
  await page.locator('#spk-sweep').click();
  await page.locator('#spk-stop').click();
  const runs = await page.evaluate(() => window.__events.filter((e) => e.n === 'tool_run'));
  expect(runs).toHaveLength(1);
  const data = runs[0]!.d;
  expect(data.tool).toBe('speaker-test');
  expect(data).not.toHaveProperty('format');
  const text = JSON.stringify(window_events(await page.evaluate(() => window.__events)));
  expect(text).not.toMatch(/4000|4 kHz|\bleft\b|\bright\b|sweep|noise|tone|level/i);
  expect(requests.filter((r) => new URL(r.slice(r.indexOf(' ') + 1)).hostname !== siteHost() && !r.includes('stats.keenankaufman.com'))).toEqual([]);
  expect(requests.filter((r) => r.startsWith('POST'))).toEqual([]);
  expect(errors).toEqual([]);
});

const window_events = (events: { n: string; d: Record<string, string> }[]) => events.map((e) => ({ n: e.n, d: Object.fromEntries(Object.entries(e.d).filter(([k]) => k !== 'tool')) }));
