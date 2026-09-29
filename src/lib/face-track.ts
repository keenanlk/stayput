/**
 * Keep faces covered between detections in a video. The detector runs a few
 * times a second, not on every frame, and now and then misses a face that is
 * turning or blurred by motion. Each face found becomes a track that stays
 * covered for a short while after it was last seen, and the cover is grown a
 * little so a face moving between detections stays inside it.
 */
import type { Rect } from './blur';

export interface Track {
  rect: Rect;
  /** Seconds into the video when the face was last found. */
  seen: number;
}

function overlap(a: Rect, b: Rect): number {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const small = Math.min(a.w * a.h, b.w * b.h);
  return small ? (x * y) / small : 0;
}

/**
 * Fold one detection pass into the tracks: a face overlapping a track moves
 * it, a new face starts one, and a track not seen for `hold` seconds ends.
 */
export function updateTracks(tracks: Track[], found: Rect[], t: number, hold: number): Track[] {
  const next: Track[] = [];
  const used = new Set<Track>();
  for (const rect of found) {
    const match = tracks.find((tr) => !used.has(tr) && overlap(tr.rect, rect) > 0.2);
    if (match) used.add(match);
    next.push({ rect, seen: t });
  }
  for (const tr of tracks) if (!used.has(tr) && t - tr.seen <= hold) next.push(tr);
  return next;
}

/** A rectangle grown by `margin` of its size on every side, clipped to the frame. */
export function grow(r: Rect, margin: number, width: number, height: number): Rect {
  const x0 = Math.max(0, r.x - r.w * margin);
  const y0 = Math.max(0, r.y - r.h * margin);
  const x1 = Math.min(width, r.x + r.w * (1 + margin));
  const y1 = Math.min(height, r.y + r.h * (1 + margin));
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}
