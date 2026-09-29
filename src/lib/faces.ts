/**
 * Find faces in an image, entirely in the browser. Uses Google's MediaPipe
 * Face Detector (BlazeFace short-range, Apache-2.0): the WebAssembly runtime
 * is served from /vendor/ (see src/data/vendor.json) and the 230 KB model from
 * /models/. Nothing is fetched until the first call, and nothing leaves the tab.
 *
 * BlazeFace is tuned for faces that fill a good part of the frame, so small
 * faces in a group photo are found by also scanning overlapping tiles and
 * merging the results.
 */
import type { FaceDetector } from '@mediapipe/tasks-vision';
import type { Rect } from './blur';
import { vendorDir } from './vendor';

const MODEL = '/models/blaze_face_short_range.tflite';
/** Tiles are scaled to at most this size before detection; the model looks at 128 px anyway. */
const TILE_MAX = 512;
/**
 * Minimum score for a face found in a tile. Real faces scored 0.83 to 0.92 in
 * testing, hands and fabric 0.61 to 0.64, so tiles are held to a higher bar
 * than the whole-image pass (0.6).
 */
const TILE_MIN_SCORE = 0.72;

let detector: Promise<FaceDetector> | undefined;

function load(): Promise<FaceDetector> {
  detector ??= (async () => {
    const { FilesetResolver, FaceDetector } = await import('@mediapipe/tasks-vision');
    const fileset = await FilesetResolver.forVisionTasks(vendorDir('mediapipe').replace(/\/$/, ''));
    return FaceDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL, delegate: 'CPU' },
      runningMode: 'IMAGE',
      minDetectionConfidence: 0.6,
    });
  })();
  // A failed load (offline on first use, say) may be retried by the next call.
  detector.catch(() => (detector = undefined));
  return detector;
}

interface Scored extends Rect {
  score: number;
}

function iou(a: Rect, b: Rect): number {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = x * y;
  const small = Math.min(a.w * a.h, b.w * b.h);
  // Overlap as a share of the smaller box, so a face found whole and again
  // cut in half at a tile edge counts as one.
  return small ? inter / small : 0;
}

/** Keep the strongest box of every overlapping group. */
export function mergeBoxes(boxes: Scored[], overlap = 0.4): Scored[] {
  const kept: Scored[] = [];
  for (const b of [...boxes].sort((p, q) => q.score - p.score)) {
    if (kept.every((k) => iou(k, b) < overlap)) kept.push(b);
  }
  return kept;
}

/** Grow a tight face box to cover hair, ears and chin, clipped to the image. */
export function padFace(r: Rect, width: number, height: number): Rect {
  const x0 = Math.max(0, r.x - r.w * 0.15);
  const y0 = Math.max(0, r.y - r.h * 0.35);
  const x1 = Math.min(width, r.x + r.w * 1.15);
  const y1 = Math.min(height, r.y + r.h * 1.12);
  return { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
}

/** Square-ish tiles of side `size`, overlapping by half, covering the image. */
function tiles(width: number, height: number, size: number): Rect[] {
  const out: Rect[] = [];
  const step = size / 2;
  const xs = Math.max(1, Math.ceil((width - size) / step) + 1);
  const ys = Math.max(1, Math.ceil((height - size) / step) + 1);
  for (let j = 0; j < ys; j++) {
    for (let i = 0; i < xs; i++) {
      const x = Math.min(i * step, Math.max(0, width - size));
      const y = Math.min(j * step, Math.max(0, height - size));
      out.push({ x, y, w: Math.min(size, width), h: Math.min(size, height) });
    }
  }
  return out;
}

/**
 * Faces in the bitmap, in its pixels, padded to cover the whole head. The
 * first call downloads the detector (about 4 MB compressed); `onProgress`
 * hears when that is done and scanning starts.
 */
export async function findFaces(bitmap: ImageBitmap, onProgress?: (stage: 'loading' | 'scanning') => void): Promise<Rect[]> {
  onProgress?.('loading');
  const fd = await load();
  onProgress?.('scanning');
  const W = bitmap.width;
  const H = bitmap.height;
  const short = Math.min(W, H);
  const regions: Rect[] = [{ x: 0, y: 0, w: W, h: H }];
  // Halves and quarters of the shorter side catch faces down to about 1/20 of it.
  for (const f of [0.5, 0.25]) if (short * f >= 96) regions.push(...tiles(W, H, Math.round(short * f)));
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const found: Scored[] = [];
  for (const r of regions) {
    const s = Math.min(1, TILE_MAX / Math.max(r.w, r.h));
    canvas.width = Math.max(1, Math.round(r.w * s));
    canvas.height = Math.max(1, Math.round(r.h * s));
    ctx.drawImage(bitmap, r.x, r.y, r.w, r.h, 0, 0, canvas.width, canvas.height);
    for (const d of fd.detect(canvas).detections) {
      const b = d.boundingBox;
      if (!b) continue;
      const score = d.categories[0]?.score ?? 0;
      // Tiles see hands, ears and patterned fabric up close; they need a surer match.
      if (r !== regions[0] && score < TILE_MIN_SCORE) continue;
      found.push({ x: r.x + b.originX / s, y: r.y + b.originY / s, w: b.width / s, h: b.height / s, score });
    }
  }
  return mergeBoxes(found).map((b) => padFace(b, W, H));
}
