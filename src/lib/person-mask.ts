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
import { isModelError, loadModelBytes } from './model-fetch';
import { modelEntry } from './model-manifest';
import { StageError, NamedError } from './input-error';
import { isReclaim, tagCodec } from './codec-guard';
import { context2d, releaseCanvas } from './canvas-memory';

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
/** Longest side of the picture the segmenter is given, and the smaller one a device too slow even for Fast falls back to. */
const WORK = 512;
const WORK_SMALL = 256;
/** Frames in a row whose mask came back empty that reuse the last good one before the run is stopped. */
const MAX_EMPTY = 3;
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
/**
 * The chip is re-checked during the run, every this many chip frames, on the median of those frames. The bar is
 * well over the CPU path's ~130 ms a frame (about twice it): a chip over it has throttled or is a slow phone
 * chip, and the processor will do better. Under it the chip stays, even if slower than at the start.
 */
const GPU_RECHECK_FRAMES = 60;
const GPU_SUSTAINED_SLOW_MS = 250;
/** One frame taking longer than this, measured when it returns, is a failure of the path it ran on. */
const FRAME_STALL_MS = 5_000;
/**
 * A frame that crosses a hidden page proves nothing: the browser slows a background tab, and a phone stops it. Every time
 * the page is hidden this goes up, so a frame can tell whether it was interrupted.
 */
let hiddenCount = 0;
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => document.hidden && hiddenCount++);
/** Slow frames in a row, on the processor, before the run is given up: one slow frame is a hiccup, not a verdict. */
const STALL_FRAMES = 3;
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

/**
 * Test-only: makes the person finder fail on purpose, so a spec can drive the recovery. `at` is the frame (counting every
 * call to the finder, retries included) to start at, `times` how many calls fail, `empty` returns no mask instead of throwing.
 */
type Fault = { at: number; times: number; empty?: boolean; message?: string; onFire?: () => void; before?: () => void };
let calls = 0;
let faulted = 0;
function fault(): 'throw' | 'empty' | undefined {
  const f = (globalThis as { __stayputSegFault?: Fault }).__stayputSegFault;
  calls++;
  if (f && calls === f.at) f.before?.();
  if (!f || calls < f.at || faulted >= f.times) return undefined;
  faulted++;
  f.onFire?.();
  return f.empty ? 'empty' : 'throw';
}
const FAULT_MESSAGE = 'x';

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
    // Offline, no room, a download that failed or a file that failed its check keep their own names and messages.
    if (isModelError(e)) throw e;
    // Whatever stopped the person finder from starting is one kind, and the message stays as it was.
    const failed = new NamedError('PersonMaskFailed', e instanceof Error && e.message ? e.message : 'The person finder could not be started in this browser.');
    failed.name = 'ModelLoadError';
    throw failed;
  });
}

