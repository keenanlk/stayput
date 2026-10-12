/**
 * Where the people are in a video frame, for Video background remover. Uses
 * Google's MediaPipe selfie segmenters (Apache-2.0) through the MediaPipe
 * runtime already served from /vendor/ for the face tools: the small binary
 * selfie segmenter (0.25 MB, square for portrait and square video and a
 * landscape variant for wide video) or, for better edges, the 16 MB selfie
 * multiclass segmenter. The model comes from /models/ on first use. Frames
 * are scaled down before segmenting, and the mask is smoothed over time so
 * its edge does not flicker. Nothing leaves the tab.
 */
import type { ImageSegmenter } from '@mediapipe/tasks-vision';
import { vendorDir } from './vendor';

/** "fast" is the small binary segmenter; "edges" the 16 MB multiclass one, about 28 times slower per frame. */
export type PersonFinder = 'fast' | 'edges';
/** The picture's shape picks the fast model's variant: 16:9 and wider uses the landscape one. */
export type Shape = { width: number; height: number };

const MODELS = {
  square: '/models/selfie_segmenter.tflite',
  landscape: '/models/selfie_segmenter_landscape.tflite',
  edges: '/models/selfie_multiclass_256x256.tflite',
};
/** Wider than this (4:3 is 1.33, 16:9 is 1.78) and the landscape model, trained on 16:9 frames, is the better fit. */
const LANDSCAPE_FROM = 1.5;

export function modelFor(finder: PersonFinder, shape?: Shape): string {
  if (finder === 'edges') return MODELS.edges;
  return shape && shape.width / shape.height >= LANDSCAPE_FROM ? MODELS.landscape : MODELS.square;
}
/** Longest side of the picture the segmenter is given. */
const WORK = 512;
/** Share of the previous mask kept in each new one: steadier edges, slight lag on fast moves. */
const KEEP = 0.45;

/** One loaded model at a time: a second engine would hold its own copy of the WebAssembly memory. */
let segmenter: { model: string; ready: Promise<ImageSegmenter> } | undefined;
/**
 * The segmenter is shared by every video and requires timestamps that keep
 * growing across calls, so the clock lives here and is never reset.
 */
let clock = 0;

/** The engine ran out of memory: its WebAssembly module aborted and cannot be used again. */
export class MemoryError extends Error {
  constructor() {
    super("This video is too large for this device's memory. Try a shorter or smaller video.");
    this.name = 'OutOfMemoryError';
  }
}

/** Throw away the shared segmenter, so the next run builds a fresh one. */
function drop() {
  const old = segmenter;
  segmenter = undefined;
  old?.ready.then((s) => s.close()).catch(() => {});
}

/** An emscripten abort ("Aborted()", "Aborted(OOM)") or a plain out-of-memory failure. */
const isAbort = (e: unknown) => /^Aborted\(|out of memory|Cannot enlarge memory|memory access out of bounds/i.test(e instanceof Error ? e.message : String(e));

function load(model: string): Promise<ImageSegmenter> {
  if (segmenter && segmenter.model !== model) drop();
  segmenter ??= { model, ready: build(model) };
  const mine = segmenter;
  mine.ready.catch((e) => {
    if (segmenter === mine) segmenter = undefined;
    return e;
  });
  return mine.ready.catch((e) => {
    if (isAbort(e)) throw new MemoryError();
    // Whatever stopped the person finder from starting is one kind, and the message stays as it was.
    const failed = new Error(e instanceof Error && e.message ? e.message : 'The person finder could not be started in this browser.');
    failed.name = 'ModelLoadError';
    throw failed;
  });
}

function build(model: string): Promise<ImageSegmenter> {
  return (async () => {
    const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision');
    const fileset = await FilesetResolver.forVisionTasks(vendorDir('mediapipe').replace(/\/$/, ''));
    return ImageSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: model, delegate: 'CPU' },
      runningMode: 'VIDEO',
      outputConfidenceMasks: true,
      outputCategoryMask: false,
    });
  })();
}

/** Load the model ahead of the first frame, so its download shows as its own step. */
export const loadPersonMask = (finder: PersonFinder, shape?: Shape) => load(modelFor(finder, shape)).then(() => undefined);

/**
 * Keeps the people in each frame and replaces everything else. One instance
 * per video: it remembers the last mask to smooth the next.
 */
export class Matte {
  private small = document.createElement('canvas');
  private mask = document.createElement('canvas');
  private person = document.createElement('canvas');
  private prev: Float32Array | undefined;
  constructor(private finder: PersonFinder = 'edges') {}
  /** Frames in which some of the picture was a person. */
  framesWithPerson = 0;
  frames = 0;

  async apply(ctx: CanvasRenderingContext2D, background: (ctx: CanvasRenderingContext2D, frame: HTMLCanvasElement) => void) {
    const { width, height } = ctx.canvas;
    const seg = await load(modelFor(this.finder, ctx.canvas));
    const k = Math.min(1, WORK / Math.max(width, height));
    const sw = Math.max(16, Math.round(width * k));
    const sh = Math.max(16, Math.round(height * k));
    if (this.small.width !== sw || this.small.height !== sh) {
      this.small.width = this.mask.width = sw;
      this.small.height = this.mask.height = sh;
      this.prev = undefined;
    }
    this.small.getContext('2d')!.drawImage(ctx.canvas, 0, 0, sw, sh);
    // Timestamps must only grow, across videos too; the frame's own time can repeat after a seek, so count instead.
    clock += 33;
    let result;
    try {
      result = seg.segmentForVideo(this.small, clock);
    } catch (e) {
      if (!isAbort(e)) throw e;
      drop();
      throw new MemoryError();
    }
    const found = result.confidenceMasks?.[0];
    if (!found) throw new Error('The person finder returned no mask.');
    const conf = found.getAsFloat32Array();
    const mw = found.width;
    const mh = found.height;
    const cur = new Float32Array(mw * mh);
    // The multiclass model's mask 0 is the background; the binary selfie model's mask 0 is the person.
    if (this.finder === 'edges') for (let i = 0; i < cur.length; i++) cur[i] = 1 - conf[i]!;
    else cur.set(conf);
    result.close();
    if (this.mask.width !== mw || this.mask.height !== mh) {
      this.mask.width = mw;
      this.mask.height = mh;
    }
    if (this.prev && this.prev.length === cur.length) for (let i = 0; i < cur.length; i++) cur[i] = KEEP * this.prev[i]! + (1 - KEEP) * cur[i]!;
    this.prev = cur;
    const img = new ImageData(mw, mh);
    let on = 0;
    for (let i = 0; i < cur.length; i++) {
      // A soft step around one half: firm inside, a few pixels of feather at the edge.
      const t = Math.min(1, Math.max(0, (cur[i]! - 0.3) / 0.4));
      const a = t * t * (3 - 2 * t);
      img.data[i * 4 + 3] = Math.round(a * 255);
      if (a > 0.5) on++;
    }
    this.mask.getContext('2d')!.putImageData(img, 0, 0);
    this.frames++;
    if (on / cur.length > 0.01) this.framesWithPerson++;

    if (this.person.width !== width || this.person.height !== height) {
      this.person.width = width;
      this.person.height = height;
    }
    const p = this.person.getContext('2d')!;
    p.globalCompositeOperation = 'copy';
    p.drawImage(ctx.canvas, 0, 0);
    background(ctx, this.person);
    p.globalCompositeOperation = 'destination-in';
    p.imageSmoothingQuality = 'high';
    p.drawImage(this.mask, 0, 0, width, height);
    p.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.person, 0, 0);
  }
}
