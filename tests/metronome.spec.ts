import { test, expect } from '@playwright/test';
import { bpmFromTaps, clampBpm, clicksBetween, tempoName } from '../src/lib/metronome';

test('clicksBetween spaces beats evenly, counts the bar, and carries on where it stopped', () => {
  // 120 BPM in 3/4: a beat every half second.
  const first = clicksBetween(10, 0, 11.2, 120, 3, 1);
  expect(first.clicks.map((c) => c.time)).toEqual([10, 10.5, 11]);
  expect(first.clicks.map((c) => c.beat)).toEqual([0, 1, 2]);
  const second = clicksBetween(10, first.next, 12.1, 120, 3, 1);
  expect(second.clicks.map((c) => c.time)).toEqual([11.5, 12]);
  expect(second.clicks.map((c) => c.beat)).toEqual([0, 1]);
});

test('clicksBetween adds subdivisions inside each beat', () => {
  const { clicks } = clicksBetween(0, 0, 1, 60, 4, 3);
  expect(clicks).toHaveLength(3);
  expect(clicks.map((c) => c.sub)).toEqual([0, 1, 2]);
  expect(clicks[1]!.time).toBeCloseTo(1 / 3, 9);
  expect(clicks.every((c) => c.beat === 0)).toBe(true);
});

test('bpmFromTaps uses the median gap, ignores one stray tap, and restarts after a pause', () => {
  expect(bpmFromTaps([1000])).toBeUndefined();
  expect(bpmFromTaps([0, 500, 1000, 1500])).toBe(120);
  // One late tap among steady ones at 100 BPM (600 ms).
  expect(bpmFromTaps([0, 600, 1200, 1950, 2400, 3000])).toBe(100);
  // After a pause of more than two seconds, only the new taps count.
  expect(bpmFromTaps([0, 500, 1000, 5000, 5750, 6500])).toBe(80);
  expect(bpmFromTaps([0, 10])).toBe(300);
});

test('clampBpm keeps the tempo in range and tempoName names it', () => {
  expect(clampBpm(5)).toBe(20);
  expect(clampBpm(999)).toBe(300);
  expect(clampBpm(99.6)).toBe(100);
  expect(tempoName(60)).toBe('Larghetto');
  expect(tempoName(100)).toBe('Andante');
  expect(tempoName(132)).toBe('Allegro');
  expect(tempoName(208)).toBe('Prestissimo');
});
