/**
 * Keeps a re-encoding video job going when the browser takes one of its codecs back part-way, and says which one it was.
 *
 * Chromium closes a hardware codec that has sat idle for 90 seconds while its page is in the background and the device is
 * short of codecs (ReclaimableCodec). Its error callback gets a QuotaExceededError ("Codec reclaimed due to inactivity."),
 * and every later call on the closed codec throws InvalidStateError. Mediabunny, which owns the decoder and the encoder in
 * a Conversion, already swaps a reclaimed encoder that was idle, but ends the run on a decoder that was reclaimed, on any
 * InvalidStateError thrown by a call, and on frames that were still queued when an encoder closed.
 *
 * For the length of one job this swaps the global VideoDecoder and VideoEncoder for thin wrappers. Each wrapper:
 *  - on a closed or invalidated codec, opens a fresh one with the same configuration and carries on from the last good
 *    frame: the decoder re-feeds the packets from the last key frame and drops the frames it already delivered, the
 *    encoder re-encodes the frames that had not come out yet, starting with a key frame;
 *  - marks any error it lets through with the object it came from (`codecSource`), so the name a failed run records
 *    says which of them it was;
 *  - closes whatever is still open when the job ends, so a retry never starts with the failed run's codecs alive.
 * Each job gets a few rebuilds; after that the error goes on as it came, to the retry ladder in edit-recovery.ts.
 */
import { NamedError } from './input-error';

/** Roll-back switch: false leaves the browser's codecs, and Mediabunny, to behave as before. */
export const CODEC_GUARD = true;

/** Rebuilds of each kind of codec one job may spend before the error is let through. */
export const MAX_REBUILDS = 3;

export type CodecSource = 'decoder' | 'encoder' | 'segmenter' | 'canvas';

/** What a codec the browser took back looks like: its error callback gets a QuotaExceededError, later calls an InvalidStateError. */
export const isReclaim = (e: unknown): boolean => typeof e === 'object' && e !== null && ['InvalidStateError', 'QuotaExceededError'].includes((e as { name?: string }).name ?? '');

/** Marks `e` with the object it came from, unless something nearer already did, and returns it. */
export function tagCodec<T>(e: T, source: CodecSource, call?: string): T {
  if (typeof e === 'object' && e !== null && !('codecSource' in e)) {
    try {
      Object.assign(e, { codecSource: source, codecCall: call });
    } catch {
      // A frozen error keeps its plain name.
    }
  }
  return e;
}

const sourceOf = (e: unknown): CodecSource | undefined => (typeof e === 'object' && e !== null ? (e as { codecSource?: CodecSource }).codecSource : undefined);

const SAY: Record<CodecSource, [string, string]> = {
  decoder: ['DecoderReclaimedError', 'Your device took back the video decoder part-way through, and starting again did not help.'],
  encoder: ['EncoderReclaimedError', 'Your device took back the video encoder part-way through, and starting again did not help.'],
  segmenter: ['SegmenterInvalidError', 'The person finder stopped working part-way through, and starting it again did not help.'],
  canvas: ['CanvasInvalidError', 'The browser stopped the drawing surface part-way through, and starting again did not help.'],
};
const ADVICE = ' Keep this tab open with the screen on and try once more; a shorter or smaller video is less likely to hit it.';

/**
 * The error to show for an InvalidStateError that survived every retry: named for the object that threw it
 * (DecoderReclaimedError, EncoderReclaimedError, SegmenterInvalidError, CanvasInvalidError), or CodecReclaimedError when
 * nothing marked it. Anything else gives undefined. A QuotaExceededError ("Codec reclaimed…") that gets this far is left
 * as it came: the tools' screen-lock message (wake-lock.ts) is the better thing to say for it.
 */
export function codecFailure(e: unknown): NamedError | undefined {
  if (!(e instanceof Error) || e.name !== 'InvalidStateError') return undefined;
  const source = sourceOf(e);
  const [name, lead] = source ? SAY[source] : ['CodecReclaimedError', 'Your device took back a video codec part-way through, and starting again did not help.'];
  return new NamedError(name, lead + ADVICE, { cause: e });
}

interface Run {
  used: { decoder: number; encoder: number };
  open: Set<{ shut(): void }>;
}

type Listener = [string, EventListenerOrEventListenerObject, boolean | AddEventListenerOptions | undefined];

/** The calls Mediabunny makes that are not about the codec itself: events, forwarded to whichever codec is current. */
function listeners(host: { real: EventTarget | undefined }) {
  const all: Listener[] = [];
  return {
    add(type: string, fn: EventListenerOrEventListenerObject, opts?: boolean | AddEventListenerOptions) {
      all.push([type, fn, opts]);
      host.real?.addEventListener(type, fn, opts);
    },
    remove(type: string, fn: EventListenerOrEventListenerObject, opts?: boolean | EventListenerOptions) {
      const i = all.findIndex((l) => l[0] === type && l[1] === fn);
      if (i >= 0) all.splice(i, 1);
      host.real?.removeEventListener(type, fn, opts);
    },
    attach(real: EventTarget) {
      for (const [t, f, o] of all) real.addEventListener(t, f, o);
    },
  };
}

