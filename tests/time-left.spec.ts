import { test, expect } from '@playwright/test';
import { TimeLeft } from '../src/lib/time-left';

// The estimate behind "about 30 s left" on the video background tools, driven by a fake clock so it needs no browser.
// A job of `total` seconds at `rate` (fraction per second); reports one update every 0.25 s.
function run(speed: (t: number) => number) {
  let now = 100;
  const tl = new TimeLeft(() => now);
  const shown: { t: number; text: string | undefined }[] = [];
  let f = 0;
  tl.update(f);
  for (let t = 0; f < 1 && t < 600; t += 0.25) {
    now += 0.25;
    f = Math.min(1, f + speed(t) * 0.25);
    shown.push({ t, text: tl.update(f) });
  }
  return shown;
}
const seconds = (text: string) => {
  const m = /about (?:(\d+) min)? ?(?:(\d+) s)? ?left/.exec(text)!;
  return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
};
const secondsOf = (s: { text: string | undefined }[]) => s.filter((x) => x.text).map((x) => seconds(x.text!));

test('time left stays quiet while it measures, then counts down at a steady speed', () => {
  const shown = run(() => 1 / 40); // 40 s job
  expect(shown.slice(0, 9).every((x) => x.text === undefined), 'nothing in the 2.5 s warm-up').toBe(true);
  const nums = secondsOf(shown);
  expect(nums.length).toBeGreaterThan(10);
  expect(nums[0]).toBeGreaterThanOrEqual(30);
  expect(nums[0]).toBeLessThanOrEqual(40);
  for (let i = 1; i < nums.length; i++) expect(nums[i]!).toBeLessThanOrEqual(nums[i - 1]!);
});

test('time left does not jitter up and down with small speed changes', () => {
  // The speed wobbles by about 15% from frame to frame.
  const shown = run((t) => (1 / 40) * (1 + 0.15 * Math.sin(t * 7)));
  const nums = secondsOf(shown);
  for (let i = 1; i < nums.length; i++) expect(nums[i]!).toBeLessThanOrEqual(nums[i - 1]!);
});

test('time left does not round up a few seconds near the end', () => {
  // The work slows down part way (to 60-80% of its speed): the true change is a few seconds, but the estimate used to
  // wobble between two rounding steps ("10 s" then "20 s") on its way down.
  for (const [total, switchAt, factor] of [[40, 14, 0.7], [40, 16, 0.7], [40, 22, 0.6], [50, 12, 0.8], [50, 26, 0.8], [50, 30, 0.7]] as const) {
    const nums = secondsOf(run((t) => (t < switchAt ? 1 : factor) / total));
    for (let i = 1; i < nums.length; i++) expect(nums[i]!, `${total} s job slowing to ${factor} at ${switchAt} s: ${nums.join(' ')}`).toBeLessThanOrEqual(nums[i - 1]!);
  }
});

test('time left does go up when the work genuinely slows right down', () => {
  const shown = run((t) => (t < 5 ? 1 / 20 : 1 / 120));
  const nums = secondsOf(shown);
  const first = nums[0]!;
  expect(Math.max(...nums), 'it raises its estimate for a real slowdown').toBeGreaterThan(first);
});