function build(model: string, holder: { gpu: boolean; sentinel?: WebGL2RenderingContext | null; frameMs?: number[] }): Promise<ImageSegmenter> {
  return (async () => {
    // The model first, whole and checked, outside the chip attempt (a failed download says nothing about the chip); offline or
    // no room ends here, before any script is loaded.
    const bytes = await loadModelBytes(model, { label: { model: 'person finder', size: model === MODELS.edges ? 'about 28 MB' : 'about 12 MB', failName: 'ModelDownloadFailed' }, entry: modelEntry(model), onKeepFailed: (err) => console.warn('The person finder could not be kept for next time', err) });
    const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision');
    // Each attempt loads its own fileset, so a failed chip attempt cannot leave the CPU one with a broken module.
    const webgl = probeWebGL();
    if (!webgl.any) throw new NamedError('PersonMaskFailed', 'The person finder needs WebGL, which this browser does not provide. Turn on hardware acceleration in the browser settings, or use an up-to-date Chrome, Edge, Firefox or Safari.');
    const make = async (delegate: 'CPU' | 'GPU') => {
      const fileset = await FilesetResolver.forVisionTasks(vendorDir('mediapipe').replace(/\/$/, ''));
      return ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetBuffer: bytes, delegate },
        runningMode: 'VIDEO',
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      });
    };
    if (GPU_FOR_EDGES && model === MODELS.edges && !gpuFailed && webgl.chip) {
      try {
        // A chip whose graphics cannot be set up may never answer, rather than fail: give it a while, then move on.
        let timer: ReturnType<typeof setTimeout> | undefined;
        const late = new Promise<never>((_, no) => (timer = setTimeout(() => no(new NamedError('PersonMaskFailed', 'The graphics chip did not start the person finder in time')), GPU_START_MS)));
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
    const seg = await make('CPU');
    // The CPU path needs a WebGL context too (see probeWebGL), and loses it the same way: a context held here goes with it.
    holder.sentinel = makeGL();
    return seg;
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
  /** Longest side of the picture the finder is given: smaller once a device proved too slow even for Fast. */
  private work = WORK;
  /** The finder was rebuilt once after a failure this run; a second failure ends the run. */
  private rebuilt = false;
  /** Frames in a row that used the last mask because the finder returned none. */
  private empties = 0;
  /** Set when a slow device moved the run off Better edges, or onto a smaller picture; said in the result line. */
  private fellBack: string[] = [];
  /** Frames in which some of the picture was a person. */
  framesWithPerson = 0;
  frames = 0;
  /** Milliseconds the finder took for each frame, on the graphics chip and on the CPU. Page-local, never sent. */
  private chipMs: number[] = [];
  private cpuFrames = 0;
  /** The chip stopped or was dropped for slowness part way, so the rest ran on the processor. */
  private switched = false;
  private sinceCheck = 0;
  /** Frames in a row on the processor that took over FRAME_STALL_MS. */
  private slowStreak = 0;

  /** Give the frame-size canvases back at the end of a video: Safari frees them late, and each is 33 MB at 4K. */
  dispose() {
    releaseCanvas(this.small);
    releaseCanvas(this.mask);
    releaseCanvas(this.person);
    this.prev = undefined;
  }

  /** A plain sentence on which path found the people in this video, for the result line. */
  pathNote(): string {
    const fell = this.fellBack.length ? ` ${this.fellBack.join(' ')}` : '';
    return this.pathLine() + fell;
  }

  private pathLine(): string {
    if (this.finder === 'fast') return 'Found the person with the processor (Fast always uses it).';
    if (this.chipMs.length === 0) return 'Found the person with the processor (the graphics chip was slow or unavailable).';
    const sorted = [...this.chipMs].sort((a, b) => a - b);
    const ms = Math.max(1, Math.round(sorted[sorted.length >> 1]!));
    const chip = `the graphics chip (about ${ms} ms a frame)`;
    if (!this.switched && this.cpuFrames === 0) return `Found the person with ${chip}.`;
    return `Found the person with ${chip}, then switched to the processor part way, after the chip stopped or was slow.`;
  }

  /**
   * `background` paints the new background over `ctx`. It gets the full-size copy of the frame and `seen`, the
   * small copy the finder looked at: a blur made from `seen` does not have to read the whole frame back first.
   */
  async apply(ctx: CanvasRenderingContext2D, background: (ctx: CanvasRenderingContext2D, frame: HTMLCanvasElement, seen: HTMLCanvasElement) => void) {
    const { width, height } = ctx.canvas;
    const model = modelFor(this.finder, ctx.canvas);
    let seg = await load(model);
    const k = Math.min(1, this.work / Math.max(width, height));
    const sw = Math.max(16, Math.round(width * k));
    const sh = Math.max(16, Math.round(height * k));
    if (this.small.width !== sw || this.small.height !== sh) {
      this.small.width = this.mask.width = sw;
      this.small.height = this.mask.height = sh;
      this.prev = undefined;
    }
    context2d(this.small).drawImage(ctx.canvas, 0, 0, sw, sh);
    // Timestamps must only grow, across videos too; the frame's own time can repeat after a seek, so count instead.
    clock += 33;
    let result: ReturnType<ImageSegmenter['segmentForVideo']> | undefined;
    let began = performance.now();
    const hiddenBefore = hiddenCount;
    const run = (engine: ImageSegmenter) => {
      const planned = fault();
      if (planned === 'throw') throw new NamedError('SegmentFaultInjected', (globalThis as { __stayputSegFault?: Fault }).__stayputSegFault?.message ?? FAULT_MESSAGE);
      const out = engine.segmentForVideo(this.small, clock);
      if (planned === 'empty') {
        out.close();
        return undefined;
      }
      return out;
    };
    try {
      result = run(seg);
      // A lost context does not make the engine throw: it returns masks that are wrong. Rerun the frame on a fresh engine (the CPU, from a chip).
      if (result && segmenter?.sentinel?.isContextLost()) {
        result.close();
        throw new GpuLost();
      }
    } catch (e) {
      if (isAbort(e)) {
        drop();
        throw new MemoryError();
      }
      // An engine the browser invalidated under us (InvalidStateError: a closed or reclaimed object) cannot be used again, on the CPU either: a fresh one gets this frame.
      const invalidated = e instanceof Error && e.name === 'InvalidStateError';
      const onChip = !!segmenter?.gpu;
      if (!onChip && !invalidated) {
        // On the CPU path: once per run the engine is rebuilt and the frame redone (the WebGL context under it may have been lost);
        // a second failure, or no WebGL left at all, ends the run with a name that says which.
        if (!probeWebGL().any) {
          drop();
          throw new NamedError('WebGLLost', 'The graphics context was lost. Close other tabs and try again.');
        }
        if (this.rebuilt) throw new StageError('PersonFinderFailed', e);
        this.rebuilt = true;
        console.warn('The person finder failed, starting a new one', e instanceof GpuLost ? 'context lost' : e);
      } else if (onChip) {
        // The graphics chip failed part way (a lost context, say): rebuild on the CPU and finish from this frame.
        console.warn('The graphics chip stopped the person finder, using the CPU', e instanceof GpuLost ? 'context lost' : e);
        gpuFailed = true;
        this.switched = true;
      } else {
        console.warn('The person finder was invalidated, starting a new one', e);
      }
      drop();
      seg = await load(model);
      clock += 33;
      began = performance.now();
      try {
        result = run(seg);
      } catch (again) {
        // Failed a second time, on a fresh engine: the run records the person finder as the source.
        if (isAbort(again)) {
          drop();
          throw new MemoryError();
        }
        if (isReclaim(again)) throw tagCodec(again, 'segmenter', 'segment');
        throw new StageError('PersonFinderFailed', again);
      }
    }
    const found = result?.confidenceMasks?.[0];
    if (!found && !(this.prev && this.empties < MAX_EMPTY)) {
      result?.close();
      throw new NamedError('PersonMaskEmpty', 'The person finder returned no mask.');
    }
    const conf = found?.getAsFloat32Array();
    const frameMs = performance.now() - began;
    const onChip = !!segmenter?.gpu;
    if (onChip) this.chipMs.push(frameMs);
    else this.cpuFrames++;
    // No mask this frame (checked above): the last one stands in, for a few frames in a row.
    const mw = found?.width ?? this.mask.width;
    const mh = found?.height ?? this.mask.height;
    const cur = new Float32Array(mw * mh);
    if (conf) {
      this.empties = 0;
      // The multiclass model's mask 0 is the background; the binary selfie model's mask 0 is the person.
      if (this.finder === 'edges') for (let i = 0; i < cur.length; i++) cur[i] = 1 - conf[i]!;
      else cur.set(conf);
    } else {
      this.empties++;
      console.warn('The person finder returned no mask, using the last one');
      cur.set(this.prev!);
    }
    result?.close();
    const timing = segmenter?.gpu ? segmenter.frameMs : undefined;
    if (timing && timing.length < GPU_TIMED_FRAMES && timing.push(frameMs) === GPU_TIMED_FRAMES) {
      const sorted = timing.slice(1).sort((a, b) => a - b);
      if (sorted[sorted.length >> 1]! > GPU_TOO_SLOW_MS) {
        // Slower than the CPU would be: use the CPU from the next frame on.
        console.warn('The graphics chip is slower than the CPU here, using the CPU');
        gpuFailed = true;
        this.switched = true;
        drop();
      }
    }
    const interrupted = document.hidden || hiddenCount !== hiddenBefore;
    if (frameMs <= FRAME_STALL_MS || interrupted) this.slowStreak = 0;
    if (frameMs > FRAME_STALL_MS && !interrupted) {
      // The frame came back, so it is used; but this path is no good for the rest of the run.
      if (!onChip && ++this.slowStreak >= STALL_FRAMES) {
        this.slowStreak = 0;
        // A slow processor gets an easier job before the run is given up: Fast instead of Better edges, then a smaller picture.
        if (this.finder === 'edges') {
          console.warn('The person finder is too slow here, switching to Fast');
          this.finder = 'fast';
          this.fellBack.push('Switched to Fast part way, because this device was too slow for Better edges.');
          drop();
        } else if (this.work > WORK_SMALL) {
          console.warn('The person finder is too slow here, using a smaller picture');
          this.work = WORK_SMALL;
          this.fellBack.push('Looked at a smaller picture part way, because this device was too slow for the full one.');
        } else throw new StageError('PersonFinderStalled', new NamedError('PersonMaskFailed', 'Finding the person took more than 5 seconds a frame on this device, so the run was stopped. Try a shorter or smaller video, or choose Fast.'));
      }
      if (onChip) {
        console.warn('One frame took over 5 seconds on the graphics chip, using the CPU');
        gpuFailed = true;
        this.switched = true;
        drop();
      }
    } else if (onChip && segmenter?.gpu && ++this.sinceCheck >= GPU_RECHECK_FRAMES) {
      this.sinceCheck = 0;
      const recent = this.chipMs.slice(-GPU_RECHECK_FRAMES).sort((a, b) => a - b);
      if (recent[recent.length >> 1]! > GPU_SUSTAINED_SLOW_MS) {
        console.warn('The graphics chip has slowed down, using the CPU for the rest');
        gpuFailed = true;
        this.switched = true;
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
    context2d(this.mask).putImageData(img, 0, 0);
    this.frames++;
    if (on / cur.length > 0.01) this.framesWithPerson++;

    if (this.person.width !== width || this.person.height !== height) {
      this.person.width = width;
      this.person.height = height;
    }
    const p = context2d(this.person);
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
