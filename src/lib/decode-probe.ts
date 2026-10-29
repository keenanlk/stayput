/**
 * A real decode check: `canDecode()` only asks the browser whether it supports the codec, and WebKit says yes to HEVC that then fails
 * with "EncodingError: Decoder failure" (the decoder's error carries the same name as the encoder's). This decodes a few pictures
 * and looks at them, so a clip that cannot be decoded is found in about a second, before a model downloads or a long job runs.
 */
import { VideoSampleSink, type InputVideoTrack, type VideoSample } from 'mediabunny';
import { DecodeFailed, NamedError } from './input-error';
import { isReclaim } from './codec-guard';

const TIMEOUT_MS = 4000;
const SIDE = 16;

/** True when every pixel is fully transparent: how an HDR clip some Chrome builds cannot convert comes out when drawn to a canvas. */
export function isBlankFrame(rgba: ArrayLike<number>): boolean {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 0) return false;
  return true;
}

function within<T>(work: Promise<T>, ms = TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new NamedError('DecodeTimeout', 'The video decoder did not answer.')), ms);
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

/** Draws the picture small and throws if it came out fully transparent. Always closes the sample. */
function check(sample: VideoSample, ctx: CanvasRenderingContext2D) {
  try {
    ctx.clearRect(0, 0, SIDE, SIDE);
    sample.draw(ctx, 0, 0, SIDE, SIDE);
    if (isBlankFrame(ctx.getImageData(0, 0, SIDE, SIDE).data)) throw new NamedError('BlankFrame', 'The decoded picture is blank.');
  } finally {
    sample.close();
  }
}

/**
 * Decodes pictures of `video` and throws DecodeFailed (with the cause) if one fails, never arrives, or is blank.
 * With no `from`: the first 3 pictures and one half way through. With `from` (seconds): 3 pictures from there.
 */
export async function probeDecode(video: InputVideoTrack, duration: number, from?: number): Promise<void> {
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  ctx.canvas.width = ctx.canvas.height = SIDE;
  const sink = new VideoSampleSink(video);
  const frames = sink.samples(from && from > 0 ? from : undefined)[Symbol.asyncIterator]();
  try {
    for (let n = 0; n < 3; n++) {
      const next = await within(frames.next());
      if (next.done) break;
      check(next.value, ctx);
    }
    if (from === undefined && duration > 0) {
      const middle = await within(sink.getSample(duration / 2));
      if (middle) check(middle, ctx);
    }
  } catch (e) {
    // A decoder the browser took back (page hidden, memory) says nothing about the clip: the run's own recovery deals with that.
    if (isReclaim(e)) return;
    throw new DecodeFailed(undefined, { cause: e });
  } finally {
    // Closes the iterator's decoder. Waited for, but not for long: one stuck on a decoder that never answers would hold this up.
    await within(frames.return?.(undefined) ?? Promise.resolve(), 500).catch(() => undefined);
  }
}