function guardedDecoder(Real: typeof VideoDecoder, run: Run) {
  return class GuardedVideoDecoder {
    static isConfigSupported = (config: VideoDecoderConfig) => Real.isConfigSupported(config);
    real: VideoDecoder | undefined;
    private config: VideoDecoderConfig | undefined;
    /** Packets fed since the key frame at or before the last frame delivered: what a fresh decoder is given again. */
    private chunks: EncodedVideoChunk[] = [];
    /** Timestamp of the last frame delivered; after a rebuild, frames up to it come out a second time and are dropped. */
    private delivered = -Infinity;
    private skipUntil: number | undefined;
    private closed = false;
    private events = listeners(this);
    constructor(private init: VideoDecoderInit) {
      run.open.add(this);
    }
    get state() {
      return this.closed ? 'closed' : (this.real?.state ?? 'unconfigured');
    }
    get decodeQueueSize() {
      return this.real?.decodeQueueSize ?? 0;
    }
    set ondequeue(fn: (() => void) | null) {
      if (this.real) this.real.ondequeue = fn;
    }
    addEventListener = this.events.add;
    removeEventListener = this.events.remove;
    shut() {
      this.closed = true;
      this.chunks = [];
      try {
        if (this.real && this.real.state !== 'closed') this.real.close();
      } catch {
        // Already gone.
      }
    }
    private start() {
      const real = new Real({
        output: (frame) => {
          if (real !== this.real) return frame.close();
          if (this.skipUntil !== undefined) {
            if (frame.timestamp <= this.skipUntil) return frame.close();
            this.skipUntil = undefined;
          }
          this.delivered = frame.timestamp;
          // Everything before the key frame at or before this one has been delivered, and is not needed again.
          let keep = this.chunks.length - 1;
          while (keep > 0 && !(this.chunks[keep]!.type === 'key' && this.chunks[keep]!.timestamp <= frame.timestamp)) keep--;
          if (keep > 0) this.chunks.splice(0, keep);
          this.init.output(frame);
        },
        error: (e) => {
          if (real !== this.real || this.closed) return;
          if (!this.recover(e)) this.init.error(tagCodec(e, 'decoder', 'callback') as DOMException);
        },
      });
      real.configure(this.config!);
      this.real = real;
      this.events.attach(real);
    }
    /** A fresh decoder, fed again from the last key frame. False when this error is not one to recover from, or the job is out of rebuilds. */
    private recover(e: unknown): boolean {
      if (!isReclaim(e) || this.closed || run.used.decoder >= MAX_REBUILDS) return false;
      run.used.decoder++;
      console.warn('The video decoder was closed under the run, starting a new one', e);
      try {
        if (this.real && this.real.state !== 'closed') this.real.close();
      } catch {
        // Already gone.
      }
      try {
        this.start();
        this.skipUntil = this.delivered;
        for (const c of this.chunks) this.real!.decode(c);
      } catch (again) {
        return this.recover(again);
      }
      return true;
    }
    configure(config: VideoDecoderConfig) {
      this.config = config;
      if (this.real && this.real.state !== 'closed') this.real.configure(config);
      else this.start();
    }
    decode(chunk: EncodedVideoChunk) {
      this.chunks.push(chunk);
      try {
        this.real!.decode(chunk);
      } catch (e) {
        if (!this.recover(e)) {
          this.chunks.pop();
          throw tagCodec(e, 'decoder', 'decode');
        }
      }
    }
    async flush() {
      for (;;) {
        const real = this.real!;
        try {
          await real.flush();
          this.chunks = [];
          this.skipUntil = undefined;
          return;
        } catch (e) {
          // The error callback may have swapped the decoder already: flush the new one.
          if (real !== this.real) continue;
          if (!this.recover(e)) throw tagCodec(e, 'decoder', 'flush');
        }
      }
    }
    reset() {
      this.chunks = [];
      this.delivered = -Infinity;
      this.skipUntil = undefined;
      this.real?.reset();
    }
    close() {
      this.shut();
      run.open.delete(this);
    }
  };
}

