import { test, expect } from '@playwright/test';
import { grow, updateTracks } from '../src/lib/face-track';

const r = (x: number, y: number, w = 50, h = 60) => ({ x, y, w, h });

test('updateTracks moves a face that is found again and starts a track for a new one', () => {
  let tracks = updateTracks([], [r(100, 100)], 0, 0.5);
  tracks = updateTracks(tracks, [r(110, 102), r(400, 50)], 0.1, 0.5);
  expect(tracks).toHaveLength(2);
  expect(tracks.map((t) => t.rect.x).sort((a, b) => a - b)).toEqual([110, 400]);
  expect(tracks.every((t) => t.seen === 0.1)).toBe(true);
});

test('updateTracks keeps a missed face covered for the hold time, then lets it go', () => {
  let tracks = updateTracks([], [r(100, 100)], 1, 0.5);
  // The detector blinks: the face is not found for two passes.
  tracks = updateTracks(tracks, [], 1.1, 0.5);
  tracks = updateTracks(tracks, [], 1.4, 0.5);
  expect(tracks).toHaveLength(1);
  expect(tracks[0]!.rect.x).toBe(100);
  tracks = updateTracks(tracks, [], 1.6, 0.5);
  expect(tracks).toHaveLength(0);
});

test('grow widens a cover on every side and keeps it inside the frame', () => {
  expect(grow(r(100, 100, 50, 100), 0.1, 640, 360)).toEqual({ x: 95, y: 90, w: 60, h: 120 });
  expect(grow(r(0, 0, 50, 50), 0.2, 55, 55)).toEqual({ x: 0, y: 0, w: 55, h: 55 });
});
