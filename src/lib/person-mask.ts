/**
 * Where the people are in a video frame, for Video background remover. Uses
 * Google's MediaPipe selfie segmenters (Apache-2.0) through the MediaPipe
 * runtime already served from /vendor/ for the face tools: the small binary
 * selfie segmenter (0.25 MB, square for portrait and square video and a
 * landscape variant for wide video) or, for better edges, the 16 MB selfie
 * multiclass segmenter. The model comes from /models/ on first use. Frames
 * are scaled down before segmenting, and the mask is smoothed over time so
 * its edge does not flicker. Nothing leaves the tab.
 *
 * The better-edges model runs on the graphics chip (MediaPipe's GPU delegate,
 * which is WebGL) where the browser has a real one: several times quicker
 * than the CPU, with the same people found. The small model gains nothing on
 * the chip, and a software renderer is slower than the CPU, so both stay on
 * the CPU. A chip that cannot start the model, or fails part way, drops back
 * to the CPU and the run carries on.
 */
import type { ImageSegmenter } from '@mediapipe/tasks-vision';
import { vendorDir } from './vendor';

/** Roll-back switch: false puts every finder back on the CPU delegate. */
const GPU_FOR_EDGES = true;

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
let segmenter: { model: string; ready: Promise<ImageSegmenter>; gpu: boolean; sentinel?: WebGL2RenderingContext | null; frameMs?: number[] } | undefined;
/** How long the graphics chip has to start the model (well under a second on a Mac). */
const GPU_START_MS = 20_000;
/**
 * A chip that is really emulation (some Linux and virtual-machine setups name it like hardware) runs the model slower
 * than the CPU does: the median of the first few frames on the chip, in ms, above which the CPU takes over. A real
 * chip takes about 15 ms a frame on a Mac and the CPU path about 130, so this only catches the very slow.
 */
const GPU_TOO_SLOW_MS = 150;
/** Frames timed before judging: the first is left out, it compiles the shaders. */
const GPU_TIMED_FRAMES = 6;
/** Set once the graphics chip could not run the model; the CPU is used from then on. */
let gpuFailed = false;

/** Software renderers (SwiftShader, llvmpipe, Windows' basic adapter) are slower than the CPU delegate. */
const isSoftwareRenderer = (renderer: string) => /swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer);

/**
 * What WebGL the browser gives, asked the way the engine asks (an offscreen canvas). The engine's CPU path needs a
 * WebGL context too, and a context it cannot get leaves its module unusable (a retry on the same module fails as
 * well), so this is checked, and the probe context released, before the model is created.
 */
function probeWebGL(): { any: boolean; chip: boolean } {
  try {
    const gl = makeGL();
    if (!gl || gl.isContextLost()) return { any: false, chip: false };
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    // A browser that hides the chip's name is treated as having none.
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { any: true, chip: renderer !== '' && !isSoftwareRenderer(renderer) };
  } catch {
    return { any: false, chip: false };
  }
}

const makeGL = () => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas')).getContext('webgl2') as WebGL2RenderingContext | null;

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

/** The graphics context was lost under the engine. */
class GpuLost extends Error {}

/** Throw away the shared segmenter, so the next run builds a fresh one. */
function drop() {
  const old = segmenter;
  segmenter = undefined;
  old?.sentinel?.getExtension('WEBGL_lose_context')?.loseContext();
  old?.ready.then((s) => s.close()).catch(() => {});
}