function guardedEncoder(Real: typeof VideoEncoder, run: Run) {
  return class GuardedVideoEncoder {
    static isConfigSupported = (config: VideoEncoderConfig) => Real.isConfigSupported(config);
    real: VideoEncoder | undefined;
    private config: VideoEncoderConfig | undefined;
    /** Frames given to the encoder whose packets have not come out yet: kept, so a fresh encoder can do them again. */
    private pending: { frame: VideoFrame; opts?: VideoEncoderEncodeOptions }[] = [];
    private closed = false;
    private events = listeners(this);
    constructor(private init: VideoEncoderInit) {
      run.open.add(this);
    }
    get state() {
      return this.closed ? 'closed' : (this.real?.state ?? 'unconfigured');
    }
    get encodeQueueSize() {
      return this.real?.encodeQueueSize ?? 0;
    }
    set ondequeue(fn: (() => void) | null) {
      if (this.real) this.real.ondequeue = fn;
    }
    addEventListener = this.events.add;
    removeEventListener = this.events.remove;
    private release() {
      for (const p of this.pending) p.frame.close();
      this.pending = [];
    }
    shut() {
      this.closed = true;
      this.release();
      try {
        if (this.real && this.real.state !== 'closed') this.real.close();
      } catch {
        // Already gone.
      }
    }
    private start() {
      const real = new Real({
        output: (chunk, meta) => {
          if (real !== this.real) return;
          // Frames come out in the order they went in; this one and every earlier one are done.
          const i = this.pending.findIndex((p) => p.frame.timestamp === chunk.timestamp);
          if (i >= 0) for (const p of this.pending.splice(0, i + 1)) p.frame.close();
          this.init.output(chunk, meta);
        },
        error: (e) => {
          if (real !== this.real || this.closed) return;
          if (!this.recover(e)) this.init.error(tagCodec(e, 'encoder', 'callback') as DOMException);
        },
      });
      real.configure(this.config!);
      this.real = real;
      this.events.attach(real);
    }
    /** A fresh encoder that redoes the frames not yet out, the first as a key frame. */
    private recover(e: unknown): boolean {
      if (!isReclaim(e) || this.closed || run.used.encoder >= MAX_REBUILDS) return false;
      run.used.encoder++;
      console.warn('The video encoder was closed under the run, starting a new one', e);
      try {
        if (this.real && this.real.state !== 'closed') this.real.close();
      } catch {
        // Already gone.
      }
      try {
        this.start();
        this.pending.forEach((p, i) => this.real!.encode(p.frame, i === 0 ? { ...p.opts, keyFrame: true } : p.opts));
      } catch (again) {
        return this.recover(again);
      }
      return true;
    }
    configure(config: VideoEncoderConfig) {
      this.config = config;
      if (this.real && this.real.state !== 'closed') this.real.configure(config);
      else this.start();
    }
    encode(frame: VideoFrame, opts?: VideoEncoderEncodeOptions) {
      let keep: VideoFrame | undefined;
      try {
        keep = frame.clone();
      } catch {
        // A frame that is already closed: let the encoder say so.
      }
      if (keep) this.pending.push({ frame: keep, opts });
      try {
        this.real!.encode(frame, opts);
      } catch (e) {
        if (!this.recover(e)) {
          const at = keep ? this.pending.findIndex((p) => p.frame === keep) : -1;
          if (at >= 0) this.pending.splice(at, 1);
          keep?.close();
          throw tagCodec(e, 'encoder', 'encode');
        }
      }
    }
    async flush() {
      for (;;) {
        const real = this.real!;
        try {
          await real.flush();
          this.release();
          return;
        } catch (e) {
          if (real !== this.real) continue;
          if (!this.recover(e)) throw tagCodec(e, 'encoder', 'flush');
        }
      }
    }
    reset() {
      this.release();
      this.real?.reset();
    }
    close() {
      this.shut();
      run.open.delete(this);
    }
  };
}

/** Number of guards in force; the globals are swapped by the first and restored by the last. */
let depth = 0;
let restore: (() => void) | undefined;

/**
 * Starts guarding the codecs for one job. Call the returned function when the job ends, however it ends: it closes any
 * codec the job left open and puts the browser's own classes back.
 */
export function guardCodecs(): () => void {
  if (!CODEC_GUARD || typeof VideoDecoder === 'undefined' || typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return () => {};
  if (depth++ === 0) {
    const run: Run = { used: { decoder: 0, encoder: 0 }, open: new Set() };
    const g = globalThis as unknown as { VideoDecoder: unknown; VideoEncoder: unknown };
    const realDecoder = g.VideoDecoder;
    const realEncoder = g.VideoEncoder;
    g.VideoDecoder = guardedDecoder(VideoDecoder, run);
    g.VideoEncoder = guardedEncoder(VideoEncoder, run);
    restore = () => {
      g.VideoDecoder = realDecoder;
      g.VideoEncoder = realEncoder;
      for (const c of [...run.open]) c.shut();
      run.open.clear();
    };
  }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    if (--depth === 0) restore?.();
  };
}
