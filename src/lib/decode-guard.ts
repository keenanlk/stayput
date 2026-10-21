/**
 * Two guards for the browser's own sound decoder, which on some engines (Safari's, on Linux especially) waits
 * forever on a file it cannot finish reading instead of refusing it. Neither needs a codec, so a spec can drive
 * them directly.
 */
import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import { audioDecodeError } from './speech-errors';
import { isNotReadable } from './read-failure';
import { NamedError } from './input-error';

/** Containers whose index sits in the file's head or tail: if the demuxer finds no sound in one, a decoder will not either. */
const INDEXED = new Set(['MP4', 'QuickTime File Format', 'WebM', 'Matroska']);

export const CUT_SHORT = 'This file looks cut short, or is missing its index, so no sound can be read from it. Record or export it again, or try another copy.';

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
    if (tracks.length === 0) throw audioDecodeError(CUT_SHORT);
    if (!tracks.some((t) => t.isAudioTrack())) {
      // A video that simply has no sound is named as the caption tools name it, so the stats do not lump it with sound that will not decode.
      const none = audioDecodeError();
      none.name = 'NoSoundTrack';
      throw none;
    }
  } catch (e) {
    if (isNotReadable(e) || (e instanceof Error && ['AudioDecodeError', 'NoSoundTrack'].includes(e.name))) throw e;
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
      const timer = setTimeout(() => {
        const cause = new NamedError('DecodeTimeout', `the browser's sound decoder gave no answer in ${Math.round(budget / 1000)} s`);
        reject(Object.assign(audioDecodeError('The browser could not finish reading the sound of this file, which usually means the file is damaged or cut short. Try another copy of it.', cause), { [TIMED_OUT]: true }));
      }, budget);
      ctx.decodeAudioData(bytes).then(resolve, reject).finally(() => clearTimeout(timer));
    });
  };
  // A file that cannot be read at all is not a decode failure: that error goes out as it is.
  const bytes = await read();
  try {
    return await once(bytes);
  } catch (first) {
    if ((first as { [TIMED_OUT]?: boolean } | null)?.[TIMED_OUT]) throw first;
    return once(await read());
  }
}