/** An emscripten abort ("Aborted()", "Aborted(OOM)") or a plain out-of-memory failure. */
const isAbort = (e: unknown) => /^Aborted\(|out of memory|Cannot enlarge memory|memory access out of bounds/i.test(e instanceof Error ? e.message : String(e));

function load(model: string): Promise<ImageSegmenter> {
  if (segmenter && segmenter.model !== model) drop();
  if (!segmenter) {
    const holder = { model, gpu: false, ready: undefined as unknown as Promise<ImageSegmenter> };
    holder.ready = build(model, holder);
    segmenter = holder;
  }
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

function build(model: string, holder: { gpu: boolean; sentinel?: WebGL2RenderingContext | null; frameMs?: number[] }): Promise<ImageSegmenter> {
  return (async () => {
    const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision');
    // Each attempt loads its own fileset, so a failed chip attempt cannot leave the CPU one with a broken module.
    const webgl = probeWebGL();
    if (!webgl.any) throw new Error('The person finder needs WebGL, which this browser does not provide. Turn on hardware acceleration in the browser settings, or use an up-to-date Chrome, Edge, Firefox or Safari.');
    const make = async (delegate: 'CPU' | 'GPU') => {
      const fileset = await FilesetResolver.forVisionTasks(vendorDir('mediapipe').replace(/\/$/, ''));
      return ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: model, delegate },
        runningMode: 'VIDEO',
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      });
    };
    if (GPU_FOR_EDGES && model === MODELS.edges && !gpuFailed && webgl.chip) {
      try {
        // A chip whose graphics cannot be set up may never answer, rather than fail: give it a while, then move on.
        let timer: ReturnType<typeof setTimeout> | undefined;
        const late = new Promise<never>((_, no) => (timer = setTimeout(() => no(new Error('The graphics chip did not start the person finder in time')), GPU_START_MS)));
        const seg = await Promise.race([make('GPU'), late]).finally(() => clearTimeout(timer));
        holder.gpu = true;
        holder.frameMs = [];
        // The engine's own context is out of reach; one held here is lost together with it when the graphics driver resets.
        holder.sentinel = makeGL();
        return seg;
      } catch (e) {
        gpuFailed = true;
        console.warn('The graphics chip could not start the person finder, using the CPU', e);
      }
    }
    return make('CPU');
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
  /** Milliseconds the finder took for each frame, on the graphics chip and on the CPU. Page-local, never sent. */
  private chipMs: number[] = [];
  private cpuFrames = 0;

  /** A plain sentence on which path found the people in this video, for the result line. */
  pathNote(): string {
    if (this.finder === 'fast') return 'Found the person with the processor (Fast always uses it).';
    if (this.chipMs.length === 0) return 'Found the person with the processor (the graphics chip was slow or unavailable).';
    const sorted = [...this.chipMs].sort((a, b) => a - b);
    const ms = Math.max(1, Math.round(sorted[sorted.length >> 1]!));
    const chip = `the graphics chip (about ${ms} ms a frame)`;
    return this.cpuFrames === 0 ? `Found the person with ${chip}.` : `Found the person with ${chip}, then with the processor after the chip stopped or was slow.`;
  }

  /**
   * `background` paints the new background over `ctx`. It gets the full-size copy of the frame and `seen`, the
   * small copy the finder looked at: a blur made from `seen` does not have to read the whole frame back first.
   */
  async apply(ctx: CanvasRenderingContext2D, background: (ctx: CanvasRenderingContext2D, frame: HTMLCanvasElement, seen: HTMLCanvasElement) => void) {
    const { width, height } = ctx.canvas;
    const model = modelFor(this.finder, ctx.canvas);
    let seg = await load(model);
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
    const began = performance.now();
    try {
      result = seg.segmentForVideo(this.small, clock);
      // A lost context does not make the engine throw: it returns masks that are wrong. Rerun the frame on the CPU.
      if (segmenter?.gpu && segmenter.sentinel?.isContextLost()) {
        result.close();
        throw new GpuLost();
      }
    } catch (e) {
      if (isAbort(e)) {
        drop();
        throw new MemoryError();
      }
      if (!segmenter?.gpu) throw e;
      // The graphics chip failed part way (a lost context, say): rebuild on the CPU and finish from this frame.
      console.warn('The graphics chip stopped the person finder, using the CPU', e instanceof GpuLost ? 'context lost' : e);
      gpuFailed = true;
      drop();
      seg = await load(model);
      clock += 33;
      result = seg.segmentForVideo(this.small, clock);
    }
    const found = result.confidenceMasks?.[0];
    if (!found) throw new Error('The person finder returned no mask.');
    const conf = found.getAsFloat32Array();
    const frameMs = performance.now() - began;
    if (segmenter?.gpu) this.chipMs.push(frameMs);
    else this.cpuFrames++;
    const mw = found.width;
    const mh = found.height;
    const cur = new Float32Array(mw * mh);
    // The multiclass model's mask 0 is the background; the binary selfie model's mask 0 is the person.
    if (this.finder === 'edges') for (let i = 0; i < cur.length; i++) cur[i] = 1 - conf[i]!;
    else cur.set(conf);
    result.close();
    const timing = segmenter?.gpu ? segmenter.frameMs : undefined;
    if (timing && timing.length < GPU_TIMED_FRAMES && timing.push(frameMs) === GPU_TIMED_FRAMES) {
      const sorted = timing.slice(1).sort((a, b) => a - b);
      if (sorted[sorted.length >> 1]! > GPU_TOO_SLOW_MS) {
        // Slower than the CPU would be: use the CPU from the next frame on.
        console.warn('The graphics chip is slower than the CPU here, using the CPU');
        gpuFailed = true;
        drop();
      }
    }
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
    background(ctx, this.person, this.small);
    p.globalCompositeOperation = 'destination-in';
    p.imageSmoothingQuality = 'high';
    p.drawImage(this.mask, 0, 0, width, height);
    p.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.person, 0, 0);
  }
}
