/**
 * Where Audio splitter gets the sound of a part from. A short file is decoded whole (what the page always did) and each part is a
 * view into it, so no part is copied. A long one is never decoded whole: a three-hour stereo recording is 1.9 GB of numbers at 44.1 kHz,
 * more than a phone's tab (or a small laptop's) can hold, so each part is decoded from the file on its own, a few seconds at a time, and
 * handed on to the encoder as it arrives. Only audio-splitter.ts imports this. Nothing leaves the tab.
 */
import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from 'mediabunny';
import { channelsOf } from './audio';
import { foldToStereo } from './fold-channels';
import { AUDIO_COPY, stageError } from './bare-error';
import type { Part } from './audio-split';

/** The rate every part is written at. */
export const RATE = 44100;
/** Seconds of sound handed to an encoder at a time. */
const CHUNK_SECONDS = 15;

export interface SplitSource {
  /** Samples per second, and samples in the whole sound. */
  rate: number;
  total: number;
  /** 1 or 2: a mono file stays mono. */
  channels: 1 | 2;
  /** True when the whole sound is held in memory (so a part is a view) and false when each part is decoded from the file. */
  whole: boolean;
  /** The sound of `part` in order, in pieces of about 15 seconds that the caller may let go of as it goes. Pieces add up to exactly `part.to - part.from` samples. */
  chunks(part: Part): AsyncGenerator<Float32Array[], void, undefined>;
  dispose(): void;
}

/**
 * A recording whose decoded size (stereo, 44.1 kHz, 32-bit) is over this many seconds is read a part at a time: 25 minutes is about 530 MB on a
 * computer, and 8 minutes about 170 MB on a phone, which gives a tab a fraction of that.
 */
export const streamAboveSeconds = (phone: boolean) => (phone ? 8 * 60 : 25 * 60);

/** A sound already decoded: parts are views into it. */
export function bufferSource(buffer: AudioBuffer): SplitSource {
  const chans = channelsOf(buffer, false);
  const step = Math.round(CHUNK_SECONDS * buffer.sampleRate);
  return {
    rate: buffer.sampleRate,
    total: buffer.length,
    channels: chans.length as 1 | 2,
    whole: true,
    async *chunks(part) {
      for (let i = part.from; i < part.to; i += step) yield chans.map((c) => c.subarray(i, Math.min(part.to, i + step)));
    },
    dispose() {},
  };
}

/** One decoded buffer as `channels` channels at RATE (surround folded to stereo, a rate other than RATE resampled linearly). */
function toRate(buffer: AudioBuffer, channels: 1 | 2): Float32Array[] {
  let out = foldToStereo(Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c)));
  if (buffer.sampleRate !== RATE) {
    const step = buffer.sampleRate / RATE;
    const n = Math.floor(buffer.length / step);
    out = out.map((ch) => {
      const dst = new Float32Array(n);
      for (let j = 0; j < n; j++) {
        const pos = j * step;
        const i = Math.floor(pos);
        const next = ch[Math.min(ch.length - 1, i + 1)]!;
        dst[j] = ch[i]! + (next - ch[i]!) * (pos - i);
      }
      return dst;
    });
  }
  if (out.length === channels) return out;
  if (channels === 1) return [out.reduce((m, ch) => (m.forEach((_, i) => (m[i] = m[i]! + ch[i]! / out.length)), m), new Float32Array(out[0]!.length))];
  return [out[0]!, out[0]!];
}

/**
 * Opens `file` so each part is decoded on its own, or returns null when this browser cannot do that for the file (no decoder for its codec,
 * no sound track the demuxer can place, no length), so the caller decodes it whole as before. Throws only for a file that cannot be read.
 */
export async function openStreamSource(file: File): Promise<SplitSource | null> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track || !(await track.canDecode())) return close(input);
    const seconds = await track.computeDuration();
    if (!(seconds > 0) || !Number.isFinite(seconds)) return close(input);
    const channels = (track.numberOfChannels >= 2 ? 2 : 1) as 1 | 2;
    // An MP3 or AAC file's frames run a few dozen milliseconds past its sound (encoder padding), which the browser's own decoder trims: a recording that is
    // 2 hours to within that is 2 hours, not 2 hours and a sliver that would make a part of its own.
    const whole = Math.round(seconds);
    const total = Math.round((Math.abs(seconds - whole) < 0.05 ? whole : seconds) * RATE);
    const step = CHUNK_SECONDS * RATE;
    return {
      rate: RATE,
      total,
      channels,
      whole: false,
      async *chunks(part) {
        const n = part.to - part.from;
        const ready: Float32Array[][] = [];
        let allocated = 0;
        let written = 0;
        let fill = 0;
        let pending: Float32Array[] | null = null;
        const fresh = () => {
          const size = Math.min(step, n - allocated);
          allocated += size;
          return size > 0 ? Array.from({ length: channels }, () => new Float32Array(size)) : null;
        };
        pending = fresh();
        // Adds `count` samples of `src` from `skip` (silence when src is null) to the piece being filled.
        const put = (src: Float32Array[] | null, skip: number, count: number) => {
          let done = 0;
          while (pending && done < count) {
            const take = Math.min(pending[0]!.length - fill, count - done);
            if (src) pending.forEach((ch, c) => ch.set(src[c]!.subarray(skip + done, skip + done + take), fill));
            fill += take;
            done += take;
            written += take;
            if (fill === pending[0]!.length) {
              ready.push(pending);
              pending = fresh();
              fill = 0;
            }
          }
        };
        try {
          const sink = new AudioBufferSink(track);
          for await (const { buffer, timestamp } of sink.buffers(part.from / RATE, part.to / RATE)) {
            const chans = toRate(buffer, channels);
            const len = chans[0]!.length;
            let at = Math.round(timestamp * RATE) - part.from;
            // A rounding step either way is the same sound, not a gap or an overlap.
            if (Math.abs(at - written) <= 2) at = written;
            if (at > written) put(null, 0, at - written);
            const skip = Math.max(0, written - at);
            if (skip < len) put(chans, skip, len - skip);
            while (ready.length) yield ready.shift()!;
            if (written >= n) break;
          }
          // The file ended a little before the plan says (a length from a header): the rest of the part is silence.
          if (written < n) put(null, 0, n - written);
          while (ready.length) yield ready.shift()!;
        } catch (e) {
          throw stageError('AudioDecodeError', e, { message: AUDIO_COPY.read, memory: AUDIO_COPY.memorySplitter });
        }
      },
      dispose: () => input.dispose?.(),
    };
  } catch (e) {
    input.dispose?.();
    throw e;
  }
}

function close(input: Input): null {
  input.dispose?.();
  return null;
}
