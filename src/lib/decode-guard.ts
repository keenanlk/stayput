/**
 * Two guards for the browser's own sound decoder, which on some engines (Safari's, on Linux especially) waits
 * forever on a file it cannot finish reading instead of refusing it. Neither needs a codec, so a spec can drive
 * them directly.
 */
import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import { audioDecodeError } from './speech-errors';
import { isPhoneBrowser } from './phone-limit';
import { audioCutShort, audioTooLong, decodedSecondsBudget, wavHeaderLies, audioOutOfMemory, CUT_SHORT, decodeTimeout, isAudioClass, isMemoryFailure } from './audio-causes';
import { isNotReadable } from './read-failure';

/** Containers whose index sits in the file's head or tail: if the demuxer finds no sound in one, a decoder will not either. */
const INDEXED = new Set(['MP4', 'QuickTime File Format', 'WebM', 'Matroska']);

export { CUT_SHORT };

/**
 * Throws NoSoundTrack for a video container with no sound track, and AudioDecodeError for one whose index is missing, before the browser's decoder
 * is given the bytes. A file the demuxer cannot place at all is left to the decoder, as before.
 */
export async function refuseSoundlessContainer(file: Blob): Promise<void> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const format = await input.getFormat().catch(() => null);
    if (!format || !INDEXED.has(format.name)) return;
    const tracks = await input.getTracks();
    if (tracks.length === 0) throw audioCutShort();
    const sound = tracks.filter((t) => t.isAudioTrack());
    // A sound track that holds no sound at all (its index lists no samples) is a file cut short, not a recording that is silent.
    if (sound.length > 0 && (await Promise.all(sound.map((t) => t.computeDuration().catch(() => NaN)))).every((d) => d === 0)) throw audioCutShort();
    if (sound.length === 0) {
      // A video that simply has no sound is named as the caption tools name it, so the stats do not lump it with sound that will not decode.
      const none = audioDecodeError();
      none.name = 'NoSoundTrack';
      throw none;
    }
  } catch (e) {
    if (isNotReadable(e) || isAudioClass(e)) throw e;
  } finally {
    input.dispose?.();
  }
}

/** Milliseconds a decode may take: generous for a long recording, but finite. A page may lower it (specs do) with `__decodeBudgetMs`. */
export function decodeBudgetMs(bytes: number): number {
  const override = (globalThis as { __decodeBudgetMs?: unknown }).__decodeBudgetMs;
  if (typeof override === 'number') return override;
  return Math.max(30_000, (bytes / 1e6) * 2_000);
}

const TIMED_OUT = Symbol('decodeTimedOut');

/**
 * `decodeAudioData`, but a decode that never answers ends as a DecodeTimeout (an AudioDecodeError by kind), not a page that waits forever.
 * A decode the browser refuses is tried once more on freshly supplied bytes (the browser takes the first copy away, and no spare is held
 * meanwhile): a phone short of memory can refuse a sound it reads fine a moment later, and a file that is really damaged fails the same
 * way twice, quickly. A decode that timed out is not tried again: a hung decoder would only hold the page for twice as long.
 */
export async function decodeWithin(ctx: BaseAudioContext, read: () => Promise<ArrayBuffer>): Promise<AudioBuffer> {
  const once = (bytes: ArrayBuffer) => {
    const budget = decodeBudgetMs(bytes.byteLength);
    return new Promise<AudioBuffer>((resolve, reject) => {
      const timer = setTimeout(() => reject(Object.assign(decodeTimeout(budget), { [TIMED_OUT]: true })), budget);
      ctx.decodeAudioData(bytes).then(resolve, reject).finally(() => clearTimeout(timer));
    });
  };
  // A file that cannot be read at all is not a decode failure: that error goes out as it is.
  const bytes = await read();
  try {
    return await once(bytes);
  } catch (first) {
    if ((first as { [TIMED_OUT]?: boolean } | null)?.[TIMED_OUT]) throw first;
    // The second attempt's failure is named when it says why: a buffer the device could not make is AudioOutOfMemory, not a refusal of the sound.
    return once(await read()).catch((second) => {
      throw isMemoryFailure(second) || isMemoryFailure(first) ? audioOutOfMemory(second) : second;
    });
  }
}

/**
 * Refuses a recording whose decoded sound is more than this device can hold, before any of it is read: AudioTooLong. The length is the
 * sound track's own (never the video's: a damaged picture track gives an absurd duration), read from the container's index; a file whose
 * length is not known is let through to the decoder. Tools that decode in pieces never call this.
 */
export async function refuseOverBudget(file: Blob, rate: number): Promise<void> {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  const budget = decodedSecondsBudget(nav ? isPhoneBrowser(nav) : false, (nav as { deviceMemory?: number } | undefined)?.deviceMemory, rate);
  // A file this small cannot hold more sound than the budget, even as uncompressed 8-bit mono (1 byte per sample).
  if (file.size < budget * 8000) return;
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack().catch(() => null);
    const seconds = track ? await track.computeDuration().catch(() => NaN) : NaN;
    // The budget is counted in stereo; a mono recording holds half as much for the same length.
    const channels = Math.max(1, Math.min(2, track?.numberOfChannels ?? 2));
    if (Number.isFinite(seconds) && (seconds * channels) / 2 > budget) throw audioTooLong(seconds, Math.floor((budget * 2) / channels));
  } catch (e) {
    if (e instanceof Error && e.name === 'AudioTooLong') throw e;
  } finally {
    input.dispose?.();
  }
}

/** Whether the file is a WAV whose header promises more sound than the file holds (cut short, or a header that lies). */
export async function isCutShortWav(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 65536).arrayBuffer().catch(() => new ArrayBuffer(0)));
  return wavHeaderLies(head, file.size);
}
